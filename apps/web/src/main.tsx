import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Item={id:string;name:string;[key:string]:unknown};
type Snapshot={products:Item[];dealers:Item[];accounts:Item[];operationCount:number};
type CommandType='STOCK_RECEIPT'|'SHIPMENT'|'DEALER_PAYMENT'|'EXPENSE'|'CASH_RECEIPT'|'ACCOUNT_TRANSFER';
const labels:Record<CommandType,string>={STOCK_RECEIPT:'Xomashyo / mahsulot kirimi',SHIPMENT:'Dilerga jo‘natma',DEALER_PAYMENT:'Diler to‘lovi',EXPENSE:'Xarajat',CASH_RECEIPT:'Pul kirimi',ACCOUNT_TRANSFER:'Hisoblararo o‘tkazma'};
function App(){
 const [token,setToken]=useState(sessionStorage.getItem('eco_token')||'');
 const [login,setLogin]=useState(''),[password,setPassword]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [data,setData]=useState<Snapshot|null>(null),[tab,setTab]=useState<'dashboard'|'operations'|'catalog'>('dashboard');
 const [kind,setKind]=useState<CommandType>('STOCK_RECEIPT');
 const [values,setValues]=useState<Record<string,string>>({});
 const [history,setHistory]=useState<Array<{id:string;type:string;createdAt:string}>>([]);
 const [catalogKind,setCatalogKind]=useState<'products'|'dealers'|'accounts'>('products');
 const [catalog,setCatalog]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const api=async(path:string,method='GET',payload?:unknown)=>{
  const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:payload?JSON.stringify(payload):undefined});
  const json=await response.json();
  if(!response.ok)throw new Error(json.error||'So‘rov bajarilmadi');
  return json;
 };
 async function refresh(){
  try{const [snapshot,operations]=await Promise.all([api('/dashboard'),api('/operations')]);setData(snapshot);setHistory(operations);}catch(e){setError(String(e));}
 }
 useEffect(()=>{if(token)void refresh();},[token]);
 const set=(name:string,v:string)=>setValues(s=>({...s,[name]:v}));
 async function signIn(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});const json=await response.json();if(!response.ok)throw Error('Login yoki parol xato');sessionStorage.setItem('eco_token',json.token);setToken(json.token);setPassword('');}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 const fields:Record<CommandType,Array<[string,string,string]>>={
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
  for(const [key,,type] of fields[kind]) if(values[key]?.trim()) command[key]=type==='number'?Number(values[key]).toString():values[key];
  try{
   await api('/operations','POST',{idempotencyKey:crypto.randomUUID(),command});
   setValues({});setMessage('Operatsiya serverda tasdiqlandi');await refresh();
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function saveCatalog(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  const payload:Record<string,unknown>={...catalog};
  if(catalogKind==='products')payload.isRaw=catalog.isRaw==='true';
  try{await api('/'+catalogKind,'POST',payload);setCatalog({});setMessage('Ro‘yxatga qo‘shildi');await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 const catalogFields:Record<string,Array<[string,string]>>={
  products:[['sku','Kod (SKU)'],['name','Nomi'],['unit','Birlik (qop/kg/dona)'],['isRaw','Xomashyomi? (true/false)']],
  dealers:[['name','Diler'],['region','Viloyat']],accounts:[['name','Hisob nomi']]
 };
 const n=(v:unknown)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});
 if(!token)return <main className="login-page"><form className="login" onSubmit={signIn}><div className="logo">ECO WASH <span>ERP</span></div><h2>Tizimga kirish</h2><p>Korxona boshqaruvi</p><label>Login<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required/></label><label>Parol<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{error&&<p className="error">{error}</p>}<button disabled={busy}>Kirish</button></form></main>;
 return <main className="app"><aside><div className="logo">ECO WASH <span>ERP</span></div><p>Korxona boshqaruvi</p><nav><button className={tab==='dashboard'?'selected':''} onClick={()=>setTab('dashboard')}>◫ Bosh sahifa</button><button className={tab==='operations'?'selected':''} onClick={()=>setTab('operations')}>↗ Operatsiyalar</button><button className={tab==='catalog'?'selected':''} onClick={()=>setTab('catalog')}>▤ Ma’lumotnomalar</button></nav><button className="logout" onClick={()=>{sessionStorage.removeItem('eco_token');setToken('');setData(null);}}>Chiqish</button></aside><section className="content"><div className="top"><div><p className="eyebrow">ECO WASH / ISH PANELI</p><h1>{tab==='dashboard'?'Bosh sahifa':tab==='operations'?'Yangi operatsiya':'Ma’lumotnomalar'}</h1></div><button className="ghost" onClick={()=>void refresh()}>↻ Yangilash</button></div>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice success">{message}</div>}
 {tab==='dashboard'&&<><div className="stats"><article><small>Ombor pozitsiyalari</small><strong>{data?.products.length??'—'}</strong></article><article><small>Dilerlar</small><strong>{data?.dealers.length??'—'}</strong></article><article><small>Jami diler qarzi (UZS)</small><strong>{n(data?.dealers.reduce((a,b)=>a+Number(b.receivable),0))}</strong></article><article><small>Operatsiyalar</small><strong>{data?.operationCount??'—'}</strong></article></div><div className="columns"><div className="panel"><h2>Ombor qoldig‘i</h2><table><thead><tr><th>Mahsulot</th><th>Qoldiq</th></tr></thead><tbody>{data?.products.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.stock)} {String(x.unit)}</td></tr>)}</tbody></table></div><div className="panel"><h2>Diler qarzlari</h2><table><thead><tr><th>Diler</th><th>Qarz</th></tr></thead><tbody>{data?.dealers.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.receivable)}</td></tr>)}</tbody></table><h2>Pul hisoblari</h2><table><tbody>{data?.accounts.map(x=><tr key={x.id}><td>{x.name}</td><td>{n(x.balance)} UZS</td></tr>)}</tbody></table></div></div></>}
 {tab==='operations'&&<div className="columns"><form className="panel form" onSubmit={saveOperation}><h2>Operatsiyani kiritish</h2><label>Amal turi<select value={kind} onChange={e=>{setKind(e.target.value as CommandType);setValues({});}}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{fields[kind].map(([key,title,type])=><label key={key}>{title}{['products','dealers','accounts'].includes(type)?<select required value={values[key]||''} onChange={e=>set(key,e.target.value)}><option value="">Tanlang</option>{((data?.[type as keyof Snapshot]||[]) as Item[]).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select>:<input type={type} min={type==='number'?'0.0001':undefined} step={type==='number'?'any':undefined} required={!['unitCost','description'].includes(key)} value={values[key]||''} onChange={e=>set(key,e.target.value)}/>}</label>)}<button disabled={busy||!navigator.onLine}>{busy?'Saqlanmoqda...':'Serverga saqlash'}</button><small className="muted">Offline yuborish hali yoqilmagan. Internet yo‘q bo‘lsa, operatsiya qabul qilinmaydi.</small></form><div className="panel"><h2>So‘nggi operatsiyalar</h2>{history.map(x=><div className="history" key={x.id}><b>{labels[x.type as CommandType]||x.type}</b><small>{new Date(x.createdAt).toLocaleString('uz-UZ')}</small></div>)}</div></div>}
 {tab==='catalog'&&<div className="columns"><form className="panel form" onSubmit={saveCatalog}><h2>Yangi yozuv</h2><label>Bo‘lim<select value={catalogKind} onChange={e=>{setCatalogKind(e.target.value as typeof catalogKind);setCatalog({});}}><option value="products">Mahsulotlar</option><option value="dealers">Dilerlar</option><option value="accounts">Pul hisoblari (faqat rahbar)</option></select></label>{catalogFields[catalogKind].map(([key,title])=><label key={key}>{title}<input required={key!=='isRaw'} value={catalog[key]||''} onChange={e=>setCatalog(s=>({...s,[key]:e.target.value}))}/></label>)}<button disabled={busy}>Qo‘shish</button></form><div className="panel"><h2>Joriy ma’lumotlar</h2><ul>{((data?.[catalogKind]||[]) as Item[]).map(x=><li key={x.id}>{x.name}</li>)}</ul></div></div>}
 </section></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
