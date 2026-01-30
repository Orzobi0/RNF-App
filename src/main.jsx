
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

    navigator.serviceWorker
      .register(swUrl)
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  });
}


