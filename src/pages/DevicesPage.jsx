import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
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

export function DevicesPage() {
  const ble = useFemometer();
  if (!ble.enabled) return <Navigate to="/settings" replace />;
  const linked = ble.sessionState.remembered;
  return <DevicePageShell title="Dispositivos" back="/settings">
    <p className="text-sm text-slate-500">Modelo compatible con FertiliApp</p>
    <Link to="/settings/devices/vinca2" className="flex min-h-14 items-center gap-3 border-b border-slate-100 bg-white py-4">
      <Thermometer className="h-5 w-5 shrink-0 text-fertiliapp-fuerte" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block font-semibold text-titulo">Femometer Vinca 2</span>
        <span className="block text-sm text-slate-600">{linked === null ? 'Consultando vinculación…' : linked ? 'Vinculado' : 'Sin configurar'}</span>
        {linked && <><span className="block text-sm text-slate-500">{vinca2StatusText(ble.sessionState.status)}</span><span className="block text-sm text-slate-500">{ble.pendingCount} temperaturas pendientes</span></>}
      </span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </Link>
  </DevicePageShell>;
}

export function Vinca2DevicePage() {
  const ble = useFemometer();
  const { user } = useAuth();
  if (!ble.enabled || !user?.uid) return <Navigate to="/settings" replace />;
  return <DevicePageShell title="Vinca 2" back="/settings/devices">
    <Vinca2Panel />
  </DevicePageShell>;
}

export default DevicesPage;
