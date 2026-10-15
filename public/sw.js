const CACHE='sss-ui-v3';
const ASSETS=['./','./index.html','./extensions.js','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET' || e.request.url.includes('/data/'))return; // Data are network-only to avoid stale wins being displayed.
 e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
