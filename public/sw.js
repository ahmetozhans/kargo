const CACHE='kargo-shell-20260927-2';
const SHELL=['/','/index.html','/style.css','/app.js','/route-optimizer.js','/route-timing.js','/navigation.js','/sync-merge.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    try{const response=await fetch(request);if(response.ok&&response.type==='basic'){const cache=await caches.open(CACHE);cache.put(request,response.clone())}return response}
    catch{const cache=await caches.open(CACHE);return await cache.match(request)||request.mode==='navigate'&&await cache.match('/')||Response.error()}
  })());
});
