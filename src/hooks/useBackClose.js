import { useEffect } from 'react';

/**
 * Allows closing an overlay with the browser/OS back button.
 * When `active` is true a history entry is pushed so that a
 * native back action triggers `onClose` instead of navigating
 * away from the app.
 */
export default function useBackClose(active, onClose) {
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
      // ✅ Si al hacer "back" el state nuevo ES nuestro overlay,
      // significa que se ha cerrado un overlay hijo (o se ha vuelto a nuestro dummy state).
      // NO cierres este overlay.
      if (event?.state?.overlay === id) {
        return;
      }

      dismissedByPop = true;
      onClose();
    };

    // push dummy state so that back button closes the overlay
    window.history.pushState({ overlay: id }, "");
    window.addEventListener("popstate", handlePopState);
    let ignore = true;
    const timeout = setTimeout(() => {
      ignore = false;
    }, 0);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("popstate", handlePopState);
      // remove the dummy state if overlay was closed via UI
      if (ignore || dismissedByPop) return;
      if (window.history.state && window.history.state.overlay === id) {
        window.history.back();
      }
    };
  }, [active, onClose]);
}