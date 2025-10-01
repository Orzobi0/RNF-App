import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { parseISO, startOfDay, isAfter } from 'date-fns';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

// Colores consistentes con la dashboard pero con mejor contraste para el chart
const SENSATION_COLOR = '#1565C0';
const APPEARANCE_COLOR = '#2E7D32';
const OBSERVATION_COLOR = '#6A1B9A';
// Gradientes suaves inspirados en el estilo de las burbujas de la UI
const SENSATION_BG_START = '#EFF6FF'; // from-blue-50
const SENSATION_BG_END = '#EEF2FF';   // to-indigo-50
const APPEARANCE_BG_START = '#ECFDF5'; // from-emerald-50
const APPEARANCE_BG_END = '#F0FDFA';   // to-teal-50
const OBSERVATION_BG_START = '#F5F3FF'; // from-violet-50
const OBSERVATION_BG_END = '#FAF5FF';   // to-purple-50
const CORRECTION_LINE_COLOR = 'rgba(148, 163, 184, 0.35)';
const CORRECTION_POINT_FILL = 'rgba(226, 232, 240, 0.6)';
const CORRECTION_POINT_STROKE = 'rgba(148, 163, 184, 0.5)';
const PEAK_EMOJI = '✖';
const POST_PEAK_MARKER_COLOR = '#7f1d1d';
const PEAK_EMOJI_COLOR = '#ec4899';
const PEAK_TEXT_SHADOW = 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.35))';
const HIGH_SEQUENCE_NUMBER_COLOR = '#be185d';
const BASELINE_NUMBER_COLOR = '#2563eb';


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
    const firstLine = str.slice(0, maxChars);
    const secondLine = str.slice(maxChars, maxChars * 2);
    return [firstLine, secondLine];
  }

  const splitByWords = (text) => {
    if (!text) return ['', ''];
    if (text.length <= maxChars) return [text, ''];

    const spaceIdx = text.indexOf(' ', maxChars);
    if (spaceIdx === -1) {
      return [text.slice(0, maxChars), text.slice(maxChars)];
    }

    return [text.slice(0, spaceIdx), text.slice(spaceIdx + 1)];
  };

  const [firstLine, remainder] = splitByWords(str);
  const [secondLine] = splitByWords(remainder.trimStart());

  return [firstLine, secondLine];
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
  reduceMotion = false,
  showInterpretation = false,
  ovulationDetails = null,
  baselineIndices = [],
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
    hidden: { opacity: 0, scale: 0.3 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        duration: 0.6, 
        ease: [0.34, 1.56, 0.64, 1],
        type: "spring",
        stiffness: 120,
        damping: 12
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

  const totalPoints = Array.isArray(data) ? data.length : 0;

  const highSequenceOrderMap = useMemo(() => {
    if (!showInterpretation) {
      return new Map();
    }

    const indices = Array.isArray(ovulationDetails?.highSequenceIndices)
      ? ovulationDetails.highSequenceIndices
      : [];

    const map = new Map();
    indices.forEach((sequenceIndex, position) => {
      const idx = Number(sequenceIndex);
      if (Number.isInteger(idx) && idx >= 0 && idx < totalPoints && !map.has(idx)) {
        map.set(idx, position + 1);
      }
    });
    return map;
  }, [showInterpretation, ovulationDetails, totalPoints]);

    const baselineOrderMap = useMemo(() => {
    if (!showInterpretation) {
      return new Map();
    }

    const indices = Array.isArray(baselineIndices) ? baselineIndices : [];
    if (!indices.length) {
      return new Map();
    }

    const seen = new Set();
    const validIndices = [];
    indices.forEach((value) => {
      const idx = Number(value);
      if (Number.isInteger(idx) && idx >= 0 && idx < totalPoints && !seen.has(idx)) {
        seen.add(idx);
        validIndices.push(idx);
      }
    });

    if (!validIndices.length) {
      return new Map();
    }

    const orderedAscending = [...validIndices].sort((a, b) => a - b);
    const map = new Map();
    let counter = 1;
    for (let i = orderedAscending.length - 1; i >= 0; i -= 1) {
      map.set(orderedAscending[i], counter);
      counter += 1;
    }
    return map;
  }, [showInterpretation, baselineIndices, totalPoints]);

  return (
    <>
      {/* Definiciones mejoradas con estilo premium */}
      <defs>
        <filter id="rowShadowChart" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(244, 114, 182, 0.2)" />
        </filter>
        
        <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        <linearGradient id="sensationGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={SENSATION_BG_START} />
          <stop offset="100%" stopColor={SENSATION_BG_END} />
        </linearGradient>
        
        <linearGradient id="appearanceGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={APPEARANCE_BG_START} />
          <stop offset="100%" stopColor={APPEARANCE_BG_END} />
        </linearGradient>
        
        <linearGradient id="observationGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={OBSERVATION_BG_START} />
          <stop offset="100%" stopColor={OBSERVATION_BG_END} />
        </linearGradient>

        <radialGradient id="tempPointGradientChart" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#FCE7F3" />
          <stop offset="40%" stopColor="#F472B6" />
          <stop offset="80%" stopColor="#E91E63" />
          <stop offset="100%" stopColor="#C2185B" />
        </radialGradient>

        <radialGradient id="tempPointIgnoredGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="80%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </radialGradient>
        <radialGradient id="ovulationPointGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="45%" stopColor="#60a5fa" />
          <stop offset="85%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </radialGradient>
      </defs>

      {/* Sombras de filas con diseño mejorado -- ocultas en modo compacto */}
      {!compact && (
        <g>
          <rect
            x={padding.left}
            y={mucusSensationRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#sensationGradientChart)"
            rx={4}
            style={{ filter: 'url(#rowShadowChart)' }}
          />
          <rect
            x={padding.left}
            y={mucusAppearanceRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#appearanceGradientChart)"
            rx={4}
            style={{ filter: 'url(#rowShadowChart)' }}
          />
          <rect
            x={padding.left}
            y={observationsRowY - rowBlockHeight / 2}
            width={rowWidth}
            height={rowBlockHeight}
            fill="url(#observationGradientChart)"
            rx={4}
            style={{ filter: 'url(#rowShadowChart)' }}
          />
        </g>
      )}

      {/* Leyenda izquierda con tipografía premium */}
      {isFullScreen && orientation !== 'portrait' && (
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
              x={padding.left - responsiveFontSize(0.5)}
              y={bottomY + textRowHeight * row}
              textAnchor="end"
              fontSize={responsiveFontSize(1.05)}
              fontWeight="700"
              fill={color}
              style={{ 
                filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))',
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
        const rawTemp = point.temperature_raw;
        const correctedTemp = point.temperature_corrected;
        const showCorrectionIndicator =
          point.use_corrected &&
          rawTemp != null &&
          correctedTemp != null &&
          Math.abs(correctedTemp - rawTemp) > 0.01;
        const rawY = showCorrectionIndicator ? getY(rawTemp) : null;  
        const textFill = isFullScreen ? "#374151" : "#6B7280";
        const hasTemp = point[temperatureField] != null;
        const hasAnyRecord = hasTemp
          || point.mucus_sensation
          || point.mucus_appearance
          || point.fertility_symbol;
        const isPlaceholder = String(point.id || '').startsWith('placeholder-');
        const peakMarkerIndex = ovulationDetails?.peakDayIndex;
        const isPeakTemperaturePoint =
          showInterpretation &&
          peakMarkerIndex != null &&
          !point.ignored &&
          hasTemp &&
          index === peakMarkerIndex;

        // Símbolo con colores mejorados
        const symbolInfo = getSymbolAppearance(point.fertility_symbol);
        let symbolFillStyle = 'transparent';
        if (symbolInfo?.color) {
          const raw = symbolInfo.color.replace(/^bg-/, '');
          if (raw === 'red-500') symbolFillStyle = '#ef4444';
          else if (raw === 'white') symbolFillStyle = '#ffffff';
          else if (raw === 'green-500') symbolFillStyle = '#22c55e';
          else if (raw === 'pink-300') symbolFillStyle = '#f9a8d4';
          else if (raw === 'yellow-400') symbolFillStyle = '#facc15';
        }


        const isFuture = point.isoDate
          ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
          : false;

          const symbolRectSize = responsiveFontSize(isFullScreen ? 1.8 : 2);
          const symbolTextY = symbolRowYBase - symbolRectSize * 0.75 + symbolRectSize / 2 + 2;

        const peakStatus = point.peakStatus ? String(point.peakStatus).toUpperCase() : null;
        const isPeakMarker = peakStatus === 'P' || peakStatus === 'X';
        const isPostPeakMarker = peakStatus && !isPeakMarker;
        const peakDisplay = isPeakMarker ? PEAK_EMOJI : peakStatus || '–';
        const isPeakSeriesDay =
          isPeakMarker || ['1', '2', '3'].includes(peakStatus);
        const shouldRenderSymbol = !isPlaceholder && symbolInfo.value !== 'none';
        const shouldEnableInteractions = Boolean(point.isoDate) && !isFuture;
        const interactionProps = shouldEnableInteractions
          ? {
              pointerEvents: 'all',
              style: { cursor: 'pointer' },
              onClick: (e) => onPointInteraction(point, index, e)
            }
          : {};

        const hasHighOrder = highSequenceOrderMap.has(index);
        const highOrder = hasHighOrder ? highSequenceOrderMap.get(index) : null;
        const hasBaselineOrder = baselineOrderMap.has(index);
        const baselineOrder = hasBaselineOrder ? baselineOrderMap.get(index) : null;
        const numberFontSize = responsiveFontSize(isFullScreen ? 0.75 : 1.2);
        const numberStrokeWidth = Math.max(0.5, numberFontSize * 0.18);
        const highNumberY = y - numberFontSize * (isFullScreen ? 2.6 : 2.2);
        const baselineNumberY = y + numberFontSize * (isFullScreen ? 1.9 : 1.6);


        // Límites de texto
        const maxChars = isFullScreen ? 4 : 7;
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
            {/* Punto de temperatura con diseño premium */}
            {hasTemp && (
              <MotionG {...(reduceMotion ? {} : { variants: pointVariants })}>
                {/* Indicador de corrección: punto original y línea discontinua */}
                {showCorrectionIndicator && rawY !== null && (
                  <g pointerEvents="none">
                    <line
                      x1={x}
                      y1={rawY}
                      x2={x}
                      y2={y}
                      stroke={CORRECTION_LINE_COLOR}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={x}
                      cy={rawY}
                      r={3.5}
                      fill={CORRECTION_POINT_FILL}
                      stroke={CORRECTION_POINT_STROKE}
                      strokeWidth={1}
                    />
                    <circle
                      cx={x}
                      cy={rawY}
                      r={1.2}
                      fill="rgba(255, 255, 255, 0.6)"
                    />
                  </g>
                )}

                {/* Aura del punto con efecto glow */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPeakTemperaturePoint ? 2 : 1.5}
                  fill={isPeakTemperaturePoint ? 'rgba(59, 130, 246, 0.28)' : 'rgba(244, 114, 182, 0.2)'}
                  opacity={0.85}
                  style={{ filter: 'url(#pointGlow)' }}
                />
                
                {/* Anillo decorativo exterior */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPeakTemperaturePoint ? 4.2 : 3.5}
                  fill="none"
                  stroke={
                    point.ignored
                      ? 'rgba(148, 163, 184, 0.4)'
                      : isPeakTemperaturePoint
                        ? 'rgba(37, 99, 235, 0.55)'
                        : 'rgba(244, 114, 182, 0.3)'
                  }
                  strokeWidth={isPeakTemperaturePoint ? 2 : 1.5}
                  opacity={isPeakTemperaturePoint ? 0.9 : 0.6}
                />
                
                {/* Punto principal con gradiente mejorado */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPeakTemperaturePoint ? 4.6 : 4}
                  fill={
                    point.ignored
                      ? 'url(#tempPointIgnoredGradient)'
                      : isPeakTemperaturePoint
                        ? 'url(#ovulationPointGradient)'
                        : 'url(#tempPointGradientChart)'
                  }
                  stroke={
                    point.use_corrected
                      ? '#F59E0B'
                      : point.ignored
                        ? '#94A3B8'
                        : isPeakTemperaturePoint
                          ? '#1d4ed8'
                          : '#E91E63'
                  }
                  strokeWidth={point.ignored ? 2 : isPeakTemperaturePoint ? 3.2 : 3}
                  style={{
                    filter: isPeakTemperaturePoint
                      ? 'drop-shadow(0 3px 8px rgba(37, 99, 235, 0.45))'
                      : 'drop-shadow(0 3px 6px rgba(244, 114, 182, 0.4))',
                    cursor: 'pointer'
                  }}
                  pointerEvents="all"
                  onClick={(e) => onPointInteraction(point, index, e)}
                />
                
                {/* Punto central brillante */}
                {!point.ignored && (
                  <circle
                    cx={x}
                    cy={y}
                    r={isPeakTemperaturePoint ? 1.8 : 1.5}
                    fill={isPeakTemperaturePoint ? 'rgba(239, 246, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)'}
                    style={{
                      filter: isPeakTemperaturePoint
                        ? 'drop-shadow(0 1px 3px rgba(37, 99, 235, 0.45))'
                        : 'drop-shadow(0 1px 2px rgba(244, 114, 182, 0.3))'
                    }}
                  />
                )}

                {isPeakTemperaturePoint && (
                  <circle
                    cx={x}
                    cy={y}
                    r={6.5}
                    fill="none"
                    stroke="rgba(37, 99, 235, 0.35)"
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                  />
                )}


{showInterpretation &&
                  hasTemp &&
                  !point.ignored &&
                  hasHighOrder && (
                    <g pointerEvents="none">
                      <text
                        x={x}
                        y={highNumberY}
                        textAnchor="middle"
                        fontSize={numberFontSize}
                        fontWeight="900"
                        fill={HIGH_SEQUENCE_NUMBER_COLOR}

                        strokeWidth={numberStrokeWidth}
                        style={{
                          fontFamily:
                            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          paintOrder: 'stroke',
                          filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))',
                        }}
                      >
                        {highOrder}
                      </text>
                    </g>
                  )}
                {showInterpretation &&
                  hasTemp &&
                  !point.ignored &&
                  hasBaselineOrder && (
                    <g pointerEvents="none">
                      <text
                        x={x}
                        y={baselineNumberY}
                        textAnchor="middle"
                        fontSize={numberFontSize}
                        fontWeight="800"
                        fill={BASELINE_NUMBER_COLOR}
                        stroke="#ffffff"
                        strokeWidth={numberStrokeWidth}
                        style={{
                          fontFamily:
                            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          paintOrder: 'stroke',
                          filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.85))',
                        }}
                      >
                        {baselineOrder}
                      </text>
                    </g>
                  )}
                </MotionG>
              )}

            {/* Fecha con estilo mejorado */}
            <text 
              x={x} 
              y={dateRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(1.05)}
              fontWeight="900"
              fill={textFill}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))'
              }}
            >
              {compactDate(point.date)}
            </text>

            {/* Día del ciclo con estilo mejorado */}
            <text 
              x={x} 
              y={cycleDayRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(1)}
              fontWeight="900"
              fill={textFill}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))'
              }}
            >
              {point.cycleDay}
            </text>

            {/* Símbolo mejorado con mejor diseño */}
            {shouldRenderSymbol ? (
              <g>
                {/* Sombra del símbolo */}
                <rect
                  x={x - symbolRectSize/2 + 1}
                  y={symbolRowYBase - symbolRectSize*0.75 + 1}
                  width={symbolRectSize}
                  height={symbolRectSize}
                  fill="rgba(0, 0, 0, 0.1)"
                  rx={symbolRectSize * 0.3}
                  opacity={0.5}
                />
                {/* Símbolo principal */}
                <rect
                  x={x - symbolRectSize/2-4}
                  y={symbolRowYBase - symbolRectSize*0.75}
                  width={symbolRectSize*1.4}
                  height={symbolRectSize}
                  fill={symbolInfo.pattern === 'spotting-pattern'
                    ? "url(#spotting-pattern-chart)"
                    : symbolFillStyle}
                  stroke={symbolInfo.value === 'white' ? '#CBD5E1' : 'rgba(233, 30, 99, 0.4)'}
                  strokeWidth={symbolInfo.value === 'white' ? 2 : 1}
                  rx={symbolRectSize * 0.2}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.25))' }}
                />
                {peakStatus && (
                  <g pointerEvents="none">
                    {isPeakMarker ? (
                      <text
                        x={x}
                        y={symbolTextY}
                        textAnchor="middle"
                        fontSize={responsiveFontSize(1.35)}
                        fontWeight="900"
                        fill={PEAK_EMOJI_COLOR}
                        stroke="#fff"
                        strokeWidth={1.5}
                        paintOrder="stroke"
                        style={{ filter: PEAK_TEXT_SHADOW }}
                      >
                        {PEAK_EMOJI}
                      </text>
                    ) : (
                      <text
                        x={x}
                        y={symbolTextY}
                        textAnchor="middle"
                        fontSize={responsiveFontSize(peakStatus ? 1.1 : 1)}
                        fontWeight="800"
                        fill={POST_PEAK_MARKER_COLOR}
                        style={{ filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.9))' }}
                      >
                        {peakStatus}
                      </text>
                    )}
                  </g>
                )}
              </g>
            ) : (
              <g>
                {isPeakSeriesDay && (
                  <rect
                    x={x - symbolRectSize / 2 - 4}
                    y={symbolRowYBase - symbolRectSize * 0.75}
                    width={symbolRectSize * 1.4}
                    height={symbolRectSize}
                    fill="transparent"
                    stroke={isPeakMarker ? PEAK_EMOJI_COLOR : POST_PEAK_MARKER_COLOR}
                    strokeWidth={1}
                    rx={symbolRectSize * 0.2}
                  />
                )}
                <text
                  x={x}
                  y={symbolTextY}
                  textAnchor="middle"
                  fontSize={responsiveFontSize(
                    isPeakMarker ? 1.35 : isPostPeakMarker ? 1.1 : 1
                  )}
                  fill={
                    isPeakMarker
                      ? PEAK_EMOJI_COLOR
                      : isPostPeakMarker
                        ? POST_PEAK_MARKER_COLOR
                        : textFill
                  }
                  fontWeight={isPeakMarker ? '900' : isPostPeakMarker ? '800' : '500'}
                  style={{
                    filter: isPeakMarker
                      ? PEAK_TEXT_SHADOW
                      : isPostPeakMarker
                        ? 'drop-shadow(0 1px 1px rgba(255,255,255,0.9))'
                        : 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))'
                  }}
                >
                  {peakDisplay}
                </text>
              </g>
            )}

            {/* Textos con tipografía mejorada y colores premium */}
            {!compact && (
            <text 
              x={x} 
              y={mucusSensationRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.9)} 
              fontWeight="700"
              fill={SENSATION_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))'
              }}
            >
              <tspan x={x} dy={0}>{sensLine1}</tspan>
              {sensLine2 && <tspan x={x} dy={responsiveFontSize(1.1)}>{sensLine2}</tspan>}
            </text>
            )}

            {!compact && (
            <text 
              x={x} 
              y={mucusAppearanceRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.9)} 
              fontWeight="700"
              fill={APPEARANCE_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))'
              }}
            >
              <tspan x={x} dy={0}>{aparLine1}</tspan>
              {aparLine2 && <tspan x={x} dy={responsiveFontSize(1.1)}>{aparLine2}</tspan>}
            </text>
            )}
            
            {!compact && (
            <text 
              x={x} 
              y={observationsRowY} 
              textAnchor="middle"
              fontSize={responsiveFontSize(0.9)} 
              fontWeight="700"
              fill={OBSERVATION_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))'
              }}
            >
              <tspan x={x} dy={0}>{obsLine1}</tspan>
              {obsLine2 && <tspan x={x} dy={responsiveFontSize(1.1)}>{obsLine2}</tspan>}
            </text>
            )}
          </MotionG>
        );
      })}
    </>
  );
};

export default ChartPoints;