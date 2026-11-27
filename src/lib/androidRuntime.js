import { Capacitor } from '@capacitor/core';

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function classifyRuntime(capacitor, origin) {
  if (!capacitor?.isNativePlatform?.() || capacitor.getPlatform?.() !== 'android') return 'web';
  // Match the local server used by this project's Capacitor configuration.
  return ['http://localhost', 'https://localhost'].includes(origin) ? 'android-embedded' : 'android-remote';
}

export const isEmbeddedAndroid = () => classifyRuntime(Capacitor,
  typeof window === 'undefined' ? '' : window.location.origin) === 'android-embedded';

export function authActionUrl(path, embedded = isEmbeddedAndroid(),
  environment = import.meta.env.VITE_APP_ENV, origin = window.location.origin) {
  if (!embedded) return `${origin}${path}`;
  if (environment !== 'staging') throw new Error('Embedded authentication is only configured for Staging');
  return `https://fertiliapp-staging.web.app${path}`;
}

// Remove only this app's old local worker. No cache/IndexedDB deletion or reload.
// Existing controlled documents release it when the WebView is closed.
export async function retireEmbeddedServiceWorker(serviceWorker, origin) {
  if (!serviceWorker) return;
  for (const registration of await serviceWorker.getRegistrations()) {
    const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
    if (registration.scope === `${origin}/` && workers.length &&
        workers.every(worker => worker.scriptURL === `${origin}/sw.js`)) {
      await registration.unregister();
    }
  }
}
