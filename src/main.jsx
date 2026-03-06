
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', import.meta.env.BASE_URL);

    // Si cambia el SW controlador, recargamos una sola vez
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

        // Al cargar
        tryUpdate();

        // Al volver a primer plano (iOS lo agradece muchísimo)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') tryUpdate();
        });

        // Al volver el foco a la ventana
        window.addEventListener('focus', tryUpdate);

        // Mientras esté abierta (cada 10 min)
        setInterval(tryUpdate, 10 * 60 * 1000);
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  });
}


