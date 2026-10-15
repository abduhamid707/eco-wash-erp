import {useEffect,useState} from 'react';
type Trend={date:string;netSales:string;cashExpenses:string;productionBatches:number};
export function AnalyticsPanel({api,enabled}:{api:(path:string,method?:string,payload?:unknown)=>Promise<any>;enabled:boolean}){
 const [data,setData]=useState<Trend[]>([]),[period,setPeriod]=useState('30'),[error,setError]=useState('');
 useEffect(()=>{if(!enabled)return;api('/dashboard/trends?days='+period).then(v=>setData(v.series)).catch(e=>setError(String(e)));},[enabled,period]);
 if(!enabled)return null;
 const sales=data.reduce((v,x)=>v+Number(x.netSales),0),expenses=data.reduce((v,x)=>v+Number(x.cashExpenses),0);
 const max=Math.max(1,...data.map(x=>Number(x.netSales)),...data.map(x=>Number(x.cashExpenses)));
 const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:0});
 return <div className="panel" style={{marginBottom:20}}><div className="top"><div><h2>Sotuv va xarajat dinamikasi</h2><p className="muted">Sotuvdan qaytarilgan mahsulot ayrilgan. Xarajatlar faqat pul chiqimlarining tanlangan turlaridir; bu sof foyda emas.</p></div><select style={{width:135}} value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">7 kun</option><option value="30">30 kun</option><option value="90">90 kun</option></select></div>
 {error&&<div className="notice error">{error}</div>}
 <div className="reportactions"><span><b>{fmt(sales)} so‘m</b><small style={{display:'block'}} className="muted">Qaytarishdan keyingi sotuv</small></span><span><b>{fmt(expenses)} so‘m</b><small style={{display:'block'}} className="muted">Pul xarajatlari</small></span><span><b>{data.reduce((n,x)=>n+x.productionBatches,0)}</b><small style={{display:'block'}} className="muted">Ishlab chiqarish operatsiyalari</small></span></div>
 <div className="trend-chart" role="img" aria-label="Kunlik sotuv va xarajatlar diagrammasi">{data.map(x=><div className="trend-col" key={x.date} title={x.date+' — sotuv '+fmt(Number(x.netSales))+', xarajat '+fmt(Number(x.cashExpenses))}><div className="trend-bars"><div className="trend-sales" style={{height:Math.max(1,Math.max(0,Number(x.netSales))/max*100)+'%'}}/><div className="trend-costs" style={{height:Math.max(1,Math.max(0,Number(x.cashExpenses))/max*100)+'%'}}/></div></div>)}</div>
 <div className="trend-legend"><span><i className="trend-swatch trend-sales"/> Sotuv</span><span><i className="trend-swatch trend-costs"/> Xarajat</span></div>
 </div>;
}
