import React from 'react';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { XCircle, EyeOff, Eye, Check } from 'lucide-react';
    import { format, parseISO } from 'date-fns';
    import { es } from 'date-fns/locale';
    import { getSymbolAppearance } from '@/config/fertilitySymbols';

    const ChartTooltip = ({ point, position, chartWidth, chartHeight, onToggleIgnore, onClose }) => {
      if (!point) return null;

      const tooltipWidth = 220; 
      const tooltipMinHeight = 160;
      
      let x = position.clientX + 15;
      let y = position.clientY + 15;

      if (x + tooltipWidth > chartWidth) {
        x = position.clientX - tooltipWidth - 15;
      }
      if (y + tooltipMinHeight > chartHeight) {
        y = position.clientY - tooltipMinHeight - 15;
      }
      if (x < 0) x = 10;
      if (y < 0) y = 10;

      const displayTemp = point.temperature_chart;
      const symbolInfo = getSymbolAppearance(point.fertility_symbol);
      const dateToFormat = point.timestamp || point.isoDate;

      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, x, y }}
          animate={{ opacity: 1, scale: 1, x, y }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          className="absolute bg-slate-700/80 backdrop-blur-md text-white p-3 rounded-lg shadow-2xl pointer-events-auto z-50"
          style={{ width: `${tooltipWidth}px`, minHeight: `${tooltipMinHeight}px`}}
        >
          <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-1 right-1 h-6 w-6 text-slate-300 hover:text-white hover:bg-slate-600/50">
            <XCircle size={18} />
          </Button>
          <p className="font-semibold text-sm text-emerald-300 mb-1">
            {dateToFormat ? format(parseISO(dateToFormat), "PPP", { locale: es }) : 'Fecha no disponible'} (Día {point.cycle_day || 'N/A'})
          </p>
          
          {displayTemp !== null && displayTemp !== undefined && (
             <p className="text-xs"><span className="font-medium">Temp. Gráfica:</span> {parseFloat(displayTemp).toFixed(2)}°C</p>
          )}
          {point.temperature_raw !== null && point.temperature_raw !== undefined && (
            <p className="text-xs">
              <span className="font-medium">Temp. Original:</span> {parseFloat(point.temperature_raw).toFixed(2)}°C
            </p>
          )}
          {point.use_corrected && point.temperature_corrected !== null && point.temperature_corrected !== undefined && (
            <p className="text-xs text-amber-300">
              <span className="font-medium">Temp. Corregida:</span> {parseFloat(point.temperature_corrected).toFixed(2)}°C <Check className="inline h-3 w-3" />
            </p>
          )}


          <div className="flex items-center my-1">
            {symbolInfo && symbolInfo.value !== 'none' && (
              <span className={`w-3 h-3 rounded-full mr-1.5 ${symbolInfo.color} ${symbolInfo.pattern ? 'pattern-bg' : ''}`}></span>
            )}
            <p className={`text-xs ${symbolInfo ? symbolInfo.textColor : 'text-slate-300'}`}>{symbolInfo ? symbolInfo.label : 'Sin Símbolo'}</p>
          </div>
          
          <p className="text-xs"><span className="font-medium">Sensación:</span> {point.mucus_sensation || 'N/A'}</p>
          <p className="text-xs"><span className="font-medium">Apariencia:</span> {point.mucus_appearance || 'N/A'}</p>
          {point.observations && <p className="text-xs mt-1 italic"><span className="font-medium">Obs:</span> {point.observations}</p>}
          
          {point.id && !String(point.id).startsWith('placeholder-') && (
             <Button
                onClick={() => onToggleIgnore(point.id)}
                variant={point.ignored ? "outline" : "destructive"}
                size="sm"
                className="w-full mt-2 text-xs py-1 h-auto"
             >
              {point.ignored ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
              {point.ignored ? 'Restaurar' : 'Despreciar'}
            </Button>
          )}
        </motion.div>
      );
    };

    export default ChartTooltip;