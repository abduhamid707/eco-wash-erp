import {useEffect,useState,type FormEvent} from 'react';
type Item={id:string;name:string;[key:string]:unknown};
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;accounts:Item[];onSaved:()=>Promise<void>};
export function StaffPanel({api,accounts,onSaved}:Props){
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7)),[people,setPeople]=useState<any[]>([]),[payroll,setPayroll]=useState<any[]>([]);
 const [name,setName]=useState(''),[position,setPosition]=useState(''),[salary,setSalary]=useState('');
 const [employeeId,setEmployeeId]=useState(''),[action,setAction]=useState('ATTENDANCE'),[workDate,setWorkDate]=useState(new Date().toISOString().slice(0,10)),[worked,setWorked]=useState(true),[accountId,setAccountId]=useState(''),[amount,setAmount]=useState('');
 const [error,setError]=useState(''),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{try{const [staff,pay]=await Promise.all([api('/employees'),api('/payroll?month='+month)]);setPeople(staff);setPayroll(pay);}catch(e){setError(String(e));}};
 useEffect(()=>{void refresh();},[month]);
 const run=async(task:()=>Promise<unknown>)=>{setBusy(true);setError('');setOk('');try{await task();setOk('Server tasdiqladi');await refresh();await onSaved();}catch(e){setError(String(e));}finally{setBusy(false);}};
 const add=async(e:FormEvent)=>{e.preventDefault();await run(async()=>{await api('/employees','POST',{name,position,monthlySalary:salary});setName('');setSalary('');setPosition('');});};
 const write=async(e:FormEvent)=>{e.preventDefault();await run(async()=>{
  if(action==='ATTENDANCE') await api('/attendance','POST',{employeeId,date:workDate,worked});
  else await api('/payroll/payments','POST',{idempotencyKey:crypto.randomUUID(),employeeId,accountId,month,type:action,amount});
 });};
 const fmt=(v:unknown)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});
 return <><div className="top"><p className="muted">Oylik avanslari, to‘lovlar va davomat</p><label>Oy <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>{error&&<div className="notice error">{error}</div>}{ok&&<div className="notice success">{ok}</div>}
 <div className="columns"><form className="panel form" onSubmit={add}><h2>Xodim qo‘shish</h2><label>Ism-sharif<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Lavozim<input value={position} onChange={e=>setPosition(e.target.value)}/></label><label>Oylik (UZS)<input type="number" required min="1" step=".01" value={salary} onChange={e=>setSalary(e.target.value)}/></label><button disabled={busy}>Saqlash</button></form>
 <form className="panel form" onSubmit={write}><h2>Davomat yoki to‘lov</h2><label>Xodim<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Tanlang</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Amal<select value={action} onChange={e=>setAction(e.target.value)}><option value="ATTENDANCE">Davomat</option><option value="ADVANCE">Avans</option><option value="SALARY">Oylik to‘lovi</option></select></label>
 {action==='ATTENDANCE'?<><label>Sana<input type="date" required value={workDate} onChange={e=>setWorkDate(e.target.value)}/></label><label>Ishladi?<select value={String(worked)} onChange={e=>setWorked(e.target.value==='true')}><option value="true">Ha</option><option value="false">Yo‘q</option></select></label></>:<><label>Qaysi hisobdan<select required value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Tanlang</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Summa<input type="number" min="1" step=".01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label></>}
 <button disabled={busy}>Tasdiqlash</button></form></div>
 <div className="panel" style={{marginTop:20}}><h2>{month} — ishchilar hisoboti</h2><table><thead><tr><th>Xodim</th><th>Oylik</th><th>To‘langan</th><th>Qolgan</th></tr></thead><tbody>{payroll.map(p=><tr key={p.id}><td>{p.name}</td><td>{fmt(p.monthlySalary)}</td><td>{fmt(p.paid)}</td><td>{fmt(p.remaining)}</td></tr>)}</tbody></table></div></>;
}
