import {useState,type FormEvent} from 'react';
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;token:string};
type Preview={total:number;valid:number;invalid:number;problems:Array<{row:number;field:string;message:string}>;previewOnly:boolean};
const keys=['kind','code','name','region','unit','value','isRaw'];
export function ImportPanel({api,token}:Props){
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [paste,setPaste]=useState('');
 async function download(){
  setError('');try{const r=await fetch('/api/import/template.xlsx',{headers:{Authorization:'Bearer '+token}});
   if(!r.ok)throw new Error('Shablonni yuklashga ruxsat yo‘q');
   const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='eco-wash-import-template.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(String(e));}
 }
 async function check(e:FormEvent){e.preventDefault();setBusy(true);setError('');setPreview(null);
  try{
   const lines=paste.trim().split(/\r?\n/).filter(Boolean);
   if(lines.length<2)throw new Error('Excel jadvalidan sarlavha va kamida bitta qatorni nusxalang');
   const header=lines[0].split('\t').map(x=>x.trim());
   for(const k of keys)if(!header.includes(k))throw new Error('Majburiy ustun topilmadi: '+k);
   const rows=lines.slice(1).map(line=>{const vals=line.split('\t');return Object.fromEntries(keys.map(k=>[k,vals[header.indexOf(k)]?.trim()||'']));});
   setPreview(await api('/import/preview','POST',{rows}));
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 return <div className="panel"><h2>Eski Excel ma’lumotlarini tekshirish</h2>
 <p className="muted">Bu bo‘lim faqat importdan oldingi tekshiruv. Hech narsa bazaga ko‘chmaydi. Rahbar tasdiqlamaguncha real qoldiq o‘zgarmaydi.</p>
 <div className="reportactions"><button className="ghost" type="button" onClick={()=>void download()}>↓ Import uchun Excel shabloni</button></div>
 <form onSubmit={check} className="form" style={{maxWidth:'100%'}}><label>Excel shablonidagi satrlarni, sarlavhasi bilan, nusxalab shu yerga qo‘ying
 <textarea rows={9} required value={paste} onChange={e=>setPaste(e.target.value)} placeholder={'kind\tcode\tname\tregion\tunit\tvalue\tisRaw\nPRODUCT\tECO900\tEco Wash 900\t\tqop\t\tfalse'}/></label>
 <button disabled={busy}>{busy?'Tekshirilmoqda...':'Xatolarni tekshirish (bazaga yozmaydi)'}</button></form>
 {error&&<div className="notice error">{error}</div>}
 {preview&&<><div className="stats" style={{marginTop:18}}><article><small>Jami satr</small><strong>{preview.total}</strong></article><article><small>To‘g‘ri</small><strong>{preview.valid}</strong></article><article><small>Xatolik</small><strong>{preview.invalid}</strong></article></div>
 {preview.invalid===0?<div className="notice success">Format to‘g‘ri. Bu hali hisob-kitob ma’lumotlari rahbar tomonidan tasdiqlanganini anglatmaydi.</div>:<table><thead><tr><th>Satr</th><th>Ustun</th><th>Xato</th></tr></thead><tbody>{preview.problems.map((x,i)=><tr key={i}><td>{x.row}</td><td>{x.field}</td><td>{x.message}</td></tr>)}</tbody></table>}</>}
 </div>;
}
