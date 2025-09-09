import React from 'react';
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
  let x = position.clientX + 15;
  let y = position.clientY + 10;

  // Mantiene el tooltip siempre visible dentro del área del gráfico
  if (x + tooltipWidth > chartWidth) x = position.clientX - tooltipWidth - 10;
  if (y + tooltipMinHeight > chartHeight) y = position.clientY - tooltipMinHeight - 10;
  if (x < 10) x = 10;
  if (y < 10) y = 10;

  const temp = point.temperature_chart;
  const symbolInfo = getSymbolAppearance(point.fertility_symbol);
  const dateToFormat = point.timestamp || point.isoDate;

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
      case 'spot':
        return {
          bg: 'bg-pink-500',
          light: 'bg-pink-50',
          border: 'border-pink-200',
          text: 'text-pink-700',
          glow: 'shadow-pink-200/50'
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
      style={{ top: y, left: x, width: tooltipWidth }}
    >
      <div
        className="origin-top-left"
        style={{ transform: `scale(${scale})`, width: baseWidth, minHeight: baseMinHeight }}
      >
        {/* Contenedor principal con glassmorphism */}
        <div className="relative bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl rounded-2xl border border-white/60 shadow-2xl overflow-hidden">
        
        
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
              <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full flex items-center justify-center shadow-lg">
                <Circle className="w-2 h-2 text-white" fill="currentColor" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-800">
                  {dateToFormat
                    ? format(parseISO(dateToFormat), 'EEEE d', { locale: es })
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
            {temp != null && (
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
                        <div className="w-2 h-2 bg-red-500 rounded-full shadow-sm" title="Temperatura corregida"></div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Símbolo de fertilidad */}
            {symbolInfo && symbolInfo.value !== 'none' && (
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
                      {point.mucus_sensation || '-'}
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
                      {point.mucus_appearance || '-'}
                    </span>
                  </div>
                </div>
              </motion.div>
              
              {/* Observaciones */}
              {point.observations && (
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
                      <span className="text-sm font-semibold text-gray-800">
                        {point.observations}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Botones de acción */}
            {point.id && !String(point.id).startsWith('placeholder-') && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex justify-center gap-3 pt-1 border-t border-gray-100"
              >
                <Button
                  onClick={() => { if(onEdit) onEdit(point); if(onClose) onClose(); }}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 px-2 py-2 bg-white/80 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <Edit3 className="h-4 w-4" />
                  <span className="font-medium">Editar</span>
                </Button>
                
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
              </motion.div>
            )}
          </div>
        </div>

        {/* Decoración inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-200 to-transparent"></div>
      </div>
      </div>

      {/* Sombra adicional para profundidad */}
      <div className="absolute -inset-1 bg-gradient-to-br from-pink-200/20 to-rose-300/20 rounded-2xl blur-xl -z-10"></div>
    </motion.div>
  );
};

export default ChartTooltip;