import React from 'react';
import { motion } from 'framer-motion';

// Colores actualizados para consistencia
const SENSATION_COLOR = '#1E40AF';
const APPEARANCE_COLOR = '#059669';
const OBSERVATION_COLOR = '#BE185D';

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
        {/* Gradiente para el fondo */}
        <linearGradient id="legendBgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.95)" />
          <stop offset="100%" stopColor="rgba(252, 231, 243, 0.8)" />
        </linearGradient>
        
        {/* Filtro de sombra suave */}
        <filter id="legendShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="rgba(244, 114, 182, 0.15)" />
        </filter>
      </defs>

      {/* Fondo mejorado para las etiquetas de filas */}
      <rect
        x={0}
        y={bottomY + textRowHeight * 0.5}
        width={padding.left}
        height={textRowHeight * (isFullScreen ? 9.5 : 8)}
        fill="url(#legendBgGradient)"
        rx={8}
        style={{ filter: 'url(#legendShadow)' }}
      />

      {/* Etiquetas de temperatura con mejor estilo */}
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;
        
        return (
          <motion.text
            key={`temp-tick-fixed-${i}`}
            variants={itemVariants}
            x={padding.left - responsiveFontSize(1)}
            y={y + responsiveFontSize(0.35)}
            textAnchor="end"
            fontSize={responsiveFontSize(isMajor ? 1 : 0.9)}
            fontWeight={isMajor ? "600" : "500"}
            fill={isMajor ? "#E91E63" : "#EC4899"}
            style={{ 
              filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            {labelText}
          </motion.text>
        );
      })}

      {/* Unidad °C con diseño mejorado */}
      <motion.g variants={itemVariants}>
        {/* Fondo decorativo para °C */}
        <rect
          x={padding.left - responsiveFontSize(0.3)}
          y={padding.top - responsiveFontSize(0.3)}
          width={responsiveFontSize(3)}
          height={responsiveFontSize(2.2)}
          rx={responsiveFontSize(0.4)}
          fill="rgba(244, 114, 182, 0.12)"
          stroke="rgba(244, 114, 182, 0.25)"
          strokeWidth={1}
          style={{ filter: 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.1))' }}
        />
        <text
          x={padding.left + responsiveFontSize(1.2)}
          y={padding.top + responsiveFontSize(1.2)}
          textAnchor="middle"
          fontSize={responsiveFontSize(1.4)}
          fontWeight="700"
          fill="#E91E63"
          style={{ 
            filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.8))',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          °C
        </text>
      </motion.g>

      {/* Etiquetas de filas con diseño mejorado */}
      <motion.g variants={itemVariants}>
        {[
          { label: 'Fecha', row: 1, color: isFullScreen ? '#374151' : '#6B7280' },
          { label: 'Día', row: 2, color: isFullScreen ? '#374151' : '#6B7280' },
          { label: 'Símbolo', row: 3, color: isFullScreen ? '#374151' : '#6B7280' },
          { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR },
          { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR },
          { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR }
        ].map(({ label, row, color }) => (
          <text
            key={label}
            x={padding.left - responsiveFontSize(1.5)}
            y={bottomY + textRowHeight * row}
            textAnchor="end"
            fontSize={responsiveFontSize(0.95)}
            fontWeight="600"
            fill={color}
            style={{ 
              filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            {label}
          </text>
        ))}
      </motion.g>
    </svg>
  );
};

export default ChartLeftLegend;