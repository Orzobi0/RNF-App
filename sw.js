const BUILD_VERSION_MARKER = '2025-12-10T22:03:32.802Z';
const CACHE_VERSION =
  BUILD_VERSION_MARKER !== '${__DATE__}'
    ? BUILD_VERSION_MARKER
    : `dev-${Date.now()}`; // Fallback en desarrollo cuando el marcador no fue reemplazado
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
const BUILD_ASSETS = (["assets/DeletionDialog-31da8265.js","assets/InstallPrompt-f1214dae.js","assets/NewCycleDialog-c52b1f5b.js","assets/OverlapWarningDialog-038e0dd4.js","assets/arrow-left-da98c05b.js","assets/badge-4c7d2230.js","assets/checkbox-2e1f35be.js","assets/computePeakStatuses-8ec0bab9.js","assets/eye-fe5b932b.js","assets/input-c95d25ec.js","assets/label-270ed458.js","assets/useCycleData-9f76d19f.js","assets/useFertilityChart-b6d45542.js","assets/index-c2dc2ccf.css","assets/index-2f41c8cd.js","assets/index.es-b7ec6044.js","assets/purify.es-2de9db7f.js","assets/html2canvas.esm-e0a7d97b.js","assets/ArchivedCyclesPage-e14ac466.js","assets/AuthPage-6e8391f4.js","assets/ChartPage-d29ed2cd.js","assets/CycleDetailPage-f27c93da.js","assets/DashboardPage-43ecb127.js","assets/RecordsPage-689fc63f.js","assets/SettingsPage-7ea0d73a.js"] || []).map(
  (asset) => `${BASE_URL}${asset}`
);
async function matchActiveCache(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

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
            const cachedResponse = await matchActiveCache(event.request);
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
          const cachedResponse = await matchActiveCache(event.request);
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
            const fallback = await matchActiveCache(`${BASE_URL}index.html`);
            if (fallback) return fallback;

          return new Response(
            '<h1>Sin conexión</h1><p>No se pudo cargar la aplicación.</p>',
            {
              headers: { 'Content-Type': 'text/html' },
              status: 503,
            }
          );

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
          const cachedResponse = await matchActiveCache(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          const fallback = await matchActiveCache(`${BASE_URL}index.html`);
          if (fallback) {
            return fallback;
          }

          return new Response(
          '<h1>Sin conexión</h1><p>No se pudo cargar la aplicación.</p>',
          {
            headers: { 'Content-Type': 'text/html' },
            status: 503,
          }
        );

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
          const cachedResponse = await matchActiveCache(event.request);
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
        const cachedResponse = await matchActiveCache(event.request);
        return cachedResponse || Response.error();
      }
    })()
  );
});