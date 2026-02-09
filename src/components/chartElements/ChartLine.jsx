import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const ChartLine = ({
  data,
  allDataPoints,
  getX,
  getY,
  baselineY,
  temperatureField = 'temperature',
  reduceMotion = false,
  connectGaps = true,
}) => {
  if (!data || data.length < 2) return null;

  const { pathD, thinPathD, hasContinuousSegment } = useMemo(() => {
    const dataById = new Map(data.map((entry) => [entry.id, entry]));
    let linePath = '';
    let lastValidIndex = null;
    const validPoints = [];

  allDataPoints.forEach((point, index) => {
      const dataPoint = dataById.get(point.id);
      if (
        dataPoint
        && dataPoint[temperatureField] !== null
        && dataPoint[temperatureField] !== undefined
        && !dataPoint.ignored
      ) {
        const x = getX(index);
        const y = getY(dataPoint[temperatureField]);
        validPoints.push({ x, y });
        if (lastValidIndex !== null && index === lastValidIndex + 1) {
          linePath += ` L ${x} ${y}`;
        } else {
          linePath += `${linePath ? ' ' : ''}M ${x} ${y}`;
        }
        lastValidIndex = index;
      }
      });

    if (validPoints.length < 2) {
      return { pathD: '', thinPathD: '', hasContinuousSegment: false };
    }

  const nextThinPathD =
      connectGaps && validPoints.length > 1
        ? validPoints
            .map(({ x, y }, idx) => `${idx === 0 ? 'M' : 'L'} ${x} ${y}`)
            .join(' ')
        : '';

    return {
      pathD: linePath,
      thinPathD: nextThinPathD,
      hasContinuousSegment: linePath.includes('L'),
    };
  }, [allDataPoints, data, getX, getY, temperatureField, connectGaps]);

  if (!pathD) return null;

  return (
    <>
      {/* Definiciones para gradientes y filtros mejorados */}
      <defs>
        <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="30%" stopColor="#ec4899" />
          <stop offset="70%" stopColor="#db2777" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
                
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
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'url(#lineShadow)' }}
          />
        ) : (
          <motion.path
            d={pathD}
            fill="none"
            stroke="url(#tempLineGradientChart)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'url(#lineShadow)' }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, ease: "easeInOut", delay: 0.4 }}
          />
        )
      )}

    </>
  );
};

export default React.memo(ChartLine);