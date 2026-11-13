const CACHE_NAME = "sgve-cepk-v70";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./demo.js", "./manifest.webmanifest", "./icon.svg", "./cepk-62.svg", "./mascote.svg", "./Kennedyto-CEPK-fundo-transparente.png", "./kennedyto-login.webp", "./kennedy-entrada.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => request.mode === "navigate" ? caches.match("./index.html") : Response.error());
  }));
});
