import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import { addPending, listPending, removePending, markPendingError } from './offline';
import { StaffPanel } from './StaffPanel';
import { RecipePanel } from './RecipePanel';
import { ReportsPanel } from './ReportsPanel';
import { ImportPanel } from './ImportPanel';
import { UsersPanel } from './UsersPanel';
import { StatementsPanel } from './StatementsPanel';
import { PendingPanel } from './PendingPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
type Item={id:string;name:string;[key:string]:unknown};
type Snapshot={products:Item[];dealers:Item[];accounts:Item[];suppliers:Item[];operationCount:number};
type CommandType='ACCOUNT_OPENING'|'INVENTORY_ADJUSTMENT'|'VOID_OPERATION'|'DEALER_RETURN'|'SUPPLIER_RECEIPT'|'SUPPLIER_RETURN'|'SUPPLIER_PAYMENT'|'DEALER_OPENING'|'SUPPLIER_OPENING'|'STOCK_RECEIPT'|'PRODUCTION'|'SHIPMENT'|'DEALER_PAYMENT'|'EXPENSE'|'CASH_RECEIPT'|'ACCOUNT_TRANSFER';
const labels:Record<CommandType,string>={ACCOUNT_OPENING:'Boshlang‘ich kassa qoldig‘i (rahbar)',INVENTORY_ADJUSTMENT:'Inventarizatsiya (rahbar)',VOID_OPERATION:'Operatsiyani bekor qilish (rahbar)',DEALER_RETURN:'Diler qaytargan mahsulot',SUPPLIER_RECEIPT:'Yetkazib beruvchidan xomashyo',SUPPLIER_RETURN:'Yetkazib beruvchiga qaytarish',SUPPLIER_PAYMENT:'Yetkazib beruvchiga to‘lov',DEALER_OPENING:'Diler boshlang‘ich qarzi',SUPPLIER_OPENING:'Yetkazib beruvchi boshlang‘ich qarzi',STOCK_RECEIPT:'Xomashyo / mahsulot kirimi',PRODUCTION:'Ishlab chiqarish',SHIPMENT:'Dilerga jo‘natma',DEALER_PAYMENT:'Diler to‘lovi',EXPENSE:'Xarajat',CASH_RECEIPT:'Pul kirimi',ACCOUNT_TRANSFER:'Hisoblararo o‘tkazma'};
function App(){
 const [token,setToken]=useState(sessionStorage.getItem('eco_token')||'');
 const [userId,setUserId]=useState(sessionStorage.getItem('eco_user_id')||'');
 const [role,setRole]=useState(sessionStorage.getItem('eco_role')||'');
 const canFinance=role==='OWNER'||role==='MANAGER';
 const isOwner=role==='OWNER';
 const [login,setLogin]=useState(''),[password,setPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const [openGroup,setOpenGroup]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [data,setData]=useState<Snapshot|null>(null),[tab,setTab]=useState<'dashboard'|'operations'|'catalog'|'staff'|'recipes'|'reports'|'import'|'users'|'statements'|'pending'>('dashboard');
 const [kind,setKind]=useState<CommandType>('STOCK_RECEIPT');
 const [values,setValues]=useState<Record<string,string>>({});
 const [recipes,setRecipes]=useState<Item[]>([]);
 const [history,setHistory]=useState<Array<{id:string;type:string;createdAt:string;status?:string;metadata?:Record<string,unknown>;createdBy?:{name:string}}>>([]);
 const [historyFilter,setHistoryFilter]=useState('');
 const [selectedOperation,setSelectedOperation]=useState('');
 const [catalogKind,setCatalogKind]=useState<'products'|'dealers'|'accounts'|'suppliers'>('products');
 const [catalog,setCatalog]=useState<Record<string,string>>({});
 const [catalogFilter,setCatalogFilter]=useState('');
 const [editingCatalog,setEditingCatalog]=useState<string|null>(null);
 const [editCatalogValues,setEditCatalogValues]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const [pending,setPending]=useState(0);
 const [syncing,setSyncing]=useState(false);
 const updatePending=async()=>setPending(userId?(await listPending(userId)).length:0);
 useEffect(()=>{void updatePending();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});},[userId]);
 const api=async(path:string,method='GET',payload?:unknown)=>{
  const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:payload?JSON.stringify(payload):undefined});
  const json=await response.json();
  if(response.status===401){sessionStorage.removeItem('eco_token');sessionStorage.removeItem('eco_role');sessionStorage.removeItem('eco_user_id');setToken('');setRole('');setUserId('');throw new Error('Sessiya tugagan. Qayta kiring.');}
  if(!response.ok)throw new Error(json.error||'So‘rov bajarilmadi');
  return json;
 };
 async function downloadExcel(){
  try{const response=await fetch('/api/reports/export.xlsx',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('Eksport muvaffaqiyatsiz');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='eco-wash-report.xlsx';a.click();URL.revokeObjectURL(url);}catch(e){setError(String(e));}
 }
 async function refresh(){
  try{const snapshot=await api('/dashboard');setData(snapshot);const [operations,recipeList]=await Promise.allSettled([api('/operations'),api('/recipes')]);setHistory(operations.status==='fulfilled'?operations.value:[]);setRecipes(recipeList.status==='fulfilled'?recipeList.value.map((r:Item)=>({...r,name:String(r.productName)+' v'+String(r.version)+' '+(r.active?'':'(arxiv)')})):[]);}catch(e){setError(String(e));}
 }
 useEffect(()=>{if(token){void api('/me').then(u=>{sessionStorage.setItem('eco_user_id',u.id);setUserId(u.id);sessionStorage.setItem('eco_role',u.role);setRole(u.role);}).catch(()=>{setError('Sessiyani tekshirish uchun internet kerak.');});void refresh();}},[token]);
 const set=(name:string,v:string)=>setValues(s=>({...s,[name]:v}));
 async function syncPending(){
  if(!navigator.onLine){setError('Internet mavjud emas');return;}
  setSyncing(true);setError('');let synced=0;let failed=0;
  if(!userId){setError('Foydalanuvchi sessiyasi tekshirilmagan');setSyncing(false);return;}
  for(const item of await listPending(userId)){
   try{await api('/operations','POST',item.body);await removePending(item.key);synced++;}
   catch(e){failed++;await markPendingError(item.key,String(e));}
  }
  await updatePending();setSyncing(false);
  setMessage(synced+' ta amal serverda tasdiqlandi; '+failed+' ta tekshirish talab qiladi.');
  if(synced)await refresh();
 }
 async function signIn(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});const json=await response.json();if(!response.ok)throw Error('Login yoki parol xato');sessionStorage.setItem('eco_token',json.token);sessionStorage.setItem('eco_user_id',json.user.id);setUserId(json.user.id);sessionStorage.setItem('eco_role',json.user.role);setRole(json.user.role);setToken(json.token);setPassword('');}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 const fields:Record<CommandType,Array<[string,string,string]>>={ACCOUNT_OPENING:[['accountId','Pul hisobi','accounts'],['amount','Tasdiqlangan boshlang‘ich qoldiq','number']],INVENTORY_ADJUSTMENT:[['productId','Mahsulot / xomashyo','products'],['actualQuantity','Sanab chiqilgan haqiqiy qoldiq','nonnegative'],['reason','Farq sababi','text']],
  VOID_OPERATION:[['targetId','Bekor qilinadigan operatsiya ID','text']],
  DEALER_RETURN:[['shipmentId','Avvalgi jo‘natma ID','text'],['quantity','Qaytgan miqdor','number']],
  SUPPLIER_RECEIPT:[['supplierId','Yetkazib beruvchi','suppliers'],['productId','Xomashyo','products'],['quantity','Miqdor','number'],['unitCost','Birlik tannarxi','number']],
  SUPPLIER_RETURN:[['purchaseId','Xomashyo xaridi operatsiyasi ID','text'],['quantity','Qaytarilayotgan miqdor','number']],
  SUPPLIER_PAYMENT:[['supplierId','Yetkazib beruvchi','suppliers'],['accountId','Pul hisobi','accounts'],['amount','To‘lov summasi','number']],
  DEALER_OPENING:[['dealerId','Diler','dealers'],['amount','Boshlang‘ich qarz','number']],
  SUPPLIER_OPENING:[['supplierId','Yetkazib beruvchi','suppliers'],['amount','Boshlang‘ich qarz','number']],
  PRODUCTION:[['recipeId','Retsept','recipes'],['batches','Partiya soni','number']],
  STOCK_RECEIPT:[['productId','Mahsulot','products'],['quantity','Miqdor','number'],['unitCost','Bir birlik tannarxi (ixtiyoriy)','number']],
  SHIPMENT:[['dealerId','Diler','dealers'],['productId','Mahsulot','products'],['quantity','Miqdor','number'],['unitPrice','Birlik sotuv narxi','number']],
  DEALER_PAYMENT:[['dealerId','Diler','dealers'],['accountId','Pul hisobi','accounts'],['amount','To‘lov summasi','number']],
  EXPENSE:[['accountId','Pul hisobi','accounts'],['amount','Xarajat summasi','number'],['category','Kategoriya','text'],['description','Izoh','text']],
  CASH_RECEIPT:[['accountId','Pul hisobi','accounts'],['amount','Kirim summasi','number'],['description','Izoh','text']],
  ACCOUNT_TRANSFER:[['fromAccountId','Qaysi hisobdan','accounts'],['toAccountId','Qaysi hisobga','accounts'],['amount','Summa','number']]
 };
 async function saveOperation(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  const command:Record<string,string>={type:kind,occurredAt:new Date().toISOString()};
  for(const [key,,type] of fields[kind])if(values[key]?.trim())command[key]=(type==='number'||type==='nonnegative')?values[key].trim():values[key];
  const payload={idempotencyKey:crypto.randomUUID(),command};
  const offlineRestricted=['VOID_OPERATION','INVENTORY_ADJUSTMENT','ACCOUNT_OPENING','DEALER_OPENING','SUPPLIER_OPENING','DEALER_RETURN','SUPPLIER_RETURN'];
  const canQueueOffline=!offlineRestricted.includes(kind);
  try{
   if(!navigator.onLine){
    if(!canQueueOffline)throw new Error('Bu amal xavfsizlik sababli faqat internet mavjud bo‘lganda bajariladi.');
    if(!userId)throw new Error('Offline yozish uchun foydalanuvchi tekshirilmagan');await addPending(payload.idempotencyKey,payload,userId);setValues({});
    setMessage('Qurilmada saqlandi. Server hali tasdiqlamadi.');await updatePending();return;
   }
   try{await api('/operations','POST',payload);}
   catch(error){
    if(error instanceof TypeError){if(!canQueueOffline)throw new Error('Server tasdig‘i noma’lum. Qoldiqni yangilab, qaytadan tekshiring.');if(!userId)throw new Error('Foydalanuvchi tasdiqlanmagan');await addPending(payload.idempotencyKey,payload,userId);setValues({});setMessage('Internet uzildi. Amal lokal navbatga yozildi, server tasdiqlamadi.');await updatePending();return;}
    throw error;
   }
   setValues({});setMessage('Operatsiya serverda tasdiqlandi');await refresh();
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function saveCatalogEdit(){
  if(!editingCatalog)return;
  setBusy(true);setError('');setMessage('');
  try{
   const body:Record<string,string>={name:editCatalogValues.name};
   if(catalogKind==='products')body.unit=editCatalogValues.unit;
   if(catalogKind==='dealers')body.region=editCatalogValues.region;
   await api('/'+catalogKind+'/'+editingCatalog,'PATCH',body);
   setEditingCatalog(null);setEditCatalogValues({});setMessage('Ma’lumot yangilandi');await refresh();
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function saveCatalog(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  const payload:Record<string,unknown>={...catalog};
  if(catalogKind==='products')payload.isRaw=catalog.isRaw==='true';
  try{await api('/'+catalogKind,'POST',payload);setCatalog({});setMessage('Ro‘yxatga qo‘shildi');await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 const catalogFields:Record<string,Array<[string,string]>>={
  suppliers:[['name','Yetkazib beruvchi']],
  products:[['sku','Kod (SKU)'],['name','Nomi'],['unit','Birlik'],['isRaw','Mahsulot turi']],
  dealers:[['name','Diler'],['region','Viloyat']],accounts:[['name','Hisob nomi']]
 };
 const n=(v:unknown)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});
 if(!token)return <main className="login-page"><form className="login" onSubmit={signIn}><div className="logo">ECO WASH <span>ERP</span></div><h2>Tizimga kirish</h2><p>Korxona boshqaruvi</p><label>Login<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required/></label><label>Parol<input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button type="button" className="ghost" onClick={()=>setShowPassword(x=>!x)}>{showPassword?'Yashirish':'Parolni ko‘rsatish'}</button></label>{error&&<p className="error">{error}</p>}<button disabled={busy}>Kirish</button></form></main>;
 return <main className="app"><aside><div className="logo">ECO WASH <span>ERP</span></div><p>Korxona boshqaruvi</p><nav className="erp-nav">
 <button className={tab==='dashboard'?'selected':''} onClick={()=>setTab('dashboard')}>◫ Bosh sahifa</button>
 <button className={tab==='pending'?'selected':''} onClick={()=>setTab('pending')}>↥ Offline navbat ({pending})</button>
 {(canFinance||role==='WAREHOUSE')&&<>
 <button className="nav-group-toggle" onClick={()=>setOpenGroup(g=>g==='warehouse'?'':'warehouse')}>▤ Ombor va ishlab chiqarish <span>{openGroup==='warehouse'?'⌃':'⌄'}</span></button>
 {openGroup==='warehouse'&&<div className="nav-children">
 <button className={tab==='catalog'?'selected':''} onClick={()=>setTab('catalog')}>Mahsulotlar va xomashyo</button>
 <button className={tab==='operations'?'selected':''} onClick={()=>{setTab('operations');setKind('STOCK_RECEIPT');}}>Kirim va chiqim</button>
 {canFinance&&<button className={tab==='recipes'?'selected':''} onClick={()=>setTab('recipes')}>Retseptlar</button>}
 </div>}</>}
 {canFinance&&<>
 <button className="nav-group-toggle" onClick={()=>setOpenGroup(g=>g==='sales'?'':'sales')}>♧ Savdo va dilerlar <span>{openGroup==='sales'?'⌃':'⌄'}</span></button>
 {openGroup==='sales'&&<div className="nav-children">
 <button onClick={()=>{setTab('operations');setKind('SHIPMENT');}}>Yuk jo‘natish</button>
 <button onClick={()=>{setTab('operations');setKind('DEALER_PAYMENT');}}>To‘lov kiritish</button>
 <button className={tab==='statements'?'selected':''} onClick={()=>setTab('statements')}>Qarz tarixi</button>
 </div>}
 <button className="nav-group-toggle" onClick={()=>setOpenGroup(g=>g==='finance'?'':'finance')}>▤ Moliya <span>{openGroup==='finance'?'⌃':'⌄'}</span></button>
 {openGroup==='finance'&&<div className="nav-children">
 <button className={tab==='reports'?'selected':''} onClick={()=>setTab('reports')}>Hisobotlar</button>
 <button onClick={()=>{setTab('operations');setKind('EXPENSE');}}>Xarajatlar</button>
 <button onClick={()=>{setTab('operations');setKind('ACCOUNT_TRANSFER');}}>Kassa o‘tkazmalari</button>
 </div>}</>}
 {(canFinance||role==='ATTENDANCE')&&<button className={tab==='staff'?'selected':''} onClick={()=>setTab('staff')}>♙ Xodimlar va davomat</button>}
 {isOwner&&<>
 <button className="nav-group-toggle" onClick={()=>setOpenGroup(g=>g==='settings'?'':'settings')}>⚙ Sozlamalar <span>{openGroup==='settings'?'⌃':'⌄'}</span></button>
 {openGroup==='settings'&&<div className="nav-children">
 <button className={tab==='import'?'selected':''} onClick={()=>setTab('import')}>Excel import</button>
 <button className={tab==='users'?'selected':''} onClick={()=>setTab('users')}>Foydalanuvchilar</button>
 </div>}</>}
 </nav><button className="logout" onClick={()=>{sessionStorage.removeItem('eco_token');sessionStorage.removeItem('eco_user_id');sessionStorage.removeItem('eco_role');setRole('');setUserId('');setToken('');setData(null);setTab('dashboard');}}>Chiqish</button></aside><section className="content"><div className="top"><div><p className="eyebrow">ECO WASH / ISH PANELI</p><h1>{tab==='dashboard'?'Bosh sahifa':tab==='operations'?'Yangi operatsiya':tab==='staff'?'Ishchilar':tab==='recipes'?'Retseptlar':tab==='reports'?'Hisobotlar':tab==='import'?'Excelni ko‘chirish':tab==='users'?'Xodimlar kirishi':tab==='statements'?'Qarz tafsiloti':tab==='pending'?'Offline navbat':'Ma’lumotnomalar'}</h1></div><div className="topactions"><button className="ghost" onClick={()=>void refresh()}>↻ Yangilash</button>{canFinance&&<button className="ghost" onClick={()=>void downloadExcel()}>↓ Excel</button>}<button className="ghost" disabled={!pending||syncing} onClick={()=>void syncPending()}>↥ Sinxronlash ({pending})</button></div></div>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice success">{message}</div>}
 {tab==='dashboard'&&<><AnalyticsPanel api={api} enabled={canFinance}/><div className="stats"><article><small>Ombor pozitsiyalari</small><strong>{data?.products.length??'—'}</strong></article><article><small>Dilerlar</small><strong>{data?.dealers.length??'—'}</strong></article><article><small>Jami diler qarzi (UZS)</small><strong>{n(data?.dealers.reduce((a,b)=>a+Number(b.receivable),0))}</strong></article><article><small>Operatsiyalar</small><strong>{data?.operationCount??'—'}</strong></article></div><div className="columns"><div className="panel"><h2>Ombor qoldig‘i</h2><table><thead><tr><th>Mahsulot</th><th>Qoldiq</th></tr></thead><tbody>{data?.products.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.stock)} {String(x.unit)}</td></tr>)}</tbody></table></div><div className="panel"><h2>Diler qarzlari</h2><table><thead><tr><th>Diler</th><th>Qarz</th></tr></thead><tbody>{data?.dealers.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.receivable)}</td></tr>)}</tbody></table><h2>Pul hisoblari</h2><table><tbody>{data?.accounts.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.balance)} UZS</td></tr>)}</tbody></table></div></div></>}
 {tab==='operations'&&<div className="columns"><form className="panel form" onSubmit={saveOperation}><h2>Operatsiyani kiritish</h2><label>Amal turi<select value={kind} onChange={e=>{setKind(e.target.value as CommandType);setValues({});}}>{Object.entries(labels).filter(([k])=>role==='OWNER'||(role==='WAREHOUSE'?k==='STOCK_RECEIPT':!['VOID_OPERATION','DEALER_OPENING','SUPPLIER_OPENING','INVENTORY_ADJUSTMENT','ACCOUNT_OPENING'].includes(k))).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{fields[kind].map(([key,title,type])=><label key={key}>{title}{['products','dealers','accounts','suppliers','recipes'].includes(type)?<select required value={values[key]||''} onChange={e=>set(key,e.target.value)}><option value="">Tanlang</option>{(type==='recipes'?recipes:((data?.[type as keyof Snapshot]||[]) as Item[])).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select>:['targetId','shipmentId','purchaseId'].includes(key)?<><select required value={values[key]||''} onChange={e=>set(key,e.target.value)}><option value="">Oxirgi operatsiyalardan tanlang</option>{history.filter(op=>key==='shipmentId'?op.type==='SHIPMENT'&&op.status==='POSTED':key==='purchaseId'?op.type==='SUPPLIER_RECEIPT'&&op.status==='POSTED':op.status==='POSTED').map(op=><option key={op.id} value={op.id}>{labels[op.type as CommandType]||op.type} — {new Date(op.createdAt).toLocaleDateString('uz-UZ')} — {op.id.slice(0,8)}</option>)}</select><small className="muted">Eski operatsiya ro‘yxatda bo‘lmasa, uning ID sini kiriting</small><input value={values[key]||''} onChange={e=>set(key,e.target.value)} placeholder="Operatsiya ID (UUID)"/></>:<input type={type==='nonnegative'?'number':type} min={type==='nonnegative'?'0':type==='number'?'0.0001':undefined} step={type==='number'||type==='nonnegative'?'any':undefined} required={!['unitCost','description'].includes(key)} value={values[key]||''} onChange={e=>set(key,e.target.value)}/>}</label>)}<button disabled={busy}>{busy?'Saqlanmoqda...':'Serverga saqlash'}</button><small className="muted">Offline yozuvlar faqat qurilmada saqlanadi; server tasdiqlamaguncha rasmiy qoldiq o‘zgarmaydi.</small></form>
<div className="panel"><h2>So‘nggi operatsiyalar</h2><input placeholder="Qidirish: ID, tur yoki xodim" value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}/>
{history.filter(x=>[x.id,x.type,x.createdBy?.name||''].join(' ').toLowerCase().includes(historyFilter.toLowerCase())).map(x=><div className="history" key={x.id} style={{display:'block'}}>
<button type="button" className="ghost" style={{width:'100%',display:'flex',justifyContent:'space-between',textAlign:'left'}} onClick={()=>setSelectedOperation(p=>p===x.id?'':x.id)}>
<span><b>{labels[x.type as CommandType]||x.type}</b><small style={{display:'block'}}>{x.createdBy?.name||'Xodim'} — {new Date(x.createdAt).toLocaleString('uz-UZ')}</small></span><span>{x.status==='REVERSED'?'Bekor qilingan':'Tasdiqlangan'} {selectedOperation===x.id?'⌃':'⌄'}</span>
</button>
{selectedOperation===x.id&&<div style={{padding:12,background:'#f4f8f8',borderRadius:8,overflowWrap:'anywhere'}}><small>ID: {x.id}</small>{Object.entries(x.metadata||{}).map(([key,value])=><div key={key} style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:12,marginTop:7}}><span>{key}</span><strong>{String(value)}</strong></div>)}</div>}
</div>)}{!history.length&&<p className="muted">Operatsiyalar topilmadi.</p>}</div></div>}
 {tab==='recipes'&&<RecipePanel api={api} products={data?.products||[]} onSaved={refresh}/>}
 {tab==='staff'&&<StaffPanel api={api} accounts={data?.accounts||[]} onSaved={refresh} role={role}/>}
 
 {tab==='reports'&&<ReportsPanel api={api} downloadExcel={downloadExcel} isOwner={isOwner}/>}
 {tab==='pending'&&<PendingPanel userId={userId} sync={()=>syncPending()} syncing={syncing} onChanged={()=>updatePending()}/>}
 {tab==='statements'&&<StatementsPanel api={api} dealers={data?.dealers||[]} suppliers={data?.suppliers||[]}/>}
 {tab==='users'&&<UsersPanel api={api}/>}
 {tab==='import'&&<ImportPanel api={api} token={token}/>}
 {tab==='catalog'&&<div className="columns"><form className="panel form" onSubmit={saveCatalog}><h2>Yangi yozuv</h2><label>Bo‘lim<select value={catalogKind} onChange={e=>{setCatalogKind(e.target.value as typeof catalogKind);setCatalog({});}}><option value="products">Mahsulotlar</option><option value="dealers">Dilerlar</option><option value="accounts">Pul hisoblari (faqat rahbar)</option><option value="suppliers">Yetkazib beruvchilar</option></select></label>{catalogFields[catalogKind].map(([key,title])=><label key={key}>{title}{key==='isRaw'?<select value={catalog[key]||'false'} onChange={e=>setCatalog(s=>({...s,[key]:e.target.value}))}><option value="false">Tayyor mahsulot</option><option value="true">Xomashyo</option></select>:key==='unit'?<select required value={catalog[key]||''} onChange={e=>setCatalog(s=>({...s,[key]:e.target.value}))}><option value="">Birlikni tanlang</option><option value="kg">kg</option><option value="qop">qop</option><option value="dona">dona</option><option value="litr">litr</option></select>:<input required value={catalog[key]||''} onChange={e=>setCatalog(s=>({...s,[key]:e.target.value}))}/>}</label>)}<button disabled={busy}>Qo‘shish</button></form><div className="panel"><h2>Joriy ma’lumotlar</h2><input placeholder="Ro‘yxatdan qidirish" value={catalogFilter} onChange={e=>setCatalogFilter(e.target.value)}/><table><thead><tr><th>Nomi</th><th>Qoldiq / qarz</th></tr></thead><tbody>{((data?.[catalogKind]||[]) as Item[]).filter(x=>x.name.toLowerCase().includes(catalogFilter.toLowerCase())).map(x=><tr key={x.id}><td>{editingCatalog===x.id?<input aria-label="Nomi" value={editCatalogValues.name||''} onChange={e=>setEditCatalogValues(v=>({...v,name:e.target.value}))}/>:x.name}</td><td>{editingCatalog===x.id?<div style={{display:'grid',gap:6}}>
 {catalogKind==='products'&&<select value={editCatalogValues.unit||''} onChange={e=>setEditCatalogValues(v=>({...v,unit:e.target.value}))}><option value="kg">kg</option><option value="qop">qop</option><option value="dona">dona</option><option value="litr">litr</option></select>}
 {catalogKind==='dealers'&&<input aria-label="Viloyat" value={editCatalogValues.region||''} onChange={e=>setEditCatalogValues(v=>({...v,region:e.target.value}))}/>}
 <button type="button" className="ghost" disabled={busy} onClick={()=>void saveCatalogEdit()}>Saqlash</button>
 <button type="button" className="ghost" onClick={()=>setEditingCatalog(null)}>Bekor qilish</button></div>:x.stock!==undefined?String(x.stock)+' '+String(x.unit):x.receivable!==undefined?String(x.receivable)+' UZS':x.payable!==undefined?String(x.payable)+' UZS':x.balance!==undefined?String(x.balance)+' UZS':'—'}</td><td>{catalogKind!=='accounts'&&editingCatalog!==x.id&&<button type="button" className="ghost" onClick={()=>{setEditingCatalog(x.id);setEditCatalogValues({name:x.name,unit:String(x.unit||''),region:String(x.region||'')});}}>Tahrirlash</button>}</td></tr>)}</tbody></table></div></div>}
 </section></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
