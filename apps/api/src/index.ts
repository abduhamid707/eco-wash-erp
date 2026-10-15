import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { z, ZodError } from 'zod';

const prisma = new PrismaClient();
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be 32+ characters');
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
await app.register(jwt, { secret: jwtSecret, sign: { expiresIn: '8h' } });
await app.register(rateLimit,{global:false});
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
 z.object({ type:z.literal('ACCOUNT_OPENING'),accountId:id,amount,occurredAt:date }),
 z.object({ type:z.literal('INVENTORY_ADJUSTMENT'),productId:id,actualQuantity:z.string().regex(/^\d{1,15}(\.\d{1,4})?$/),reason:z.string().min(8).max(500),occurredAt:date }),
 z.object({ type: z.literal('VOID_OPERATION'), targetId:id, occurredAt:date }),
 z.object({ type: z.literal('DEALER_RETURN'), shipmentId:id, quantity, occurredAt:date }),
 z.object({ type: z.literal('SUPPLIER_RETURN'), purchaseId:id, quantity, occurredAt:date }),
 z.object({ type: z.literal('SUPPLIER_RECEIPT'), supplierId:id, productId:id, quantity, unitCost:amount, occurredAt:date }),
 z.object({ type: z.literal('SUPPLIER_PAYMENT'), supplierId:id, accountId:id, amount, occurredAt:date }),
 z.object({ type: z.literal('DEALER_OPENING'), dealerId:id, amount, occurredAt:date }),
 z.object({ type: z.literal('SUPPLIER_OPENING'), supplierId:id, amount, occurredAt:date }),
 z.object({ type: z.literal('STOCK_RECEIPT'), productId: id, quantity, unitCost: amount.optional(), occurredAt: date }),
 z.object({ type: z.literal('PRODUCTION'), recipeId: id, batches: quantity, occurredAt: date }),
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
app.post('/auth/login', {config:{rateLimit:{max:8,timeWindow:'1 minute'}}}, async (req, reply) => {
 const b = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body);
 const user = await prisma.user.findUnique({ where: { login: b.login } });
 if (!user?.active || !(await bcrypt.compare(b.password,user.passwordHash))) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
 return { token: app.jwt.sign({ id:user.id, role:user.role }), user: {id:user.id,name:user.name,role:user.role} };
});

app.get('/users', {preHandler:gate(['OWNER'])}, async()=>prisma.user.findMany({
 select:{id:true,name:true,login:true,role:true,active:true,createdAt:true},
 orderBy:{createdAt:'desc'}
}));
app.post('/users', {preHandler:gate(['OWNER'])}, async(req,reply)=>{
 const b=z.object({
  name:z.string().min(2).max(120),
  login:z.string().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(12).max(200),
  role:z.enum(['OWNER','MANAGER','ATTENDANCE','WAREHOUSE'])
 }).parse(req.body);
 const saved=await prisma.$transaction(async tx=>{
  const u=await tx.user.create({data:{name:b.name,login:b.login,role:b.role,passwordHash:await bcrypt.hash(b.password,12)}});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'USER_CREATE',entityType:'User',entityId:u.id,after:{name:u.name,login:u.login,role:u.role}}});
  return u;
 });
 return reply.code(201).send({id:saved.id,name:saved.name,login:saved.login,role:saved.role,active:saved.active});
});
app.patch('/users/:id', {preHandler:gate(['OWNER'])}, async(req,reply)=>{
 const params=z.object({id}).parse(req.params);
 const body=z.object({active:z.boolean().optional(),role:z.enum(['OWNER','MANAGER','ATTENDANCE','WAREHOUSE']).optional(),password:z.string().min(12).max(200).optional()}).refine(x=>Object.keys(x).length>0).parse(req.body);
 if(params.id===req.session!.id && (body.active===false || (body.role && body.role!=='OWNER')))return reply.code(409).send({error:'CANNOT_DISABLE_SELF'});
 const saved=await prisma.$transaction(async tx=>{
  const current=await tx.user.findUnique({where:{id:params.id}});
  if(!current)return null;
  if(current.role==='OWNER'&&(body.active===false ||(body.role&&body.role!=='OWNER'))){
   const other=await tx.user.count({where:{role:'OWNER',active:true,id:{not:current.id}}});
   if(other===0)insufficient('LAST_OWNER_REQUIRED');
  }
  const updated=await tx.user.update({where:{id:params.id},data:{
   active:body.active,role:body.role,passwordHash:body.password?await bcrypt.hash(body.password,12):undefined
  }});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'USER_UPDATE',entityType:'User',entityId:params.id,before:{role:current.role,active:current.active},after:{role:updated.role,active:updated.active,passwordChanged:!!body.password}}});
  return updated;
 });
 if(!saved)return reply.code(404).send({error:'USER_NOT_FOUND'});
 return {id:saved.id,login:saved.login,name:saved.name,role:saved.role,active:saved.active};
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

app.get('/suppliers', {preHandler:gate(financeRoles)}, async()=>prisma.supplier.findMany({orderBy:{name:'asc'}}).then(a=>a.map(x=>({...x,payable:x.payable.toString()}))));
app.post('/suppliers', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const b=z.object({name:z.string().min(2)}).parse(req.body);
 return reply.code(201).send(await prisma.supplier.create({data:b}));
});

