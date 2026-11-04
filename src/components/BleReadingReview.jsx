import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { useFemometer } from '@/contexts/FemometerContext';
import { normalizeBleMeasurement, prepareManualBleDraft } from '@/lib/bleMeasurements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// The same explicit-confirmation flow for the global notice and Devices.
// Mounted with a reading key so editing one reading never edits another draft.
export function BleReadingReview({ userId, reading, onClose }) {
  const { sessionRef, incorporateReading } = useFemometer();
  const { currentCycle, isLoading, incorporateBleMeasurement } = useCycleData();
  const navigate = useNavigate();
  const measurement = reading.normalized ?? normalizeBleMeasurement(reading, 'BM-Vinca2');
  const [draft, setDraft] = useState(() => ({ isoDate: measurement?.time ? measurement.device_timestamp.slice(0, 10) : '',
    time: measurement?.time || '', confirmed: false }));
  const [error, setError] = useState(reading.reviewError ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const cycleRef = useRef(currentCycle);
  cycleRef.current = currentCycle;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = patch => { setError(null); setDraft({ ...draft, ...patch, confirmed: false }); };
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const session = sessionRef.current;
    const cycleId = currentCycle?.id;
    const allowPossibleDuplicate = error?.code === 'ble-possible-duplicate';
    setError(null);
    try {
      if (isLoading || !cycleId || !session) throw new Error('Espera a que se cargue el ciclo actual.');
      const payload = prepareManualBleDraft(measurement, { ...draft, userId, cycleId, nowMs: Date.now() });
      await incorporateReading(reading.uiId, () => incorporateBleMeasurement(payload, { allowPossibleDuplicate }));
      if (mounted.current && sessionRef.current === session && cycleRef.current?.id === cycleId) onClose();
    } catch (failure) {
      if (mounted.current && sessionRef.current === session) setError({ code: failure?.code,
        message: failure?.title ? failure.message : 'No se pudo incorporar. Comprueba la fecha, el ciclo y la conexión antes de reintentar.' });
    } finally {
      busyRef.current = false;
      if (mounted.current && sessionRef.current === session) setBusy(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent className="w-[calc(100%-32px)] max-w-md rounded-3xl">
      <DialogHeader><DialogTitle>Revisar temperatura</DialogTitle>
        <DialogDescription>Confirma la fecha y hora reales antes de guardar. Esta confirmación no verifica el reloj del termómetro.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <p className="font-semibold">{measurement?.temperature} °C · BM-Vinca2</p>
        <p className="text-sm text-slate-600">Fecha original: {measurement?.device_timestamp || 'No disponible'}</p>
        <label className="block text-sm">Fecha<Input type="date" value={draft.isoDate} disabled={busy} onChange={event => change({ isoDate: event.target.value })} /></label>
        <label className="block text-sm">Hora<Input type="time" value={draft.time} disabled={busy} onChange={event => change({ time: event.target.value })} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.confirmed} disabled={busy}
          onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />Confirmo la fecha y hora reales y autorizo guardar esta temperatura en el registro.</label>
        {error && <p role="alert" className="text-sm text-amber-800">{error.code === 'ble-possible-duplicate' ? 'Posible duplicado' : 'Requiere revisión'}: {error.message}</p>}
        {error?.code === 'ble-import-conflict' && <Button variant="outline" onClick={() => { onClose(); navigate('/records'); }}>Revisar ciclo en Mis registros</Button>}
        <Button disabled={!draft.confirmed || busy} onClick={confirm}>{busy ? 'Incorporando…' : error?.code === 'ble-possible-duplicate' ? 'Es otra medición: confirmar y guardar' : 'Confirmar e incorporar'}</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

export default BleReadingReview;
