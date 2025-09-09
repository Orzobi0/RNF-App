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
const BUILD_ASSETS = (["assets/DataEntryForm-bc4dcd91.js","assets/DeletionDialog-3cd8d0d3.js","assets/EditCycleDatesDialog-55bbc622.js","assets/dialog-36bf1cb8.js","assets/eye-e05aaaa7.js","assets/eye-off-0d1eb0d4.js","assets/fertilitySymbols-d4cb4f69.js","assets/generatePlaceholders-e6ff5082.js","assets/input-94be8fdf.js","assets/label-9b8fb7c8.js","assets/pen-line-e19a7d86.js","assets/plus-b8564e46.js","assets/select-7a2ab852.js","assets/trash-2-b54579c4.js","assets/useBackClose-b856fdfe.js","assets/useCycleData-a0f29ea7.js","assets/index-33133492.css","assets/index-71f9831f.js","assets/ArchivedCyclesPage-f2ae9a90.js","assets/AuthPage-18e6e94a.js","assets/ChartPage-1ef43cc1.js","assets/CycleDetailPage-81039463.js","assets/DashboardPage-4e3a58e1.js","assets/RecordsPage-716f0ef7.js","assets/SettingsPage-723126a7.js"] || []).map(
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
