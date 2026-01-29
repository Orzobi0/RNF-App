const BUILD_VERSION_MARKER = '${__DATE__}';
const CACHE_VERSION =
  BUILD_VERSION_MARKER !== '${__DATE__}'
    ? BUILD_VERSION_MARKER
    : `dev-${Date.now()}`; // Fallback en desarrollo cuando el marcador no fue reemplazado
const CACHE_NAME = `rnf-app-cache-${CACHE_VERSION}`;
const BASE_URL = self.registration.scope;
const ASSETS = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icon-192x192.png`,
  `${BASE_URL}icon-512x512-maskable.png`,
  `${BASE_URL}icon-512x512.png`,
  `${BASE_URL}apple-touch-icon.png`
];
const BUILD_ASSETS = (self.__BUILD_ASSETS || []).map(
  (asset) => `${BASE_URL}${asset}`
);
async function matchActiveCache(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

const INDEX_URL = `${BASE_URL}index.html`;
const OFFLINE_URL = `${BASE_URL}offline.html`;

async function putInCache(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}

function isBuildAsset(href) {
  return BUILD_ASSETS.includes(href);
}

async function cacheFirst(request) {
  const cached = await matchActiveCache(request);
  if (cached) return cached;
  const network = await fetch(request);
  if (network && network.ok) await putInCache(request, network.clone());
  return network;
}

async function getMissingBuildAsset() {
  if (!BUILD_ASSETS.length) return null;
  const cache = await caches.open(CACHE_NAME);
  for (const assetUrl of BUILD_ASSETS) {
    const match = await cache.match(assetUrl);
    if (!match) {
      return assetUrl;
    }
  }
  return null;
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
      // Cache-first para app shell (abre instantáneo) + update en segundo plano
        const cachedIndex = await matchActiveCache(INDEX_URL);
        if (cachedIndex) {
           // Si el caché del build está incompleto y no hay red, evitamos pantalla en negro.
          const missingAsset = await getMissingBuildAsset();
          if (missingAsset) {
            try {
              const response = await fetch(missingAsset, { cache: 'no-cache' });
              if (response && response.ok) {
                await putInCache(missingAsset, response.clone());
              } else {
                const offline = await matchActiveCache(OFFLINE_URL);
                if (offline) return offline;
              }
            } catch {
              const offline = await matchActiveCache(OFFLINE_URL);
              if (offline) return offline;
            }
          }
          event.waitUntil(
            (async () => {
              try {
                const networkIndex = await fetch(INDEX_URL, { cache: 'no-cache' });
                if (networkIndex && networkIndex.ok) {
                  await putInCache(INDEX_URL, networkIndex.clone());
                }
              } catch {}
            })()
          );
          return cachedIndex;
        }

        // Si todavía no hay index en caché (primer arranque), intenta red
        try {
          const networkIndex = await fetch(INDEX_URL, { cache: 'no-cache' });
          if (networkIndex && networkIndex.ok) await putInCache(INDEX_URL, networkIndex.clone());
          return networkIndex;
        } catch (error) {
          const offline = await matchActiveCache(OFFLINE_URL);
          if (offline) return offline;
          return new Response(
            '<h1>Sin conexión</h1><p>No se pudo cargar la aplicación.</p>',
            { headers: { 'Content-Type': 'text/html' }, status: 503 }
          );
        }
      })()
    );
    return;
  }

  // Para otros recursos (JS, CSS, etc.)
  event.respondWith(
    (async () => {
      // Build assets hasheados: cache-first (offline-friendly)
      if (isBuildAsset(requestUrl.href)) {
        try {
          return await cacheFirst(event.request);
        } catch (error) {
          const cached = await matchActiveCache(event.request);
          return cached || Response.error();
        }
      }

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