app.get('/accounts', { preHandler: gate(financeRoles) }, async()=>prisma.moneyAccount.findMany().then(a=>a.map(x=>({...x,balance:x.balance.toString()}))));
app.post('/accounts', { preHandler: gate(['OWNER']) }, async(req,reply)=>{
 const b=z.object({name:z.string().min(2),currency:z.literal('UZS').default('UZS')}).parse(req.body);
 return reply.code(201).send(await prisma.moneyAccount.create({data:b}));
});
app.post('/operations', { preHandler: gate(financeRoles.concat('WAREHOUSE')) }, async (req,reply) => {
 const b=commandBody.parse(req.body);
 if(['VOID_OPERATION','DEALER_OPENING','SUPPLIER_OPENING','INVENTORY_ADJUSTMENT','ACCOUNT_OPENING'].includes(b.command.type) && req.session!.role!=='OWNER') return reply.code(403).send({error:'OWNER_ONLY'});
 if (req.session!.role==='WAREHOUSE' && !['STOCK_RECEIPT','SUPPLIER_RECEIPT'].includes(b.command.type)) return reply.code(403).send({error:'FORBIDDEN'});
 const hash=createHash('sha256').update(JSON.stringify(b.command)).digest('hex');
 // Serializability plus a transaction-level advisory lock serialize financial postings across API replicas.
 const op=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const previous=await tx.operation.findUnique({where:{idempotencyKey:b.idempotencyKey}});
  if(previous){if(previous.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED'); return previous;}
  const c=b.command;
  const lockedPeriod=await tx.accountingPeriod.findUnique({where:{month:c.occurredAt.slice(0,7)}});
  if(lockedPeriod) insufficient('ACCOUNTING_PERIOD_CLOSED');
  if(c.type==='VOID_OPERATION'){
   const reversed=await tx.operation.findUnique({where:{id:c.targetId},select:{occurredAt:true}});
   if(reversed && await tx.accountingPeriod.findUnique({where:{month:reversed.occurredAt.toISOString().slice(0,7)}})) insufficient('ORIGINAL_PERIOD_CLOSED');
  }
  if(c.type==='ACCOUNT_TRANSFER' && c.fromAccountId===c.toAccountId) insufficient('SAME_ACCOUNT');
  const dealerId='dealerId' in c ? c.dealerId : undefined;
  const supplierId='supplierId' in c ? c.supplierId : undefined;
  const result=await tx.operation.create({data:{idempotencyKey:b.idempotencyKey,requestHash:hash,type:c.type,occurredAt:new Date(c.occurredAt),createdById:req.session!.id,dealerId,supplierId,metadata:JSON.parse(JSON.stringify(c))}});
  const stock=async(productId:string,delta:Prisma.Decimal,unitCost?:string)=>{
   const product=await tx.product.findUnique({where:{id:productId}});
   if(!product) throw new Error('PRODUCT_NOT_FOUND');
   if(!product.active) insufficient('PRODUCT_INACTIVE');
   if(product.stock.add(delta).lt(0)) insufficient('INSUFFICIENT_STOCK');
   await tx.product.update({where:{id:productId},data:{stock:{increment:delta}}});
   await tx.inventoryMovement.create({data:{operationId:result.id,productId,quantity:delta,unitCost:unitCost?dec(unitCost):undefined}});
  };
  const changeAccount=async(accountId:string,delta:Prisma.Decimal)=>{
   const account=await tx.moneyAccount.findUnique({where:{id:accountId}});
   if(!account) throw new Error('ACCOUNT_NOT_FOUND');
   if(account.balance.add(delta).lt(0)) insufficient('INSUFFICIENT_FUNDS');
   await tx.moneyAccount.update({where:{id:accountId},data:{balance:{increment:delta}}});
   await tx.moneyEntry.create({data:{operationId:result.id,accountId,amount:delta}});
  };
  const dealerChange=async(dealerId:string,delta:Prisma.Decimal)=>{
   const dealer=await tx.dealer.findUnique({where:{id:dealerId}});
   if(!dealer) throw new Error('DEALER_NOT_FOUND');
   if(!dealer.active) insufficient('DEALER_INACTIVE');
   if(dealer.receivable.add(delta).lt(0)) insufficient('NEGATIVE_DEALER_BALANCE');
   await tx.dealer.update({where:{id:dealerId},data:{receivable:{increment:delta}}});
   await tx.dealerEntry.create({data:{dealerId,operationId:result.id,amount:delta}});
  };
  const supplierChange=async(supplierId:string,delta:Prisma.Decimal)=>{
   const supplier=await tx.supplier.findUnique({where:{id:supplierId}});
   if(!supplier) throw new Error('SUPPLIER_NOT_FOUND');
   if(!supplier.active) insufficient('SUPPLIER_INACTIVE');
   if(supplier.payable.add(delta).lt(0)) insufficient('NEGATIVE_SUPPLIER_BALANCE');
   await tx.supplier.update({where:{id:supplierId},data:{payable:{increment:delta}}});
   await tx.supplierEntry.create({data:{supplierId,operationId:result.id,amount:delta}});
  };
  
  if(c.type==='INVENTORY_ADJUSTMENT'){
   const current=await tx.product.findUnique({where:{id:c.productId}});
   if(!current) throw new Error('PRODUCT_NOT_FOUND');
   if(!current.active) insufficient('PRODUCT_INACTIVE');
   const difference=dec(c.actualQuantity).sub(current.stock);
   if(difference.isZero()) insufficient('NO_INVENTORY_DIFFERENCE');
   await stock(c.productId,difference);
  }
  if(c.type==='DEALER_RETURN'){
   const shipment=await tx.operation.findUnique({where:{id:c.shipmentId}});
   if(!shipment) throw new Error('ORIGINAL_SHIPMENT_NOT_FOUND');
   if(shipment.type!=='SHIPMENT'||shipment.status!=='POSTED') insufficient('ORIGINAL_SHIPMENT_INVALID');
   const original=shipment.metadata as {productId?:string;quantity?:string;unitPrice?:string};
   const pid=original?.productId, origQuantity=original?.quantity, unitPrice=original?.unitPrice, originalDealer=shipment.dealerId;
   if(!pid||!origQuantity||!unitPrice||!originalDealer) insufficient('INVALID_SHIPMENT');
   const prior=await tx.operation.findMany({where:{type:'DEALER_RETURN',status:'POSTED',id:{not:result.id}}});
   const already=prior.filter(x=>(x.metadata as {shipmentId?:string})?.shipmentId===c.shipmentId)
    .reduce((total,x)=>total.add((x.metadata as {quantity:string}).quantity),dec('0'));
   if(already.add(c.quantity).gt(origQuantity!)) insufficient('RETURN_EXCEEDS_SHIPMENT');
   await stock(pid!,dec(c.quantity));
   await dealerChange(originalDealer!,dec(c.quantity).mul(unitPrice!).neg());
  }
  if(c.type==='VOID_OPERATION'){
   const original=await tx.operation.findUnique({where:{id:c.targetId},include:{movements:true,moneyEntries:true,dealerEntries:true,supplierEntries:true}});
   if(!original) throw new Error('ORIGINAL_OPERATION_NOT_FOUND');
   if(original.status!=='POSTED'||original.type==='VOID_OPERATION'||original.type.startsWith('PAYROLL_')) insufficient('CANNOT_VOID_OPERATION');
   const dependents=await tx.operation.findMany({where:{type:'DEALER_RETURN',status:'POSTED'}});
   if(dependents.some(x=>(x.metadata as {shipmentId?:string})?.shipmentId===original.id)) insufficient('SHIPMENT_HAS_RETURNS');
   if(original.type==='SUPPLIER_RECEIPT'){
    const supplierReturns=await tx.operation.findMany({where:{type:'SUPPLIER_RETURN',status:'POSTED'}});
    if(supplierReturns.some(x=>(x.metadata as {purchaseId?:string}|null)?.purchaseId===original.id)) insufficient('PURCHASE_HAS_RETURNS');
   }
   for(const m of original.movements) await stock(m.productId,m.quantity.neg(),m.unitCost?.toString());
   for(const m of original.moneyEntries) await changeAccount(m.accountId,m.amount.neg());
   for(const m of original.dealerEntries) await dealerChange(m.dealerId,m.amount.neg());
   for(const m of original.supplierEntries) await supplierChange(m.supplierId,m.amount.neg());
   await tx.operation.update({where:{id:original.id},data:{status:'REVERSED'}});
   await tx.operation.update({where:{id:result.id},data:{reversalOfId:original.id}});
  }

  if(c.type==='ACCOUNT_OPENING'){
   const opening=await tx.operation.findFirst({where:{type:'ACCOUNT_OPENING',status:'POSTED',id:{not:result.id},moneyEntries:{some:{accountId:c.accountId}}}});
   if(opening) insufficient('ACCOUNT_OPENING_ALREADY_ENTERED');
   await changeAccount(c.accountId,dec(c.amount));
  }
  if(c.type==='DEALER_OPENING'){
   const old=await tx.operation.findFirst({where:{dealerId:c.dealerId,type:'DEALER_OPENING',status:'POSTED',id:{not:result.id}}});
   if(old) insufficient('OPENING_ALREADY_ENTERED');
   await dealerChange(c.dealerId,dec(c.amount));
  }
  if(c.type==='SUPPLIER_OPENING'){
   const old=await tx.operation.findFirst({where:{supplierId:c.supplierId,type:'SUPPLIER_OPENING',status:'POSTED',id:{not:result.id}}});
   if(old) insufficient('OPENING_ALREADY_ENTERED');
   await supplierChange(c.supplierId,dec(c.amount));
  }

  if(c.type==='SUPPLIER_RETURN'){
   const purchase=await tx.operation.findUnique({where:{id:c.purchaseId}});
   if(!purchase) throw new Error('PURCHASE_NOT_FOUND');
   if(purchase.type!=='SUPPLIER_RECEIPT'||purchase.status!=='POSTED'||!purchase.supplierId) insufficient('PURCHASE_INVALID');
   const original=purchase.metadata as {productId?:string;quantity?:string;unitCost?:string}|null;
   const productId=original?.productId,quantity=original?.quantity,unitCost=original?.unitCost;
   if(!productId||!quantity||!unitCost) insufficient('PURCHASE_DETAILS_MISSING');
   const previous=await tx.operation.findMany({where:{type:'SUPPLIER_RETURN',status:'POSTED',id:{not:result.id}}});
   const returned=previous.filter(x=>(x.metadata as {purchaseId?:string}|null)?.purchaseId===c.purchaseId).reduce((t,x)=>t.add((x.metadata as {quantity:string}).quantity),dec('0'));
   if(returned.add(c.quantity).gt(quantity!)) insufficient('SUPPLIER_RETURN_EXCEEDS_PURCHASE');
   await stock(productId!,dec(c.quantity).neg());
   await supplierChange(purchase.supplierId!,dec(c.quantity).mul(unitCost!).neg());
  }
  if(c.type==='SUPPLIER_RECEIPT'){
   const material=await tx.product.findUnique({where:{id:c.productId}});
   if(!material?.isRaw) insufficient('RECEIPT_MUST_BE_RAW_MATERIAL');
   await stock(c.productId,dec(c.quantity),c.unitCost);await supplierChange(c.supplierId,dec(c.quantity).mul(c.unitCost));}
  if(c.type==='SUPPLIER_PAYMENT'){await supplierChange(c.supplierId,dec(c.amount).neg());await changeAccount(c.accountId,dec(c.amount).neg());}
  if(c.type==='STOCK_RECEIPT') await stock(c.productId,dec(c.quantity),c.unitCost);
  if(c.type==='PRODUCTION'){
   const recipe=await tx.recipe.findUnique({where:{id:c.recipeId},include:{ingredients:true,product:true}});
   if(!recipe) throw new Error('RECIPE_NOT_FOUND');
   if(!recipe.active) insufficient('RECIPE_INACTIVE');
   if(recipe.product.isRaw) insufficient('RECIPE_OUTPUT_MUST_BE_FINISHED_PRODUCT');
   const multiplier=dec(c.batches);
   for(const line of recipe.ingredients){
    if(line.materialId===recipe.productId) insufficient('RECIPE_SELF_CONSUMPTION');
    await stock(line.materialId,line.quantity.mul(multiplier).neg());
   }
   await stock(recipe.productId,recipe.outputQuantity.mul(multiplier));
  }
  if(c.type==='SHIPMENT'){
   const dealer=await tx.dealer.findUnique({where:{id:c.dealerId}});
   if(!dealer) throw new Error('DEALER_NOT_FOUND');
   if(!dealer.active) insufficient('DEALER_INACTIVE');
   await stock(c.productId,dec(c.quantity).neg());
   await dealerChange(c.dealerId,dec(c.quantity).mul(c.unitPrice));
  }
  if(c.type==='DEALER_PAYMENT'){
   const dealer=await tx.dealer.findUnique({where:{id:c.dealerId}});
   if(!dealer) throw new Error('DEALER_NOT_FOUND');
   if(!dealer.active) insufficient('DEALER_INACTIVE');
   if(dealer.receivable.lt(c.amount)) insufficient('PAYMENT_EXCEEDS_DEBT');
   await dealerChange(c.dealerId,dec(c.amount).neg());
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
app.get('/operations', { preHandler:gate(financeRoles) }, async req=>{
 const limit=Math.min(100,Number((req.query as Record<string,string>).limit)||30);
 return prisma.operation.findMany({take:limit,orderBy:{createdAt:'desc'},include:{createdBy:{select:{name:true}},movements:true,moneyEntries:true}});
});

app.get('/dashboard/trends', {preHandler:gate(financeRoles)}, async(req)=>{
 const q=z.object({days:z.coerce.number().int().min(7).max(90).default(30)}).parse(req.query);
 const today=new Date();
 const start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-q.days+1));
 const records=await prisma.operation.findMany({
  where:{occurredAt:{gte:start},status:'POSTED',type:{in:['PRODUCTION','SHIPMENT','DEALER_RETURN','EXPENSE','PAYROLL_ADVANCE','PAYROLL_SALARY']}},
  select:{type:true,occurredAt:true,metadata:true}
 });
 const map=new Map<string,{date:string;productions:number;shipments:Prisma.Decimal;expenses:Prisma.Decimal}>();
 for(let i=0;i<q.days;i++){const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10);map.set(key,{date:key,productions:0,shipments:dec('0'),expenses:dec('0')});}
 const returns=records.filter(r=>r.type==='DEALER_RETURN').map(r=>(r.metadata as {shipmentId?:string}|null)?.shipmentId).filter((x):x is string=>!!x);
 const original=await prisma.operation.findMany({where:{id:{in:returns}},select:{id:true,metadata:true}});
 const prices=new Map(original.map(r=>[r.id,(r.metadata as {unitPrice?:string}|null)?.unitPrice??'0']));
 for(const item of records){
  const day=map.get(item.occurredAt.toISOString().slice(0,10));if(!day)continue;
  const m=item.metadata as {quantity?:string;unitPrice?:string;shipmentId?:string;amount?:string}|null;
  if(item.type==='PRODUCTION')day.productions++;
  if(item.type==='SHIPMENT')day.shipments=day.shipments.add(dec(m?.quantity??'0').mul(m?.unitPrice??'0'));
  if(item.type==='DEALER_RETURN')day.shipments=day.shipments.sub(dec(m?.quantity??'0').mul(prices.get(m?.shipmentId??'')??'0'));
  if(['EXPENSE','PAYROLL_ADVANCE','PAYROLL_SALARY'].includes(item.type))day.expenses=day.expenses.add(m?.amount??'0');
 }
 return {days:q.days,series:[...map.values()].map(d=>({date:d.date,productionBatches:d.productions,netSales:d.shipments.toFixed(2),cashExpenses:d.expenses.toFixed(2)})),note:'Net sales excludes returns; cash expense totals exclude supplier payments. Not a profit statement.'};
});

app.get('/dashboard', { preHandler: gate(allRoles) }, async(req)=>{
 const [products,dealers,accounts,operations,suppliers]=await Promise.all([
  prisma.product.findMany({select:{id:true,name:true,unit:true,stock:true,isRaw:true}}),
  prisma.dealer.findMany({select:{id:true,name:true,region:true,receivable:true}}),
  prisma.moneyAccount.findMany({select:{id:true,name:true,balance:true,currency:true}}),
  prisma.operation.count(),prisma.supplier.findMany({select:{id:true,name:true,payable:true}})
 ]);
 const finance=financeRoles.includes(req.session!.role);
 return {products:products.map(x=>({...x,stock:x.stock.toString()})),dealers:finance?dealers.map(x=>({...x,receivable:x.receivable.toString()})):[],accounts:finance?accounts.map(x=>({...x,balance:x.balance.toString()})):[],operationCount:finance?operations:0,suppliers:finance?suppliers.map(x=>({...x,payable:x.payable.toString()})):[]};
});


app.get('/recipes', {preHandler:gate(allRoles)}, async()=>{
 const records=await prisma.recipe.findMany({include:{product:{select:{name:true}},ingredients:{include:{material:{select:{name:true}}}}},orderBy:{createdAt:'desc'}});
 return records.map(r=>({id:r.id,productId:r.productId,productName:r.product.name,version:r.version,outputQuantity:r.outputQuantity.toString(),active:r.active,ingredients:r.ingredients.map(x=>({materialId:x.materialId,materialName:x.material.name,quantity:x.quantity.toString()}))}));
});
app.post('/recipes', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const b=z.object({productId:id,outputQuantity:quantity,ingredients:z.array(z.object({materialId:id,quantity})).min(1).max(100)}).parse(req.body);
 if(new Set(b.ingredients.map(x=>x.materialId)).size!==b.ingredients.length) return reply.code(400).send({error:'DUPLICATE_RECIPE_INGREDIENT'});
 const recipe=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773302)`;
  const product=await tx.product.findUnique({where:{id:b.productId}});
  if(!product||product.isRaw||!product.active) insufficient('OUTPUT_PRODUCT_INVALID');
  const materials=await tx.product.findMany({where:{id:{in:b.ingredients.map(x=>x.materialId)},isRaw:true,active:true}});
  if(materials.length!==b.ingredients.length) insufficient('RECIPE_MATERIAL_INVALID');
  const last=await tx.recipe.findFirst({where:{productId:b.productId},orderBy:{version:'desc'}});
  await tx.recipe.updateMany({where:{productId:b.productId,active:true},data:{active:false}});
  const record=await tx.recipe.create({data:{productId:b.productId,outputQuantity:dec(b.outputQuantity),version:(last?.version??0)+1,ingredients:{create:b.ingredients.map(x=>({materialId:x.materialId,quantity:dec(x.quantity)}))}}});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'CREATE_VERSION',entityType:'Recipe',entityId:record.id}});
  return record;
 });
 return reply.code(201).send({id:recipe.id,version:recipe.version});
});


app.get('/employees', {preHandler:gate(['OWNER','MANAGER','ATTENDANCE'])}, async req=>{
 const finance=financeRoles.includes(req.session!.role);
 const staff=await prisma.employee.findMany({orderBy:{name:'asc'}});
 return staff.map(s=>({id:s.id,name:s.name,position:s.position,active:s.active,...(finance?{monthlySalary:s.monthlySalary.toString()}:{})}));
});
app.post('/employees', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const b=z.object({name:z.string().min(2),position:z.string().max(80).optional(),monthlySalary:amount}).parse(req.body);
 const record=await prisma.employee.create({data:{name:b.name,position:b.position,monthlySalary:dec(b.monthlySalary)}});
 await prisma.auditLog.create({data:{actorId:req.session!.id,action:'CREATE',entityType:'Employee',entityId:record.id}});
 return reply.code(201).send({id:record.id});
});
app.get('/attendance', {preHandler:gate(['OWNER','MANAGER','ATTENDANCE'])}, async(req)=>{
 const q=z.object({month:z.string().regex(/^\d{4}-\d{2}$/)}).parse(req.query);
 const start=new Date(q.month+'-01T00:00:00.000Z');
 const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
 return prisma.attendance.findMany({where:{date:{gte:start,lt:end}},include:{employee:{select:{name:true}}},orderBy:{date:'desc'}});
});
app.post('/attendance', {preHandler:gate(['OWNER','MANAGER','ATTENDANCE'])}, async(req,reply)=>{
 const b=z.object({employeeId:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),worked:z.boolean(),note:z.string().max(250).optional()}).parse(req.body);
 const dateValue=new Date(b.date+'T00:00:00.000Z');
 if(Number.isNaN(dateValue.getTime())||dateValue.toISOString().slice(0,10)!==b.date) return reply.code(400).send({error:'INVALID_DATE'});
 const person=await prisma.employee.findUnique({where:{id:b.employeeId}});
 if(!person?.active)return reply.code(409).send({error:'EMPLOYEE_NOT_ACTIVE'});
 const row=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  if(await tx.accountingPeriod.findUnique({where:{month:b.date.slice(0,7)}})) insufficient('ACCOUNTING_PERIOD_CLOSED');
  const saved=await tx.attendance.upsert({where:{employeeId_date:{employeeId:b.employeeId,date:dateValue}},update:{worked:b.worked,note:b.note},create:{employeeId:b.employeeId,date:dateValue,worked:b.worked,note:b.note}});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'ATTENDANCE_SET',entityType:'Attendance',entityId:saved.id,after:{worked:b.worked,date:b.date}}});
  return saved;
 });
 return reply.code(201).send({id:row.id,worked:row.worked});
});
app.get('/payroll', {preHandler:gate(financeRoles)}, async(req)=>{
 const q=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).parse(req.query);
 const people=await prisma.employee.findMany({where:{active:true},include:{payroll:{where:{month:q.month}}},orderBy:{name:'asc'}});
 return people.map(p=>{
  const paid=p.payroll.reduce((s,pay)=>s.add(pay.amount),dec('0'));
  return {id:p.id,name:p.name,monthlySalary:p.monthlySalary.toString(),paid:paid.toString(),remaining:p.monthlySalary.sub(paid).toString()};
 });
});
app.post('/payroll/payments', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const b=z.object({idempotencyKey:id,employeeId:id,accountId:id,month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),type:z.enum(['ADVANCE','SALARY']),amount}).parse(req.body);
 const hash=createHash('sha256').update(JSON.stringify({...b,idempotencyKey:undefined})).digest('hex');
 const response=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const prior=await tx.payrollPayment.findUnique({where:{idempotencyKey:b.idempotencyKey}});
  if(prior){if(prior.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED');return prior;}
  if(await tx.accountingPeriod.findUnique({where:{month:b.month}})) insufficient('ACCOUNTING_PERIOD_CLOSED');
  const employee=await tx.employee.findUnique({where:{id:b.employeeId}});
  if(!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  if(!employee.active) insufficient('EMPLOYEE_INACTIVE');
  const payments=await tx.payrollPayment.aggregate({where:{employeeId:b.employeeId,month:b.month},_sum:{amount:true}});
  const already=payments._sum.amount??dec('0');
  if(already.add(b.amount).gt(employee.monthlySalary)) insufficient('SALARY_EXCEEDED');
  const account=await tx.moneyAccount.findUnique({where:{id:b.accountId}});
  if(!account||account.balance.lt(b.amount)) insufficient('INSUFFICIENT_FUNDS');
  const op=await tx.operation.create({data:{idempotencyKey:b.idempotencyKey,requestHash:hash,type:'PAYROLL_'+b.type,occurredAt:new Date(),createdById:req.session!.id,metadata:{employeeId:b.employeeId,month:b.month,amount:b.amount}}});
  await tx.moneyAccount.update({where:{id:b.accountId},data:{balance:{decrement:dec(b.amount)}}});
  await tx.moneyEntry.create({data:{operationId:op.id,accountId:b.accountId,amount:dec(b.amount).neg()}});
  const payment=await tx.payrollPayment.create({data:{idempotencyKey:b.idempotencyKey,requestHash:hash,employeeId:b.employeeId,accountId:b.accountId,month:b.month,amount:dec(b.amount),type:b.type,operationId:op.id}});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'PAYROLL_PAYMENT',entityType:'PayrollPayment',entityId:payment.id}});
  return payment;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
 return reply.code(201).send({id:response.id});
});




const legacyKinds=['PRODUCT','DEALER','SUPPLIER','ACCOUNT','OPENING_STOCK','OPENING_DEALER','OPENING_SUPPLIER','OPENING_CASH'] as const;
const legacyRow=z.object({
 kind:z.enum(legacyKinds),
 code:z.string().max(120).default(''),
 name:z.string().max(200).default(''),
 region:z.string().max(120).default(''),
 unit:z.string().max(30).default(''),
 value:z.string().max(40).default(''),
 isRaw:z.string().max(5).default('')
});
app.post('/import/preview', {preHandler:gate(['OWNER'])}, async(req,reply)=>{
 const input=z.object({rows:z.array(z.record(z.unknown())).min(1).max(5000)}).parse(req.body);
 const problems:Array<{row:number;field:string;message:string}>=[];
 const seen=new Set<string>();
 let valid=0;
 const normalized:Array<{kind:string;code:string;name:string;region:string;unit:string;value:string;isRaw:boolean}>=[];
 for(let i=0;i<input.rows.length;i++){
  const parsed=legacyRow.safeParse(input.rows[i]);
  if(!parsed.success){problems.push({row:i+2,field:'format',message:'Ustun yoki qiymat formati noto‘g‘ri'});continue;}
  const r=parsed.data;
  const label=r.code.trim()||r.name.trim();
  const key=r.kind+':'+label.toLocaleLowerCase('uz');
  if(!label){problems.push({row:i+2,field:'code/name',message:'Kod yoki nom kiritilmagan'});continue;}
  if(seen.has(key)){problems.push({row:i+2,field:'code/name',message:'Takror yozuv'});continue;}
  seen.add(key);
  if(r.kind==='PRODUCT' && (!r.code.trim()||!r.name.trim()||!r.unit.trim())){problems.push({row:i+2,field:'product',message:'Kod, nom va birlik majburiy'});continue;}
  if(r.kind==='DEALER' && (!r.name.trim()||!r.region.trim())){problems.push({row:i+2,field:'dealer',message:'Diler nomi va viloyat majburiy'});continue;}
  if(r.kind==='SUPPLIER' && !r.name.trim()){problems.push({row:i+2,field:'supplier',message:'Nomi majburiy'});continue;}
  if(r.kind==='ACCOUNT' && !r.name.trim()){problems.push({row:i+2,field:'account',message:'Hisob nomi majburiy'});continue;}
  if(r.kind.startsWith('OPENING_')){
   if(!/^\d{1,15}(\.\d{1,4})?$/.test(r.value)){problems.push({row:i+2,field:'value',message:'Manfiy bo‘lmagan son kerak'});continue;}
   if(r.kind!=='OPENING_STOCK' && !/^\d{1,15}(\.\d{1,2})?$/.test(r.value)){problems.push({row:i+2,field:'value',message:'Pul summasida 2 xonagacha kasr bo‘lishi mumkin'});continue;}
  }
  valid++;
  normalized.push({kind:r.kind,code:r.code.trim(),name:r.name.trim(),region:r.region.trim(),unit:r.unit.trim(),value:r.value.trim(),isRaw:r.isRaw==='true'});
 }
 return reply.send({total:input.rows.length,valid,invalid:input.rows.length-valid,problems,normalized:normalized.slice(0,100),previewOnly:true,note:'Hech qanday ma’lumot bazaga yozilmadi. Boshlang‘ich qoldiqlarni rahbar tasdiqlashi shart.'});
});

app.post('/import/commit', {preHandler:gate(['OWNER'])}, async(req,reply)=>{
 const body=z.object({
  importKey:id,
  confirm:z.literal('ECO WASH IMPORTNI TASDIQLAYMAN'),
  rows:z.array(legacyRow).min(1).max(5000)
 }).parse(req.body);
 // The migration is a once-only opening import. All records must be clean before any write.
 const allowed=new Set(['PRODUCT','DEALER','SUPPLIER','ACCOUNT','OPENING_STOCK','OPENING_DEALER','OPENING_SUPPLIER','OPENING_CASH']);
 const keySet=new Set<string>();
 for(const row of body.rows){
  if(!allowed.has(row.kind)) insufficient('IMPORT_KIND_INVALID');
  const name=(row.code||row.name).trim();
  if(!name) insufficient('IMPORT_REFERENCE_REQUIRED');
  const uniq=row.kind+':'+name.toLocaleLowerCase('uz');
  if(keySet.has(uniq)) insufficient('DUPLICATE_IMPORT_ROW');
  keySet.add(uniq);
  if(row.kind==='PRODUCT'&&(!row.code||!row.name||!row.unit)) insufficient('PRODUCT_FIELDS_REQUIRED');
  if(row.kind==='DEALER'&&(!row.name||!row.region)) insufficient('DEALER_FIELDS_REQUIRED');
  if(row.kind.startsWith('OPENING_')){
   if(!/^\d{1,15}(\.\d{1,4})?$/.test(row.value)) insufficient('INVALID_OPENING_VALUE');
   if(row.kind!=='OPENING_STOCK'&&!/^\d{1,15}(\.\d{1,2})?$/.test(row.value)) insufficient('INVALID_OPENING_MONEY');
  }
 }
 const hash=createHash('sha256').update(JSON.stringify(body.rows)).digest('hex');
 const res=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const prior=await tx.operation.findUnique({where:{idempotencyKey:body.importKey}});
  if(prior){if(prior.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED');return {id:prior.id,alreadyImported:true};}
  const existing=await tx.operation.count();
  const counts=await Promise.all([tx.product.count(),tx.dealer.count(),tx.supplier.count(),tx.moneyAccount.count()]);
  if(existing!==0||counts.some(x=>x!==0)) insufficient('IMPORT_REQUIRES_EMPTY_BUSINESS_DATABASE');
  const op=await tx.operation.create({data:{
   idempotencyKey:body.importKey,requestHash:hash,type:'OPENING_IMPORT',
   occurredAt:new Date(),createdById:req.session!.id,metadata:{rows:body.rows.length}
  }});
  for(const r of body.rows.filter(x=>x.kind==='PRODUCT'))await tx.product.create({data:{sku:r.code,name:r.name,unit:r.unit,isRaw:r.isRaw==='true'}});
  for(const r of body.rows.filter(x=>x.kind==='DEALER'))await tx.dealer.create({data:{name:r.name,region:r.region}});
  for(const r of body.rows.filter(x=>x.kind==='SUPPLIER'))await tx.supplier.create({data:{name:r.name}});
  for(const r of body.rows.filter(x=>x.kind==='ACCOUNT'))await tx.moneyAccount.create({data:{name:r.name}});
  for(const r of body.rows.filter(x=>x.kind==='OPENING_STOCK')){
   const product=await tx.product.findUnique({where:{sku:r.code}});
   if(!product) throw new Error('IMPORT_PRODUCT_NOT_FOUND');
   const value=dec(r.value);
   await tx.product.update({where:{id:product.id},data:{stock:value}});
   await tx.inventoryMovement.create({data:{operationId:op.id,productId:product.id,quantity:value}});
  }
  for(const r of body.rows.filter(x=>x.kind==='OPENING_DEALER')){
   const records=await tx.dealer.findMany({where:{name:r.name}});
   if(records.length!==1) insufficient('IMPORT_DEALER_AMBIGUOUS');
   const item=records[0],value=dec(r.value);
   await tx.dealer.update({where:{id:item.id},data:{receivable:value}});
   await tx.dealerEntry.create({data:{operationId:op.id,dealerId:item.id,amount:value}});
  }
  for(const r of body.rows.filter(x=>x.kind==='OPENING_SUPPLIER')){
   const item=await tx.supplier.findUnique({where:{name:r.name}});
   if(!item) throw new Error('IMPORT_SUPPLIER_NOT_FOUND');
   const value=dec(r.value);
   await tx.supplier.update({where:{id:item.id},data:{payable:value}});
   await tx.supplierEntry.create({data:{operationId:op.id,supplierId:item.id,amount:value}});
  }
  for(const r of body.rows.filter(x=>x.kind==='OPENING_CASH')){
   const item=await tx.moneyAccount.findUnique({where:{name:r.name}});
   if(!item) throw new Error('IMPORT_ACCOUNT_NOT_FOUND');
   const value=dec(r.value);
   await tx.moneyAccount.update({where:{id:item.id},data:{balance:value}});
   await tx.moneyEntry.create({data:{operationId:op.id,accountId:item.id,amount:value}});
  }
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'OPENING_IMPORT',entityType:'Operation',entityId:op.id,after:{rowCount:body.rows.length,hash}}});
  return {id:op.id,alreadyImported:false};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000,maxWait:15000});
 return reply.code(res.alreadyImported?200:201).send(res);
});

app.get('/import/template.xlsx', {preHandler:gate(['OWNER'])}, async(_req,reply)=>{
 const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('Import shablon');
 sheet.addRow(['kind','code','name','region','unit','value','isRaw']);
 sheet.addRow(['PRODUCT','ECO900','Eco Wash 900','','qop','','false']);
 sheet.addRow(['PRODUCT','SLES','SLES','','kg','','true']);
 sheet.addRow(['DEALER','','Samarqand dileri','Samarqand','','','']);
 sheet.addRow(['SUPPLIER','','Xomashyo ta’minotchisi','','','','']);
 sheet.addRow(['ACCOUNT','','Naqd kassa','','','','']);
 sheet.addRow(['OPENING_STOCK','SLES','','','','100.5','']);
 sheet.addRow(['OPENING_DEALER','','Samarqand dileri','','','2000000','']);
 sheet.addRow(['OPENING_CASH','','Naqd kassa','','','1500000','']);
 sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>c.width=25);
 const guide=wb.addWorksheet('Yo‘riqnoma');
 guide.addRow(['Muhim','Namuna satrlar haqiqiy ECO WASH summalari emas. Faqat formatni ko‘rsatadi.']);
 guide.addRow(['kind','PRODUCT / DEALER / SUPPLIER / ACCOUNT / OPENING_STOCK / OPENING_DEALER / OPENING_SUPPLIER / OPENING_CASH']);
 guide.addRow(['code','Mahsulot yoki xomashyo kodi. OPENING_STOCKda majburiy.']);
 guide.addRow(['name','Diler, yetkazib beruvchi yoki hisobning nomi.']);
 guide.addRow(['value','Qoldiq (UZS yoki o‘lchov birligi), manfiy bo‘lmasin.']);
 guide.addRow(['Cheklov','Bu shablonni to‘ldirish o‘zi avtomatik import qilmaydi; avval tekshiriladi, keyin rahbar tasdiqlaydi.']);
 const buf=await wb.xlsx.writeBuffer();
 return reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 .header('Content-Disposition','attachment; filename="eco-wash-import-template.xlsx"')
 .send(Buffer.from(buf));
});

app.get('/reports/summary', {preHandler:gate(financeRoles)}, async(req)=>{
 const q=z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.query);
 const start=new Date(q.from+'T00:00:00.000Z');
 const end=new Date(q.to+'T00:00:00.000Z');
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end) insufficient('INVALID_DATE_RANGE');
 end.setUTCDate(end.getUTCDate()+1);

 const records=await prisma.operation.findMany({where:{occurredAt:{gte:start,lt:end},status:'POSTED'},select:{type:true,metadata:true}});
 const returns=records.filter(r=>r.type==='DEALER_RETURN').map(r=>(r.metadata as {shipmentId?:string})?.shipmentId).filter((v):v is string=>!!v);
 const shipments=await prisma.operation.findMany({where:{id:{in:returns}},select:{id:true,metadata:true}});
 const shipmentById=new Map(shipments.map(r=>[r.id,r.metadata as {unitPrice?:string}]));
 const totals:Record<string,Prisma.Decimal>={};
 for(const op of records){
  const c=op.metadata as {quantity?:string;unitPrice?:string;amount?:string;shipmentId?:string}|null;
  if(!c)continue;
  let sum=dec('0');
  if(op.type==='SHIPMENT')sum=dec(c.quantity??'0').mul(c.unitPrice??'0');
  else if(op.type==='DEALER_RETURN')sum=dec(c.quantity??'0').mul(shipmentById.get(c.shipmentId??'')?.unitPrice??'0').neg();
  else if(c.amount)sum=dec(c.amount);
  totals[op.type]=(totals[op.type]??dec('0')).add(sum);
 }
 const grossSales=totals.SHIPMENT??dec('0');
 const returnedValue=totals.DEALER_RETURN??dec('0');
 return {
  from:q.from,to:q.to,operations:records.length,
  totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v.toString()])),
  grossSales:grossSales.toFixed(2),salesReturns:returnedValue.toFixed(2),netSales:grossSales.add(returnedValue).toFixed(2),
  note:'Sales minus returned goods, not net profit. Cash receipts and debt repayments are not additional sales.'
 };
});

app.get('/audit/reconciliation', {preHandler:gate(['OWNER'])}, async()=>{
 const [products,dealers,suppliers,accounts,stockEntries,dealerEntries,supplierEntries,moneyEntries]=await Promise.all([
  prisma.product.findMany({select:{id:true,name:true,stock:true}}),
  prisma.dealer.findMany({select:{id:true,name:true,receivable:true}}),
  prisma.supplier.findMany({select:{id:true,name:true,payable:true}}),
  prisma.moneyAccount.findMany({select:{id:true,name:true,balance:true}}),
  prisma.inventoryMovement.groupBy({by:['productId'],_sum:{quantity:true}}),
  prisma.dealerEntry.groupBy({by:['dealerId'],_sum:{amount:true}}),
  prisma.supplierEntry.groupBy({by:['supplierId'],_sum:{amount:true}}),
  prisma.moneyEntry.groupBy({by:['accountId'],_sum:{amount:true}})
 ]);
 const errors:Array<{category:string;id:string;name:string;stored:string;computed:string}>=[];
 const check=(category:string,items:Array<{id:string;name:string;balance:Prisma.Decimal}>,totals:Map<string,Prisma.Decimal>)=>{
  for(const item of items){const computed=totals.get(item.id)??dec('0');if(!item.balance.eq(computed))errors.push({category,id:item.id,name:item.name,stored:item.balance.toString(),computed:computed.toString()});}
 };
 check('inventory',products.map(x=>({id:x.id,name:x.name,balance:x.stock})),new Map(stockEntries.map(x=>[x.productId,x._sum.quantity??dec('0')])));
 check('dealer',dealers.map(x=>({id:x.id,name:x.name,balance:x.receivable})),new Map(dealerEntries.map(x=>[x.dealerId,x._sum.amount??dec('0')])));
 check('supplier',suppliers.map(x=>({id:x.id,name:x.name,balance:x.payable})),new Map(supplierEntries.map(x=>[x.supplierId,x._sum.amount??dec('0')])));
 check('account',accounts.map(x=>({id:x.id,name:x.name,balance:x.balance})),new Map(moneyEntries.map(x=>[x.accountId,x._sum.amount??dec('0')])));
 return {ok:errors.length===0,checked:{products:products.length,dealers:dealers.length,suppliers:suppliers.length,accounts:accounts.length},errors};
});


app.get('/statements/:kind/:id', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const q=z.object({kind:z.enum(['dealer','supplier']),id}).parse(req.params);
 const limit=z.coerce.number().int().min(1).max(500).default(100).parse((req.query as Record<string,string>).limit);
 if(q.kind==='dealer'){
  const item=await prisma.dealer.findUnique({where:{id:q.id}});
  if(!item)return reply.code(404).send({error:'DEALER_NOT_FOUND'});
  const entries=await prisma.dealerEntry.findMany({where:{dealerId:q.id},orderBy:{operation:{occurredAt:'desc'}},take:limit,include:{operation:{select:{id:true,type:true,occurredAt:true,status:true,metadata:true}}}});
  return {name:item.name,region:item.region,balance:item.receivable.toString(),currency:'UZS',entries:entries.map(x=>({operationId:x.operationId,type:x.operation.type,date:x.operation.occurredAt.toISOString(),amount:x.amount.toString(),status:x.operation.status}))};
 }
 const item=await prisma.supplier.findUnique({where:{id:q.id}});
 if(!item)return reply.code(404).send({error:'SUPPLIER_NOT_FOUND'});
 const entries=await prisma.supplierEntry.findMany({where:{supplierId:q.id},orderBy:{operation:{occurredAt:'desc'}},take:limit,include:{operation:{select:{id:true,type:true,occurredAt:true,status:true}}}});
 return {name:item.name,balance:item.payable.toString(),currency:'UZS',entries:entries.map(x=>({operationId:x.operationId,type:x.operation.type,date:x.operation.occurredAt.toISOString(),amount:x.amount.toString(),status:x.operation.status}))};
});

app.get('/reports/export.xlsx', { preHandler: gate(financeRoles) }, async (_req,reply)=>{
 const [products,dealers,accounts,ops,suppliers,employees,attendance,payroll,recipes]=await Promise.all([
  prisma.product.findMany({orderBy:{name:'asc'}}),
  prisma.dealer.findMany({orderBy:{name:'asc'}}),
  prisma.moneyAccount.findMany({orderBy:{name:'asc'}}),
  prisma.operation.findMany({orderBy:{createdAt:'desc'},take:10000,include:{createdBy:{select:{name:true}}}}),
  prisma.supplier.findMany({orderBy:{name:'asc'}}),
  prisma.employee.findMany({orderBy:{name:'asc'}}),
  prisma.attendance.findMany({include:{employee:{select:{name:true}}},orderBy:{date:'desc'},take:10000}),
  prisma.payrollPayment.findMany({include:{employee:{select:{name:true}}},orderBy:{createdAt:'desc'},take:10000}),
  prisma.recipe.findMany({include:{product:{select:{name:true}},ingredients:{include:{material:{select:{name:true}}}}},orderBy:{createdAt:'desc'}})
 ]);
 const wb=new ExcelJS.Workbook();
 wb.creator='ECO WASH ERP';
 const put=(title:string,headers:string[],rows:(string|number)[][])=>{
  const sh=wb.addWorksheet(title);sh.addRow(headers);
  for(const r of rows)sh.addRow(r);
  sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0A2937'}};
  sh.views=[{state:'frozen',ySplit:1}];
  sh.columns=headers.map((name,i)=>({header:name,key:'c'+i,width:Math.max(18,Math.min(36,name.length+8))}));
 };
 // Amounts are exported as text to avoid IEEE-754 rounding of monetary values.
 put('Ombor',['SKU','Mahsulot','Birlik','Xomashyo','Qoldiq'],products.map(x=>[x.sku,x.name,x.unit,x.isRaw?'Ha':'Yo‘q',x.stock.toString()]));
 put('Yetkazib beruvchilar',['Yetkazib beruvchi','Qarz UZS'],suppliers.map(x=>[x.name,x.payable.toString()]));
 put('Diler qarzlari',['Diler','Viloyat','Qarz UZS'],dealers.map(x=>[x.name,x.region,x.receivable.toString()]));
 put('Pul hisoblari',['Hisob','Valyuta','Qoldiq'],accounts.map(x=>[x.name,x.currency,x.balance.toString()]));
 put('Operatsiyalar',['ID','Turi','Sana','Kiritgan','Status'],ops.map(x=>[x.id,x.type,x.occurredAt.toISOString(),x.createdBy.name,x.status]));

 put('Ishchilar',['ID','Ism','Lavozim','Oylik UZS','Holat'],employees.map(x=>[x.id,x.name,x.position??'',x.monthlySalary.toString(),x.active?'Faol':'Nofaol']));
 put('Davomat',['Sana','Ishchi','Ishladi','Izoh'],attendance.map(x=>[x.date.toISOString().slice(0,10),x.employee.name,x.worked?'Ha':'Yo‘q',x.note??'']));
 put('Oylik va avans',['Ishchi','Oy','Turi','Summa UZS','Sana'],payroll.map(x=>[x.employee.name,x.month,x.type,x.amount.toString(),x.createdAt.toISOString()]));
 put('Retseptlar',['Mahsulot','Versiya','Chiqish miqdori','Xomashyo','Miqdor','Faol'],recipes.flatMap(x=>x.ingredients.map(y=>[x.product.name,String(x.version),x.outputQuantity.toString(),y.material.name,y.quantity.toString(),x.active?'Ha':'Yo‘q'])));

 const bytes=await wb.xlsx.writeBuffer();
 return reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  .header('Content-Disposition','attachment; filename="eco-wash-report.xlsx"')
  .send(Buffer.from(bytes));
});


app.get('/costing/recipe-estimates', {preHandler:gate(financeRoles)}, async()=>{
 const recipes=await prisma.recipe.findMany({where:{active:true},include:{product:{select:{name:true}},ingredients:{include:{material:{select:{name:true,unit:true}}}}}});
 const estimates=[];
 for(const recipe of recipes){
  let batchCost=dec('0');
  const missing:string[]=[];
  const breakdown=[];
  for(const line of recipe.ingredients){
   const latest=await prisma.inventoryMovement.findFirst({where:{productId:line.materialId,quantity:{gt:0},unitCost:{not:null},operation:{status:'POSTED'}},orderBy:{operation:{createdAt:'desc'}}});
   if(!latest?.unitCost){missing.push(line.material.name);continue;}
   const extended=latest.unitCost.mul(line.quantity);
   batchCost=batchCost.add(extended);
   breakdown.push({material:line.material.name,unit:line.material.unit,quantity:line.quantity.toString(),lastPurchaseUnitCost:latest.unitCost.toString(),extendedCost:extended.toFixed(2)});
  }
  estimates.push({recipeId:recipe.id,productId:recipe.productId,productName:recipe.product.name,version:recipe.version,outputQuantity:recipe.outputQuantity.toString(),complete:missing.length===0,missingCosts:missing,batchRawCost:missing.length===0?batchCost.toFixed(2):null,unitRawCost:missing.length===0?batchCost.div(recipe.outputQuantity).toFixed(2):null,breakdown});
 }
 return {method:'Latest recorded raw-material purchase price (estimate only)',currency:'UZS',includesLabor:false,includesTransport:false,includesOverhead:false,officialProfit:false,recipes:estimates};
});
app.get('/periods', {preHandler:gate(financeRoles)}, async()=>prisma.accountingPeriod.findMany({orderBy:{month:'desc'}}));
app.post('/periods/close', {preHandler:gate(['OWNER'])}, async(req,reply)=>{
 const b=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),note:z.string().max(500).optional(),confirm:z.literal('DAVRNI YOPISHNI TASDIQLAYMAN')}).parse(req.body);
 const start=new Date(b.month+'-01T00:00:00.000Z');
 if(!Number.isFinite(start.getTime())||start>new Date())return reply.code(409).send({error:'FUTURE_PERIOD'});
 const closed=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const previous=await tx.accountingPeriod.findUnique({where:{month:b.month}});
  if(previous)return previous;
  const period=await tx.accountingPeriod.create({data:{month:b.month,closingNote:b.note,closedById:req.session!.id}});
  await tx.auditLog.create({data:{actorId:req.session!.id,action:'CLOSE_PERIOD',entityType:'AccountingPeriod',entityId:period.id,after:{month:b.month,note:b.note??''}}});
  return period;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 return reply.code(201).send({id:closed.id,month:closed.month,closedAt:closed.closedAt});
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
