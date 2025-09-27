const CACHE_VERSION = '2025-09-27T15:11:51.589Z';
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
const BUILD_ASSETS = (["assets/ChartTooltip-086fab25.js","assets/DeletionDialog-8f61e9be.js","assets/OverlapWarningDialog-3f38b600.js","assets/badge-e36f7fd8.js","assets/computePeakStatuses-a8c393d1.js","assets/eye-61791957.js","assets/eye-off-b85355d3.js","assets/input-2a7ce825.js","assets/label-e033e1bb.js","assets/select-4e9e95be.js","assets/trash-2-f8d41441.js","assets/useCycleData-4efbc629.js","assets/index-a18e6b05.css","assets/index-24043ae7.js","assets/index.es-ed0e0bd7.js","assets/purify.es-2de9db7f.js","assets/html2canvas.esm-e0a7d97b.js","assets/ArchivedCyclesPage-47966f21.js","assets/AuthPage-aa27ad5a.js","assets/ChartPage-659a9c9a.js","assets/CycleDetailPage-0ba9d12c.js","assets/DashboardPage-1afa71ad.js","assets/RecordsPage-3ba03bcd.js","assets/SettingsPage-9536063a.js"] || []).map(
  (asset) => `${BASE_URL}${asset}`
);

self.addEventListener('install', event => {
  console.log('SW: Installing new version', CACHE_VERSION);
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll([...ASSETS, ...BUILD_ASSETS]))
      .then(() => {
        console.log('SW: Cache populated, skipping waiting');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  console.log('SW: Activating version', CACHE_VERSION);
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('SW: Deleting old cache', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => {
        console.log('SW: Claiming clients');
        return self.clients.claim();
      })
  );
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: Received SKIP_WAITING message');
    self.skipWaiting();
  }
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
