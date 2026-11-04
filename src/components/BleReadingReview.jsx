import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { useFemometer } from '@/contexts/FemometerContext';
import { normalizeBleMeasurement, prepareManualBleDraft } from '@/lib/bleMeasurements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// The same explicit-confirmation flow for the global notice and Devices.
// Mounted with a reading key so editing one reading never edits another draft.
export function BleReadingReview({ userId, reading, onClose, onSaved }) {
  const { sessionRef, incorporateReading, updateReadingDraft } = useFemometer();
  const { currentCycle, isLoading, incorporateBleMeasurement } = useCycleData();
  const navigate = useNavigate();
  const measurement = reading.normalized ?? normalizeBleMeasurement(reading, 'BM-Vinca2');
  const [draft, setDraft] = useState(() => ({ isoDate: measurement?.time ? measurement.device_timestamp.slice(0, 10) : '',
    time: measurement?.time || '', ...reading.draft, confirmed: false }));
  const [checkedUncertain, setCheckedUncertain] = useState(false);
  const [error, setError] = useState(reading.reviewError ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const cycleRef = useRef(currentCycle);
  cycleRef.current = currentCycle;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = patch => {
    const next = { ...draft, ...patch, confirmed: false };
    setError(null); setDraft(next); updateReadingDraft?.(reading.uiId, next);
  };
  const confirm = async () => {
    if (busyRef.current) return;
    if (reading.importStatus === 'uncertain' && !checkedUncertain) return;
    busyRef.current = true; setBusy(true);
    const session = sessionRef.current;
    const cycleId = currentCycle?.id;
    const allowPossibleDuplicate = error?.code === 'ble-possible-duplicate';
    setError(null);
    try {
      if (isLoading || !cycleId || !session) throw new Error('Espera a que se cargue el ciclo actual.');
      const payload = prepareManualBleDraft(measurement, { ...draft, userId, cycleId, nowMs: Date.now() });
      await incorporateReading(reading.uiId, () => incorporateBleMeasurement(payload, { allowPossibleDuplicate }), { reviewedUncertain: checkedUncertain });
      if (mounted.current && sessionRef.current === session && cycleRef.current?.id === cycleId) (onSaved ?? onClose)();
    } catch (failure) {
      if (mounted.current && sessionRef.current === session) setError({ code: failure?.code,
        message: failure?.title ? failure.message : 'No se pudo incorporar. Comprueba la fecha, el ciclo y la conexión antes de reintentar.' });
    } finally {
      busyRef.current = false;
      if (mounted.current && sessionRef.current === session) setBusy(false);
    }
  };
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
          onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />Confirmo la fecha y hora reales y autorizo guardar esta temperatura en el registro.</label>
        {error && <p role="alert" className="text-sm text-amber-800">{error.code === 'ble-possible-duplicate' ? 'Posible duplicado' : 'Requiere revisión'}: {error.message}</p>}
        {error?.code === 'ble-import-conflict' && <Button variant="outline" onClick={() => { onClose(); navigate('/records'); }}>Revisar ciclo en Mis registros</Button>}
        <Button className="min-h-11" disabled={!draft.confirmed || busy || (reading.importStatus === 'uncertain' && !checkedUncertain)} onClick={confirm}>{busy ? 'Incorporando…' : error?.code === 'ble-possible-duplicate' ? 'Es otra medición: confirmar y guardar' : 'Confirmar e incorporar'}</Button>
        <Button className="min-h-11" variant="ghost" disabled={busy} onClick={() => { setDraft({ ...draft, confirmed: false }); onClose(); }}>Cancelar</Button>
      </div>
  </div>;
}

export default BleReadingReview;
