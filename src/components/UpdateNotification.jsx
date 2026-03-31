import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [minimized, setMinimized] = useState(false);

  const shouldReloadRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return undefined;
    }

    let registrationRef = null;
    let currentInstallingWorker = null;

    const handleControllerChange = () => {
      if (!shouldReloadRef.current) return;
      window.location.reload();
    };

    const showUpdateUI = (worker) => {
      if (!worker) return;
      setWaitingWorker(worker);
      setShowUpdate(true);
      setMinimized(false);
    };

    const attachStateChange = (worker) => {
      if (!worker) return;

      currentInstallingWorker = worker;

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateUI(worker);
        }
      });
    };

    const checkWaitingWorker = async () => {
      const registration = await navigator.serviceWorker.ready;
      registrationRef = registration;

      if (registration.waiting) {
        showUpdateUI(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        attachStateChange(registration.installing);
      });
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.waiting) {
          showUpdateUI(registration.waiting);
        }
      } catch {
        // ignore
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    checkWaitingWorker();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (registrationRef) {
        registrationRef.onupdatefound = null;
      }

      currentInstallingWorker = null;
    };
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    shouldReloadRef.current = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  const handleLater = () => {
    setShowUpdate(false);
    setMinimized(true);
  };

  if (!showUpdate && !minimized) {
    return null;
  }

  if (minimized && waitingWorker) {
    return (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
        <Button
  onClick={() => {
    setShowUpdate(true);
    setMinimized(false);
  }}
  className="bg-secundario text-white font-semibold hover:bg-secundario/90"
>
  Actualización disponible
</Button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-secundario p-4 text-white shadow-lg">
        <p className="mb-3 text-sm font-semibold">
          Hay una nueva versión de la app.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleLater} variant="secondary">
            Más tarde
          </Button>
          <Button onClick={handleUpdate} className="bg-white text-secundario-fuerte hover:bg-white/90">
            Actualizar
          </Button>
        </div>
      </div>
    </div>
  );
}