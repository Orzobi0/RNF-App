import { useNavigate } from 'react-router-dom';
import { ThermometerName } from '@/components/ThermometerName';
import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clock3, Info, Thermometer, Link2, Unlink, Bluetooth, RefreshCw } from 'lucide-react';
import { femometerBlockingReason } from '@/lib/femometerSession';
import { thermometerName } from '@/lib/thermometerCatalog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Diagnostics from '@/components/Vinca2Diagnostics';
import { Vinca2IncorporationSettings } from '@/components/Vinca2Automation';

export const vinca2StatusText = (status, session = {}) => {
  const otherProfile = session.boundProtocol && session.boundProtocol !== 'vinca2';
  return status === 'listening' && (!session.listenerResult?.connectionReady || !session.listenerResult?.indicationsActive) ? 'Conectando…' : ({
  checking: 'Conectando…', idle: 'Desconectado', stopped: 'Desconectado',
  searching: otherProfile ? 'Buscando termómetro…' : 'Conectando…', inspecting: 'Conectando…',
  binding: 'Conectando…', connecting: 'Conectando…', listening: 'Conectado', stopping: 'Desconectado',
  missing: otherProfile ? 'Termómetro no encontrado' : 'Desconectado',
  error: otherProfile && session.error?.code !== 'CONNECTION_LOST' ? 'No se pudo conectar' : 'Desconectado',
})[status] || 'Desconectado';
};

