
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl, { 
      updateViaCache: 'none',
      scope: '/' 
    }).then((registration) => {
      // Forzar actualización cada vez
      registration.update();
      
      // Detectar cuando hay una nueva versión disponible
      registration.addEventListener('updatefound', () => {
        console.log('Nueva versión del SW encontrada');
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nueva versión disponible
            console.log('Nueva versión lista');
            if (confirm('Nueva versión disponible. ¿Recargar página?')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          }
        });
      });
    });
  });

  // Recargar cuando el SW toma control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
  