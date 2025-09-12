import React from 'react';
import { motion } from 'framer-motion';

// Colores consistentes con la dashboard
const SENSATION_COLOR = '#1565C0';
const APPEARANCE_COLOR = '#2E7D32';
const OBSERVATION_COLOR = '#6A1B9A';

const ChartLeftLegend = ({
  padding,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  responsiveFontSize,
  textRowHeight,
  isFullScreen
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
    for (let t = 35.0; t <= 37.5 + 1e-9; t += 0.5) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  }

  const bottomY = chartHeight - padding.bottom;
  const rowBlockHeight = textRowHeight * (isFullScreen ? 2 : 1.5);

  return (
    <svg
      width={padding.left}
      height={chartHeight}
      className="font-sans pointer-events-none"
    >
      <defs>
        {/* Gradiente premium para el fondo */}
        <linearGradient id="legendBgGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255, 228, 230, 1)" />
          <stop offset="30%" stopColor="rgba(255, 229, 235, 1)  " />
          <stop offset="70%" stopColor="rgba(255, 241, 242, 1)" />
          <stop offset="100%" stopColor="rgba(255, 236, 240, 0.6)" />
        </linearGradient>
        
        {/* Gradiente decorativo */}
        <linearGradient id="legendAccentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#E91E63" />
        </linearGradient>
        
        {/* Filtros mejorados */}
        <filter id="legendShadowChart" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(244, 114, 182, 0.2)" />
        </filter>
        
        <filter id="textShadowLegend" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.9)" />
        </filter>
      </defs>

      {/* Fondo premium para las etiquetas de filas */}
      <rect
        x={0}
        y={bottomY + textRowHeight * 0.5}
        width={padding.left}
        height={textRowHeight * (isFullScreen ? 9.5 : 8)}
        fill="url(#legendBgGradientChart)"
        rx={12}
        style={{ filter: 'url(#legendShadowChart)' }}
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
        {[
          { label: 'Fecha', row: 1, color: isFullScreen ? '#374151' : '#374151', icon: null },
          { label: 'Día', row: 2, color: isFullScreen ? '#374151' : '#374151', icon: null },
          { label: 'Símbolo', row: 3, color: isFullScreen ? '#374151' : '#374151', icon: null },
          { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR, icon: '◊' },
          { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR, icon: '○' },
          { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR, icon: '✦' }
        ].map(({ label, row, color, icon }) => (
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