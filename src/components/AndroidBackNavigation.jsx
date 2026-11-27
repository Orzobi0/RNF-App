import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { isNativeAndroid } from '@/lib/androidRuntime';
import { androidBackDestination, backLayers } from '@/lib/backNavigation';
import { toast } from '@/components/ui/use-toast';

export default function AndroidBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useRef({ location, navigate });
  current.current = { location, navigate };
  const lastBack = useRef(0);
  useEffect(() => { lastBack.current = 0; }, [location.pathname]);
  useEffect(() => {
    if (!isNativeAndroid() || !Capacitor.isPluginAvailable('App')) return;
    let cancelled = false;
    let listener;
    let fullHeight = window.innerHeight;
    const resize = () => { fullHeight = Math.max(fullHeight, window.innerHeight); };
    const rotate = () => { fullHeight = window.innerHeight; lastBack.current = 0; };
    const focus = () => { lastBack.current = 0; };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', rotate);
    window.addEventListener('focusin', focus);
    const setup = async () => {
      try {
        await App.getInfo(); // Check the actual bridge before relying on App (BLE-11).
        if (cancelled) return;
        listener = await App.addListener('backButton', async () => {
          // IME normally consumes Back before App; guard WebViews delivering it early.
          const height = window.visualViewport?.height ?? window.innerHeight;
          if (fullHeight - height > 120 && document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
            lastBack.current = 0;
            document.activeElement.blur();
            return;
          }
          // Radix owns the order of its dialogs, menus, selects and popovers.
          if (document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [role="listbox"]')) {
            lastBack.current = 0;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            return;
          }
          if (backLayers.length) { lastBack.current = 0; backLayers.at(-1).close(); return; }
          const destination = androidBackDestination(current.current.location.pathname);
          if (destination) { current.current.navigate(destination, { replace: true }); return; }
          if (lastBack.current && Date.now() - lastBack.current < 3000) {
            lastBack.current = 0;
            try { await App.minimizeApp(); } catch { toast({ title: 'No se pudo minimizar la aplicación' }); }
          } else {
            lastBack.current = Date.now();
            toast({ title: 'Pulsa otra vez para salir', duration: 3000 });
          }
        });
        if (cancelled) await listener.remove();
      } catch { console.warn('Navegación Android: plugin App no disponible.'); }
    };
    void setup();
    return () => {
      cancelled = true;
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', rotate);
      window.removeEventListener('focusin', focus);
      void listener?.remove();
    };
  }, []);
  return null;
}
