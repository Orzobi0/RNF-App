import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DayDetail = ({
  isoDate,
  cycleDay,
  details,
  peakStatus, // P para día de pico, 1–3 para días posteriores
  isPeakDay,
  onEdit,
  onDelete,
  onAdd,
  onToggleRelations,
  isProcessing,
}) => {
  const hasRecord = Boolean(details?.record);

  const formattedDate = useMemo(() => {
    if (!isoDate) return null;
    try {
      return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es });
    } catch (error) {
      return null;
    }
  }, [isoDate]);

  const symbolLabel = details?.symbolInfo?.label || 'Sin símbolo';
  const symbolValue = details?.symbolInfo?.value || 'none';
  const symbolPatternClass =
    details?.symbolInfo?.pattern === 'spotting-pattern' ? 'spotting-pattern-icon' : '';

  const handleEdit = () => {
    if (!details?.record || !onEdit) return;
    onEdit(details.record, null);
  };

  const handleDelete = () => {
    if (!details?.record?.id || !onDelete) return;
    onDelete(details.record.id);
  };

  const handleAdd = () => {
    if (!isoDate || !onAdd) return;
    onAdd(isoDate);
  };

  const handleSectionOpen = (sectionKey, fieldName = null) => {
    if (details?.record && onEdit) {
      onEdit(details.record, sectionKey, fieldName);
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
  const timeValue = details?.timeValue || '—';
  const hasTimeValue = Boolean(details?.timeValue);
  const mucusSensationValue = details?.hasMucusSensation ? details.mucusSensation : '—';
  const mucusAppearanceValue = details?.hasMucusAppearance ? details.mucusAppearance : '—';
  const observationsValue = details?.observationsText?.trim();
  const hasRelations = Boolean(details?.hasRelations);

// Normalizamos el indicador de pico para la UI
let peakIndicatorLabel = null;
let peakIndicatorVariant = null;


  if (peakStatus) {
    if (peakStatus === 'P' || isPeakDay) {
      peakIndicatorLabel = 'Día pico';
      peakIndicatorVariant = 'peak';
    } else {
      peakIndicatorLabel = `+${peakStatus}`;
      peakIndicatorVariant = 'post-peak';
    }
  }

  const getSymbolClasses = () => {
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
        return 'bg-white border-slate-300 shadow-md';
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
  const chipBaseClass =
    'flex items-center gap-2 rounded-3xl border px-3 py-2 text-sm min-h-[3rem]';

  // Tarjeta compacta pero más alta, usando el espacio disponible
  return (
    <div className="w-full rounded-3xl border border-rose-200/80 bg-white/90 p-4 sm:p-5 shadow-md backdrop-blur-md">
      {/* Cabecera: fecha + día de ciclo + indicador de pico + símbolo + acciones */}
      <div className="flex items-center gap-2">
        {/* Fecha + Dn + pico/+1-3 */}
        <div className="flex items-center gap-2">
          <p className="font-semibold text-subtitulo sm:text-lg">
            {formattedDate}
            {cycleDay ? ` · D${cycleDay}` : ''}
          </p>

          {peakIndicatorLabel && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
                peakIndicatorVariant === 'peak'
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-rose-300 bg-rose-50 text-rose-700'
              )}
            >
              {peakIndicatorLabel}
            </span>
          )}
        </div>

        {/* Símbolo + acciones */}
        <div className="ml-auto flex items-center gap-2">
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
          />
          {hasRecord ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-fertiliapp-fuerte hover:bg-rose-50"
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
                className="h-8 w-8 rounded-full text-fertiliapp-fuerte hover:bg-rose-50"
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
              className="rounded-full border-rose-200 px-3 text-xs font-semibold text-rose-500"
              onClick={handleAdd}
              disabled={isProcessing}
            >
              {isProcessing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Añadir registro
            </Button>
          )}
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
              chipBaseClass,
              'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              details?.hasTemperature
                ? 'border-orange-100 bg-orange-50 text-orange-800'
                : 'border-orange-50 bg-orange-50 text-slate-400'
            )}
          >
            <Thermometer className="h-5 w-5 shrink-0 opacity-80" />
            <div className="flex items-center gap-1">
              <span className="font-semibold">
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
              chipBaseClass,
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
            onClick={() => handleSectionOpen('sensation', 'mucusSensation')}
            className={cn(
              chipBaseClass,
              'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              details?.hasMucusSensation
                ? 'border-sky-100 bg-sky-50 text-sky-800'
                : 'border-sky-50 bg-sky-50 text-slate-400'
            )}
          >
            <Droplets className="h-5 w-5 shrink-0 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(mucusSensationValue)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSectionOpen('appearance', 'mucusAppearance')}
            className={cn(
              chipBaseClass,
              'text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              details?.hasMucusAppearance
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : 'border-emerald-50 bg-emerald-50 text-slate-400'
            )}
          >
            <Circle className="h-5 w-5 shrink-0 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(mucusAppearanceValue)}
            </span>
          </button>
        </div>

        {/* Fila 3: observaciones + RS */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSectionOpen('observations', 'observations')}
            className={cn(
              chipBaseClass,
              'flex-1 min-w-0 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              observationsValue
                ? 'border-violet-100 bg-violet-50 text-violet-800'
                : 'border-violet-100 bg-violet-50 text-slate-400'
            )}
          >
            <FileText className="h-5 w-5 shrink-0 opacity-80" />
            <span className="truncate">
              {renderChipValue(observationsValue, { placeholder: '-' })}
            </span>
          </button>
          <button
            type="button"
            onClick={handleRelationsToggle}
            disabled={isProcessing}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200',
              hasRelations ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white',
              isProcessing && 'opacity-70 cursor-not-allowed'
            )}
            title={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
            aria-label={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
          >
            <Heart
              className={cn(
                'h-4 shrink-0 w-4',
                hasRelations ? 'text-rose-500 fill-current' : 'text-slate-300'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DayDetail;
