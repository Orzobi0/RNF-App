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
  const { status, remembered } = state;
  const searching = ['checking', 'searching', 'connecting', 'inspecting', 'binding'].includes(status);
  const listening = status === 'listening' && state.listenerResult?.connectionReady === true && state.listenerResult?.indicationsActive === true;
  const reconnect = state.gattReconnectRequired || state.volumeReconnectRequired || state.measurementModeReconnectRequired;
  const unlinked = !searching && !listening && remembered === false;
  const vinca = state.boundProtocol === 'vinca2' || state.boundModel === 'BM-Vinca2';
  const label = vinca ? (listening ? 'Conectado' : status === 'searching' ? 'Buscando termómetro…'
    : searching || state.restarting ? 'Conectando…' : unlinked ? 'Sin vincular' : 'Desconectado')
    : state.configurationBusy ? 'Preparando ajustes…' : state.restarting ? 'Reconectando' : listening ? 'Escuchando temperaturas' : status === 'stopping' ? 'Desconectando'
    : searching ? 'Buscando / conectando' : unlinked ? 'Sin vincular' : 'Desconectado';
  const Icon = listening || searching || unlinked ? Bluetooth : BluetoothOff;
  const description = `Bluetooth: ${label}. ${ble.pendingCount} lecturas pendientes.${issue ? ' El reloj requiere atención.' : ''} Abrir opciones`;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={description} title={description}
      className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 self-end items-center justify-center rounded-full transition-[transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-rose-300 motion-reduce:transition-none ${
  open ? 'scale-105 ring-2 ' : 'scale-100'
} ${listening ? 'text-emerald-700' : 'text-slate-500'}`}
    >
            {(searching || listening) && (
        <svg
          aria-hidden="true"
          viewBox="0 0 32 32"
          className="pointer-events-none absolute inset-0 m-auto h-8 w-8"
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

<g className="ble-wave-echo" strokeWidth="1.2">
  <path
    d="M8 12.5 Q5 16 8 19.5"
    className="ble-wave-left"
  />
  <path
    d="M24 12.5 Q27 16 24 19.5"
    className="ble-wave-right"
  />
</g>
        </svg>
      )}
      <Icon aria-hidden="true" className="h-5 w-5" />
      {unlinked && <Plus aria-hidden="true" className="absolute bottom-2 right-1 h-3 w-3" />}
      {ble.pendingCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">{ble.pendingCount > 99 ? '99+' : ble.pendingCount}</span>}
      {issue && <Clock aria-hidden="true" className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-yellow-100 p-0.5 text-yellow-700" />}
    </button></PopoverTrigger>
       <PopoverContent
  align="end"
  sideOffset={8}
  collisionPadding={12}
  aria-label="Accesos rápidos Bluetooth"
  className="
    z-[70]
    w-max max-w-[calc(100vw-24px)]
    origin-[var(--radix-popover-content-transform-origin)]
    rounded-full
    border border-rose-100
    bg-white
    p-2
    shadow-[0_10px_26px_rgba(55,35,45,0.18)]
    duration-200 ease-out
    data-[state=open]:animate-in
    data-[state=open]:fade-in-0
    data-[state=open]:zoom-in-95
    data-[state=closed]:duration-150
    data-[state=closed]:fade-out-0
    data-[state=closed]:zoom-out-95
    motion-reduce:animate-none
  "
>
  <div className="flex flex-nowrap items-center gap-2">

    {/* Conectar o reiniciar escucha */}
    <Button
      type="button"
      size="icon"
      className="h-11 w-11 shrink-0 rounded-full bg-fertiliapp-fuerte text-white shadow-sm hover:brightness-95"
      title={
        state.restarting
          ? 'Reconectando'
          : listening
            ? reconnect
              ? 'Recuperar conexión'
              : 'Reiniciar escucha'
            : remembered ? 'Conectar' : 'Añadir termómetro'
      }
      aria-label={
        state.restarting
          ? 'Reconectando'
          : listening
            ? reconnect
              ? 'Recuperar conexión'
              : 'Reiniciar escucha'
            : remembered ? 'Conectar' : 'Añadir termómetro'
      }
      disabled={
        state.configurationBusy ||
        state.bindingBusy ||
        state.volumeBusy ||
        state.measurementModeBusy ||
        state.deviceInfoBusy ||
        searching ||
        state.restarting ||
        status === 'stopping' ||
        state.busy ||
        state.clockBusy ||
        (ble.preview && !ble.visualLab)
      }
      onClick={() => {
        setOpen(false);

        void (
          listening
            ? ble.sessionRef.current?.restart()
            : remembered
              ? (state.changingDevice ? ble.sessionRef.current?.cancelChange() : ble.sessionRef.current?.start())
              : navigate('/settings/devices')
        );
      }}
    >
      <RefreshCw className="h-5 w-5" aria-hidden="true" />
    </Button>

    {/* Temperaturas pendientes */}
    {ble.pendingCount > 0 && (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative h-11 w-11 shrink-0 rounded-full border-rose-200 bg-transparent text-fertiliapp-fuerte hover:bg-rose-100"
        title="Incorporar"
        aria-label={`Incorporar (${ble.pendingCount})`}
        onClick={() => {
          setOpen(false);
          ble.openReadingReview?.();
        }}
      >
        <ClipboardList
          className="h-5 w-5"
          aria-hidden="true"
        />

        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-fertiliapp-fuerte px-0.5 text-[10px] font-bold leading-none text-white"
        >
          {ble.pendingCount > 99 ? '99+' : ble.pendingCount}
        </span>
      </Button>
    )}

    

    {/* Reloj con incidencia */}
    {issue && (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-full border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
        title="Reloj"
        aria-label="Reloj"
        onClick={() => {
          setOpen(false);
          ble.openClockDialog?.();
        }}
      >
        <Clock className="h-5 w-5" aria-hidden="true" />
      </Button>
    )}
    {/* Dispositivos */}
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-11 w-11 shrink-0 rounded-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
      title="Ir a Dispositivos"
      aria-label="Ir a Dispositivos"
      onClick={() => {
        setOpen(false);
        navigate('/settings/devices');
      }}
    >
      <Settings2 className="h-5 w-5" aria-hidden="true" />
    </Button>

  </div>
</PopoverContent>
  </Popover>;
};
