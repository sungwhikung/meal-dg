// 대건밀 서비스 워커: 항상 최신 내용을 먼저 받고, 인터넷이 안 될 때만 저장해 둔 것을 보여 준다
const CACHE = "daegeon-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheable = url.origin === self.location.origin || url.hostname === "cdn.jsdelivr.net";
  if (request.method !== "GET" || !cacheable) return;

  // meals.json?v=123 처럼 붙는 캐시 방지용 값은 빼고 저장한다
  const key = url.origin === self.location.origin ? url.origin + url.pathname : request.url;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(key, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(key)) || Response.error())
  );
});
