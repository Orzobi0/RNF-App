import React, { useEffect, useRef, useState } from 'react';
import { PlusCircle, Copy, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dismissal hides the notice only. The session retains pending readings and edits.
const formatBleDateTime = timestamp => {
  const match = typeof timestamp === 'string'
    ? timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    : null;

  return match
    ? `${match[3]}/${match[2]}/${match[1]} · ${match[4]}:${match[5]}`
    : 'Fecha no disponible';
};
export default function FemometerReviewCard({
  visible = true,
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
  const card = useRef(null);
  const gesture = useRef(null);
  const suppressExpandClick = useRef(false);
  const dismissTimer = useRef(null);
  const exitingRef = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    return () => window.clearTimeout(dismissTimer.current);
  }, []);

  // Route changes or a new review must not leave a drag animation behind.
  useEffect(() => {
    if (!visible || expanded) {
      window.clearTimeout(dismissTimer.current);
      gesture.current = null;
      exitingRef.current = false;
      setOffset({ x: 0, y: 0 });
      setDragging(false);
      setExiting(false);
    }
  }, [visible, expanded]);

  useEffect(() => {
    card.current?.scrollTo({ top: 0 });
  }, [selected?.uiId]);

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

  const uncertain = selected?.importStatus === 'uncertain';
  const duplicate = !uncertain && selected?.reviewError?.code === 'ble-possible-duplicate';
  const HeaderIcon = uncertain ? AlertTriangle : duplicate ? Copy : PlusCircle;
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
      className={`fixed z-[60] max-w-sm overscroll-contain rounded-3xl text-slate-700
        ${expanded ? 'left-3 w-[calc(100%-24px)] overflow-y-auto border border-rose-400 bg-white p-4 shadow-lg'
          : 'left-3 w-[calc(100%-80px)] overflow-visible border border-rose-200 bg-gradient-to-br from-white via-rose-50 to-pink-50 p-3 shadow-[0_8px_22px_rgba(190,60,100,0.13)]'}
        transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none`}
      style={{
        top: `calc(${viewport?.top ?? 0}px + var(--ble-safe-top, env(safe-area-inset-top, 0px)) + 12px + var(--ble-notice-height, 0px))`,
        maxHeight: `calc(${viewport ? `${viewport.height}px` : '100dvh'} - var(--ble-safe-top, env(safe-area-inset-top, 0px)) - env(safe-area-inset-bottom, 0px) - 24px - var(--ble-notice-height, 0px))`,
        transform: compact ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : undefined,
        opacity: compact ? opacity : undefined,
        transition: dragging ? 'none' : undefined,
      }}
    >
      {/* Compact header is the swipe target; buttons remain ordinary tap targets. */}
      <div className={`flex items-center gap-2 ${expanded ? 'pr-8' : 'pr-6'}`}>
  <span className={`flex shrink-0 items-center justify-center ${compact ? 'h-8 w-8' : ''}`}>
    <HeaderIcon
      className={`h-6 w-6 ${uncertain || duplicate ? 'text-amber-600' : 'text-fertiliapp-fuerte'}`}
      aria-hidden="true"
    />
  </span>

  <div className="min-w-0 flex-1">
    <p
      role="status"
      className={`font-semibold ${
        compact
          ? `${uncertain || duplicate ? 'whitespace-normal' : 'whitespace-nowrap'} text-[clamp(14px,3.2vw,13px)] leading-4`
          : 'text-md'
      }`}
    >
      {title}
    </p>

    {compact && (
      <span className="mt-1 block text-[12px] font-bold text-fertiliapp-fuerte">
        Revisar
      </span>
    )}
  </div>

  {expanded && (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 min-w-11"
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
    className="absolute inset-0 z-[1] w-full cursor-pointer rounded-3xl bg-transparent focus-visible:outline-2 focus-visible:outline-rose-400"
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
          className="absolute right-1 top-0 z-10 flex h-11 w-11 items-start justify-end rounded-tr-3xl text-fertiliapp-fuerte focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-bl-xl rounded-tr-3xl transition-colors hover:bg-rose-200">
            <X aria-hidden="true" className="h-3 w-3" />
          </span>
        </button>
      )}

      {expanded && <p className="text-xs text-slate-500">Las fechas originales necesitan confirmación.</p>}
      {storageError && <p role="alert" className="mt-2 text-sm text-amber-800">{storageError}</p>}

      {/* Keep the editor mounted even if the notice is hidden or minimized. */}
      <div hidden={!expanded} id="ble-pending-review" className="mt-3 space-y-3">
        <ul className="max-h-32 space-y-2 overflow-y-auto" aria-label="Seleccionar temperatura pendiente">
  {readings.map(row => (
    <li key={row.uiId}>
      <button
        type="button"
        disabled={saving}
        aria-pressed={selected?.uiId === row.uiId}
        className="min-h-11 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-2.5 text-left aria-pressed:border-rose-400 aria-pressed:bg-rose-50"
        onClick={() => onSelect(row.uiId)}
      >
        <span className="flex flex-wrap items-baseline justify-start gap-x-4 gap-y-0.5">
          <span className="text-md font-semibold text-rose-700">
            {typeof row.temperatureC === 'number'
              ? row.temperatureC.toLocaleString('es-ES', { maximumFractionDigits: 2 })
              : '—'} °C
          </span>

          <span className="whitespace-nowrap text-md font-medium text-slate-800">
            {formatBleDateTime(row.deviceTimestamp)}
          </span>
        </span>

        <span className="mt-1 block text-xs text-slate-500">
          {row.normalized?.device_model || 'BM-Vinca2'}

          {!row.deviceKey
            ? ' · Origen sin vincular'
            : row.deviceKey !== deviceKey
              ? ' · Otra vinculación: revisar origen'
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
      </button>
    </li>
  ))}
</ul>
        {children}
      </div>
    </section>
  );
}
