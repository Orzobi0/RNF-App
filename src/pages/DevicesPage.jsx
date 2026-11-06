import React, { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
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
  <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">{children}</div>
</div>;

const compactButton = 'inline-flex min-h-11 h-auto w-fit max-w-full whitespace-normal rounded-xl px-4 py-2';

export function DevicesPage() {
  const ble = useFemometer();
  const [changing, setChanging] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [working, setWorking] = useState(false);
  const [attemptedId, setAttemptedId] = useState(null);
  const [searched, setSearched] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [actionError, setActionError] = useState(null);
  const operationLock = useRef(false);
  if (!ble.enabled) return <Navigate to="/settings" replace />;
  const { remembered: linked, status, devices = [], selectedDeviceId, inspectionResult, error } = ble.sessionState;
  const listening = status === 'listening';
  const busy = working || ble.sessionState.busy || ble.sessionState.clockBusy || ble.sessionState.restarting
    || ['checking', 'searching', 'connecting', 'inspecting', 'stopping'].includes(status);
  const run = async (operation, id) => {
    if (operationLock.current || busy || listening) return;
    operationLock.current = true;
    setWorking(true); setActionError(null); setLinkedNotice(false);
    if (operation === 'scan') { setSearched(true); setAttemptedId(null); }
    else setAttemptedId(id);
    try {
      const confirmed = await ble.sessionRef.current?.[operation](id);
      if (operation === 'selectAndRemember' && confirmed === true) {
        setLinkedNotice(true); setChanging(false); setSearched(false); setAttemptedId(null);
      }
    } catch (failure) {
      setActionError(failure?.message || 'No se pudo completar la comprobación. Vuelve a intentarlo.');
    } finally { operationLock.current = false; setWorking(false); }
  };
  return <DevicePageShell title="Dispositivos" back="/settings">
    {linked === null && <div role="status" className="text-sm text-slate-500">Consultando vinculación…</div>}
    {linked && <>
      {linkedNotice && <p role="status" className="text-sm text-emerald-700">Termómetro vinculado</p>}
      <Link to="/settings/devices/vinca2" className="flex min-h-14 items-center gap-3 border-b border-slate-100 bg-white py-4">
        <Thermometer className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-titulo">Femometer Vinca 2</span>
          <span className="block text-sm text-slate-600">Vinculado</span>
          <span className="block text-sm text-slate-500">{vinca2StatusText(status)}</span>
          <span className="block text-sm text-slate-500">{ble.pendingCount} temperaturas pendientes</span>
        </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>
      {!changing && <Button variant="outline" className={compactButton} disabled={busy} onClick={() => setConfirmChange(true)}>Cambiar termómetro</Button>}
    </>}
    {(linked === false || changing) && <section aria-label="Vincular termómetro" className="space-y-4">
      <p className="text-sm text-slate-600">Vincula un termómetro compatible con FertiliApp</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Cierra completamente Femometer Connect.</li><li>Activa Bluetooth.</li><li>Acerca y prepara el termómetro.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button className={`${compactButton} bg-fertiliapp-fuerte text-white hover:brightness-95`} disabled={busy || listening} onClick={() => run('scan')}>
          {status === 'searching' || (busy && !attemptedId) ? 'Buscando…' : 'Buscar termómetros'}
        </Button>
        {changing && <Button variant="ghost" className={compactButton} disabled={busy} onClick={() => { setChanging(false); setAttemptedId(null); setSearched(false); setActionError(null); }}>Cancelar cambio</Button>}
      </div>
      {listening && <p className="text-sm text-slate-600">Detén la escucha desde la ficha del Vinca 2 antes de buscar o cambiar el termómetro.</p>}
      {searched && !busy && !error && devices.length === 0 && <p role="status" className="text-sm">No se han encontrado termómetros. Acércalo y vuelve a buscar.</p>}
      {(searched || !linked) && <div className="divide-y divide-slate-100">
        {devices.map(device => {
          const attempted = attemptedId === device.id && selectedDeviceId === device.id;
          return <button key={device.id} type="button" disabled={busy || listening}
            onClick={() => run('selectAndRemember', device.id)}
            className="flex min-h-14 w-full items-center gap-3 py-3 text-left text-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50">
            <Thermometer className="h-4 w-4 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{device.name || 'Termómetro detectado'}</span>
              {attempted && <span role="status" className="mt-1 block text-xs text-slate-600">{busy ? 'Comprobando y vinculando…'
                : error || actionError ? 'No se pudo completar la comprobación o vinculación. Vuelve a intentarlo.'
                  : inspectionResult && inspectionResult.compatible !== true ? 'Este termómetro no es compatible actualmente' : ''}</span>}
            </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>;
        })}
      </div>}
    </section>}
    {(actionError || error) && <div role="alert" className="space-y-1 text-sm text-amber-800">
      <p>{actionError || error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.'}</p>
      {error?.code === 'PERMISSION_NOT_GRANTED' && <p>Permite el acceso a Bluetooth al reintentar. Si el móvil ya no lo solicita, revisa los permisos de FertiliApp en los ajustes del teléfono.</p>}
      {error?.code === 'BLUETOOTH_DISABLED' && <p>Activa Bluetooth en los ajustes del móvil y vuelve a intentarlo.</p>}
      {linked === null && <Button variant="outline" className={compactButton} disabled={busy} onClick={() => run('scan')}>Reintentar</Button>}
    </div>}
    <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
      <DialogContent className="top-[calc(env(safe-area-inset-top,0px)+16px)] max-h-[85dvh] w-[calc(100%-32px)] max-w-md translate-y-0 overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>Cambiar termómetro</DialogTitle><DialogDescription>El nuevo termómetro sustituirá la vinculación actual solo cuando se compruebe su compatibilidad y se confirme el cambio. No se borrarán temperaturas pendientes ni registros.</DialogDescription></DialogHeader>
        {listening && <p className="text-sm">Debes detener la escucha desde la ficha del Vinca 2 antes de cambiar el termómetro.</p>}
        <DialogFooter><Button variant="outline" className={compactButton} onClick={() => setConfirmChange(false)}>Cancelar</Button>
          <Button className={compactButton} disabled={busy || listening} onClick={() => { setChanging(true); setConfirmChange(false); setSearched(false); setAttemptedId(null); setLinkedNotice(false); }}>Continuar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </DevicePageShell>;
}

export function Vinca2DevicePage() {
  const ble = useFemometer();
  const { user } = useAuth();
  if (!ble.enabled || !user?.uid) return <Navigate to="/settings" replace />;
  if (ble.sessionState.remembered === false) return <Navigate to="/settings/devices" replace />;
  if (ble.sessionState.remembered === null) return <DevicePageShell title="Vinca 2" back="/settings/devices"><p role="status">Consultando vinculación…</p></DevicePageShell>;
  return <DevicePageShell title="Vinca 2" back="/settings/devices">
    <Vinca2Panel />
  </DevicePageShell>;
}

export default DevicesPage;
