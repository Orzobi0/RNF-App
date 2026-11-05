import React from 'react';
import { Button } from '@/components/ui/button';
import { measurementDisplay, measurementSourceLabel } from '@/lib/temperatureMeasurements';
import { Input } from '@/components/ui/input';

export function BleReadingReviewView({
  reading,
  draft,
  busy,
  error,
  checkedUncertain,
  check = { status: 'idle' }, canCheck = false, onCheck, onAlreadyStored, onMissing,
  duplicateApproved = false, discardConfirm = false, onDifferent, onRepeated, onCancelDiscard, onDiscard,
  change,
  confirm,
  onClose,
  navigate,
}) {
  return (
    <div aria-label="Revisar temperatura">
      <div className="space-y-3">

        {reading.importStatus === 'uncertain' && (
          <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm" aria-label="Comprobar guardado incierto">
            <p>No pudimos confirmar el guardado de {reading.temperatureC ?? reading.normalized?.temperature} °C. No se repetirá automáticamente.</p>
            {canCheck ? <p>Día del intento: {reading.attempt.isoDate} · {reading.attempt.time}. Se consulta su ciclo original.</p>
              : <p>Este intento antiguo no conserva un destino seguro. Revisa Mis registros; no se puede autorizar otro guardado desde aquí.</p>}
            {canCheck && <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy || check.status === 'loading'} onClick={onCheck}>
              {check.status === 'loading' ? 'Consultando servidor…' : 'Consultar / actualizar el día'}</Button>}
            {check.status === 'error' && <p role="alert">{check.message} Puedes reintentar la consulta.</p>}
            {check.status === 'complete' && <div className="space-y-2" aria-live="polite">
              <p>Consulta completa del servidor. Compara las mediciones; una coincidencia no demuestra que sea la misma toma.</p>
              {check.result.measurements.length ? <ul className="max-h-40 space-y-2 overflow-y-auto">
                {check.result.measurements.map((item, index) => <li key={item.id ?? index} className="rounded-xl border border-rose-200 bg-white p-2">
                  <span className="font-semibold text-rose-700">{measurementDisplay(item)}</span> · {item.time || 'Hora no disponible'}
                  <span className="block text-xs text-slate-600">{measurementSourceLabel(item) || 'Procedencia no disponible'}{item.source === 'bluetooth' ? ' · Bluetooth' : ''}{item.selected === true ? ' · Seleccionada' : ''}</span>
                </li>)}
              </ul> : <p>{check.result.exists ? 'El día no contiene mediciones.' : 'No existe un registro para ese día.'}</p>}
            </div>}
            <p className="font-semibold">¿La temperatura pendiente ya está guardada?</p>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy || check.status !== 'complete'} onClick={onAlreadyStored}>Sí, ya está guardada</Button>
              <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy || check.status !== 'complete'} onClick={onMissing}>No, falta incorporarla</Button>
              <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onClose}>Decidir más tarde</Button>
            </div>
            {checkedUncertain && <p>Has indicado que falta incorporarla. Revisa los datos y confirma abajo.</p>}
            <Button type="button" variant="ghost" onClick={() => { onClose(); navigate('/records', { state: { selectedDate: reading.attempt?.isoDate || draft.isoDate, scrollToDayDetail: true } }); }}>Ver Mis registros</Button>
          </section>
        )}

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

        {error?.code === 'ble-possible-duplicate' && <section aria-label="Posible duplicado" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
          <p>Hay una posible coincidencia. Puedes revisar la fecha y la hora antes de confirmar.</p>
          <p className="font-semibold">¿Es una medición diferente?</p>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy} onClick={onDifferent}>Sí, es otra medición</Button>
            <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy} onClick={onRepeated}>No, está repetida</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          </div>
          {duplicateApproved && <p>Autorizada como otra medición para estos datos. Confirma la incorporación abajo.</p>}
        </section>}
        {discardConfirm && <section className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm">
          <p>¿Retirar esta temperatura de las pendientes? No se borrará ningún registro guardado.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={onDiscard}>Confirmar descarte local</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancelDiscard}>Cancelar</Button>
        </section>}

        {error && error.code !== 'ble-possible-duplicate' && (
          <p role="alert" className="text-sm text-amber-800">
            {error.code === 'ble-possible-duplicate'
              ? 'Posible duplicado'
              : 'Requiere revisión'}: {error.message}
          </p>
        )}

        {error?.code === 'ble-import-conflict' && (
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              navigate('/records');
            }}
          >
            Revisar ciclo en Mis registros
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11 rounded-full bg-fertiliapp-fuerte px-4 text-white hover:brightness-95"
            disabled={
              busy ||
              !draft.isoDate ||
              !draft.time ||
              (reading.importStatus === 'uncertain' && !checkedUncertain) ||
              (error?.code === 'ble-possible-duplicate' && !duplicateApproved) || discardConfirm
            }
            onClick={confirm}
          >
            {busy
              ? 'Incorporando…'
              : error?.code === 'ble-possible-duplicate'
                ? 'Es otra medición: confirmar y guardar'
                : 'Confirmar e incorporar'}
          </Button>

          <Button
            type="button"
            className="min-h-11"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}