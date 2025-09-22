import React from 'react';
import { motion } from 'framer-motion';

const ChartLine = ({ data, allDataPoints, getX, getY, baselineY, temperatureField = 'temperature', reduceMotion = false }) => {
  if (!data || data.length < 2) return null;

  let pathD = '';
  let lastValidIndex = null;
  const validPoints = [];

  allDataPoints.forEach((point, index) => {
    const dataPoint = data.find(dp => dp.id === point.id);
    if (dataPoint && dataPoint[temperatureField] !== null && dataPoint[temperatureField] !== undefined && !dataPoint.ignored) {
      const x = getX(index);
      const y = getY(dataPoint[temperatureField]);
      validPoints.push({ x, y });
      if (lastValidIndex !== null && index === lastValidIndex + 1) {
        pathD += ` L ${x} ${y}`;
      } else {
        pathD += `${pathD ? ' ' : ''}M ${x} ${y}`;
      }
      lastValidIndex = index;
    }
  });
      
  if (validPoints.length < 2) return null;

  const hasContinuousSegment = pathD.includes("L");

  const thinPathD =
    validPoints.length > 1
      ? validPoints
          .map(({ x, y }, idx) => `${idx === 0 ? 'M' : 'L'} ${x} ${y}`)
          .join(' ')
      : '';

  return (
    <>
      {/* Definiciones para gradientes y filtros mejorados */}
      <defs>
        <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="30%" stopColor="#EC4899" />
          <stop offset="70%" stopColor="#E91E63" />
          <stop offset="100%" stopColor="#C2185B" />
        </linearGradient>
        
        <linearGradient id="tempLineGradientChartGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(244, 114, 182, 0.6)" />
          <stop offset="30%" stopColor="rgba(236, 72, 153, 0.7)" />
          <stop offset="70%" stopColor="rgba(233, 30, 99, 0.8)" />
          <stop offset="100%" stopColor="rgba(194, 24, 91, 0.6)" />
        </linearGradient>
        
        <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        <filter id="lineShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(244, 114, 182, 0.4)" />
        </filter>
      </defs>

      {/* Línea de respaldo con efecto glow */}
      {hasContinuousSegment && (
        reduceMotion ? (
          <path
            d={pathD}
            fill="none"
            stroke="url(#tempLineGradientChartGlow)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.4}
            style={{ filter: 'url(#lineGlow)' }}
          />
        ) : (
          <motion.path
            d={pathD}
            fill="none"
            stroke="url(#tempLineGradientChartGlow)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.4}
            style={{ filter: 'url(#lineGlow)' }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{ duration: 0.8, ease: "easeInOut", delay: 0.2 }}
          />
        )
      )}

      {/* Línea conectando puntos no consecutivos */}
      {thinPathD && (
        reduceMotion ? (
          <path
            d={thinPathD}
            fill="none"
            stroke="#d587b1"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.65}
          />
        ) : (
          <motion.path
            d={thinPathD}
            fill="none"
            stroke="#d587b1"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.65}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.65 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          />
        )
      )}

      {/* Línea principal con gradiente premium */}
      {hasContinuousSegment && (
        reduceMotion ? (
          <path
            d={pathD}
            fill="none"
            stroke="url(#tempLineGradientChart)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'url(#lineShadow)' }}
          />
        ) : (
          <motion.path
            d={pathD}
            fill="none"
            stroke="url(#tempLineGradientChart)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'url(#lineShadow)' }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, ease: "easeInOut", delay: 0.4 }}
          />
        )
      )}

      {/* Línea central brillante para efecto premium */}
      {hasContinuousSegment && (
        reduceMotion ? (
          <path
            d={pathD}
            fill="none"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="0.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
        ) : (
          <motion.path
            d={pathD}
            fill="none"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="0.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.8 }}
            transition={{ duration: 1.2, ease: "easeInOut", delay: 0.6 }}
          />
        )
      )}
    </>
  );
};

export default ChartLine;