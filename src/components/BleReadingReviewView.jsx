import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import React from 'react';
import { vinca2DateNeedsReview, recoveredVinca2DateMessage } from '@/lib/bleMeasurements';
import { CheckCircle2, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { measurementDisplay, measurementSourceLabel } from '@/lib/temperatureMeasurements';
import { Input } from '@/components/ui/input';

const decisionButton = 'h-auto min-h-11 min-w-0 gap-2 whitespace-normal rounded-xl px-2 py-2 text-sm leading-snug';
const positive = `${decisionButton} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
const alternative = `${decisionButton} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`;
const warning = 'space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm';

export function BleReadingReviewView({
  reading, measurement = reading.normalized, draft, busy, error, checkedUncertain,
  check = { status: 'idle' }, canCheck = false, onCheck, onAlreadyStored, onMissing,
  storedConfirm = false, incorporationRequested = false, onConfirmStored, onBackStored,
  duplicateApproved = false, discardConfirm = false, onDifferent, onRepeated, onCancelDiscard, onDiscard, onRequestDiscard,
  change, confirm, onClose, navigate,
}) {
  const metadata = useThermometerMetadata();
  const uncertain = reading.importStatus === 'uncertain';
  const duplicate = error?.code === 'ble-possible-duplicate';
  const complete = check.status === 'complete';
  const showFields = !uncertain || incorporationRequested;
  const originalDay = (reading.deviceTimestamp || reading.normalized?.device_timestamp || '').slice(0, 10);
  const showConsultedDay = reading.attempt?.isoDate && (reading.attempt.isoDate !== originalDay || reading.attempt.isoDate !== draft.isoDate);
  return <div aria-label="Revisar temperatura" className="space-y-3">
    {vinca2DateNeedsReview(measurement) && <section className={warning} aria-label="Revisar fecha y hora">
      <p>{recoveredVinca2DateMessage}</p>
      <p>Fecha original del termómetro: {measurement.device_timestamp || 'No disponible (ausente o inválida)'}</p>
      <p>Fecha y hora elegidas: {draft.isoDate && draft.time ? `${draft.isoDate} · ${draft.time}` : 'Pendientes de elegir'}</p>
    </section>}
    {uncertain && <section className={warning} aria-label="Comprobar guardado incierto">
      <p>No hemos podido confirmar que la temperatura se haya guardado correctamente. Comprueba si ya está registrada.</p>
      {showConsultedDay && <p>Día consultado: {reading.attempt.isoDate} (destino del intento).</p>}
      {!canCheck && <p>Este intento no conserva un destino seguro. Revisa Mis registros antes de decidir.</p>}
      {check.status === 'loading' && <p role="status">Consultando temperaturas…</p>}
      {check.status === 'error' && <p role="alert">{check.message}</p>}
      {canCheck && <Button type="button" variant="ghost" className="h-auto min-h-11 px-1 text-sm" disabled={busy || check.status === 'loading'} onClick={onCheck}>
        {check.status === 'error' ? 'Reintentar consulta' : 'Actualizar temperaturas'}
      </Button>}
      {complete && <div aria-live="polite">
        {check.result.measurements.length ? <ul className="max-h-40 space-y-2 overflow-y-auto">
          {check.result.measurements.map((item, index) => <li key={item.id ?? index} className="rounded-xl border border-rose-200 bg-white p-2">
            <span className="font-semibold text-rose-700">{measurementDisplay(item)}</span> · {item.time || 'Hora no disponible'}
            <span className="block text-xs text-slate-600">{measurementSourceLabel(item, metadata.devices[item.device_key]?.customName) || 'Procedencia no disponible'}{item.source === 'bluetooth' ? ' · Bluetooth' : ''}{item.selected === true ? ' · Seleccionada' : ''}</span>
          </li>)}
        </ul> : <p>{check.result.exists ? 'El día no contiene mediciones.' : 'No existe un registro para ese día.'}</p>}
      </div>}
      {storedConfirm ? <div className="space-y-2">
        <p>¿Confirmas que ya está guardada? Solo retiraremos esta pendiente local.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={positive} disabled={busy || !complete} onClick={onConfirmStored}>Confirmar que ya está guardada</Button>
          <Button type="button" className="min-h-11" variant="ghost" disabled={busy} onClick={onBackStored}>Volver</Button>
        </div>
      </div> : <>
        <p className="font-semibold">¿Esta temperatura ya está guardada?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={positive} disabled={busy || !complete} onClick={onAlreadyStored}><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Sí, ya está guardada</span></Button>
          <Button type="button" variant="outline" className={alternative} disabled={busy || !complete} onClick={onMissing}><PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" /><span>No, incorporarla</span></Button>
        </div>
      </>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" className="min-h-11 px-1" onClick={() => { onClose(); navigate('/records', { state: { selectedDate: reading.attempt?.isoDate || draft.isoDate, scrollToDayDetail: true } }); }}>Ver Mis registros</Button>
        <Button type="button" variant="ghost" className="min-h-11 px-1" disabled={busy} onClick={onClose}>Decidir más tarde</Button>
      </div>
    </section>}
    {showFields && !storedConfirm && (
<div className="grid grid-cols-2 gap-2">
          {measurement?.device_protocol === 'easyhome-ebt300' && measurement.measurement_kind === 'historical' && <label className="col-span-2 block text-sm font-medium text-slate-700">
            Temperatura (°C)
            <Input type="number" inputMode="decimal" min="32" max="43" step="0.01" value={draft.temperatureC} disabled={busy}
              onChange={event => change({ temperatureC: event.target.value })} className="mt-1 h-11 rounded-xl" />
            <span className="block text-xs font-normal">Valor interpretado provisionalmente. Revisa la temperatura, la fecha y la hora antes de incorporarla.</span>
          </label>}
          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Fecha
            <Input
              type="date"
              value={draft.isoDate}
              disabled={busy}
              onChange={event => change({ isoDate: event.target.value })}
              className="mt-1 h-11 min-w-0 w-full max-w-full rounded-xl border-slate-200 px-2 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>

          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Hora
            <Input
              type="time"
              value={draft.time}
              disabled={busy}
              onChange={event => change({ time: event.target.value })}
              className="mt-1 h-11 min-w-0 w-full max-w-full rounded-xl border-slate-200 px-2 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>
        </div>
    )}
    {(duplicate || discardConfirm) && (!uncertain || (incorporationRequested && checkedUncertain)) && <section aria-label={discardConfirm ? 'Confirmar descarte' : 'Posible duplicado'} className={warning}>
      {discardConfirm ? <div className="space-y-2">
        <p>¿Descartar esta temperatura pendiente? Se eliminará de FertiliApp en este dispositivo. No se borrarán registros ya guardados.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={alternative} disabled={busy} onClick={onDiscard}><Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />Confirmar descarte</Button>
          <Button type="button" className="min-h-11" variant="ghost" disabled={busy} onClick={onCancelDiscard}>Volver</Button>
        </div>
      </div> : <>
        <p>Hemos encontrado una posible coincidencia con otra medición registrada.</p>
        <p className="font-semibold">¿Es una medición diferente?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={positive} disabled={busy} onClick={onDifferent}><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Sí, es otra medición</span></Button>
          <Button type="button" variant="outline" className={alternative} disabled={busy} onClick={onRepeated}><Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>No, está repetida</span></Button>
        </div>
      </>}
      {!uncertain && discardConfirm && <Button type="button" className="min-h-11" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>}
    </section>}
    {error && !duplicate && <p role="alert" className="text-sm text-amber-800">Requiere revisión: {error.message}</p>}
    {error?.code === 'ble-import-conflict' && <Button variant="outline" onClick={() => { onClose(); navigate('/records'); }}>Revisar ciclo en Mis registros</Button>}
          {!discardConfirm && !storedConfirm && showFields && (
      <footer
        aria-label="Acciones de revisión"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] items-stretch gap-2 border-t border-slate-100 pt-2 pb-[env(safe-area-inset-bottom,0px)]"
      >
        {/* Acción secundaria: descartar */}
        {!uncertain && !duplicate ? (
          <div className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 h-full w-full min-w-0 gap-2 whitespace-normal rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm leading-snug text-slate-700 hover:bg-slate-100"
              disabled={busy || reading.importStatus !== 'pending'}
              onClick={onRequestDiscard}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Descartar</span>
            </Button>
          </div>
        ) : (
          <div />
        )}

        {/* Acción principal: confirmar */}
        <div className="min-w-0">
          <Button
            type="button"
            className="min-h-11 h-full w-full min-w-0 gap-2 whitespace-normal rounded-xl bg-fertiliapp-fuerte px-3 py-2 text-center text-sm font-semibold leading-snug text-white hover:brightness-95"
            disabled={
              busy ||
              !draft.isoDate ||
              !draft.time ||
              (uncertain && !checkedUncertain) ||
              (duplicate && !duplicateApproved)
            }
            onClick={confirm}
          >
            {busy ? (
  'Incorporando…'
) : (
  <>
    <CheckCircle2
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    />
    <span>Confirmar e incorporar</span>
  </>
)}
          </Button>
        </div>
      </footer>
    )}

  </div>;
}
