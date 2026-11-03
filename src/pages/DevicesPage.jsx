import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFemometer } from '@/contexts/FemometerContext';
import Vinca2Panel from '@/components/Vinca2Panel';
import { Button } from '@/components/ui/button';

const DevicePageShell = ({ title, back, children }) => <div className="min-h-full bg-slate-50">
  <header className="sticky top-0 z-30 border-b border-slate-100 bg-slate-50/95 px-4 py-4">
    <div className="mx-auto flex max-w-2xl items-center gap-2">
      <Link to={back} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fertiliapp-fuerte hover:bg-rose-50"><ChevronLeft className="h-5 w-5" /></Link>
      <h1 className="text-2xl font-semibold text-titulo">{title}</h1>
    </div>
  </header>
  <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">{children}</div>
</div>;

export function DevicesPage() {
  const ble = useFemometer();
  if (!ble.enabled) return <Navigate to="/settings" replace />;
  const linked = Boolean(ble.sessionState.remembered);
  return <DevicePageShell title="Dispositivos" back="/settings">
    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{linked ? 'Dispositivos vinculados' : 'Vincular un dispositivo'}</p>
    {!linked && <p className="text-sm text-slate-500">No hay un termómetro recordado. Puedes configurar un BM-Vinca2.</p>}
    <Link to="/settings/devices/vinca2" className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className="rounded-xl bg-rose-50 p-2 text-rose-500"><Thermometer className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-800">Vinca 2</span>
        <span className="block text-sm text-slate-500">{ble.sessionState.status === 'listening' ? 'Conectado' : linked ? 'Termómetro recordado' : 'Configurar BM-Vinca2'} · {ble.pendingCount} pendientes</span>
      </span><ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
    {ble.sessionState.clockResult?.significantDrift && <Button variant="outline" onClick={ble.openClockDialog}>Revisar hora del termómetro</Button>}
  </DevicePageShell>;
}

export function Vinca2DevicePage() {
  const ble = useFemometer();
  const { user } = useAuth();
  if (!ble.enabled || !user?.uid) return <Navigate to="/settings" replace />;
  return <DevicePageShell title="Vinca 2" back="/settings/devices">
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><Vinca2Panel userId={user.uid} /></div>
  </DevicePageShell>;
}

export default DevicesPage;
