import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Thermometer, Clock, Droplets, Circle, Edit2, Trash2, Loader2 } from 'lucide-react';
import PeakBadge from '@/components/PeakBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const DetailSection = ({ icon: Icon, label, value, helper, badge = null }) => (
  <div
    className="flex items-start gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-3 text-sm shadow-inner"
    role="group"
    aria-label={label}
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-800">{value}</p>
      {helper && <p className="text-xs text-slate-500">{helper}</p>}
    </div>
    {badge}
  </div>
);

const DayDetail = ({
  isoDate,
  cycleDay,
  details,
  peakStatus,
  isPeakDay,
  onEdit,
  onDelete,
  onAdd,
  isProcessing,
}) => {
  const [isObservationsExpanded, setIsObservationsExpanded] = useState(false);

  const hasRecord = Boolean(details?.record);

  useEffect(() => {
    setIsObservationsExpanded(false);
  }, [isoDate]);

  const formattedDate = useMemo(() => {
    if (!isoDate) return null;
    try {
      return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es });
    } catch (error) {
      return null;
    }
  }, [isoDate]);

  const weekdayLabel = useMemo(() => {
    if (!isoDate) return null;
    try {
      const date = parseISO(isoDate);
      return format(date, 'EEEE', { locale: es });
    } catch (error) {
      return null;
    }
  }, [isoDate]);

  const observationsText = details?.observationsText?.trim() || '';
  const estimatedObservationLines = useMemo(() => {
    if (!observationsText) return 0;
    return observationsText
      .split(/\r?\n/)
      .map((line) => Math.max(1, Math.ceil(line.length / 60)))
      .reduce((sum, lines) => sum + lines, 0);
  }, [observationsText]);

  const shouldShowObservationToggle = observationsText && estimatedObservationLines > 6;

  const collapsedObservationStyle = useMemo(
    () => ({
      display: '-webkit-box',
      WebkitLineClamp: 6,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }),
    []
  );

  const symbolLabel = details?.symbolInfo?.label || 'Sin símbolo';
  const symbolValue = details?.symbolInfo?.value;
  const symbolDotClass = details?.symbolInfo?.pattern === 'spotting-pattern'
    ? 'spotting-pattern-icon'
    : details?.symbolInfo?.color || 'bg-slate-200';

  const handleEdit = () => {
    if (!details?.record || !onEdit) return;
    onEdit(details.record);
  };

  const handleDelete = () => {
    if (!details?.record?.id || !onDelete) return;
    onDelete(details.record.id);
  };

  const handleAdd = () => {
    if (!isoDate || !onAdd) return;
    onAdd(isoDate);
  };

  const renderContent = () => {
    if (!isoDate) {
      return (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-white/60 p-6 text-center text-sm text-slate-500">
          Selecciona un día del calendario para ver el detalle.
        </div>
      );
    }

    if (!hasRecord) {
      return (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 p-6 text-center">
          <p className="text-sm text-slate-500">Este día aún no tiene un registro.</p>
          <Button className="mt-4 w-full" onClick={handleAdd} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Añadir registro
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {details.record?.ignored && (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-600">
            Registro ignorado
          </Badge>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DetailSection
            icon={Thermometer}
            label="Temperatura"
            value={details.hasTemperature ? `${details.displayTemp} °C` : '—'}
            badge={
              details.showCorrectedIndicator ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-600">
                  Corregida
                </span>
              ) : null
            }
          />
          <DetailSection
            icon={Clock}
            label="Hora"
            value={details.timeValue ? details.timeValue : '—'}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DetailSection
            icon={Droplets}
            label="Sensación"
            value={details.hasMucusSensation ? details.mucusSensation : '—'}
          />
          <DetailSection
            icon={Circle}
            label="Apariencia"
            value={details.hasMucusAppearance ? details.mucusAppearance : '—'}
          />
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-inner">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones</p>
          <p
            className={cn('mt-1 text-sm text-slate-700 whitespace-pre-line', !isObservationsExpanded && shouldShowObservationToggle && 'pr-1')}
            style={!isObservationsExpanded && shouldShowObservationToggle ? collapsedObservationStyle : undefined}
          >
            {observationsText || '—'}
          </p>
          {shouldShowObservationToggle && (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-rose-500 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 rounded-full px-3 py-1"
              onClick={() => setIsObservationsExpanded((prev) => !prev)}
            >
              {isObservationsExpanded ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-inner">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
            <span className={cn('h-6 w-6 rounded-full border border-slate-200', symbolDotClass)} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Símbolo</p>
            <p className="text-base font-semibold text-slate-800">{symbolLabel}</p>
            {symbolValue === 'none' && <p className="text-xs text-slate-500">Sin símbolo asignado</p>}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleEdit}
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
            Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="gap-2 text-rose-600 hover:bg-rose-50"
            onClick={handleDelete}
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Eliminar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg sm:p-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-rose-100/60 bg-white/90 pb-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-800">
            {formattedDate || 'Sin fecha seleccionada'}
          </p>
          {weekdayLabel && <p className="text-sm capitalize text-slate-500">{weekdayLabel}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {cycleDay && (
            <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-500">D{cycleDay}</span>
          )}
          <PeakBadge peakStatus={peakStatus} isPeakDay={isPeakDay} />
        </div>
      </div>
      <div className="pt-4">{renderContent()}</div>
    </div>
  );
};

export default DayDetail;