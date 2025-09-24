import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle, EyeOff, Eye, Edit3, Thermometer, Droplets, Circle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

const ChartTooltip = ({ point, position, chartWidth, chartHeight, onToggleIgnore, onEdit, onClose }) => {
  if (!point) return null;

  // Escala reducida para que el tooltip ocupe menos espacio en pantalla
  const scale = 0.6;
  const baseWidth = 200;
  const baseMinHeight = 120;
  const tooltipWidth = baseWidth * scale;
  const tooltipMinHeight = baseMinHeight * scale;

  const tooltipRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(tooltipMinHeight);

  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight);
    }
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
  const mucusSensation = point.mucus_sensation ?? point.mucusSensation ?? '';
  const mucusAppearance = point.mucus_appearance ?? point.mucusAppearance ?? '';
  const observations = point.observations ?? '';
  const hasSymbol = symbolInfo && symbolInfo.value !== 'none';
  const hasTemperature = temp != null;
  const hasMucusInfo = Boolean((mucusSensation && mucusSensation.trim()) || (mucusAppearance && mucusAppearance.trim()));
  const hasObservations = Boolean(observations && observations.trim());
  const hasAnyData = hasTemperature || hasSymbol || hasMucusInfo || hasObservations;

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
{/* Contenedor principal con diseño premium inspirado en la dashboard */}
        <div className="relative bg-gradient-to-br from-white/98 to-rose-50/95 backdrop-blur-xl rounded-3xl border border-pink-100 shadow-2xl overflow-hidden">
        
        
        {/* Botón de cerrar más pequeño */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50/80 rounded-full w-6 h-6 transition-all duration-200"
        >
          <XCircle size={20} />
        </Button>

        <div className="p-2">
          {/* Header con fecha y día del ciclo */}
          <div className="mb-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-5 h-5 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full absolute top-2 left-2 flex items-center justify-center shadow-lg">
                <Circle className="w-2 h-2 text-white" fill="currentColor" />
              </div>
              <div>
                <h3 className="font-bold text-center text-lg text-gray-800">
                  {dateToFormat
                    ? format(parseISO(dateToFormat), 'dd/MM', { locale: es })
                    : 'Fecha'}
                </h3>
                <p className="text-sm text-pink-600 font-medium">
                  Día {point.cycleDay || 'N/A'} del ciclo
                </p>
              </div>
            </div>
          </div>

          {/* Información principal en grid */}
          <div className="space-y-1">
            {/* Temperatura */}
            {hasTemperature && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-1 border border-amber-100/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                    <Thermometer className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    
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
                  </div>
                </div>
              </motion.div>
            )}

            {/* Símbolo de fertilidad */}
            {hasSymbol && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className={`${symbolColors.light} rounded-xl p-1 ${symbolColors.border} border`}
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
            <div className="grid grid-cols-1 gap-3">
              {/* Sensación */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-1 border border-blue-100/50"
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
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-1 border border-emerald-100/50"
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
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-1 border border-violet-100/50"
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
            </div>

            {/* Botones de acción */}
            {(onEdit || (onToggleIgnore && !isPlaceholder && point.id)) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex justify-center gap-3 pt-1 border-t border-gray-100"
              >
                {onEdit && (
                  <Button
                    onClick={() => {
                      onEdit(point);
                      if (onClose) onClose();
                    }}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 px-2 py-2 bg-white/80 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="font-medium">{isPlaceholder ? 'Añadir datos' : 'Editar'}</span>
                  </Button>
                )}

                {onToggleIgnore && !isPlaceholder && point.id && (
                  <Button
                    onClick={() => onToggleIgnore(point.id)}
                    variant="outline"
                    size="sm"
                    className={`flex items-center gap-2 px-2 py-2 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md ${
                      point.ignored
                        ? 'bg-green-50 hover:bg-green-100 border-green-200 hover:border-green-300 text-green-700'
                        : 'bg-red-50 hover:bg-red-100 border-red-200 hover:border-red-300 text-red-700'
                    }`}
                  >
                    {point.ignored ? (
                      <>
                        <Eye className="h-4 w-4" />
                        <span className="font-medium">Mostrar</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4" />
                        <span className="font-medium">Ocultar</span>
                      </>
                    )}
                  </Button>
                )}
              </motion.div>
            )}
            {!hasAnyData && (
              <div className="mt-2 rounded-xl border border-dashed border-pink-200 bg-pink-50/60 p-2 text-center">
                <p className="text-sm font-semibold text-pink-600">Sin datos registrados para este día.</p>
                {onEdit && (
                  <p className="mt-1 text-xs text-pink-500">
                    Usa el botón "{isPlaceholder ? 'Añadir datos' : 'Editar'}" para agregar información.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
                   
      </div>
      </div>

      {/* Sombra adicional para profundidad */}
      <div className="absolute -inset-2 bg-gradient-to-br from-pink-200/25 to-rose-300/25 rounded-3xl blur-2xl -z-10"></div>
    </motion.div>
  );
};

export default ChartTooltip;