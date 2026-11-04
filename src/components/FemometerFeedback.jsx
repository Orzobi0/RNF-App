import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Thermometer, Check } from 'lucide-react';

// Mounted with the authenticated BLE owner, not with any route.
export function FemometerFeedback({ sessionState, sessionRef, readings, clockDialogOpen, setClockDialogOpen, openReadingReview }) {
  const navigate = useNavigate();
  const noticedConnection = useRef(null);
  const receivedIds = useRef(new Set());
  const savedIds = useRef(new Set());
  const notice = useRef(null);
  const batch = useRef({ time: 0, count: 0 });
  const savedBatch = useRef({ time: 0, count: 0 });
  const { status, listenerResult, clockResult, clockError, clockBusy, capabilities } = sessionState;
  useEffect(() => {
    if (status === 'listening' && clockResult?.significantDrift && listenerResult
      && noticedConnection.current !== listenerResult) {
      noticedConnection.current = listenerResult;
      setClockDialogOpen(true);
    }
  }, [status, listenerResult, clockResult?.significantDrift, setClockDialogOpen]);
  useEffect(() => {
    const received = readings.filter(row => !receivedIds.current.has(row.uiId));
    const saved = readings.filter(row => row.importStatus === 'incorporated' && !savedIds.current.has(row.uiId));
    received.forEach(row => receivedIds.current.add(row.uiId));
    saved.forEach(row => savedIds.current.add(row.uiId));
    if (saved.length) {
      batch.current = { time: 0, count: 0 };
      const last = saved.at(-1);
      const now = Date.now();
      const grouped = now - savedBatch.current.time < 2500;
      const count = (grouped ? savedBatch.current.count : 0) + saved.length;
      const props = { title: count === 1 ? 'Temperatura incorporada' : `${count} temperaturas incorporadas`,
        className: 'rounded-2xl border-rose-100 bg-white shadow-md',
        description: <span className="flex items-center gap-2"><Thermometer className="h-4 w-4 shrink-0" aria-hidden="true" /><Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          {last.normalized?.temperature ?? last.temperatureC} °C · {last.savedTime || ''} · {last.savedIsoDate}. Guardado confirmado.</span>, duration: 5000,
        action: <ToastAction altText="Ver día" onClick={() => navigate('/records', { state: { selectedDate: last.savedIsoDate, scrollToDayDetail: true } })}>Ver día</ToastAction> };
      if (grouped && notice.current) notice.current.update(props);
      else { notice.current?.dismiss(); notice.current = toast(props); }
      savedBatch.current = { time: now, count };
    } else if (received.length) {
      const now = Date.now();
      const grouped = now - batch.current.time < 2500;
      const count = (grouped ? batch.current.count : 0) + received.length;
      savedBatch.current = { time: 0, count: 0 };
      const firstPending = readings.find(row => row.importStatus === 'pending');
      const reason = firstPending?.normalized?.device_date_reliability === 'invalid' ? 'Fecha del termómetro inválida.'
        : firstPending?.normalized?.device_date_reliability === 'missing' ? 'Falta la fecha del termómetro.' : 'No se puede verificar la fecha histórica del termómetro.';
      const props = { title: count === 1 ? 'Revisar temperatura' : `${count} temperaturas por revisar`,
        className: 'rounded-2xl border-rose-100 bg-white shadow-md',
        description: `${firstPending?.normalized?.temperature ?? firstPending?.temperatureC ?? ''} °C. ${reason}`, duration: 6000,
        action: <ToastAction altText="Revisar y guardar" onClick={() => openReadingReview?.(firstPending?.uiId)}>Revisar y guardar</ToastAction> };
      if (grouped && notice.current) notice.current.update(props);
      else notice.current = toast(props);
      batch.current = { time: now, count };
    }
  }, [readings, navigate, openReadingReview]);
  useEffect(() => () => notice.current?.dismiss(), []);
  const connected = status === 'listening';
  return <Dialog open={clockDialogOpen} onOpenChange={setClockDialogOpen}>
    <DialogContent className="w-[calc(100%-32px)] max-w-md rounded-3xl">
      <DialogHeader><DialogTitle>Reloj del termómetro</DialogTitle>
        <DialogDescription>El reloj puede diferir del móvil. Sincronizarlo no verifica ni corrige las fechas de mediciones anteriores.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm">
        {clockResult?.phoneLocalTime && <p>Hora del móvil al consultar: {clockResult.phoneLocalTime}</p>}
        {clockResult?.deviceLocalTime && <p>Hora leída del termómetro: {clockResult.deviceLocalTime}</p>}
        {!connected && <p role="status">Conecta el termómetro para sincronizar el reloj.</p>}
        {clockBusy && <p role="status">Comprobando el reloj…</p>}
        {clockError && <p role="alert" className="text-amber-800">{clockError.message || 'No se pudo ajustar el reloj. Puedes reintentarlo.'}</p>}
        {clockResult?.operation === 'sync' && <p role="status">{clockResult.verified
          ? 'Sincronización verificada mediante lectura.' : 'Ajuste enviado, pero no verificado mediante lectura.'}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setClockDialogOpen(false)}>Más tarde</Button>
        {capabilities?.clockSync && <Button disabled={!connected || clockBusy} onClick={() => sessionRef.current?.syncClock()}>Sincronizar reloj</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default FemometerFeedback;
