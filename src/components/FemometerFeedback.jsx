import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BleSavedNotice } from './BleSavedNotice';
import { useClockIssue } from './useClockIssue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Presentation only: local wall-clock fields must never pass through Date/UTC.
export const formatClockLocalTime = value => {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 'No disponible';
  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return 'No disponible';
  return `${day}/${month}/${year} · ${hour}:${minute}:${second}`;
};

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
    <DialogContent className="[&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:right-1 [&>button:last-child]:top-1 motion-reduce:animate-none top-[calc(env(safe-area-inset-top,0px)+16px)] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-32px)] w-[calc(100%-32px)] max-w-md translate-y-0 overflow-y-auto rounded-3xl">
      <DialogHeader className="pr-5 text-left"><DialogTitle>Reloj del termómetro</DialogTitle>
        <DialogDescription>El reloj puede diferir del móvil. Sincronizarlo no verifica ni corrige las fechas de mediciones anteriores.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm">
        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">
          <div className="py-3"><dt className="text-sm text-slate-500">Hora del móvil</dt><dd className="mt-1 font-medium tabular-nums text-titulo">{formatClockLocalTime(clockResult?.phoneLocalTime)}</dd></div>
          <div className="py-3"><dt className="text-sm text-slate-500">Hora del termómetro</dt><dd className="mt-1 font-medium tabular-nums text-titulo">{formatClockLocalTime(clockResult?.deviceLocalTime)}</dd></div>
        </dl>
        {issue && <p className="text-amber-800">{clockResult?.significantDrift || clockHistory?.state === 'misaligned'
          ? 'Se ha detectado una desviación en el reloj.'
          : 'Hay una incidencia pendiente al comprobar o ajustar el reloj.'}</p>}
        {!connected && <p>Conecta el termómetro primero. Los desfases superiores a 24 horas se intentan corregir al conectar.</p>}
        {busy && <p role="status">{sessionState.configurationBusy ? 'Preparando ajustes…' : clockBusy || (working && connected) ? 'Sincronizando / comprobando el reloj…' : 'Conectando con el termómetro…'}</p>}
        {(clockError || actionError) && <p role="alert" className="text-amber-800">{actionError || clockError.message || 'No se pudo comprobar o ajustar el reloj. Puedes reintentarlo.'}</p>}
        {!connected && sessionState.error && <p role="alert">{sessionState.error.code === 'CONNECTION_CANCELLED' ? 'Conexión cancelada.' : sessionState.error.message || 'No se pudo conectar.'}</p>}
        {status === 'missing' && <p role="status">Termómetro no encontrado. Acércalo y vuelve a conectar.</p>}
        {!busy && verified && <p role="status">{clockResult?.operation === 'sync' && clockResult?.verified === true ? 'Fecha y hora sincronizadas y verificadas' : 'La hora del termómetro parece correcta'}</p>}
        {!busy && clockResult?.operation === 'sync' && !verified && <p role="status">{clockResult.significantDrift
          ? 'La comprobación sigue mostrando una desviación. Puedes reintentarlo.'
          : 'El ajuste no tiene una verificación válida. La incidencia sigue pendiente.'}</p>}
        {connected && !capabilities?.clockSync && <p>Este dispositivo no permite ajustar el reloj desde la aplicación. Revisa las opciones en Dispositivos.</p>}
      </div>
      <DialogFooter className="flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-col sm:space-x-0">
        <div className="flex flex-wrap justify-end gap-2">
          {connected && capabilities?.clockSync && <Button variant={issue ? 'default' : 'outline'} className={`min-h-11 h-auto max-w-full whitespace-normal rounded-xl px-4 py-2 ${issue ? 'bg-fertiliapp-fuerte text-white hover:brightness-95' : ''}`} disabled={Boolean(busy || reconnect)} onClick={() => void run('syncClock')}>Sincronizar y verificar</Button>}
          {!connected && <Button className="min-h-11 rounded-xl" disabled={busy} onClick={() => void run(sessionState.remembered ? 'start' : 'scan')}>Conectar</Button>}
          {connected && reconnect && <Button className="min-h-11 h-auto whitespace-normal rounded-xl" disabled={busy} onClick={() => void run('restart')}>Recuperar conexión</Button>}
          <Button variant={issue ? 'ghost' : 'default'} className={`min-h-11 rounded-xl ${!issue ? 'bg-fertiliapp-fuerte text-white hover:brightness-95' : ''}`} onClick={() => setClockDialogOpen(false)}>Cerrar</Button>
        </div>
        <Button variant="link" className="min-h-11 self-start px-0 text-sm text-slate-600" onClick={() => { setClockDialogOpen(false); navigate('/settings/devices'); }}>Ir a dispositivos</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog></>;
}

export default FemometerFeedback;
