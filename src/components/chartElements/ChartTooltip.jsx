import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle, EyeOff, Eye, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

const ChartTooltip = ({ point, position, chartWidth, chartHeight, onToggleIgnore, onClose }) => {
  if (!point) return null;

  const tooltipWidth = 180;
  const tooltipMinHeight = 120;
  let x = position.clientX + 10;
  let y = position.clientY + 10;

  if (x + tooltipWidth > chartWidth) x = position.clientX - tooltipWidth - 10;
  if (y + tooltipMinHeight > chartHeight) y = position.clientY - tooltipMinHeight - 10;
  if (x < 0) x = 5;
  if (y < 0) y = 5;

  const temp = point.temperature_chart;
  const symbolInfo = getSymbolAppearance(point.fertility_symbol);
  const dateToFormat = point.timestamp || point.isoDate;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="absolute bg-slate-700/80 backdrop-blur-md text-white p-2 rounded-lg shadow-lg z-50"
      style={{ top: y, left: x, width: tooltipWidth, minHeight: tooltipMinHeight }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-1 right-1 text-slate-300 hover:text-white hover:bg-slate-600/50"
      >
        <XCircle size={16} />
      </Button>

      <p className="font-semibold text-sm text-emerald-300 mb-1">
        {dateToFormat
          ? format(parseISO(dateToFormat), 'd/M', { locale: es })
          : 'Fecha'}
        {` (Día ${point.cycle_day || 'N/A'})`}
      </p>

      {temp != null && (
        <p className="text-xs mb-1">
          <span className="font-medium">Temp:</span> {parseFloat(temp).toFixed(2)}°C
        </p>
      )}

      <div className="flex items-center mb-1">
        {symbolInfo && symbolInfo.value !== 'none' && (
          <span
            className={`w-3 h-3 rounded-full mr-1 ${symbolInfo.color} ${
              symbolInfo.pattern ? 'pattern-bg' : ''
            }`}
          ></span>
        )}
        <p className="text-xs">
          {symbolInfo ? symbolInfo.label : 'Sin Símbolo'}
        </p>
      </div>

      <p className="text-xs mb-1">
        <span className="font-medium">Sens.:</span> {point.mucus_sensation || '-'}
      </p>
      <p className="text-xs">
        <span className="font-medium">Apar.:</span> {point.mucus_appearance || '-'}
      </p>

      {point.id && !String(point.id).startsWith('placeholder-') && (
        <Button
          onClick={() => onToggleIgnore(point.id)}
          variant={point.ignored ? 'outline' : 'destructive'}
          size="sm"
          className="w-full mt-2 text-xs py-1"
        >
          {point.ignored ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}   
          {point.ignored ? 'Restaurar' : 'Despreciar'}
        </Button>
      )}
    </motion.div>
  );
};

export default ChartTooltip;
