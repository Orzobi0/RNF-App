import React from 'react';
import { motion } from 'framer-motion';
import { getTempTicks } from '@/components/chartElements/chartTicks';
import { THEME, FONT_FAMILY } from '@/components/chartElements/chartTheme';

const ChartAxes = ({
  padding,
  chartWidth,
  tempMin,
  tempMax,
  tempRange,
  getY,
  getX,
  allDataPoints = [],
  visibleRange = null,
  responsiveFontSize,
  showLeftLabels = false,
  reduceMotion = false,
  isScrolling = false,
  graphBottomY,
  chartAreaHeight,
  rowsZoneHeight,
  ids,
  theme = THEME,
}) => {
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } } };
  const tempTicks = getTempTicks({ tempMin, tempMax, tempRange });
  const totalPoints = allDataPoints.length;
  const perfMode = totalPoints > 60 || isScrolling;
  const G = reduceMotion || perfMode ? 'g' : motion.g;
  const rangeStart = Number.isInteger(visibleRange?.startIndex) ? visibleRange.startIndex : 0;
  const rangeEnd = Number.isInteger(visibleRange?.endIndex) ? visibleRange.endIndex : Math.max(totalPoints - 1, 0);
  const startIndex = totalPoints ? Math.max(0, Math.min(totalPoints - 1, rangeStart)) : 0;
  const endIndex = totalPoints ? Math.max(startIndex, Math.min(totalPoints - 1, rangeEnd)) : -1;

  return (
    <g pointerEvents="none">
      <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartAreaHeight} fill={`url(#${ids.bgGradientId})`} rx={12} style={{ filter: `drop-shadow(0 4px 12px ${theme.card.shadowRGBA})` }} />
      <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartAreaHeight} fill={theme.card.fill} stroke={`url(#${ids.tempLineGradientId})`} strokeWidth="1" strokeOpacity="0.2" rx="12" style={{ filter: `url(#${ids.softShadowFilterId})` }} />
      <rect x={padding.left} y={graphBottomY} width={chartWidth - padding.left - padding.right} height={rowsZoneHeight} fill={`url(#${ids.dataZoneGradientId})`} rx="8" style={{ filter: 'drop-shadow(0 -1px 2px rgba(244, 114, 182, 0.05))' }} />

      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor ? temp.toFixed(1) : `.${temp.toFixed(1).split('.')[1]}`;
        return (
          <G key={`temp-${i}`} {...(reduceMotion || perfMode ? {} : { variants: itemVariants })}>
            <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke={isMajor ? theme.grid.major : theme.grid.minor} strokeWidth={isMajor ? 1.5 : 1} opacity={isMajor ? 1 : 0.7} strokeDasharray={isMajor ? '0' : '4,4'} />
            {showLeftLabels && <text x={padding.left - responsiveFontSize(1)} y={y + responsiveFontSize(0.35)} textAnchor="end" fontSize={responsiveFontSize(isMajor ? 1.1 : 1)} fontWeight={isMajor ? '700' : '600'} fill={isMajor ? theme.text.axisMajor : theme.text.axisMinor} style={{ filter: perfMode ? 'none' : `url(#${ids.textShadowFilterId})`, fontFamily: FONT_FAMILY }}>{labelText}</text>}
            <text x={chartWidth - padding.right + responsiveFontSize(1)} y={y + responsiveFontSize(0.35)} textAnchor="start" fontSize={responsiveFontSize(isMajor ? 1.1 : 1)} fontWeight={isMajor ? '700' : '600'} fill={isMajor ? theme.text.axisMajor : theme.text.axisMinor} style={{ filter: perfMode ? 'none' : `url(#${ids.textShadowFilterId})`, fontFamily: FONT_FAMILY }}>{labelText}</text>
          </G>
        );
      })}

      {totalPoints > 0 && Array.from({ length: endIndex - startIndex + 1 }, (_, o) => {
        const i = startIndex + o;
        const x = getX(i);
        return <line key={`v-${i}`} x1={x} y1={padding.top} x2={x} y2={graphBottomY} stroke={theme.grid.vertical} strokeWidth="1" opacity="0.6" />;
      })}

      <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartAreaHeight} fill="none" stroke={`url(#${ids.tempLineGradientId})`} strokeWidth="2" strokeOpacity="0.4" rx="12" />
      <rect x={padding.left + 1} y={padding.top + 1} width={chartWidth - padding.left - padding.right - 2} height={chartAreaHeight - 2} fill="none" stroke="white" strokeWidth="0.5" rx="11" opacity="0.9" />

      {showLeftLabels && <G {...(reduceMotion || perfMode ? {} : { variants: itemVariants })}><text x={padding.left + responsiveFontSize(1.2)} y={padding.top + responsiveFontSize(1.5)} textAnchor="middle" fontSize={responsiveFontSize(1.4)} fontWeight="800" fill={theme.text.axisMajor} style={{ filter: perfMode ? 'none' : `url(#${ids.textShadowFilterId})`, fontFamily: FONT_FAMILY }}>°C</text></G>}
    </g>
  );
};

export default ChartAxes;
