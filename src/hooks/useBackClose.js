import { useEffect, useRef } from 'react';

/**
 * Allows closing an overlay with the browser/OS back button.
 * When `active` is true a history entry is pushed so that a
 * native back action triggers `onClose` instead of navigating
 * away from the app.
 */
export default function useBackClose(active, onClose) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const id =
      typeof window !== 'undefined' &&
      window.crypto &&
      typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    let dismissedByPop = false;

    const handlePopState = (event) => {
      // Si el nuevo state sigue siendo este overlay, no cerramos.
      // Esto evita cierres incorrectos con overlays anidados.
      if (event?.state?.overlay === id) {
        return;
      }

      dismissedByPop = true;
      onCloseRef.current?.();
    };

    window.history.pushState({ overlay: id }, '');
    window.addEventListener('popstate', handlePopState);

    let ignore = true;
    const timeout = setTimeout(() => {
      ignore = false;
    }, 0);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('popstate', handlePopState);

      // Si se cerró por gesto atrás, no hay que limpiar otra vez.
      if (ignore || dismissedByPop) return;

      // Si el overlay se cerró desde la UI, quitamos la entrada dummy.
      if (window.history.state && window.history.state.overlay === id) {
        window.history.back();
      }
    };
  }, [active]);
}