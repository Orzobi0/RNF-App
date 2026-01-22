import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { parseISO, startOfDay, isAfter, isSameDay } from 'date-fns';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';
// Colores consistentes con la dashboard pero con mejor contraste para el chart
const SENSATION_COLOR = 'var(--color-sensacion-fuerte)';
const APPEARANCE_COLOR = 'var(--color-apariencia-fuerte)';
const OBSERVATION_COLOR = 'var(--color-observaciones-fuerte)';
const HEART_COLOR = '#be123c';

const BACKGROUND_COLOR = 'rgba(252, 231, 243, 0.40)';
const BORDER_COLOR = 'rgba(244, 114, 182, 0.08)';

const ROW_BACKGROUND_FILL_SOFT_sens = '#EFF6FF';
const ROW_BACKGROUND_FILL_SOFT_apa = '#ECFDF5';
const ROW_BACKGROUND_FILL_SOFT_obs = '#F5F3FF';
const ROW_TINT_ALPHA = 0.2;
const SENSATION_BORDER_COLOR = 'rgba(14, 165, 233, 0.18)';
const APPEARANCE_BORDER_COLOR = 'rgba(16, 185, 129, 0.18)';
const OBSERVATION_BORDER_COLOR = 'rgba(139, 92, 246, 0.18)';
const ROW_SHADOW = 'drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08))';
const CORRECTION_LINE_COLOR = 'rgba(148, 163, 184, 0.35)';
const CORRECTION_POINT_FILL = 'rgba(226, 232, 240, 0.6)';
const CORRECTION_POINT_STROKE = 'rgba(148, 163, 184, 0.5)';
const PEAK_EMOJI = '✖';
const POST_PEAK_MARKER_COLOR = '#7f1d1d';
const PEAK_EMOJI_COLOR = '#ec4899';
const PEAK_TEXT_SHADOW = 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.35))';
const HIGH_SEQUENCE_NUMBER_COLOR = '#be185d';
const BASELINE_NUMBER_COLOR = '#2563eb';
const TODAY_HIGHLIGHT_COLOR = '#be185d';
const SYMBOL_BORDER_FALLBACK = 'rgba(244, 114, 182, 0.35)';


/** Quita ceros iniciales a día/mes */
const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = dateStr.split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

const DEFAULT_TEXT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const createTextMeasurer = () => {
  if (typeof document === 'undefined') {
    return (text, font) => {
      const match = /(\d+(?:\.\d+)?)px/.exec(font || '');
      const fontSize = match ? Number(match[1]) : 12;
      return text.length * fontSize * 0.6;
    };
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return (text, font) => {
      const match = /(\d+(?:\.\d+)?)px/.exec(font || '');
      const fontSize = match ? Number(match[1]) : 12;
      return text.length * fontSize * 0.6;
    };
  }
  return (text, font) => {
    context.font = font;
    return context.measureText(text).width;
  };
};
  const buildFontString = (fontSize, fontWeight, fontFamily) =>
  `${fontWeight} ${fontSize}px ${fontFamily}`;

