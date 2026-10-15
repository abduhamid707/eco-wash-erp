// Offline queue persists immutable client commands; server remains authoritative.
type Pending = {key:string;body:{idempotencyKey:string;command:Record<string,string>};createdAt:number;ownerId:string;error?:string};
const dbName='eco-wash-pending-v1';
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const open=indexedDB.open(dbName,1);
 open.onupgradeneeded=()=>{open.result.createObjectStore('commands',{keyPath:'key'});};
 open.onsuccess=()=>resolve(open.result);
 open.onerror=()=>reject(open.error);
});}
async function store(mode:IDBTransactionMode){const d=await db();return {d,tx:d.transaction('commands',mode)};}
export async function addPending(key:string,body:Pending['body'],ownerId:string):Promise<void>{
 const {d,tx}=await store('readwrite');
 await new Promise<void>((resolve,reject)=>{const q=tx.objectStore('commands').put({key,body,ownerId,createdAt:Date.now()});q.onsuccess=()=>resolve();q.onerror=()=>reject(q.error);});d.close();
}
export async function listPending(ownerId?:string):Promise<Pending[]>{
 const {d,tx}=await store('readonly');
 const records=await new Promise<Pending[]>((resolve,reject)=>{const q=tx.objectStore('commands').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});d.close();
 return records.filter(x=>ownerId?x.ownerId===ownerId:true).sort((a,b)=>a.createdAt-b.createdAt);
}
export async function removePending(key:string):Promise<void>{
 const {d,tx}=await store('readwrite');
 await new Promise<void>((resolve,reject)=>{const q=tx.objectStore('commands').delete(key);q.onsuccess=()=>resolve();q.onerror=()=>reject(q.error);});d.close();
}
export async function markPendingError(key:string,error:string):Promise<void>{
 const {d,tx}=await store('readwrite');const st=tx.objectStore('commands');
 await new Promise<void>((resolve,reject)=>{const get=st.get(key);get.onsuccess=()=>{if(!get.result)return resolve();const put=st.put({...get.result,error});put.onsuccess=()=>resolve();put.onerror=()=>reject(put.error);};get.onerror=()=>reject(get.error);});d.close();
}
