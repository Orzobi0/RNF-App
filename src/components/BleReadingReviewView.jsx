import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function BleReadingReviewView({ measurement, reading, draft, busy, error, checkedUncertain, setCheckedUncertain, change, onConfirmation, confirm, onClose, navigate }) {
  return <div aria-label="Revisar temperatura">
      <p className="mb-3 text-xs text-slate-500">Confirma la fecha y hora reales antes de guardar. Esta confirmación no verifica el reloj del termómetro.</p>
      <div className="space-y-3">
        <p className="font-semibold">{measurement?.temperature} °C · BM-Vinca2</p>
        <p className="text-sm text-slate-600">Fecha original: {measurement?.device_timestamp || 'No disponible'}</p>
        {reading.importStatus === 'uncertain' && <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
          <p>El resultado del intento anterior es incierto. Comprueba el día antes de repetirlo.</p>
          <Button variant="outline" onClick={() => navigate('/records', { state: { selectedDate: draft.isoDate, scrollToDayDetail: true } })}>Comprobar día</Button>
          <label className="flex gap-2"><input type="checkbox" checked={checkedUncertain} onChange={event => setCheckedUncertain(event.target.checked)} />He comprobado el registro y quiero reintentar manualmente.</label>
        </div>}
        <label className="block text-sm">Fecha<Input type="date" value={draft.isoDate} disabled={busy} onChange={event => change({ isoDate: event.target.value })} /></label>
        <label className="block text-sm">Hora<Input type="time" value={draft.time} disabled={busy} onChange={event => change({ time: event.target.value })} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.confirmed} disabled={busy}
          onChange={event => onConfirmation(event.target.checked)} />Confirmo la fecha y hora reales y autorizo guardar esta temperatura en el registro.</label>
        {error && <p role="alert" className="text-sm text-amber-800">{error.code === 'ble-possible-duplicate' ? 'Posible duplicado' : 'Requiere revisión'}: {error.message}</p>}
        {error?.code === 'ble-import-conflict' && <Button variant="outline" onClick={() => { onClose(); navigate('/records'); }}>Revisar ciclo en Mis registros</Button>}
        <Button className="min-h-11" disabled={!draft.confirmed || busy || (reading.importStatus === 'uncertain' && !checkedUncertain)} onClick={confirm}>{busy ? 'Incorporando…' : error?.code === 'ble-possible-duplicate' ? 'Es otra medición: confirmar y guardar' : 'Confirmar e incorporar'}</Button>
        <Button className="min-h-11" variant="ghost" disabled={busy} onClick={() => { onConfirmation(false); onClose(); }}>Cancelar</Button>
      </div>
  </div>;
}
