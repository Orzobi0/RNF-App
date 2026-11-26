import { CycleAvailabilityIndicator } from '@/components/layout/MainLayout';
import Vinca2ThermometerDrawing from '@/components/Vinca2ThermometerDrawing';
import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, X, ChevronLeft, ChevronRight, Thermometer, Link2 } from 'lucide-react';
import ThermometerVerificationView from '@/components/ThermometerVerificationView';
import { thermometerName } from '@/lib/thermometerCatalog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Panel, { vinca2StatusText } from '@/components/Vinca2Panel';

const DevicePageShell = ({ title, back, children }) => <div className="min-h-full bg-slate-50">
  <header className="sticky top-0 z-30 border-b border-slate-100 bg-slate-50 px-4 py-4">
    <div className="mx-auto flex max-w-2xl items-center gap-2">
      <Link to={back} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fertiliapp-fuerte hover:bg-rose-50"><ChevronLeft className="h-5 w-5" /></Link>
      <h1 className="min-w-0 flex-1 text-2xl font-semibold text-titulo">{title}</h1>
      <CycleAvailabilityIndicator />
    </div>
  </header>
  <div className="mx-auto max-w-2xl min-w-0 space-y-4 px-4 pt-4 pb-6">{children}</div>
</div>;

const compactButton = 'inline-flex min-h-11 h-auto w-fit max-w-full whitespace-normal rounded-xl px-4 py-2';

