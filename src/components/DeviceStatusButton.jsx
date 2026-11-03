import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bluetooth, BluetoothOff, CircleAlert, Loader2 } from 'lucide-react';
import { useFemometer } from '@/contexts/FemometerContext';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const DeviceStatusButton = () => {
  const ble = useFemometer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!ble.enabled) return null;
  const { status, clockResult, clockError } = ble.sessionState;
  const attention = status === 'error' || clockResult?.significantDrift || Boolean(clockError);
  const searching = ['checking', 'searching', 'connecting'].includes(status);
  const label = attention ? 'Requiere atención' : searching ? 'Buscando o conectando' : status === 'listening' ? 'Conectado' : 'Desconectado';
  const Icon = attention ? CircleAlert : searching ? Loader2 : status === 'listening' ? Bluetooth : BluetoothOff;
  const description = `Bluetooth: ${label}. ${ble.pendingCount} lecturas pendientes. Abrir opciones`;
  const go = path => { setOpen(false); navigate(path); };
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" aria-label={description} title={description}
    className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 self-end items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-rose-300 ${attention ? 'text-amber-700' : status === 'listening' ? 'text-emerald-700' : 'text-slate-500'}`}
    >
    <Icon aria-hidden="true" className={`h-5 w-5 ${searching && !attention ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    {ble.pendingCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">{ble.pendingCount > 99 ? '99+' : ble.pendingCount}</span>}
  </button></PopoverTrigger>
    <PopoverContent align="end" collisionPadding={12} className="w-64 max-w-[calc(100vw-24px)] space-y-3" aria-label="Opciones Bluetooth">
      <p role="status" className="text-sm font-medium">{label}</p>
      <p className="text-sm text-slate-600">{ble.pendingCount} lecturas pendientes de revisión</p>
      {ble.preview && <p className="text-xs text-slate-500">Previsualización local sin conexión Bluetooth.</p>}
      {status !== 'listening' && <Button className="min-h-11 w-full" disabled={searching || ble.sessionState.busy || ble.preview}
        onClick={() => ble.sessionState.remembered ? ble.sessionRef.current?.start() : ble.sessionRef.current?.scan()}>Buscar termómetro</Button>}
      {status === 'listening' && <Button className="min-h-11 w-full" onClick={() => go('/settings/devices/vinca2#bluetooth-readings')}>Ver lecturas</Button>}
      {(clockResult?.significantDrift || clockError) && ble.sessionState.capabilities?.clockSync && <Button variant="outline" className="min-h-11 w-full"
        disabled={ble.preview} onClick={() => { setOpen(false); ble.openClockDialog(); }}>Sincronizar reloj</Button>}
      <Button variant="outline" className="min-h-11 w-full" onClick={() => go('/settings/devices')}>Ir a Dispositivos</Button>
    </PopoverContent>
  </Popover>;
};
export default DeviceStatusButton;
