import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Circle, Droplets, Edit3, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function MucusQuickEditSheet({
  open, onOpenChange, isoDate, initialValues, initialField = 'mucusSensation',
  onSave, onOpenForm,
}) {
  const [draft, setDraft] = useState({ mucusSensation: '', mucusAppearance: '' });
  const initialRef = useRef(draft);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const sensationRef = useRef(null);
  const appearanceRef = useRef(null);
  const backdropPress = useRef(false);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    if (!open) return;
    const values = {
      mucusSensation: initialValues?.mucusSensation ?? initialValues?.mucus_sensation ?? '',
      mucusAppearance: initialValues?.mucusAppearance ?? initialValues?.mucus_appearance ?? '',
    };
    initialRef.current = values;
    setDraft(values);
    setError('');
    // Snapshot on opening; a background refresh must not replace typed text.
  }, [open, isoDate]);

  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const update = () => setViewport({
      height: window.visualViewport.height,
      bottom: Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop),
    });
    update();
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    return () => {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    };
  }, [open]);

  const submit = async (openForm = false) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const changed = Object.keys(draft).some((key) => draft[key] !== initialRef.current[key]);
      if (!openForm || changed) {
        await onSave(draft);
        initialRef.current = { ...draft };
      }
      if (openForm) {
        if (await onOpenForm(draft) === false) throw new Error('form');
      }
      onOpenChange(false);
    } catch {
      setError('No se pudieron guardar los cambios o abrir el formulario. Inténtalo de nuevo.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <Dialog.Root open={open} onOpenChange={(value) => { if (!saving.current) onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/10"
        onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
        onPointerCancel={() => { backdropPress.current = false; }}
        onClick={(event) => {
          if (backdropPress.current && event.target === event.currentTarget && !saving.current) onOpenChange(false);
          backdropPress.current = false;
        }} />
      <Dialog.Content
        className="fixed inset-x-0 bottom-0 z-[101] mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-rose-100 bg-white shadow-xl outline-none"
        style={{ bottom: viewport?.bottom, maxHeight: viewport ? viewport.height * 0.9 : undefined, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => { if (saving.current) event.preventDefault(); }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (initialField === 'mucusAppearance' ? appearanceRef : sensationRef).current?.focus();
        }}>
        <div className="flex shrink-0 items-start justify-between gap-2 px-5 py-4">
          <div>
            <Dialog.Title className="text-xl font-semibold text-subtitulo">Moco cervical</Dialog.Title>
            <Dialog.Description className="text-sm text-suave">{isoDate ? format(parseISO(isoDate), "d 'de' MMMM", { locale: es }) : ''}</Dialog.Description>
          </div>
          <div className="flex">
            {onOpenForm && <button type="button" disabled={busy} onClick={() => submit(true)} aria-label="Abrir formulario completo" title="Abrir formulario completo" className="flex h-11 w-11 items-center justify-center rounded-full text-subtitulo hover:bg-rose-50"><Edit3 className="h-5 w-5" /></button>}
            <Dialog.Close asChild><button type="button" disabled={busy} aria-label="Cerrar moco cervical" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-rose-50"><X className="h-5 w-5" /></button></Dialog.Close>
          </div>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="rounded-3xl border border-sensacion bg-white/85 p-3 shadow-sm">
            <label htmlFor="quick-mucus-sensation" className="mb-2 flex items-center gap-1 text-sm font-semibold text-subtitulo"><Droplets className="h-4 w-4 text-sensacion" />Sensación</label>
            <Input ref={sensationRef} id="quick-mucus-sensation" disabled={busy} value={draft.mucusSensation} enterKeyHint="next"
              onChange={(event) => setDraft({ ...draft, mucusSensation: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); appearanceRef.current?.focus(); } }}
              className="rounded-full border-slate-200/70 bg-white text-base font-semibold text-slate-700 shadow-sm focus:border-sensacion focus:ring-2 focus:ring-sensacion focus-visible:ring-sensacion" />
          </div>
          <div className="rounded-3xl border border-apariencia bg-white/85 p-3 shadow-sm">
            <label htmlFor="quick-mucus-appearance" className="mb-2 flex items-center gap-1 text-sm font-semibold text-subtitulo"><Circle className="h-4 w-4 text-apariencia" />Apariencia</label>
            <Input ref={appearanceRef} id="quick-mucus-appearance" disabled={busy} value={draft.mucusAppearance} enterKeyHint="done"
              onChange={(event) => setDraft({ ...draft, mucusAppearance: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
              className="rounded-full border-slate-200/70 bg-white text-base font-semibold text-slate-700 shadow-sm focus:border-apariencia focus:ring-2 focus:ring-apariencia focus-visible:ring-apariencia" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2 px-4 pt-2">
          <Button type="button" variant="outline" disabled={busy} className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={busy} className="flex-1 rounded-full bg-ok text-white hover:bg-ok-fuerte" onClick={() => submit()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
