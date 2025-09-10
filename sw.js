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
const BUILD_ASSETS = (["assets/ChartTooltip-c53a692f.js","assets/DataEntryForm-97090216.js","assets/DeletionDialog-eac599e8.js","assets/EditCycleDatesDialog-c63b5949.js","assets/dialog-4560ab56.js","assets/eye-8fe6b589.js","assets/eye-off-a2721236.js","assets/fertilitySymbols-c96635e4.js","assets/generatePlaceholders-53615b77.js","assets/input-d884c3cd.js","assets/label-03db48ed.js","assets/plus-3bdff0e2.js","assets/select-bff7c354.js","assets/trash-2-faaafb17.js","assets/useBackClose-737776a5.js","assets/useCycleData-758a573b.js","assets/index-ed8056f8.css","assets/index-f990749f.js","assets/ArchivedCyclesPage-7383f115.js","assets/AuthPage-eb8ff750.js","assets/ChartPage-1cc03e08.js","assets/CycleDetailPage-36d03ee9.js","assets/DashboardPage-592a95f9.js","assets/RecordsPage-315415ef.js","assets/SettingsPage-0e91bda8.js"] || []).map(
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
