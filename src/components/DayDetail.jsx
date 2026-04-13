import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Edit2,
  Heart,
  Loader2,
  Trash2,
  Thermometer,
  Clock,
  Droplets,
  Circle,
  FileText,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeakModeButton } from '@/components/ui/peak-mode-button';
import { computePeakState } from '@/components/dataEntryForm/sectionLogic';
import { cn } from '@/lib/utils';
const DayDetail = ({
  isoDate,
  cycleDay,
  details,
  peakStatus, // P para día de pico, 1–3 para días posteriores
  isPeakDay,
  existingPeakIsoDate,
  onEdit,
  onDelete,
  onAdd,
  onToggleRelations,
  onTogglePeak,
  isProcessing,
}) => {
  const isPersistedRecord = (record) =>
  Boolean(record?.id) && !String(record.id).startsWith('placeholder-');

const persistedRecord = isPersistedRecord(details?.record) ? details.record : null;
const hasPersistedRecord = Boolean(persistedRecord);
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
  if (isTextExpanded) {
    setOverflow({ sensation: false, appearance: false, observations: false });
    return;
  }
  setOverflow({
    sensation: isOverflowing(sensationTextRef.current),
    appearance: isOverflowing(appearanceTextRef.current),
    observations: isOverflowing(observationsTextRef.current),
  });
}, [isTextExpanded]);

useEffect(() => {
  // esperar a layout estable (iOS)
  const id = requestAnimationFrame(() => recomputeOverflow());
  return () => cancelAnimationFrame(id);
}, [recomputeOverflow, sensationRaw, appearanceRaw, observationsRaw]);

useEffect(() => {
  const ro = new ResizeObserver(() => recomputeOverflow());
  if (sensationTextRef.current) ro.observe(sensationTextRef.current);
  if (appearanceTextRef.current) ro.observe(appearanceTextRef.current);
  if (observationsTextRef.current) ro.observe(observationsTextRef.current);
  return () => ro.disconnect();
}, [recomputeOverflow]);

const smartOpen = (key, sectionKey, fieldName) => {
  // si está truncado y aún no hemos expandido => expandir TODO primero
  if (!isTextExpanded && overflow[key]) {
    setIsTextExpanded(true);
    return;
  }
  handleSectionOpen(sectionKey, fieldName);
};

  const handleSectionOpen = (sectionKey, fieldName = null) => {
  if (persistedRecord && onEdit) {
    onEdit(persistedRecord, sectionKey, fieldName);
    return;
  }

  if (isoDate && onAdd) {
    onAdd(isoDate, sectionKey, fieldName);
  }
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

  const temperatureValue = details?.hasTemperature ? `${details.displayTemp} °C` : '—';
  const isTemperatureIgnored = Boolean(details?.hasTemperature && persistedRecord?.ignored);
  const timeValue = details?.timeValue || '—';
  const hasTimeValue = Boolean(details?.timeValue);
  const hasRelations = Boolean(details?.hasRelations);

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
        return 'bg-rose-500 border-slate-300 shadow-md';
      case 'pink':
        return 'bg-pink-500 border-slate-300 shadow-md';
      case 'green':
        return 'bg-emerald-500 border-slate-300 shadow-md';
      case 'yellow':
        return 'bg-yellow-400 border-slate-300 shadow-md';
      case 'spot':
        return 'bg-rose-500 border-slate-300 shadow-md';
      case 'white':
        return 'bg-white border-rose-300 shadow-md';
      default:
        return 'bg-slate-200 border-slate-300 shadow-md';
    }
  };

  // Estado vacío: sin día seleccionado
  if (!isoDate) {
    return (
      <div className="w-full rounded-3xl border border-rose-100/80 bg-white/70 p-4 text-center text-sm text-slate-500 shadow-sm">
        Selecciona un día en el calendario para ver o añadir un registro.
      </div>
    );
  }

  // Base para todos los chips (tamaño algo mayor y altura fija)
  const chipCompactClass =
  'flex items-center gap-2 rounded-3xl border px-3 py-1.5 text-sm min-h-[2.75rem]';

const chipMultilineClass =
  'flex gap-2 rounded-3xl border px-3 py-2 text-sm min-h-[2.75rem]';

