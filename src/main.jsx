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

void trackEvent('app_boot', {
  app_section: 'web',
  env: import.meta.env.MODE,
});

initGlobalErrorTracking();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then((registration) => {
      const tryUpdate = () => registration.update().catch(() => {});

      tryUpdate();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryUpdate();
      });

      window.addEventListener('focus', tryUpdate);

      setInterval(tryUpdate, 10 * 60 * 1000);
    })
    .catch((error) => {
      console.error('Service worker registration failed:', error);

      void trackException(error, {
        error_type: 'service_worker_register',
      });
    });
}