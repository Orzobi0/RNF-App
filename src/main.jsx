import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { initGlobalErrorTracking, trackEvent, trackException } from '@/lib/analytics';
import '@/index.css';

// Canonical host: evita que alguien abra la app desde *.firebaseapp.com
// (sesión y caché van por ORIGEN; si cambia el host, parece que "pierde" login)
if (typeof window !== 'undefined') {
  const { hostname } = window.location;
  if (hostname.endsWith('.firebaseapp.com')) {
    const url = new URL(window.location.href);
    url.hostname = hostname.replace('.firebaseapp.com', '.web.app');
    window.location.replace(url.toString());
  }
}

const PRELOAD_ERROR_RELOAD_KEY = 'rnf-preload-reload-at';

window.addEventListener('vite:preloadError', (event) => {
  console.error('Vite preload error', event.payload);
  event.preventDefault();

  const lastReloadAt = Number(
    sessionStorage.getItem(PRELOAD_ERROR_RELOAD_KEY) || '0'
  );
  const now = Date.now();

  // Evita bucles de recarga
  if (now - lastReloadAt < 15000) {
    return;
  }

  sessionStorage.setItem(PRELOAD_ERROR_RELOAD_KEY, String(now));
  window.location.reload();
});

// `app_boot` se usa solo para salud técnica del arranque.
// No debe usarse como KPI de usuarios reales en el dashboard.
void trackEvent('inicio_app', {
  seccion_app: 'web',
  entorno: import.meta.env.MODE,
});

initGlobalErrorTracking();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;

  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then((registration) => {
      let isRefreshing = false;

      const activateWaitingWorker = () => {
        const worker = registration.waiting;
        if (!worker) return false;

        worker.postMessage({ type: 'SKIP_WAITING' });
        return true;
      };

      const tryUpdate = async () => {
        try {
          await registration.update();
          activateWaitingWorker();
        } catch {
          // ignore
        }
      };

      const handleControllerChange = () => {
        if (isRefreshing) return;
        isRefreshing = true;
        window.location.reload();
      };

      const handleUpdateFound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (
            installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            const waitingWorker = registration.waiting ?? installingWorker;
            waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      };

      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );

      registration.addEventListener('updatefound', handleUpdateFound);

      // Caso en el que ya había una versión esperando
      activateWaitingWorker();

      // Comprobación inicial
      void tryUpdate();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void tryUpdate();
        }
      });

      window.addEventListener('focus', () => {
        void tryUpdate();
      });

      window.addEventListener('pageshow', () => {
        void tryUpdate();
      });

      window.addEventListener('online', () => {
        void tryUpdate();
      });

      setInterval(() => {
        void tryUpdate();
      }, 10 * 60 * 1000);
    })
    .catch((error) => {
      console.error('Service worker registration failed:', error);

      void trackException(error, {
        error_type: 'service_worker_register',
      });
    });
}