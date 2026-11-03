import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Mounted with the authenticated BLE owner, not with any route.
export function FemometerFeedback({ sessionState, sessionRef, readings, clockDialogOpen, setClockDialogOpen }) {
  const navigate = useNavigate();
  const noticedConnection = useRef(null);
  const receivedIds = useRef(new Set());
  const savedIds = useRef(new Set());
  const notice = useRef(null);
  const batch = useRef({ time: 0, count: 0 });
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
      notice.current?.dismiss();
      batch.current = { time: 0, count: 0 };
      const last = saved.at(-1);
      notice.current = toast({ title: saved.length === 1 ? 'Temperatura incorporada' : 'Temperaturas incorporadas',
        description: 'Guardado confirmado en tu registro.', duration: 5000,
        action: <ToastAction altText="Ver registro" onClick={() => navigate('/records', { state: { selectedDate: last.savedIsoDate } })}>Ver registro</ToastAction> });
    } else if (received.length) {
      const now = Date.now();
      const grouped = now - batch.current.time < 2500;
      const count = (grouped ? batch.current.count : 0) + received.length;
      const props = { title: count === 1 ? 'Temperatura recibida' : 'Temperaturas recibidas',
        description: `${count} ${count === 1 ? 'lectura recibida' : 'lecturas recibidas'}. Revisa y confirma para guardar.`, duration: 5000,
        action: <ToastAction altText="Abrir dispositivos" onClick={() => navigate('/settings/devices')}>Dispositivos</ToastAction> };
      if (grouped && notice.current) notice.current.update(props);
      else notice.current = toast(props);
      batch.current = { time: now, count };
    }
  }, [readings, navigate]);
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
