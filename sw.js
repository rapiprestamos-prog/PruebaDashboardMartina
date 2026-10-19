/* Necesario para instalar el dashboard como app. No guarda nada: todo va siempre a GitHub (siempre la versión más reciente). */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",()=>{});