const footerIconButtonClass =
  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200';

  // Tarjeta compacta pero más alta, usando el espacio disponible
  return (
  <div className="w-full rounded-3xl border border-rose-200/80 bg-white/90 p-4 sm:p-5 shadow-md backdrop-blur-md">
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
      onClick={() => handleSectionOpen('symbol', 'fertilitySymbol')}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border shadow-inner transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
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
  </div>
</div>

      {/* Cuerpo: 3 filas, más grandes y estructuradas */}
      <div className="mt-4 space-y-3">
        {/* Fila 1: temperatura + hora */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleSectionOpen('temperature', 'temperature')}
            className={cn(
              chipCompactClass,
              'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              details?.hasTemperature
                ? 'border-orange-100 bg-orange-50 text-orange-800'
                : 'border-orange-50 bg-orange-50 text-slate-400'
            )}
          >
            <Thermometer className="h-5 w-5 shrink-0 opacity-80" />
            <div className="flex items-center gap-1 flex-wrap">
              <span className={cn('font-semibold', isTemperatureIgnored && 'text-slate-400 line-through decoration-1')}>
                {renderChipValue(temperatureValue)}
              </span>
              {details?.showCorrectedIndicator && (
                <span
                  className="h-2 w-2 rounded-full bg-amber-500"
                  aria-label="Temperatura corregida"
                />
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleSectionOpen('temperature', 'time')}
            className={cn(
              chipCompactClass,
              'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              hasTimeValue
                ? 'border-slate-200 bg-slate-50 text-slate-800'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            )}
          >
            <Clock className="h-5 w-5 shrink-0 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(timeValue)}
            </span>
          </button>
        </div>

        {/* Fila 2: moco */}
        <div className="grid grid-cols-2 gap-3">
          <button
  type="button"
  onClick={() => smartOpen('sensation', 'sensation', 'mucusSensation')}
  className={cn(
    chipCompactClass,
    isTextExpanded ? 'items-start' : 'items-center',
    'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
    details?.hasMucusSensation
      ? 'border-sky-100 bg-sky-50 text-sky-800'
      : 'border-sky-50 bg-sky-50 text-slate-400'
  )}
>
  <Droplets
    className={cn(
      'h-[18px] w-[18px] shrink-0 opacity-80',
      isTextExpanded && 'mt-0.5'
    )}
  />
  <div className="min-w-0 flex-1">
    <div
      ref={sensationTextRef}
      className={cn(
        'font-semibold leading-tight',
        isTextExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'
      )}
    >
      {renderChipValue(mucusSensationValue)}
    </div>
  </div>
</button>

       <button
  type="button"
  onClick={() => smartOpen('appearance', 'appearance', 'mucusAppearance')}
  className={cn(
    chipCompactClass,
    isTextExpanded ? 'items-start' : 'items-center',
    'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
    details?.hasMucusAppearance
      ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
      : 'border-emerald-50 bg-emerald-50 text-slate-400'
  )}
>
  <Circle
    className={cn(
      'h-[18px] w-[18px] shrink-0 opacity-80',
      isTextExpanded && 'mt-0.5'
    )}
  />
  <div className="min-w-0 flex-1">
    <div
      ref={appearanceTextRef}
      className={cn(
        'font-semibold leading-tight',
        isTextExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'
      )}
    >
      {renderChipValue(mucusAppearanceValue)}
    </div>
  </div>
</button>
        </div>

        {/* Fila 3: observaciones + acciones */}
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={() => smartOpen('observations', 'observations', 'observations')}
    className={cn(
      chipMultilineClass,
      isTextExpanded ? 'items-start' : 'items-center',
      'flex-1 min-w-0 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
      observationsRaw
        ? 'border-violet-100 bg-violet-50 text-violet-800'
        : 'border-violet-100 bg-violet-50 text-slate-400'
    )}
  >
    <FileText
      className={cn(
        'h-[18px] w-[18px] shrink-0 opacity-80',
        isTextExpanded && 'mt-0.5'
      )}
    />
    <div className="min-w-0 flex-1">
      <div
        ref={observationsTextRef}
        className={cn(
          'font-semibold leading-tight whitespace-pre-wrap break-words',
          !isTextExpanded &&
            '[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden'
        )}
      >
        {renderChipValue(observationsValue, { placeholder: '-' })}
      </div>
    </div>
  </button>

  <div className="flex shrink-0 items-center gap-1">
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

    {hasPersistedRecord ? (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-slate-200 bg-white text-fertiliapp-fuerte hover:bg-rose-50"
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
          className="h-9 w-9 rounded-full border border-slate-200 bg-white text-fertiliapp-fuerte hover:bg-rose-50"
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
        className="h-9 rounded-full border-rose-200 px-3 text-xs font-semibold text-rose-500"
        onClick={handleAdd}
        disabled={isProcessing}
      >
        {isProcessing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        Añadir
      </Button>
    )}
  </div>
</div>
      </div>
    </div>
  );
};

export default DayDetail;
