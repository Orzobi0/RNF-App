const CACHE_VERSION = '2025-09-24T07:27:30.869Z';
const CACHE_NAME = `rnf-app-cache-${CACHE_VERSION}`;
const BASE_URL = self.registration.scope;
const ASSETS = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icon-192x192.png`,
  `${BASE_URL}icon-512x512-maskable.png`,
  `${BASE_URL}icon-512x512.png`,
  `${BASE_URL}apple-touch-icon.png`
];
// Assets generated during the build step will be injected into this array.
const BUILD_ASSETS = (["assets/ChartTooltip-5350e5f6.js","assets/DataEntryForm-99673c61.js","assets/DeletionDialog-1303d971.js","assets/OverlapWarningDialog-7190f3a2.js","assets/badge-fc139165.js","assets/dialog-9607b487.js","assets/eye-67758e41.js","assets/eye-off-1c06221e.js","assets/input-235c5ced.js","assets/label-0ecf343f.js","assets/plus-1f07c869.js","assets/useCycleData-af0f9bf4.js","assets/index-d9964085.css","assets/index-752021ba.js","assets/ArchivedCyclesPage-a5d2d81d.js","assets/AuthPage-f6c2c8fa.js","assets/ChartPage-4342ff1a.js","assets/CycleDetailPage-ff26e289.js","assets/DashboardPage-87b15230.js","assets/RecordsPage-01e062cc.js","assets/SettingsPage-01be1fad.js"] || []).map(
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
    return; // ignorar extensiones u otros esquemas
  }

  const requestUrl = new URL(event.request.url);
  const isIconRequest =
    event.request.destination === 'image' &&
    [
      `${BASE_URL}icon-192x192.png`,
      `${BASE_URL}icon-512x512.png`,
      `${BASE_URL}icon-512x512-maskable.png`,
      `${BASE_URL}apple-touch-icon.png`
    ].includes(requestUrl.href);

  if (isIconRequest) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match(`${BASE_URL}index.html`);
          if (fallback) {
            return fallback;
          }
        }
        return Response.error();
      }
    })()
  );
});
