import React from 'react';
import { motion } from 'framer-motion';
import { parseISO, startOfDay, isAfter } from 'date-fns';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

// Colores mejorados con mejor contraste y elegancia
const SENSATION_COLOR = '#1E40AF';
const APPEARANCE_COLOR = '#059669';
const OBSERVATION_COLOR = '#BE185D';
const SENSATION_BG = 'rgba(30, 64, 175, 0.08)';
const APPEARANCE_BG = 'rgba(5, 150, 105, 0.08)';
const OBSERVATION_BG = 'rgba(190, 24, 93, 0.08)';

/** Quita ceros iniciales a día/mes */
const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = dateStr.split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

/**
 * Divide en dos líneas sin añadir puntos suspensivos.
 * Si "isFull" es true, simplemente corta por caracteres.
 */
const splitText = (str = '', maxChars, isFull, fallback = '–') => {
  if (!str) return [fallback, ''];
  if (str.length <= maxChars) return [str, ''];
  if (isFull) {
    return [str.slice(0, maxChars), ''];
  }
  const idx = str.indexOf(' ', maxChars);
  if (idx === -1) {
    return [str.slice(0, maxChars), str.slice(maxChars)];
  }
  return [str.slice(0, idx), str.slice(idx + 1)];
};

/** Limita un texto al número indicado de palabras */
const limitWords = (str = '', maxWords, fallback = '–') => {
  if (!str) return fallback;
  return str.split(/\s+/).slice(0, maxWords).join(' ');
};

