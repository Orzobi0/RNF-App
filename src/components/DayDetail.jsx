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
  peakStatus, // se mantiene por compatibilidad aunque no se use
  isPeakDay,  // se mantiene por compatibilidad aunque no se use
  onEdit,
  onDelete,
  onAdd,
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

  const getSymbolClasses = () => {
    switch (symbolValue) {
      case 'red':
        return 'bg-rose-50 border-rose-100';
      case 'green':
        return 'bg-emerald-50 border-emerald-100';
      case 'yellow':
        return 'bg-yellow-50 border-yellow-100';
      case 'spot':
        return 'bg-rose-50 border-rose-100';
      case 'white':
        return 'bg-white border-slate-300';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  // Estado vacío: sin día seleccionado
  if (!isoDate) {
    return (
      <div className="w-full rounded-2xl border border-rose-100/80 bg-white/70 p-4 text-center text-sm text-slate-500 shadow-sm">
        Selecciona un día en el calendario para ver o añadir un registro.
      </div>
    );
  }

  // Base para todos los chips (tamaño algo mayor y altura fija)
  const chipBaseClass =
    'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm min-h-[3rem]';

  // Tarjeta compacta pero más alta, usando el espacio disponible
  return (
    <div className="w-full rounded-2xl border border-rose-100 bg-white/90 p-4 sm:p-5 shadow-md backdrop-blur-sm">
      {/* Cabecera: fecha + día de ciclo + símbolo + acciones */}
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold text-slate-800 sm:text-lg">
          {formattedDate}
          {cycleDay ? ` · D${cycleDay}` : ''}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border shadow-inner',
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
                className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50"
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
                className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50"
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
        {/* Fila 1: temperatura + hora (dos columnas fijas) */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              chipBaseClass,
              details?.hasTemperature
                ? 'border-orange-100 bg-orange-50 text-orange-800'
                : 'border-orange-50 bg-orange-50 text-slate-400'
            )}
          >
            <Thermometer className="h-5 w-5 opacity-80" />
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
          </div>
          <div
            className={cn(
              chipBaseClass,
              hasTimeValue
                ? 'border-slate-200 bg-slate-50 text-slate-800'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            )}
          >
            <Clock className="h-5 w-5 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(timeValue)}
            </span>
          </div>
        </div>

        {/* Fila 2: moco (sensación mitad izquierda, apariencia mitad derecha) */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              chipBaseClass,
              details?.hasMucusSensation
                ? 'border-sky-100 bg-sky-50 text-sky-800'
                : 'border-sky-50 bg-sky-50 text-slate-400'
            )}
          >
            <Droplets className="h-5 w-5 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(mucusSensationValue)}
            </span>
          </div>
          <div
            className={cn(
              chipBaseClass,
              details?.hasMucusAppearance
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : 'border-emerald-50 bg-emerald-50 text-slate-400'
            )}
          >
            <Circle className="h-5 w-5 opacity-80" />
            <span className="font-semibold">
              {renderChipValue(mucusAppearanceValue)}
            </span>
          </div>
        </div>

        {/* Fila 3: observaciones (ancho fijo, siempre igual) + RS */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              chipBaseClass,
              'flex-1 min-w-0',
              observationsValue
                ? 'border-violet-100 bg-violet-50 text-violet-800'
                : 'border-violet-100 bg-violet-50 text-slate-400'
            )}
          >
            <FileText className="h-5 w-5 opacity-80" />
            <span className="truncate">
              {renderChipValue(observationsValue, { placeholder: '-' })}
            </span>
          </div>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition-colors',
              hasRelations ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white'
            )}
            title={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
            aria-label={hasRelations ? 'Hubo relaciones' : 'Sin relaciones'}
          >
            <Heart
              className={cn(
                'h-4 w-4',
                hasRelations ? 'text-rose-500 fill-current' : 'text-slate-300'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayDetail;
