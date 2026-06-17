import React from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsNew } from '@/contexts/WhatsNewContext.jsx';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

const NEWS_ITEMS = [
  {
    title: 'Ajustes de interpretación',
    text: 'Desde la gráfica puedes revisar y modificar manualmente el cálculo, el inicio fértil y la subida térmica.',
  },
  {
    title: 'Más control manual',
    text: 'Puedes volver a automático o ajustar manualmente cualquier fase de la interpretación.',
  },
  {
    title: 'Explicación de cada fase',
    text: 'Se ha añadido contenido explicativo para comprender mejor el motivo de cambio de fase en la interpretación.',
  },
  {
    title: 'Contacto y soporte',
    text: 'Ahora puedes enviar dudas, problemas o sugerencias desde Ajustes.',
  },
];

const WhatsNewModal = () => {
  const { user, loadingAuth, restoringSession } = useAuth();
  const { modalSeen, markModalSeen } = useWhatsNew();
  const location = useLocation();
  const isAuthRoute = location.pathname.startsWith('/auth');
  const open = Boolean(user) && !loadingAuth && !restoringSession && !isAuthRoute && !modalSeen;

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      markModalSeen();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        className="z-[80] w-[calc(100vw-2rem)] max-w-sm gap-0 rounded-3xl border-rose-100 bg-white p-0 shadow-xl sm:max-w-md"
        overlayClassName="z-[70] bg-black/25 backdrop-blur-sm"
      >
        <div className="relative px-5 pb-5 pt-6">
          <button
            type="button"
            onClick={markModalSeen}
            aria-label="Cerrar novedades"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-fertiliapp-fuerte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <DialogTitle className="pr-10 text-xl font-semibold leading-tight text-titulo">
            Novedades en FertiliApp
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-600">
            Hemos añadido mejoras para que tengas más control sobre la interpretación del ciclo.
          </DialogDescription>

          <div className="mt-5 space-y-4">
            {NEWS_ITEMS.map((item) => (
              <section key={item.title} className="space-y-1">
                <h3 className="text-sm font-semibold text-fertiliapp-fuerte">{item.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{item.text}</p>
              </section>
            ))}
          </div>

          <Button
            type="button"
            onClick={markModalSeen}
            className="mt-6 min-h-12 w-full rounded-2xl bg-fertiliapp-fuerte text-base font-semibold text-white hover:brightness-95"
          >
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsNewModal;
