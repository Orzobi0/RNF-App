import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, EyeOff, Eye, Edit3, Thermometer, Droplets, Circle, Heart, X } from 'lucide-react';
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

  const peakButtonBaseClasses = [
    'flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold sm:text-sm',
    'transition-all duration-200 shadow-sm hover:shadow-md',
    'focus-visible:outline-none focus-visible:ring-2'
  ].join(' ');

  const peakToneMap = {
    assign: 'bg-rose-500 text-white border border-rose-500 hover:bg-rose-600 focus-visible:ring-rose-300',
    update: 'bg-amber-400 text-amber-900 border border-amber-300 hover:bg-amber-500 hover:text-white focus-visible:ring-amber-300',
    remove: 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 focus-visible:ring-rose-200'
  };

const peakCircleBase = 'w-8 h-8 rounded-2xl flex items-center justify-center transition-all active:scale-95 focus-visible:outline-none';
const peakToneIconOnly = {
  assign: 'bg-rose-500 text-white border-2 border-rose-600 hover:bg-rose-600 ring-2 ring-rose-400/80 ring-offset-1 shadow-[0_6px_14px_-2px_rgba(244,63,94,0.55)]',
  update: 'bg-amber-400 text-amber-900 border-2 border-amber-500 hover:bg-amber-500 hover:text-white ring-2 ring-amber-500/70 ring-offset-1 shadow-[0_6px_14px_-2px_rgba(245,158,11,0.55)]',
  remove: 'bg-white text-rose-700 border-2 border-rose-400 hover:bg-rose-50 ring-2 ring-rose-300/80 ring-offset-1 shadow-[0_6px_14px_-2px_rgba(244,63,94,0.35)]'
}[peakMode];
const peakCircleBtnClassName = [
  peakCircleBase,
  peakToneIconOnly,
  peakActionPending ? 'opacity-70 cursor-not-allowed' : null
].filter(Boolean).join(' ');

  const peakButtonClassName = [
    peakButtonBaseClasses,
    peakToneMap[peakMode],
    peakActionPending ? 'opacity-70 cursor-not-allowed' : null,
  ].filter(Boolean).join(' ');
  // --- FIN NUEVO ---

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
    if (!onEdit) return;
    onEdit(point);
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
  const classification = point.classification ?? null;
  const classificationLabelMap = {
    INFERTIL: 'Infértil',
    FERTIL_COMIENZO: 'Fértil (comienzo)',
    FERTIL_ALTA: 'Fértil (alta)',
  };
  const classificationToneMap = {
    INFERTIL: 'bg-emerald-50/90 border border-emerald-200 text-emerald-700',
    FERTIL_COMIENZO: 'bg-rose-50/90 border border-rose-200 text-rose-700',
    FERTIL_ALTA: 'bg-rose-100/90 border border-rose-300 text-rose-900',
  };
  const classificationBasisLabelMap = {
    sensation: 'Sensación',
    appearance: 'Apariencia',
    default: 'Sin datos',
  };
  const filteredClassificationDetails = (() => {
    if (!classification?.details) return [];
    const details = classification.details.filter(Boolean);
    if (!classification.near_peak_hint) {
      return details;
    }
    return details.filter((detail) => !/ovulacion proxima/i.test(detail));
  })();
  const classificationBlock = classification ? (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className={`mb-2 rounded-2xl p-2 ${classificationToneMap[classification.phase] || 'bg-slate-50 border border-slate-200 text-slate-600'} shadow-sm`}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge className="rounded-xl bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-current shadow-none border border-current/30">
          {classificationLabelMap[classification.phase] ?? 'Clasificación'}
        </Badge>
        <span className="text-[11px] font-medium text-slate-500">
          Base: {classificationBasisLabelMap[classification.basis] ?? 'Sin datos'}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-700 leading-snug">
        {classification.reason}
      </p>
      {classification.near_peak_hint && (
        <p className="mt-1 text-xs font-semibold text-rose-600 leading-snug">
          Ovulación próxima (spotting + moco fértil alto)
        </p>
      )}
      {filteredClassificationDetails.slice(0, 2).map((detail, index) => (
        <p key={index} className="mt-0.5 text-[11px] text-slate-600 leading-snug">
          • {detail}
        </p>
      ))}
    </motion.div>
  ) : null;

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
        <div className="relative bg-gradient-to-br from-white/98 to-rose-50/95 backdrop-blur-xl rounded-3xl border border-pink-100 shadow-2xl overflow-hidden">

          {/* Botón de cerrar */}
          <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
            className="absolute top-2 right-2 z-20 text-gray-400 hover:text-pink-600 hover:bg-pink-50/80 rounded-full w-6 h-6 transition-all duration-200"
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
                <Heart className="w-4 h-4 text-rose-600" fill="currentColor" />
              </div>
            </div>
          )}

          <div className="p-2">
            {classificationBlock}
            {/* Header con fecha y día del ciclo */}
            <div className="mb-2 relative">
              <div className="w-5 h-5 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full absolute top-2 left-2 flex items-center justify-center shadow-lg">
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
                  <p className="text-sm text-pink-600 font-medium">
                    Día {point.cycleDay || 'N/A'} del ciclo
                  </p>
                  {peakLabel && (
                    <div className="mt-1 flex justify-center">
                      <Badge className="bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0 text-[11px]">
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
                  className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/60 p-2 text-center"
                >
                  <p className="text-sm font-semibold text-pink-600">Sin datos registrados para este día.</p>
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
                    <Button
                      onClick={handlePeakToggle}
                      disabled={peakActionPending}
                      className={peakCircleBtnClassName + ' shrink-0'}
                      aria-label={peakMode === 'assign' ? 'Asignar día pico' : peakMode === 'update' ? 'Actualizar día pico' : 'Quitar día pico'}
                      title={peakMode === 'assign' ? 'Asignar día pico' : peakMode === 'update' ? 'Actualizar día pico' : 'Quitar día pico'}
                    >
                      <div className="flex flex-col items-center leading-none">
                        <X
                          className="w-4 h-4 text-current shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,0.35)]"
                          strokeWidth={2.3}
                          color="currentColor"
                        />
                        <span className="text-[9px] font-semibold text-current opacity-90 tracking-tight">
                          Pico
                        </span>
                      </div>
                    </Button>
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
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-1 border border-amber-100/50"
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
                    </motion.div>
                  )}

                  {/* Símbolo de fertilidad */}
                  {hasSymbol && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className={`${symbolColors.light} rounded-3xl p-1 ${symbolColors.border} border`}
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
                    </motion.div>
                  )}

                  {/* Información de mucus */}
                  <div className="grid grid-cols-1 gap-1">
                    {/* Sensación */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl p-1 border border-blue-100/50"
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
                    </motion.div>

                    {/* Apariencia */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl p-1 border border-emerald-100/50"
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
                    </motion.div>

                    {/* Observaciones */}
                    {hasObservations && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-3xl p-1 border border-violet-100/50"
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
                      </motion.div>
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
      <Button
        onClick={handlePeakToggle}
        disabled={peakActionPending}
        className={peakCircleBtnClassName + ' shrink-0'}
        aria-label={peakMode === 'assign' ? 'Asignar día pico' : peakMode === 'update' ? 'Actualizar día pico' : 'Quitar día pico'}
        title={peakMode === 'assign' ? 'Asignar día pico' : peakMode === 'update' ? 'Actualizar día pico' : 'Quitar día pico'}
      >
        <div className="flex flex-col items-center leading-none">
          <X
            className="w-4 h-4 text-current shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,0.35)]"
            strokeWidth={2.3}
            color="currentColor"
          />
          <span className="mt-0.5 text-[9px] font-semibold text-current opacity-90 tracking-tight">
            Pico
          </span>
        </div>
      </Button>
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
      <div className="absolute -inset-2 bg-gradient-to-br from-pink-200/25 to-rose-300/25 rounded-3xl blur-2xl -z-10"></div>
    </motion.div>
  );
};

export default ChartTooltip;
