import {useEffect,useState,type FormEvent} from 'react';
type Item={id:string;name:string;isRaw?:boolean;[key:string]:unknown};
type Props={api:(path:string,method?:string,payload?:unknown)=>Promise<any>;products:Item[];onSaved:()=>Promise<void>};
export function RecipePanel({api,products,onSaved}:Props){
 const [estimates,setEstimates]=useState<any[]>([]);
 const [list,setList]=useState<any[]>([]),[productId,setProductId]=useState(''),[output,setOutput]=useState('1');
 const [lines,setLines]=useState<Array<{materialId:string;quantity:string}>>([{materialId:'',quantity:''}]);
 const [error,setError]=useState(''),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{try{setList(await api('/recipes'));const result=await api('/costing/recipe-estimates').catch(()=>null);setEstimates(result?.recipes||[]);}catch(e){setError(String(e));}};
 useEffect(()=>{void refresh();},[]);
 const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');setOk('');
  try{await api('/recipes','POST',{productId,outputQuantity:output,ingredients:lines});
   setOk('Yangi retsept versiyasi saqlandi');await refresh();await onSaved();
  }catch(e){setError(String(e));}finally{setBusy(false);}
 };
 return <div className="columns"><form className="panel form" onSubmit={save}><h2>Yangi retsept versiyasi</h2>
 {error&&<div className="notice error">{error}</div>}{ok&&<div className="notice success">{ok}</div>}
 <label>Tayyor mahsulot<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Tanlang</option>{products.filter(x=>!x.isRaw).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
 <label>1 partiyadan chiqadigan mahsulot miqdori<input type="number" required min="0.0001" step="any" value={output} onChange={e=>setOutput(e.target.value)}/></label>
 <h3>Partiyaga kerakli xomashyo</h3>{lines.map((line,i)=><div className="twofields" key={i}><select required value={line.materialId} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,materialId:e.target.value}:x))}><option value="">Xomashyo</option>{products.filter(x=>x.isRaw).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input required type="number" step="any" min="0.0001" placeholder="Miqdor" value={line.quantity} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/><button type="button" className="ghost" onClick={()=>setLines(v=>v.filter((_,j)=>j!==i))}>×</button></div>)}
 <button type="button" className="ghost" onClick={()=>setLines(v=>[...v,{materialId:'',quantity:''}])}>+ Xomashyo qo‘shish</button><button disabled={busy}>Retseptni saqlash</button>
 <small className="muted">Yangi versiya eski retseptni tarixda qoldiradi. Ishlab chiqarishdagi sarf partiya soniga ko‘paytiriladi.</small></form>
 <div className="panel"><h2>Saqlangan retseptlar</h2><p className="muted">Taxminiy xomashyo qiymati oxirgi xarid narxlari asosida. Ishchi haqi, transport, qadoqlash va boshqa xarajatlar qo‘shilmagan — sof foyda emas.</p>{list.map(r=><div key={r.id} className="history"><span><b>{r.productName} — v{r.version}</b><small style={{display:'block'}}>{r.ingredients.map((i:any)=>i.materialName+': '+i.quantity).join(', ')}</small></span><small>{r.active?'Faol':'Arxiv'}</small></div>)}{estimates.length>0&&<><h2 style={{marginTop:28}}>Taxminiy xomashyo tannarxi</h2><table><thead><tr><th>Mahsulot</th><th>Birlikka xomashyo</th></tr></thead><tbody>{estimates.map(x=><tr key={x.recipeId}><td>{x.productName}</td><td>{x.complete?Number(x.unitRawCost).toLocaleString('en-US')+' so‘m':'Narx yetishmayapti: '+x.missingCosts.join(', ')}</td></tr>)}</tbody></table></>}</div></div>;
}
