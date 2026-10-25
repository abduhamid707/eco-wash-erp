import {useEffect,useState,type FormEvent} from 'react';
type API=(path:string,method?:string,payload?:unknown)=>Promise<any>;
type User={id:string;name:string;login:string;role:string;active:boolean};
const roles:Record<string,string>={OWNER:'Rahbar',MANAGER:'Menejer',ATTENDANCE:'Davomatchi',WAREHOUSE:'Omborchi'};
export function UsersPanel({api}:{api:API}){
 const [users,setUsers]=useState<User[]>([]),[name,setName]=useState(''),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState('MANAGER'),[error,setError]=useState(''),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
 const reload=async()=>{try{setUsers(await api('/users'));}catch(e){setError(String(e));}};
 useEffect(()=>{void reload();},[]);
 const add=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');setOk('');try{await api('/users','POST',{name,login,password,role});setName('');setLogin('');setPassword('');setOk('Foydalanuvchi qo‘shildi');await reload();}catch(e){setError(String(e));}finally{setBusy(false);}};
 const toggle=async(user:User)=>{if(!confirm(user.name+' hisobini '+(user.active?'o‘chirasizmi?':'faollashtirasizmi?')))return;setBusy(true);setError('');try{await api('/users/'+user.id,'PATCH',{active:!user.active});await reload();}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <div className="columns"><form className="panel form" onSubmit={add}><h2>Yangi foydalanuvchi</h2><p className="muted">Faqat rahbar boshqa xodimga kirish huquqini berishi mumkin.</p>{error&&<div className="notice error">{error}</div>}{ok&&<div className="notice success">{ok}</div>}
 <label>Ism-sharif<input minLength={2} maxLength={120} required value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Login<input minLength={3} pattern="[a-zA-Z0-9_.-]+" required value={login} onChange={e=>setLogin(e.target.value)}/></label>
 <label>Parol (kamida 12 belgi)<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>Huquqi<select value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(roles).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <button disabled={busy}>Foydalanuvchi qo‘shish</button></form>
 <div className="panel"><h2>Tizim foydalanuvchilari</h2>{users.map(x=><div className="history" key={x.id}><span><b>{x.name}</b><small style={{display:'block'}}>{x.login} · {roles[x.role]||x.role}</small></span><button className="ghost" disabled={busy} onClick={()=>void toggle(x)}>{x.active?'Faolsizlantirish':'Faollashtirish'}</button></div>)}</div></div>;
}
