import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';
import { isAfter, isSameDay, parseISO, startOfDay } from 'date-fns';

const SENSATION_COLOR = 'var(--color-sensacion-fuerte)';
const APPEARANCE_COLOR = 'var(--color-apariencia-fuerte)';
const OBSERVATION_COLOR = 'var(--color-observaciones-fuerte)';
const HEART_COLOR = '#ec003c';
const POST_PEAK_MARKER_COLOR = '#7f1d1d';
const PEAK_MARKER_COLOR = '#db2777';
const HIGH_SEQUENCE_NUMBER_COLOR = '#be185d';
const BASELINE_NUMBER_COLOR = '#2563eb';
const TODAY_HIGHLIGHT_COLOR = '#be185d';
const SYMBOL_BORDER_FALLBACK = 'rgba(244, 114, 182, 0.35)';
const DEFAULT_TEXT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = String(dateStr).split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

const limitWords = (str = '', maxWords, fallback = '-') => {
  if (!str) return fallback;
  return String(str).split(/\s+/).slice(0, maxWords).join(' ');
};

const buildFontString = (fontSize, fontWeight = 700) =>
  `${fontWeight} ${fontSize}px ${DEFAULT_TEXT_FONT_FAMILY}`;

const splitTextLinesByWidth = (
  str = '',
  { maxWidth, maxLines = 3, fontSize, fontWeight = 700, fallback = '-', measureTextWidth }
) => {
  if (!str) return [fallback, ...Array.from({ length: Math.max(0, maxLines - 1) }, () => '')];

  const font = buildFontString(fontSize, fontWeight);
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
      const candidate = line + chars[0];
      if (textWidth(candidate) <= maxWidth || !line) {
        line = candidate;
        chars.shift();
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
        const [chunk, remainder] = splitByChars(nextToken);
        line = chunk;
        if (remainder) tokens[0] = remainder;
        else tokens.shift();
      }
      break;
    }
    lines.push(line);
  }

  if (tokens.length && lines.length) {
    const lastIndex = lines.length - 1;
    let lastLine = lines[lastIndex] || '';
    while (lastLine && textWidth(`${lastLine}...`) > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lastIndex] = lastLine ? `${lastLine}...` : '...';
  }

  while (lines.length < maxLines) lines.push('');
  return lines;
};

const parseDash = (dash) => {
  if (!dash) return [];
  if (Array.isArray(dash)) return dash;
  return String(dash)
    .split(/[ ,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const parseRgba = (color) => {
  if (!color) return null;
  const s = String(color).trim();

  // rgba(...) o rgb(...)
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] == null ? 1 : Number(m[4]),
    };
  }

  // #RRGGBB
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: 1,
    };
  }

  return null;
};

