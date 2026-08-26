const CACHE_NAME=__CACHE_NAME__;
const APP_VERSION=__APP_VERSION__;
const PRECACHE=__PRECACHE__;
const CACHE_PREFIX="old-heroes-pwa-";

const notifyClients=async(message)=>{
  const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clients) client.postMessage(message);
};

self.addEventListener("install",(event)=>{
  event.waitUntil((async()=>{
    try {
      const cache=await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
      if(!self.registration.active) await self.skipWaiting();
    } catch(error) {
      await notifyClients({type:"PWA_CACHE_ERROR",message:String(error)});
      throw error;
    }
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter((name)=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map((name)=>caches.delete(name)));
    await self.clients.claim();
    await notifyClients({type:"PWA_CACHE_READY",version:APP_VERSION});
  })());
});

self.addEventListener("message",(event)=>{
  if(event.data?.type==="PWA_ACTIVATE_UPDATE") self.skipWaiting();
  if(event.data?.type==="PWA_QUERY_STATUS") event.source?.postMessage({type:"PWA_CACHE_READY",version:APP_VERSION});
  if(event.data?.type==="PWA_CLEAR_CACHE") {
    event.waitUntil(caches.keys().then((names)=>Promise.all(names.filter((name)=>name.startsWith(CACHE_PREFIX)).map((name)=>caches.delete(name)))));
  }
});

self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin) return;
  if(event.request.mode==="navigate") {
    event.respondWith(caches.match("./index.html").then((cached)=>cached||fetch(event.request).catch(()=>caches.match("./recovery.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached)=>cached||fetch(event.request)));
});
