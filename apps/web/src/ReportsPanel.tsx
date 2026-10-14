import {useState,type FormEvent} from 'react';
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;downloadExcel:()=>Promise<void>};
const labels:Record<string,string>={SHIPMENT:'Jo‘natilgan mahsulot (sotuv)',DEALER_PAYMENT:'Diler qarzidan tushgan pul',EXPENSE:'Operatsion xarajat',SUPPLIER_RECEIPT:'Qarzga olingan xomashyo',SUPPLIER_PAYMENT:'Yetkazib beruvchiga to‘lov',CASH_RECEIPT:'Kassaga boshqa kirim',ACCOUNT_TRANSFER:'Hisoblararo pul o‘tkazish',PAYROLL_ADVANCE:'Ishchi avansi',PAYROLL_SALARY:'Oylik to‘lovi',DEALER_OPENING:'Dilerning boshlang‘ich qarzi',SUPPLIER_OPENING:'Yetkazib beruvchining boshlang‘ich qarzi'};
export function ReportsPanel({api,downloadExcel}:Props){
 const today=new Date().toISOString().slice(0,10);
 const [from,setFrom]=useState(today.slice(0,7)+'-01');
 const [to,setTo]=useState(today),[report,setReport]=useState<{totals:Record<string,string>;operations:number}|null>(null);
 const [audit,setAudit]=useState<{ok:boolean;errors:Array<{category:string;name:string;stored:string;computed:string}>}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{setReport(await api('/reports/summary?from='+from+'&to='+to));}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function reconcile(){setBusy(true);setError('');try{setAudit(await api('/audit/reconciliation'));}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div className="panel"><h2>Moliyaviy harakatlar</h2><p className="muted">Jo‘natma summasi sotuv, dilerning bergan puli esa qarzni yopish hisoblanadi. Bu jadval foyda yoki zarar hisobotining o‘rnini bosmaydi.</p>
 <form className="reportfilters" onSubmit={load}><label>Dan<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Gacha<input type="date" required value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><button disabled={busy}>Hisoblash</button></form>
 {error&&<div className="notice error">{error}</div>}
 {report&&<><h3>Tanlangan davr: {report.operations} ta operatsiya</h3><table><thead><tr><th>Yo‘nalish</th><th>Summa (UZS)</th></tr></thead><tbody>{Object.entries(report.totals).map(([k,v])=><tr key={k}><td>{labels[k]||k}</td><td>{Number(v).toLocaleString('en-US',{maximumFractionDigits:2})}</td></tr>)}</tbody></table></>}
 <div className="reportactions"><button type="button" className="ghost" onClick={()=>void downloadExcel()}>↓ Excel eksport</button><button type="button" className="ghost" disabled={busy} onClick={()=>void reconcile()}>Qoldiqlarni solishtirish</button></div>
 {audit&&<div className={audit.ok?'notice success':'notice error'}>{audit.ok?'Ombor, diler, yetkazib beruvchi va kassa hisoblari operatsiyalar jurnaliga mos':'Qoldiqlarda farq aniqlandi. Tafsilotlar quyida.'}</div>}
 {audit?.errors.map((x,i)=><div className="history" key={i}><b>{x.category} — {x.name}</b><small>Hisobda: {x.stored}; jurnalda: {x.computed}</small></div>)}
 </div>;
}
