import React from 'react';
import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';

// Colores consistentes con la dashboard
const SENSATION_COLOR = 'var(--color-sensacion-fuerte)';
const APPEARANCE_COLOR = 'var(--color-apariencia-fuerte)';
const OBSERVATION_COLOR = 'var(--color-observaciones-fuerte)';

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
  const baseRowCount = obsRowIndex + halfBlock;
  const autoRowH = Math.max(1, Math.floor(rowsZoneHeight / baseRowCount));
  const rowH = Math.max(textRowHeight, autoRowH);
  const legendRows = useMemo(() => {
    const baseRows = [
      { label: 'Fecha', row: 1, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Día', row: 2, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Símbolo', row: 3, color: isFullScreen ? '#374151' : '#374151', icon: null },
      { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR, icon: { type: 'text', value: '◊' } },
      { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR, icon: { type: 'text', value: '○' } },
      { label: 'Obs.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR, icon: { type: 'text', value: '✦' } },
    ];
    if (showRelationsRow && relationsRowIndex != null) {
      baseRows.push({ label: 'RS', row: relationsRowIndex, color: '#f44336', icon: { type: 'heart' } });
    }
    return baseRows;
  }, [isFullScreen, relationsRowIndex, showRelationsRow]);
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
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.9)" />
        </filter>
      </defs>

      {/* Fondo premium para las etiquetas de filas */}




      {/* Etiquetas de temperatura con diseño premium */}
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
              fill={isMajor ? "#be185d" : "#db2777"}
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
        {legendRows.map(({ label, row, color, icon }) => {
          const iconX = padding.left - responsiveFontSize(2.8);
          const iconY = rowsTopY + rowH * row;
          const iconSize = responsiveFontSize(0.95);
          return (
          <g key={label}>
            {/* Indicador visual para las categorías de datos */}
            {icon?.type === 'text' && (
              <text
                x={iconX}
                y={iconY}
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
                {icon.value}
              </text>
            )}
            {icon?.type === 'heart' && (
              <g transform={`translate(${iconX - iconSize / 2}, ${iconY - iconSize / 2})`} opacity={0.7}>
                <Heart
                  width={iconSize}
                  height={iconSize}
                  color={color}
                  fill={color}
                  aria-hidden="true"
                />
              </g>
            )}
            
            <text
              x={padding.left - responsiveFontSize(0.8)}
              y={rowsTopY + rowH * row}
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
        );
        })}
        
      </MotionGroup>

    </svg>
    
  );
};


export default ChartLeftLegend;