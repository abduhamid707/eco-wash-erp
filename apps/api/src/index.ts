import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { Prisma, PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';

const prisma = new PrismaClient();
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be 32+ characters');
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '8h' } });
type Role = 'OWNER' | 'MANAGER' | 'ATTENDANCE' | 'WAREHOUSE';
type Session = { id: string; role: Role };
app.decorateRequest('session', null);
declare module 'fastify' { interface FastifyRequest { session: Session | null } }
const gate = (roles: Role[]) => async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
 try {
  await request.jwtVerify();
  const auth = request.user as Session;
  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { id: true, role: true, active: true } });
  if (!user?.active || !roles.includes(user.role)) { reply.code(403).send({ error: 'FORBIDDEN' }); return; }
  request.session = { id: user.id, role: user.role };
 } catch { reply.code(401).send({ error: 'UNAUTHORIZED' }); }
};
const allRoles: Role[] = ['OWNER','MANAGER','ATTENDANCE','WAREHOUSE'];
const financeRoles: Role[] = ['OWNER','MANAGER'];
const stockRoles: Role[] = ['OWNER','MANAGER','WAREHOUSE'];
const id = z.string().uuid();
const amount = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/).refine(s => new Prisma.Decimal(s).gt(0));
const quantity = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/).refine(s => new Prisma.Decimal(s).gt(0));
const date = z.string().datetime({ offset: true });
const cmd = z.discriminatedUnion('type', [
 z.object({ type: z.literal('STOCK_RECEIPT'), productId: id, quantity, unitCost: amount.optional(), occurredAt: date }),
 z.object({ type: z.literal('SHIPMENT'), dealerId: id, productId: id, quantity, unitPrice: amount, occurredAt: date }),
 z.object({ type: z.literal('DEALER_PAYMENT'), dealerId: id, accountId: id, amount, occurredAt: date }),
 z.object({ type: z.literal('EXPENSE'), accountId: id, amount, category: z.string().min(2).max(100), description: z.string().max(500).default(''), occurredAt: date }),
 z.object({ type: z.literal('CASH_RECEIPT'), accountId: id, amount, description: z.string().max(500).default(''), occurredAt: date }),
 z.object({ type: z.literal('ACCOUNT_TRANSFER'), fromAccountId: id, toAccountId: id, amount, occurredAt: date })
]);
const commandBody = z.object({ idempotencyKey: id, command: cmd });
const dec = (x: string | Prisma.Decimal) => new Prisma.Decimal(x);
const insufficient = (s: string): never => { throw Object.assign(new Error(s), { statusCode: 409 }); };
app.get('/health', async () => ({ status: 'ok', service: 'eco-wash-api' }));
app.post('/auth/login', async (req, reply) => {
 const b = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body);
 const user = await prisma.user.findUnique({ where: { login: b.login } });
 if (!user?.active || !(await compare(b.password,user.passwordHash))) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
 return { token: app.jwt.sign({ id:user.id, role:user.role }), user: {id:user.id,name:user.name,role:user.role} };
});
app.get('/me', { preHandler: gate(allRoles) }, async req => prisma.user.findUnique({where:{id:req.session!.id},select:{id:true,name:true,role:true}}));
app.get('/products', { preHandler: gate(allRoles) }, async () => prisma.product.findMany({orderBy:{name:'asc'}}).then(a=>a.map(x=>({...x,stock:x.stock.toString()}))));
app.post('/products', { preHandler: gate(stockRoles) }, async (req,reply)=>{
 const b=z.object({sku:z.string().min(1),name:z.string().min(2),unit:z.string().min(1),isRaw:z.boolean().default(false)}).parse(req.body);
 const item=await prisma.product.create({data:b});
 return reply.code(201).send(item);
});
app.get('/dealers', { preHandler: gate(allRoles) }, async()=>prisma.dealer.findMany({orderBy:{name:'asc'}}).then(a=>a.map(x=>({...x,receivable:x.receivable.toString()}))));
app.post('/dealers', { preHandler: gate(financeRoles) }, async(req,reply)=>{
 const b=z.object({name:z.string().min(2),region:z.string().min(2)}).parse(req.body);
 return reply.code(201).send(await prisma.dealer.create({data:b}));
});
app.get('/accounts', { preHandler: gate(financeRoles) }, async()=>prisma.moneyAccount.findMany().then(a=>a.map(x=>({...x,balance:x.balance.toString()}))));
app.post('/accounts', { preHandler: gate(['OWNER']) }, async(req,reply)=>{
 const b=z.object({name:z.string().min(2),currency:z.literal('UZS').default('UZS')}).parse(req.body);
 return reply.code(201).send(await prisma.moneyAccount.create({data:b}));
});
app.post('/operations', { preHandler: gate(financeRoles.concat('WAREHOUSE')) }, async (req,reply) => {
 const b=commandBody.parse(req.body);
 if (req.session!.role==='WAREHOUSE' && b.command.type!=='STOCK_RECEIPT') return reply.code(403).send({error:'FORBIDDEN'});
 const hash=createHash('sha256').update(JSON.stringify(b.command)).digest('hex');
 // Serializability plus a transaction-level advisory lock serialize financial postings across API replicas.
 const op=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const previous=await tx.operation.findUnique({where:{idempotencyKey:b.idempotencyKey}});
  if(previous){if(previous.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED'); return previous;}
  const c=b.command;
  if(c.type==='ACCOUNT_TRANSFER' && c.fromAccountId===c.toAccountId) insufficient('SAME_ACCOUNT');
  const dealerId='dealerId' in c ? c.dealerId : undefined;
  const result=await tx.operation.create({data:{idempotencyKey:b.idempotencyKey,requestHash:hash,type:c.type,occurredAt:new Date(c.occurredAt),createdById:req.session!.id,dealerId,metadata:JSON.parse(JSON.stringify(c))}});
  const stock=async(productId:string,delta:Prisma.Decimal,unitCost?:string)=>{
   const product=await tx.product.findUnique({where:{id:productId}});
   if(!product?.active) insufficient('PRODUCT_NOT_FOUND');
   if(product.stock.add(delta).lt(0)) insufficient('INSUFFICIENT_STOCK');
   await tx.product.update({where:{id:productId},data:{stock:{increment:delta}}});
   await tx.inventoryMovement.create({data:{operationId:result.id,productId,quantity:delta,unitCost:unitCost?dec(unitCost):undefined}});
  };
  const changeAccount=async(accountId:string,delta:Prisma.Decimal)=>{
   const account=await tx.moneyAccount.findUnique({where:{id:accountId}});
   if(!account) insufficient('ACCOUNT_NOT_FOUND');
   if(account.balance.add(delta).lt(0)) insufficient('INSUFFICIENT_FUNDS');
   await tx.moneyAccount.update({where:{id:accountId},data:{balance:{increment:delta}}});
   await tx.moneyEntry.create({data:{operationId:result.id,accountId,amount:delta}});
  };
  if(c.type==='STOCK_RECEIPT') await stock(c.productId,dec(c.quantity),c.unitCost);
  if(c.type==='SHIPMENT'){
   const dealer=await tx.dealer.findUnique({where:{id:c.dealerId}});
   if(!dealer?.active) insufficient('DEALER_NOT_FOUND');
   await stock(c.productId,dec(c.quantity).neg());
   await tx.dealer.update({where:{id:c.dealerId},data:{receivable:{increment:dec(c.quantity).mul(c.unitPrice)}}});
  }
  if(c.type==='DEALER_PAYMENT'){
   const dealer=await tx.dealer.findUnique({where:{id:c.dealerId}});
   if(!dealer?.active) insufficient('DEALER_NOT_FOUND');
   if(dealer.receivable.lt(c.amount)) insufficient('PAYMENT_EXCEEDS_DEBT');
   await tx.dealer.update({where:{id:c.dealerId},data:{receivable:{decrement:dec(c.amount)}}});
   await changeAccount(c.accountId,dec(c.amount));
  }
  if(c.type==='EXPENSE') await changeAccount(c.accountId,dec(c.amount).neg());
  if(c.type==='CASH_RECEIPT') await changeAccount(c.accountId,dec(c.amount));
  if(c.type==='ACCOUNT_TRANSFER'){await changeAccount(c.fromAccountId,dec(c.amount).neg());await changeAccount(c.toAccountId,dec(c.amount));}
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'POST',entityType:'Operation',entityId:result.id,after:{type:c.type,key:b.idempotencyKey}}});
  return result;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000,maxWait:15000});
 return reply.code(201).send({id:op.id,type:op.type,status:op.status,idempotencyKey:op.idempotencyKey});
});
app.get('/operations', { preHandler:gate(allRoles) }, async req=>{
 const limit=Math.min(100,Number((req.query as Record<string,string>).limit)||30);
 return prisma.operation.findMany({take:limit,orderBy:{createdAt:'desc'},include:{createdBy:{select:{name:true}},movements:true,moneyEntries:true}});
});
app.get('/dashboard', { preHandler: gate(allRoles) }, async()=>{
 const [products,dealers,accounts,operations]=await Promise.all([
  prisma.product.findMany({select:{id:true,name:true,unit:true,stock:true,isRaw:true}}),
  prisma.dealer.findMany({select:{id:true,name:true,region:true,receivable:true}}),
  prisma.moneyAccount.findMany({select:{id:true,name:true,balance:true,currency:true}}),
  prisma.operation.count()
 ]);
 return {products:products.map(x=>({...x,stock:x.stock.toString()})),dealers:dealers.map(x=>({...x,receivable:x.receivable.toString()})),accounts:accounts.map(x=>({...x,balance:x.balance.toString()})),operationCount:operations};
});
app.setErrorHandler((err,req,reply)=>{
 req.log.error(err);
 if(err instanceof ZodError) return reply.code(400).send({error:'VALIDATION_ERROR',issues:err.flatten()});
 if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002') return reply.code(409).send({error:'DUPLICATE'});
 if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2034') return reply.code(409).send({error:'RETRY_TRANSACTION'});
 const code=(err as {statusCode?:number}).statusCode??500;
 return reply.code(code).send({error:code===409?(err as Error).message:'SERVER_ERROR'});
});
process.on('SIGTERM',async()=>{await app.close();await prisma.$disconnect();});
await app.listen({port,host:'0.0.0.0'});
