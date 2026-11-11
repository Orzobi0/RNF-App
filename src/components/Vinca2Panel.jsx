import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clock3, Info, Thermometer, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Diagnostics from '@/components/Vinca2Diagnostics';

export const vinca2StatusText = (status, session = {}) => status === 'listening' && (!session.listenerResult?.connectionReady || !session.listenerResult?.indicationsActive) ? 'Preparando conexión…' : ({
  checking: 'Consultando vinculación…', idle: 'Desconectado', stopped: 'Desconectado',
  searching: 'Buscando termómetro…', inspecting: 'Comprobando compatibilidad…',
  binding: 'Vinculando termómetro…', connecting: 'Conectando…', listening: 'Preparado para recibir temperaturas.', stopping: 'Deteniendo…',
  missing: 'Termómetro no encontrado', error: 'No se pudo completar la conexión',
})[status] || 'Desconectado';

const Vinca2Panel = () => {
  const { sessionRef, sessionState, pendingCount, openReadingReview, openClockDialog, clockHistory } = useFemometer();
  const { status, remembered, inspectionResult, capabilities } = sessionState;
  const [confirmForget, setConfirmForget] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState(null);
  const operationLock = useRef(false);
  const listening = status === 'listening';
  const busy = sessionState.configurationBusy || sessionState.bindingBusy || working || sessionState.busy || sessionState.clockBusy || sessionState.deviceInfoBusy || sessionState.volumeBusy || sessionState.measurementModeBusy || sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status);
  useEffect(() => {
    if (window.location.hash !== '#bluetooth-readings') return undefined;
    const frame = requestAnimationFrame(() => document.getElementById('bluetooth-readings')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const run = async (operation, argument) => {
    if (operation === 'unlink' ? sessionState.bindingBusy : operationLock.current || busy) return;
    if (listening && !['restart', 'stop', 'readClock', 'syncClock', 'readDeviceInfo', 'setVolume', 'setMeasurementMode', 'unlink'].includes(operation)) return;
    operationLock.current = true;
    setWorking(true); setActionError(null);
    try {
      const completed = await sessionRef.current?.[operation](argument);
      if (operation === 'unlink' && completed) setConfirmForget(false);
      if (operation === 'remember' && argument) setConfirmForget(false);
    } catch (error) {
      setActionError(error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  const retry = ['error', 'missing'].includes(status);
  const operation = listening ? 'restart' : 'start';
  const recover = sessionState.gattReconnectRequired || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired;
  const primaryLabel = sessionState.configurationBusy ? 'Preparando ajustes…' : busy ? (['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status) ? vinca2StatusText(status, sessionState) : 'Preparando…')
    : listening ? recover ? 'Recuperar conexión' : 'Reiniciar escucha' : retry ? 'Reintentar' : 'Conectar';
  const clockLabel = ({ synchronized_verified: 'Sincronización verificada', read_correct: 'Hora aparentemente correcta', misaligned: 'Desajustado' })[clockHistory?.state] || 'Sin verificar';
  const volumeLabels = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
  const volumeResult = listening && sessionState.volumeResult?.commandsAccepted ? sessionState.volumeResult : null;
  const volumeReady = listening && sessionState.listenerResult?.connectionReady && sessionState.listenerResult?.indicationsActive;
  const measurementModeLabels = { quick: 'Rápido', normal: 'Normal', precise: 'Preciso' };
  const measurementModeResult = listening && sessionState.measurementModeResult?.commandsAccepted ? sessionState.measurementModeResult : null;
  const measurementModeReady = listening && sessionState.listenerResult?.connectionReady && sessionState.listenerResult?.indicationsActive;
  const rowClass = 'flex min-h-14 w-full items-center gap-3 py-4 text-left text-sm disabled:opacity-50';
  return <div id="bluetooth-readings" className="min-w-0 bg-white text-slate-700">
    <div className="flex items-center gap-4 pb-5 pt-1">
      <img src="/images/vinca2.jpg" alt="Femometer Vinca 2 con funda rosa" width="56" height="88" className="h-[88px] w-14 shrink-0 object-contain" />
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-titulo">Femometer Vinca 2</h2>
        <p className="mt-2 text-sm font-medium">{remembered === null ? 'Consultando vinculación…' : remembered ? 'Vinculado' : 'Sin configurar'}</p>
        <p role="status" className={`mt-1 text-sm ${retry ? 'text-amber-800' : listening && !sessionState.configurationBusy ? 'text-fertiliapp-fuerte' : 'text-slate-600'}`}>{sessionState.configurationBusy ? 'Preparando ajustes…' : vinca2StatusText(status, sessionState)}</p>
        {listening && sessionState.configurationIssue && !sessionState.configurationBusy && <p className="text-xs text-amber-800">La recepción está activa; revisa los ajustes pendientes.</p>}
      </div>
    </div>
    {(actionError || sessionState.error) && <div role="alert" className="mb-4 text-sm text-amber-800">
      <p>{actionError || sessionState.error?.message || 'No se pudo conectar. Vuelve a intentarlo.'}</p>
      {sessionState.error?.code === 'PERMISSION_NOT_GRANTED' && <p>Permite el acceso a Bluetooth al reintentar. Si el móvil ya no lo solicita, revisa los permisos de FertiliApp en los ajustes del teléfono.</p>}
      {sessionState.error?.code === 'BLUETOOTH_DISABLED' && <p>Activa Bluetooth en los ajustes del móvil y vuelve a intentarlo.</p>}
    </div>}
    <div className="flex flex-wrap items-center gap-2 pb-3">
    <Button type="button" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full px-4 py-2 whitespace-normal bg-fertiliapp-fuerte text-white hover:brightness-95"
      disabled={busy} onClick={() => run(operation)}>{primaryLabel}</Button>
    {listening && <Button type="button" variant="ghost" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full px-4 py-2 whitespace-normal" disabled={busy} onClick={() => run('stop')}>Detener escucha</Button>}
    </div>
    {pendingCount > 0 && <button type="button" className={`${rowClass} border-b border-slate-100 text-fertiliapp-fuerte`} onClick={() => openReadingReview()}>
      <Thermometer className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Temperaturas pendientes</span><span>{pendingCount}</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>}
    {sessionState.preferenceError && <p role="alert" className="py-2 text-sm text-amber-800">{sessionState.preferenceError}</p>}
    <section aria-labelledby="vinca-configuration" className="pt-6">
      <h3 id="vinca-configuration" className="text-base font-semibold text-titulo">Configuración</h3>
      <div className="divide-y divide-slate-100">
        <div>
          <button type="button" className={rowClass} onClick={openClockDialog}><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Reloj del termómetro<span className="mt-1 block text-sm text-slate-500">{clockLabel}</span></span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          {listening && <div className="space-y-2 pb-4 text-sm">
            <p className="text-xs text-slate-500">El ajuste utiliza la hora local del móvil. No corrige las fechas de lecturas anteriores.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full whitespace-normal px-4 py-2" disabled={busy || recover || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired || !capabilities?.clockRead} onClick={() => run('readClock')}>Leer reloj</Button>
              <Button variant="outline" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full whitespace-normal px-4 py-2" disabled={busy || recover || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired || !capabilities?.clockSync} onClick={() => run('syncClock')}>Sincronizar fecha y hora</Button>
            </div>
            {sessionState.clockBusy && <p role="status">Consultando/ajustando reloj…</p>}
            {sessionState.clockError && <p role="alert">{sessionState.clockError.message}</p>}
          </div>}
        </div>
        <details>
          <summary className={`${rowClass} cursor-pointer`}><span className="flex-1">Volumen</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <div role="group" aria-label="Nivel de volumen" className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-100">
              {Object.entries(volumeLabels).map(([level, label]) => <Button key={level} type="button" variant="outline"
                className={`relative min-h-11 min-w-0 rounded-none border-0 bg-transparent px-1 py-2 text-sm shadow-none hover:bg-slate-50 disabled:opacity-60 ${sessionState.preferences?.volume === level ? 'font-semibold text-fertiliapp-fuerte after:absolute after:bottom-0 after:left-1/3 after:right-1/3 after:h-0.5 after:bg-fertiliapp-fuerte' : 'text-slate-700'}`}
                aria-pressed={sessionState.preferences?.volume === level}
                disabled={Boolean(busy || recover || !volumeReady || !capabilities?.volumeWrite || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired)}
                onClick={() => run('setVolume', level)}>{label}{sessionState.preferences?.volume === level && <span className="sr-only"> (seleccionado)</span>}</Button>)}
            </div>
            <p role="status" className="pt-1 text-sm text-slate-600">{sessionState.volumeBusy ? 'Aplicando ajuste…'
              : sessionState.volumeError ? 'No se pudo confirmar el ajuste'
                : volumeResult && volumeResult.level === sessionState.preferences?.volume ? 'Aplicado en esta conexión'
                  : sessionState.preferences?.volume ? (!volumeReady ? 'Pendiente de aplicar al conectar' : 'Preferencia guardada') : 'Sin preferencia guardada'}</p>
            {volumeReady && !capabilities?.volumeWrite && <p className="text-sm text-amber-800">Este ajuste no está disponible en esta conexión.</p>}
            {sessionState.volumeError && <p role="alert" className="text-sm text-amber-800">{sessionState.volumeError.message}</p>}
          </div>
        </details>
        <details>
          <summary className={`${rowClass} cursor-pointer`}><span className="flex-1">Modo de medición</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <div role="group" aria-label="Modo de medición" className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-100">
              {Object.entries(measurementModeLabels).map(([level, label]) => <Button key={level} type="button" variant="outline"
                className={`relative min-h-11 min-w-0 rounded-none border-0 bg-transparent px-1 py-2 text-sm shadow-none hover:bg-slate-50 disabled:opacity-60 ${sessionState.preferences?.measurementMode === level ? 'font-semibold text-fertiliapp-fuerte after:absolute after:bottom-0 after:left-1/3 after:right-1/3 after:h-0.5 after:bg-fertiliapp-fuerte' : 'text-slate-700'}`}
                aria-pressed={sessionState.preferences?.measurementMode === level}
                disabled={Boolean(busy || recover || !measurementModeReady || !capabilities?.modeConfiguration || sessionState.measurementModeReconnectRequired || sessionState.volumeReconnectRequired)}
                onClick={() => run('setMeasurementMode', level)}>{label}{sessionState.preferences?.measurementMode === level && <span className="sr-only"> (seleccionado)</span>}</Button>)}
            </div>
            <p role="status" className="pt-1 text-sm text-slate-600">{sessionState.measurementModeBusy ? 'Aplicando ajuste…'
              : sessionState.measurementModeError ? 'No se pudo confirmar el ajuste'
                : measurementModeResult && measurementModeResult.level === sessionState.preferences?.measurementMode ? 'Aplicado en esta conexión'
                  : sessionState.preferences?.measurementMode ? (!measurementModeReady ? 'Pendiente de aplicar al conectar' : 'Preferencia guardada') : 'Sin preferencia guardada'}</p>
            {measurementModeReady && !capabilities?.modeConfiguration && <p className="text-sm text-amber-800">Este ajuste no está disponible en esta conexión.</p>}
            {sessionState.measurementModeError && <p role="alert" className="text-sm text-amber-800">{sessionState.measurementModeError.message}</p>}
          </div>
        </details>
        <details>
          <summary className={`${rowClass} cursor-pointer`}><Info className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Modelo y compatibilidad</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <p>Femometer Vinca 2 / BM-Vinca2. Modelo compatible con FertiliApp.</p>
            <Button type="button" variant="outline" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full px-3 py-2 text-sm"
              disabled={busy || recover || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired || !listening || !sessionState.listenerResult?.connectionReady || !sessionState.listenerResult?.indicationsActive}
              onClick={() => run('readDeviceInfo')}>Consultar datos</Button>
            {sessionState.deviceInfoBusy && <p role="status">Consultando datos…</p>}
            {sessionState.deviceInfoError && <p role="alert" className="text-xs text-amber-800">{sessionState.deviceInfoError.message}</p>}
            <dl className="divide-y divide-slate-100">
              {Object.entries({ battery: 'Batería', model: 'Modelo', manufacturer: 'Fabricante', firmware: 'Firmware', software: 'Software' }).map(([field, label]) => {
                const value = listening ? sessionState.deviceInfoResult?.[field] : null;
                return <div key={field} className="flex items-start justify-between gap-4 py-2"><dt>{label}</dt><dd className="min-w-0 break-words text-right text-slate-700">{value == null ? 'No disponible' : field === 'battery' ? `${value} %` : value}</dd></div>;
              })}
            </dl>
            {inspectionResult && sessionState.devices?.some(device => device.id === sessionState.selectedDeviceId && device.isRemembered) && <p>{inspectionResult.compatible ? 'Compatibilidad del dispositivo comprobada.' : 'El dispositivo inspeccionado no ha superado la comprobación.'}</p>}
            {capabilities?.clockRead && <p>Lectura del reloj anunciada.</p>}{capabilities?.clockSync && <p>Ajuste del reloj anunciado.</p>}
            {capabilities?.historyReceive && <p>Recepción de temperaturas históricas anunciada.</p>}{capabilities?.historyRequest && <p>Solicitud de historial anunciada.</p>}
            {capabilities?.modeConfiguration && <p>Configuración manual de modo disponible.</p>}
          </div>
        </details>
        {remembered && <button type="button" className={rowClass} disabled={Boolean(sessionState.bindingBusy)} onClick={() => setConfirmForget(true)}><Unlink className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Desvincular termómetro</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
    </section>
    <Dialog open={confirmForget} onOpenChange={setConfirmForget}><DialogContent className="[&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:right-1 [&>button:last-child]:top-1 motion-reduce:animate-none top-[calc(env(safe-area-inset-top,0px)+16px)] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-32px)] w-[calc(100%-32px)] max-w-md translate-y-0 overflow-y-auto rounded-2xl">
      <DialogHeader className="pr-5 text-left"><DialogTitle>Desvincular termómetro</DialogTitle><DialogDescription>Se quitará la vinculación de esta cuenta en este móvil. No se borrarán temperaturas pendientes ni registros guardados.</DialogDescription></DialogHeader>
      {listening && <p className="text-sm">Se detendrá la escucha antes de desvincular.</p>}
      {pendingCount > 0 && <p className="text-sm">Tienes {pendingCount} temperaturas pendientes conservadas localmente. Podrás seguir revisándolas.</p>}
      {sessionState.error && <p role="alert" className="text-sm text-amber-800">{sessionState.error.message || 'No se pudo confirmar la desvinculación. La vinculación se conserva; puedes reintentar.'}</p>}
      <DialogFooter><Button variant="outline" className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full whitespace-normal px-4 py-2" onClick={() => setConfirmForget(false)}>Cancelar</Button><Button className="inline-flex min-h-11 h-auto rounded-xl w-fit max-w-full whitespace-normal px-4 py-2" disabled={Boolean(sessionState.bindingBusy || !remembered)} onClick={() => run('unlink')}>Confirmar desvinculación</Button></DialogFooter>
    </DialogContent></Dialog>
    <Vinca2Diagnostics />
  </div>;
};
export default Vinca2Panel;
