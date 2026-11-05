import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function BleReadingReviewView({
  reading,
  draft,
  busy,
  error,
  checkedUncertain,
  setCheckedUncertain,
  change,
  confirm,
  onClose,
  navigate,
}) {
  return (
    <div aria-label="Revisar temperatura">
      <div className="space-y-3">

        {reading.importStatus === 'uncertain' && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
            <p>
              El resultado del intento anterior es incierto.
              Comprueba el día antes de repetirlo.
            </p>

            <Button
              variant="outline"
              onClick={() => navigate('/records', {
                state: {
                  selectedDate: draft.isoDate,
                  scrollToDayDetail: true,
                },
              })}
            >
              Comprobar día
            </Button>

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={checkedUncertain}
                onChange={event => setCheckedUncertain(event.target.checked)}
              />
              He comprobado el registro y quiero reintentar manualmente.
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Fecha
            <Input
              type="date"
              value={draft.isoDate}
              disabled={busy}
              onChange={event => change({ isoDate: event.target.value })}
              className="mt-1 min-w-0 w-full border-rose-200 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>

          <label className="block min-w-0 text-sm font-medium text-slate-700">
            Hora
            <Input
              type="time"
              value={draft.time}
              disabled={busy}
              onChange={event => change({ time: event.target.value })}
              className="mt-1 min-w-0 w-full border-rose-200 bg-white text-slate-700 focus-visible:ring-rose-300"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-amber-800">
            {error.code === 'ble-possible-duplicate'
              ? 'Posible duplicado'
              : 'Requiere revisión'}: {error.message}
          </p>
        )}

        {error?.code === 'ble-import-conflict' && (
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              navigate('/records');
            }}
          >
            Revisar ciclo en Mis registros
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11 rounded-full bg-fertiliapp-fuerte px-4 text-white hover:brightness-95"
            disabled={
              busy ||
              !draft.isoDate ||
              !draft.time ||
              (reading.importStatus === 'uncertain' && !checkedUncertain)
            }
            onClick={confirm}
          >
            {busy
              ? 'Incorporando…'
              : error?.code === 'ble-possible-duplicate'
                ? 'Es otra medición: confirmar y guardar'
                : 'Confirmar e incorporar'}
          </Button>

          <Button
            type="button"
            className="min-h-11"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}