const splitTextLinesByWidth = (
  str = '',
  {
    maxWidth,
    maxLines = 2,
    fontSize,
    fontWeight = 700,
    fontFamily = DEFAULT_TEXT_FONT_FAMILY,
    fallback = '–',
    measureTextWidth,
  }
) => {
  if (!str) {
    return [fallback, ...Array.from({ length: Math.max(0, maxLines - 1) }, () => '')];
  }

    const font = buildFontString(fontSize, fontWeight, fontFamily);
  const textWidth = (text) => measureTextWidth(text, font);
  const normalized = String(str).trim();
  const hasSpaces = /\s/.test(normalized);
  const tokens = hasSpaces ? normalized.split(/\s+/) : Array.from(normalized);
  const separator = hasSpaces ? ' ' : '';
  const lines = [];


    const splitByChars = (value) => {
    const chars = Array.from(value);
    let line = '';
    while (chars.length) {
      const nextLine = line + chars[0];
      if (textWidth(nextLine) <= maxWidth || !line) {
        line = nextLine;
        chars.shift();
        if (textWidth(line) > maxWidth && line.length > 1) {
          chars.unshift(...Array.from(line.slice(1)));
          line = line[0];
          break;
        }
      } else {
        break;
      }
    }
    return [line, chars.join('')];
  };

  while (tokens.length && lines.length < maxLines) {
    let line = '';
    while (tokens.length) {
      const nextToken = tokens[0];
      const candidate = line ? `${line}${separator}${nextToken}` : nextToken;
      if (textWidth(candidate) <= maxWidth) {
        line = candidate;
        tokens.shift();
        continue;
      }
      if (!line) {
        if (hasSpaces) {
          const [chunk, remainder] = splitByChars(nextToken);
          line = chunk;
          if (remainder) {
            tokens[0] = remainder;
          } else {
            tokens.shift();
          }
        } else {
          const [chunk, remainder] = splitByChars(nextToken);
          line = chunk;
          if (remainder) {
            tokens[0] = remainder;
          } else {
            tokens.shift();
          }
        }
      }
      break;
    }
    lines.push(line);
    if (!line && tokens.length) {
      lines.push(tokens.shift());
    }
  }

  if (tokens.length && lines.length) {
    const lastIndex = lines.length - 1;
    let lastLine = lines[lastIndex] || '';
    while (lastLine && textWidth(`${lastLine}…`) > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lastIndex] = lastLine ? `${lastLine}…` : '…';
  }

  while (lines.length < maxLines) {
    lines.push('');
  }

  return lines;
};

