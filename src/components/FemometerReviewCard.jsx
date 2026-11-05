import React, { useEffect, useState, useRef } from 'react';
import { Thermometer, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dismissal only hides this region; readings and an in-flight editor stay owned by the session.
export default function FemometerReviewCard({ visible = true, onDismiss, readings, selected, expanded, onExpand, onMinimize, onSelect, storageError, deviceKey, children }) {
  const card = useRef(null);
  const gesture = useRef(null);
  const beginGesture = event => {
    if (expanded || !onDismiss || !event.isPrimary || event.button !== 0
      || event.target.closest('button, input, select, textarea, a')) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endGesture = event => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId || Date.now() - start.time > 1000) return;
    const dx = Math.abs(event.clientX - start.x);
    const dy = event.clientY - start.y;
    if ((dx >= 80 && dx > Math.abs(dy) * 1.5) || (dy <= -72 && -dy > dx * 1.5)) onDismiss();
  };
  useEffect(() => { card.current?.scrollTo({ top: 0 }); }, [selected?.uiId]);
  const [viewport, setViewport] = useState(null);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return undefined;
    const update = () => setViewport({ top: view.offsetTop, height: view.height });
    update(); view.addEventListener('resize', update); view.addEventListener('scroll', update);
    return () => { view.removeEventListener('resize', update); view.removeEventListener('scroll', update); };
  }, []);
  if (!readings.length) return storageError ? <p role="alert" className="fixed bottom-24 right-3 z-50 max-w-sm rounded-2xl bg-white p-4 shadow-md">{storageError}</p> : null;
  const saving = readings.some(row => row.importStatus === 'saving');
  return <section ref={card} hidden={!visible}
    aria-label="Temperaturas Bluetooth pendientes"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onMinimize(); } }}
    className={`fixed z-[60] ${expanded ? 'left-3 w-[calc(100%-24px)]' : 'left-3 w-[calc(100%-80px)]'} max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-rose-100 bg-white p-4 text-slate-700 shadow-lg`}
    style={{ top: `calc(${viewport?.top ?? 0}px + var(--ble-safe-top, env(safe-area-inset-top, 0px)) + 12px + var(--ble-notice-height, 0px))`,
      maxHeight: `calc(${viewport ? `${viewport.height}px` : '100dvh'} - var(--ble-safe-top, env(safe-area-inset-top, 0px)) - env(safe-area-inset-bottom, 0px) - 24px - var(--ble-notice-height, 0px))` }}>
    <div className="flex items-center gap-2" style={{ touchAction: expanded ? 'auto' : 'pan-down pinch-zoom' }}
      onPointerDown={beginGesture} onPointerUp={endGesture} onPointerCancel={() => { gesture.current = null; }}>
      <Thermometer className="h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
      <p role="status" className="flex-1 text-sm font-semibold">{readings.length} {readings.length === 1 ? 'temperatura por revisar' : 'temperaturas por revisar'}</p>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-expanded={expanded}
        aria-controls="ble-pending-review" onClick={expanded ? onMinimize : onExpand}>
        {expanded ? <><ChevronDown aria-hidden="true" className="h-5 w-5" /><span className="sr-only">Minimizar</span></> : 'Revisar'}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="Cerrar aviso de temperaturas pendientes" onClick={onDismiss}>
        <X aria-hidden="true" className="h-5 w-5" />
      </Button>
    </div>
    <p className="text-xs text-slate-500">Las fechas originales necesitan confirmación.</p>
    {storageError && <p role="alert" className="mt-2 text-sm text-amber-800">{storageError}</p>}
    <div hidden={!expanded} id="ble-pending-review" className="mt-3 space-y-3">
      <ul className="max-h-32 space-y-1 overflow-y-auto" aria-label="Seleccionar temperatura pendiente">
        {readings.map(row => <li key={row.uiId}><button type="button" disabled={saving} aria-pressed={selected?.uiId === row.uiId}
          className="min-h-11 w-full rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-left text-sm aria-pressed:border-rose-400"
          onClick={() => onSelect(row.uiId)}>
          {row.temperatureC} °C · {row.deviceTimestamp || 'Sin fecha'}
          <span className="block text-xs text-slate-500">{!row.deviceKey ? 'Sin vincular: solo en esta sesión'
            : row.deviceKey === deviceKey ? 'Termómetro vinculado' : 'Otra vinculación conservada; revisa su origen'}
            {row.dateReview?.reason === 'older-than-24-hours' ? ' · Más de 24 horas: revisión manual' : ''}
            {row.importStatus === 'uncertain' ? ' · Resultado de guardado incierto' : row.importStatus === 'saving' ? ' · Guardando…' : ''}</span>
        </button></li>)}
      </ul>
      {children}
    </div>
  </section>;
}
