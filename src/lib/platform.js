export const isIOSWebKit = () => {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isIOSDevice = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  const hasCapacitor = typeof window !== 'undefined' && Boolean(window?.Capacitor);

  return isIOSDevice && (isWebKit || hasCapacitor);
};
