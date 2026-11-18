import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, X, ChevronLeft, ChevronRight, Thermometer, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Panel, { vinca2StatusText } from '@/components/Vinca2Panel';

const DevicePageShell = ({ title, back, children }) => <div className="min-h-full bg-slate-50">
  <header className="sticky top-0 z-30 border-b border-slate-100 bg-slate-50 px-4 py-4">
    <div className="mx-auto flex max-w-2xl items-center gap-2">
      <Link to={back} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fertiliapp-fuerte hover:bg-rose-50"><ChevronLeft className="h-5 w-5" /></Link>
      <h1 className="text-2xl font-semibold text-titulo">{title}</h1>
    </div>
  </header>
  <div className="mx-auto max-w-2xl min-w-0 space-y-4 px-4 pt-4 pb-6">{children}</div>
</div>;

const compactButton = 'inline-flex min-h-11 h-auto w-fit max-w-full whitespace-normal rounded-xl px-4 py-2';

export function DevicesPage() {
  const ble = useFemometer();
  const [localChanging, setChanging] = useState(false);
  const [working, setWorking] = useState(false);
  const [attemptedId, setAttemptedId] = useState(null);
  const [searched, setSearched] = useState(false);
  const [normalSearched, setNormalSearched] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [actionError, setActionError] = useState(null);
  const operationLock = useRef(false);
  useEffect(() => {
    if (!linkedNotice) return undefined;
    const timer = setTimeout(() => setLinkedNotice(false), 8000);
    return () => clearTimeout(timer);
  }, [linkedNotice]);
  if (!ble.enabled) return <Navigate to="/settings" replace />;
  const { remembered: linked, status, devices = [], selectedDeviceId, inspectionResult, error } = ble.sessionState;
  const linkedModel = ble.sessionState.boundModel ?? (linked ? 'BM-Vinca2' : null);
  const bindings = ble.sessionState.bindings ?? (linked ? [{ deviceKey: ble.sessionState.deviceKey, model: linkedModel }] : []);
  const changing = localChanging || ble.sessionState.changingDevice;
  const trial = ble.sessionState.trial;
  const trialActive = ['connecting', 'listening'].includes(trial?.status);
  const listening = status === 'listening';
  const busy = trialActive || ble.sessionState.configurationBusy || ble.sessionState.bindingBusy || ble.sessionState.deviceInfoBusy || ble.sessionState.volumeBusy || ble.sessionState.measurementModeBusy || working || ble.sessionState.busy || ble.sessionState.clockBusy || ble.sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status);
  const run = async (operation, id) => {
    if ((operationLock.current && !['stopTrial', 'cancelChange'].includes(operation)) || (['stopTrial', 'cancelChange'].includes(operation) ? false : operation === 'beginChange' ? ble.sessionState.bindingBusy : busy || listening)) return;
    operationLock.current = true;
    setWorking(true); setActionError(null); setLinkedNotice(false);
    if (operation === 'scan') { setSearched(true); if (id !== true) setNormalSearched(true); setAttemptedId(null); }
    else setAttemptedId(id);
    try {
      const confirmed = await ble.sessionRef.current?.[operation](id);
      if (operation === 'beginChange' && confirmed === true) { setChanging(true); setSearched(false); setNormalSearched(false); setAttemptedId(null); }
      if (operation === 'cancelChange') { setChanging(false); setSearched(false); }
      if (operation === 'connectSaved' && confirmed === true) { setChanging(false); setSearched(false); setAttemptedId(null); }
      if (operation === 'selectAndRemember' && confirmed === true) {
        setLinkedNotice(true); setChanging(false); setSearched(false); setAttemptedId(null);
      }
    } catch (failure) {
      setActionError(failure?.message || 'No se pudo completar la comprobación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  return <DevicePageShell title="Dispositivos" back="/settings">
    {linkedNotice && linked && <section aria-label="Vinculación confirmada" className="relative rounded-xl bg-rose-50 px-3 py-2 pr-12">
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
        <p className="font-semibold text-titulo">Termómetro vinculado</p>
      </div>
      <button type="button" aria-label="Cerrar aviso de vinculación" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => setLinkedNotice(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
    </section>}
    {linked === null && <div role="status" className="text-sm text-slate-500">Consultando vinculación…</div>}
    {bindings.length > 0 && <section aria-label="Termómetros vinculados" className="space-y-2">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-titulo">Mis termómetros</h2><Button variant="ghost" className={compactButton} disabled={busy || changing} onClick={() => run('beginChange')}>+ Añadir</Button></div>
      {bindings.map(device => <Link key={device.deviceKey || 'legacy'} to={device.deviceKey ? `/settings/devices/${encodeURIComponent(device.deviceKey)}` : '/settings/devices/vinca2'} className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3">
        {device.model === 'BM-Vinca2' ? <img src="/images/vinca2.jpg" alt="Femometer Vinca 2 blanco con funda rosa" width="56" height="88" className="h-16 w-12 shrink-0 object-contain" /> : <Thermometer className="h-8 w-8 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 flex-1"><span className="block font-semibold text-titulo">{device.model === 'BM-Vinca2' ? 'Femometer Vinca 2' : device.model || 'Termómetro'}</span>
          <span className="flex items-center gap-1 text-xs text-slate-500"><Link2 className="h-3 w-3" aria-hidden="true" />Vinculado</span>
          <span className="block text-sm text-slate-600">{!changing && device.deviceKey === ble.sessionState.deviceKey ? vinca2StatusText(status, ble.sessionState) : 'Desconectado'}</span>
        </span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Link>)}
    </section>}
    {((linked === false && !bindings.length) || changing) && <section aria-label="Vincular termómetro" className="space-y-4">
      {!searched && status !== 'searching' && devices.length === 0 && <div aria-label="Preparar búsqueda" className="relative space-y-3 rounded-2xl border border-slate-200/70 bg-white p-4">
        <h2 className="pr-10 font-semibold text-titulo">Añadir termómetro</h2>
        {changing && <button type="button" aria-label="Cerrar adición" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500" onClick={() => run('cancelChange')}><X className="h-4 w-4" aria-hidden="true" /></button>}
        {!changing && <Link to="/settings" aria-label="Cerrar adición" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500"><X className="h-4 w-4" aria-hidden="true" /></Link>}
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:font-semibold marker:text-fertiliapp-fuerte">
          <li>Cierra la aplicación del termómetro, si está conectada.</li>
          <li>Enciende el termómetro y acércalo al móvil.</li>
        </ol>
        <Button className={`${compactButton} bg-fertiliapp-fuerte text-white`} disabled={busy || listening} onClick={() => run('scan')}>Buscar termómetros</Button>
      </div>}
      {status === 'searching' && <p role="status" className="rounded-2xl bg-rose-50 p-4 text-sm">Buscando termómetros…</p>}
      {(searched || devices.length > 0) && status !== 'searching' && <Button variant="ghost" className={compactButton} disabled={busy || listening} onClick={() => run('scan')}>Buscar de nuevo</Button>}
      {normalSearched && !busy && <Button variant="ghost" className={compactButton} disabled={listening} onClick={() => run('scan', true)}>¿No encuentras tu termómetro?</Button>}
      {changing && (searched || status === 'searching') && <Button variant="ghost" className={compactButton} disabled={ble.sessionState.bindingBusy} onClick={() => run('cancelChange')}>Cancelar</Button>}

      {searched && !busy && !error && devices.length === 0 && <p role="status" className="text-sm">No se han encontrado termómetros. Acércalo y vuelve a buscar.</p>}
      {(searched || !linked) && devices.length > 0 && <div className="divide-y divide-slate-100">
        <h3 className="pb-3 text-sm font-semibold text-titulo">Dispositivos encontrados</h3>
        {devices.map(device => {
          const stored = device.deviceKey && bindings.some(binding => binding.deviceKey === device.deviceKey);
          const preliminaryVinca = device.model ? device.model === 'BM-Vinca2' : device.preliminaryModel === 'BM-Vinca2' || /(?:^|[^a-z0-9])bm-vinca2(?:$|[^a-z0-9])/i.test(device.name || '');
          const attempted = attemptedId === device.id && selectedDeviceId === device.id;
          return <button key={device.id} type="button" disabled={busy || listening}
            onClick={() => run(stored ? 'connectSaved' : 'selectAndRemember', stored ? device.deviceKey : device.id)}
            className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50">
            {preliminaryVinca ? <img src="/images/vinca2.jpg" alt="Femometer Vinca 2" width="32" height="48" className="h-12 w-8 shrink-0 object-contain" /> : <Thermometer className="h-4 w-4 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />}
            <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{preliminaryVinca ? 'Femometer Vinca 2' : device.model || device.name || 'Dispositivo sin nombre'}</span>
              {device.manufacturer && <span className="block text-xs text-slate-500">{device.manufacturer}</span>}
              {!preliminaryVinca && <span className="block text-xs text-slate-600">{device.compatibility === 'possible_standard' ? 'Posible termómetro' : device.compatibility === 'recognized_unsupported' ? 'Soporte pendiente' : 'Dispositivo sin identificar'}</span>}
              <span className="block text-xs text-fertiliapp-fuerte">{stored ? 'Conectar' : preliminaryVinca ? 'Pulsa para vincular' : 'Comprobar compatibilidad'}</span>
              {attempted && <span role="status" className="mt-1 block text-xs text-slate-600">{busy ? ble.sessionState.configurationBusy ? 'Preparando ajustes…' : vinca2StatusText(status, ble.sessionState)
                : error || actionError ? 'No se pudo completar la comprobación o vinculación. Vuelve a intentarlo.'
                  : inspectionResult && inspectionResult.compatible !== true ? inspectionResult.standardTrialAvailable ? 'Prueba disponible' : 'No se puede vincular actualmente' : ''}</span>}
            </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>;
        })}
      </div>}
    </section>}
    {ble.pendingCount > 0 && <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-rose-50/50 p-3 text-left hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => ble.openReadingReview()}>
      <Thermometer className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-titulo">Temperaturas pendientes <span className="ml-1 text-fertiliapp-fuerte">{ble.pendingCount}</span></span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </button>}
    {inspectionResult?.standardTrialAvailable === true && !trialActive && <Button variant="outline" className={compactButton} disabled={busy || listening} onClick={() => run('startTrial', selectedDeviceId)}>Probar recepción</Button>}
    {trial && <section aria-label="Recepción de prueba" className="space-y-3 rounded-2xl border border-rose-100 p-4">
      <p className="font-semibold">{trialActive ? 'Recepción de prueba…' : 'Prueba finalizada'}</p>
      <p className="text-sm text-slate-500">Estas temperaturas no se guardan en tus registros.</p>
      {trial.readings.map((reading, index) => <p key={index} className="text-sm">{reading.temperatureC.toFixed(2)} °C · {reading.deviceTimestamp || 'Sin fecha del termómetro'}</p>)}
      {trial.error && <p role="alert" className="text-sm text-amber-800">{trial.error}</p>}
      {trialActive && <Button variant="outline" className={compactButton} onClick={() => run('stopTrial')}>Terminar prueba</Button>}
    </section>}
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
