const CACHE_VERSION = `v${Date.now()}`; // Versión más confiable
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
const BUILD_ASSETS = (["assets/ChartTooltip-e75c591f.js","assets/DeletionDialog-7bd1c78b.js","assets/OverlapWarningDialog-991f9ff1.js","assets/badge-5e659d9f.js","assets/computePeakStatuses-661e63be.js","assets/eye-6935ae29.js","assets/eye-off-c72a7d9f.js","assets/input-80776554.js","assets/label-219a7c01.js","assets/select-676b9547.js","assets/trash-2-be84491f.js","assets/useCycleData-a4d1add2.js","assets/index-a18e6b05.css","assets/index-5f6b7abb.js","assets/index.es-cc8b98f6.js","assets/purify.es-2de9db7f.js","assets/html2canvas.esm-e0a7d97b.js","assets/ArchivedCyclesPage-d8bf8d27.js","assets/AuthPage-7b045051.js","assets/ChartPage-1ce1d6ab.js","assets/CycleDetailPage-dbba4e70.js","assets/DashboardPage-5bf3584d.js","assets/RecordsPage-2ce107c0.js","assets/SettingsPage-8b7e29b9.js"] || []).map(
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
  // Nuevo: Limpiar cache cuando se solicite
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('SW: Clearing all caches');
    event.waitUntil(
      caches.keys().then(keys => 
        Promise.all(keys.map(key => caches.delete(key)))
      )
    );
  }
});

// Función para detectar si es una recarga forzada
function isForcedReload(request) {
  return request.cache === 'reload' || 
         request.headers.get('cache-control') === 'no-cache';
}

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  
  if (requestUrl.pathname === '/sw.js') {
    return;
  }

  // Para recursos de iconos
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
        // Si es recarga forzada, ir directo a la red
        if (isForcedReload(event.request)) {
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
        }

        // Network-first para iconos
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

  // Para navegación (index.html, rutas SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Si es recarga forzada, ir directo a la red
        if (isForcedReload(event.request)) {
          console.log('SW: Forced reload detected, bypassing cache');
          try {
            const networkResponse = await fetch(event.request);
            if (networkResponse && networkResponse.ok) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          } catch (error) {
            console.log('SW: Network failed on forced reload, falling back to cache');
            const fallback = await caches.match(`${BASE_URL}index.html`);
            return fallback || Response.error();
          }
        }

        // Network-first strategy para navegación normal
        try {
          const networkResponse = await fetch(event.request, {
            cache: 'no-cache' // Forzar verificación del servidor
          });
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.log('SW: Network failed, trying cache');
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

  // Para otros recursos (JS, CSS, etc.)
  event.respondWith(
    (async () => {
      // Si es recarga forzada, ir directo a la red
      if (isForcedReload(event.request)) {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || Response.error();
        }
      }

      // Network-first para recursos críticos
      try {
        const networkResponse = await fetch(event.request, {
          cache: 'no-cache'
        });
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
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
});