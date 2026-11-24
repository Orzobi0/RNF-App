import React, { useRef } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { Check, X, Clock, CalendarDays } from 'lucide-react';

const formatLocalIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatNoticeDate = (isoDate) => {
  const match =
    typeof isoDate === 'string'
      ? isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      : null;

  if (!match) return 'Fecha no disponible';

  const [, year, month, day] = match;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    12
  );

  if (formatLocalIsoDate(date) !== isoDate) {
    return 'Fecha no disponible';
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const monthText = date
  .toLocaleDateString('es-ES', { month: 'short' })
  .replace(/\.$/, '');

if (isoDate === formatLocalIsoDate(today)) return 'Hoy';

if (isoDate === formatLocalIsoDate(yesterday)) {
  return `Ayer (${date.getDate()} ${monthText})`;
}

  return date.getFullYear() === today.getFullYear()
    ? `${date.getDate()} ${monthText}`
    : `${date.getDate()} ${monthText} ${year}`;
};

// Separate provider: Bluetooth never changes
// the lifetime/position of other toasts.
export function BleSavedNotice({
  notice,
  onDismiss,
  onViewDay,
}) {
  const touch = useRef(null);
  const swipeDismissed = useRef(false);

  if (!notice) return null;

  const temperatureText =
    typeof notice.temperature === 'number'
      ? notice.temperature.toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—';

  const formattedDate = formatNoticeDate(notice.isoDate);

  const handleViewDay = () => {
    if (swipeDismissed.current) return;

    onDismiss();
    onViewDay(notice.isoDate);
  };

  return (
    <Toast.Provider
      duration={Infinity}
      swipeDirection="right"
    >
      <Toast.Root
        open
        duration={Infinity}
        onOpenChange={(open) => {
          if (!open) onDismiss();
        }}
        onTouchStart={(event) => {
          const point = event.touches[0];

          swipeDismissed.current = false;
          touch.current = {
            x: point.clientX,
            y: point.clientY,
          };
        }}
        onTouchEnd={(event) => {
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
            swipeDismissed.current = true;
            onDismiss();
          }
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        className="
          relative overflow-hidden rounded-2xl
          border border-rose-100 border-l-[4px]
          border-l-rose-400
          bg-gradient-to-br from-white to-[#FFF7F9]
          text-slate-700
          shadow-[0_8px_24px_rgba(100,40,60,0.16)]
          motion-safe:data-[state=open]:animate-in
          motion-safe:data-[state=open]:slide-in-from-top-full
          motion-safe:data-[state=open]:fade-in
          data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]
        "
      >
        <button
          type="button"
          aria-label={`Ver registro del día: ${formattedDate}`}
          onClick={handleViewDay}
          className="
            block w-full px-3 py-2.5 text-left
            transition-colors active:bg-rose-50/80
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-inset
            focus-visible:ring-rose-300
          "
        >
          <Toast.Title asChild>
            <span className="
              flex min-h-7 items-center gap-2
              pr-9 text-sm font-semibold text-titulo
            ">
              <span className="
                flex h-7 w-7 shrink-0
                items-center justify-center
                rounded-full bg-emerald-100
                text-emerald-700
              ">
                <Check
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </span>

              <span>
                {notice.count === 1
                  ? 'Temperatura incorporada'
                  : `${notice.count} temperaturas incorporadas`}
              </span>
            </span>
          </Toast.Title>

          <Toast.Description asChild>
            <span className="
              mt-2 flex min-w-0 items-center gap-2.5
            ">
              <span className="
                shrink-0 whitespace-nowrap mr-1
                text-lg font-bold tabular-nums
                tracking-tight text-fertiliapp-fuerte
              ">
                {temperatureText} °C
              </span>

              <span className="
                flex min-w-0 flex-1 flex-wrap
                items-center gap-x-2.5 gap-y-0.5
              ">
                <span className="
                  inline-flex items-center gap-1
                  whitespace-nowrap text-sm
                  font-medium tabular-nums text-slate-600
                ">
                  <Clock
                    className="h-3.5 w-3.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  {notice.time || 'Hora no disponible'}
                </span>

                <span className="
                  whitespace-nowrap text-sm
                  font-medium text-slate-500
                ">
                  {formattedDate}
                </span>
              </span>

              <CalendarDays
                className="
                  mr-0.5 h-5 w-5 shrink-0
                  text-fertiliapp-fuerte
                "
                aria-hidden="true"
              />
            </span>
          </Toast.Description>
        </button>

        <Toast.Close asChild>
          <button
            type="button"
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
            className="
              absolute right-0 top-0
              flex h-11 w-11
              items-center justify-center
              rounded-xl text-slate-400
              transition-colors active:text-slate-700
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-inset
              focus-visible:ring-rose-300
            "
          >
            <X className="h-4 w-4" />
          </button>
        </Toast.Close>
      </Toast.Root>

      <Toast.Viewport
        label="Temperaturas incorporadas"
        className="
          fixed right-2 z-[100]
          w-[calc(100%-16px)]
          max-w-sm outline-none
        "
        style={{
          top: 'var(--ble-safe-top, env(safe-area-inset-top, 0px))',
        }}
      />
    </Toast.Provider>
  );
}