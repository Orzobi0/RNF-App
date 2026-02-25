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
  const scale = 0.7;
  const baseWidth = 200;
  const baseMinHeight = 120;
  const tooltipWidth = baseWidth * scale;
  const tooltipMinHeight = baseMinHeight * scale;

  const scaledRef = useRef(null); // mide el tamaño VISUAL (con transform: scale)
  const [tooltipHeight, setTooltipHeight] = useState(tooltipMinHeight);
  const [peakActionPending, setPeakActionPending] = useState(false);

  useEffect(() => {
  // Medimos el tamaño VISUAL (afectado por scale) para:
  // - posicionar bien
  // - evitar “huecos” que bloquean taps
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

// En tu position ya tienes clientX/clientY y svgX/svgY.
// Usamos el ancla del PUNTO (svgX/svgY) cuando existe, es más coherente que el dedo.
const anchorX = Number.isFinite(position?.svgX) ? position.svgX : position.clientX;
const anchorY = Number.isFinite(position?.clientY) ? position.clientY : position.svgY;

// Viewport visible (coordenadas en el sistema del contenedor scrolleable)
// Si no llegan, fallback al chart completo.
const viewportWidth = Number.isFinite(position?.viewportWidth) ? position.viewportWidth : chartWidth;
const viewportHeight = Number.isFinite(position?.viewportHeight) ? position.viewportHeight : chartHeight;
const scrollLeft = Number.isFinite(position?.scrollLeft) ? position.scrollLeft : 0;
const scrollTop = Number.isFinite(position?.scrollTop) ? position.scrollTop : 0;

// Límites del viewport (en coordenadas de contenido)
const viewLeft = scrollLeft;
const viewRight = scrollLeft + viewportWidth;
const viewTop = scrollTop;
const viewBottom = scrollTop + viewportHeight;

// Límites finales: no salirse del viewport y tampoco del contenido total
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

// 1) X: preferimos derecha (lectura / pulgar derecho)
//    Si no cabe, “pegamos” al borde derecho del viewport.
//    Solo si aun así no hay sitio, intentamos izquierda.
let x = anchorX + GAP;
if (x > xMax) {
  x = xMax; // pega al borde derecho visible
  const leftCandidate = anchorX - tooltipWidth - GAP;
  if (leftCandidate >= xMin) x = leftCandidate;
}
x = Math.max(xMin, Math.min(x, xMax));

// 2) Y: por defecto ARRIBA (tu mejora pedida)
//    Si no cabe arriba, lo bajamos.
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
  const hasSymbol = symbolInfo && symbolInfo.value !== 'none';
  const hasTemperature = temp != null;
  const isTemperatureIgnored = Boolean(point.ignored && hasTemperature);
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
        {/* Contenedor principal */}
        <div className="relative tooltip-surface--gradient backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden">

          {/* Botón de cerrar */}

          <div className="p-2">
            {/* Header con fecha y día del ciclo */}
<div className="mb-2 flex items-center justify-between gap-1">
  {/* Izquierda: indicador + fecha/día */}
  <div className="flex items-center gap-1 flex-1 min-w-0">
    {/* Punto más compacto */}
    <div className="w-3.5 h-3.5 bg-fertiliapp-fuerte rounded-full flex items-center justify-center shadow-lg shrink-0">
      <Circle className="w-1 h-1 text-white" fill="currentColor" />
    </div>

    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-1 min-w-0">
        {/* Fecha un pelín más pequeña + sin tracking-wide (da muchos px gratis) */}
        <h3 className="font-bold text-left text-[17px] leading-none text-gray-800 tabular-nums tracking-normal shrink-0">
          {dateToFormat ? format(parseISO(dateToFormat), 'dd/MM', { locale: es }) : 'Fecha'}
        </h3>

        {/* Día sin truncate, pero más compacto */}
        <span className="text-[14px] leading-none text-fertiliapp-fuerte font-semibold whitespace-nowrap tabular-nums shrink-0">
          Día {point.cycleDay || 'N/A'}
        </span>
      </div>

      {peakLabel && (
        <div className="mt-1 flex justify-start">
          <Badge className="bg-tarjeta text-fertiliapp-fuerte border border-fertiliapp-suave px-2 py-0 text-[11px]">
            {peakLabel}
          </Badge>
        </div>
      )}
    </div>
  </div>

  {/* Derecha: corazón (reservado siempre) + cerrar */}
  <div className="flex items-center gap-0.5 shrink-0">
    {/* Reserva hueco siempre para que NO cambie nada si hay/no hay corazón */}
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center bg-fertiliapp-suave/70 pointer-events-none ${
        hasRelations ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden="true"
      title={hasRelations ? 'Relaciones registradas' : undefined}
    >
      <Heart className="w-3.5 h-3.5 text-fertiliapp-fuerte" fill="currentColor" />
    </div>

    <Button
      variant="ghost"
      onClick={onClose}
      className="p-0 text-gray-600 hover:text-fertiliapp-fuerte hover:bg-fertiliapp-suave rounded-full w-[26px] h-[26px] transition-all duration-200"
      aria-label="Cerrar"
      title="Cerrar"
    >
      <XCircle size={18} />
    </Button>
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
                      className="w-full text-left bg-temp-suave rounded-2xl p-1 border border-temp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-temp"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-temp rounded-lg flex items-center justify-center shadow-md">
                          <Thermometer className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={
                                  isTemperatureIgnored
                                    ? 'text-md font-bold text-gray-400 line-through decoration-1'
                                    : 'text-md font-bold text-gray-800'
                                }
                              >
                                {parseFloat(temp).toFixed(2)}
                              </span>
                              <span
                                className={
                                  isTemperatureIgnored ? 'text-md text-gray-400' : 'text-md text-gray-600'
                                }
                              >
                                °C
                              </span>
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
                      className="w-full text-left bg-sensacion-suave rounded-3xl p-1 border border-sensacion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-200"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-sensacion rounded-lg flex items-center justify-center shadow-md">
                          <Droplets className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-md font-semibold text-sensacion-fuerte">
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
                      className="w-full text-left bg-apariencia-suave rounded-3xl p-1 border border-apariencia focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-200"
                      disabled={!onEdit}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-apariencia rounded-lg flex items-center justify-center shadow-md">
                          <Circle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-md font-semibold text-apariencia-fuerte">
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
                        className="w-full text-left bg-observaciones-suave rounded-3xl p-1 border border-observaciones focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-200"
                        disabled={!onEdit}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-observaciones rounded-lg flex items-center justify-center shadow-md">
                            <Edit3 className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <span className="text-sm font-semibold text-observaciones-fuerte">
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
      <div className="absolute -inset-2 tooltip-glow rounded-3xl blur-xl -z-10"></div>
    </motion.div>
  );
};

export default ChartTooltip;
