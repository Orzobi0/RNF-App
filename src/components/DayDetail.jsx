import ObservationsQuickEditSheet from '@/components/ObservationsQuickEditSheet';
import SymbolQuickEditSheet from '@/components/SymbolQuickEditSheet';
import MucusQuickEditSheet from '@/components/MucusQuickEditSheet';
import TemperatureMeasurementsSheet, { TemperatureMeasurementTrigger } from '@/components/TemperatureMeasurementsSheet';
import { measurementsFromRecord } from '@/lib/temperatureMeasurements';
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Edit2,
  Heart,
  Loader2,
  Trash2,
  Droplets,
  Circle,
  FileText,
  Plus,
  ChevronDown,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeakModeButton } from '@/components/ui/peak-mode-button';
import { computePeakState } from '@/components/dataEntryForm/sectionLogic';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeStoredPreferences, PREFERENCE_DEFAULTS } from '@/lib/preferences';
import { cn } from '@/lib/utils';
const DayDetail = ({
  isoDate,
  cycleDay,
  details,
  peakStatus, // P para día de pico, 1–3 para días posteriores
  isPeakDay,
  existingPeakIsoDate,
  onEdit,
  onClose,
  onLoadMeasurements,
  onSaveMeasurements,
  onSaveMucus,
  onSaveDetails,
  onTemperatureSheetOpenChange,
  onDelete,
  onAdd,
  onToggleRelations,
  onTogglePeak,
  isProcessing,
}) => {
  const { preferences } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const isPersistedRecord = (record) =>
  Boolean(record?.id) && !String(record.id).startsWith('placeholder-');

const persistedRecord = isPersistedRecord(details?.record) ? details.record : null;
const hasPersistedRecord = Boolean(persistedRecord);
  const [temperaturesOpen, setTemperaturesOpen] = useState(false);
  const [observationsOpen, setObservationsOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [mucusField, setMucusField] = useState(null);
  useEffect(() => {
    onTemperatureSheetOpenChange?.(temperaturesOpen || Boolean(mucusField) || observationsOpen || symbolOpen);
    return () => onTemperatureSheetOpenChange?.(false);
  }, [temperaturesOpen, mucusField, observationsOpen, symbolOpen, onTemperatureSheetOpenChange]);
  const [temperatureMeasurements, setTemperatureMeasurements] = useState([]);
  const [temperaturesLoading, setTemperaturesLoading] = useState(false);
  const [temperaturesError, setTemperaturesError] = useState('');
  const loadVersion = useRef(0);
  useEffect(() => {
    loadVersion.current += 1;
    setTemperaturesOpen(false);
    setMucusField(null);
    setObservationsOpen(false);
    setSymbolOpen(false);
    setTemperatureMeasurements([]);
    setTemperaturesLoading(false);
    setTemperaturesError('');
  }, [isoDate]);
  useEffect(() => () => { loadVersion.current += 1; }, []);
  const cancelTemperatureLoad = () => {
    loadVersion.current += 1;
    setTemperaturesLoading(false);
  };
  const openTemperatures = async () => {
    const version = ++loadVersion.current;
    setTemperaturesError('');
    if (!persistedRecord || (persistedRecord.measurementsLoaded === true && persistedRecord.measurementsComplete === true)) {
      setTemperatureMeasurements(measurementsFromRecord(persistedRecord));
      setTemperaturesLoading(false);
      setTemperaturesOpen(true);
      return;
    }
    setTemperaturesLoading(true);
    let timeout;
    try {
      const loaded = await Promise.race([
        onLoadMeasurements(persistedRecord, { requireComplete: true }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Tiempo de espera agotado')), 15000);
        }),
      ]);
      if (loadVersion.current !== version) return;
      setTemperatureMeasurements(loaded);
      setTemperaturesOpen(true);
    } catch {
      if (loadVersion.current === version) setTemperaturesError('No se pudieron cargar todas las temperaturas. Revisa la conexión e inténtalo de nuevo. No se ha modificado el registro.');
    } finally {
      clearTimeout(timeout);
      if (loadVersion.current === version) setTemperaturesLoading(false);
    }
  };
  const saveTemperatures = async (next, operation) => {
    await onSaveMeasurements(persistedRecord, next, { ...operation, isoDate });
    setTemperatureMeasurements(next);
  };
  const [isPeakProcessing, setIsPeakProcessing] = useState(false);

  const formattedDate = useMemo(() => {
    if (!isoDate) return null;
    try {
      return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es });
    } catch (error) {
      return null;
    }
  }, [isoDate]);
  const { mode: peakMode } = useMemo(
  () =>
    computePeakState({
      peakTag: isPeakDay ? 'peak' : null,
      existingPeakIsoDate,
      selectedIsoDate: isoDate,
    }),
  [existingPeakIsoDate, isPeakDay, isoDate]
);

