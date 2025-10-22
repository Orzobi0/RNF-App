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
  showLeftLabels = false,
  reduceMotion = false
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
    for (let t = 35.8; t <= 37.2 + 1e-9; t += 0.1) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  }

  const G = reduceMotion ? 'g' : motion.g;

  return (
    <>

      {/* Definiciones mejoradas con gradientes inspirados en la dashboard */}
      <defs>
        <linearGradient id="bgGradientChart" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(254, 242, 242, 0.95)" />
          <stop offset="30%" stopColor="rgba(255, 241, 242, 0.9)" />
          <stop offset="70%" stopColor="rgba(255, 245, 255, 0.95)" />
          <stop offset="100%" stopColor="rgba(254, 242, 242, 0.8)" />
        </linearGradient>
        
        <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#E91E63" />
        </linearGradient>
        
        <filter id="chartGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        <filter id="textShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.8)" />
        </filter>

        {/* Patrón unificado para spotting */}
        <pattern id="spotting-pattern-chart" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#ef4444" />
          <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
        </pattern>
      </defs>

      {/* Fondo con gradiente elegante inspirado en la dashboard */}
      <rect
        x={padding.left}
        y={padding.top}
        width={chartWidth - padding.left - padding.right}
        height={chartHeight - padding.top - padding.bottom}
        fill="url(#bgGradientChart)"
        opacity={2}
        rx={12}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(244, 114, 182, 0.1))' }}
      />

      {/* Líneas de cuadrícula con estilo mejorado */}
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;

        return (
          <G key={`temp-tick-${i}`} {...(reduceMotion ? {} : { variants: itemVariants })}>
            {/* Líneas de cuadrícula con gradientes sutiles */}
            <line
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              stroke={isMajor ? "rgba(244, 114, 182, 0.3)" : "rgba(244, 114, 182, 0.15)"}
              strokeWidth={isMajor ? 3 : 2}
              strokeDasharray={isMajor ? '0' : '4,4'}
              style={{ 
                filter: isMajor ? 'drop-shadow(0 1px 3px rgba(244, 114, 182, 0.15))' : 'none',
                opacity: isMajor ? 1 : 0.7
              }}
            />

            {/* Etiquetas izquierda con diseño premium */}
            {showLeftLabels && (
              <text
                x={padding.left - responsiveFontSize(1)}
                y={y + responsiveFontSize(0.35)}
                textAnchor="end"
                fontSize={responsiveFontSize(isMajor ? 1.1 : 1)}
                fontWeight={isMajor ? "700" : "600"}
                fill={isMajor ? "#E91E63" : "#EC4899"}
                style={{ 
                  filter: 'url(#textShadow)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {labelText}
              </text>
            )}

            {/* Etiquetas derecha con diseño premium */}
            <text
              x={chartWidth - padding.right + responsiveFontSize(1)}
              y={y + responsiveFontSize(0.35)}
              textAnchor="start"
              fontSize={responsiveFontSize(isMajor ? 1.1 : 1)}
              fontWeight={isMajor ? "700" : "600"}
              fill={isMajor ? "#E91E63" : "#EC4899"}
              style={{ 
                filter: 'url(#textShadow)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {labelText}
            </text>
          </G>
        );
      })}

      {/* Líneas verticales de días con gradiente sutil */}
      {allDataPoints.map((_, i) => {
        const x = getX(i);
        return (
          <line
            key={`day-grid-${i}`}
            x1={x}
            y1={padding.top}
            x2={x}
            y2={chartHeight - padding.bottom}
            stroke="rgba(244, 114, 182, 0.08)"
            strokeWidth={2.8}
            style={{ filter: 'drop-shadow(0 0 1px rgba(244, 114, 182, 0.05))' }}
          />
        );
      })}

      {/* Bordes del área del gráfico con estilo premium */}
      <rect
        x={padding.left}
        y={padding.top}
        width={chartWidth - padding.left - padding.right}
        height={chartHeight - padding.top - padding.bottom}
        fill="none"
        stroke="rgba(244, 114, 182, 0.4)"
        strokeWidth={4}
        rx={8}
        style={{ 
          filter: 'drop-shadow(0 4px 12px rgba(244, 114, 182, 0.15))',
          strokeDasharray: '0'
        }}
      />
          {/* Unidad °C con diseño premium similar a la dashboard */}
      {showLeftLabels && (
        <G {...(reduceMotion ? {} : { variants: itemVariants })}>

          <text
            x={padding.left + responsiveFontSize(1.2)}
            y={padding.top + responsiveFontSize(1.5)}
            textAnchor="middle"
            fontSize={responsiveFontSize(1.4)}
            fontWeight="800"
            fill="#E91E63"
            style={{ 
              filter: 'url(#textShadow)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            °C
          </text>
        </G>
      )}

    </>
  );
};

export default ChartAxes;