import React, { useState } from 'react';
import { Bluetooth, BluetoothOff, Clock, Plus, RefreshCw, Settings2, ClipboardList } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useClockIssue } from './useClockIssue';

export const DeviceStatusButtonView = ({ ble, navigate }) => {
  const [open, setOpen] = useState(false);
  const state = ble.sessionState ?? {};
  const { issue } = useClockIssue(state, ble.clockHistory);
  if (!ble.enabled) return null;
  const { status, remembered, error } = state;
  const searching = ['checking', 'searching', 'connecting', 'inspecting', 'binding'].includes(status);
  const listening = status === 'listening' && state.listenerResult?.connectionReady === true && state.listenerResult?.indicationsActive === true;
  const reconnect = state.gattReconnectRequired || state.volumeReconnectRequired || state.measurementModeReconnectRequired;
  const unlinked = !searching && !listening && remembered === false;
  const label = state.configurationBusy ? 'Preparando ajustes…' : state.restarting ? 'Reconectando' : listening ? 'Escuchando temperaturas' : status === 'stopping' ? 'Desconectando'
    : searching ? 'Buscando / conectando' : unlinked ? 'Sin vincular' : 'Desconectado';
  const Icon = listening || searching || unlinked ? Bluetooth : BluetoothOff;
  const explanation = error?.code === 'CONNECTION_CANCELLED' ? 'Conexión cancelada. Puedes buscar de nuevo.'
    : status === 'missing' ? 'No se ha encontrado el termómetro. Puedes buscar de nuevo.'
    : error ? 'No se pudo completar la conexión. Consulta los detalles en Dispositivos.' : null;
  const description = `Bluetooth: ${label}. ${ble.pendingCount} lecturas pendientes.${issue ? ' El reloj requiere atención.' : ''} Abrir opciones`;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={description} title={description}
      className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 self-end items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-rose-300 ${listening ? 'text-emerald-700' : 'text-slate-500'}`}>
      {(searching || listening) && <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 h-11 w-11 animate-pulse motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M13 16 Q8 22 13 28 M8 12 Q0 22 8 32 M31 16 Q36 22 31 28 M36 12 Q44 22 36 32" />
      </svg>}
      <Icon aria-hidden="true" className="h-5 w-5" />
      {unlinked && <Plus aria-hidden="true" className="absolute bottom-2 right-1 h-3 w-3" />}
      {ble.pendingCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">{ble.pendingCount > 99 ? '99+' : ble.pendingCount}</span>}
      {issue && <Clock aria-hidden="true" className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-yellow-100 p-0.5 text-yellow-700" />}
    </button></PopoverTrigger>
    <PopoverContent align="end" collisionPadding={12} className="z-[70] w-60 max-w-[calc(100vw-24px)] space-y-2 p-3" aria-label="Opciones Bluetooth">
      <p role="status" className="text-sm font-medium">{label}</p>
      <p className="text-xs text-slate-600">{ble.pendingCount} {ble.pendingCount === 1 ? 'lectura pendiente' : 'lecturas pendientes'}</p>
      {ble.preview && <p className="text-xs text-slate-500">Vista previa</p>}
      {explanation && <p className="text-xs text-slate-600">{explanation}</p>}
      {issue && <p className="text-xs text-amber-800">El reloj requiere atención.</p>}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button type="button" size="icon" className="h-11 w-11 rounded-full" title={state.restarting ? 'Reconectando' : listening ? reconnect ? 'Recuperar conexión' : 'Reiniciar escucha' : 'Buscar nuevas'} aria-label={state.restarting ? 'Reconectando' : listening ? reconnect ? 'Recuperar conexión' : 'Reiniciar escucha' : 'Buscar nuevas'}
          disabled={state.configurationBusy || state.bindingBusy || state.changingDevice || state.volumeBusy || state.measurementModeBusy || state.deviceInfoBusy || searching || state.restarting || status === 'stopping' || state.busy || state.clockBusy || (ble.preview && !ble.visualLab)}
          onClick={() => { setOpen(false); void (listening ? ble.sessionRef.current?.restart() : remembered ? ble.sessionRef.current?.start() : ble.sessionRef.current?.scan()); }}>
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </Button>
        {ble.pendingCount > 0 && <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-full" title="Incorporar" aria-label={`Incorporar (${ble.pendingCount})`}
          onClick={() => { setOpen(false); ble.openReadingReview?.(); }}><ClipboardList className="h-5 w-5" aria-hidden="true" /></Button>}
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-full" title="Ir a Dispositivos" aria-label="Ir a Dispositivos"
          onClick={() => { setOpen(false); navigate('/settings/devices'); }}><Settings2 className="h-5 w-5" aria-hidden="true" /></Button>
        {issue && <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-full" title="Reloj" aria-label="Reloj"
          onClick={() => { setOpen(false); ble.openClockDialog?.(); }}><Clock className="h-5 w-5 text-yellow-700" aria-hidden="true" /></Button>}
      </div>
    </PopoverContent>
  </Popover>;
};