const peakAriaLabel = useMemo(() => {
  if (!isoDate) return 'Selecciona una fecha para marcar el día pico';

  const selectedFull = formattedDate ?? isoDate;
  const existingFull = existingPeakIsoDate
    ? format(parseISO(existingPeakIsoDate), 'dd/MM/yyyy', { locale: es })
    : null;

  if (peakMode === 'assign') {
    return `Marcar día pico en ${selectedFull}`;
  }

  if (peakMode === 'update') {
    return existingFull
      ? `Mover día pico a ${selectedFull} (desde ${existingFull})`
      : `Mover día pico a ${selectedFull}`;
  }

  return existingFull
    ? `Quitar día pico del ${existingFull}`
    : 'Quitar día pico';
}, [existingPeakIsoDate, formattedDate, isoDate, peakMode]);


  const symbolValue = details?.symbolInfo?.value || 'none';
  const hasRealSymbol = symbolValue !== 'none' && symbolValue !== null;
  const symbolUiState = !hasPersistedRecord
    ? 'no-record'
    : hasRealSymbol
      ? 'real-symbol'
      : 'no-symbol-with-record';
  const symbolLabel = useMemo(() => {
    if (symbolUiState === 'no-record') return 'Sin registro';
    if (symbolUiState === 'no-symbol-with-record') return 'Sin símbolo';
    return details?.symbolInfo?.label || 'Símbolo';
  }, [details?.symbolInfo?.label, symbolUiState]);
  const symbolPatternClass =
    symbolUiState === 'real-symbol' && details?.symbolInfo?.pattern === 'spotting-pattern'
      ? 'spotting-pattern-icon'
      : '';

  const handleEdit = () => {
  if (!persistedRecord || !onEdit) return;
  onEdit(persistedRecord, null, null);
};

  const handleDelete = () => {
  if (!persistedRecord?.id || !onDelete) return;
  onDelete(persistedRecord.id);
};

  const handleAdd = () => {
    if (!isoDate || !onAdd) return;
    onAdd(isoDate);
  };
  const handlePeakToggle = async () => {
  if (!isoDate || !onTogglePeak || isProcessing || isPeakProcessing) return;

  setIsPeakProcessing(true);

  try {
    await onTogglePeak({
      isoDate,
      peakMode,
      isPeakDay,
    });
  } catch (error) {
    // El toast global se gestionará desde la página padre
  } finally {
    setIsPeakProcessing(false);
  }
};
  const [isTextExpanded, setIsTextExpanded] = useState(false);
const [overflow, setOverflow] = useState({
  sensation: false,
  appearance: false,
  observations: false,
});

const sensationTextRef = useRef(null);
const appearanceTextRef = useRef(null);
const observationsTextRef = useRef(null);
// Textos "raw" (sin placeholder) para detectar overflow real
const sensationRaw = String(details?.mucusSensation ?? '').trim();
const appearanceRaw = String(details?.mucusAppearance ?? '').trim();
const observationsRaw = String(details?.observationsText ?? '').trim();

// Valores que pintas en UI (con placeholder)
const mucusSensationValue = sensationRaw || '—';
const mucusAppearanceValue = appearanceRaw || '—';
const observationsValue = observationsRaw || '';

useEffect(() => {
  setIsTextExpanded(false);
  setOverflow({ sensation: false, appearance: false, observations: false });
}, [isoDate]);

