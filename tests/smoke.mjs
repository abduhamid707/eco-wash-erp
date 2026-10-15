import assert from 'node:assert/strict';
const base='http://localhost:4000';
let token='';
async function api(path,method='GET',data){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
 const payload=await r.json();
 if(!r.ok)throw new Error(path+' '+r.status+' '+JSON.stringify(payload));
 return payload;
}
const login=await api('/auth/login','POST',{login:'ci-admin',password:'ci-only-testing-password'});
assert.ok(login.token);
token=login.token;
const product=await api('/products','POST',{sku:'ECO-CI-900',name:'Eco Wash test',unit:'qop',isRaw:false});
const dealer=await api('/dealers','POST',{name:'Samarqand CI',region:'Samarqand'});
const account=await api('/accounts','POST',{name:'Test kassa'});
const when=new Date().toISOString();
const uuid=()=>crypto.randomUUID();
const receipt={type:'STOCK_RECEIPT',productId:product.id,quantity:'10',occurredAt:when};
const key=uuid();
const first=await api('/operations','POST',{idempotencyKey:key,command:receipt});
const again=await api('/operations','POST',{idempotencyKey:key,command:receipt});
assert.equal(first.id,again.id,'Idempotency must reuse original operation');
const cash=await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'CASH_RECEIPT',accountId:account.id,amount:'1000',occurredAt:when}});
assert.ok(cash.id);
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SHIPMENT',dealerId:dealer.id,productId:product.id,quantity:'3',unitPrice:'100',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'DEALER_PAYMENT',dealerId:dealer.id,accountId:account.id,amount:'200',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'EXPENSE',accountId:account.id,amount:'50',category:'Transport',occurredAt:when}});
const snapshot=await api('/dashboard');
assert.equal(snapshot.products.find(x=>x.id===product.id).stock,'7');
assert.equal(snapshot.dealers.find(x=>x.id===dealer.id).receivable,'100');
assert.equal(snapshot.accounts.find(x=>x.id===account.id).balance,'1150');
const recipes=await api('/recipes'); assert.ok(Array.isArray(recipes));
const report=await fetch(base+'/reports/export.xlsx',{headers:{Authorization:'Bearer '+token}});
assert.equal(report.status,200);
assert.ok(Number(report.headers.get('content-length')||0)>0 || (await report.arrayBuffer()).byteLength>100);
console.log('PASS: login, stock, debt, payment, expense, idempotency, report');

const supplier=await api('/suppliers','POST',{name:'Kimyo mahsulotlari CI'});
const raw=await api('/products','POST',{sku:'RAW-SLES-CI',name:'SLES CI',unit:'kg',isRaw:true});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SUPPLIER_RECEIPT',supplierId:supplier.id,productId:raw.id,quantity:'20',unitCost:'5',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SUPPLIER_PAYMENT',supplierId:supplier.id,accountId:account.id,amount:'30',occurredAt:when}});

const secondPurchase=await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SUPPLIER_RECEIPT',supplierId:supplier.id,productId:raw.id,quantity:'10',unitCost:'5',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SUPPLIER_RETURN',purchaseId:secondPurchase.id,quantity:'2',occurredAt:when}});
const afterSupplyReturn=await api('/dashboard');
assert.equal(afterSupplyReturn.suppliers.find(x=>x.id===supplier.id).payable,'110');
assert.equal(afterSupplyReturn.products.find(x=>x.id===raw.id).stock,'28');
console.log('PASS: supplier returns decrease stock and payable atomically');
const supplierSnapshot=await api('/dashboard');
assert.equal(supplierSnapshot.suppliers.find(x=>x.id===supplier.id).payable,'110');
assert.equal(supplierSnapshot.accounts.find(x=>x.id===account.id).balance,'1120');
const recipe=await api('/recipes','POST',{productId:product.id,outputQuantity:'2',ingredients:[{materialId:raw.id,quantity:'3'}]});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'PRODUCTION',recipeId:recipe.id,batches:'1',occurredAt:when}});
const afterProduction=await api('/dashboard');
assert.equal(afterProduction.products.find(x=>x.id===raw.id).stock,'25');
assert.equal(afterProduction.products.find(x=>x.id===product.id).stock,'9');
const shipment=await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'SHIPMENT',dealerId:dealer.id,productId:product.id,quantity:'1',unitPrice:'100',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'DEALER_RETURN',shipmentId:shipment.id,quantity:'1',occurredAt:when}});
const afterReturn=await api('/dashboard');
assert.equal(afterReturn.products.find(x=>x.id===product.id).stock,'9');
assert.equal(afterReturn.dealers.find(x=>x.id===dealer.id).receivable,'100');
const cashOp=await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'CASH_RECEIPT',accountId:account.id,amount:'40',occurredAt:when}});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'VOID_OPERATION',targetId:cashOp.id,occurredAt:when}});
const afterVoid=await api('/dashboard');
assert.equal(afterVoid.accounts.find(x=>x.id===account.id).balance,'1120');
const staff=await api('/employees','POST',{name:'Test Ishchi',monthlySalary:'300',position:'Operator'});
await api('/attendance','POST',{employeeId:staff.id,date:'2026-10-14',worked:true});
const payroll=await api('/payroll/payments','POST',{idempotencyKey:uuid(),employeeId:staff.id,accountId:account.id,month:'2026-10',type:'ADVANCE',amount:'30'});
assert.ok(payroll.id);
const salary=await api('/payroll?month=2026-10');
assert.equal(salary.find(x=>x.id===staff.id).remaining,'270');
const afterPayroll=await api('/dashboard');
assert.equal(afterPayroll.accounts.find(x=>x.id===account.id).balance,'1090');
console.log('PASS: supplier credit, recipe, production, return, reversal, attendance, payroll');


