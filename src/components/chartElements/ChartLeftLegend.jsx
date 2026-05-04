import React from 'react';
import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { getChartTheme } from '@/components/chartElements/chartTheme';

const ChartLeftLegend = ({
  padding,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  responsiveFontSize,
  bottomRowsResponsiveFontSize = responsiveFontSize,
  textRowHeight,
  isFullScreen,
  reduceMotion = false,
  graphBottomY,
  rowsZoneHeight,
  showRelationsRow = false,
  exportMode = false,
}) => {
  const theme = useMemo(() => getChartTheme(), []);
  const railFill = exportMode
    ? theme.background.leftLegendRailExport
    : theme.background.leftLegendRail;
  const railEdge = theme.background.leftLegendRailEdge;
  const majorTextColor = theme.grid.labelMajor;
  const minorTextColor = theme.grid.labelMinor;
  const rowTextColor = theme.palette.darkRoseText;
  const rowIconColor = theme.palette.axisMinor;

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

  // Ancla y estirado igual que las filas del chart
  const rowsTopY = graphBottomY;
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const halfBlock = isFullScreen ? 1 : 0.75;
  const relationsRowIndex = showRelationsRow
    ? obsRowIndex + (isFullScreen ? 2 : 1.5)
    : null;
  const exportExtraRows = exportMode ? 6 : 0;
  const baseRowCount = obsRowIndex + halfBlock + exportExtraRows;
  const autoRowH = Math.max(1, Math.floor(rowsZoneHeight / baseRowCount));
  const rowH = Math.max(textRowHeight, autoRowH);
  const rowLineHeight = bottomRowsResponsiveFontSize(0.95);
  const exportTextBlockHeight = rowLineHeight * 3;
  const exportSensationCenterY = rowsTopY + rowH * (isFullScreen ? 4 : 3.5) + exportTextBlockHeight / 2;
  const exportAppearanceCenterY = exportSensationCenterY + exportTextBlockHeight;
  const exportObservationCenterY = exportAppearanceCenterY + exportTextBlockHeight;
  const legendRows = useMemo(() => {
    const baseRows = [
      { label: 'Fecha', y: rowsTopY + rowH * 1, color: rowTextColor, icon: null },
      { label: 'Día', y: rowsTopY + rowH * 2, color: rowTextColor, icon: null },
      { label: 'Símbolo', y: rowsTopY + rowH * 3, color: rowTextColor, icon: null },
      { label: 'Sens.', y: exportMode ? exportSensationCenterY : rowsTopY + rowH * (isFullScreen ? 5 : 4.5), color: rowTextColor, icon: { type: 'text', value: '◊' } },
      { label: 'Apar.', y: exportMode ? exportAppearanceCenterY : rowsTopY + rowH * (isFullScreen ? 7 : 6), color: rowTextColor, icon: { type: 'text', value: '○' } },
      { label: 'Obs.', y: exportMode ? exportObservationCenterY : rowsTopY + rowH * (isFullScreen ? 9 : 7.5), color: rowTextColor, icon: { type: 'text', value: '✦' } },
    ];
    if (showRelationsRow && relationsRowIndex != null) {
      const relationsY = exportMode
        ? exportObservationCenterY + exportTextBlockHeight / 2 + rowH
        : rowsTopY + rowH * relationsRowIndex;
      baseRows.push({ label: 'RS', y: relationsY, color: rowTextColor, icon: { type: 'heart' } });
    }
    return baseRows;
  }, [
    exportAppearanceCenterY,
    exportMode,
    exportObservationCenterY,
    exportSensationCenterY,
    exportTextBlockHeight,
    isFullScreen,
    relationsRowIndex,
    rowH,
    rowTextColor,
    rowsTopY,
    showRelationsRow,
  ]);
  const MotionGroup = reduceMotion ? 'g' : motion.g;
  const motionGroupProps = reduceMotion ? {} : { variants: itemVariants };
  return (
    <svg
      width={padding.left}
      height={chartHeight}
      className="font-sans pointer-events-none"
    >
      <defs>
        <filter id="textShadowLegend" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.5" floodColor="rgba(255,255,255,0.70)" />
        </filter>
      </defs>

      {/* Etiquetas de temperatura con diseño premium */}
      <rect
        x={0}
        y={0}
        width={padding.left}
        height={chartHeight}
        fill={railFill}
      />


      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;
        
        return (
          <MotionGroup key={`temp-tick-fixed-${i}`} {...motionGroupProps}>
            
            <text
              x={padding.left - responsiveFontSize(1.2)}
              y={y + responsiveFontSize(0.35)}
              textAnchor="end"
              fontSize={responsiveFontSize(isMajor ? 1.15 : 1)}
              fontWeight={isMajor ? "800" : "700"}
              fill={isMajor ? majorTextColor : minorTextColor}
              opacity={isMajor ? 1 : 0.85}
              style={{ 
                filter: 'url(#textShadowLegend)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {labelText}
            </text>
          </MotionGroup>
        );
      })}

      

      {/* Etiquetas de filas con diseño mejorado */}
      <MotionGroup {...motionGroupProps}>
        {legendRows.map(({ label, y, color, icon }) => {
          const isBottomRowLabel = label === 'Sens.' || label === 'Apar.' || label === 'Obs.';
          const labelFont = isBottomRowLabel ? bottomRowsResponsiveFontSize : responsiveFontSize;
          const iconX = padding.left - labelFont(2.8);
          const iconY = y;
          const iconSize = labelFont(0.95);
          return (
          <g key={label}>
            {/* Indicador visual para las categorías de datos */}
            {icon?.type === 'text' && (
              <text
                x={iconX}
                y={iconY}
                textAnchor="middle"
                fontSize={labelFont(0.8)}
                fontWeight="600"
                fill={rowIconColor}
                opacity={0.7}
                style={{ 
                  filter: 'url(#textShadowLegend)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {icon.value}
              </text>
            )}
            {icon?.type === 'heart' && (
              <g transform={`translate(${iconX - iconSize}, ${iconY - iconSize})`} opacity={1}>
                <Heart
                  width={iconSize}
                  height={iconSize}
                  color={rowIconColor}
                  fill={rowIconColor}
                  aria-hidden="true"
                />
              </g>
            )}            
            <text
              x={padding.left - labelFont(0.8)}
              y={y}
              textAnchor="end"
              fontSize={labelFont(1.05)}
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
        );
        })}
        
      </MotionGroup>

    </svg>
    
  );
};


export default ChartLeftLegend;