const isOverflowing = (el) => {
  if (!el) return false;
  // para truncate y para line-clamp (altura)
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
};

const recomputeOverflow = useCallback(() => {
  // Conservar la medición compacta: el texto abierto ya no está truncado.
  if (isTextExpanded) return;
  const next = {
    sensation: isOverflowing(sensationTextRef.current),
    appearance: isOverflowing(appearanceTextRef.current),
    observations: isOverflowing(observationsTextRef.current),
  };
  setOverflow((previous) =>
    Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next
  );
}, [isTextExpanded]);

useEffect(() => {
  // esperar a layout estable (iOS)
  const id = requestAnimationFrame(() => recomputeOverflow());
  return () => cancelAnimationFrame(id);
}, [recomputeOverflow, isoDate, sensationRaw, appearanceRaw, observationsRaw]);

useEffect(() => {
  const ro = new ResizeObserver(() => recomputeOverflow());
  if (sensationTextRef.current) ro.observe(sensationTextRef.current);
  if (appearanceTextRef.current) ro.observe(appearanceTextRef.current);
  if (observationsTextRef.current) ro.observe(observationsTextRef.current);
  return () => ro.disconnect();
}, [recomputeOverflow, isoDate]);

const hasTextOverflow = overflow.sensation || overflow.appearance || overflow.observations;
const expandMucusRows = isTextExpanded && (overflow.sensation || overflow.appearance);
// Los hijos con layout="position" compensan la escala de las celdas
// para mantener legibles el texto y los iconos durante el cambio de tamaño.
const textLayoutProps = {
  layout: !shouldReduceMotion,
  layoutDependency: isTextExpanded,
  transition: { layout: { duration: shouldReduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] } },
};
const positionLayoutProps = {
  ...textLayoutProps,
  layout: shouldReduceMotion ? false : 'position',
};

  const handleRelationsToggle = () => {
    if (!isoDate || !onToggleRelations) return;
    onToggleRelations(isoDate);
  };

  const renderChipValue = (value, options = {}) => {
    if (value && typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number') {
      return value;
    }
    return options.placeholder || '—';
  };

  const hasTimeValue = Boolean(details?.timeValue);
  const hasRelations = Boolean(details?.hasRelations);
  const showRelationsAction = useMemo(
    () => normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS).showRelationsRow,
    [preferences]
  );

// Normalizamos el indicador de pico para la UI
let peakIndicatorLabel = null;

if (peakStatus) {
  if (peakStatus === 'P' || isPeakDay) {
    peakIndicatorLabel = 'Día pico';
  } else {
    peakIndicatorLabel = `+${peakStatus}`;
  }
}

  const getSymbolClasses = () => {
    if (symbolUiState === 'no-record') {
      return 'bg-transparent border-slate-300/70 border-dashed shadow-none text-slate-400';
    }

    switch (symbolValue) {
      case 'red':
        return 'bg-[#fb7185] border-slate-300 shadow-md';
      case 'pink':
        return 'bg-pink-500 border-slate-300 shadow-md';
      case 'green':
        return 'bg-[#67C5A4] border-slate-300 shadow-md';
      case 'yellow':
        return 'bg-[#F7B944] border-slate-300 shadow-md';
      case 'spot':
        return 'bg-rose-500 border-slate-300 shadow-md';
      case 'white':
        return 'bg-white border-2 border-rose-400 shadow-md';
      default:
        return 'bg-slate-200 border-slate-300 shadow-md';
    }
  };

  // Estado vacío: sin día seleccionado
  if (!isoDate) {
    return (
      <div className="w-full rounded-3xl border border-rose-100/70 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
        Selecciona un día en el calendario para ver o añadir un registro.
      </div>
    );
  }

  // Base para celdas tactiles neutras con acento discreto.
const detailCellCompactClass =
  'relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-rose-100/70 bg-white px-3 py-2 text-sm min-h-[2.75rem] shadow-none transition-colors hover:bg-rose-50/30 active:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fertiliapp-suave';

