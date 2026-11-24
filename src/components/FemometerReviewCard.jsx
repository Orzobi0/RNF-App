import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import { measurementSourceLabel } from '@/lib/temperatureMeasurements';
import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Copy, AlertTriangle, ChevronDown, X, Clock, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dismissal hides the notice only. The session retains pending readings and edits.
const formatBleDateTime = timestamp => {
  const match = typeof timestamp === 'string'
    ? timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    : null;

  if (!match) return { date: 'Fecha no disponible', time: '—' };
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  const time = `${hour}:${minute}`;
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return { date: 'Fecha no disponible', time };
  }
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const monthText = date.toLocaleDateString('es-ES', { month: 'short' }).replace(/\.$/, '');
  const shortDate = `${date.getDate()} ${monthText}`;
  const fullDate = date.getFullYear() === today.getFullYear() ? shortDate : `${shortDate} ${year}`;
  return { date: sameDay(date, today) ? 'Hoy' : sameDay(date, yesterday) ? `Ayer (${fullDate})` : fullDate, time };
};
export default function FemometerReviewCard({
  visible = true,
  noticeVersion = 0,
  onDismiss,
  readings,
  selected,
  expanded,
  onExpand,
  onMinimize,
  onSelect,
  storageError,
  deviceKey,
  children,
}) {
  const metadata = useThermometerMetadata();
  const card = useRef(null);
  const listRef = useRef(null);
  const gesture = useRef(null);
  const suppressExpandClick = useRef(false);
  const dismissTimer = useRef(null);
  const exitingRef = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [viewport, setViewport] = useState(null);
const onDismissRef = useRef(onDismiss);
onDismissRef.current = onDismiss;

const hasReadings = readings.length > 0;

// Limpiar el temporizador al desmontar.
useEffect(() => {
  return () => window.clearTimeout(dismissTimer.current);
}, []);

// Restablecer los gestos y animaciones.
useEffect(() => {
  window.clearTimeout(dismissTimer.current);
  gesture.current = null;
  exitingRef.current = false;
  suppressExpandClick.current = false;

  setOffset({ x: 0, y: 0 });
  setDragging(false);
  setExiting(false);
}, [visible, expanded, noticeVersion]);

// Ocultar automáticamente el aviso compacto.
useEffect(() => {
  if (
    !visible ||
    expanded ||
    !hasReadings ||
    dragging ||
    exiting ||
    storageError
  ) return;

  const timer = window.setTimeout(() => {
    onDismissRef.current?.();
  }, 5000);

  return () => window.clearTimeout(timer);
}, [
  visible,
  expanded,
  noticeVersion,
  hasReadings,
  dragging,
  exiting,
  storageError,
]);

// Mostrar completamente la medición seleccionada.
useEffect(() => {
  if (!visible || !expanded) return;

  const list = listRef.current;
  const item = list?.querySelector(
    'button[aria-pressed="true"]'
  );

  if (!list || !item) return;

  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  let delta = 0;

  if (itemRect.top < listRect.top) {
    delta = itemRect.top - listRect.top;
  } else if (itemRect.bottom > listRect.bottom) {
    delta = itemRect.bottom - listRect.bottom;
  }

  if (delta !== 0) {
    list.scrollBy({
      top: delta,
      behavior: window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches ? 'auto' : 'smooth',
    });
  }
}, [selected?.uiId, visible, expanded, readings.length]);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return undefined;
    const update = () => setViewport({ top: view.offsetTop, height: view.height });
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);

  const animateDismiss = direction => {
    if (!onDismiss || exitingRef.current) return;
    exitingRef.current = true;
    gesture.current = null;
    setDragging(false);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onDismiss();
      return;
    }

    setExiting(true);
    if (direction === 'up') {
      setOffset({ x: 0, y: -(card.current?.offsetHeight ?? 100) - 100 });
    } else {
      setOffset({ x: (direction === 'left' ? -1 : 1) * (window.innerWidth + 100), y: 0 });
    }
    dismissTimer.current = window.setTimeout(() => onDismiss(), 200);
  };

  const beginGesture = event => {
    if (expanded || !visible || !onDismiss || exitingRef.current
  || event.isPrimary === false || event.button !== 0) return;

suppressExpandClick.current = false;

    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveGesture = event => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId || exitingRef.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      setOffset({ x: dx, y: 0 });
    } else {
      setOffset({ x: 0, y: Math.min(0, dy) });
    }
  };

  const cancelGesture = () => {
    gesture.current = null;
    setDragging(false);
    setOffset({ x: 0, y: 0 });
  };

  const endGesture = event => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.2) {
  suppressExpandClick.current = true;
  animateDismiss(dx < 0 ? 'left' : 'right');
} else if (dy <= -60 && -dy > Math.abs(dx) * 1.2) {
  suppressExpandClick.current = true;
  animateDismiss('up');
    } else {
      setDragging(false);
      setOffset({ x: 0, y: 0 });
    }
  };

  if (!readings.length) {
    return storageError ? (
      <p role="alert" className="fixed bottom-24 right-3 z-50 max-w-sm rounded-2xl bg-white p-4 shadow-md">
        {storageError}
      </p>
    ) : null;
  }

  const otherBinding = Boolean(deviceKey) && readings.some(row => row.deviceKey && row.deviceKey !== deviceKey);
  const uncertain = selected?.importStatus === 'uncertain';
  const duplicate = !uncertain && selected?.reviewError?.code === 'ble-possible-duplicate';
  const HeaderIcon = uncertain ? AlertTriangle : duplicate ? Copy : ClipboardList;
  const title = uncertain ? 'Guardado sin confirmar' : duplicate ? 'Posible duplicado'
    : `${readings.length} ${readings.length === 1 ? 'temperatura pendiente' : 'temperaturas pendientes'}`;
  const saving = readings.some(row => row.importStatus === 'saving');
  const compact = !expanded;
  const dragDistance = Math.max(Math.abs(offset.x), Math.abs(offset.y));
  const opacity = exiting ? 0 : dragging ? Math.max(0.55, 1 - dragDistance / 280) : 1;

  return (
    <section
      ref={card}
      hidden={!visible}
      aria-label="Temperaturas Bluetooth pendientes"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onMinimize();
        }
      }}
      className={`fixed z-[60] max-w-sm overscroll-contain rounded-2xl text-slate-700
        ${expanded ? 'left-2 w-[calc(100%-16px)] overflow-y-auto border border-rose-300 bg-white p-3 shadow-[0_8px_24px_rgba(100,40,60,0.16)]'
          : 'left-2 w-[calc(100%-16px)] overflow-visible border border-rose-200 border-l-[4px] border-l-rose-400 bg-gradient-to-br from-white to-[#FFF7F9] px-3 py-2.5 shadow-[0_8px_24px_rgba(100,40,60,0.16)]'}
        transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none`}
      style={{
        top: `calc(${viewport?.top ?? 0}px + var(--ble-safe-top, env(safe-area-inset-top, 0px)))`,
maxHeight: `calc(${viewport ? `${viewport.height}px` : '100dvh'} - var(--ble-safe-top, env(safe-area-inset-top, 0px)) - env(safe-area-inset-bottom, 0px) - 24px - var(--bottom-nav-safe, 64px))`,
        transform: compact ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : undefined,
        opacity: compact ? opacity : undefined,
        transition: dragging ? 'none' : undefined,
      }}
    >
      {/* Compact header is the swipe target; buttons remain ordinary tap targets. */}
      <div className={`flex items-center gap-2 ${expanded ? 'pr-8' : 'pr-6'}`}>
  <span
  className={`relative flex h-9 w-9 shrink-0 items-center
    justify-center rounded-xl ${
      uncertain || duplicate
        ? 'bg-amber-50'
        : compact
          ? 'border border-rose-200 bg-gradient-to-br from-white via-rose-50 to-rose-100 shadow-sm'
          : 'bg-rose-100/70'
    }`}
