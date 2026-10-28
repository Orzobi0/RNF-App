import { useAuth } from '@/contexts/AuthContext';
import { normalizePreferenceValue, validatePreferenceField } from '@/lib/preferences';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, Loader2, MoreHorizontal, Thermometer, X, Check, Edit3, Clock, Eye, EyeOff, Trash2 } from 'lucide-react';
import { addHours, format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  measurementDisplay, measurementSourceLabel, newManualMeasurement,
  normalizeMeasurements, sortedMeasurements, temperatureNumber,
} from '@/lib/temperatureMeasurements';

export const MeasurementSourceChip = ({ measurement, label }) => {
  const text = measurementSourceLabel(measurement, label);
  return text ? <span title={text} className="inline-block min-w-0 max-w-20 truncate rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-normal leading-4 text-slate-600">{text}</span> : null;
};

const MeasurementValue = ({ measurement, ignored = false }) => (
  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-700">
    <span className={`shrink-0 rounded-full border border-slate-200/70 bg-white px-2 py-1 font-semibold leading-none shadow-sm tabular-nums ${ignored ? 'line-through opacity-60' : ''}`}>{measurementDisplay(measurement)}</span>
    <span className="shrink-0 text-xs font-medium text-slate-500 tabular-nums">{measurement.time}</span>
    <MeasurementSourceChip measurement={measurement} />
    {ignored && <EyeOff className="h-3.5 w-3.5 shrink-0 text-alerta-2" aria-label="Temperatura despreciada" />}
    {measurement.use_corrected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Temperatura corregida" title={`Corregida · original ${measurement.temperature} °C`} />}
  </span>
);

const measurementRowClass = (selected, ignored = false) => `relative flex items-center gap-1 rounded-3xl border p-2 shadow-sm transition-colors ${
  selected && ignored ? 'border-alerta-2-suave bg-white/60 ring-1 ring-alerta-2-suave' : selected ? 'border-temp bg-white/85 ring-1 ring-temp' : 'border-slate-200/60 bg-white/85'
}`;

export const TemperatureMeasurementTrigger = ({ measurements, onClick, disabled, ignored, loading = false }) => {
  const valid = normalizeMeasurements(measurements);
  const selected = valid.find((m) => m.selected);
  const hasTemperature = Boolean(selected);
  return <button type="button" onClick={onClick} disabled={disabled} aria-busy={loading} aria-label={loading ? "Cancelar carga de temperaturas" : hasTemperature ? "Gestionar temperaturas" : "Añadir temperatura"}
    className="relative flex min-h-[44px] w-full items-center gap-1.5 rounded-2xl border border-rose-100/70 bg-white px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50">
    <span aria-hidden="true" className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-temp ${hasTemperature ? 'opacity-75' : 'opacity-25'}`} />
    <Thermometer className={`h-[18px] w-[18px] shrink-0 text-temp ${hasTemperature ? '' : 'opacity-35'}`} />
    <span className={`shrink-0 font-semibold ${hasTemperature ? 'text-subtitulo' : 'text-suave'} ${ignored ? 'line-through opacity-60' : ''}`}>
      {hasTemperature ? measurementDisplay(selected) : '-'}
    </span>
    {selected?.time && <span className="shrink-0 text-xs text-slate-500">{selected.time}</span>}
    <MeasurementSourceChip measurement={selected} />
    {selected?.use_corrected && <span title="Temperatura corregida" aria-label="Temperatura corregida" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
    {loading ? <Loader2 aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 animate-spin text-slate-400 motion-reduce:animate-none" /> : <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" />}
  </button>;
};

export default function TemperatureMeasurementsSheet({ open, onOpenChange, isoDate, measurements, onChange, loading = false, loadError = '', onRetry, autoSave = true, onOpenForm, ignored = false }) {
  const { preferences, savePreferences } = useAuth();
  const preferredTime = normalizePreferenceValue('preferredTemperatureTime', preferences?.preferredTemperatureTime) || '';
  const [preferredEditorOpen, setPreferredEditorOpen] = useState(false);
  const [preferredDraft, setPreferredDraft] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const autoOpened = useRef(false);
  const editorRef = useRef(null);
  const sheetRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const backdropPressRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(null);
  useEffect(() => {
    if (!open || !window.visualViewport) return undefined;
    const update = () => setViewportHeight(window.visualViewport.height);
    update();
    window.visualViewport.addEventListener('resize', update);
    return () => window.visualViewport.removeEventListener('resize', update);
  }, [open]);
  useLayoutEffect(() => { setEditor(null); setDeleting(null); setPreferredEditorOpen(false); setError(''); autoOpened.current = false; }, [open, isoDate]);
  const commit = async (next, operation) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError('');
    try {
      const normalized = normalizeMeasurements(next);
      await onChange(normalized, normalized.length === 0 ? { ...operation, ignored: false } : operation);
      setEditor(null); setDeleting(null);
      return normalized;
    } catch {
      setError('No se pudieron guardar las temperaturas. Inténtalo de nuevo.');
      return null;
    } finally { saving.current = false; setBusy(false); }
  };
  const edit = (index) => {
    setPreferredEditorOpen(false);
    setError('');
    setCorrectionOpen(index !== null && !!measurements[index]?.use_corrected);
    setEditor({ index, ignored: index === null ? false : ignored, initialIgnored: ignored, draft: index === null ? { ...newManualMeasurement(), selected: measurements.length === 0 } : { ...measurements[index] } });
  };
  useLayoutEffect(() => {
    if (!open || loading || loadError || autoOpened.current) return;
    autoOpened.current = true;
    if (measurements.length === 0) edit(null);
  }, [open, isoDate, loading, loadError, measurements.length]);
  const field = (key, value) => setEditor((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  const openPreferredTimeEditor = () => {
    setPreferredDraft(preferredTime || editor?.draft.time || '');
    setPreferredEditorOpen(true);
  };
  const savePreferredTime = async (clear = false) => {
    if (saving.current) return;
    const value = clear ? '' : preferredDraft;
    const validationError = validatePreferenceField('preferredTemperatureTime', value);
    if (validationError) { setError(validationError); return; }
    const applyFirst = !clear && !preferredTime && editor?.draft.source !== 'bluetooth';
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await savePreferences({ preferredTemperatureTime: value });
      if (applyFirst) field('time', value);
      setPreferredEditorOpen(false);
    } catch {
      setError('No se pudo guardar la hora preferida. Inténtalo de nuevo.');
    } finally { saving.current = false; setBusy(false); }
  };
  const adjustCorrection = (delta) => {
    const raw = temperatureNumber(editor.draft.temperature);
    if (raw === null) return;
    const corrected = Number(((temperatureNumber(editor.draft.temperature_corrected) ?? raw) + delta).toFixed(2));
    if (corrected < 34 || corrected > 40) return;
    const time = format(addHours(parse(editor.draft.time || '00:00', 'HH:mm', new Date()), Math.round((corrected - raw) * 10)), 'HH:mm');
    setEditor((current) => ({ ...current, draft: { ...current.draft, temperature_corrected: corrected, time_corrected: time, use_corrected: true } }));
  };
  const editorInputClass = 'h-8 min-w-0 rounded-3xl border-slate-200/70 bg-white px-2 text-[14px] font-semibold leading-none text-slate-700 shadow-sm focus:border-temp focus:ring-2 focus:ring-temp focus-visible:ring-temp [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const saveEdit = () => {
    if (!editorRef.current?.reportValidity()) return;
    const draft = { ...editor.draft };
    draft.temperature = temperatureNumber(draft.temperature);
    draft.temperature_corrected = temperatureNumber(draft.temperature_corrected);
    if (draft.temperature === null && draft.temperature_corrected === null) {
      setError('Introduce una temperatura entre 34 y 40 °C.'); return;
    }
    if (draft.use_corrected && draft.temperature_corrected === null) {
      setError('Introduce la temperatura corregida o desactiva su uso.'); return;
    }
    const next = [...measurements];
    if (editor.index === null) next.push(draft);
    else next[editor.index] = draft;
    return commit(next, { action: editor.index === null ? 'add' : 'edit', index: editor.index, ...(editor.draft.selected && editor.ignored !== editor.initialIgnored ? { ignored: editor.ignored } : {}) });
  };
  const openForm = async () => {
    if (saving.current || loading) return;
    // Do not discard an editor draft when switching to the full record form.
    const emptyNewDraft = editor?.index === null &&
      !String(editor.draft.temperature ?? '').trim() &&
      !String(editor.draft.temperature_corrected ?? '').trim() &&
      !editorRef.current?.querySelector('input:invalid');
    const next = editor && !emptyNewDraft ? await saveEdit() : measurements;
    if (!next) return;
    try {
      await onOpenForm(next, editor?.draft.selected && editor.ignored !== editor.initialIgnored
        ? { ignored: editor.ignored } : {});
    } catch {
      setError('No se pudo abrir el formulario. Inténtalo de nuevo.');
    }
  };
  const requestDelete = (index) => {
    if (measurements[index].selected && measurements.length > 1) {
      setError('Esta es la temperatura utilizada actualmente. Selecciona otra medición antes de eliminarla.');
      return;
    }
    deleteTriggerRef.current = sheetRef.current?.querySelector(`[aria-label="Opciones de medición ${index + 1}"]`);
    setError(''); setDeleting(index);
  };
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!saving.current) onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/10"
        onPointerDown={(event) => { backdropPressRef.current = event.target === event.currentTarget && event.button === 0; }}
        onPointerCancel={() => { backdropPressRef.current = false; }}
        onClick={(event) => {
          // Opening a portalled menu can retarget the end of a touch gesture.
          // Only a gesture that started on the backdrop may dismiss the sheet.
          const startedOnBackdrop = backdropPressRef.current;
          backdropPressRef.current = false;
          if (startedOnBackdrop && event.target === event.currentTarget && !saving.current && deleting === null) onOpenChange(false);
        }} />
      <Dialog.Content
        ref={sheetRef}
        onPointerDownCapture={() => { backdropPressRef.current = false; }}
        onInteractOutside={(event) => event.preventDefault()}
        className="fixed inset-x-0 bottom-0 z-[101] mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-rose-100 bg-white shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', maxHeight: viewportHeight ? `${viewportHeight * 0.85}px` : undefined }}>
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-4">
          <div><Dialog.Title className="text-xl font-semibold text-subtitulo">Temperaturas</Dialog.Title>
            <Dialog.Description className="text-sm text-slate-500">{isoDate ? format(parseISO(isoDate), "d 'de' MMMM", { locale: es }) : ''}</Dialog.Description></div>
          <div className="flex shrink-0 items-center">
            {onOpenForm && <button type="button" disabled={busy || loading || Boolean(loadError)} onClick={openForm}
              className="flex h-11 w-11 items-center justify-center rounded-full text-subtitulo hover:bg-rose-50 disabled:opacity-50"
              aria-label={editor ? 'Guardar y abrir formulario' : 'Abrir formulario completo'}
              title={editor ? 'Guardar y abrir formulario' : 'Abrir formulario completo'}>
              <Edit3 className="h-5 w-5" />
            </button>}
            <Dialog.Close asChild><button type="button" disabled={busy} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-rose-50" aria-label="Cerrar temperaturas"><X className="h-5 w-5" /></button></Dialog.Close>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {(error || loadError) && deleting === null && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error || loadError}</p>}
          {loading ? <div className="space-y-3 pb-3" aria-busy="true">
            {measurements.filter((m) => m.selected).map((m, index) => <div key={index} className={measurementRowClass(true, ignored)}>
              <Thermometer aria-hidden="true" className="mx-1 h-4 w-4 shrink-0 text-temp" />
              <MeasurementValue measurement={m} ignored={m.selected && ignored} />
            </div>)}
            <p role="status" className="py-2 text-xs text-suave">Cargando temperaturas…</p>
            <div aria-hidden="true" className="h-12 animate-pulse rounded-3xl border border-slate-200/60 bg-slate-50 motion-reduce:animate-none" />
          </div> : loadError ? <Button type="button" onClick={onRetry}>Reintentar</Button> : editor ? (
            <form ref={editorRef} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); saveEdit(); }} className="space-y-4 pb-3">
              {measurements.length === 0 && <p className="text-sm text-suave">Sin temperaturas registradas</p>}
              <p className="font-semibold">{editor.index === null ? 'Añadir medición manual' : 'Editar medición'}</p>
              <fieldset disabled={busy} className="space-y-3">
                <div className={`relative overflow-hidden space-y-1.5 rounded-3xl border p-2.5 shadow-sm ring-1 transition-colors ${editor.draft.selected && editor.ignored ? 'border-alerta-2-suave bg-white/60 ring-alerta-2-suave' : 'border-temp bg-white/85 ring-temp'}`}>
                  <span aria-hidden="true" className={`pointer-events-none absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${editor.draft.selected && editor.ignored ? 'bg-alerta-2 opacity-75' : 'bg-temp opacity-85'}`} />
                  <div className="flex items-center gap-1 text-[13px] font-semibold text-subtitulo"><Thermometer className="h-4 w-4 text-temp" />Temperatura</div>
                  <div className={editor.draft.source !== 'bluetooth' ? 'grid grid-cols-[minmax(0,1fr)_96px_68px] gap-1.5' : 'grid grid-cols-[minmax(0,1fr)_110px] gap-1.5'}>
                    <Input aria-label="Temperatura (°C)" autoFocus type="number" inputMode="decimal" step="0.01" min="34" max="40" placeholder="36.50" value={editor.draft.temperature ?? ''} onChange={(e) => field('temperature', e.target.value)} className={editorInputClass} />
                    <Input aria-label="Hora de toma" type="time" required value={editor.draft.time ?? ''} onChange={(e) => field('time', e.target.value)} className={editorInputClass} />
                    {editor.draft.source !== 'bluetooth' && <div className="relative">
                      <Button type="button" variant="outline" aria-label={preferredTime ? `Aplicar hora preferida ${preferredTime}` : 'Definir hora preferida'}
                        onClick={() => preferredTime ? field('time', preferredTime) : openPreferredTimeEditor()}
                        className={`h-8 w-full rounded-2xl px-1 text-[11px] font-semibold ${preferredTime ? editor.draft.time === preferredTime ? 'border-secundario bg-secundario text-white hover:bg-secundario' : 'border-slate-200/70 bg-white/80 text-temp' : 'border-dashed border-slate-200 bg-white/70 text-slate-400'}`}>
                        <Clock className="mr-1 h-3 w-3" />{preferredTime || '--:--'}
                      </Button>
                      {preferredTime && <button type="button" aria-label="Editar hora preferida" title="Editar hora preferida" onClick={openPreferredTimeEditor}
                        className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-temp shadow-sm"><Edit3 className="h-2.5 w-2.5" /></button>}
                    </div>}
                  </div>
                  {preferredEditorOpen && editor.draft.source !== 'bluetooth' && <div className="space-y-1 rounded-2xl border border-slate-200/60 bg-white/75 p-2 shadow-sm">
                    <label htmlFor="sheet-preferred-time" className="block text-[11px] font-semibold text-subtitulo">Hora preferida</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input id="sheet-preferred-time" type="time" value={preferredDraft} onChange={(event) => setPreferredDraft(event.target.value)} className={`${editorInputClass} w-28`} />
                      <Button type="button" size="xs" disabled={!preferredDraft} onClick={() => savePreferredTime()} className="h-8 rounded-full bg-temp px-3 text-[11px] text-white hover:bg-temp">Guardar</Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setPreferredEditorOpen(false)} className="h-8 rounded-full px-2 text-[11px] text-temp">Cancelar</Button>
                      {preferredTime && <Button type="button" size="icon" variant="ghost" aria-label="Eliminar hora preferida" onClick={() => savePreferredTime(true)} className="h-8 w-8 rounded-full text-rose-600"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </div>}

                  <Button type="button" size="xs" variant="outline" aria-pressed={correctionOpen} onClick={() => {
                    setCorrectionOpen(!correctionOpen);
                    if (!correctionOpen) {
                      if (temperatureNumber(editor.draft.temperature_corrected) === null) field('temperature_corrected', editor.draft.temperature);
                      if (!editor.draft.time_corrected) field('time_corrected', editor.draft.time);
                    }
                  }} className={`h-8 rounded-full px-2.5 text-[11px] font-semibold ${correctionOpen ? 'border-temp bg-temp text-white hover:bg-temp hover:text-white' : 'border-slate-200/70 bg-white/70 text-temp'}`}>
                    {editor.draft.use_corrected ? <Check className="mr-1 h-3.5 w-3.5" /> : <Edit3 className="mr-1 h-3.5 w-3.5" />}{editor.draft.use_corrected ? 'Corregida' : 'Corregir'}
                  </Button>
                  {editor.index !== null && <Button type="button" variant="outline" disabled={!editor.draft.selected || editor.index === null}
                    aria-pressed={editor.draft.selected && editor.ignored}
                    onClick={() => setEditor((current) => ({ ...current, ignored: !current.ignored }))}
                    className={`ml-2 h-8 rounded-full px-2.5 text-[11px] font-semibold ${editor.draft.selected && editor.ignored ? 'border-alerta-2 bg-alerta-2 text-white hover:bg-alerta-2 hover:text-white' : 'border-slate-200/70 bg-white/80 text-temp hover:border-temp hover:bg-white hover:text-temp focus:text-temp active:text-temp'}`}>
                    {editor.draft.selected && editor.ignored ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                    {editor.draft.selected && editor.ignored ? 'Restaurar' : 'Despreciar'}
                  </Button>}
                  {editor.index !== null && !editor.draft.selected && <p className="text-xs text-suave">Para despreciarla, selecciona primero esta medición para la gráfica.</p>}
                  {correctionOpen && <div className="space-y-1.5 rounded-3xl border border-slate-200/60 bg-white/80 p-2 shadow-sm">
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input aria-label="Temperatura corregida (opcional)" type="number" inputMode="decimal" step="0.01" min="34" max="40" value={editor.draft.temperature_corrected ?? ''} onChange={(e) => { field('temperature_corrected', e.target.value); field('use_corrected', true); }} className={editorInputClass} />
                      <Input aria-label="Hora corregida" type="time" value={editor.draft.time_corrected ?? ''} onChange={(e) => field('time_corrected', e.target.value)} className={editorInputClass} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="inline-flex rounded-full border border-slate-200/70 bg-white/75 p-0.5">
                        <Button type="button" variant="ghost" aria-label="Disminuir temperatura corregida 0,10 grados" className="h-8 w-9 rounded-full px-0 text-temp" onClick={() => adjustCorrection(-0.1)}>−</Button>
                        <Button type="button" variant="ghost" aria-label="Aumentar temperatura corregida 0,10 grados" className="h-8 w-9 rounded-full px-0 text-temp" onClick={() => adjustCorrection(0.1)}>+</Button>
                      </div>
                      <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-700"><Checkbox checked={!!editor.draft.use_corrected} onCheckedChange={(checked) => field('use_corrected', checked === true)} />Usar valor corregido</label>
                    </div>
                  </div>}
                </div>
                <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1 rounded-3xl border-pink-200" onClick={() => { setEditor(null); setError(''); }}>Cancelar</Button><Button type="submit" aria-label="Guardar medición" className="flex-1 rounded-3xl bg-ok text-white hover:bg-ok-fuerte">{busy ? 'Guardando…' : 'Guardar'}</Button></div>
              </fieldset>
            </form>
          ) : <div className="space-y-3 px-0.5 pb-3">
            <p className="pb-2 text-xs text-slate-500">Selecciona la temperatura para la gráfica e interpretación.{autoSave && ' Los cambios se guardan al momento.'}</p>
            {!measurements.length && <p className="py-4 text-sm text-slate-500">Sin temperatura</p>}
            {sortedMeasurements(measurements).map(({ measurement: m, index }) => <div key={m.id ?? index} className={measurementRowClass(m.selected, ignored)}>
              <span aria-hidden="true" className={`pointer-events-none absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${m.selected && ignored ? 'bg-alerta-2 opacity-75' : m.selected ? 'bg-temp opacity-85' : 'bg-temp opacity-25'}`} />
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 p-1">
                <input type="radio" className="h-4 w-4 shrink-0 focus-visible:outline-temp" style={{ accentColor: 'var(--color-temp)' }} name="selected-temperature" checked={!!m.selected} disabled={busy} onChange={() => commit(measurements.map((item, i) => ({ ...item, selected: i === index })), { action: 'select', index, ignored: false })} aria-label={`Usar ${measurementDisplay(m)} a las ${m.time || 'hora desconocida'}`} />
                <MeasurementValue measurement={m} ignored={m.selected && ignored} />
              </label>
              <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild><button type="button" disabled={busy} aria-label={`Opciones de medición ${index + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-rose-50"><MoreHorizontal className="h-5 w-5" /></button></DropdownMenu.Trigger>
                <DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-[102] min-w-36 rounded-xl border bg-white p-1 shadow-lg">
                  <DropdownMenu.Item className="cursor-pointer rounded-lg p-3 outline-none focus:bg-rose-50" onSelect={() => edit(index)}>Editar</DropdownMenu.Item>
                  <DropdownMenu.Item className="cursor-pointer rounded-lg p-3 text-rose-700 outline-none focus:bg-rose-50" onSelect={() => requestDelete(index)}>Eliminar</DropdownMenu.Item>
                </DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>)}
            <Button type="button" variant="outline" disabled={busy} onClick={() => edit(null)} className="mt-3 min-h-11 w-full rounded-3xl border-slate-200/70 bg-white/80 text-temp shadow-sm hover:border-temp hover:bg-white hover:text-temp">+ Añadir medición manual</Button>
          </div>}
        </div>
        <AlertDialog.Root open={deleting !== null} onOpenChange={(value) => {
          if (!value && !saving.current) { setDeleting(null); setError(''); }
        }}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[103] bg-slate-950/25" />
            <AlertDialog.Content
              className="fixed left-1/2 top-1/2 z-[104] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-3xl border border-rose-100 bg-white p-5 shadow-xl outline-none"
              onEscapeKeyDown={(event) => { if (saving.current) event.preventDefault(); }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const target = deleteTriggerRef.current;
                if (target?.isConnected) target.focus();
                else sheetRef.current?.focus();
              }}>
              <AlertDialog.Title className="text-lg font-semibold text-subtitulo">¿Eliminar temperatura?</AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-suave">
                Se eliminará la medición de {measurementDisplay(measurements[deleting])}. Los otros datos del día se conservarán.
              </AlertDialog.Description>
              {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
              <div className="flex gap-2">
                <AlertDialog.Cancel asChild><Button type="button" variant="outline" disabled={busy} className="flex-1 rounded-full">Cancelar</Button></AlertDialog.Cancel>
                <Button type="button" disabled={busy} className="flex-1 rounded-full bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => commit(measurements.filter((_, i) => i !== deleting), { action: 'delete', index: deleting })}>
                  {busy ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