/** Limita un texto al número indicado de palabras */
function limitWords(str = '', maxWords, fallback = '–') {
  if (!str) return fallback;
  return str.split(/\s+/).slice(0, maxWords).join(' ');
}

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
  visibleRange = null,
  padding,
  chartHeight,
  chartWidth,
  temperatureField = 'temperature_chart',
  textRowHeight,
  compact = false,
  reduceMotion = false,
  isScrolling = false,
  showInterpretation = false,
  selectionMode = false,
  ovulationDetails = null,
  firstHighIndex = null,
  baselineIndices = [],
  graphBottomLift = 0,
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

  // --- Filas ancladas al final del área de gráfico (graphBottomY) y estiradas hasta abajo ---
  const rowsTopY = graphBottomY; // el “techo” de las filas es justo donde acaba la gráfica
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const halfBlock = isFullScreen ? 1 : 0.75;
  const relationsRowIndex = showRelationsRow
    ? obsRowIndex + (isFullScreen ? 2 : 1.5)
    : null;
  const baseRowCount = obsRowIndex + halfBlock;
  // altura ideal basada en el layout original para no comprimir filas existentes
  const autoRowH = Math.max(1, Math.floor(rowsZoneHeight / baseRowCount));
  // no reducimos por debajo del tamaño base (legibilidad), pero sí estiramos
  const rowH = Math.max(textRowHeight, autoRowH);

  const dateRowY = rowsTopY + rowH * 1;
  const cycleDayRowY = rowsTopY + rowH * 2;
  const symbolRowYBase = rowsTopY + rowH * 3;
  const mucusSensationRowY = rowsTopY + rowH * (isFullScreen ? 5 : 4.5);
  const mucusAppearanceRowY = rowsTopY + rowH * (isFullScreen ? 7 : 6);
  const observationsRowY = rowsTopY + rowH * (isFullScreen ? 9 : 7.5);
  const relationsRowY = showRelationsRow
    ? observationsRowY + rowH * (isFullScreen ? 2 : 1.5)
    : null;

  const totalPoints = Array.isArray(data) ? data.length : 0;
  const isLongCycle = totalPoints > 60;
  const perfMode = isLongCycle || isScrolling;
  const MotionG = reduceMotion || perfMode ? 'g' : motion.g;

  const rowWidth = chartWidth - padding.left - padding.right;
  const rowBlockHeight = rowH * (isFullScreen ? 2 : 1.5);
  const relationsHeartSize = Math.min(Math.max(rowBlockHeight * 0.46, 14), 12);

  const rangeStart = Number.isInteger(visibleRange?.startIndex) ? visibleRange.startIndex : 0;
  const rangeEnd = Number.isInteger(visibleRange?.endIndex)
    ? visibleRange.endIndex
    : Math.max(totalPoints - 1, 0);
  const startIndex = totalPoints ? Math.max(0, Math.min(totalPoints - 1, rangeStart)) : 0;
  const endIndex = totalPoints ? Math.max(startIndex, Math.min(totalPoints - 1, rangeEnd)) : -1;
  const today = useMemo(() => startOfDay(new Date()), []);
  const measureTextWidth = useMemo(() => createTextMeasurer(), []);
  const textLayoutCacheRef = useRef(new Map());
  const cellWidth = totalPoints > 0 ? rowWidth / totalPoints : rowWidth;
  const maxWords = 2;
  const cellTextPadding = Math.min(12, Math.max(4, cellWidth * 0.12));
  const availableTextWidth = Math.max(0, cellWidth - cellTextPadding * 2);
  const rowLineHeight = responsiveFontSize(0.95);
  const baseSensationFontSize = responsiveFontSize(0.9);
  const baseAppearanceFontSize = responsiveFontSize(0.9);
  const baseObservationFontSize = responsiveFontSize(0.9);
  const smallSensationFontSize = responsiveFontSize(0.8);
  const smallAppearanceFontSize = responsiveFontSize(0.8);
  const smallObservationFontSize = responsiveFontSize(0.8);

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
    const addIndexIfValid = (value) => {
      const idx = Number(value);
      if (Number.isInteger(idx) && idx >= 0 && idx < totalPoints && !seen.has(idx)) {
        seen.add(idx);
        validIndices.push(idx);
      }
      };

    indices.forEach((value) => {
      addIndexIfValid(value);
    });
    if (firstHighIndex != null) {
      const firstHighIdx = Number(firstHighIndex);
      if (Number.isInteger(firstHighIdx)) {
        addIndexIfValid(firstHighIdx - 1);
      }
    }

    if (!validIndices.length) {
      return new Map();
    }

    const orderedAscending = [...validIndices].sort((a, b) => a - b);
