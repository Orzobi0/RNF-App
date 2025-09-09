import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const IOS_DISMISSED_KEY = 'iosInstallDismissed';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const dismissed = localStorage.getItem(IOS_DISMISSED_KEY);
    if (!('onbeforeinstallprompt' in window) && isIOS && !isStandalone && !dismissed) {
      setShowIOS(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const dismissIOS = () => {
    setShowIOS(false);
    localStorage.setItem(IOS_DISMISSED_KEY, '1');
  };

  if (showInstall) {
    return (
      <div className="fixed bottom-4 inset-x-0 flex justify-center z-50">
        <Button onClick={handleInstall}>Instalar aplicación</Button>
      </div>
    );
  }

  if (showIOS) {
    return (
      <div className="fixed bottom-0 inset-x-0 bg-white p-4 text-center border-t space-y-2 z-50">
        <p className="text-sm">Para instalar esta app, toca el botón Compartir y luego "Añadir a pantalla de inicio".</p>
        <Button variant="outline" onClick={dismissIOS}>Cerrar</Button>
      </div>
    );
  }

  return null;
}
