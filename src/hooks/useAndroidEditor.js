import { useEffect, useState } from 'react';
import { isNativeAndroid } from '@/lib/androidRuntime';

export default function useAndroidEditor(active) {
  const android = isNativeAndroid();
  const [height, setHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  useEffect(() => {
    if (!android || !active) return;
    const update = () => setHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, [android, active]);
  return {
    android,
    style: android && active ? {
      top: 0, bottom: 'auto', height, maxHeight: height, borderRadius: 0,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      animation: 'none',
    } : {},
  };
}

export function allowDiscard(changed) {
  return !changed || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');
}
