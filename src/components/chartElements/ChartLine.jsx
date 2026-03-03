import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { THEME } from '@/components/chartElements/chartTheme';

const ChartLine = ({ data, allDataPoints, getX, getY, temperatureField = 'temperature', reduceMotion = false, connectGaps = true, ids, theme = THEME }) => {
  if (!data || data.length < 2) return null;

  const { pathD, thinPathD, hasContinuousSegment } = useMemo(() => {
    const dataById = new Map(data.map((entry) => [entry.id, entry]));
    let linePath = '';
    let lastValidIndex = null;
    const validPoints = [];

    allDataPoints.forEach((point, index) => {
      const dataPoint = dataById.get(point.id);
      if (dataPoint && dataPoint[temperatureField] != null && !dataPoint.ignored) {
        const x = getX(index);
        const y = getY(dataPoint[temperatureField]);
        validPoints.push({ x, y });
        if (lastValidIndex !== null && index === lastValidIndex + 1) linePath += ` L ${x} ${y}`;
        else linePath += `${linePath ? ' ' : ''}M ${x} ${y}`;
        lastValidIndex = index;
      }
    });

    if (validPoints.length < 2) return { pathD: '', thinPathD: '', hasContinuousSegment: false };
    const nextThinPathD = connectGaps ? validPoints.map(({ x, y }, idx) => `${idx === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') : '';
    return { pathD: linePath, thinPathD: nextThinPathD, hasContinuousSegment: linePath.includes('L') };
  }, [allDataPoints, data, getX, getY, temperatureField, connectGaps]);

  if (!pathD) return null;

  return (
    <g pointerEvents="none">
      {hasContinuousSegment && (reduceMotion ? (
        <path d={pathD} fill="none" stroke={`url(#${ids.tempLineGlowGradientId})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.4} style={{ filter: `url(#${ids.lineGlowFilterId})` }} />
      ) : (
        <motion.path d={pathD} fill="none" stroke={`url(#${ids.tempLineGlowGradientId})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.4} style={{ filter: `url(#${ids.lineGlowFilterId})` }} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.4 }} transition={{ duration: 0.8, ease: 'easeInOut', delay: 0.2 }} />
      ))}

      {thinPathD && (reduceMotion ? (
        <path d={thinPathD} fill="none" stroke={theme.misc.correctionLine} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />
      ) : (
        <motion.path d={thinPathD} fill="none" stroke={theme.misc.correctionLine} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={0.65} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.65 }} transition={{ duration: 0.8, ease: 'easeInOut' }} />
      ))}

      {hasContinuousSegment && (reduceMotion ? (
        <path d={pathD} fill="none" stroke={`url(#${ids.tempLineGradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `url(#${ids.lineShadowFilterId})` }} />
      ) : (
        <motion.path d={pathD} fill="none" stroke={`url(#${ids.tempLineGradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `url(#${ids.lineShadowFilterId})` }} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1, ease: 'easeInOut', delay: 0.4 }} />
      ))}
    </g>
  );
};

export default React.memo(ChartLine);
