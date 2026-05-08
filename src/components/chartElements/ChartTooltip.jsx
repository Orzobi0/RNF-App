import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PeakModeButton } from '@/components/ui/peak-mode-button';
import { X, Edit3, Thermometer, Droplets, Circle, Heart, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSymbolAppearance } from '@/config/fertilitySymbols';
import { cn } from '@/lib/utils';

const ChartTooltip = ({
  point,
  position,
  chartWidth,
  chartHeight,
  onToggleIgnore,
  onEdit,
  onClose,
  onTogglePeak,
  currentPeakIsoDate,
  showRelationsRow = false,
}) => {
  if (!point) return null;

  const scale = 0.75;
  const baseWidth = 252;
  const baseMinHeight = 132;
  const tooltipWidth = baseWidth * scale;
  const tooltipMinHeight = baseMinHeight * scale;

  const scaledRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(tooltipMinHeight);
  const [peakActionPending, setPeakActionPending] = useState(false);

  useEffect(() => {
    if (scaledRef.current) {
      const rect = scaledRef.current.getBoundingClientRect();
      if (rect?.height) setTooltipHeight(rect.height);
    } else {
      setTooltipHeight(tooltipMinHeight);
    }
    setPeakActionPending(false);
  }, [point, tooltipMinHeight]);

  const MARGIN = 10;
  const GAP = 12;

  const anchorX = Number.isFinite(position?.svgX) ? position.svgX : position.clientX;
  const anchorY = Number.isFinite(position?.clientY) ? position.clientY : position.svgY;

  const viewportWidth = Number.isFinite(position?.viewportWidth) ? position.viewportWidth : chartWidth;
  const viewportHeight = Number.isFinite(position?.viewportHeight) ? position.viewportHeight : chartHeight;
  const scrollLeft = Number.isFinite(position?.scrollLeft) ? position.scrollLeft : 0;
  const scrollTop = Number.isFinite(position?.scrollTop) ? position.scrollTop : 0;

  const viewLeft = scrollLeft;
  const viewRight = scrollLeft + viewportWidth;
  const viewTop = scrollTop;
  const viewBottom = scrollTop + viewportHeight;

  const maxXByViewport = viewRight - tooltipWidth - MARGIN;
  const minXByViewport = viewLeft + MARGIN;
  const maxXByContent = chartWidth - tooltipWidth - MARGIN;
  const minXByContent = MARGIN;

  let xMin = Math.max(minXByViewport, minXByContent);
  let xMax = Math.min(maxXByViewport, maxXByContent);
  if (xMax < xMin) xMax = xMin;

  const maxYByViewport = viewBottom - tooltipHeight - MARGIN;
  const minYByViewport = viewTop + MARGIN;
  const maxYByContent = chartHeight - tooltipHeight - MARGIN;
  const minYByContent = MARGIN;

  let yMin = Math.max(minYByViewport, minYByContent);
  let yMax = Math.min(maxYByViewport, maxYByContent);
  if (yMax < yMin) yMax = yMin;

  let x = anchorX + GAP;
  if (x > xMax) {
    x = xMax;
    const leftCandidate = anchorX - tooltipWidth - GAP;
    if (leftCandidate >= xMin) x = leftCandidate;
  }
  x = Math.max(xMin, Math.min(x, xMax));

  let y = anchorY - tooltipHeight - GAP;
  if (y < yMin) y = anchorY + GAP;
  y = Math.max(yMin, Math.min(y, yMax));

  const isPlaceholder = !point.id || String(point.id).startsWith('placeholder-');
  const temp = point.temperature_chart ?? point.displayTemperature ?? null;
  const symbolInfo = getSymbolAppearance(point.fertility_symbol);
  const dateToFormat = point.timestamp || point.isoDate;

  const normalizeTimeString = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  };

  const formatTimestampTime = (timestampValue) => {
    if (!timestampValue) return null;
    try {
      const parsed = parseISO(timestampValue);
      const timeValue = parsed.getTime();
      if (Number.isNaN(timeValue)) return null;
      return format(parsed, 'HH:mm');
    } catch (error) {
      return null;
    }
  };

  const extractMeasurementTime = () => {
    if (!Array.isArray(point.measurements) || point.measurements.length === 0) {
      return null;
    }

    const measurements = point.measurements.filter(Boolean);
    if (!measurements.length) return null;

    const ordered = [
      ...measurements.filter((measurement) => measurement?.selected),
      ...measurements.filter((measurement) => !measurement?.selected),
    ];

    for (const measurement of ordered) {
      const useCorrected = Boolean(measurement?.use_corrected);
      const candidateTime = useCorrected
        ? normalizeTimeString(measurement?.time_corrected) ?? normalizeTimeString(measurement?.time)
        : normalizeTimeString(measurement?.time);
      if (candidateTime) {
        return candidateTime;
      }
    }

    return null;
  };

  const measurementTime = extractMeasurementTime();
  const directTimeCandidates = point.use_corrected
    ? [normalizeTimeString(point.time_corrected), normalizeTimeString(point.time)]
    : [normalizeTimeString(point.time)];
  const fallbackTime = directTimeCandidates.find(Boolean) ?? formatTimestampTime(point.timestamp);
  const temperatureTime = measurementTime ?? fallbackTime;
  const mucusSensation = point.mucus_sensation ?? point.mucusSensation ?? '';
  const mucusAppearance = point.mucus_appearance ?? point.mucusAppearance ?? '';
  const observations = point.observations ?? '';
  const hasRelations = Boolean(point.had_relations ?? point.hadRelations);
  const visibleHasRelations = Boolean(showRelationsRow && hasRelations);
  const hasSymbol = symbolInfo && symbolInfo.value !== 'none';
  const hasTemperature = temp != null;
  const isTemperatureIgnored = Boolean(point.ignored && hasTemperature);
  const hasMucusInfo = Boolean((mucusSensation && mucusSensation.trim()) || (mucusAppearance && mucusAppearance.trim()));
  const hasObservations = Boolean(observations && observations.trim());
  const hasAnyData = hasTemperature || hasSymbol || hasMucusInfo || hasObservations || visibleHasRelations;
  const showEmptyState = !hasAnyData;
  const peakStatus = point.peakStatus || (point.peak_marker === 'peak' ? 'P' : null);
  const peakLabels = {
    P: 'Día pico',
    1: 'Post pico 1',
    2: 'Post pico 2',
    3: 'Post pico 3',
  };
  const peakLabel = peakStatus ? peakLabels[peakStatus] || null : null;
  const canTogglePeak = Boolean(onTogglePeak && point.isoDate);
  const hasExistingPeak = Boolean(currentPeakIsoDate);
  const isSameAsCurrent = hasExistingPeak && point.isoDate === currentPeakIsoDate;
  const isPeakDay = isSameAsCurrent || peakStatus === 'P' || point.peak_marker === 'peak';
  const isDifferentPeakCandidate = hasExistingPeak && !isPeakDay;

  const peakMode = isPeakDay ? 'remove' : hasExistingPeak ? 'update' : 'assign';
  const peakButtonLabel =
    peakMode === 'assign' ? 'Asignar día pico' :
    peakMode === 'update' ? 'Actualizar día pico' :
    'Quitar día pico';

  const peakButtonAriaLabel = peakButtonLabel;

  const handlePeakToggle = async () => {
    if (!onTogglePeak || peakActionPending) return;
    setPeakActionPending(true);
    try {
      await onTogglePeak(point, !isPeakDay);
      if (onClose) onClose();
    } catch (error) {
      console.error('Error toggling peak marker from tooltip:', error);
    } finally {
      setPeakActionPending(false);
    }
  };

  const handleEditClick = () => {
    handleSectionEdit();
  };

  const handleSectionEdit = (sectionKey) => {
    if (!onEdit) return;
    onEdit(point, sectionKey);
    if (onClose) onClose();
  };

  const getTooltipSymbolClasses = () => {
    switch (symbolInfo?.value) {
      case 'red':
        return 'bg-[#fb7185] border-slate-300 shadow-md';
      case 'pink':
        return 'bg-pink-500 border-slate-300 shadow-md';
      case 'green':
        return 'bg-[#67C5A4] border-slate-300 shadow-md';
      case 'yellow':
        return 'bg-[#F7B944] border-slate-300 shadow-md';
      case 'spot':
        return 'bg-rose-500 border-slate-300 shadow-md spotting-pattern-icon';
      case 'white':
        return 'bg-white border-rose-300 shadow-md';
      default:
        return 'bg-slate-200 border-slate-300 shadow-md';
    }
  };

  const tooltipCellClass =
    'relative flex w-full min-h-[44px] items-center gap-2.5 overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 px-3 py-2 text-left text-sm shadow-sm transition active:bg-white/90 disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fertiliapp-suave';

  const tooltipAccentClass =
    'pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full';

  const tooltipCellStyles = {
    temperature: {
      accent: isTemperatureIgnored ? 'bg-slate-300 opacity-70' : 'bg-temp opacity-90',
      icon: isTemperatureIgnored ? 'text-slate-400' : 'text-temp',
      value: isTemperatureIgnored ? 'text-slate-400 line-through decoration-1' : 'text-titulo',
      secondary: isTemperatureIgnored ? 'text-slate-400' : 'text-suave',
    },
    sensation: {
      accent: mucusSensation && mucusSensation.trim() ? 'bg-sensacion opacity-85' : 'bg-sensacion opacity-25',
      icon: mucusSensation && mucusSensation.trim() ? 'text-sensacion' : 'text-sensacion opacity-35',
      value: mucusSensation && mucusSensation.trim() ? 'text-titulo' : 'text-suave',
    },
    appearance: {
      accent: mucusAppearance && mucusAppearance.trim() ? 'bg-apariencia opacity-85' : 'bg-apariencia opacity-25',
      icon: mucusAppearance && mucusAppearance.trim() ? 'text-apariencia' : 'text-apariencia opacity-35',
      value: mucusAppearance && mucusAppearance.trim() ? 'text-titulo' : 'text-suave',
    },
    observations: {
      accent: hasObservations ? 'bg-observaciones opacity-85' : 'bg-observaciones opacity-25',
      icon: hasObservations ? 'text-observaciones' : 'text-observaciones opacity-35',
      value: hasObservations ? 'text-titulo' : 'text-suave',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1]
      }}
      className="absolute z-50"
      style={{ top: y, left: x, width: tooltipWidth, height: tooltipHeight }}
    >
      <div
        ref={scaledRef}
        className="origin-top-left"
        style={{ transform: `scale(${scale})`, width: baseWidth, minHeight: baseMinHeight }}
      >
        <div className="relative overflow-hidden rounded-3xl border border-rose-400/80 bg-white/90 p-3 shadow-lg backdrop-blur-md">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <h3 className="shrink-0 text-[18px] font-semibold leading-none text-titulo tabular-nums">
                  {dateToFormat ? format(parseISO(dateToFormat), 'dd/MM', { locale: es }) : 'Fecha'}
                </h3>
                <span className="whitespace-nowrap text-[13px] font-semibold leading-none text-fertiliapp-fuerte tabular-nums">
                  Día {point.cycleDay || 'N/A'}
                </span>
              </div>

              {peakLabel && (
                <span className="mt-1.5 inline-flex h-5 items-center rounded-full border border-rose-200 bg-rose-50/80 px-2 text-[10px] font-semibold leading-none text-rose-700 shadow-sm">
                  {peakLabel}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {hasSymbol && (
                <button
                  type="button"
                  onClick={() => handleSectionEdit('symbol')}
                  disabled={!onEdit}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:opacity-80',
                    getTooltipSymbolClasses()
                  )}
                  title={symbolInfo.label}
                  aria-label={symbolInfo.label}
                />
              )}

              <Button
                variant="ghost"
                onClick={onClose}
                className="h-7 w-7 rounded-full p-0 text-slate-400 transition hover:bg-rose-50 hover:text-fertiliapp-fuerte focus-visible:ring-2 focus-visible:ring-rose-200"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showEmptyState ? (
            <div className="space-y-3">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-dashed border-rose-200/80 bg-white/70 p-3 text-center shadow-sm"
              >
                <p className="text-sm font-semibold text-subtitulo">Sin datos registrados para este día.</p>
              </motion.div>

              {(canTogglePeak || onEdit || showRelationsRow) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center justify-between gap-2 border-t border-slate-200/60 pt-3"
                >
                  {onEdit && (
                    <Button
                      onClick={handleEditClick}
                      variant="outline"
                      size="sm"
                      className="order-last ml-auto h-9 rounded-full border-slate-200 bg-white/80 px-3 text-xs font-semibold text-subtitulo shadow-sm transition hover:bg-white hover:text-fertiliapp-fuerte focus-visible:ring-2 focus-visible:ring-rose-200"
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                      Añadir datos
                    </Button>
                  )}

                  <div className="flex items-center gap-2">
                    {canTogglePeak && (
                      <PeakModeButton
                        mode={peakMode}
                        size="sm"
                        onClick={handlePeakToggle}
                        pending={peakActionPending}
                        aria-label={peakButtonAriaLabel}
                        title={peakButtonLabel}
                        className="shrink-0"
                      />
                    )}

                    {showRelationsRow && (
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white/80 text-fertiliapp-fuerte shadow-sm transition-opacity',
                          visibleHasRelations ? 'opacity-100' : 'opacity-0'
                        )}
                        aria-hidden="true"
                        title={visibleHasRelations ? 'Relaciones registradas' : undefined}
                      >
                        <Heart className="h-4 w-4" fill="currentColor" />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {hasTemperature && (
                  <motion.button
                    type="button"
                    onClick={() => handleSectionEdit('temperature')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={tooltipCellClass}
                    disabled={!onEdit}
                  >
                    <span aria-hidden="true" className={cn(tooltipAccentClass, tooltipCellStyles.temperature.accent)} />
                    <Thermometer className={cn('h-[18px] w-[18px] shrink-0', tooltipCellStyles.temperature.icon)} />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className={cn('font-semibold leading-none tabular-nums', tooltipCellStyles.temperature.value)}>
                          {parseFloat(temp).toFixed(2)}
                        </span>
                        <span className={cn('text-xs font-semibold leading-none', tooltipCellStyles.temperature.secondary)}>
                          °C
                        </span>
                        {point.use_corrected && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.45)]"
                            title="Temperatura corregida"
                            aria-label="Temperatura corregida"
                          />
                        )}
                      </div>
                      {temperatureTime && (
                        <span className="shrink-0 text-xs font-medium text-suave tabular-nums">
                          {temperatureTime}
                        </span>
                      )}
                    </div>
                  </motion.button>
                )}

                <motion.button
                  type="button"
                  onClick={() => handleSectionEdit('sensation')}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.18 }}
                  className={tooltipCellClass}
                  disabled={!onEdit}
                >
                  <span aria-hidden="true" className={cn(tooltipAccentClass, tooltipCellStyles.sensation.accent)} />
                  <Droplets className={cn('h-4 w-4 shrink-0', tooltipCellStyles.sensation.icon)} />
                  <span className={cn('min-w-0 flex-1 truncate font-semibold leading-tight', tooltipCellStyles.sensation.value)}>
                    {mucusSensation || '-'}
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => handleSectionEdit('appearance')}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.23 }}
                  className={tooltipCellClass}
                  disabled={!onEdit}
                >
                  <span aria-hidden="true" className={cn(tooltipAccentClass, tooltipCellStyles.appearance.accent)} />
                  <Circle className={cn('h-4 w-4 shrink-0', tooltipCellStyles.appearance.icon)} />
                  <span className={cn('min-w-0 flex-1 truncate font-semibold leading-tight', tooltipCellStyles.appearance.value)}>
                    {mucusAppearance || '-'}
                  </span>
                </motion.button>

                {hasObservations && (
                  <motion.button
                    type="button"
                    onClick={() => handleSectionEdit('observations')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.28 }}
                    className={cn(tooltipCellClass, 'items-start')}
                    disabled={!onEdit}
                  >
                    <span aria-hidden="true" className={cn(tooltipAccentClass, tooltipCellStyles.observations.accent)} />
                    <FileText className={cn('mt-0.5 h-4 w-4 shrink-0', tooltipCellStyles.observations.icon)} />
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-sm font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden',
                        tooltipCellStyles.observations.value
                      )}
                    >
                      {observations}
                    </span>
                  </motion.button>
                )}
              </div>

              {(onEdit || (onToggleIgnore && !isPlaceholder && point.id) || (canTogglePeak && !isPlaceholder) || showRelationsRow) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/60 pt-3"
                >
                  <div className="flex w-full items-center gap-2">
                    {canTogglePeak && !isPlaceholder && (
                      <PeakModeButton
                        mode={peakMode}
                        size="sm"
                        onClick={handlePeakToggle}
                        pending={peakActionPending}
                        aria-label={peakButtonAriaLabel}
                        title={peakButtonLabel}
                        className="shrink-0"
                      />
                    )}

                    {onEdit && (
                      <Button
                        onClick={handleEditClick}
                        size="sm"
                        variant="outline"
                        className="order-last ml-auto h-9 rounded-full border-slate-200 bg-white/80 px-3 text-xs font-semibold text-subtitulo shadow-sm transition hover:bg-white hover:text-fertiliapp-fuerte focus-visible:ring-2 focus-visible:ring-rose-200"
                      >
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        {isPlaceholder ? 'Añadir datos' : 'Editar'}
                      </Button>
                    )}

                    {showRelationsRow && (
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white/80 text-fertiliapp-fuerte shadow-sm transition-opacity',
                          visibleHasRelations ? 'opacity-100' : 'opacity-0'
                        )}
                        aria-hidden="true"
                        title={visibleHasRelations ? 'Relaciones registradas' : undefined}
                      >
                        <Heart className="h-4 w-4" fill="currentColor" />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ChartTooltip;