const rgbaWithAlpha = (color, alpha) => {
  const p = parseRgba(color);
  if (!p) return color; // fallback
  return `rgba(${p.r},${p.g},${p.b},${clamp01(alpha)})`;
};
const FertilityChartCanvasOverlay = ({
  chartWidth,
  chartHeight,
  scrollableContentHeight,
  padding,
  graphBottomY,
  allDataPoints,
  tempMin,
  tempMax,
  tempRange,
  getX,
  getY,
  responsiveFontSize,
  activeIndex,
  showInterpretation,
  interpretationSegments,
  shouldRenderBaseline,
  baselineY,
  baselineStartX,
  baselineEndX,
  baselineStroke,
  baselineDash,
  baselineOpacity,
  baselineWidth,
  temperatureRiseHighlightPath,
  visibleRange = null,
  textRowHeight,
  bottomRowsResponsiveFontSize = responsiveFontSize,
  rowsZoneHeight = 0,
  isFullScreen = false,
  showRelationsRow = false,
  autoLabelStep = false,
  ovulationDetails = null,
  firstHighIndex = null,
  manualModeEnabled = false,
  manualBaselineTemp = null,
  isPointEligibleForManualMode = null,
  exportMode = false,
}) => {
  const canvasRef = useRef(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const rafRef = useRef(0);
  const bandPaintCacheRef = useRef(new Map());
  const textLayoutCacheRef = useRef(new Map());

  const points = useMemo(() => allDataPoints || [], [allDataPoints]);
  const theme = useMemo(() => getCanvasTheme(), []);
  const xs = useMemo(() => points.map((_, index) => getX(index)), [points, getX]);
  const ysTemp = useMemo(
    () => points.map((point) => (Number.isFinite(point?.displayTemperature) ? getY(point.displayTemperature) : null)),
    [points, getY]
  );
  const totalPoints = points.length;
  const today = useMemo(() => startOfDay(new Date()), []);
  const measureTextWidth = useCallback((text, font) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return String(text).length * 7;
    context.save();
    context.font = font;
    const width = context.measureText(String(text)).width;
    context.restore();
    return width;
  }, []);
  const resolveCssColor = useCallback((color, fallback) => {
    if (!color || typeof window === 'undefined' || !String(color).startsWith('var(')) {
      return color || fallback;
    }
    const variableName = String(color).match(/var\(([^,)]+)/)?.[1]?.trim();
    if (!variableName) return fallback;
    return (
      window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() ||
      fallback
    );
  }, []);
  const normalizeTemp2 = useCallback((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(2));
  }, []);
  const highSequenceOrderMap = useMemo(() => {
    if (!showInterpretation || !ovulationDetails?.confirmed) return new Map();
    const preferredIndices = Array.isArray(ovulationDetails?.sequenceDisplayIndices)
      ? ovulationDetails.sequenceDisplayIndices
      : null;
    const fallbackIndices = Array.isArray(ovulationDetails?.highSequenceIndices)
      ? ovulationDetails.highSequenceIndices
      : [];
    const firstHighIdx = Number(firstHighIndex);
    const hasFirstHigh = Number.isInteger(firstHighIdx);
    const map = new Map();
    (preferredIndices ?? fallbackIndices)
      .map((value) => Number(value))
      .filter((idx) => Number.isInteger(idx) && (!hasFirstHigh || idx >= firstHighIdx))
      .forEach((idx, position) => {
        const point = points[idx];
        const calcTemperature =
          point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
        const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
        if (point && Number.isFinite(calcTemperature) && !ignoredForCalc && !map.has(idx)) {
          map.set(idx, position + 1);
        }
      });
    return map;
  }, [firstHighIndex, ovulationDetails, points, showInterpretation]);
  const baselineOrderMap = useMemo(() => {
    if (!showInterpretation || !ovulationDetails?.confirmed) return new Map();
    const firstHighIdx = Number(firstHighIndex);
    if (!Number.isInteger(firstHighIdx)) return new Map();
    const map = new Map();
    let order = 1;
    for (let idx = firstHighIdx - 1; idx >= 0 && order <= 6; idx -= 1) {
      const point = points[idx];
      const calcTemperature =
        point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
      const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
      if (point && Number.isFinite(calcTemperature) && !ignoredForCalc) {
        map.set(idx, order);
        order += 1;
      }
    }
    return map;
  }, [firstHighIndex, ovulationDetails?.confirmed, points, showInterpretation]);
  const contentHeight =
  Number.isFinite(scrollableContentHeight) && scrollableContentHeight > 0
    ? scrollableContentHeight
    : chartHeight;
  const syncCanvasSize = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const width = Math.max(1, chartWidth || 1);
  const height = Math.max(1, contentHeight || 1);
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

  if (
    canvas.width !== Math.floor(width * dpr) ||
    canvas.height !== Math.floor(height * dpr)
  ) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  setDevicePixelRatio((prev) => (prev === dpr ? prev : dpr));
}, [chartWidth, contentHeight]);

  const draw = useCallback(() => {
    syncCanvasSize();
    const canvas = canvasRef.current;
    if (!canvas || !chartWidth) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(devicePixelRatio || 1, 3));
    const contentW = chartWidth;
    const snap = (value) => Math.round(value * dpr) / dpr;

    const areaW = chartWidth - padding.left - padding.right;
    const areaH = Math.max(graphBottomY - padding.top, 0);
    if (chartWidth <= 0 || contentHeight <= 0 || areaW <= 0 || areaH <= 0) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentW, contentHeight);

    const areaX = padding.left;
    const areaY = padding.top;
    const rowsContentHeight = Math.max(contentHeight - graphBottomY, 0);

    // Background card + rows zone
    ctx.fillStyle = theme.background.chartArea;
    ctx.fillRect(areaX, areaY, areaW, areaH);
    ctx.fillStyle = theme.background.rowsArea;
    ctx.fillRect(areaX, graphBottomY, areaW, rowsContentHeight);

    // Temperature horizontal grid
    const ticks = [];
    const tickIncrement = tempRange > 0 && tempRange <= 2.5 ? 0.1 : 0.5;
    const from = tempRange > 0 ? tempMin : 35.8;
    const to = tempRange > 0 ? tempMax : 37.2;
    for (let t = from; t <= to + 1e-9; t += tickIncrement) ticks.push(Number(t.toFixed(1)));

    ticks.forEach((temp) => {
      const y = getY(temp);
      const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
      const snappedY = snap(y);
      ctx.beginPath();
      ctx.moveTo(snap(areaX), snappedY);
      ctx.lineTo(snap(chartWidth - padding.right), snappedY);
      ctx.strokeStyle = isMajor ? theme.grid.horizontalMajor : theme.grid.horizontalMinor;
      ctx.lineWidth = isMajor ? 1.2 : 1.3;
      ctx.setLineDash(isMajor ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

    });

    const rangeStart = Number.isInteger(visibleRange?.startIndex) ? visibleRange.startIndex : 0;
    const rangeEnd = Number.isInteger(visibleRange?.endIndex)
      ? visibleRange.endIndex
      : Math.max(points.length - 1, 0);
    const startIndex = points.length ? Math.max(0, Math.min(points.length - 1, rangeStart)) : 0;
    const endIndex = points.length ? Math.max(startIndex, Math.min(points.length - 1, rangeEnd)) : -1;

    // Vertical grid limited to visible range
    for (let i = startIndex; i <= endIndex; i += 1) {
      const x = xs[i];
      if (!Number.isFinite(x)) continue;
      ctx.beginPath();
      const snappedX = snap(x);
      ctx.moveTo(snappedX, snap(padding.top));
      ctx.lineTo(snappedX, snap(graphBottomY));
      ctx.strokeStyle = theme.grid.vertical;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Interpretation band backgrounds (premium gradient + subtle gloss)
if (showInterpretation && Array.isArray(interpretationSegments)) {
  const bandH = Math.max(areaH * 0.5, 0);
  if (bandH > 0) {
    const bandY = graphBottomY - bandH;

    const getKey = (kind) => `${kind}:${Math.round(bandY * dpr)}:${Math.round(bandH * dpr)}:${dpr}`;

    const resolveBaseColor = (segment) => {
      if (segment.phase === 'fertile') return theme.interpretation.fertile;
      if (segment.phase === 'relativeInfertile') return theme.interpretation.relativeInfertile;
      if (segment.phase === 'postOvulatory' && segment.status === 'absolute') return theme.interpretation.postOvulatoryAbsolute;
      if (segment.phase === 'postOvulatory') return theme.interpretation.postOvulatory;
      return theme.interpretation.default;
    };

    const getPaint = (kind, baseColor) => {
      const key = getKey(kind);
      const cached = bandPaintCacheRef.current.get(key);
      if (cached) return cached;

      // intenta respetar el alpha del rgba original
      const parsed = parseRgba(baseColor);
      const baseA = parsed ? clamp01(parsed.a) : 0.22;

      // gradiente principal
      const g = ctx.createLinearGradient(0, bandY, 0, graphBottomY);
      g.addColorStop(0.0, rgbaWithAlpha(baseColor, baseA * 0.08));  // casi nada arriba
      g.addColorStop(0.55, rgbaWithAlpha(baseColor, baseA * 0.55)); // medio
      g.addColorStop(1.0, rgbaWithAlpha(baseColor, baseA));         // abajo como ahora

      // gloss (muy sutil)
      const gloss = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
      gloss.addColorStop(0.0, 'rgba(255,255,255,0.18)');
      gloss.addColorStop(0.35, 'rgba(255,255,255,0.06)');
      gloss.addColorStop(1.0, 'rgba(255,255,255,0.0)');

      const out = { fill: g, gloss };
      bandPaintCacheRef.current.set(key, out);
      return out;
    };

    interpretationSegments.forEach((segment) => {
      const x = segment?.bounds?.x;
      const w = segment?.bounds?.width;
      if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 0) return;

      const base = resolveBaseColor(segment);
      const kind =
        segment.phase === 'postOvulatory'
          ? (segment.status === 'absolute' ? 'postAbs' : 'post')
          : segment.phase || 'default';

      const paint = getPaint(kind, base);

      const sx = snap(x);
      const sy = snap(bandY);
      const sw = snap(w);
      const sh = snap(bandH);

      ctx.fillStyle = paint.fill;
      ctx.fillRect(sx, sy, sw, sh);

      ctx.fillStyle = paint.gloss;
      ctx.fillRect(sx, sy, sw, sh);
    });
  }
}

    // Baseline
    if (showInterpretation && shouldRenderBaseline && Number.isFinite(baselineY)) {
      ctx.save();
      ctx.setLineDash(parseDash(baselineDash));
      ctx.strokeStyle = baselineStroke || theme.baseline.defaultStroke;
      ctx.globalAlpha = baselineOpacity ?? 1;
      ctx.lineWidth = baselineWidth || 3;
      ctx.beginPath();
      ctx.moveTo(baselineStartX, baselineY);
      ctx.lineTo(baselineEndX, baselineY);
      ctx.stroke();
      ctx.restore();
    }
    const isWithinTemperaturePlotArea = (y) =>
      Number.isFinite(y) && y >= padding.top && y <= graphBottomY;

    // Temperature line and halo
    // Gradient stroke for the temperature line (SVG-like look, still cheap in canvas)
    const tempLineStroke = (() => {
      const stops = theme.svg?.temperatureGradient;
      if (!Array.isArray(stops) || stops.length < 3) return theme.temperature.line;
      const left = padding.left;
      const right = chartWidth - padding.right;
      const g = ctx.createLinearGradient(left, 0, right, 0);
      g.addColorStop(0, stops[0]);
      g.addColorStop(0.5, stops[1]);
      g.addColorStop(1, stops[2]);
      return g;
    })();
    const drawPath = (lineWidth, strokeStyle, alpha = 1) => {
      let started = false;
      let prevValidIndex = null;
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i += 1) {
        const y = ysTemp[i];
        const p = points[i];
        if (!isWithinTemperaturePlotArea(y) || p?.ignored) {
          started = false;
          continue;
        }
        const x = xs[i];
        const snappedX = snap(x);
        const snappedY = snap(y);
        if (!started) {
          ctx.moveTo(snappedX, snappedY);
          started = true;
        } else {
          if (prevValidIndex != null && i === prevValidIndex + 1) {
            ctx.lineTo(snappedX, snappedY);
          } else {
            ctx.moveTo(snappedX, snappedY);
          }
        }
        prevValidIndex = i;
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (theme.temperature.haloWidth > 0) {
      drawPath(theme.temperature.haloWidth, theme.temperature.halo, 1);
    }
    drawPath(theme.temperature.lineWidth, tempLineStroke, 1);

    let prevValidIndex = null;
    for (let i = startIndex; i <= endIndex; i += 1) {
      const y = ysTemp[i];
      const p = points[i];
      if (!isWithinTemperaturePlotArea(y) || p?.ignored) continue;
      if (prevValidIndex != null && i > prevValidIndex + 1) {
        const prevY = ysTemp[prevValidIndex];
        if (Number.isFinite(prevY)) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(snap(xs[prevValidIndex]), snap(prevY));
          ctx.lineTo(snap(xs[i]), snap(y));
          ctx.strokeStyle = theme.temperature.gapStroke;
          ctx.setLineDash(theme.temperature.gapDash);
          ctx.lineWidth = theme.temperature.gapWidth;
          ctx.globalAlpha = 0.8;
          ctx.stroke();
          ctx.restore();
        }
      }
      prevValidIndex = i;
    }

    // temperatureRiseHighlightPath
    if (temperatureRiseHighlightPath) {
      const numbers = temperatureRiseHighlightPath.match(/-?\d*\.?\d+/g)?.map(Number) || [];
      if (numbers.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(numbers[0], numbers[1]);
        for (let i = 2; i < numbers.length; i += 2) ctx.lineTo(numbers[i], numbers[i + 1]);
        ctx.strokeStyle = theme.highlight.risePath;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Points
    for (let i = startIndex; i <= endIndex; i += 1) {
      const p = points[i];
      const y = ysTemp[i];
      if (!p || !Number.isFinite(y)) continue;
      const x = xs[i];
      const rawTemp = p.temperature_raw;
      const correctedTemp = p.temperature_corrected;
      const showCorrection =
  p.use_corrected &&
  rawTemp != null &&
  correctedTemp != null &&
  Math.abs(correctedTemp - rawTemp) > 0.01;

const rawY = showCorrection ? getY(rawTemp) : null;
const clampedRawY = Number.isFinite(rawY)
  ? Math.min(graphBottomY, Math.max(padding.top, rawY))
  : null;

const isCorrectedDisplayed =
  p.use_corrected &&
  correctedTemp != null &&
  p.displayTemperature === correctedTemp;

const isIgnoredForDisplay =
  p.ignored || (p.use_corrected && !isCorrectedDisplayed);

const shouldDrawCorrectionLine =
  showCorrection &&
  isWithinTemperaturePlotArea(y) &&
  Number.isFinite(clampedRawY) &&
  clampedRawY !== y;

const shouldDrawRawDiscardedPoint =
  showCorrection &&
  isWithinTemperaturePlotArea(rawY);

if (shouldDrawCorrectionLine) {
  ctx.beginPath();
  ctx.moveTo(x, clampedRawY);
  ctx.lineTo(x, y);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = theme.points.correctionLine;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

if (shouldDrawRawDiscardedPoint) {
  ctx.beginPath();
  ctx.arc(x, rawY, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = theme.points.discardedFill ?? theme.points.ignoredFill;
  ctx.fill();
  ctx.strokeStyle = theme.points.discardedStroke ?? theme.points.ignoredStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

      if (isWithinTemperaturePlotArea(y)) {
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = isIgnoredForDisplay ? theme.points.ignoredFill : theme.points.fill;
        ctx.fill();
        ctx.strokeStyle = isIgnoredForDisplay ? theme.points.ignoredStroke : theme.points.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const rowLineHeight = bottomRowsResponsiveFontSize(0.95);
    const obsRowIndex = isFullScreen ? 9 : 7.5;
    const halfBlock = isFullScreen ? 1 : 0.75;
    const exportExtraRows = exportMode ? 6 : 0;
    const baseRowCount = obsRowIndex + halfBlock + exportExtraRows;
    const autoRowH = Math.max(1, Math.floor((rowsZoneHeight || 0) / baseRowCount));
    const rowH = Math.max(textRowHeight || 1, autoRowH);
    const rowsTopY = graphBottomY;
    const dateRowY = rowsTopY + rowH * 1;
    const cycleDayRowY = rowsTopY + rowH * 2;
    const symbolRowYBase = rowsTopY + rowH * 3;
    const exportTextBlockHeight = rowLineHeight * 3;
    const exportSensationBlockTop = rowsTopY + rowH * (isFullScreen ? 4 : 3.5);
    const exportAppearanceBlockTop = exportSensationBlockTop + exportTextBlockHeight;
    const exportObservationBlockTop = exportAppearanceBlockTop + exportTextBlockHeight;
    const mucusSensationRowY = exportMode
      ? exportSensationBlockTop + exportTextBlockHeight / 2
      : rowsTopY + rowH * (isFullScreen ? 5 : 4.5);
    const mucusAppearanceRowY = exportMode
      ? exportAppearanceBlockTop + exportTextBlockHeight / 2
      : rowsTopY + rowH * (isFullScreen ? 7 : 6);
    const observationsRowY = exportMode
      ? exportObservationBlockTop + exportTextBlockHeight / 2
      : rowsTopY + rowH * (isFullScreen ? 9 : 7.5);
    const relationsRowY = showRelationsRow
      ? (exportMode
        ? exportObservationBlockTop + exportTextBlockHeight + rowH
        : observationsRowY + rowH * (isFullScreen ? 2 : 1.5))
      : null;
    const rowWidth = chartWidth - padding.left - padding.right;
    const cellWidth = totalPoints > 0 ? rowWidth / totalPoints : rowWidth;
    const cellTextPadding = Math.min(12, Math.max(4, cellWidth * 0.12));
    const availableTextWidth = Math.max(0, cellWidth - cellTextPadding * 2);
    const baseSensationFontSize = bottomRowsResponsiveFontSize(0.9);
    const baseAppearanceFontSize = bottomRowsResponsiveFontSize(0.9);
    const baseObservationFontSize = bottomRowsResponsiveFontSize(0.9);
    const smallSensationFontSize = bottomRowsResponsiveFontSize(0.8);
    const smallAppearanceFontSize = bottomRowsResponsiveFontSize(0.8);
    const smallObservationFontSize = bottomRowsResponsiveFontSize(0.8);
    const labelStep = (() => {
      if (!autoLabelStep || totalPoints < 2) return 1;
      const dayWidth = Math.abs((xs[1] ?? 0) - (xs[0] ?? 0));
      if (!Number.isFinite(dayWidth) || dayWidth <= 0) return 1;
      const samplePoint = points.find((entry) => entry?.date || entry?.cycleDay != null) ?? {};
      const sampleDate = compactDate(samplePoint?.date || '00/00');
      const sampleDay = String(samplePoint?.cycleDay ?? totalPoints ?? '');
      const dateFontSize = responsiveFontSize(1.05);
      const dayFontSize = responsiveFontSize(1);
      const minLabelWidth = Math.max(
        measureTextWidth(sampleDate, buildFontString(dateFontSize, 900)),
        measureTextWidth(sampleDay, buildFontString(dayFontSize, 900))
      ) + responsiveFontSize(0.8);
      return Math.max(1, Math.ceil(minLabelWidth / dayWidth));
    })();
    const drawText = ({
      text,
      x,
      y,
      fontSize,
      weight = 700,
      color = '#64748b',
      align = 'center',
      baseline = 'middle',
      stroke = null,
      strokeWidth = 0,
    }) => {
      if (text == null || text === '') return;
      ctx.save();
      ctx.font = buildFontString(fontSize, weight);
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      if (stroke && strokeWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(String(text), x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(String(text), x, y);
      ctx.restore();
    };
    const drawRoundedRect = (x, y, width, height, radius) => {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    };
    const drawPeakCross = (x, y, arm, strokeWidth, outlineWidth) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.96)';
      ctx.lineWidth = outlineWidth;
      ctx.beginPath();
      ctx.moveTo(x - arm, y - arm);
      ctx.lineTo(x + arm, y + arm);
      ctx.moveTo(x + arm, y - arm);
      ctx.lineTo(x - arm, y + arm);
      ctx.stroke();
      ctx.strokeStyle = PEAK_MARKER_COLOR;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(x - arm, y - arm);
      ctx.lineTo(x + arm, y + arm);
      ctx.moveTo(x + arm, y - arm);
      ctx.lineTo(x - arm, y + arm);
      ctx.stroke();
      ctx.restore();
    };
    const drawHeart = (x, y, size) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 24, size / 24);
      ctx.beginPath();
      ctx.moveTo(12, 21);
      ctx.bezierCurveTo(8, 17.5, 3, 14.5, 3, 9);
      ctx.bezierCurveTo(3, 5.8, 5.5, 4, 8.1, 4);
      ctx.bezierCurveTo(9.8, 4, 11.1, 4.9, 12, 6.1);
      ctx.bezierCurveTo(12.9, 4.9, 14.2, 4, 15.9, 4);
      ctx.bezierCurveTo(18.5, 4, 21, 5.8, 21, 9);
      ctx.bezierCurveTo(21, 14.5, 16, 17.5, 12, 21);
      ctx.closePath();
      ctx.fillStyle = HEART_COLOR;
      ctx.fill();
      ctx.restore();
    };
    const getCachedLines = (cacheKey, text, fallback, baseFontSize, smallFontSize) => {
      const existing = textLayoutCacheRef.current.get(cacheKey);
      if (existing) return existing;
      const base = splitTextLinesByWidth(text, {
        maxWidth: availableTextWidth,
        maxLines: 3,
        fontSize: baseFontSize,
        fallback,
        measureTextWidth,
      });
      const lines = base[2]
        ? splitTextLinesByWidth(text, {
            maxWidth: availableTextWidth,
            maxLines: 3,
            fontSize: smallFontSize,
            fallback,
            measureTextWidth,
          })
        : base;
      const resolved = { lines, fontSize: base[2] ? smallFontSize : baseFontSize };
      textLayoutCacheRef.current.set(cacheKey, resolved);
      return resolved;
    };
    const countLines = (lines) =>
      Math.max(1, lines.filter((value) => value && String(value).trim() !== '').length);
    const centeredY = (baseY, lines) => baseY - ((lines - 1) * rowLineHeight) / 2;
    const centeredYInBlock = (blockTop, lines) => {
      const usedHeight = lines * rowLineHeight;
      return blockTop + Math.max(0, (exportTextBlockHeight - usedHeight) / 2) + rowLineHeight * 0.5;
    };
    const sensationColor = resolveCssColor(SENSATION_COLOR, '#0ea5e9');
    const appearanceColor = resolveCssColor(APPEARANCE_COLOR, '#10b981');
    const observationColor = resolveCssColor(OBSERVATION_COLOR, '#8b5cf6');

    for (let i = startIndex; i <= endIndex; i += 1) {
      const point = points[i];
      if (!point) continue;
      const x = xs[i];
      if (!Number.isFinite(x)) continue;
      const y = ysTemp[i];
      const hasTemp = point.displayTemperature != null;
      const correctedTemp = point.temperature_corrected;
      const isCorrectedDisplayed =
        point.use_corrected && correctedTemp != null && point.displayTemperature === correctedTemp;
      const isIgnoredForDisplay =
        point.ignored || (point.use_corrected && !isCorrectedDisplayed);
      const shouldConsiderForManualMode = typeof isPointEligibleForManualMode === 'function'
        ? isPointEligibleForManualMode(point, i)
        : true;
      const matchesManualBaseline =
        manualModeEnabled &&
        shouldConsiderForManualMode &&
        Number.isFinite(manualBaselineTemp) &&
        Number.isFinite(point?.displayTemperature) &&
        normalizeTemp2(point.displayTemperature) === normalizeTemp2(manualBaselineTemp);

      if (matchesManualBaseline && isWithinTemperaturePlotArea(y)) {
        ctx.beginPath();
        ctx.arc(x, y, 6.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124, 58, 237, 0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 58, 237, 0.38)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      const hasHighOrder = highSequenceOrderMap.has(i);
      const hasBaselineOrder = baselineOrderMap.has(i);
      if (showInterpretation && hasTemp && !isIgnoredForDisplay && Number.isFinite(y)) {
        const numberFontSize = responsiveFontSize(isFullScreen ? 0.75 : 1.2);
        const numberStrokeWidth = Math.max(0.5, numberFontSize * 0.18);
        if (hasHighOrder) {
          drawText({
            text: highSequenceOrderMap.get(i),
            x,
            y: y - numberFontSize * (isFullScreen ? 2.6 : 1.8),
            fontSize: numberFontSize,
            weight: 900,
            color: HIGH_SEQUENCE_NUMBER_COLOR,
            stroke: '#fff',
            strokeWidth: numberStrokeWidth,
          });
        }
        if (hasBaselineOrder) {
          drawText({
            text: baselineOrderMap.get(i),
            x,
            y: y + numberFontSize * (isFullScreen ? 1.9 : 1.6),
            fontSize: numberFontSize,
            weight: 800,
            color: BASELINE_NUMBER_COLOR,
            stroke: '#fff',
            strokeWidth: numberStrokeWidth,
          });
        }
      }

      const isFuture = point.isoDate
        ? isAfter(startOfDay(parseISO(point.isoDate)), today)
        : false;
      const isTodayPoint = point.isoDate ? isSameDay(parseISO(point.isoDate), today) : false;
      const textFill = isTodayPoint ? TODAY_HIGHLIGHT_COLOR : '#60666f';
      const shouldRenderXLabel = !autoLabelStep || i % labelStep === 0 || i === totalPoints - 1;
      if (shouldRenderXLabel) {
        drawText({
          text: compactDate(point.date),
          x,
          y: dateRowY,
          fontSize: responsiveFontSize(1.05),
          weight: 900,
          color: textFill,
          baseline: 'alphabetic',
        });
        drawText({
          text: point.cycleDay,
          x,
          y: cycleDayRowY,
          fontSize: responsiveFontSize(1),
          weight: 900,
          color: textFill,
          baseline: 'alphabetic',
        });
      }

      const symbolInfo = getSymbolAppearance(point.fertility_symbol);
      const symbolPalette = getSymbolColorPalette(symbolInfo.value);
      const isPlaceholder = String(point.id || '').startsWith('placeholder-');
      const shouldRenderSymbol = !isPlaceholder && symbolInfo.value !== 'none';
      const peakStatus = point.peakStatus ? String(point.peakStatus).toUpperCase() : null;
      const isPeakMarker = peakStatus === 'P' || peakStatus === 'X';
      const isPostPeakMarker = peakStatus && !isPeakMarker;
      const isPeakSeriesDay = isPeakMarker || ['1', '2', '3'].includes(peakStatus);
      const peakDisplay = peakStatus || '-';
      const symbolRectSize = responsiveFontSize(isFullScreen ? 1.8 : 2);
      const symbolX = x - symbolRectSize / 2 - 4;
      const symbolY = symbolRowYBase - symbolRectSize * 0.75;
      const symbolW = symbolRectSize * 1.4;
      const symbolH = symbolRectSize;
      const symbolTextY = symbolY + symbolH / 2 + 2;
      const peakCenterY = symbolRowYBase - symbolRectSize * 0.25;
      if (shouldRenderSymbol) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        drawRoundedRect(x - symbolRectSize / 2 + 1, symbolY + 1, symbolRectSize, symbolH, symbolRectSize * 0.25);
        ctx.fill();
        drawRoundedRect(symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
        if (symbolInfo.pattern === 'spotting-pattern') {
          ctx.fillStyle = symbolPalette.main;
          ctx.fill();
          ctx.save();
          drawRoundedRect(symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
          ctx.clip();
          const patternStep = 6;
          const dotRadius = 1.5;
          const startX = symbolX + 3;
          const startY = symbolY + 3;
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          for (let dotY = startY; dotY <= symbolY + symbolH + dotRadius; dotY += patternStep) {
            for (let dotX = startX; dotX <= symbolX + symbolW + dotRadius; dotX += patternStep) {
              ctx.beginPath();
              ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        } else {
          ctx.fillStyle = symbolPalette.main;
          ctx.fill();
        }
        const strokeColor = symbolPalette.border === 'none'
          ? null
          : (symbolPalette.border || SYMBOL_BORDER_FALLBACK);
        if (strokeColor) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = symbolInfo.value === 'white' ? 1.6 : 1;
          ctx.stroke();
        }
        ctx.restore();
        if (peakStatus) {
          if (isPeakMarker) {
            drawPeakCross(x, peakCenterY, 4, 2, 4);
          } else {
            drawText({
              text: peakStatus,
              x,
              y: symbolTextY,
              fontSize: responsiveFontSize(1.1),
              weight: 800,
              color: POST_PEAK_MARKER_COLOR,
            });
          }
        }
      } else {
        if (isPeakSeriesDay) {
          ctx.save();
          drawRoundedRect(symbolX, symbolY, symbolW, symbolH, symbolRectSize * 0.2);
          ctx.strokeStyle = isPeakMarker ? PEAK_MARKER_COLOR : POST_PEAK_MARKER_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
        if (isPeakMarker) {
          drawPeakCross(x, peakCenterY, 4, 2, 4);
        } else {
          drawText({
            text: peakDisplay,
            x,
            y: symbolTextY,
            fontSize: responsiveFontSize(isPostPeakMarker ? 1.1 : 1),
            weight: isPostPeakMarker ? 800 : 500,
            color: isPostPeakMarker ? POST_PEAK_MARKER_COLOR : '#60666f',
          });
        }
      }

      const sensText = exportMode
        ? (point.mucus_sensation ?? '')
        : isFullScreen
          ? limitWords(point.mucus_sensation, 2, isFuture ? '' : '-')
          : point.mucus_sensation;
      const aparText = exportMode
        ? (point.mucus_appearance ?? '')
        : isFullScreen
          ? limitWords(point.mucus_appearance, 2, isFuture ? '' : '-')
          : point.mucus_appearance;
      const obsText = exportMode
        ? (point.observations ?? '')
        : isFullScreen
          ? limitWords(point.observations, 2, '')
          : point.observations;
      const pointKey = `${point.isoDate || point.id || i}`;
      const sensRes = getCachedLines(
        `${pointKey}-sens-${availableTextWidth}-${baseSensationFontSize}-${smallSensationFontSize}-${sensText ?? ''}`,
        sensText,
        isFuture ? '' : '-',
        baseSensationFontSize,
        smallSensationFontSize
      );
      const aparRes = getCachedLines(
        `${pointKey}-apar-${availableTextWidth}-${baseAppearanceFontSize}-${smallAppearanceFontSize}-${aparText ?? ''}`,
        aparText,
        isFuture ? '' : '-',
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
      const drawMultiline = (lines, xValue, yValue, fontSize, color) => {
        lines.forEach((line, offset) => {
          if (!line) return;
          drawText({
            text: line,
            x: xValue,
            y: yValue + offset * rowLineHeight,
            fontSize,
            weight: 700,
            color,
          });
        });
      };
      const sensY = exportMode
        ? centeredYInBlock(exportSensationBlockTop, countLines(sensRes.lines))
        : centeredY(mucusSensationRowY, countLines(sensRes.lines));
      const aparY = exportMode
        ? centeredYInBlock(exportAppearanceBlockTop, countLines(aparRes.lines))
        : centeredY(mucusAppearanceRowY, countLines(aparRes.lines));
      const obsY = exportMode
        ? centeredYInBlock(exportObservationBlockTop, countLines(obsRes.lines))
        : centeredY(observationsRowY, countLines(obsRes.lines));
      drawMultiline(sensRes.lines, x, sensY, sensRes.fontSize, sensationColor);
      drawMultiline(aparRes.lines, x, aparY, aparRes.fontSize, appearanceColor);
      drawMultiline(obsRes.lines, x, obsY, obsRes.fontSize, observationColor);

      const hasRelations = Boolean(point.had_relations ?? point.hadRelations);
      if (showRelationsRow && relationsRowY != null && hasRelations) {
        const rowBlockHeight = rowH * (isFullScreen ? 2 : 1.5);
        const relationsHeartSize = Math.min(Math.max(rowBlockHeight * 0.46, 14), 18);
        drawHeart(x - relationsHeartSize / 2, relationsRowY - relationsHeartSize / 2, relationsHeartSize);
      }
    }

    // Active highlight
    if (activeIndex != null && Number.isFinite(xs[activeIndex])) {
      const highlightX = xs[activeIndex];
      const prevX = activeIndex > 0 ? xs[activeIndex - 1] : highlightX;
      const nextX = activeIndex < points.length - 1 ? xs[activeIndex + 1] : highlightX;
      const fallbackDayWidth = Math.max((chartWidth - padding.left - padding.right) / Math.max(points.length, 1), 0);
      const dayWidth = Math.max(((nextX - prevX) || fallbackDayWidth), fallbackDayWidth, 0);
      const thinStrokeWidth = Math.max(3, Math.min(14, dayWidth * 0.4));
      const thickStrokeWidth = Math.max(thinStrokeWidth * 2, responsiveFontSize(0.85));
      ctx.beginPath();
      const snappedHighlightX = snap(highlightX);
      ctx.moveTo(snappedHighlightX, snap(padding.top));
      ctx.lineTo(snappedHighlightX, snap(graphBottomY));
      ctx.strokeStyle = theme.highlight.activeColumn;
      ctx.lineWidth = thinStrokeWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(snappedHighlightX, snap(graphBottomY));
      ctx.lineTo(snappedHighlightX, snap(contentHeight));
      ctx.lineWidth = thickStrokeWidth;
      ctx.stroke();
    }

    const DEBUG = typeof window !== 'undefined' && window.__CHART_CANVAS_DEBUG__;
    if (DEBUG) {
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.font = '11px monospace';
      ctx.fillText(`canvas ${contentW}x${contentHeight}`, 8, 14);
      ctx.fillText(`chartH ${chartHeight} contentH ${contentHeight} graphBottomY ${graphBottomY}`, 8, 28);
      ctx.beginPath();
      ctx.moveTo(0, graphBottomY);
      ctx.lineTo(contentW, graphBottomY);
      ctx.strokeStyle = 'rgba(220,38,38,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [
  activeIndex,
  baselineDash,
  baselineEndX,
  baselineOpacity,
  baselineStartX,
  baselineStroke,
  baselineWidth,
  baselineY,
  baselineOrderMap,
  bottomRowsResponsiveFontSize,
  chartWidth,
  contentHeight,
  devicePixelRatio,
  exportMode,
  firstHighIndex,
  getY,
  graphBottomY,
  highSequenceOrderMap,
  isFullScreen,
  isPointEligibleForManualMode,
  manualBaselineTemp,
  manualModeEnabled,
  measureTextWidth,
  interpretationSegments,
  normalizeTemp2,
  padding,
  points,
  responsiveFontSize,
  resolveCssColor,
  rowsZoneHeight,
  theme,
  shouldRenderBaseline,
  showInterpretation,
  showRelationsRow,
  syncCanvasSize,
  tempMax,
  tempMin,
  tempRange,
  textRowHeight,
  temperatureRiseHighlightPath,
  today,
  totalPoints,
  visibleRange,
  xs,
  ysTemp,
]);

  useEffect(() => {
  if (typeof window === 'undefined') return undefined;

  syncCanvasSize();

  const onResize = () => syncCanvasSize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, [syncCanvasSize]);

useEffect(() => {
  textLayoutCacheRef.current.clear();
}, [
  chartWidth,
  textRowHeight,
  rowsZoneHeight,
  isFullScreen,
  exportMode,
  showRelationsRow,
  bottomRowsResponsiveFontSize,
]);

useEffect(() => {
  if (rafRef.current) cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(draw);

  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, [draw]);


  return (
  <canvas
    ref={canvasRef}
    style={{
      position: 'absolute',
      inset: 0,
      display: 'block',
      zIndex: 0,
      // canvas overlay solo render, interacción en SVG para evitar problemas de precisión en eventos pointer con zoom o pantallas de alta densidad
      pointerEvents: 'none',
    }}
    width={Math.max(1, Math.floor(chartWidth * devicePixelRatio))}
    height={Math.max(1, Math.floor(contentHeight * devicePixelRatio))}
    data-chart-canvas-overlay="true"
    aria-hidden="true"
  />
);
};

export default FertilityChartCanvasOverlay;
