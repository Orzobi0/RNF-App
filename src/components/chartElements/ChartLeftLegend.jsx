import React, { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { getTempTicks } from '@/components/chartElements/chartTicks';
import { getRowMetrics } from '@/components/chartElements/chartLayout';
import { THEME, FONT_FAMILY } from '@/components/chartElements/chartTheme';

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
  reduceMotion = false,
  graphBottomY,
  rowsZoneHeight,
  showRelationsRow = false,
  theme = THEME,
  ids,
}) => {
  const tempTicks = getTempTicks({ tempMin, tempMax, tempRange });
  const { rowsTopY, rowH, obsRowIndex } = getRowMetrics({ graphBottomY, isFullScreen, rowsZoneHeight, textRowHeight, showRelationsRow });
  const relationsRowIndex = showRelationsRow ? obsRowIndex + (isFullScreen ? 2 : 1.5) : null;

  const legendRows = useMemo(() => {
    const baseRows = [
      { label: 'Fecha', row: 1, color: theme.text.neutral, icon: null },
      { label: 'Día', row: 2, color: theme.text.neutral, icon: null },
      { label: 'Símbolo', row: 3, color: theme.text.neutral, icon: null },
      { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: `var(${theme.rowColors.sensation.cssVar})`, icon: { type: 'text', value: '◊' } },
      { label: 'Apar.', row: isFullScreen ? 7 : 6, color: `var(${theme.rowColors.appearance.cssVar})`, icon: { type: 'text', value: '○' } },
      { label: 'Obs.', row: isFullScreen ? 9 : 7.5, color: `var(${theme.rowColors.observation.cssVar})`, icon: { type: 'text', value: '✦' } },
    ];
    if (showRelationsRow && relationsRowIndex != null) baseRows.push({ label: 'RS', row: relationsRowIndex, color: theme.rowColors.relations.fallback, icon: { type: 'heart' } });
    return baseRows;
  }, [isFullScreen, relationsRowIndex, showRelationsRow, theme]);

  const MotionGroup = reduceMotion ? 'g' : motion.g;
  return (
    <svg width={padding.left} height={chartHeight} className="font-sans pointer-events-none">
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor ? temp.toFixed(1) : `.${temp.toFixed(1).split('.')[1]}`;
        return (
          <MotionGroup key={`tick-${i}`}>
            <text x={padding.left - responsiveFontSize(1.2)} y={y + responsiveFontSize(0.35)} textAnchor="end" fontSize={responsiveFontSize(isMajor ? 1.15 : 1)} fontWeight={isMajor ? '800' : '700'} fill={isMajor ? theme.text.axisMajor : theme.text.axisMinor} opacity={isMajor ? 1 : 0.85} style={{ fontFamily: FONT_FAMILY }}>{labelText}</text>
          </MotionGroup>
        );
      })}

      <MotionGroup>
        {legendRows.map(({ label, row, color, icon }) => {
          const iconX = padding.left - responsiveFontSize(2.8);
          const iconY = rowsTopY + rowH * row;
          const iconSize = responsiveFontSize(0.95);
          return (
            <g key={label}>
              {icon?.type === 'text' && <text x={iconX} y={iconY} textAnchor="middle" fontSize={responsiveFontSize(0.8)} fontWeight="600" fill={color} opacity={0.7} style={{ fontFamily: FONT_FAMILY }}>{icon.value}</text>}
              {icon?.type === 'heart' && <g transform={`translate(${iconX - iconSize / 2}, ${iconY - iconSize / 2})`} opacity={0.7}><Heart width={iconSize} height={iconSize} color={color} fill={color} aria-hidden="true" /></g>}
              <text x={padding.left - responsiveFontSize(0.8)} y={rowsTopY + rowH * row} textAnchor="end" fontSize={responsiveFontSize(1.05)} fontWeight="800" fill={color} style={{ fontFamily: FONT_FAMILY }}>{label}</text>
            </g>
          );
        })}
      </MotionGroup>
    </svg>
  );
};

export default ChartLeftLegend;
