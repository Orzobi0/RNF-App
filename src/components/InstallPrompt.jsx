import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const IOS_DISMISSED_KEY = 'iosInstallDismissed';
const FALLBACK_DELAY_MS = 2500;

function logInstallEvent(eventName, extra = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, extra);
      return;
    }

    if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...extra });
      return;
    }

    console.info('[install]', eventName, extra);
  } catch {
    // no hacemos nada si falla el logging
  }
}

function getManualInstallText() {
  return 'Abre el menú del navegador y toca "Instalar aplicación" o "Añadir a pantalla de inicio".';
}

export default function InstallPrompt({
  className = '',
  buttonClassName = '',
  align = 'center',
  forceVisible = false,
}) {
  const deferredPromptRef = useRef(null);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canNativePrompt, setCanNativePrompt] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    setIsStandalone(Boolean(standalone));

    const dismissed = localStorage.getItem(IOS_DISMISSED_KEY);

    if (isIOS && !standalone && !dismissed) {
      setShowIOS(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();

      deferredPromptRef.current = e;
      setDeferredPrompt(e);
      setCanNativePrompt(true);
      setShowManualHelp(false);

      logInstallEvent('install_native_available', {
        platform: 'web',
        ua: window.navigator.userAgent,
      });
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      setCanNativePrompt(false);
      setShowManualHelp(false);
      setShowIOS(false);

      logInstallEvent('app_installed', {
        platform: 'web',
        ua: window.navigator.userAgent,
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    let fallbackTimer;

    if (!standalone && !isIOS) {
      fallbackTimer = window.setTimeout(() => {
        if (!deferredPromptRef.current) {
          setShowManualHelp(true);

          logInstallEvent('install_manual_shown', {
            reason: 'beforeinstallprompt_not_received',
            ua: window.navigator.userAgent,
          });
        }
      }, FALLBACK_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);

      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = deferredPromptRef.current;

    if (!promptEvent) return;

    logInstallEvent('install_native_clicked', {
      ua: window.navigator.userAgent,
    });

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      logInstallEvent('install_native_result', {
        outcome: choice?.outcome || 'unknown',
        ua: window.navigator.userAgent,
      });

      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      setCanNativePrompt(false);

      if (choice?.outcome !== 'accepted') {
        setShowManualHelp(true);
      }
    } catch (error) {
      console.error('Install prompt failed:', error);

      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      setCanNativePrompt(false);
      setShowManualHelp(true);

      logInstallEvent('install_native_error', {
        message: error?.message || 'unknown_error',
        ua: window.navigator.userAgent,
      });
    }
  };

  const dismissIOS = () => {
    setShowIOS(false);
    localStorage.setItem(IOS_DISMISSED_KEY, '1');
  };

  const shouldShowNativeButton = !isStandalone && canNativePrompt && !!deferredPrompt;
  const shouldShowManualBlock = !isStandalone && (showManualHelp || (forceVisible && !shouldShowNativeButton));

  if (showIOS) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border bg-white/90 p-4 text-center shadow-sm space-y-2',
          className
        )}
      >
        <p className="text-sm text-slate-700">
          Para instalar esta app, toca el botón Compartir y luego "Añadir a pantalla de inicio".
        </p>
        <Button variant="outline" onClick={dismissIOS} className="rounded-xl">
          Cerrar
        </Button>
      </div>
    );
  }

  if (!shouldShowNativeButton && !shouldShowManualBlock) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full',
        align === 'center' ? 'flex justify-center' : align === 'end' ? 'flex justify-end' : '',
        className
      )}
    >
      {shouldShowNativeButton ? (
        <Button
          onClick={handleInstall}
          className={cn('rounded-3xl px-6 py-3 text-white', buttonClassName)}
        >
          Instalar aplicación
        </Button>
      ) : (
        <div
          className={cn(
            'w-full max-w-md rounded-2xl border bg-white/90 p-4 text-center shadow-sm space-y-2'
          )}
        >
          <p className="text-sm text-slate-700">{getManualInstallText()}</p>
        </div>
      )}
    </div>
  );
}