import {useState,type FormEvent} from 'react';
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;token:string};
type Preview={total:number;valid:number;invalid:number;problems:Array<{row:number;field:string;message:string}>;previewOnly:boolean};
const keys=['kind','code','name','region','unit','value','isRaw'];
export function ImportPanel({api,token}:Props){
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [paste,setPaste]=useState('');
 const [rows,setRows]=useState<Array<Record<string,string>>>([]);
 const [approval,setApproval]=useState('');
 const [imported,setImported]=useState(false);
 async function download(){
  setError('');try{const r=await fetch('/api/import/template.xlsx',{headers:{Authorization:'Bearer '+token}});
   if(!r.ok)throw new Error('Shablonni yuklashga ruxsat yo‘q');
   const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='eco-wash-import-template.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(String(e));}
 }

 async function uploadFile(file:File){
  setBusy(true);setError('');setPreview(null);
  try{
   const form=new FormData();form.append('file',file);
   const response=await fetch('/api/import/parse-file',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
   const parsed=await response.json();
   if(!response.ok)throw new Error(parsed.error||'Faylni o‘qib bo‘lmadi');
   if(!parsed.rows.length)throw new Error('Faylda ma’lumot topilmadi');
   const result=await api('/import/preview','POST',{rows:parsed.rows});
   setPreview(result);setRows(parsed.rows);
   setPaste([keys.join('\t'),...parsed.rows.map((r:Record<string,string>)=>keys.map(k=>r[k]||'').join('\t'))].join('\n'));
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }

 async function commit(){
  if(!preview||preview.invalid!==0||rows.length!==preview.total||approval!=='ECO WASH IMPORTNI TASDIQLAYMAN')return;
  if(!confirm('Diqqat: haqiqiy boshlang‘ich hisoblarni bazaga yozasiz. Baza bo‘sh bo‘lishi kerak. Davom etasizmi?'))return;
  setBusy(true);setError('');
  try{
   const result=await api('/import/commit','POST',{importKey:crypto.randomUUID(),confirm:approval,rows});
   setImported(true);setPreview(null);setRows([]);setApproval('');setPaste('');
   alert('Import bazada saqlandi. Operatsiya ID: '+result.id);
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function check(e:FormEvent){e.preventDefault();setBusy(true);setError('');setPreview(null);
  try{
   const lines=paste.trim().split(/\r?\n/).filter(Boolean);
   if(lines.length<2)throw new Error('Excel jadvalidan sarlavha va kamida bitta qatorni nusxalang');
   const header=lines[0].split('\t').map(x=>x.trim());
   for(const k of keys)if(!header.includes(k))throw new Error('Majburiy ustun topilmadi: '+k);
   const rows=lines.slice(1).map(line=>{const vals=line.split('\t');return Object.fromEntries(keys.map(k=>[k,vals[header.indexOf(k)]?.trim()||'']));});
   const result=await api('/import/preview','POST',{rows});setPreview(result);setRows(rows);
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 return <div className="panel"><h2>Eski Excel ma’lumotlarini tekshirish</h2>
 <p className="muted">Bu bo‘lim faqat importdan oldingi tekshiruv. Hech narsa bazaga ko‘chmaydi. Rahbar tasdiqlamaguncha real qoldiq o‘zgarmaydi.</p>
 <div className="reportactions"><button className="ghost" type="button" onClick={()=>void download()}>↓ Import uchun Excel shabloni</button></div>
 <label style={{display:'block',margin:'18px 0'}}>To‘ldirilgan Excel faylni tanlang<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);}}/></label>
 <p className="muted">Yoki Excel ustunlarini quyidagi maydonga qo‘lda nusxalang.</p><form onSubmit={check} className="form" style={{maxWidth:'100%'}}><label>Excel shablonidagi satrlarni, sarlavhasi bilan, nusxalab shu yerga qo‘ying
 <textarea rows={9} required value={paste} onChange={e=>setPaste(e.target.value)} placeholder={'kind\tcode\tname\tregion\tunit\tvalue\tisRaw\nPRODUCT\tECO900\tEco Wash 900\t\tqop\t\tfalse'}/></label>
 <button disabled={busy}>{busy?'Tekshirilmoqda...':'Xatolarni tekshirish (bazaga yozmaydi)'}</button></form>
 {error&&<div className="notice error">{error}</div>}
 {imported&&<div className="notice success">Boshlang‘ich ma’lumotlar serverda tasdiqlandi.</div>}
 {preview&&<> <div className="stats" style={{marginTop:18}}><article><small>Jami satr</small><strong>{preview.total}</strong></article><article><small>To‘g‘ri</small><strong>{preview.valid}</strong></article><article><small>Xatolik</small><strong>{preview.invalid}</strong></article></div>
 {preview.invalid===0?<><div className="notice success">Format tekshiruvdan o‘tdi. Ma’lumotlar real ekanini rahbar mustaqil tasdiqlashi kerak.</div><label style={{display:'block',margin:'12px 0'}}>Tasdiqlash matnini kiriting: <b>ECO WASH IMPORTNI TASDIQLAYMAN</b><input value={approval} onChange={e=>setApproval(e.target.value)}/></label><button type="button" disabled={busy||approval!=='ECO WASH IMPORTNI TASDIQLAYMAN'} onClick={()=>void commit()}>Tasdiqlangan boshlang‘ich qoldiqlarni bazaga import qilish</button></>:<table><thead><tr><th>Satr</th><th>Ustun</th><th>Xato</th></tr></thead><tbody>{preview.problems.map((x,i)=><tr key={i}><td>{x.row}</td><td>{x.field}</td><td>{x.message}</td></tr>)}</tbody></table>}</>}
 </div>;
}