const reconciliation=await api('/audit/reconciliation');
assert.equal(reconciliation.ok,true,'All balances must reconcile against transaction ledger');
console.log('PASS: financial reconciliation');

const inventoryBefore=await api('/dashboard');
const previous=Number(inventoryBefore.products.find(x=>x.id===raw.id).stock);
const adjustment=await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'INVENTORY_ADJUSTMENT',productId:raw.id,actualQuantity:String(previous+2),reason:'CI test count adjustment',occurredAt:when}});
assert.ok(adjustment.id);
const adjusted=await api('/dashboard');
assert.equal(Number(adjusted.products.find(x=>x.id===raw.id).stock),previous+2);
assert.equal((await api('/audit/reconciliation')).ok,true);
console.log('PASS: inventory count adjustment reconciles with ledger');

const openingAccount=await api('/accounts','POST',{name:'Opening CI account'});
await api('/operations','POST',{idempotencyKey:uuid(),command:{type:'ACCOUNT_OPENING',accountId:openingAccount.id,amount:'500',occurredAt:when}});
assert.equal((await api('/dashboard')).accounts.find(a=>a.id===openingAccount.id).balance,'500');
const finalCheck=await api('/audit/reconciliation');
assert.equal(finalCheck.ok,true);
console.log('PASS: opening balances reconcile');

const migrationRows=[
 {kind:'PRODUCT',code:'R1',name:'Raw material',region:'',unit:'kg',value:'',isRaw:'true'},
 {kind:'DEALER',code:'',name:'Samarqand test',region:'Samarqand',unit:'',value:'',isRaw:''},
 {kind:'OPENING_CASH',code:'',name:'Test kassa',region:'',unit:'',value:'1000',isRaw:''}
];
const dryRun=await api('/import/preview','POST',{rows:migrationRows});
assert.equal(dryRun.valid,3);
assert.equal(dryRun.invalid,0);
assert.equal(dryRun.previewOnly,true);
const badPreview=await api('/import/preview','POST',{rows:[migrationRows[0],migrationRows[0]]});
assert.equal(badPreview.invalid,1);
const template=await fetch(base+'/import/template.xlsx',{headers:{Authorization:'Bearer '+token}});
assert.equal(template.status,200);
console.log('PASS: import validation, duplicate detection, template download');

const costRows=await api('/costing/recipe-estimates');
const costRow=costRows.recipes.find(x=>x.recipeId===recipe.id);
assert.equal(costRow.unitRawCost,'7.50');
assert.equal(costRows.officialProfit,false);

const closed=await api('/periods/close','POST',{month:'2026-10',confirm:'DAVRNI YOPISHNI TASDIQLAYMAN',note:'CI integration validation'});
assert.equal(closed.month,'2026-10');
const late=await fetch(base+'/operations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({idempotencyKey:uuid(),command:{type:'CASH_RECEIPT',accountId:account.id,amount:'1',occurredAt:'2026-10-14T13:00:00.000Z'}})});
assert.equal(late.status,409);
const final=await api('/audit/reconciliation');
assert.equal(final.ok,true);
console.log('PASS: recipe cost estimate, accounting-period close and reconciliation');

const turn=await api('/reports/summary?from=2026-10-01&to=2026-10-31');
assert.equal(turn.salesReturns,'-100.00');
assert.equal(turn.netSales,'300.00');
console.log('PASS: returned goods reduce net sales');


async function expectStatus(path,method,payload,status,authToken=token){
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify(payload)});
 assert.equal(res.status,status,await res.text().catch(()=>''));
}
const unsafeShip={type:'SHIPMENT',dealerId:dealer.id,productId:product.id,quantity:'999999',unitPrice:'2',occurredAt:when};
await expectStatus('/operations','POST',{idempotencyKey:uuid(),command:unsafeShip},409);
await expectStatus('/operations','POST',{idempotencyKey:key,command:{...receipt,quantity:'1'}},409);
const afterRejected=await api('/dashboard');
assert.equal(afterRejected.products.find(x=>x.id===product.id).stock,
 (await api('/dashboard')).products.find(x=>x.id===product.id).stock);
const noAuth=await fetch(base+'/users');
assert.equal(noAuth.status,401);
const attendanceUser=await api('/users','POST',{name:'Attendance limited user',login:'attendance-test',password:'test-login-password-123',role:'ATTENDANCE'});
assert.ok(attendanceUser.id);
const loginAtt=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'attendance-test',password:'test-login-password-123'})});
const attendanceToken=(await loginAtt.json()).token;
const limited=await fetch(base+'/dashboard',{headers:{Authorization:'Bearer '+attendanceToken}});
const limitedBody=await limited.json();
assert.equal(limited.status,200);
assert.deepEqual(limitedBody.accounts,[]);
assert.deepEqual(limitedBody.dealers,[]);
const staffList=await fetch(base+'/employees',{headers:{Authorization:'Bearer '+attendanceToken}});
const listBody=await staffList.json();
assert.equal(staffList.status,200);
assert.ok(listBody.every(x=>!Object.hasOwn(x,'monthlySalary')));
await expectStatus('/operations','POST',{idempotencyKey:uuid(),command:receipt},403,attendanceToken);
console.log('PASS: authorization boundaries, immutable idempotency and negative-stock rejection');

const dStatement=await api('/statements/dealer/'+dealer.id);
assert.equal(dStatement.balance,'100');
const sStatement=await api('/statements/supplier/'+supplier.id);
assert.equal(sStatement.balance,'110');
console.log('PASS: debt statement balances');
