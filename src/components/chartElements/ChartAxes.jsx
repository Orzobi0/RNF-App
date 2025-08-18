// Description: This component renders the axes and ticks for a temperature chart.
import React from 'react';
import { motion } from 'framer-motion';

const ChartAxes = ({
  padding,
  chartWidth,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  getX,
  allDataPoints = [],
  responsiveFontSize,
  isFullScreen,
  showLeftLabels = true
}) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.3, ease: "easeOut" }
    }
  };

  // build ticks every 0.1° up to 2.5° range, else every 0.5°
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

  return (
    <>
      {/* Gradiente de fondo sutil */}
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(252, 231, 243, 0.3)" />
          <stop offset="50%" stopColor="rgba(255, 255, 255, 0.8)" />
          <stop offset="100%" stopColor="rgba(252, 231, 243, 0.2)" />
        </linearGradient>
        
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Fondo degradado */}
      <rect
        x={padding.left}
        y={padding.top}
        width={chartWidth - padding.left - padding.right}
        height={chartHeight - padding.top - padding.bottom}
        fill="url(#bgGradient)"
        opacity={0.4}
      />

      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;

        return (
          <motion.g key={`temp-tick-${i}`} variants={itemVariants}>
            {/* Líneas de cuadrícula con gradiente */}
            <line
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              stroke={isMajor ? "rgba(244, 114, 182, 0.25)" : "rgba(244, 114, 182, 0.15)"}
              strokeWidth={isMajor ? 1.5 : 1}
              strokeDasharray={isMajor ? '0' : '3,3'}
              style={{ filter: isMajor ? 'drop-shadow(0 1px 2px rgba(244, 114, 182, 0.1))' : 'none' }}
            />

            {/* Etiquetas izquierda con mejor estilo */}
            {showLeftLabels && (
              <text
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
              </text>
            )}

            {/* Etiquetas derecha con mejor estilo */}
            <text
              x={chartWidth - padding.right + responsiveFontSize(1)}
              y={y + responsiveFontSize(0.35)}
              textAnchor="start"
              fontSize={responsiveFontSize(isMajor ? 1 : 0.9)}
              fontWeight={isMajor ? "600" : "500"}
              fill={isMajor ? "#E91E63" : "#EC4899"}
              style={{ 
                filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {labelText}
            </text>
          </motion.g>
        );
      })}

      {/* Líneas verticales de días con gradiente */}
      {allDataPoints.map((_, i) => {
        const x = getX(i);
        return (
          <line
            key={`day-grid-${i}`}
            x1={x}
            y1={padding.top}
            x2={x}
            y2={chartHeight - padding.bottom}
            stroke="rgba(244, 114, 182, 0.12)"
            strokeWidth={0.8}
            style={{ filter: 'drop-shadow(0 0 1px rgba(244, 114, 182, 0.1))' }}
          />
        );
      })}

      {/* Unidad °C con mejor estilo */}
      {showLeftLabels && (
        <motion.g variants={itemVariants}>
          {/* Fondo para la etiqueta °C */}
          <rect
            x={padding.left - responsiveFontSize(0.2)}
            y={padding.top - responsiveFontSize(0.2)}
            width={responsiveFontSize(2.8)}
            height={responsiveFontSize(2)}
            rx={responsiveFontSize(0.3)}
            fill="rgba(244, 114, 182, 0.1)"
            stroke="rgba(244, 114, 182, 0.2)"
            strokeWidth={0.5}
          />
          <text
            x={padding.left + responsiveFontSize(1.2)}
            y={padding.top + responsiveFontSize(1.1)}
            textAnchor="middle"
            fontSize={responsiveFontSize(1.3)}
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
      )}

      {/* Bordes del área del gráfico */}
      <rect
        x={padding.left}
        y={padding.top}
        width={chartWidth - padding.left - padding.right}
        height={chartHeight - padding.top - padding.bottom}
        fill="none"
        stroke="rgba(244, 114, 182, 0.2)"
        strokeWidth={1.5}
        rx={8}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.1))' }}
      />
    </>
  );
};

export default ChartAxes;