import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PeakModeButton } from '@/components/ui/peak-mode-button';
import { XCircle, EyeOff, Eye, Edit3, Thermometer, Droplets, Circle, Heart } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

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
}) => {
  if (!point) return null;

  // Escala reducida para que el tooltip ocupe menos espacio en pantalla
  const scale = 0.6;
  const baseWidth = 200;
  const baseMinHeight = 120;
  const tooltipWidth = baseWidth * scale;
  const tooltipMinHeight = baseMinHeight * scale;

  const tooltipRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(tooltipMinHeight);
  const [peakActionPending, setPeakActionPending] = useState(false);

  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight);
    }
    setPeakActionPending(false);
  }, [point]);

  const flipHorizontal = position.clientX > chartWidth * 0.66;
  const flipVertical = position.clientY + tooltipHeight > chartHeight;

  let x = flipHorizontal
    ? position.clientX - tooltipWidth - 10
    : position.clientX + 10;

  let y = flipVertical
    ? position.clientY
    : position.clientY + 10;

  if (x + tooltipWidth > chartWidth) x = chartWidth - tooltipWidth - 10;
  if (y + tooltipHeight > chartHeight) y = chartHeight - tooltipHeight - 10;
  if (x < 10) x = 10;
  if (y < 10) y = 10;

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
  const hasSymbol = symbolInfo && symbolInfo.value !== 'none';
  const hasTemperature = temp != null;
  const hasMucusInfo = Boolean((mucusSensation && mucusSensation.trim()) || (mucusAppearance && mucusAppearance.trim()));
  const hasObservations = Boolean(observations && observations.trim());
  const hasAnyData = hasTemperature || hasSymbol || hasMucusInfo || hasObservations || hasRelations;
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

  // --- NUEVO: Modo de botón Día Pico (asignar / actualizar / quitar) ---
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

  // Función para obtener los colores del símbolo
  const getSymbolColors = (symbolValue) => {
    switch (symbolValue) {
      case 'red':
        return {
          bg: 'bg-red-500',
          light: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          glow: 'shadow-red-200/50'
        };
      case 'white':
        return {
          bg: 'bg-slate-100 border-2 border-slate-300',
          light: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-700',
          glow: 'shadow-slate-200/50'
        };
      case 'green':
        return {
          bg: 'bg-green-500',
          light: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          glow: 'shadow-green-200/50'
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-400',
          light: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          glow: 'shadow-yellow-200/50'
        };
      case 'spot':
        return {
          bg: 'bg-red-500 pattern-bg',
          light: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          glow: 'shadow-red-200/50'
        };
      default:
        return {
          bg: 'bg-gray-400',
          light: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          glow: 'shadow-gray-200/50'
        };
    }
  };

  const symbolColors = getSymbolColors(point.fertility_symbol);

  return (
    <motion.div
      ref={tooltipRef}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1]
      }}
      className="absolute z-50"
      style={{ top: y, left: x, width: tooltipWidth }}
    >
      <div
        className="origin-top-left"
        style={{ transform: `scale(${scale})`, width: baseWidth, minHeight: baseMinHeight }}
      >
        {/* Contenedor principal */}
        <div className="relative bg-gradient-to-br from-white/80 to-rose-50/95 backdrop-blur-xl rounded-3xl border border-pink-100 shadow-2xl overflow-hidden">

          {/* Botón de cerrar */}
          <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
            className="absolute top-2 right-2 z-20 text-gray-400 hover:text-fertiliapp-fuerte hover:bg-fertiliapp-fuerte/20 rounded-full w-6 h-6 transition-all duration-200"
          >
            <XCircle size={20} />
          </Button>

          {/* Icono discreto de relaciones, bajo la X */}
          {hasRelations && (
            <div
              className="absolute right-3 top-9 pointer-events-none"
              aria-hidden="true"
              title="Relaciones registradas"
            >
              <div className="w-4 h-4 rounded-full bg-rose-100/90 border border-rose-200 flex items-center justify-center shadow-sm">
                <Heart className="w-4 h-4 text-fertiliapp-fuerte" fill="currentColor" />
              </div>
            </div>
          )}

          <div className="p-2">
            {/* Header con fecha y día del ciclo */}
            <div className="mb-2 relative">
              <div className="w-5 h-5 bg-fertiliapp-fuerte rounded-full absolute top-2 left-2 flex items-center justify-center shadow-lg">
                <Circle className="w-2 h-2 text-white" fill="currentColor" />
              </div>

              {/* Reservar espacio a la izquierda para que el texto no se pegue al punto */}
              <div className="flex items-center mb-1 pl-8">
                <div>
                  <h3 className="font-bold text-left text-lg text-gray-800 tabular-nums tracking-wide">
                    {dateToFormat
                      ? format(parseISO(dateToFormat), 'dd/MM', { locale: es })
                      : 'Fecha'}
                  </h3>
                  <p className="text-sm text-fertiliapp-fuerte font-medium">
                    Día {point.cycleDay || 'N/A'} del ciclo
                  </p>
                  {peakLabel && (
                    <div className="mt-1 flex justify-center">
                      <Badge className="bg-rose-100 text-fertiliapp-fuerte border border-rose-200 px-2 py-0 text-[11px]">
                        {peakLabel}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              </div>

          {showEmptyState ? (
            <div className="pt-1 space-y-3">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-2xl border border-dashed border-fertiliapp-suave bg-fertiliapp-suave/60 p-2 text-center"
                >
                  <p className="text-sm font-semibold text-titulo">Sin datos registrados para este día.</p>
                </motion.div>

                {(canTogglePeak || onEdit) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center w-full justify-between pt-2 border-t border-gray-100"
                >
                  {/* Izquierda: Día Pico */}
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

                  {/* Derecha: Añadir datos */}
                  {onEdit && (
                    <Button
                      onClick={handleEditClick}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 rounded-full transition-all duration-200 shadow-sm hover:shadow-md text-xs"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span className="font-medium">Añadir datos</span>
                    </Button>
                  )}
                </motion.div>
              )}

              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {/* Temperatura */}
                  {hasTemperature && (
                    <motion.button
                      type="button"
                      onClick={() => handleSectionEdit('temperature')}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="w-full text-left bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-1 border border-amber-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                          <Thermometer className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-baseline gap-2">
                              <span className="text-md font-bold text-gray-800">
                                {parseFloat(temp).toFixed(2)}
                              </span>
                              <span className="text-md text-gray-600">°C</span>
                              {point.use_corrected && (
                                <div
                                  className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_4px_rgba(245,158,11,0.65)]"
                                  title="Temperatura corregida"
                                ></div>
                              )}
                            </div>
                            {temperatureTime && (
                              <span className="text-sm font-medium text-gray-500 whitespace-nowrap">
                                {temperatureTime}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  )}

                  {/* Símbolo de fertilidad */}
                  {hasSymbol && (
                    <motion.button
                      type="button"
                      onClick={() => handleSectionEdit('symbol')}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className={`w-full text-left ${symbolColors.light} rounded-3xl p-1 ${symbolColors.border} border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-pink-200`}
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 ${symbolColors.bg} rounded-lg flex items-center justify-center shadow-lg ${symbolColors.glow} shadow-lg`}>
                          <div className="w-2 h-2 bg-white/90 rounded-full shadow-sm"></div>
                        </div>
                        <div className="flex-1 text-left">
                          <span className={`text-md font-semibold ${symbolColors.text}`}>
                            {symbolInfo.label}
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  )}

                  {/* Información de mucus */}
                  <div className="grid grid-cols-1 gap-1">
                    {/* Sensación */}
                    <motion.button
                      type="button"
                      onClick={() => handleSectionEdit('sensation')}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="w-full text-left bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl p-1 border border-blue-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-200"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                          <Droplets className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-md font-semibold text-blue-800">
                            {mucusSensation || '-'}
                          </span>
                        </div>
                      </div>
                    </motion.button>

                    {/* Apariencia */}
                    <motion.button
                      type="button"
                      onClick={() => handleSectionEdit('appearance')}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="w-full text-left bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl p-1 border border-emerald-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-200"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                          <Circle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-md font-semibold text-green-800">
                            {mucusAppearance || '-'}
                          </span>
                        </div>
                      </div>
                    </motion.button>

                    {/* Observaciones */}
                    {hasObservations && (
                      <motion.button
                        type="button"
                        onClick={() => handleSectionEdit('observations')}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="w-full text-left bg-gradient-to-r from-violet-50 to-purple-50 rounded-3xl p-1 border border-violet-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-200"
                        disabled={!onEdit}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                            <Edit3 className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <span className="text-sm font-semibold text-violet-800">
                              {observations}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    )}
                    {/* (Seguimos usando el icono discreto de RS en el header) */}
                  </div>
                </div>

                {/* Botones de acción */}
{(onEdit || (onToggleIgnore && !isPlaceholder && point.id) || (canTogglePeak && !isPlaceholder)) && (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
    className="flex items-center justify-between pt-2 border-t border-gray-100"
  >
    {/* Izquierda: Día Pico (sin cambios funcionales) */}
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

    {/* Derecha: Editar / Ignorar separados por un divisor sutil */}
    <div className="flex items-center gap-1.5 sm:gap-2 ml-3 pl-3 border-l border-gray-200/70">
      {onEdit && (
        <Button
          onClick={handleEditClick}
          size="sm"
          className="h-8 px-2.5 bg-white/80 text-gray-700 rounded-full border border-gray-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-white hover:shadow focus-visible:ring-2 focus-visible:ring-blue-200 transition-all"
        >
          <Edit3 className="h-4 w-4 mr-1.5" />
          <span className="font-medium">{isPlaceholder ? 'Añadir datos' : ''}</span>
        </Button>
      )}


    </div>
  </motion.div>
)}

              </>
            )}
          </div>
        </div>
      </div>

      {/* Sombra adicional para profundidad */}
      <div className="absolute -inset-2 bg-gradient-to-br from-pink-200/25 to-rose-300/25 rounded-3xl blur-xl -z-10"></div>
    </motion.div>
  );
};

export default ChartTooltip;
