import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Edit3, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';

export default function SymbolQuickEditSheet({
  open, onOpenChange, isoDate, initialValues,
  onSave, onOpenForm,
}) {
  const selected = initialValues?.fertility_symbol ?? initialValues?.fertilitySymbol ?? 'none';
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const backdropPress = useRef(false);
  const [viewport, setViewport] = useState(null);

  useEffect(() => { setError(''); }, [open, isoDate]);

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

  const submit = async (value, openForm = false) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (openForm) {
        if (await onOpenForm() === false) throw new Error('form');
      } else if (value !== selected) {
        await onSave({ fertility_symbol: value });
      }
      onOpenChange(false);
    } catch {
      setError('No se pudo guardar el símbolo o abrir el formulario. Inténtalo de nuevo.');
    } finally { saving.current = false; setBusy(false); }
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
        >
        <div className="flex shrink-0 items-start justify-between gap-2 px-5 py-4">
          <div>
            <Dialog.Title className="text-xl font-semibold text-subtitulo">Símbolo</Dialog.Title>
            <Dialog.Description className="text-sm text-suave">{isoDate ? format(parseISO(isoDate), "d 'de' MMMM", { locale: es }) : ''}</Dialog.Description>
          </div>
          <div className="flex">
            {onOpenForm && <button type="button" disabled={busy} onClick={() => submit(null, true)} aria-label="Abrir formulario completo" title="Abrir formulario completo" className="flex h-11 w-11 items-center justify-center rounded-full text-subtitulo hover:bg-rose-50"><Edit3 className="h-5 w-5" /></button>}
            <Dialog.Close asChild><button type="button" disabled={busy} aria-label="Cerrar símbolo" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-rose-50"><X className="h-5 w-5" /></button></Dialog.Close>
          </div>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="grid grid-cols-3 gap-2" aria-label="Símbolo">
            {FERTILITY_SYMBOL_OPTIONS.map((option) => <button key={option.value} type="button" disabled={busy}
              aria-pressed={selected === option.value} onClick={() => submit(option.value)}
              className={`relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60 ${selected === option.value ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-300' : 'border-slate-200 bg-white'}`}>
              <span aria-hidden="true" className={`h-10 w-10 rounded-full ${option.color}`} />
              <span>{option.label}</span>
              {selected === option.value && <Check aria-hidden="true" className="absolute right-1 top-1 h-4 w-4 text-rose-600" />}
            </button>)}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