const Vinca2Panel = ({ deviceKey } = {}) => {
  const { sessionRef, sessionState: sharedState, pendingCount, openReadingReview, openClockDialog, clockHistory: sharedClock } = useFemometer();
  const navigate = useNavigate();
  const metadata = useThermometerMetadata();
  const info = metadata.devices[deviceKey ?? sharedState.deviceKey] ?? {};
  const active = !deviceKey || deviceKey === sharedState.deviceKey;
  const saved = sharedState.bindings?.find(device => device.deviceKey === deviceKey);
  const sessionState = active ? sharedState : { status: 'stopped', remembered: Boolean(saved), boundModel: saved?.model,
    boundName: saved?.name, boundProtocol: saved?.protocol, boundCompatibility: saved?.compatibility,
    preferences: sharedState.preferencesByDevice?.[deviceKey] ?? {}, bindings: sharedState.bindings,
    bindingBusy: sharedState.bindingBusy, busy: sharedState.busy || sharedState.configurationBusy, capabilities: {} };
  const devicePreferences = { ...sessionState.preferences, ...info };
  const clockHistory = active ? sharedClock : null;
  const { status, remembered, inspectionResult, capabilities } = sessionState;
  const [confirmForget, setConfirmForget] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState(null);
  const operationLock = useRef(false);
  const model = sessionState.boundModel ?? (remembered && !sessionState.boundProtocol ? 'BM-Vinca2' : capabilities?.model);
  const vinca = model === 'BM-Vinca2';
  const listening = status === 'listening';
  const busy = (vinca && sessionState.diagnosticBackground) || sessionState.configurationBusy || sessionState.bindingBusy || working || sessionState.busy || sessionState.clockBusy || sessionState.deviceInfoBusy || sessionState.volumeBusy || sessionState.measurementModeBusy || sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status);
  useEffect(() => {
    if (window.location.hash !== '#bluetooth-readings') return undefined;
    const frame = requestAnimationFrame(() => document.getElementById('bluetooth-readings')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const blockingReason = femometerBlockingReason(sessionState) || (working ? 'Acción de la interfaz pendiente' : null);
  const run = async (operation, argument) => {
    if (operation !== 'stop' && (operation === 'unlink' ? sessionState.bindingBusy : operationLock.current || busy)) { setActionError(blockingReason || 'Otra acción está en curso.'); return; }
    if (operation === 'stop' && busy && status !== 'searching') { setActionError(blockingReason || 'Espera a que termine la operación antes de detener.'); return; }
    if (listening && !['restart', 'stop', 'readClock', 'syncClock', 'readDeviceInfo', 'setVolume', 'setMeasurementMode', 'setTemperatureUnit', 'unlink'].includes(operation)) return;
    operationLock.current = true;
    setWorking(true); setActionError(null);
    try {
      const completed = await sessionRef.current?.[operation === 'start' && !active ? 'connectSaved' : operation](operation === 'unlink' || (operation === 'start' && !active) ? deviceKey : argument);
      if (completed === false && (operation === 'unlink' || (operation === 'start' && !active))) setActionError('No se pudo completar la operación de este termómetro. Vuelve a intentarlo.');
      if (operation === 'unlink' && completed) setConfirmForget(false);
      if (operation === 'remember' && argument) setConfirmForget(false);
    } catch (error) {
      setActionError(error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  const retry = ['error', 'missing'].includes(status);
  const searching = status === 'searching';
  const operation = listening ? 'restart' : 'start';
  const recover = sessionState.gattReconnectRequired || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired;
  const primaryLabel = sessionState.configurationBusy ? 'Preparando ajustes…' : busy ? (['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status) ? vinca2StatusText(status, sessionState) : 'Preparando…')
    : listening ? recover ? 'Recuperar conexión' : (vinca ? 'Reconectar' : 'Reiniciar escucha') : retry ? 'Reintentar' : 'Conectar';
  const clockLabel = sessionState.boundProtocol === 'easyhome-ebt300'
  ? sessionState.clockResult?.writeAccepted
    ? 'Ajuste enviado'
    : 'Sin verificar'
  : ({
      synchronized_verified: 'Verificado',
      read_correct: 'Parece correcto',
      misaligned: 'Desajustado',
    })[clockHistory?.state] || 'Sin verificar';
  const volumeLabels = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
  const volumeResult = listening && sessionState.volumeResult?.commandsAccepted ? sessionState.volumeResult : null;
  const volumeReady = listening && sessionState.listenerResult?.connectionReady && sessionState.listenerResult?.indicationsActive;
  const measurementModeLabels = { quick: 'Rápido', normal: 'Normal', precise: 'Preciso' };
  const measurementModeResult = listening && sessionState.measurementModeResult?.commandsAccepted ? sessionState.measurementModeResult : null;
  const measurementModeReady = listening && sessionState.listenerResult?.connectionReady && sessionState.listenerResult?.indicationsActive;
  const healthyListening = listening && !recover && sessionState.listenerResult?.connectionReady === true && sessionState.listenerResult?.indicationsActive === true;
  const batteryLevel =
  (listening ? sessionState.deviceInfoResult?.battery : null)
  ?? info.batteryLevel;

const canReadDeviceInfo =
  active && healthyListening && !busy;
  const rowClass = 'flex min-h-14 w-full items-center gap-3 py-4 text-left text-sm disabled:opacity-50';
  return <div id="bluetooth-readings" className="min-w-0 text-slate-700">
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3">
            {vinca || model === 'EBT-300' ? (
        <img
          src={vinca ? '/images/vinca2.jpg' : '/images/EBT300.png'}
          alt={vinca ? 'Femometer Vinca 2' : 'Easy@Home EBT-300'}
          width="56"
          height="88"
          className="h-20 w-12 shrink-0 object-contain"
        />
      ) : (
        <Thermometer className="h-12 w-12 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <ThermometerName className="text-xl font-semibold text-titulo" device={{ deviceKey: deviceKey ?? sharedState.deviceKey, model, name: sessionState.boundName }} />
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">{remembered && <><Link2 className="h-3 w-3" aria-hidden="true" />Vinculado</>}</p>
                {sessionState.boundCompatibility === 'experimental' && (
          <p className="text-xs text-slate-500">
            {sessionState.boundProtocol === 'health-thermometer'
              ? 'Experimental comprobado'
              : 'Experimental'}
          </p>
        )}

                <div className="flex items-center justify-between gap-1">
          <p
            role="status"
            className={`min-w-0 text-sm ${
              retry
                ? 'text-amber-800'
                : listening && !sessionState.configurationBusy
                  ? 'text-fertiliapp-fuerte'
                  : 'text-slate-600'
            }`}
          >
            {healthyListening && (
              <svg
                aria-hidden="true"
                viewBox="0 0 32 32"
                className="mr-1 inline-block h-5 w-5 align-middle"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path
                  d="M7 11 Q3 16 7 21"
                  className="ble-wave-left"
                />
                <path
                  d="M25 11 Q29 16 25 21"
                  className="ble-wave-right"
                />
              </svg>
            )}

            {healthyListening
              ? (vinca ? 'Conectado' : 'Escuchando temperaturas')
              : vinca2StatusText(status, sessionState)}
          </p>

          <button
            type="button"
            aria-label={searching ? 'Cancelar búsqueda' : listening ? (vinca ? 'Desconectar' : 'Detener escucha') : primaryLabel}
            title={searching ? 'Cancelar búsqueda' : listening ? (vinca ? 'Desconectar' : 'Detener escucha') : primaryLabel}
            disabled={busy && !searching}
            onClick={() => run((listening || searching) ? 'stop' : operation)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fertiliapp-fuerte hover:bg-rose-50 disabled:opacity-40"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50"
              aria-hidden="true"
            >
              {listening ? (
                <span className="h-3 w-3 bg-current" />
              ) : busy ? (
                <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
              ) : retry ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Bluetooth className="h-5 w-5" />
              )}
            </span>
            <span className="sr-only">
              {listening ? (vinca ? 'Desconectar' : 'Detener escucha') : primaryLabel}
            </span>
          </button>
        </div>
        {listening && sessionState.configurationIssue && !sessionState.configurationBusy && <p className="text-xs text-amber-800">La recepción está activa; revisa los ajustes pendientes.</p>}
      </div>
    </div>
    {busy && <p role="status" className="py-2 text-xs text-slate-600">{blockingReason}. {searching ? 'Puedes cancelar la búsqueda.' : 'Conectar, Reconectar y Detener esperan a que termine; no se interrumpen escrituras pendientes.'}</p>}
    {metadata.error && <p role="status" className="text-xs text-amber-800">{metadata.error}</p>}
    {vinca && remembered && <Vinca2IncorporationSettings key={deviceKey ?? sharedState.deviceKey} deviceKey={deviceKey ?? sharedState.deviceKey} />}
    {(actionError || sessionState.error) && <div role="alert" className="mb-4 text-sm text-amber-800">
      <p>{actionError || sessionState.error?.message || 'No se pudo conectar. Vuelve a intentarlo.'}</p>
      {sessionState.error?.code === 'PERMISSION_NOT_GRANTED' && <p>Permite el acceso a Bluetooth al reintentar. Si el móvil ya no lo solicita, revisa los permisos de FertiliApp en los ajustes del teléfono.</p>}
      {sessionState.error?.code === 'DEVICE_NOT_VERIFIED' && <Button variant="ghost" disabled={busy} onClick={async () => { await run('recheckSaved'); navigate('/settings/devices'); }}>Repetir comprobación de este dispositivo</Button>}
      {sessionState.error?.code === 'BLUETOOTH_DISABLED' && <p>Activa Bluetooth en los ajustes del móvil y vuelve a intentarlo.</p>}
    </div>}
        {pendingCount > 0 && (
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-rose-50/50 p-3 text-left hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-400"
        onClick={() => openReadingReview()}
      >
        <Thermometer
          className="h-5 w-5 shrink-0 text-fertiliapp-fuerte"
          aria-hidden="true"
        />

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-titulo">
            Temperaturas pendientes
            <span className="ml-1 text-fertiliapp-fuerte">
              {pendingCount}
            </span>
          </span>


        </span>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      </button>
    )}
    {sessionState.preferenceError && <p role="alert" className="py-2 text-sm text-amber-800">{sessionState.preferenceError}</p>}
    <section aria-labelledby="vinca-configuration" className="mt-4 rounded-2xl border border-slate-200/70 bg-white px-4 pt-3">
      <h3 id="vinca-configuration" className="text-base font-semibold text-titulo">Configuración</h3>
      <div className="divide-y divide-slate-100">
                {(capabilities?.clockRead || capabilities?.clockSync || (!listening && vinca)) && (
          <button
            type="button"
            className={rowClass}
            disabled={!active}
            onClick={openClockDialog}
          >
            <Clock3
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span className="flex-1">Reloj</span>
            <span className={`text-xs ${
              clockHistory?.state === 'misaligned' || sessionState.clockError
                ? 'text-amber-700'
                : 'text-slate-500'
            }`}>
              {clockLabel}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          </button>
        )}
        {(capabilities?.volumeWrite || (!listening && vinca)) && <details>
          <summary className={`${rowClass} cursor-pointer`}><span className="flex-1">Volumen</span><span className="text-xs text-slate-500">{volumeLabels[info.volume ?? devicePreferences?.volume]}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <div role="group" aria-label="Nivel de volumen" className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-100">
              {Object.entries(volumeLabels).map(([level, label]) => <Button key={level} type="button" variant="outline"
                className={`relative min-h-11 min-w-0 rounded-none border-0 bg-transparent px-1 py-2 text-sm shadow-none disabled:opacity-100 ${devicePreferences?.volume === level ? 'font-semibold text-fertiliapp-fuerte after:absolute after:bottom-0 after:left-1/4 after:right-1/4 after:h-[3px] after:bg-fertiliapp-fuerte' : 'text-slate-700'}`}
                aria-pressed={devicePreferences?.volume === level}
                disabled={Boolean(busy || recover || !volumeReady || !capabilities?.volumeWrite || sessionState.volumeReconnectRequired || sessionState.measurementModeReconnectRequired)}
                onClick={() => run('setVolume', level)}>{label}{devicePreferences?.volume === level && <span className="sr-only"> (seleccionado)</span>}</Button>)}
            </div>
            <p role="status" className="pt-1 text-sm text-slate-600">{sessionState.volumeBusy ? 'Aplicando ajuste…'
              : sessionState.volumeError ? 'No se pudo confirmar el ajuste'
                : volumeResult && volumeResult.level === devicePreferences?.volume ? 'Aplicado en esta conexión'
                  : devicePreferences?.volume ? (!volumeReady ? 'Pendiente de aplicar al conectar' : 'Preferencia guardada') : 'Sin preferencia guardada'}</p>
            {volumeReady && !capabilities?.volumeWrite && <p className="text-sm text-amber-800">Este ajuste no está disponible en esta conexión.</p>}
            {sessionState.volumeError && <p role="alert" className="text-sm text-amber-800">{sessionState.volumeError.message}</p>}
          </div>
        </details>}
        {(capabilities?.modeConfiguration || (!listening && vinca)) && <details>
          <summary className={`${rowClass} cursor-pointer`}><span className="flex-1">Modo de medición</span><span className="text-xs text-slate-500">{measurementModeLabels[info.measurementMode ?? devicePreferences?.measurementMode]}</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <div role="group" aria-label="Modo de medición" className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-100">
              {Object.entries(measurementModeLabels).map(([level, label]) => <Button key={level} type="button" variant="outline"
                className={`relative min-h-11 min-w-0 rounded-none border-0 bg-transparent px-1 py-2 text-sm shadow-none disabled:opacity-100 ${devicePreferences?.measurementMode === level ? 'font-semibold text-fertiliapp-fuerte after:absolute after:bottom-0 after:left-1/4 after:right-1/4 after:h-[3px] after:bg-fertiliapp-fuerte' : 'text-slate-700'}`}
                aria-pressed={devicePreferences?.measurementMode === level}
                disabled={Boolean(busy || recover || !measurementModeReady || !capabilities?.modeConfiguration || sessionState.measurementModeReconnectRequired || sessionState.volumeReconnectRequired)}
                onClick={() => run('setMeasurementMode', level)}>{label}{devicePreferences?.measurementMode === level && <span className="sr-only"> (seleccionado)</span>}</Button>)}
            </div>
            <p role="status" className="pt-1 text-sm text-slate-600">{sessionState.measurementModeBusy ? 'Aplicando ajuste…'
              : sessionState.measurementModeError ? 'No se pudo confirmar el ajuste'
                : measurementModeResult && measurementModeResult.level === devicePreferences?.measurementMode ? 'Aplicado en esta conexión'
                  : devicePreferences?.measurementMode ? (!measurementModeReady ? 'Pendiente de aplicar al conectar' : 'Preferencia guardada') : 'Sin preferencia guardada'}</p>
            {measurementModeReady && !capabilities?.modeConfiguration && <p className="text-sm text-amber-800">Este ajuste no está disponible en esta conexión.</p>}
            {sessionState.measurementModeError && <p role="alert" className="text-sm text-amber-800">{sessionState.measurementModeError.message}</p>}
          </div>
        </details>}
        {sessionState.boundProtocol === 'easyhome-ebt300' && <p className={rowClass}>Unidad de temperatura: °C · Configuración automática</p>}
        {capabilities?.unitWrite && sessionState.boundProtocol !== 'easyhome-ebt300' && <details>
          <summary className={`${rowClass} cursor-pointer`}><Thermometer className="h-4 w-4" /><span className="flex-1">Unidad de temperatura</span><span className="text-xs">°{info.temperatureUnit ?? devicePreferences?.temperatureUnit ?? 'C'}</span><ChevronRight className="h-4 w-4" /></summary>
          <div className="space-y-2 pb-4 text-sm">
            <div role="group" aria-label="Unidad de temperatura" className="flex gap-2">{['C', 'F'].map(unit => <Button key={unit} variant="outline" disabled={busy || recover || !capabilities?.unitWrite || !listening} aria-pressed={(info.temperatureUnit ?? devicePreferences?.temperatureUnit ?? 'C') === unit} onClick={() => run('setTemperatureUnit', unit)}>°{unit}</Button>)}</div>
            <p className="text-xs text-slate-500">La escucha habitual se prepara en Celsius. Fahrenheit queda guardado como preferencia; su transmisión requiere comprobación física.</p>
            {sessionState.unitResult && <p role="status">Ajuste enviado, sin verificar. Recepción pausada: reconecta para recibir en Celsius.</p>}
            {sessionState.unitError && <p role="alert">No se pudo confirmar el ajuste. Reconecta antes de reintentar.</p>}
          </div>
        </details>}
                <details
          onToggle={event => {
            if (event.currentTarget.open && canReadDeviceInfo) {
              return run('readDeviceInfo');
            }
          }}
        >
          <summary className={`${rowClass} cursor-pointer`}>
            <Info
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />

            <span className="flex-1">
              Modelo y compatibilidad
            </span>

            {batteryLevel != null && (
              <span
                className="flex shrink-0 items-center gap-1 text-xs text-slate-500"
                title="Último nivel conocido de batería"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="2" y="7" width="18" height="10" rx="2" />
                  <path d="M22 10v4" strokeLinecap="round" />
                  <rect
                    x="4"
                    y="9"
                    width={14 * Math.max(0, Math.min(100, batteryLevel)) / 100}
                    height="6"
                    rx="1"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>

                {batteryLevel} %
              </span>
            )}

            <ChevronRight
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-2 pb-4 text-sm text-slate-500">
            <p>{vinca ? 'Femometer Vinca 2 / BM-Vinca2. Perfil implementado en FertiliApp.' : thermometerName({ model, name: sessionState.boundName })}</p>
            {sessionState.deviceInfoBusy && <p role="status">Consultando datos…</p>}
            {sessionState.deviceInfoError && <p role="alert" className="text-xs text-amber-800">{sessionState.deviceInfoError.message}</p>}
            <dl className="divide-y divide-slate-100">
              {Object.entries({ battery: 'Batería', model: 'Modelo', manufacturer: 'Fabricante', firmware: 'Firmware', software: 'Software' }).map(([field, label]) => {
                const value = (listening ? sessionState.deviceInfoResult?.[field] : null) ?? info[field === 'battery' ? 'batteryLevel' : field];
                if (value == null) return null;
                return <div key={field} className="flex items-start justify-between gap-4 py-2"><dt>{label}</dt><dd className="min-w-0 break-words text-right text-slate-700">{value == null ? 'No disponible' : field === 'battery' ? `${value} %` : value}</dd></div>;
              })}
            </dl>
            {info.infoCheckedAt && <p className="text-xs">Última consulta: {new Date(info.infoCheckedAt).toLocaleString()}</p>}
            {info.batteryCheckedAt && <p className="text-xs">Batería: último valor conocido del {new Date(info.batteryCheckedAt).toLocaleString()}</p>}
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
    {active && <Vinca2Diagnostics onRestart={() => run('restart')} restartDisabled={busy} recoveryRequired={Boolean(recover)} />}
  </div>;
};
export default Vinca2Panel;
