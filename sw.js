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
const BUILD_ASSETS = (["assets/ChartTooltip-2ac35f64.js","assets/DataEntryForm-8234e9d4.js","assets/DeletionDialog-5365865d.js","assets/EditCycleDatesDialog-c69612db.js","assets/badge-e000eb74.js","assets/dialog-9f479f94.js","assets/eye-16f81715.js","assets/eye-off-ea0ccfbb.js","assets/generatePlaceholders-26f1d0e5.js","assets/input-2e2fdcf0.js","assets/label-a061ee7d.js","assets/plus-8b4fb140.js","assets/useCycleData-270ed225.js","assets/index-ef978363.css","assets/index-1b0fe1a0.js","assets/ArchivedCyclesPage-c08bb647.js","assets/AuthPage-ce397967.js","assets/ChartPage-44594270.js","assets/CycleDetailPage-437bd311.js","assets/DashboardPage-6e773384.js","assets/RecordsPage-99acb02a.js","assets/SettingsPage-c9294d5b.js"] || []).map(
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
