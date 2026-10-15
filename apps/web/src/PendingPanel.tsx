import {useEffect,useState} from 'react';
import {listPending} from './offline';
type Entry={key:string;createdAt:number;error?:string;body:{idempotencyKey:string;command:Record<string,string>}};
export function PendingPanel({userId,sync,syncing,onChanged}:{userId:string;sync:()=>Promise<void>;syncing:boolean;onChanged:()=>Promise<void>}){
 const [items,setItems]=useState<Entry[]>([]),[error,setError]=useState('');
 const load=async()=>{try{setItems(userId?await listPending(userId):[]);await onChanged();}catch(e){setError(String(e));}};
 useEffect(()=>{void load();},[userId]);
 const syncNow=async()=>{setError('');try{await sync();await load();}catch(e){setError(String(e));}};
 return <div className="panel"><h2>Internetga ulanishni kutayotgan amallar</h2>
 <p className="muted">Bu yozuvlar qurilmada turibdi. Server tasdiqlamaguncha kassa, qarz va ombor qoldig‘iga kiritilmaydi. Operatsiya bekor qilinishi yoki avtomatik o‘chirib yuborilishi mumkin emas; muammoli yozuvlarni rahbar bilan tekshiring.</p>
 {error&&<div className="notice error">{error}</div>}
 <button className="ghost" disabled={syncing||!userId||!items.length} onClick={()=>void syncNow()}>{syncing?'Sinxronlanmoqda...':'Qayta yuborish'}</button>
 {!items.length?<div className="notice success" style={{marginTop:16}}>Bu akkauntda yuborilmagan amal yo‘q.</div>:<table><thead><tr><th>Yaratilgan</th><th>Amal</th><th>Holat</th></tr></thead><tbody>{items.map(x=><tr key={x.key}><td>{new Date(x.createdAt).toLocaleString('uz-UZ')}</td><td>{x.body.command.type}<small style={{display:'block'}}>{x.key}</small></td><td>{x.error?<span style={{color:'#b45309'}}>Tekshirish kerak: {x.error}</span>:'Server tasdig‘i kutilmoqda'}</td></tr>)}</tbody></table>}
 <p className="muted">Bir foydalanuvchining offline yozuvlari boshqa akkaunt orqali yuborilmaydi. Offline saqlash hali qurilma yo‘qolishiga qarshi maxsus shifrlash bilan himoyalanmagan.</p>
 </div>;
}
