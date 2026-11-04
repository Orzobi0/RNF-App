import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BleSavedNotice } from './BleSavedNotice';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Mounted with the authenticated BLE owner, not with any route.
export function FemometerFeedback({ sessionState, sessionRef, readings, clockDialogOpen, setClockDialogOpen, openReadingReview }) {
  const navigate = useNavigate();
  const noticedConnection = useRef(null);
  const savedIds = useRef(new Set());
  const [notice, setNotice] = useState(null);
  const location = useLocation();
  useEffect(() => { setNotice(null); }, [location.key]);
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
    const saved = readings.filter(row => row.importStatus === 'incorporated' && !savedIds.current.has(row.uiId));
    saved.forEach(row => savedIds.current.add(row.uiId));
    if (saved.length) {
      const last = saved.at(-1);
      const now = Date.now();
      const grouped = now - savedBatch.current.time < 2500;
      const count = (grouped ? savedBatch.current.count : 0) + saved.length;
      setNotice({ count, temperature: last.normalized?.temperature ?? last.temperatureC,
        time: last.savedTime || '', isoDate: last.savedIsoDate });
      savedBatch.current = { time: now, count };
    }
  }, [readings, navigate, openReadingReview]);
  const connected = status === 'listening';
  return <><BleSavedNotice notice={notice} onDismiss={() => setNotice(null)}
    onViewDay={isoDate => navigate('/records', { state: { selectedDate: isoDate, scrollToDayDetail: true } })} /><Dialog open={clockDialogOpen} onOpenChange={setClockDialogOpen}>
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
  </Dialog></>;
}

export default FemometerFeedback;