export function DevicesPage() {
  const ble = useFemometer();
  const metadata = useThermometerMetadata();
  const [localChanging, setChanging] = useState(false);
  const [working, setWorking] = useState(false);
  const [attemptedId, setAttemptedId] = useState(null);
  const [searched, setSearched] = useState(false);
  const [normalSearched, setNormalSearched] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [actionError, setActionError] = useState(null);
  const operationLock = useRef(false);
  const assistantOpen = useRef(false);
  useEffect(() => () => { const wasOpen = assistantOpen.current; assistantOpen.current = false; if (wasOpen) void ble.sessionRef.current?.cancelChange?.(); }, [ble.sessionRef]);
  useEffect(() => {
    if (!linkedNotice) return undefined;
    const timer = setTimeout(() => setLinkedNotice(false), 8000);
    return () => clearTimeout(timer);
  }, [linkedNotice]);
  if (!ble.enabled) return <Navigate to="/settings" replace />;
  const { remembered: linked, status, devices = [], selectedDeviceId, inspectionResult, error } = ble.sessionState;
  const linkedModel = ble.sessionState.boundModel ?? (linked && !ble.sessionState.boundProtocol ? 'BM-Vinca2' : null);
  const bindings = ble.sessionState.bindings ?? (linked ? [{ deviceKey: ble.sessionState.deviceKey, model: linkedModel }] : []);
  const changing = localChanging || ble.sessionState.changingDevice;
  const trial = ble.sessionState.trial;
  const promotedReading = ble.readings?.slice().reverse().find(reading => reading.promotedVerification === true
    && reading.deviceKey === ble.sessionState.deviceKey && reading.importStatus === 'pending');
  const trialActive = ['connecting', 'listening'].includes(trial?.status);
  const listening = status === 'listening';
  const busy = trialActive || ble.sessionState.configurationBusy || ble.sessionState.bindingBusy || ble.sessionState.deviceInfoBusy || ble.sessionState.volumeBusy || ble.sessionState.measurementModeBusy || working || ble.sessionState.busy || ble.sessionState.clockBusy || ble.sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status);
  const run = async (operation, id) => {
    if (operation === 'beginChange') { assistantOpen.current = true; setChanging(true); setSearched(false); setNormalSearched(false); setAttemptedId(null); setActionError(null); return; }
    if ((operationLock.current && !['stopTrial', 'cancelChange'].includes(operation)) || (['stopTrial', 'cancelChange'].includes(operation) ? false : operation === 'beginChange' ? ble.sessionState.bindingBusy : operation === 'confirmTrial' ? working || ble.sessionState.bindingBusy : busy || (listening && operation !== 'scan'))) return;
    operationLock.current = true;
    setWorking(true); setActionError(null); setLinkedNotice(false);
    if (operation === 'scan') { assistantOpen.current = true; setSearched(true); if (id !== true) setNormalSearched(true); setAttemptedId(null); }
    else setAttemptedId(id);
    try {
      if (operation === 'scan' && !ble.sessionState.changingDevice) {
        const prepared = await ble.sessionRef.current?.beginChange?.();
        if (!assistantOpen.current) return;
        if (prepared === false) throw new Error('No se pudo detener la conexión anterior.');
      }
      const confirmed = operation === 'confirmTrial' ? await ble.completeVerification(id) : await ble.sessionRef.current?.[operation](id);
      if (operation === 'beginChange' && confirmed === true) { setChanging(true); setSearched(false); setNormalSearched(false); setAttemptedId(null); }
      if (operation === 'cancelChange') {
  assistantOpen.current = false;
  setChanging(false);
  setSearched(false);
  setNormalSearched(false);
  setAttemptedId(null);
}
      if (operation === 'connectSaved' && confirmed === true) { setChanging(false); setSearched(false); setAttemptedId(null); }
      if (['selectAndRemember', 'confirmTrial'].includes(operation) && confirmed === true) {
        assistantOpen.current = false;
        setLinkedNotice(operation === 'confirmTrial' ? 'incorporated' : true); setChanging(false); setSearched(false); setAttemptedId(null);
      }
    } catch (failure) {
      setActionError(failure?.message || 'No se pudo completar la comprobación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  return <DevicePageShell title="Dispositivos" back="/settings">
    {metadata.error && <p role="status" className="text-sm text-amber-800">{metadata.error}</p>}
    {linkedNotice && linked && <section aria-label="Vinculación confirmada" className="relative rounded-xl bg-rose-50 px-3 py-2 pr-12">
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
        <p className="font-semibold text-titulo">{linkedNotice === 'incorporated' ? 'Termómetro vinculado y temperatura incorporada' : 'Termómetro vinculado'}</p>
      </div>
      <button type="button" aria-label="Cerrar aviso de vinculación" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => setLinkedNotice(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
    </section>}
    {linked === null && <div role="status" className="text-sm text-slate-500">Consultando vinculación…</div>}
    {bindings.length > 0 && <section aria-label="Termómetros vinculados" className="space-y-2">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-titulo">Mis termómetros</h2><Button variant="ghost" className={compactButton} disabled={busy || changing} onClick={() => run('beginChange')}>+ Añadir</Button></div>
      {bindings.map(device => (
  <Link
    key={device.deviceKey || 'legacy'}
    to={device.deviceKey
      ? `/settings/devices/${encodeURIComponent(device.deviceKey)}`
      : '/settings/devices/vinca2'}
    aria-label={`Abrir ${thermometerName({
      ...device,
      ...metadata.devices[device.deviceKey],
    })}`}
    className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 transition-colors active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-rose-400"
  >
                {device.model === 'BM-Vinca2' || device.model === 'EBT-300' ? (
          <img
            src={device.model === 'BM-Vinca2'
              ? '/images/vinca2.jpg'
              : '/images/EBT300.png'}
            alt={device.model === 'BM-Vinca2'
              ? 'Femometer Vinca 2'
              : 'Easy@Home EBT-300'}
            width="56"
            height="88"
            className="h-16 w-12 shrink-0 object-contain"
          />
        ) : (
          <Thermometer className="h-8 w-8 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-titulo break-words">
  {thermometerName({
    ...device,
    ...metadata.devices[device.deviceKey],
  })}
</div>
          <span className="flex items-center gap-1 text-xs text-slate-500"><Link2 className="h-3 w-3" aria-hidden="true" />Vinculado</span>
          <span className="block text-xs text-slate-500">{device.compatibility === 'experimental' ? 'Experimental' : ''}</span>
          <span className="block text-sm text-slate-600">{device.deviceKey === ble.sessionState.deviceKey ? vinca2StatusText(status, ble.sessionState) : 'Desconectado'}</span>
                </div>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      </Link>
    ))}
    </section>}
    {((linked === false && !bindings.length) || changing) && (
      <section aria-label="Vincular termómetro" className="relative space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4">
        <h2 className="pr-10 font-semibold text-titulo">Añadir termómetro</h2>
        {!searched && status !== 'searching' && (
          changing ? (
            <button type="button" aria-label="Cerrar adición" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500" onClick={() => run('cancelChange')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <Link to="/settings" aria-label="Cerrar adición" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500">
              <X className="h-4 w-4" aria-hidden="true" />
            </Link>
          )
        )}

        {/* Etapas del asistente, no porcentaje de progreso de Bluetooth. */}
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="h-1 flex-1 rounded-full bg-fertiliapp-fuerte" />
          <span className={`h-1 flex-1 rounded-full ${searched || status === 'searching' ? 'bg-fertiliapp-fuerte' : 'bg-rose-100'}`} />
          <span className={`h-1 flex-1 rounded-full ${searched && !busy && status !== 'searching' ? 'bg-fertiliapp-fuerte' : 'bg-rose-100'}`} />
        </div>

        {!searched && status !== 'searching' && (
          <div aria-label="Preparar búsqueda" className="space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
                            <svg
                aria-hidden="true"
                viewBox="0 0 160 100"
                className="h-28 w-44 max-w-full"
                fill="none"
              >
                {/* Fondo */}
                <circle cx="80" cy="50" r="43" fill="#fff1f3" />

                {/* Móvil */}
                <rect
                  x="29" y="13"
                  width="29" height="63"
                  rx="6.5"
                  fill="white"
                  stroke="#d65a73"
                  strokeWidth="1.8"
                />
                <rect
                  x="32" y="16"
                  width="23" height="57"
                  rx="4"
                  fill="#fdf6f8"
                />
                <rect
                  x="40" y="17.5"
                  width="7" height="2.2"
                  rx="1.1"
                  fill="#eab8c4"
                />

                {/* Símbolo Bluetooth */}
                <path
                  d="M38 39l11 11-5.5 5V33l5.5 6-11 11"
                  stroke="#d65a73"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Ondas estáticas */}
                <path
                  d="M66 39Q74 48 66 57"
                  stroke="#d65a73"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M75 33Q88 48 75 63"
                  stroke="#d65a73"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  opacity=".5"
                />

                {/* Termómetro basal */}
                <Vinca2ThermometerDrawing />
              </svg>
              <h3 className="font-semibold text-titulo">Prepara tu termómetro</h3>
            </div>
            <ol className="space-y-3 text-sm leading-relaxed text-slate-600">
              <li className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 font-semibold text-fertiliapp-fuerte">1</span>
                <span>Cierra la aplicación del termómetro, si está conectada.</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 font-semibold text-fertiliapp-fuerte">2</span>
                <span>Enciende el termómetro y acércalo al móvil.</span>
              </li>
            </ol>
            <div className="flex justify-center pt-1">
              <Button className={`${compactButton} bg-fertiliapp-fuerte text-white`} disabled={busy} onClick={() => run('scan')}>Buscar termómetros</Button>
            </div>
          </div>
        )}

        {status === 'searching' && (
          <div role="status" className="space-y-3 py-2 text-center">
            <div aria-hidden="true" className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-rose-50 text-fertiliapp-fuerte">
              <span className="absolute h-12 w-12 rounded-full border border-current opacity-40 motion-safe:animate-ping" style={{ animationDuration: '2.8s' }} />
              <span className="absolute h-12 w-12 rounded-full border border-current opacity-30 motion-safe:animate-ping" style={{ animationDuration: '2.8s', animationDelay: '0.9s' }} />
              <span className="absolute h-12 w-12 rounded-full border border-current opacity-20 motion-safe:animate-ping" style={{ animationDuration: '2.8s', animationDelay: '1.8s' }} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="relative h-8 w-8">
                <path d="m6.5 6.5 11 11L12 23V1l5.5 5.5-11 11" />
              </svg>
            </div>
            <h3 className="font-semibold text-titulo">Buscando termómetros…</h3>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-600">Mantén el termómetro encendido y cerca del móvil.</p>
          </div>
        )}

        {searched && busy && status !== 'searching' && devices.length === 0 && (
          <p role="status" className="py-3 text-center text-sm text-slate-600">Preparando búsqueda…</p>
        )}

        {searched && !busy && !error && !actionError && devices.length === 0 && (
          <div role="status" className="space-y-3 py-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-fertiliapp-fuerte">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="m6.5 6.5 11 11L12 23V1l5.5 5.5-11 11" />
                <path d="M19 7q4 5 0 10" opacity=".6" />
              </svg>
            </div>
            <h3 className="font-semibold text-titulo">No se han encontrado termómetros</h3>
            <p className="text-sm leading-relaxed text-slate-600">Comprueba que esté encendido y cerca del móvil. Acércalo y vuelve a buscar.</p>
          </div>
        )}

        {(searched || !linked) && devices.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              {status !== 'searching' && <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-titulo">Dispositivos encontrados ({devices.length})</h3>
                <p className="text-xs text-slate-500">{status === 'searching' ? 'Espera a que termine la búsqueda.' : 'Selecciona tu termómetro para continuar.'}</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/70 px-3">
          {devices.map(device => {
            const stored = device.deviceKey && bindings.some(binding => binding.deviceKey === device.deviceKey);
            const preliminaryVinca = device.model ? device.model === 'BM-Vinca2' : device.preliminaryModel === 'BM-Vinca2' || /(?:^|[^a-z0-9])bm-vinca2(?:$|[^a-z0-9])/i.test(device.name || '');
            const preliminaryEasy = device.model === 'EBT-300' || device.preliminaryModel === 'EBT-300';
            const attempted = attemptedId === device.id && selectedDeviceId === device.id;
            return <button key={device.id} type="button" disabled={busy}
              onClick={() => run(stored ? 'connectSaved' : 'selectAndRemember', stored ? device.deviceKey : device.id)}
              className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50">
                          {preliminaryVinca || preliminaryEasy ? (
                <img
                  src={preliminaryVinca
                    ? '/images/vinca2.jpg'
                    : '/images/EBT300.png'}
                  alt={preliminaryVinca
                    ? 'Femometer Vinca 2'
                    : 'Easy@Home EBT-300'}
                  width="32"
                  height="48"
                  className="h-12 w-8 shrink-0 object-contain"
                />
              ) : (
                <Thermometer
                  className="h-4 w-4 shrink-0 text-fertiliapp-fuerte"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{thermometerName({ ...device, model: preliminaryVinca ? 'BM-Vinca2' : preliminaryEasy ? 'EBT-300' : device.model, ...metadata.devices[device.deviceKey] })}</span>
                {preliminaryEasy && <span className="block text-xs text-slate-500">Experimental</span>}
                {device.manufacturer && <span className="block text-xs text-slate-500">{device.manufacturer}</span>}
                {!preliminaryVinca && !preliminaryEasy && <span className="block text-xs text-slate-600">{device.compatibility === 'possible_standard' ? 'Posible termómetro' : device.compatibility === 'recognized_unsupported' ? 'Soporte pendiente' : 'Dispositivo sin identificar'}</span>}
                <span className="block text-xs text-fertiliapp-fuerte">{stored ? 'Conectar' : preliminaryVinca || preliminaryEasy ? 'Pulsa para vincular' : 'Comprobar compatibilidad'}</span>
                {attempted && <span role="status" className="mt-1 block text-xs text-slate-600">{busy ? ble.sessionState.configurationBusy ? 'Preparando ajustes…' : vinca2StatusText(status, ble.sessionState)
                  : error || actionError ? 'No se pudo completar la comprobación o vinculación. Vuelve a intentarlo.'
                    : inspectionResult && inspectionResult.compatible !== true ? inspectionResult.standardTrialAvailable ? 'Prueba disponible' : 'No se puede vincular actualmente' : ''}</span>}
              </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>;
          })}
            </div>
          </div>
        )}

        {(searched || (!changing && devices.length > 0)) && status !== 'searching' && (
          <div className="flex justify-center">
            <Button
              variant={devices.length > 0 ? 'ghost' : 'default'}
              className={`${compactButton} gap-2 ${devices.length > 0 ? 'text-fertiliapp-fuerte' : 'bg-fertiliapp-fuerte text-white'}`}
              disabled={busy}
              onClick={() => run('scan')}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                <path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 6M18 16a7 7 0 0 1-12 2l-2-6" />
              </svg>
              Buscar de nuevo
            </Button>
          </div>
        )}
        {normalSearched && !busy && (
          <div className="flex justify-center border-t border-slate-100 pt-2">
            <Button variant="ghost" className={`${compactButton} text-slate-600`} disabled={busy} onClick={() => run('scan', true)}>¿No encuentras tu termómetro?</Button>
          </div>
        )}
        {changing && (searched || status === 'searching') && (
          <div className="flex justify-center">
            <Button variant="ghost" className={`${compactButton} text-slate-600`} disabled={ble.sessionState.bindingBusy} onClick={() => run('cancelChange')}>Cancelar</Button>
          </div>
        )}
      </section>
    )}
    {ble.pendingCount > 0 && <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-rose-50/50 p-3 text-left hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => ble.openReadingReview()}>
      <Thermometer className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-titulo">Temperaturas pendientes <span className="ml-1 text-fertiliapp-fuerte">{ble.pendingCount}</span></span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </button>}
    {trial && <ThermometerVerificationView error={actionError} trial={trial} name={thermometerName(devices.find(device => device.id === trial.deviceId))}
      busy={working || ble.sessionState.bindingBusy} onConfirm={evidence => run('confirmTrial', evidence)}
      onStop={() => run('stopTrial')} onRetry={() => run('startTrial', trial.deviceId)} />}
    {ble.sessionState.verificationPromoted && promotedReading && <Button variant="ghost" className={compactButton} onClick={() => ble.openReadingReview(promotedReading.uiId)}>Revisar temperatura de comprobación</Button>}
    {ble.sessionState.verificationNeedsNewReading && <p className="text-sm text-slate-600">Termómetro vinculado. Realiza una nueva medición para revisarla e incorporarla.</p>}
    {inspectionResult && !trial && inspectionResult.compatible !== true && <div className="space-y-2 text-sm">
      <p>Este termómetro todavía no es compatible</p>
      <details><summary className="min-h-11 cursor-pointer py-3 text-slate-500">Diagnóstico técnico</summary>
        <p>{inspectionResult.name} {inspectionResult.manufacturer} {inspectionResult.model} {inspectionResult.firmware}</p>
        {(inspectionResult.services ?? []).map(service => <div key={service.uuid} className="break-all py-2 text-xs"><p>{service.uuid}</p>{(service.characteristics ?? []).map(characteristic => <p key={characteristic.uuid}>{characteristic.uuid}: {(characteristic.properties ?? []).join(', ')}</p>)}</div>)}
      </details>
    </div>}
    {(actionError || error) && <div role="alert" className="space-y-1 text-sm text-amber-800">
      <p>{actionError || error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.'}</p>
      {error?.code === 'PERMISSION_NOT_GRANTED' && <p>Permite el acceso a Bluetooth al reintentar. Si el móvil ya no lo solicita, revisa los permisos de FertiliApp en los ajustes del teléfono.</p>}
      {error?.code === 'BLUETOOTH_DISABLED' && <p>Activa Bluetooth en los ajustes del móvil y vuelve a intentarlo.</p>}
      {linked === null && <Button variant="outline" className={compactButton} disabled={busy} onClick={() => run('scan')}>Reintentar</Button>}
    </div>}

  </DevicePageShell>;
}

export function Vinca2DevicePage() {
  const ble = useFemometer();
  const { user } = useAuth();
  const { deviceKey } = useParams();
  if (!ble.enabled || !user?.uid) return <Navigate to="/settings" replace />;
  const selectedKey = deviceKey || ble.sessionState.deviceKey;
  if (deviceKey && !ble.sessionState.bindings?.some(device => device.deviceKey === deviceKey) && ble.sessionState.remembered !== null) return <Navigate to="/settings/devices" replace />;
  if (ble.sessionState.remembered === false && !deviceKey) return <Navigate to="/settings/devices" replace />;
  if (ble.sessionState.remembered === null) return <DevicePageShell title="Termómetro" back="/settings/devices"><p role="status">Consultando vinculación…</p></DevicePageShell>;
  return <DevicePageShell title="Termómetro" back="/settings/devices">
    <Vinca2Panel deviceKey={selectedKey} />
  </DevicePageShell>;
}

export default DevicesPage;
