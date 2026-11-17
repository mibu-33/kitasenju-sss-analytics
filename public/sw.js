const CACHE='sss-ui-v12-suika';
const ASSETS=['./','./index.html','./floor-map.html','./structural-floor-map.html','./sss-unified-ui.js','./sss-unified-ui.css','./sss-suika.js','./sss-suika.css','./reference/suika_rainbow_2026_11.json','./extensions.js','./color-areas.js','./island-picks.js','./roundtable.js','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('/data/')||e.request.url.includes('/reference/'))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
