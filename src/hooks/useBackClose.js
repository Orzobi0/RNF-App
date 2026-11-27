import { useEffect, useRef } from 'react';
import { isNativeAndroid } from '@/lib/androidRuntime';
import { backLayers, registerBackLayer } from '@/lib/backNavigation';

// One marker for the browser stack; Android never adds history entries.
let listening = false;
let removingMarker = false;
const marker = '__fertiliOverlay';
function pushMarker() {
  window.history.pushState({ ...window.history.state, [marker]: true }, '');
}
function popLayer() {
  if (removingMarker) {
    removingMarker = false;
    if (backLayers.length && !window.history.state?.[marker]) pushMarker();
    return;
  }
  if (backLayers.length && typeof document !== 'undefined' &&
      document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [role="listbox"]')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  } else {
    backLayers.at(-1)?.close();
  }
  setTimeout(() => { if (backLayers.length && !window.history.state?.[marker]) pushMarker(); }, 0);
}
export default function useBackClose(active, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const unregister = registerBackLayer(() => close.current?.());
    const native = isNativeAndroid();
    if (!native) {
      if (!listening) { listening = true; window.addEventListener('popstate', popLayer); }
      if (!window.history.state?.[marker]) pushMarker();
    }
    return () => {
      unregister();
      if (!native && !backLayers.length && window.history.state?.[marker]) {
        removingMarker = true;
        window.history.back();
      }
    };
  }, [active]);
}
