import {useState,type FormEvent} from 'react';
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;downloadExcel:()=>Promise<void>};
const labels:Record<string,string>={SHIPMENT:'Jo‘natilgan mahsulot (sotuv)',DEALER_PAYMENT:'Diler qarzidan tushgan pul',DEALER_RETURN:'Diler qaytargan mahsulot (minus)',EXPENSE:'Operatsion xarajat',SUPPLIER_RECEIPT:'Qarzga olingan xomashyo',SUPPLIER_PAYMENT:'Yetkazib beruvchiga to‘lov',CASH_RECEIPT:'Kassaga boshqa kirim',ACCOUNT_TRANSFER:'Hisoblararo pul o‘tkazish',PAYROLL_ADVANCE:'Ishchi avansi',PAYROLL_SALARY:'Oylik to‘lovi',DEALER_OPENING:'Dilerning boshlang‘ich qarzi',SUPPLIER_OPENING:'Yetkazib beruvchining boshlang‘ich qarzi'};
export function ReportsPanel({api,downloadExcel}:Props){
 const today=new Date().toISOString().slice(0,10);
 const [from,setFrom]=useState(today.slice(0,7)+'-01');
 const [to,setTo]=useState(today),[report,setReport]=useState<{totals:Record<string,string>;operations:number;grossSales:string;salesReturns:string;netSales:string}|null>(null);
 const [cost,setCost]=useState<{netSales:string;materialCost:string|null;estimatedGrossMargin:string|null;priced:boolean;unpricedOperationIds:string[]}|null>(null);
 const [audit,setAudit]=useState<{ok:boolean;errors:Array<{category:string;name:string;stored:string;computed:string}>}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [closeMonth,setCloseMonth]=useState(today.slice(0,7));
 const [closingNote,setClosingNote]=useState('');
 const [periodResult,setPeriodResult]=useState('');
 async function closePeriod(){
  if(!confirm(closeMonth+' oyini yopasizmi? Shu oydagi yangi va tuzatish operatsiyalari bloklanadi.'))return;
  setBusy(true);setError('');
  try{const result=await api('/periods/close','POST',{month:closeMonth,note:closingNote,confirm:'DAVRNI YOPISHNI TASDIQLAYMAN'});setPeriodResult(result.month+' hisobot davri yopildi.');}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function load(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const range='?from='+from+'&to='+to;const [summary,valuation]=await Promise.all([api('/reports/summary'+range),api('/reports/gross-margin-estimate'+range)]);setReport(summary);setCost(valuation);}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function reconcile(){setBusy(true);setError('');try{setAudit(await api('/audit/reconciliation'));}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div className="panel"><h2>Moliyaviy harakatlar</h2><p className="muted">Jo‘natma summasi sotuv, dilerning bergan puli esa qarzni yopish hisoblanadi. Bu jadval foyda yoki zarar hisobotining o‘rnini bosmaydi.</p>
 <form className="reportfilters" onSubmit={load}><label>Dan<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Gacha<input type="date" required value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><button disabled={busy}>Hisoblash</button></form>
 {error&&<div className="notice error">{error}</div>}
 {report&&<><h3>Tanlangan davr: {report.operations} ta operatsiya</h3><div className="stats"><article><small>Jo‘natilgan mahsulot</small><strong>{Number(report.grossSales).toLocaleString('en-US')} so‘m</strong></article><article><small>Qaytarilgan mahsulot</small><strong>{Number(report.salesReturns).toLocaleString('en-US')} so‘m</strong></article><article><small>Qaytarishdan keyingi sotuv</small><strong>{Number(report.netSales).toLocaleString('en-US')} so‘m</strong></article></div><table><thead><tr><th>Yo‘nalish</th><th>Summa (UZS)</th></tr></thead><tbody>{Object.entries(report.totals).map(([k,v])=><tr key={k}><td>{labels[k]||k}</td><td>{Number(v).toLocaleString('en-US',{maximumFractionDigits:2})}</td></tr>)}</tbody></table></>}
 {cost&&<div className="panel" style={{boxShadow:'none',margin:'20px 0'}}><h3>Taxminiy xomashyo bo‘yicha marja</h3><p className="muted">Harakatlanuvchi o‘rtacha xarid tannarxi. Ishchi haqi, transport, qadoqlash va boshqa xarajatlar kirmagan. Rasmiy sof foyda emas.</p>{cost.priced?<div className="stats"><article><small>Jo‘natmalar</small><strong>{Number(cost.netSales).toLocaleString('en-US')} so‘m</strong></article><article><small>Xomashyo tannarxi</small><strong>{Number(cost.materialCost).toLocaleString('en-US')} so‘m</strong></article><article><small>Taxminiy yalpi marja</small><strong>{Number(cost.estimatedGrossMargin).toLocaleString('en-US')} so‘m</strong></article></div>:<div className="notice error">Ayrim mahsulotlarda xarid tannarxi ma’lum emas. To‘liq marjani hisoblash uchun boshlang‘ich narxlarni tasdiqlash kerak. Yetishmayotgan jo‘natmalar: {cost.unpricedOperationIds.length} ta.</div>}</div>}
 <div className="reportactions"><button type="button" className="ghost" onClick={()=>void downloadExcel()}>↓ Excel eksport</button><button type="button" className="ghost" disabled={busy} onClick={()=>void reconcile()}>Qoldiqlarni solishtirish</button></div>
 {audit&&<div className={audit.ok?'notice success':'notice error'}>{audit.ok?'Ombor, diler, yetkazib beruvchi va kassa hisoblari operatsiyalar jurnaliga mos':'Qoldiqlarda farq aniqlandi. Tafsilotlar quyida.'}</div>}
 <div className="panel" style={{marginTop:22,boxShadow:'none'}}><h3>Hisob davrini yopish — faqat rahbar</h3><p className="muted">Oyni yopishdan oldin Excel hisobot va qoldiq solishtirishni tekshiring. Yopilgan oyga yangi operatsiyalar yozilmaydi.</p>
 <div className="reportfilters"><label>Oy<input type="month" value={closeMonth} onChange={e=>setCloseMonth(e.target.value)}/></label><label>Izoh<input value={closingNote} onChange={e=>setClosingNote(e.target.value)} placeholder="Tekshirildi"/></label><button disabled={busy} type="button" onClick={()=>void closePeriod()}>Oyni yopish</button></div>{periodResult&&<div className="notice success">{periodResult}</div>}</div>
 {audit?.errors.map((x,i)=><div className="history" key={i}><b>{x.category} — {x.name}</b><small>Hisobda: {x.stored}; jurnalda: {x.computed}</small></div>)}
 </div>;
}
