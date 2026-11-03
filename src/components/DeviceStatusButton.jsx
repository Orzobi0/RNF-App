import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bluetooth, BluetoothOff, CircleAlert, Loader2 } from 'lucide-react';
import { useFemometer } from '@/contexts/FemometerContext';

const DeviceStatusButton = () => {
  const ble = useFemometer();
  const navigate = useNavigate();
  if (!ble.enabled) return null;
  const { status, clockResult, clockError } = ble.sessionState;
  const attention = status === 'error' || clockResult?.significantDrift || Boolean(clockError);
  const searching = ['checking', 'searching', 'connecting'].includes(status);
  const label = attention ? 'Requiere atención' : searching ? 'Buscando o conectando' : status === 'listening' ? 'Conectado' : 'Desconectado';
  const Icon = attention ? CircleAlert : searching ? Loader2 : status === 'listening' ? Bluetooth : BluetoothOff;
  const description = `Bluetooth: ${label}. ${ble.pendingCount} lecturas pendientes. Abrir dispositivos`;
  return <button type="button" aria-label={description} title={description}
    className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] self-end items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-rose-300 ${attention ? 'text-amber-700' : status === 'listening' ? 'text-emerald-700' : 'text-slate-500'}`}
    onClick={() => navigate('/settings/devices')}>
    <Icon aria-hidden="true" className={`h-5 w-5 ${searching && !attention ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    {ble.pendingCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">{ble.pendingCount > 99 ? '99+' : ble.pendingCount}</span>}
  </button>;
};
export default DeviceStatusButton;
