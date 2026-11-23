import React, { useRef } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { Thermometer, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Separate provider: Bluetooth never changes the lifetime/position of other toasts.
export function BleSavedNotice({ notice, onDismiss, onViewDay }) {
  const touch = useRef(null);
  if (!notice) return null;
  const temperatureText =
  typeof notice.temperature === 'number'
    ? notice.temperature.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';

const dateMatch =
  typeof notice.isoDate === 'string'
    ? notice.isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    : null;

const formattedDate = dateMatch
  ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`
  : 'Fecha no disponible';
  return <Toast.Provider duration={Infinity} swipeDirection="right">
    <Toast.Root
  open
  duration={Infinity}
  onOpenChange={open => {
    if (!open) onDismiss();
  }}
  onTouchStart={event => {
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY };
  }}
  onTouchEnd={event => {
    const point = event.changedTouches[0];
    const start = touch.current;
    touch.current = null;

    if (
      start &&
      (
        Math.abs(point.clientX - start.x) > 70 ||
        (
          start.y - point.clientY > 70 &&
          Math.abs(point.clientX - start.x) < 40
        )
      )
    ) {
      onDismiss();
    }
  }}
  className="relative rounded-2xl border border-rose-200 bg-[#FFF8FA] p-3 pr-11 text-slate-700 shadow-[0_12px_28px_rgba(80,40,55,0.16)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]"
>
  <Toast.Title className="flex items-center gap-2 text-sm font-semibold text-titulo">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full  text-emerald-700">
      <Check className="h-4 w-4" aria-hidden="true" />
    </span>

    {notice.count === 1
      ? 'Temperatura incorporada'
      : `${notice.count} temperaturas incorporadas`}
  </Toast.Title>

  <Toast.Description className="mt-2 ml-2 text-sm text-slate-700">
    <span className="font-semibold text-fertiliapp-fuerte">
      {temperatureText} °C
    </span>
    {' · '}
    {formattedDate}
    {' · '}
    {notice.time || 'Hora no disponible'}
  </Toast.Description>

  <div className="mt-0 flex justify-start">
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 rounded-xl px-2 text-sm font-medium text-titulo hover:bg-rose-50"
      onClick={() => {
        onDismiss();
        onViewDay(notice.isoDate);
      }}
    >
      Ver día
    </Button>
  </div>

  <Toast.Close asChild>
    <button
      type="button"
      aria-label="Cerrar aviso"
      title="Cerrar aviso"
      className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-slate-500"
    >
      <X className="h-4 w-4" />
    </button>
  </Toast.Close>
</Toast.Root>
    <Toast.Viewport label="Temperaturas incorporadas" className="fixed right-3 z-[100] w-[calc(100%-24px)] max-w-sm outline-none" style={{ top: 'calc(var(--ble-safe-top, env(safe-area-inset-top, 0px)) + 12px)' }} />
  </Toast.Provider>;
}
