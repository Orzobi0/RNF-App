const CACHE_NAME = 'rnf-app-cache-v1';
const BASE_URL = self.registration.scope;
const ASSETS = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icon-192x192.png`,
  `${BASE_URL}icon-512x512.png`,
  `${BASE_URL}icon-512x512-maskable.png`,
  `${BASE_URL}apple-touch-icon-180x180.png`
];
// Assets generated during the build step will be injected into this array.
const BUILD_ASSETS = (self.__BUILD_ASSETS || []).map(
  (asset) => `${BASE_URL}${asset}`
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...ASSETS, ...BUILD_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
    if (
      event.request.method !== 'GET' ||
      !event.request.url.startsWith(self.location.origin)
    ) {
    return;   // ignorar extensiones u otros esquemas
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, responseClone)
          );
        }
        return response;
      }).catch(() => caches.match(`${BASE_URL}index.html`));
    })
  );
});