const detailCellMultilineClass =
  'relative flex gap-2.5 overflow-hidden rounded-2xl border border-rose-100/70 bg-white px-3 py-2 text-sm min-h-[2.75rem] shadow-none transition-colors hover:bg-rose-50/30 active:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fertiliapp-suave';

const detailAccentClass =
  'pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full';

const detailCellStyles = {
  temperature: {
    accent: details?.hasTemperature ? 'bg-temp opacity-90' : 'bg-temp opacity-25',
    icon: details?.hasTemperature ? 'text-temp opacity-100' : 'text-temp opacity-35',
    value: details?.hasTemperature ? 'text-titulo' : 'text-suave',
  },
  time: {
    accent: hasTimeValue ? 'bg-secundario opacity-70' : 'bg-slate-300 opacity-35',
    icon: hasTimeValue ? 'text-secundario-fuerte opacity-80' : 'text-slate-400 opacity-45',
    value: hasTimeValue ? 'text-subtitulo' : 'text-suave',
  },
  sensation: {
    accent: details?.hasMucusSensation ? 'bg-sensacion opacity-85' : 'bg-sensacion opacity-25',
    icon: details?.hasMucusSensation ? 'text-sensacion opacity-100' : 'text-sensacion opacity-35',
    value: details?.hasMucusSensation ? 'text-titulo' : 'text-suave',
  },
  appearance: {
    accent: details?.hasMucusAppearance ? 'bg-apariencia opacity-85' : 'bg-apariencia opacity-25',
    icon: details?.hasMucusAppearance ? 'text-apariencia opacity-100' : 'text-apariencia opacity-35',
    value: details?.hasMucusAppearance ? 'text-titulo' : 'text-suave',
  },
  observations: {
    accent: observationsRaw ? 'bg-observaciones opacity-85' : 'bg-observaciones opacity-25',
    icon: observationsRaw ? 'text-observaciones opacity-100' : 'text-observaciones opacity-35',
    value: observationsRaw ? 'text-titulo' : 'text-suave',
  },
};

const footerIconButtonClass =
  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200';

  // Tarjeta compacta pero más alta, usando el espacio disponible
  return (
  <div className="w-full rounded-3xl border border-rose-300/60 bg-white p-4 shadow-[0_8px_18px_rgba(216,92,112,0.08)] sm:p-5">
      {/* Cabecera: fecha + día ciclo + badge pico | botón pico + símbolo */}
<div className="flex items-center gap-2.5">
  <div className="min-w-0 flex-1">
  <div className="flex items-center gap-1.5">
    <p className="truncate text-[1.05rem] font-semibold leading-tight text-subtitulo sm:text-lg">
        {formattedDate}
        {cycleDay ? ` · Día ${cycleDay}` : ''}
      </p>

      {peakIndicatorLabel && (
        <span
  className="inline-flex h-6 shrink-0 items-center rounded-full border border-rose-300 bg-gradient-to-r from-rose-50 to-pink-50 px-2 text-[10px] font-semibold leading-none text-rose-700 shadow-sm shadow-rose-100"
>
  {peakIndicatorLabel}
</span>
      )}
    </div>
  </div>

  <div className="ml-auto flex shrink-0 items-center gap-2">
    <div className="origin-right scale-[0.76]">
      <PeakModeButton
        mode={peakMode}
        size="md"
        onClick={handlePeakToggle}
        aria-pressed={isPeakDay}
        aria-label={peakAriaLabel}
        disabled={isProcessing || isPeakProcessing || !isoDate || !onTogglePeak}
      />
    </div>

    <button
      type="button"
      onClick={() => setSymbolOpen(true)}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
        getSymbolClasses(),
        symbolPatternClass
      )}
      title={symbolLabel}
      aria-label={symbolLabel}
    >
      {symbolUiState === 'no-record' && (
        <Plus className="h-3 w-3 text-slate-400/80" strokeWidth={2.1} aria-hidden="true" />
      )}
    </button>
    {onClose && (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        aria-label="Cerrar detalle del día"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    )}
  </div>
