import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const IOS_DISMISSED_KEY = 'iosInstallDismissed';

export default function InstallPrompt({
  className = '',
  buttonClassName = '',
  align = 'center',
  forceVisible = false,
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(Boolean(standalone));
    const dismissed = localStorage.getItem(IOS_DISMISSED_KEY);
    if (!('onbeforeinstallprompt' in window) && isIOS && !standalone && !dismissed) {
      setShowIOS(true);
    }

    if (!standalone) {
      setShowInstall(true);
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

  const shouldShowCTA = (!isStandalone && showInstall) || forceVisible;
  const isDisabled = !deferredPrompt;
  const showHelpText = isDisabled;

  if (showIOS) {
    return (
      <div className={cn('w-full rounded-2xl border bg-white/90 p-4 text-center shadow-sm space-y-2', className)}>
        <p className="text-sm text-slate-700">
          Para instalar esta app, toca el botón Compartir y luego "Añadir a pantalla de inicio".
        </p>
        <Button variant="outline" onClick={dismissIOS} className="rounded-xl">
          Cerrar
        </Button>
      </div>
    );
  }
  if (shouldShowCTA) {
    return (
      <div
        className={cn(
          'w-full',
          align === 'center' ? 'flex justify-center' : align === 'end' ? 'flex justify-end' : '',
          className,
        )}
      >
        <Button
          onClick={handleInstall}
          disabled={isDisabled}
          className={cn('rounded-3xl px-6 py-3 text-white', buttonClassName)}
        >
          Instalar aplicación
        </Button>

      </div>
    );
  }

  return null;
}