>
  <HeaderIcon
    className={`h-5 w-5 ${
      uncertain || duplicate
        ? 'text-amber-600'
        : 'text-fertiliapp-fuerte'
    }`}
    aria-hidden="true"
  />

  {compact && (
    <span
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 flex h-5
        min-w-5 items-center justify-center rounded-full
        border-2 border-white bg-fertiliapp-fuerte
        px-0.5 text-[10px] font-bold leading-none text-white"
    >
      {readings.length > 99 ? '99+' : readings.length}
    </span>
  )}
</span>

  <div className="min-w-0 flex-1">
    <p
      role="status"
      className={`font-semibold ${
        compact
          ? 'whitespace-normal text-sm leading-5'
          : 'text-sm leading-5'
      }`}
    >
      {compact && !uncertain && !duplicate
  ? readings.length === 1
    ? 'Temperatura pendiente'
    : 'Temperaturas pendientes'
  : title}
    </p>

    {expanded && (
      <span className="mt-0.5 block text-xs text-slate-500">Confirma la fecha y la hora</span>
    )}
  </div>

  {expanded && (
    <Button
      type="button"
      variant="ghost"
      className="h-11 w-11 shrink-0 p-0"
      aria-expanded
      aria-controls="ble-pending-review"
      onClick={onMinimize}
    >
      <ChevronDown aria-hidden="true" className="h-5 w-5" />
      <span className="sr-only">Minimizar</span>
    </Button>
  )}