</div>

      {/* Cuerpo: 3 filas, más grandes y estructuradas */}
      <div className="mt-4 space-y-3">
        <TemperatureMeasurementTrigger
          measurements={temperaturesOpen && !temperaturesLoading && !temperaturesError ? temperatureMeasurements : measurementsFromRecord(persistedRecord)}
          ignored={persistedRecord?.ignored} disabled={isProcessing}
          loading={temperaturesLoading}
          onClick={temperaturesLoading ? cancelTemperatureLoad : openTemperatures}
        />
        {temperaturesError && <div role="alert" className="text-sm text-rose-700">
          {temperaturesError}
          <Button type="button" variant="ghost" onClick={openTemperatures}>Reintentar</Button>
        </div>}
        <TemperatureMeasurementsSheet open={temperaturesOpen} onOpenChange={setTemperaturesOpen}
          ignored={persistedRecord?.ignored} isoDate={isoDate} measurements={temperatureMeasurements} onChange={saveTemperatures}
          onOpenForm={onEdit ? async (measurements, overrides) => {
            if (await onEdit({ ...persistedRecord, id: persistedRecord?.id || `placeholder-${isoDate}`, isoDate, ...overrides, measurements, measurementsLoaded: true, measurementsComplete: true }, null, null) === false) return;
            setTemperaturesOpen(false);
          } : undefined} />

        <ObservationsQuickEditSheet open={observationsOpen} onOpenChange={setObservationsOpen}
          isoDate={isoDate} initialValues={persistedRecord}
          onSave={(values) => onSaveDetails(isoDate, values)}
          onOpenForm={(values) => onEdit({ ...persistedRecord, id: persistedRecord?.id || `placeholder-${isoDate}`, isoDate, ...values }, 'observations', 'observations')} />
        <SymbolQuickEditSheet open={symbolOpen} onOpenChange={setSymbolOpen}
          isoDate={isoDate} initialValues={persistedRecord}
          onSave={(values) => onSaveDetails(isoDate, values)}
          onOpenForm={() => onEdit({ ...persistedRecord, id: persistedRecord?.id || `placeholder-${isoDate}`, isoDate }, 'moco', 'fertilitySymbol')} />
        <MucusQuickEditSheet open={Boolean(mucusField)} onOpenChange={(value) => { if (!value) setMucusField(null); }}
          isoDate={isoDate} initialField={mucusField} initialValues={persistedRecord}
          onSave={(values) => onSaveMucus(isoDate, values)}
          onOpenForm={(values) => onEdit({ ...persistedRecord, id: persistedRecord?.id || `placeholder-${isoDate}`, isoDate, ...values }, 'moco', mucusField)} />

        {/* Fila 2: moco */}
        <div className={cn('grid gap-3', expandMucusRows ? 'grid-cols-1' : 'grid-cols-2')}>
          <motion.button
  {...textLayoutProps}
  style={{ borderRadius: 16 }}
  type="button"
  aria-label="Editar sensación"
  onClick={() => setMucusField('mucusSensation')}
  className={cn(
    detailCellCompactClass,
    isTextExpanded ? 'items-start' : 'items-center',
    'min-w-0 text-left'
  )}
>
  <span aria-hidden="true" className={cn(detailAccentClass, detailCellStyles.sensation.accent)} />
  <motion.span {...positionLayoutProps} className="flex shrink-0">
  <Droplets
    className={cn(
      'h-[18px] w-[18px] shrink-0',
      detailCellStyles.sensation.icon,
      isTextExpanded && 'mt-0.5'
    )}
  />
  </motion.span>
  <motion.div {...positionLayoutProps} className="min-w-0 flex-1">
    <div
      ref={sensationTextRef}
      className={cn(
        'font-semibold leading-tight',
        detailCellStyles.sensation.value,
        isTextExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'
      )}
    >
      {renderChipValue(mucusSensationValue)}
    </div>
  </motion.div>
</motion.button>

       <motion.button
  {...textLayoutProps}
  style={{ borderRadius: 16 }}
  type="button"
  aria-label="Editar apariencia"
  onClick={() => setMucusField('mucusAppearance')}
  className={cn(
    detailCellCompactClass,
    isTextExpanded ? 'items-start' : 'items-center',
    'min-w-0 text-left'
  )}
