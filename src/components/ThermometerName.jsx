import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import { thermometerName } from '@/lib/thermometerCatalog';

export function ThermometerName({ device, className = '' }) {
  const metadata = useThermometerMetadata();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const finished = useRef(false);
  const inputRef = useRef(null);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  const name = thermometerName({ ...device, ...metadata.devices[device.deviceKey] });
  const finish = cancel => {
    if (finished.current) return;
    finished.current = true;
    if (!cancel) {
      try { metadata.patch(device.deviceKey, { customName: draft.trim().slice(0, 40) || null }); setError(''); }
      catch { finished.current = false; setError('No se pudo guardar el nombre. Conserva el cambio y vuelve a intentarlo.'); return; }
    }
    setEditing(false);
  };
  return <div className={className}>
    <div className="flex min-w-0 items-start gap-1">
      {editing ? <input aria-label="Nombre del termómetro" maxLength={40} value={draft}
        className="w-full min-w-0 rounded bg-white font-inherit text-inherit outline outline-1 outline-rose-300"
        ref={inputRef}
        onChange={event => setDraft(event.target.value)} onBlur={() => finish(false)}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Escape'); } }} />
        : <><span className="min-w-0 break-words">{name}</span><button type="button" aria-label="Editar nombre del termómetro" className="relative flex h-7 w-11 shrink-0 items-center justify-center text-slate-400 hover:text-fertiliapp-fuerte after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']" onClick={() => { finished.current = false; setDraft(name); setEditing(true); }}><Pencil className="h-3 w-3" /></button></>}
    </div>
    {error && <p role="alert" className="text-xs font-normal text-amber-800">{error}</p>}
  </div>;
}