</div>

{compact && (
  <button
    type="button"
    aria-label={`Revisar ${readings.length} temperaturas pendientes`}
    aria-expanded={false}
    aria-controls="ble-pending-review"
    className="absolute inset-0 z-[1] w-full cursor-pointer rounded-2xl bg-transparent focus-visible:outline-2 focus-visible:outline-rose-400"
    style={{ touchAction: 'none' }}
    onClick={() => {
      if (!exitingRef.current && !suppressExpandClick.current) {
        onExpand();
      }
      suppressExpandClick.current = false;
    }}
    onPointerDown={beginGesture}
    onPointerMove={moveGesture}
    onPointerUp={endGesture}
    onPointerCancel={cancelGesture}
  />
)}

      {onDismiss && (
        <button
          type="button"
          aria-label="Cerrar aviso"
          title="Cerrar aviso"
          onClick={() => compact ? animateDismiss('right') : onDismiss()}
          className={`absolute right-1 top-0 z-10 flex h-11 w-11
  rounded-xl text-slate-400 focus-visible:outline-2
  focus-visible:outline-rose-400 ${
    compact
      ? 'h-full items-center justify-center'
      : 'items-start justify-end'
  }`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-bl-xl rounded-tr-3xl transition-colors hover:bg-rose-200">
            <X
  aria-hidden="true"
  className={compact ? 'h-4 w-4' : 'h-3 w-3'}
/>
          </span>
        </button>
      )}

      {storageError && <p role="alert" className="mt-2 text-sm text-amber-800">{storageError}</p>}

      {/* Keep the editor mounted even if the notice is hidden or minimized. */}
      <div hidden={!expanded} id="ble-pending-review" className="mt-3 space-y-3">
        {otherBinding && <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Hay temperaturas de otra vinculación. Comprueba su origen y confirma la fecha antes de incorporarlas.</p>}
        <ul
  ref={listRef}
  className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain pr-2"
  aria-label="Seleccionar temperatura pendiente"
>
  {readings.map(row => {
    const original = formatBleDateTime(row.deviceTimestamp);
    return (
    <li key={row.uiId}>
      <button
        type="button"
        disabled={saving}
        aria-pressed={selected?.uiId === row.uiId}
        className="min-h-11 w-full group rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2 text-left aria-pressed:border-rose-400 aria-pressed:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-60"
        onClick={() => onSelect(row.uiId)}
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
  <span className="whitespace-nowrap text-lg font-semibold text-titulo tabular-nums group-aria-pressed:text-fertiliapp-fuerte">
    {typeof row.temperatureC === 'number'
      ? row.temperatureC.toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—'} °C
  </span>

  <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-slate-600 tabular-nums">
    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
    {original.time}
  </span>
  <span className="text-sm text-slate-500">{original.date}</span>
</span>

        <span className="mt-1 flex items-start gap-1 text-xs text-slate-500">
          <Bluetooth className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
          {measurementSourceLabel(row.normalized ?? { source: 'bluetooth', device_model: row.deviceModel }, metadata.devices[row.deviceKey]?.customName)}

          {!row.deviceKey
            ? ' · Origen sin vincular'
            : deviceKey && row.deviceKey !== deviceKey
              ? ' · Otra vinculación'
              : ''}

          {row.dateReview?.reason === 'older-than-24-hours'
            ? ' · Fecha antigua: revisión manual'
            : ''}

          {row.importStatus === 'uncertain'
            ? ' · Guardado anterior incierto'
            : row.importStatus === 'saving'
              ? ' · Guardando…'
              : ''}
          </span>
        </span>
      </button>
    </li>
    );
  })}
</ul>
        {selected?.reviewError?.message && selected.importStatus !== 'saving' && <p role="status" className="text-sm text-amber-900">{selected.reviewError.message}</p>}
        {children}
      </div>
    </section>
  );
}
