import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle, EyeOff, Eye, Check, Edit3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

const ChartTooltip = ({ point, position, chartWidth, chartHeight, onToggleIgnore, onEdit, onClose }) => {
  if (!point) return null;

  const tooltipWidth = 130;
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
      className="absolute bg-white/80 border border-[#E27DBF] text-[#1F2937] p-2 rounded-lg shadow z-50"
      style={{ top: y, left: x, width: tooltipWidth, minHeight: tooltipMinHeight }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-1 right-1 text-[#E27DBF] hover:bg-[#FFB1DD]"
      >
        <XCircle size={16} />
      </Button>

      <p className="font-semibold text-sm text-[#E27DBF] mb-1">
        {dateToFormat
          ? format(parseISO(dateToFormat), 'd/M', { locale: es })
          : 'Fecha'}
        {` (Día ${point.cycleDay || 'N/A'})`}
      </p>

      {temp != null && (
        <p className="text-xs mb-1">
          <span className="font-medium">T:</span> {parseFloat(temp).toFixed(2)}°C
          {point.use_corrected && (
            <span className="inline-block ml-1 align-middle text-[#FF0000]">&middot;</span>
          )}
        </p>
      )}

      <div className="flex items-center mb-1">
        {symbolInfo && symbolInfo.value !== 'none' && (
          <span
            className={`w-3 h-3 rounded-full mr-1 ${symbolInfo.color} ${
              symbolInfo.pattern ? 'pattern-bg' : ''
            } ${symbolInfo.value === 'white' ? 'border border-gray-300' : ''}`}
          ></span>
        )}
        <p className="text-xs">
          {symbolInfo ? symbolInfo.label : '-'}
        </p>
      </div>

      <p className="text-xs mb-1">
        <span className="font-medium">Sens.:</span> {point.mucus_sensation || '-'}
      </p>
      <p className="text-xs">
        <span className="font-medium">Apar.:</span> {point.mucus_appearance || '-'}
      </p>

      {point.id && !String(point.id).startsWith('placeholder-') && (
        
        <div className="flex justify-center space-x-1 mt-1">
          <Button
            onClick={() => { if(onEdit) onEdit(point); if(onClose) onClose(); }}
            variant="outline"
            size="icon"
            className="text-[#393C65] hover:text-[#E27DBF] hover:bg-[#E27DBF]/10 "
          >
          <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => onToggleIgnore(point.id)}
            variant={point.ignored ? 'outline' : 'destructive'}
            size="icon"
            className="hover:bg-[#FFB1DD]/20"
          >
            {point.ignored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </motion.div>
  );
};


export default ChartTooltip;
