import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return undefined;
    }

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    let registrationRef;
    let updateFoundHandler;

    const handleNewWorker = (worker) => {
      if (!worker) {
        return;
      }

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(worker);
          setShowUpdate(true);
        }
      });
    };

    navigator.serviceWorker.ready.then((registration) => {
      registrationRef = registration;

      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdate(true);
      }

      updateFoundHandler = () => {
        handleNewWorker(registration.installing);
      };

      registration.addEventListener('updatefound', updateFoundHandler);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (registrationRef && updateFoundHandler) {
        registrationRef.removeEventListener('updatefound', updateFoundHandler);
      }
    };
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdate(false);
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
      <div className="w-full max-w-sm rounded-lg bg-secundario p-4 text-white shadow-lg">
        <p className="mb-3 text-sm">¡Nueva versión disponible!</p>
        <div className="flex items-center justify-end gap-2">
          <Button onClick={() => setShowUpdate(false)} variant="secondary">
            Después
          </Button>
          <Button onClick={handleUpdate} className="bg-white text-secundario hover:bg-white/90">
            Actualizar
          </Button>
        </div>
      </div>
    </div>
  );
}