const map = new Map();
let counter = 1;
for (let i = orderedAscending.length - 1; i >= 0; i -= 1) {
  if (counter > 6) break;   // 👈 límite máximo
  map.set(orderedAscending[i], counter);
  counter += 1;
}

    return map;
  }, [showInterpretation, baselineIndices, totalPoints, firstHighIndex]);

  const rowLabelShadow = perfMode ? 'none' : 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))';
  const textShadowSoft = perfMode ? 'none' : 'drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8))';
  const textShadowStrong = perfMode ? 'none' : 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9))';
  const peakShadow = perfMode ? 'none' : PEAK_TEXT_SHADOW;
  const activeShadow = perfMode
    ? 'none'
    : 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.25))';
  const activeNumberShadow = perfMode
    ? 'none'
    : 'drop-shadow(0 1px 3px rgba(37, 99, 235, 0.45))';
  const tooltipShadow = perfMode
    ? 'none'
    : 'drop-shadow(0 2px 4px rgba(37, 99, 235, 0.3))';

  const resolveLines = useCallback(
    (text, fallback, baseFontSize, smallFontSize) => {
      const base = splitTextLinesByWidth(text, {
        maxWidth: availableTextWidth,
        maxLines: 3,
        fontSize: baseFontSize,
        fontWeight: 700,
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        fallback,
        measureTextWidth,
      });

      if (base[2]) {
        const smaller = splitTextLinesByWidth(text, {
          maxWidth: availableTextWidth,
          maxLines: 3,
          fontSize: smallFontSize,
          fontWeight: 700,
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          fallback,
          measureTextWidth,
        });
        return { lines: smaller, fontSize: smallFontSize };
      }

      return { lines: base, fontSize: baseFontSize };
    },
    [availableTextWidth, measureTextWidth]
  );

  useEffect(() => {
    textLayoutCacheRef.current.clear();
  }, [
    totalPoints,
    availableTextWidth,
    baseSensationFontSize,
    baseAppearanceFontSize,
    baseObservationFontSize,
  ]);

  const getCachedLines = useCallback(
    (cacheKey, text, fallback, baseFontSize, smallFontSize) => {
      const existing = textLayoutCacheRef.current.get(cacheKey);
      if (existing) return existing;
      const resolved = resolveLines(text, fallback, baseFontSize, smallFontSize);
      textLayoutCacheRef.current.set(cacheKey, resolved);
      return resolved;
    },
    [resolveLines]
  );

  const visibleIndices = useMemo(() => {
    if (!totalPoints || endIndex < startIndex) return [];
    return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => startIndex + offset);
  }, [endIndex, startIndex, totalPoints]);

  return (
    <>
      {/* Definiciones mejoradas con estilo premium */}
      <defs>
        <filter id="rowShadowChart" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(244, 114, 182, 0.2)" />
        </filter>
        <pattern id="spotting-pattern-chart" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#fb7185" />
          <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
        </pattern>
        
        <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>


        <radialGradient id="tempPointGradientChart" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#FDF2F8" />
          <stop offset="50%" stopColor="#F9A8D4" />
          <stop offset="85%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#DB2777" />
        </radialGradient>

        <radialGradient id="tempPointIgnoredGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="80%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </radialGradient>
        <radialGradient id="ovulationPointGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="50%" stopColor="#93c5fd" />
          <stop offset="85%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </radialGradient>
      </defs>

      {/* Fondos de filas sutiles alineados con las tarjetas -- ocultos en modo compacto */}


      {/* Leyenda izquierda con tipografía premium */}
      {isFullScreen && orientation !== 'portrait' && (
        <MotionG {...(reduceMotion || perfMode ? {} : { variants: itemVariants })}>
          {[
            { label: 'Fecha', row: 1, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Día', row: 2, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Símbolo', row: 3, color: isFullScreen ? "#374151" : "#6B7280" },
            { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR },
            { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR },
            { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR },
            ...(showRelationsRow && relationsRowIndex != null
              ? [{ label: 'RS', row: relationsRowIndex, color: HEART_COLOR }]
              : []),
          ].map(({ label, row, color }) => (
            <text
              key={label}
              x={padding.left - responsiveFontSize(0.5)}
              y={rowsTopY + rowH * row}
              textAnchor="end"
              fontSize={responsiveFontSize(1.05)}
              fontWeight="700"
              fill={color}
              style={{ 
                filter: rowLabelShadow,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              {label}
            </text>
          ))}
        </MotionG>
      )}

      {visibleIndices.map((index) => {
        const point = data[index];
        if (!point) return null;
        const x = getX(index);
        const y = point[temperatureField] != null
          ? getY(point[temperatureField])
          : rowsTopY;
        const rawTemp = point.temperature_raw;
        const correctedTemp = point.temperature_corrected;
        const showCorrectionIndicator =
          point.use_corrected &&
          rawTemp != null &&
          correctedTemp != null &&
          Math.abs(correctedTemp - rawTemp) > 0.01;
        const rawY = showCorrectionIndicator ? getY(rawTemp) : null;  
        const baseTextFill = isFullScreen ? "#60666f" : "#60666f";
        const hasTemp = point[temperatureField] != null;
        const hasRelations = Boolean(point.had_relations ?? point.hadRelations);
        const hasAnyRecord = hasTemp
          || point.mucus_sensation
          || point.mucus_appearance
          || point.fertility_symbol
          || hasRelations;
        const isPlaceholder = String(point.id || '').startsWith('placeholder-');
        const peakMarkerIndex = ovulationDetails?.peakDayIndex;
        const isPeakTemperaturePoint =
          showInterpretation &&
          peakMarkerIndex != null &&
          !point.ignored &&
          hasTemp &&
          index === peakMarkerIndex;

        // Símbolo con colores alineados con el dashboard
        const symbolInfo = getSymbolAppearance(point.fertility_symbol);
        const symbolPalette = getSymbolColorPalette(symbolInfo.value);
        const symbolFillStyle = symbolInfo.pattern === 'spotting-pattern'
          ? 'url(#spotting-pattern-chart)'
          : symbolPalette.main;
        const symbolStrokeColor = symbolPalette.border === 'none'
          ? 'none'
          : (symbolPalette.border || SYMBOL_BORDER_FALLBACK);
        const symbolStrokeWidth = symbolPalette.border === 'none'
          ? 0
          : (symbolInfo.value === 'white' ? 1.6 : 1);


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
        const shouldEnableInteractions = Boolean(point.isoDate) && (selectionMode || !isFuture);
        const interactionProps = shouldEnableInteractions
          ? {
              pointerEvents: 'all',
              style: { cursor: 'pointer' },
              onClick: (e) => onPointInteraction(point, index, e)
            }
          : {};

        const isTodayPoint = point.isoDate
          ? isSameDay(parseISO(point.isoDate), today)
          : false;
        const highlightedTextFill = isTodayPoint ? TODAY_HIGHLIGHT_COLOR : baseTextFill;

        const hasHighOrder = highSequenceOrderMap.has(index);
        const highOrder = hasHighOrder ? highSequenceOrderMap.get(index) : null;
        const hasBaselineOrder = baselineOrderMap.has(index);
        const baselineOrder = hasBaselineOrder ? baselineOrderMap.get(index) : null;
        const numberFontSize = responsiveFontSize(isFullScreen ? 0.75 : 1.2);
        const numberStrokeWidth = Math.max(0.5, numberFontSize * 0.18);
        const highNumberY = y - numberFontSize * (isFullScreen ? 2.6 : 1.8);
        const baselineNumberY = y + numberFontSize * (isFullScreen ? 1.9 : 1.6);


        // Límites de texto
        const sensText = isFullScreen
  ? limitWords(point.mucus_sensation, maxWords, isFuture ? '' : '–')
  : point.mucus_sensation;

const aparText = isFullScreen
  ? limitWords(point.mucus_appearance, maxWords, isFuture ? '' : '–')
  : point.mucus_appearance;

const obsText = isFullScreen
  ? limitWords(point.observations, maxWords, '')
  : point.observations;

const pointKey = `${point.isoDate || point.id || index}`;
const sensRes = getCachedLines(
  `${pointKey}-sens-${availableTextWidth}-${baseSensationFontSize}-${smallSensationFontSize}-${sensText ?? ''}`,
  sensText,
  isFuture ? '' : '–',
  baseSensationFontSize,
  smallSensationFontSize
);
const aparRes = getCachedLines(
  `${pointKey}-apar-${availableTextWidth}-${baseAppearanceFontSize}-${smallAppearanceFontSize}-${aparText ?? ''}`,
  aparText,
  isFuture ? '' : '–',
  baseAppearanceFontSize,
  smallAppearanceFontSize
);
const obsRes = getCachedLines(
  `${pointKey}-obs-${availableTextWidth}-${baseObservationFontSize}-${smallObservationFontSize}-${obsText ?? ''}`,
  obsText,
  '',
  baseObservationFontSize,
  smallObservationFontSize
);

const [sensLine1, sensLine2, sensLine3] = sensRes.lines;
const [aparLine1, aparLine2, aparLine3] = aparRes.lines;
const [obsLine1,  obsLine2,  obsLine3 ] = obsRes.lines;

const sensationFontSize   = sensRes.fontSize;
const appearanceFontSize  = aparRes.fontSize;
const observationFontSize = obsRes.fontSize;


        const countLines = (a, b, c) => Math.max(1, [a, b, c].filter((v) => v && String(v).trim() !== '').length);

        const sensCount = countLines(sensLine1, sensLine2, sensLine3);
        const aparCount = countLines(aparLine1, aparLine2, aparLine3);
        const obsCount  = countLines(obsLine1,  obsLine2,  obsLine3);

        const centeredY = (baseY, lines) => baseY - ((lines - 1) * rowLineHeight) / 2;

        const sensY = centeredY(mucusSensationRowY, sensCount);
        const aparY = centeredY(mucusAppearanceRowY, aparCount);
        const obsY  = centeredY(observationsRowY, obsCount);

        return (
          <MotionG
            key={`pt-${index}-${point.isoDate || point.timestamp}`}
            {...(reduceMotion || perfMode ? {} : { variants: itemVariants })}
            {...interactionProps}
          >
            {/* Punto de temperatura con diseño premium */}
            {hasTemp && (
              <MotionG {...(reduceMotion || perfMode ? {} : { variants: pointVariants })}>
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
                      r={3}
                      fill={CORRECTION_POINT_FILL}
                      stroke={CORRECTION_POINT_STROKE}
                      strokeWidth={1}
                    />
                    <circle
                      cx={x}
                      cy={rawY}
                      r={1}
                      fill="rgba(255, 255, 255, 0.6)"
                    />
                  </g>
                )}

               
                {/* Punto principal con gradiente mejorado */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPeakTemperaturePoint ? 3.5 : 2.8}
                  fill={
                    point.ignored
                      ? 'url(#tempPointIgnoredGradient)'
                      : isPeakTemperaturePoint
                        ? 'url(#ovulationPointGradient)'
                        : 'url(#tempPointGradientChart)'
                  }
                  stroke={
                    point.use_corrected
                      ? '#941616'
                      : point.ignored
                        ? '#94A3B8'
                        : isPeakTemperaturePoint
                          ? '#1d4ed8'
                          : '#E91E63'
                  }
                  strokeWidth={point.ignored ? 1.5 : isPeakTemperaturePoint ? 2.2 : 2}
                  style={{
                    filter: isPeakTemperaturePoint ? tooltipShadow : activeShadow,
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
                    r={isPeakTemperaturePoint ? 1.2 : 0.9}
                    fill={isPeakTemperaturePoint ? 'rgba(239, 246, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)'}
                    style={{
                      filter: isPeakTemperaturePoint ? activeNumberShadow : textShadowSoft
                    }}
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
                          filter: textShadowSoft,
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
                          filter: textShadowSoft,
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
              fill={highlightedTextFill}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: textShadowSoft
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
              fill={highlightedTextFill}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: textShadowSoft
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
                  fill={symbolFillStyle}
                  stroke={symbolStrokeColor}
                  strokeWidth={symbolStrokeWidth}
                  rx={symbolRectSize * 0.2}
                  style={{ filter: activeShadow }}
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
                        style={{ filter: peakShadow }}
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
                        style={{ filter: textShadowStrong }}
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
                        : baseTextFill
                  }
                  fontWeight={isPeakMarker ? '900' : isPostPeakMarker ? '800' : '500'}
                  style={{
                    filter: isPeakMarker
                      ? peakShadow
                      : isPostPeakMarker
                        ? textShadowStrong
                        : textShadowSoft
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
              y={sensY} 
              textAnchor="middle"
              fontSize={sensationFontSize} 
              fontWeight="700"
              fill={SENSATION_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: textShadowStrong
              }}
            >
              <tspan x={x} dy={0}>{sensLine1}</tspan>
              {sensLine2 && <tspan x={x} dy={rowLineHeight}>{sensLine2}</tspan>}
              {sensLine3 && <tspan x={x} dy={rowLineHeight}>{sensLine3}</tspan>}
            </text>
            )}

            {!compact && (
            <text 
              x={x} 
              y={aparY} 
              textAnchor="middle"
              fontSize={appearanceFontSize} 
              fontWeight="700"
              fill={APPEARANCE_COLOR}
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: textShadowStrong
              }}
            >
              <tspan x={x} dy={0}>{aparLine1}</tspan>
              {aparLine2 && <tspan x={x} dy={rowLineHeight}>{aparLine2}</tspan>}
              {aparLine3 && <tspan x={x} dy={rowLineHeight}>{aparLine3}</tspan>}
            </text>
            )}
            
            {!compact && (
            <text
              x={x}
              y={obsY}
              textAnchor="middle"
              fontSize={observationFontSize}
              fontWeight="700"
              fill={OBSERVATION_COLOR}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                filter: textShadowStrong
              }}
            >
              <tspan x={x} dy={0}>{obsLine1}</tspan>
              {obsLine2 && <tspan x={x} dy={rowLineHeight}>{obsLine2}</tspan>}
              {obsLine3 && <tspan x={x} dy={rowLineHeight}>{obsLine3}</tspan>}
            </text>
            )}

            {showRelationsRow && relationsRowY != null && hasRelations && (
              <g
                transform={`translate(${x - relationsHeartSize / 2}, ${relationsRowY - relationsHeartSize / 2})`}
                role="img"
                aria-label={`Relación registrada el ${point.isoDate || `día ${index + 1}`}`}
              >
                <Heart
                  width={relationsHeartSize}
                  height={relationsHeartSize}
                  color={HEART_COLOR}
                  fill={HEART_COLOR}
                />
              </g>
            )}

          </MotionG>
        );
      })}
    </>
  );
};

