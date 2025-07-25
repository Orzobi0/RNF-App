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

    const handlePopState = () => {
      onClose();
    };

    // push dummy state so that back button closes the overlay
    window.history.pushState({ overlay: true }, "");
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // remove the dummy state if overlay was closed via UI
      if (window.history.state && window.history.state.overlay) {
        window.history.back();
      }
    };
  }, [active, onClose]);
}