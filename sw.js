const CACHE_VERSION = '2025-09-27T15:43:25.246Z';
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
const BUILD_ASSETS = (["assets/ChartTooltip-39d225ca.js","assets/DeletionDialog-67eaf41a.js","assets/OverlapWarningDialog-dbf432e8.js","assets/badge-9df465b8.js","assets/computePeakStatuses-d276643a.js","assets/eye-038575bd.js","assets/eye-off-d66a2167.js","assets/input-e93faeb5.js","assets/label-73ddbd29.js","assets/select-02b6d54e.js","assets/trash-2-f191a093.js","assets/useCycleData-de3e222e.js","assets/index-a18e6b05.css","assets/index-52f58b78.js","assets/index.es-9a8a4a61.js","assets/purify.es-2de9db7f.js","assets/html2canvas.esm-e0a7d97b.js","assets/ArchivedCyclesPage-3ae143ca.js","assets/AuthPage-34a7485b.js","assets/ChartPage-f533eefb.js","assets/CycleDetailPage-d4638589.js","assets/DashboardPage-4ac53390.js","assets/RecordsPage-825748b6.js","assets/SettingsPage-2bb3e8f7.js"] || []).map(
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
  
  if (requestUrl.pathname === '/sw.js') {
    return; // evitar cachear el propio service worker
  }
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
if (event.request.mode === 'navigate') {
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
          if (cachedResponse) {
            return cachedResponse;
          }

          const fallback = await caches.match(`${BASE_URL}index.html`);
          if (fallback) {
            return fallback;
          }

          return Response.error();
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
        return Response.error();
      }
    })()
  );
});
