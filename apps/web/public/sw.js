const CACHE='eco-wash-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/index.html'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin||new URL(request.url).pathname.startsWith('/api/'))return;
 event.respondWith(fetch(request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(request,clone));}return response;}).catch(()=>caches.match(request).then(r=>r||caches.match('/index.html'))));
});