const areEqual = (prev, next) => {
  if (prev.data !== next.data) return false;
  if (prev.getX !== next.getX || prev.getY !== next.getY) return false;
  if (prev.isFullScreen !== next.isFullScreen) return false;
  if (prev.orientation !== next.orientation) return false;
  if (prev.responsiveFontSize !== next.responsiveFontSize) return false;
  if (prev.onPointInteraction !== next.onPointInteraction) return false;
  if (prev.clearActivePoint !== next.clearActivePoint) return false;
  if (prev.chartHeight !== next.chartHeight || prev.chartWidth !== next.chartWidth) return false;
  if (prev.temperatureField !== next.temperatureField) return false;
  if (prev.textRowHeight !== next.textRowHeight) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.reduceMotion !== next.reduceMotion) return false;
  if (prev.isScrolling !== next.isScrolling) return false;
  if (prev.showInterpretation !== next.showInterpretation) return false;
  if (prev.selectionMode !== next.selectionMode) return false;
  if (prev.ovulationDetails !== next.ovulationDetails) return false;
  if (prev.firstHighIndex !== next.firstHighIndex) return false;
  if (prev.baselineIndices !== next.baselineIndices) return false;
  if (prev.graphBottomLift !== next.graphBottomLift) return false;
  if (prev.graphBottomY !== next.graphBottomY) return false;
  if (prev.rowsZoneHeight !== next.rowsZoneHeight) return false;
  if (prev.showRelationsRow !== next.showRelationsRow) return false;

  const prevRange = prev.visibleRange;
  const nextRange = next.visibleRange;
  if (prevRange?.startIndex !== nextRange?.startIndex) return false;
  if (prevRange?.endIndex !== nextRange?.endIndex) return false;

  const prevPadding = prev.padding;
  const nextPadding = next.padding;
  if (prevPadding !== nextPadding) {
    if (!prevPadding || !nextPadding) return false;
    if (prevPadding.left !== nextPadding.left) return false;
    if (prevPadding.right !== nextPadding.right) return false;
    if (prevPadding.top !== nextPadding.top) return false;
    if (prevPadding.bottom !== nextPadding.bottom) return false;
  }

  return true;
};

export default React.memo(ChartPoints, areEqual);
