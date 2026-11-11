import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CheckCircle2, X, ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Panel, { vinca2StatusText } from '@/components/Vinca2Panel';

const DevicePageShell = ({ title, back, children }) => <div className="min-h-full bg-white">
  <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 py-4">
    <div className="mx-auto flex max-w-2xl items-center gap-2">
      <Link to={back} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fertiliapp-fuerte hover:bg-rose-50"><ChevronLeft className="h-5 w-5" /></Link>
      <h1 className="text-2xl font-semibold text-titulo">{title}</h1>
    </div>
  </header>
  <div className="mx-auto max-w-2xl min-w-0 space-y-4 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">{children}</div>
</div>;

const compactButton = 'inline-flex min-h-11 h-auto w-fit max-w-full whitespace-normal rounded-xl px-4 py-2';

export function DevicesPage() {
  const ble = useFemometer();
  const [localChanging, setChanging] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [working, setWorking] = useState(false);
  const [attemptedId, setAttemptedId] = useState(null);
  const [searched, setSearched] = useState(false);
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
  const changing = localChanging || ble.sessionState.changingDevice;
  const listening = status === 'listening';
  const busy = ble.sessionState.configurationBusy || ble.sessionState.bindingBusy || ble.sessionState.deviceInfoBusy || ble.sessionState.volumeBusy || ble.sessionState.measurementModeBusy || working || ble.sessionState.busy || ble.sessionState.clockBusy || ble.sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'binding', 'stopping'].includes(status);
  const run = async (operation, id) => {
    if (operationLock.current || (operation === 'beginChange' ? ble.sessionState.bindingBusy : busy || listening)) return;
    operationLock.current = true;
    setWorking(true); setActionError(null); setLinkedNotice(false);
    if (operation === 'scan') { setSearched(true); setAttemptedId(null); }
    else setAttemptedId(id);
    try {
      const confirmed = await ble.sessionRef.current?.[operation](id);
      if (operation === 'beginChange' && confirmed === true) { setChanging(true); setConfirmChange(false); setSearched(false); setAttemptedId(null); }
      if (operation === 'cancelChange') { setChanging(false); setSearched(false); }
      if (operation === 'selectAndRemember' && confirmed === true) {
        setLinkedNotice(true); setChanging(false); setSearched(false); setAttemptedId(null);
      }
    } catch (failure) {
      setActionError(failure?.message || 'No se pudo completar la comprobación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  return <DevicePageShell title="Dispositivos" back="/settings">
    {linkedNotice && linked && <section aria-label="Vinculación confirmada" className="relative rounded-2xl border border-rose-100 bg-rose-50/50 p-4 pr-12">
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
        <div><p className="font-semibold text-titulo">Termómetro vinculado</p>
          <p className="mt-1 text-sm text-slate-600">{status === 'error' || status === 'missing'
            ? 'La vinculación se ha guardado, pero no se pudo preparar la conexión'
            : listening && !ble.sessionState.configurationBusy && ble.sessionState.listenerResult?.connectionReady && ble.sessionState.listenerResult?.indicationsActive
              ? 'Femometer Vinca 2 está listo para recibir temperaturas'
              : 'La vinculación se ha guardado. ' + (ble.sessionState.configurationBusy ? 'Preparando ajustes…' : 'Consulta el estado del termómetro.')}</p>
        </div>
      </div>
      <button type="button" aria-label="Cerrar aviso de vinculación" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => setLinkedNotice(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
    </section>}
    {linked === null && <div role="status" className="text-sm text-slate-500">Consultando vinculación…</div>}
    {linked && <>
      <Link to="/settings/devices/vinca2" className="flex min-h-14 items-center gap-3 rounded-2xl border border-rose-100 bg-white p-4 transition-colors hover:border-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400 motion-reduce:transition-none">
        <img src="/images/vinca2.jpg" alt="Femometer Vinca 2 blanco con funda rosa" width="56" height="88" className="h-[88px] w-14 shrink-0 object-contain" />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-titulo">Femometer Vinca 2</span>
          <span className="block text-sm text-slate-600">Vinculado</span>
          <span className={`mt-1 block text-sm ${status === 'error' || status === 'missing' ? 'text-amber-800' : listening && !ble.sessionState.configurationBusy ? 'text-fertiliapp-fuerte' : 'text-slate-600'}`}>{ble.sessionState.configurationBusy ? 'Preparando ajustes…' : vinca2StatusText(status, ble.sessionState)}</span>
        </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
      {!changing && <Button variant="ghost" className={`${compactButton} text-slate-600`} disabled={Boolean(ble.sessionState.bindingBusy)} onClick={() => setConfirmChange(true)}>Cambiar termómetro</Button>}
    </>}
    {(linked === false || changing) && <section aria-label="Vincular termómetro" className="space-y-4">
      <div className="mx-auto max-w-sm text-center">
        <img src="/images/vinca2.jpg" alt="Termómetro Femometer Vinca 2 con su funda rosa" width="120" height="168" className="mx-auto mb-4 h-[168px] w-[120px] object-contain" />
        <h2 className="text-xl font-semibold text-titulo">Conecta tu termómetro</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Vincula tu Femometer Vinca 2 para recibir tus temperaturas en FertiliApp</p>
      </div>
      <ol className="space-y-4 py-3">
        {[['Prepara el termómetro', 'Enciéndelo y acércalo al móvil.'],
          ['Activa Bluetooth', 'Comprueba que Bluetooth esté disponible y que Femometer Connect esté completamente cerrada.'],
          ['Busca y vincula', 'Selecciona el termómetro cuando aparezca.']].map(([title, description], index) => <li key={title} className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm font-semibold text-fertiliapp-fuerte">{index + 1}</span>
            <div className="min-w-0"><h3 className="text-sm font-semibold text-titulo">{title}</h3><p className="mt-0.5 text-sm leading-relaxed text-slate-600">{description}</p></div>
          </li>)}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button className={`${compactButton} bg-fertiliapp-fuerte text-white hover:brightness-95`} disabled={busy || listening} onClick={() => run('scan')}>
          {status === 'searching' || (busy && !attemptedId) ? 'Buscando…' : 'Buscar termómetros'}
        </Button>
        {changing && <Button variant="ghost" className={compactButton} disabled={busy} onClick={() => run('cancelChange')}>Cancelar cambio</Button>}
      </div>

      {searched && !busy && !error && devices.length === 0 && <p role="status" className="text-sm">No se han encontrado termómetros. Acércalo y vuelve a buscar.</p>}
      {(searched || !linked) && devices.length > 0 && <div className="divide-y divide-slate-100">
        <h3 className="pb-3 text-sm font-semibold text-titulo">Termómetros encontrados</h3>
        {devices.map(device => {
          const attempted = attemptedId === device.id && selectedDeviceId === device.id;
          return <button key={device.id} type="button" disabled={busy || listening}
            onClick={() => run('selectAndRemember', device.id)}
            className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50">
            <Thermometer className="h-4 w-4 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{device.name || 'Termómetro detectado'}</span>
              {attempted && <span role="status" className="mt-1 block text-xs text-slate-600">{busy ? ble.sessionState.configurationBusy ? 'Preparando ajustes…' : vinca2StatusText(status, ble.sessionState)
                : error || actionError ? 'No se pudo completar la comprobación o vinculación. Vuelve a intentarlo.'
                  : inspectionResult && inspectionResult.compatible !== true ? 'Este termómetro no es compatible actualmente' : ''}</span>}
            </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>;
        })}
      </div>}
    </section>}
    {ble.pendingCount > 0 && <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-rose-50/50 p-3 text-left hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-400" onClick={() => ble.openReadingReview()}>
      <Thermometer className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-titulo">Temperaturas pendientes <span className="ml-1 text-fertiliapp-fuerte">{ble.pendingCount}</span></span><span className="mt-0.5 block text-sm text-slate-600">Pendientes de revisar e incorporar</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </button>}
    {(actionError || error) && <div role="alert" className="space-y-1 text-sm text-amber-800">
      <p>{actionError || error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.'}</p>
      {error?.code === 'PERMISSION_NOT_GRANTED' && <p>Permite el acceso a Bluetooth al reintentar. Si el móvil ya no lo solicita, revisa los permisos de FertiliApp en los ajustes del teléfono.</p>}
      {error?.code === 'BLUETOOTH_DISABLED' && <p>Activa Bluetooth en los ajustes del móvil y vuelve a intentarlo.</p>}
      {linked === null && <Button variant="outline" className={compactButton} disabled={busy} onClick={() => run('scan')}>Reintentar</Button>}
    </div>}
    <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
      <DialogContent className="[&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:right-1 [&>button:last-child]:top-1 motion-reduce:animate-none top-[calc(env(safe-area-inset-top,0px)+16px)] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-32px)] w-[calc(100%-32px)] max-w-md translate-y-0 overflow-y-auto rounded-2xl">
        <DialogHeader className="pr-5 text-left"><DialogTitle>Cambiar termómetro</DialogTitle><DialogDescription>El nuevo termómetro sustituirá la vinculación actual solo cuando se compruebe su compatibilidad y se confirme el cambio. No se borrarán temperaturas pendientes ni registros.</DialogDescription></DialogHeader>
        {listening && <p className="text-sm">La escucha se detendrá automáticamente. La vinculación anterior se conserva hasta confirmar la nueva.</p>}
        {error && <p role="alert" className="text-sm text-amber-800">{error.message || 'No se pudo cerrar la conexión. La vinculación anterior se conserva.'}</p>}
        <DialogFooter><Button variant="outline" className={compactButton} onClick={() => setConfirmChange(false)}>Cancelar</Button>
          <Button className={compactButton} disabled={Boolean(ble.sessionState.bindingBusy || working)} onClick={() => run('beginChange')}>Continuar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </DevicePageShell>;
}

export function Vinca2DevicePage() {
  const ble = useFemometer();
  const { user } = useAuth();
  if (!ble.enabled || !user?.uid) return <Navigate to="/settings" replace />;
  if (ble.sessionState.remembered === false) return <Navigate to="/settings/devices" replace />;
  if (ble.sessionState.remembered === null) return <DevicePageShell title="Termómetro" back="/settings/devices"><p role="status">Consultando vinculación…</p></DevicePageShell>;
  return <DevicePageShell title="Termómetro" back="/settings/devices">
    <Vinca2Panel />
  </DevicePageShell>;
}

export default DevicesPage;
