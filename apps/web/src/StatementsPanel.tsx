import {useState,type FormEvent} from 'react';
type Item={id:string;name:string;[key:string]:unknown};
type Ledger={name:string;balance:string;currency:string;entries:Array<{operationId:string;type:string;date:string;amount:string;status:string}>};
export function StatementsPanel({api,dealers,suppliers}:{api:(path:string,method?:string,payload?:unknown)=>Promise<any>;dealers:Item[];suppliers:Item[]}){
 const [kind,setKind]=useState<'dealer'|'supplier'>('dealer'),[selected,setSelected]=useState(''),[ledger,setLedger]=useState<Ledger|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(e:FormEvent){e.preventDefault();setError('');setBusy(true);try{setLedger(await api('/statements/'+kind+'/'+selected));}catch(err){setError(String(err));}finally{setBusy(false);}}
 const items=kind==='dealer'?dealers:suppliers;
 const number=(str:string)=>Number(str).toLocaleString('en-US',{maximumFractionDigits:2});
 return <div className="panel"><h2>Diler va yetkazib beruvchi qarzlari tarixi</h2><p className="muted">Har bir qarz va to‘lov qaysi operatsiyadan kelib chiqqani ko‘rinadi. Musbat summa qarzni oshiradi, manfiy summa kamaytiradi.</p>
 <form className="reportfilters" onSubmit={load}><label>Kimning hisobi<select value={kind} onChange={e=>{setKind(e.target.value as 'dealer'|'supplier');setSelected('');setLedger(null);}}><option value="dealer">Diler</option><option value="supplier">Yetkazib beruvchi</option></select></label>
 <label>Tanlang<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Tanlang</option>{items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button disabled={!selected||busy}>Ko‘rsatish</button></form>
 {error&&<div className="notice error">{error}</div>}
 {ledger&&<><h3>{ledger.name} — {number(ledger.balance)} so‘m qarz</h3><table><thead><tr><th>Sana</th><th>Operatsiya</th><th>O‘zgarish (UZS)</th><th>Holat</th></tr></thead><tbody>{ledger.entries.map((x,i)=><tr key={x.operationId+'-'+i}><td>{new Date(x.date).toLocaleDateString('uz-UZ')}</td><td><span title={x.operationId}>{x.type}</span></td><td>{Number(x.amount)>0?'+':''}{number(x.amount)}</td><td>{x.status}</td></tr>)}</tbody></table><p className="muted">Oxirgi 100 ta harakat ko‘rsatiladi. Yuqoridagi qoldiq barcha harakatlar bo‘yicha hisoblangan.</p></>}
 </div>;
}
