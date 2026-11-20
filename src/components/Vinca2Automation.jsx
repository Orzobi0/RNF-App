import React, { useRef, useState } from 'react';
import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import { VINCA2_AUTOMATIC_IMPORT_BLOCKER } from '@/lib/bleMeasurements';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Vinca2ThermometerDrawing from '@/components/Vinca2ThermometerDrawing';

function useModeChoice(deviceKey, onChosen) {
  const metadata = useThermometerMetadata();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const choose = async mode => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!metadata.chooseIncorporationMode) throw new Error('Ajustes no disponibles.');
      await metadata.chooseIncorporationMode(deviceKey, mode);
      onChosen?.();
    } catch { setError('No se pudo confirmar la preferencia en el servidor. El modo efectivo sigue siendo Manual.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return { mode: metadata.devices[deviceKey]?.incorporationMode ?? 'manual', busy, error, choose };
}

export function Vinca2IncorporationSettings({ deviceKey }) {
  const { mode, busy, error, choose } = useModeChoice(deviceKey);
  return <fieldset disabled={busy} className="space-y-3 border-t border-slate-100 py-4">
    <legend className="pt-4 text-sm font-semibold text-titulo">Incorporación de temperaturas</legend>
    {[
      ['manual', 'Manual', 'Revisas y confirmas cada temperatura recibida.'],
      ['automatic', 'Automática', 'FertiliApp incorpora las temperaturas recientes que cumplen las condiciones de seguridad.'],
    ].map(([value, title, description]) => <label key={value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
      <input type="radio" name={`incorporation-${deviceKey}`} value={value} checked={mode === value}
        onChange={() => choose(value)} className="mt-1 accent-rose-600" />
      <span><span className="block font-semibold">{title}</span><span className="text-slate-600">{description}</span></span>
    </label>)}
    {mode === 'automatic' && <div className="space-y-2 text-xs text-slate-600">
      <p>Las lecturas dudosas seguirán apareciendo en Temperaturas pendientes.</p>
      <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">Preferencia guardada. Modo efectivo: Manual. {VINCA2_AUTOMATIC_IMPORT_BLOCKER}</p>
    </div>}
    <p className="text-xs text-slate-500">Esta opción actúa cuando FertiliApp recibe una temperatura por Bluetooth. No permite recibirla con la aplicación completamente cerrada.</p>
    {busy && <p role="status" className="text-xs">Guardando preferencia…</p>}
    {error && <p role="alert" className="text-xs text-amber-900">{error}</p>}
  </fieldset>;
}

export function Vinca2AutomationPrompt({ deviceKey, open, onClose }) {
  const { busy, error, choose } = useModeChoice(deviceKey, onClose);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" hideClose={busy}>
      <DialogHeader>
        <DialogTitle className="pr-5 text-xl text-titulo">Tu Vinca 2 puede hacerlo por ti</DialogTitle>
        <DialogDescription>¿Quieres automatizar el registro de tus temperaturas a partir de ahora?</DialogDescription>
      </DialogHeader>
      <svg aria-hidden="true" viewBox="0 0 240 100" fill="none" className="mx-auto h-28 w-full max-w-xs">
        <g transform="translate(-65 0)"><Vinca2ThermometerDrawing /></g>
        <path d="M87 50 Q111 38 131 50 M124 44 L132 50 L124 55" stroke="#d65a73" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="148" y="22" width="80" height="58" rx="12" fill="#fff1f3" stroke="#eab8c4" />
        <text x="188" y="47" textAnchor="middle" fill="#a8415a" fontSize="13">36,42 °C</text>
        <path d="M181 61 l5 5 10-11" stroke="#d65a73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm text-slate-700">FertiliApp puede incorporar automáticamente las temperaturas recientes de tu Vinca 2 cuando sea seguro hacerlo.</p>
      <p className="text-sm text-slate-600">Si alguna necesita revisión, seguirá apareciendo en Temperaturas pendientes.</p>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{VINCA2_AUTOMATIC_IMPORT_BLOCKER}</p>
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => choose('automatic')}>Sí, automatizar</Button>
        <Button disabled={busy} variant="outline" onClick={() => choose('manual')}>Prefiero hacerlo manualmente</Button>
      </div>
      {error && <p role="alert" className="text-xs text-amber-900">{error}</p>}
      <p className="text-center text-xs text-slate-500">Puedes cambiar esta opción cuando quieras desde Dispositivos.</p>
    </DialogContent>
  </Dialog>;
}
