import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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
 z.object({ type: z.literal('VOID_OPERATION'), targetId:id, occurredAt:date }),
 z.object({ type: z.literal('DEALER_RETURN'), shipmentId:id, quantity, occurredAt:date }),
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
app.post('/auth/login', async (req, reply) => {
 const b = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body);
 const user = await prisma.user.findUnique({ where: { login: b.login } });
 if (!user?.active || !(await bcrypt.compare(b.password,user.passwordHash))) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
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
 if(b.command.type==='VOID_OPERATION' && req.session!.role!=='OWNER') return reply.code(403).send({error:'OWNER_ONLY'});
 if (req.session!.role==='WAREHOUSE' && !['STOCK_RECEIPT','SUPPLIER_RECEIPT'].includes(b.command.type)) return reply.code(403).send({error:'FORBIDDEN'});
 const hash=createHash('sha256').update(JSON.stringify(b.command)).digest('hex');
 // Serializability plus a transaction-level advisory lock serialize financial postings across API replicas.
 const op=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773301)`;
  const previous=await tx.operation.findUnique({where:{idempotencyKey:b.idempotencyKey}});
  if(previous){if(previous.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED'); return previous;}
  const c=b.command;
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
  
  if(c.type==='DEALER_RETURN'){
   const shipment=await tx.operation.findUnique({where:{id:c.shipmentId}});
   if(!shipment||shipment.type!=='SHIPMENT'||shipment.status!=='POSTED') insufficient('ORIGINAL_SHIPMENT_NOT_FOUND');
   const original=shipment.metadata as {productId?:string;quantity?:string;unitPrice?:string};
   if(!original?.productId||!original.quantity||!original.unitPrice||!shipment.dealerId) insufficient('INVALID_SHIPMENT');
   const prior=await tx.operation.findMany({where:{type:'DEALER_RETURN',status:'POSTED'}});
   const already=prior.filter(x=>(x.metadata as {shipmentId?:string})?.shipmentId===c.shipmentId)
    .reduce((total,x)=>total.add((x.metadata as {quantity:string}).quantity),dec('0'));
   if(already.add(c.quantity).gt(original.quantity)) insufficient('RETURN_EXCEEDS_SHIPMENT');
   await stock(original.productId,dec(c.quantity));
   await dealerChange(shipment.dealerId,dec(c.quantity).mul(original.unitPrice).neg());
  }
  if(c.type==='VOID_OPERATION'){
   const original=await tx.operation.findUnique({where:{id:c.targetId},include:{movements:true,moneyEntries:true,dealerEntries:true,supplierEntries:true}});
   if(!original||original.status!=='POSTED'||original.type==='VOID_OPERATION'||original.type.startsWith('PAYROLL_')) insufficient('CANNOT_VOID_OPERATION');
   const dependents=await tx.operation.findMany({where:{type:'DEALER_RETURN',status:'POSTED'}});
   if(dependents.some(x=>(x.metadata as {shipmentId?:string})?.shipmentId===original.id)) insufficient('SHIPMENT_HAS_RETURNS');
   for(const m of original.movements) await stock(m.productId,m.quantity.neg(),m.unitCost?.toString());
   for(const m of original.moneyEntries) await changeAccount(m.accountId,m.amount.neg());
   for(const m of original.dealerEntries) await dealerChange(m.dealerId,m.amount.neg());
   for(const m of original.supplierEntries) await supplierChange(m.supplierId,m.amount.neg());
   await tx.operation.update({where:{id:original.id},data:{status:'REVERSED'}});
   await tx.operation.update({where:{id:result.id},data:{reversalOfId:original.id}});
  }

  if(c.type==='DEALER_OPENING') await dealerChange(c.dealerId,dec(c.amount));
  if(c.type==='SUPPLIER_OPENING') await supplierChange(c.supplierId,dec(c.amount));
  if(c.type==='SUPPLIER_RECEIPT'){await stock(c.productId,dec(c.quantity),c.unitCost);await supplierChange(c.supplierId,dec(c.quantity).mul(c.unitCost));}
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
app.get('/operations', { preHandler:gate(allRoles) }, async req=>{
 const limit=Math.min(100,Number((req.query as Record<string,string>).limit)||30);
 return prisma.operation.findMany({take:limit,orderBy:{createdAt:'desc'},include:{createdBy:{select:{name:true}},movements:true,moneyEntries:true}});
});
app.get('/dashboard', { preHandler: gate(allRoles) }, async()=>{
 const [products,dealers,accounts,operations,suppliers]=await Promise.all([
  prisma.product.findMany({select:{id:true,name:true,unit:true,stock:true,isRaw:true}}),
  prisma.dealer.findMany({select:{id:true,name:true,region:true,receivable:true}}),
  prisma.moneyAccount.findMany({select:{id:true,name:true,balance:true,currency:true}}),
  prisma.operation.count(),prisma.supplier.findMany({select:{id:true,name:true,payable:true}})
 ]);
 return {products:products.map(x=>({...x,stock:x.stock.toString()})),dealers:dealers.map(x=>({...x,receivable:x.receivable.toString()})),accounts:accounts.map(x=>({...x,balance:x.balance.toString()})),operationCount:operations,suppliers:suppliers.map(x=>({...x,payable:x.payable.toString()}))};
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


app.get('/employees', {preHandler:gate(allRoles)}, async()=>{
 const staff=await prisma.employee.findMany({orderBy:{name:'asc'},include:{attendance:true,payroll:true}});
 return staff.map(s=>({id:s.id,name:s.name,position:s.position,monthlySalary:s.monthlySalary.toString(),active:s.active,attendanceCount:s.attendance.length}));
});
app.post('/employees', {preHandler:gate(financeRoles)}, async(req,reply)=>{
 const b=z.object({name:z.string().min(2),position:z.string().max(80).optional(),monthlySalary:amount}).parse(req.body);
 const record=await prisma.employee.create({data:{name:b.name,position:b.position,monthlySalary:dec(b.monthlySalary)}});
 await prisma.auditLog.create({data:{actorId:req.session!.id,action:'CREATE',entityType:'Employee',entityId:record.id}});
 return reply.code(201).send({id:record.id});
});
app.get('/attendance', {preHandler:gate(allRoles)}, async(req)=>{
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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(773303)`;
  const prior=await tx.payrollPayment.findUnique({where:{idempotencyKey:b.idempotencyKey}});
  if(prior){if(prior.requestHash!==hash) insufficient('IDEMPOTENCY_KEY_REUSED');return prior;}
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

app.get('/reports/export.xlsx', { preHandler: gate(financeRoles) }, async (_req,reply)=>{
 const [products,dealers,accounts,ops,suppliers]=await Promise.all([
  prisma.product.findMany({orderBy:{name:'asc'}}),
  prisma.dealer.findMany({orderBy:{name:'asc'}}),
  prisma.moneyAccount.findMany({orderBy:{name:'asc'}}),
  prisma.operation.findMany({orderBy:{createdAt:'desc'},take:10000,include:{createdBy:{select:{name:true}}}}),
  prisma.supplier.findMany({orderBy:{name:'asc'}})
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
 const bytes=await wb.xlsx.writeBuffer();
 return reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  .header('Content-Disposition','attachment; filename="eco-wash-report.xlsx"')
  .send(Buffer.from(bytes));
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
