import React from 'react';
import { useMemo } from 'react';
import { motion } from 'framer-motion';

// Colores consistentes con la dashboard
const SENSATION_COLOR = '#1565C0';
const APPEARANCE_COLOR = '#2E7D32';
const OBSERVATION_COLOR = '#6A1B9A';
const RELATIONS_COLOR = '#be123c';

const ChartLeftLegend = ({
  padding,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  responsiveFontSize,
  textRowHeight,
  isFullScreen,
  showRelationsRow = false,
}) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" }
    }
  };

  const tempTicks = [];
  if (tempRange > 0) {
    const tickIncrement = tempRange <= 2.5 ? 0.1 : 0.5;
    for (let t = tempMin; t <= tempMax + 1e-9; t += tickIncrement) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  } else {
    for (let t = 35.8; t <= 37.2 + 1e-9; t += 0.1) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  }

  const bottomY = chartHeight - padding.bottom;
  const rowBlockHeight = textRowHeight * (isFullScreen ? 2 : 1.5);
  const extraLegendHeight = showRelationsRow ? rowBlockHeight : 0;
  const legendRows = useMemo(() => {
    const baseRows = [
      { label: 'Fecha', row: 1, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Día', row: 2, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Símbolo', row: 3, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR, icon: '◊' },
      { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR, icon: '○' },
      { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR, icon: '✦' },
    ];
    if (showRelationsRow) {
      baseRows.push({ label: 'RS', row: isFullScreen ? 11 : 9, color: RELATIONS_COLOR, icon: '❤' });
    }
    return baseRows;
  }, [isFullScreen, showRelationsRow]);

  return (
    <svg
      width={padding.left}
      height={chartHeight}
      className="font-sans pointer-events-none"
    >
      <defs>
        <filter id="textShadowLegend" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.9)" />
        </filter>
      </defs>

      {/* Fondo premium para las etiquetas de filas */}
      <rect
        x={0}
        y={bottomY + textRowHeight * 0.5}
        width={padding.left}
        height={textRowHeight * (isFullScreen ? 9.5 : 8) + extraLegendHeight}
        fill="rgba(255, 255, 255, 0.3)"
        stroke="rgba(255, 228, 230, 0.9)"
        strokeWidth={1}
        rx={12}
        style={{ filter: 'drop-shadow(0 1px 2px rgba(244, 63, 94, 0.08))' }}
      />



      {/* Etiquetas de temperatura con diseño premium */}
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;
        
        return (
          <motion.g key={`temp-tick-fixed-${i}`} variants={itemVariants}>
            
            <text
              x={padding.left - responsiveFontSize(1.2)}
              y={y + responsiveFontSize(0.35)}
              textAnchor="end"
              fontSize={responsiveFontSize(isMajor ? 1.15 : 1)}
              fontWeight={isMajor ? "800" : "700"}
              fill={isMajor ? "#E91E63" : "#EC4899"}
              style={{ 
                filter: 'url(#textShadowLegend)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {labelText}
            </text>
          </motion.g>
        );
      })}

      

      {/* Etiquetas de filas con diseño mejorado */}
      <motion.g variants={itemVariants}>
        {legendRows.map(({ label, row, color, icon }) => (
          <g key={label}>
            {/* Indicador visual para las categorías de datos */}
            {icon && (
              <text
                x={padding.left - responsiveFontSize(2.8)}
                y={bottomY + textRowHeight * row}
                textAnchor="middle"
                fontSize={responsiveFontSize(0.8)}
                fontWeight="600"
                fill={color}
                opacity={0.7}
                style={{ 
                  filter: 'url(#textShadowLegend)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {icon}
              </text>
            )}
            
            <text
              x={padding.left - responsiveFontSize(0.8)}
              y={bottomY + textRowHeight * row}
              textAnchor="end"
              fontSize={responsiveFontSize(1.05)}
              fontWeight="800"
              fill={color}
              style={{ 
                filter: 'url(#textShadowLegend)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {label}
            </text>
          </g>
        ))}
        
      </motion.g>

    </svg>
    
  );
};


export default ChartLeftLegend;