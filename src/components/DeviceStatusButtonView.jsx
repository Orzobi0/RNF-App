import React, { useState } from 'react';

import {

  Bluetooth, BluetoothOff, CircleAlert, Loader2,

  RefreshCw, Settings2, ClipboardList,

} from 'lucide-react';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

import { Button } from '@/components/ui/button';



export const DeviceStatusButtonView = ({ ble, navigate }) => {

  const [open, setOpen] = useState(false);

  if (!ble.enabled) return null;

  const { status, clockResult, clockError } = ble.sessionState;

  const attention = status === 'error' || clockResult?.significantDrift || Boolean(clockError);

  const searching = ['checking', 'searching', 'connecting'].includes(status);

  const label = status === 'listening' ? 'Escuchando temperaturas' : status === 'connecting' ? 'Conectando' : searching ? 'Buscando termómetro' : status === 'error' ? 'Requiere atención' : status === 'missing' ? 'Termómetro no encontrado' : ble.sessionState.remembered === false ? 'Sin vincular' : 'Desconectado';

  const Icon = attention ? CircleAlert : searching ? Loader2 : status === 'listening' ? Bluetooth : BluetoothOff;

  const description = `Bluetooth: ${label}. ${ble.pendingCount} lecturas pendientes. Abrir opciones`;

  const go = path => { setOpen(false); navigate(path); };

  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" aria-label={description} title={description}

    className={`relative flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 self-end items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-rose-300 ${attention ? 'text-amber-700' : status === 'listening' ? 'text-emerald-700' : 'text-slate-500'}`}

    >

    <Icon aria-hidden="true" className={`h-5 w-5 ${searching && !attention ? 'animate-spin motion-reduce:animate-none' : ''}`} />

    {ble.pendingCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">{ble.pendingCount > 99 ? '99+' : ble.pendingCount}</span>}

  </button></PopoverTrigger>

    

<PopoverContent

  align="end"

  collisionPadding={12}

  className="z-[70] w-48 max-w-[calc(100vw-24px)] space-y-2 p-3"

  aria-label="Opciones Bluetooth"

>

  <p role="status" className="text-sm font-medium">

    {label}

  </p>



  <p className="text-xs text-slate-600">

    {ble.pendingCount} {ble.pendingCount === 1

      ? 'lectura pendiente'

      : 'lecturas pendientes'}

  </p>



  {ble.preview && (

    <p className="text-xs text-slate-500">

      Vista previa

    </p>

  )}



  {(clockResult?.significantDrift || clockError) && <p className="text-xs text-amber-800">El reloj requiere atención. Puedes revisarlo en Dispositivos.</p>}

  <div className="flex items-center justify-center gap-3 pt-1">

    {(

      <Button

        type="button"

        size="icon"

        className="h-11 w-11 rounded-full"

        title="Buscar nuevas"

        aria-label="Buscar nuevas"

        disabled={searching || status === 'listening' || ble.sessionState.busy || (ble.preview && !ble.visualLab)}

        onClick={() => {

          setOpen(false);

          void (ble.sessionState.remembered

            ? ble.sessionRef.current?.start()

            : ble.sessionRef.current?.scan());

        }}

      >

        <RefreshCw className="h-5 w-5" aria-hidden="true" />

        <span className="sr-only">Buscar nuevas</span>

      </Button>

    )}



    {ble.pendingCount > 0 && (

      <Button

        type="button"

        variant="outline"

        size="icon"

        className="h-11 w-11 rounded-full"

        title="Incorporar"

        aria-label={`Incorporar (${ble.pendingCount})`}

        onClick={() => { setOpen(false); ble.openReadingReview?.(); }}

      >

        <ClipboardList className="h-5 w-5" aria-hidden="true" />

        <span className="sr-only">Incorporar</span>

      </Button>

    )}



    <Button

      type="button"

      variant="outline"

      size="icon"

      className="h-11 w-11 rounded-full"

      title="Ir a Dispositivos"

      aria-label="Ir a Dispositivos"

      onClick={() => go('/settings/devices')}

    >

      <Settings2 className="h-5 w-5" aria-hidden="true" />

      <span className="sr-only">Ir a Dispositivos</span>

    </Button>

  </div>

</PopoverContent>



  </Popover>;

};

