import React from 'react';
import { CheckCircle2, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { measurementDisplay, measurementSourceLabel } from '@/lib/temperatureMeasurements';
import { Input } from '@/components/ui/input';

const decisionButton = 'h-auto min-h-11 min-w-0 whitespace-normal rounded-xl px-2 py-2 text-sm leading-snug';
const positive = `${decisionButton} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
const alternative = `${decisionButton} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`;
const warning = 'space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm';

export function BleReadingReviewView({
  reading, draft, busy, error, checkedUncertain,
  check = { status: 'idle' }, canCheck = false, onCheck, onAlreadyStored, onMissing,
  storedConfirm = false, incorporationRequested = false, onConfirmStored, onBackStored,
  duplicateApproved = false, discardConfirm = false, onDifferent, onRepeated, onCancelDiscard, onDiscard, onRequestDiscard,
  change, confirm, onClose, navigate,
}) {
  const uncertain = reading.importStatus === 'uncertain';
  const duplicate = error?.code === 'ble-possible-duplicate';
  const complete = check.status === 'complete';
  const showFields = !uncertain || incorporationRequested;
  const originalDay = (reading.deviceTimestamp || reading.normalized?.device_timestamp || '').slice(0, 10);
  const showConsultedDay = reading.attempt?.isoDate && (reading.attempt.isoDate !== originalDay || reading.attempt.isoDate !== draft.isoDate);
  return <div aria-label="Revisar temperatura" className="space-y-3">
    {uncertain && <section className={warning} aria-label="Comprobar guardado incierto">
      <p>No hemos podido confirmar que la temperatura se haya guardado correctamente. Comprueba si ya está registrada.</p>
      {showConsultedDay && <p>Día consultado: {reading.attempt.isoDate} (destino del intento).</p>}
      {!canCheck && <p>Este intento no conserva un destino seguro. Revisa Mis registros antes de decidir.</p>}
      {check.status === 'loading' && <p role="status">Consultando temperaturas…</p>}
      {check.status === 'error' && <p role="alert">{check.message}</p>}
      {canCheck && <Button type="button" variant="ghost" className="h-auto min-h-9 px-1 text-xs" disabled={busy || check.status === 'loading'} onClick={onCheck}>
        {check.status === 'error' ? 'Reintentar consulta' : 'Actualizar temperaturas'}
      </Button>}
      {complete && <div aria-live="polite">
        {check.result.measurements.length ? <ul className="max-h-40 space-y-2 overflow-y-auto">
          {check.result.measurements.map((item, index) => <li key={item.id ?? index} className="rounded-xl border border-rose-200 bg-white p-2">
            <span className="font-semibold text-rose-700">{measurementDisplay(item)}</span> · {item.time || 'Hora no disponible'}
            <span className="block text-xs text-slate-600">{measurementSourceLabel(item) || 'Procedencia no disponible'}{item.source === 'bluetooth' ? ' · Bluetooth' : ''}{item.selected === true ? ' · Seleccionada' : ''}</span>
          </li>)}
        </ul> : <p>{check.result.exists ? 'El día no contiene mediciones.' : 'No existe un registro para ese día.'}</p>}
      </div>}
      {storedConfirm ? <div className="space-y-2">
        <p>¿Confirmas que ya está guardada? Solo retiraremos esta pendiente local.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={positive} disabled={busy || !complete} onClick={onConfirmStored}>Confirmar que ya está guardada</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onBackStored}>Volver</Button>
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
          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Fecha
            <Input
              type="date"
              value={draft.isoDate}
              disabled={busy}
              onChange={event => change({ isoDate: event.target.value })}
              className="mt-1 min-w-0 w-full border-rose-200 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>

          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Hora
            <Input
              type="time"
              value={draft.time}
              disabled={busy}
              onChange={event => change({ time: event.target.value })}
              className="mt-1 min-w-0 w-full border-rose-200 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>
        </div>
    )}
    {(duplicate || discardConfirm) && (!uncertain || (incorporationRequested && checkedUncertain)) && <section aria-label={discardConfirm ? 'Confirmar descarte' : 'Posible duplicado'} className={warning}>
      {discardConfirm ? <div className="space-y-2">
        <p>¿Descartar esta temperatura pendiente? Se eliminará de FertiliApp en este dispositivo. No se borrarán registros ya guardados.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={alternative} disabled={busy} onClick={onDiscard}><Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />Confirmar descarte</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancelDiscard}>Volver</Button>
        </div>
      </div> : <>
        <p>Hemos encontrado una posible coincidencia con otra medición registrada.</p>
        <p className="font-semibold">¿Es una medición diferente?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={positive} disabled={busy} onClick={onDifferent}><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Sí, es otra medición</span></Button>
          <Button type="button" variant="outline" className={alternative} disabled={busy} onClick={onRepeated}><Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>No, está repetida</span></Button>
        </div>
      </>}
      {!uncertain && <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>}
    </section>}
    {error && !duplicate && <p role="alert" className="text-sm text-amber-800">Requiere revisión: {error.message}</p>}
    {error?.code === 'ble-import-conflict' && <Button variant="outline" onClick={() => { onClose(); navigate('/records'); }}>Revisar ciclo en Mis registros</Button>}
    {!discardConfirm && !storedConfirm && showFields && <div className="flex flex-wrap items-center justify-between gap-2 pb-[env(safe-area-inset-bottom,0px)]">
      {!uncertain && !duplicate && <Button type="button" variant="ghost" className="mr-auto min-h-11 h-auto max-w-full whitespace-normal px-2 text-left text-slate-600" disabled={busy || reading.importStatus !== 'pending'} onClick={onRequestDiscard}><Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />Descartar temperatura</Button>}
      <Button type="button" className="ml-auto min-h-11 h-auto max-w-full whitespace-normal rounded-full bg-fertiliapp-fuerte px-4 py-2 text-white hover:brightness-95"
        disabled={busy || !draft.isoDate || !draft.time || (uncertain && !checkedUncertain) || (duplicate && !duplicateApproved)} onClick={confirm}>
        {busy ? 'Incorporando…' : 'Confirmar e incorporar'}
      </Button>

    </div>}
    {!uncertain && !duplicate && !discardConfirm && <Button type="button" className="min-h-11" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>}
  </div>;
}
