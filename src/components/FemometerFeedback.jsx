import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BleSavedNotice } from './BleSavedNotice';
import { useClockIssue } from './useClockIssue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Mounted with the authenticated BLE owner, not with any route.
export function FemometerFeedback({ sessionState, sessionRef, readings, clockHistory, clockDialogOpen, setClockDialogOpen, openReadingReview }) {
  const navigate = useNavigate();
  const savedIds = useRef(new Set());
  const [notice, setNotice] = useState(null);
  const location = useLocation();
  useEffect(() => { setNotice(null); }, [location.key]);
  const savedBatch = useRef({ time: 0, count: 0 });
  const { status, clockResult, clockError, clockBusy, capabilities } = sessionState;
  const { issue, verified } = useClockIssue(sessionState, clockHistory);
  const operationLock = useRef(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState(null);
  const connecting = ['checking', 'searching', 'connecting', 'inspecting', 'stopping'].includes(status);
  const busy = sessionState.configurationBusy || sessionState.bindingBusy || sessionState.volumeBusy || sessionState.measurementModeBusy || sessionState.deviceInfoBusy || working || clockBusy || sessionState.busy || connecting;
  const run = async operation => {
    if (operationLock.current || busy) return;
    if (operation === 'syncClock' && (status !== 'listening' || !capabilities?.clockSync)) return;
    operationLock.current = true;
    setWorking(true); setActionError(null);
    try { await sessionRef.current?.[operation](); }
    catch (error) { setActionError(error?.message || 'No se pudo completar la operación. Puedes reintentarlo.'); }
    finally { operationLock.current = false; setWorking(false); }
  };
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
  const connected = status === 'listening' && sessionState.listenerResult?.connectionReady === true && sessionState.listenerResult?.indicationsActive === true;
  const reconnect = sessionState.gattReconnectRequired || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired;
  return <><BleSavedNotice notice={notice} onDismiss={() => setNotice(null)}
    onViewDay={isoDate => navigate('/records', { state: { selectedDate: isoDate, scrollToDayDetail: true } })} /><Dialog open={clockDialogOpen} onOpenChange={setClockDialogOpen}>
    <DialogContent className="top-[calc(env(safe-area-inset-top,0px)+16px)] max-h-[85dvh] w-[calc(100%-32px)] max-w-md translate-y-0 overflow-y-auto rounded-3xl motion-reduce:animate-none">
      <DialogHeader><DialogTitle>Reloj del termómetro</DialogTitle>
        <DialogDescription>El reloj puede diferir del móvil. Sincronizarlo no verifica ni corrige las fechas de mediciones anteriores.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm">
        {clockResult?.phoneLocalTime && <p>Hora del móvil al consultar: {clockResult.phoneLocalTime}</p>}
        {clockResult?.deviceLocalTime && <p>Hora leída del termómetro: {clockResult.deviceLocalTime}</p>}
        {issue && <p className="text-amber-800">{clockResult?.significantDrift || clockHistory?.state === 'misaligned'
          ? 'Se ha comprobado una desviación significativa del reloj.'
          : 'Hay una incidencia pendiente al comprobar o ajustar el reloj.'}</p>}
        {!connected && <p>Conecta el termómetro primero. Los desfases superiores a 24 horas se intentan corregir al conectar.</p>}
        {busy && <p role="status">{sessionState.configurationBusy ? 'Preparando ajustes…' : clockBusy || (working && connected) ? 'Sincronizando / comprobando el reloj…' : 'Conectando con el termómetro…'}</p>}
        {(clockError || actionError) && <p role="alert" className="text-amber-800">{actionError || clockError.message || 'No se pudo comprobar o ajustar el reloj. Puedes reintentarlo.'}</p>}
        {!connected && sessionState.error && <p role="alert">{sessionState.error.code === 'CONNECTION_CANCELLED' ? 'Conexión cancelada.' : sessionState.error.message || 'No se pudo conectar.'}</p>}
        {status === 'missing' && <p role="status">Termómetro no encontrado. Acércalo y vuelve a conectar.</p>}
        {!busy && verified && <p role="status">La lectura del reloj confirma que la hora es correcta.</p>}
        {!busy && clockResult?.operation === 'sync' && !verified && <p role="status">{clockResult.significantDrift
          ? 'La comprobación sigue mostrando una desviación. Puedes reintentarlo.'
          : 'El ajuste no tiene una verificación válida. La incidencia sigue pendiente.'}</p>}
        {connected && !capabilities?.clockSync && <p>Este dispositivo no permite ajustar el reloj desde la aplicación. Revisa las opciones en Dispositivos.</p>}
      </div>
      <DialogFooter className="flex-wrap">
        <Button variant="outline" onClick={() => setClockDialogOpen(false)}>Cerrar</Button>
        <Button variant="outline" onClick={() => { setClockDialogOpen(false); navigate('/settings/devices'); }}>Dispositivos</Button>
        {!connected && <Button disabled={busy} onClick={() => void run(sessionState.remembered ? 'start' : 'scan')}>Conectar</Button>}
        {connected && reconnect && <Button disabled={busy} onClick={() => void run('restart')}>Recuperar conexión</Button>}
        {connected && capabilities?.clockSync && <Button disabled={Boolean(busy || reconnect)} onClick={() => void run('syncClock')}>Sincronizar y verificar</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog></>;
}

export default FemometerFeedback;
