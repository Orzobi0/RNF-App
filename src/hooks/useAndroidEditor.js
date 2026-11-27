import { useCallback, useSyncExternalStore } from 'react';
import { isNativeAndroid } from '@/lib/androidRuntime';

function viewportHeight() {
  const height = window.innerHeight;
  return Number.isFinite(height) && height > 0
    ? height
    : window.visualViewport?.height ?? 0;
}

export default function useAndroidEditor(active) {
  const android = isNativeAndroid();
  const subscribe = useCallback((onResize) => {
    if (!android || !active) return () => {};
    const viewport = window.visualViewport;

window.addEventListener('resize', onResize);
viewport?.addEventListener('resize', onResize);

return () => {
  window.removeEventListener('resize', onResize);
  viewport?.removeEventListener('resize', onResize);
};
  }, [android, active]);
  // Read the current height on the opening render, not the last height seen
  // before closing. React also checks changes between render and subscription
  // (including autofocus in the Radix portal).
  const height = useSyncExternalStore(subscribe, viewportHeight);
  return {
    android,
    style: android && active ? {
      top: 0, bottom: 'auto', height, maxHeight: height, borderRadius: 0,
      display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      animation: 'none',
    } : {},
  };
}

export function allowDiscard(changed) {
  return !changed || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
}
