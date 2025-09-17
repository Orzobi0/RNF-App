const CACHE_NAME = 'rnf-app-cache-v1';
const BASE_URL = self.registration.scope;
const ASSETS = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icon-192x192.png`,
  `${BASE_URL}icon-512x512.png`
];
// Assets generated during the build step will be injected into this array.
const BUILD_ASSETS = (["assets/ChartTooltip-6a801a66.js","assets/DataEntryForm-99bdedea.js","assets/DeletionDialog-26852e1b.js","assets/EditCycleDatesDialog-c0218425.js","assets/badge-97c5a111.js","assets/dialog-2828cd6f.js","assets/eye-153cd699.js","assets/eye-off-b1122abf.js","assets/generatePlaceholders-ff84f052.js","assets/input-2b285a94.js","assets/label-3b80786f.js","assets/plus-e21e75d4.js","assets/useCycleData-4dcbf14b.js","assets/index-c797be08.css","assets/index-b896ef43.js","assets/ArchivedCyclesPage-a48c3de0.js","assets/AuthPage-157a3cc4.js","assets/ChartPage-3f0c00c2.js","assets/CycleDetailPage-37815bd2.js","assets/DashboardPage-ea45302c.js","assets/RecordsPage-81f65016.js","assets/SettingsPage-73a34e38.js"] || []).map(
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
