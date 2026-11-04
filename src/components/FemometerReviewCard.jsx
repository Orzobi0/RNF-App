import React, { useEffect, useState } from 'react';
import { Thermometer, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Persistent non-modal region: no timeout, no dismissal on outside interaction.
export default function FemometerReviewCard({ readings, selected, expanded, onExpand, onMinimize, onSelect, storageError, deviceKey, children }) {
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
  return <section aria-label="Temperaturas Bluetooth pendientes"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onMinimize(); } }}
    className="fixed right-3 z-[60] w-[calc(100%-24px)] max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-rose-100 bg-white p-4 text-slate-700 shadow-lg"
    style={expanded ? { top: `calc(${viewport?.top ?? 0}px + env(safe-area-inset-top, 0px) + 12px)`,
      maxHeight: viewport ? `calc(${viewport.height}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)` : 'calc(100dvh - 24px)' }
      : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
    <div className="flex items-center gap-2">
      <Thermometer className="h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
      <p role="status" className="flex-1 text-sm font-semibold">{readings.length} {readings.length === 1 ? 'temperatura por revisar' : 'temperaturas por revisar'}</p>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-expanded={expanded}
        aria-controls="ble-pending-review" onClick={expanded ? onMinimize : onExpand}>
        {expanded ? <><ChevronDown aria-hidden="true" className="h-5 w-5" /><span className="sr-only">Minimizar</span></> : 'Revisar'}
      </Button>
    </div>
    <p className="text-xs text-slate-500">Las fechas originales necesitan confirmación.</p>
    {storageError && <p role="alert" className="mt-2 text-sm text-amber-800">{storageError}</p>}
    {expanded && <div id="ble-pending-review" className="mt-3 space-y-3">
      <ul className="max-h-32 space-y-1 overflow-y-auto" aria-label="Seleccionar temperatura pendiente">
        {readings.map(row => <li key={row.uiId}><button type="button" disabled={saving} aria-pressed={selected?.uiId === row.uiId}
          className="min-h-11 w-full rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-left text-sm aria-pressed:border-rose-400"
          onClick={() => onSelect(row.uiId)}>
          {row.temperatureC} °C · {row.deviceTimestamp || 'Sin fecha'}
          <span className="block text-xs text-slate-500">{!row.deviceKey ? 'Sin vincular: solo en esta sesión'
            : row.deviceKey === deviceKey ? 'Termómetro vinculado' : 'Otra vinculación conservada; revisa su origen'}
            {row.importStatus === 'uncertain' ? ' · Resultado de guardado incierto' : row.importStatus === 'saving' ? ' · Guardando…' : ''}</span>
        </button></li>)}
      </ul>
      {children}
    </div>}
  </section>;
}