const ChartPoints = ({
  data,
  getX,
  getY,
  isFullScreen,
  orientation,
  responsiveFontSize,
  onPointInteraction,
  clearActivePoint,
  activePoint,
  padding,
  chartHeight,
  chartWidth,
  temperatureField = 'temperature_chart',
  textRowHeight,
  compact = false,
  reduceMotion = false
}) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" }
    }
  };

  const pointVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        duration: 0.5, 
        ease: "easeOut",
        type: "spring",
        stiffness: 100
      }
    }
  };

  // filas base
  const bottomY = chartHeight - padding.bottom;
  const dateRowY = bottomY + textRowHeight * 1;
  const cycleDayRowY = bottomY + textRowHeight * 2;
  const symbolRowYBase = bottomY + textRowHeight * 3;
  const mucusSensationRowY = bottomY + textRowHeight * (isFullScreen ? 5 : 4.5);
  const mucusAppearanceRowY = bottomY + textRowHeight * (isFullScreen ? 7 : 6);
  const observationsRowY = bottomY + textRowHeight * (isFullScreen ? 9 : 7.5);
  const rowWidth = chartWidth - padding.left - padding.right;

  const rowBlockHeight = textRowHeight * (isFullScreen ? 2 : 1.5);

  const MotionG = reduceMotion ? 'g' : motion.g;

  return (
    <>
      {/* Definiciones de filtros y gradientes mejorados */}
      <defs>
        <filter id="rowShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(244, 114, 182, 0.15)" />
        </filter>
        
        <linearGradient id="sensationGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={SENSATION_BG} />
          <stop offset="100%" stopColor="rgba(30, 64, 175, 0.02)" />
        </linearGradient>
        
        <linearGradient id="appearanceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={APPEARANCE_BG} />
          <stop offset="100%" stopColor="rgba(5, 150, 105, 0.02)" />
        </linearGradient>
        
        <linearGradient id="observationGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={OBSERVATION_BG} />
          <stop offset="100%" stopColor="rgba(190, 24, 93, 0.02)" />
        </linearGradient>
      </defs>

      {/* Sombras de filas -- ocultas en modo compacto (landscape forzado) */}
      {!compact && (
        <g>
          <rect
            x={padding.left}
            y={mucusSensationRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#sensationGradient)"
            rx={6}
            style={{ filter: 'url(#rowShadow)' }}
          />
          <rect
            x={padding.left}
            y={mucusAppearanceRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#appearanceGradient)"
            rx={6}
            style={{ filter: 'url(#rowShadow)' }}
          />
          <rect
            x={padding.left}
            y={observationsRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#observationGradient)"
            rx={6}
            style={{ filter: 'url(#rowShadow)' }}
          />
        </g>
      )}

      {/* Leyenda izquierda con mejor tipografía */}
      {(!isFullScreen || orientation !== 'portrait') && (
        <motion.g variants={itemVariants}>
          {[
            { label: 'Fecha', row: 1, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Día', row: 2, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Símbolo', row: 3, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR },
            { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR },
            { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR },
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
      )}

      {data.map((point, index) => {
        const x = getX(index);
        const y = point[temperatureField] != null
          ? getY(point[temperatureField])
          : bottomY;
        const textFill = isFullScreen ? "#374151" : "#6B7280";
        const hasTemp = point[temperatureField] != null;
        const hasAnyRecord = hasTemp
          || point.mucus_sensation
          || point.mucus_appearance
          || point.fertility_symbol;
        const isPlaceholder = String(point.id || '').startsWith('placeholder-');

        const interactionProps = (!hasAnyRecord || isPlaceholder)
          ? {}
          : {
              pointerEvents: "all",
              style: { cursor: 'pointer' },
              onMouseEnter: (e) => onPointInteraction(point, index, e),
              onClick: (e) => onPointInteraction(point, index, e),
              onTouchStart: (e) => onPointInteraction(point, index, e),
            };

        // Símbolo con mejor estilizado
        const symbolInfo = getSymbolAppearance(point.fertility_symbol);
        let symbolFillStyle = 'transparent';
        if (symbolInfo?.color) {
          const raw = symbolInfo.color.replace(/^bg-/, '');
          if (raw === 'red-500') symbolFillStyle = '#ef4444';
          else if (raw === 'white') symbolFillStyle = '#ffffff';
          else if (raw === 'green-500') symbolFillStyle = '#22c55e';
          else if (raw === 'pink-300') symbolFillStyle = '#f9a8d4';
        }
        const symbolRectSize = responsiveFontSize(isFullScreen ? 1.4 : 1.6);

        const isFuture = point.isoDate
          ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
          : false;

        // Límites de texto
        const maxChars = isFullScreen ? 4 : 9;
        const maxWords = 2;

        const [sensLine1, sensLine2] = splitText(
          isFullScreen ? limitWords(point.mucus_sensation, maxWords, isFuture ? '' : '–') : point.mucus_sensation,
          maxChars,
          false,
          isFuture ? '' : '–'
        );
        const [aparLine1, aparLine2] = splitText(
          isFullScreen ? limitWords(point.mucus_appearance, maxWords, isFuture ? '' : '–') : point.mucus_appearance,
          maxChars,
          false,
          isFuture ? '' : '–'
        );
        const [obsLine1, obsLine2] = splitText(
          isFullScreen ? limitWords(point.observations, maxWords, '') : point.observations,
          maxChars,
          false,
          ''
        );

        return (
          <MotionG
            key={`pt-${index}-${point.isoDate || point.timestamp}`}
            {...(reduceMotion ? {} : { variants: itemVariants })}
            {...interactionProps}
          >
            {/* Punto de temperatura mejorado con gradientes y sombras */}
            {hasTemp && (
              <MotionG {...(reduceMotion ? {} : { variants: pointVariants })}>
                {/* Aura del punto */}
                <circle
                  cx={x} 
                  cy={y}
                  r={8}
                  fill="rgba(244, 114, 182, 0.15)"
                  opacity={0.6}
                />
                {/* Punto principal con gradiente */}
                <circle
                  cx={x} 
                  cy={y}
                  r={5}
                  fill={point.ignored ? 'white' : 'url(#tempPointGradient)'}
                  stroke={point.use_corrected ? '#F59E0B' : '#E91E63'}
                  strokeWidth={point.ignored ? 2 : 2.5}
                  style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.3))',
                    cursor: 'pointer'
                  }}
                  pointerEvents="all"
                  onMouseEnter={(e) => onPointInteraction(point, index, e)}
                  onTouchStart={(e) => onPointInteraction(point, index, e)}
                  onClick={(e) => onPointInteraction(point, index, e)}
                />
                {/* Punto central brillante */}
                {!point.ignored && (
                  <circle
                    cx={x} 
                    cy={y}
                    r={2}
                    fill="rgba(255, 255, 255, 0.8)"
                  />
                )}
              </MotionG>
            )}

            {/* Definir gradiente para puntos */}
            <defs>
              <radialGradient id="tempPointGradient" cx="30%" cy="30%">
                <stop offset="0%" stopColor="#F472B6" />
                <stop offset="70%" stopColor="#E91E63" />
                <stop offset="100%" stopColor="#C2185B" />
              </radialGradient>
            </defs>

            {/* Fecha con mejor estilo */}
            <text 
              x={x} 
              y={dateRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.95)}
              fontWeight="600"
              fill={textFill}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {compactDate(point.date)}
            </text>

            {/* Día del ciclo con mejor estilo */}
            <text 
              x={x} 
              y={cycleDayRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.9)}
              fontWeight="500"
              fill={textFill}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {point.cycleDay}
            </text>

            {/* Símbolo mejorado */}
            {!isPlaceholder && (
              symbolInfo.value !== 'none' ? (
                <rect
                  x={x - symbolRectSize/2}
                  y={symbolRowYBase - symbolRectSize*0.75}
                  width={symbolRectSize}
                  height={symbolRectSize}
                  fill={symbolInfo.pattern === 'spotting-pattern'
                    ? "url(#spotting-pattern-chart)"
                    : symbolFillStyle}
                  stroke={symbolInfo.value === 'white' ? '#b4c0cf' : 'rgba(233, 30, 99, 0.3)'}
                  strokeWidth={symbolInfo.value === 'white' ? 1 : 1}
                  rx={symbolRectSize * 0.25}
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(244, 114, 182, 0.2))' }}
                />
              ) : (
                <text
                  x={x} 
                  y={symbolRowYBase} 
                  textAnchor="middle"
                  fontSize={responsiveFontSize(0.9)} 
                  fill={textFill}
                  fontWeight="400"
                >
                  –
                </text>
              )
            )}

            {/* Textos con mejor tipografía y colores */}
            {!compact && (
            <text 
              x={x} 
              y={mucusSensationRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.85)} 
              fontWeight="600"
              fill={SENSATION_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <tspan x={x} dy={0}>{sensLine1}</tspan>
              {sensLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{sensLine2}</tspan>}
            </text>
            )}

            {!compact && (
            <text 
              x={x} 
              y={mucusAppearanceRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.85)} 
              fontWeight="600"
              fill={APPEARANCE_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <tspan x={x} dy={0}>{aparLine1}</tspan>
              {aparLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{aparLine2}</tspan>}
            </text>
            )}
            
            {!compact && (
            <text 
              x={x} 
              y={observationsRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.85)} 
              fontWeight="600"
              fill={OBSERVATION_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <tspan x={x} dy={0}>{obsLine1}</tspan>
              {obsLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{obsLine2}</tspan>}
            </text>
            )}
          </MotionG>
        );
      })}
    </>
  );
};

export default ChartPoints;
