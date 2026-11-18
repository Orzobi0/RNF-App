import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ThermometerVerificationView({ trial, name, busy, onConfirm, onStop, onRetry }) {
  const [selectedId, setSelectedId] = useState('');
  const [basal, setBasal] = useState(false);
  useEffect(() => { setSelectedId(''); setBasal(false); }, [trial.verificationId]);
  const readings = trial.readings ?? [];
  const selected = readings.find(item => item.readingId === selectedId) ?? readings[0];
  useEffect(() => { setBasal(false); }, [selected?.readingId]);
  const listening = trial.status === 'listening';
  const active = listening || trial.status === 'connecting';
  const decimal = value => Number(value).toFixed(2).replace('.', ',');
  const action = 'min-h-11 h-auto w-fit whitespace-normal rounded-xl px-3 py-2';
  return <section aria-label="Comprobar termómetro" className="space-y-2 rounded-2xl border border-slate-200/70 bg-white p-4">
    <h3 className="font-semibold text-titulo">{name}</h3>
    <p role="status" className="text-sm">{trial.status === 'connecting' ? 'Comprobando conexión…' : listening ? 'Realiza una medición' : 'No se ha completado la comprobación.'}</p>
    {listening && <p className="flex items-center gap-2 text-sm text-fertiliapp-fuerte"><svg aria-hidden="true" viewBox="0 0 44 44" className="h-5 w-5 animate-pulse motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 16 Q8 22 13 28 M8 12 Q0 22 8 32 M31 16 Q36 22 31 28 M36 12 Q44 22 36 32" /></svg>Esperando temperatura…</p>}
    {!active && !readings.length && <p className="text-sm text-slate-600">No ha sido posible comprobar la recepción. Puedes repetirla.</p>}
    {trial.error && <p role="alert" className="text-sm text-amber-800">{trial.error}</p>}
    <div className="flex flex-wrap gap-2">
      {!active && <Button variant="outline" className={action} disabled={busy} onClick={onRetry}>Repetir comprobación</Button>}
      {active && <Button variant="ghost" className={action} onClick={onStop}>Cancelar comprobación</Button>}
    </div>
    <Dialog open={listening && readings.length > 0} onOpenChange={open => { if (!open) onStop(); }}>
      <DialogContent className="w-[calc(100%-32px)] max-w-md max-h-[80dvh] overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>Temperatura recibida</DialogTitle><DialogDescription>{name}. ¿Coincide con la temperatura de tu termómetro?</DialogDescription></DialogHeader>
        {selected && <p className="text-center text-3xl font-semibold text-titulo">{decimal(selected.temperatureC)} °C</p>}
        {selected?.temperatureUnit === 'fahrenheit' && <p className="text-center text-sm">En el termómetro: {decimal(selected.temperatureOriginal)} °F</p>}
        <label className="text-sm">Medición que estás comprobando
          <select aria-label="Medición que estás comprobando" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-2" value={selected?.readingId ?? ''} onChange={event => { setSelectedId(event.target.value); setBasal(false); }}>
            {readings.map((reading, index) => <option key={reading.readingId ?? index} value={reading.readingId}>{index + 1}. {decimal(reading.temperatureC)} °C · {reading.deviceTimestamp || 'Sin fecha original'}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={basal} onChange={event => setBasal(event.target.checked)} />Es la medición que estoy comprobando y utilizo un termómetro basal.</label>
        <p className="text-xs text-slate-500">Comprueba la recepción; no verifica la precisión ni el reloj del termómetro.</p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" className={action} onClick={onStop}>No, es diferente</Button>
          <Button className={action} disabled={busy || !basal || !selected?.readingId || !trial.verificationId} onClick={() => onConfirm({ readingId: selected.readingId, basalConfirmed: basal })}>Sí, coincide</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
export default ThermometerVerificationView;