>
  <span aria-hidden="true" className={cn(detailAccentClass, detailCellStyles.appearance.accent)} />
  <motion.span {...positionLayoutProps} className="flex shrink-0">
  <Circle
    className={cn(
      'h-[18px] w-[18px] shrink-0',
      detailCellStyles.appearance.icon,
      isTextExpanded && 'mt-0.5'
    )}
  />
  </motion.span>
  <motion.div {...positionLayoutProps} className="min-w-0 flex-1">
    <div
      ref={appearanceTextRef}
      className={cn(
        'font-semibold leading-tight',
        detailCellStyles.appearance.value,
        isTextExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'
      )}
    >
      {renderChipValue(mucusAppearanceValue)}
    </div>
  </motion.div>
</motion.button>
        </div>

        {/* Fila 3: observaciones + acciones */}
<motion.div {...positionLayoutProps} className="flex items-center gap-3">
  <motion.button
    {...textLayoutProps}
    style={{ borderRadius: 16 }}
    type="button"
    onClick={() => setObservationsOpen(true)}
    aria-label="Editar observaciones"
    className={cn(
      detailCellMultilineClass,
      isTextExpanded ? 'items-start' : 'items-center',
      'flex-1 min-w-0 text-left'
    )}
  >
    <span aria-hidden="true" className={cn(detailAccentClass, detailCellStyles.observations.accent)} />
    <motion.span {...positionLayoutProps} className="flex shrink-0">
    <FileText
      className={cn(
        'h-[18px] w-[18px] shrink-0',
        detailCellStyles.observations.icon,
        isTextExpanded && 'mt-0.5'
      )}
    />
    </motion.span>
    <motion.div {...positionLayoutProps} className="min-w-0 flex-1">
      <div
        ref={observationsTextRef}
        className={cn(
          'font-semibold leading-tight whitespace-pre-wrap break-words',
          detailCellStyles.observations.value,
          !isTextExpanded &&
            '[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden'
        )}
      >
        {renderChipValue(observationsValue, { placeholder: '-' })}
      </div>
    </motion.div>
  </motion.button>

  <motion.div {...positionLayoutProps} className="flex shrink-0 items-center gap-1">
    {showRelationsAction && (
      <button
        type="button"
        onClick={handleRelationsToggle}
        disabled={isProcessing}
        className={cn(
          footerIconButtonClass,
          hasRelations
            ? 'border-rose-200 bg-rose-50 text-rose-500'
            : 'border-slate-200 bg-white text-slate-300',
          isProcessing && 'cursor-not-allowed opacity-70'
        )}
        title={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
        aria-label={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
      >
        <Heart
          className={cn(
            'h-4 w-4 shrink-0',
            hasRelations ? 'fill-current' : ''
          )}
        />
      </button>
    )}

    {hasPersistedRecord ? (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-slate-200 bg-white text-subtitulo hover:bg-rose-50"
          onClick={handleEdit}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Edit2 className="h-4 w-4" />
          )}
          <span className="sr-only">Editar registro</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-slate-200 bg-white text-subtitulo hover:bg-rose-50"
          onClick={handleDelete}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          <span className="sr-only">Eliminar registro</span>
        </Button>
      </>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-full border-slate-200 px-3 text-xs font-semibold text-subtitulo bg-white"
        onClick={handleAdd}
        disabled={isProcessing}
      >
        {isProcessing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        Añadir
      </Button>
    )}
  </motion.div>
</motion.div>
      </div>
      {(hasTextOverflow || isTextExpanded) && (
        <motion.button
          {...positionLayoutProps}
          type="button"
          aria-label={isTextExpanded ? 'Contraer texto' : 'Mostrar texto completo'}
          aria-expanded={isTextExpanded}
          onClick={(event) => {
            event.stopPropagation();
            setIsTextExpanded((expanded) => !expanded);
          }}
          className="mx-auto -mb-4 flex h-11 w-full items-center justify-center rounded-full text-slate-400 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 sm:-mb-5"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4', isTextExpanded && 'rotate-180')}
          />
        </motion.button>
      )}
    </div>
  );
};

export default DayDetail;
