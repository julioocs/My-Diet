const CACHE='ironhybrid-firebase-v3-1';
const LOCAL=['./','./index.html','./styles.css','./app.js','./firebase-init.js','./firebase-config.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(LOCAL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(resp=>{
    if(new URL(e.request.url).origin===location.origin){
      const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
    }
    return resp;
  })));
});
