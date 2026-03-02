import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { isAfter, parseISO, startOfDay } from 'date-fns';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';

const SENSATION_COLOR = 'var(--color-sensacion-fuerte)';
const APPEARANCE_COLOR = 'var(--color-apariencia-fuerte)';
const OBSERVATION_COLOR = 'var(--color-observaciones-fuerte)';
const DEFAULT_TEXT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const limitWords = (str = '', maxWords, fallback = '–') => {
  if (!str) return fallback;
  return str.split(/\s+/).slice(0, maxWords).join(' ');
};

const splitTextLinesByWidth = (ctx, str = '', { maxWidth, maxLines = 3, fontSize, fallback = '–' }) => {
  if (!str) return [fallback, ...Array.from({ length: Math.max(0, maxLines - 1) }, () => '')];
  const normalized = String(str).trim();
  const hasSpaces = /\s/.test(normalized);
  const tokens = hasSpaces ? normalized.split(/\s+/) : Array.from(normalized);
  const sep = hasSpaces ? ' ' : '';
  const lines = [];
  const textWidth = (text) => ctx.measureText(text).width;

  while (tokens.length && lines.length < maxLines) {
    let line = '';
    while (tokens.length) {
      const next = tokens[0];
      const candidate = line ? `${line}${sep}${next}` : next;
      if (textWidth(candidate) <= maxWidth || !line) {
        line = candidate;
        tokens.shift();
      } else {
        break;
      }
    }
    lines.push(line);
  }

  if (tokens.length && lines.length) {
    let last = lines[lines.length - 1] || '';
    while (last && textWidth(`${last}…`) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last ? `${last}…` : '…';
  }
  while (lines.length < maxLines) lines.push('');
  return lines;
};

const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = String(dateStr).split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

const getLabelStep = ({ totalPoints, getX, responsiveFontSize, data, ctx }) => {
  if (totalPoints < 2 || !ctx) return 1;
  const dayWidth = Math.abs(getX(1) - getX(0));
  if (!Number.isFinite(dayWidth) || dayWidth <= 0) return 1;
  const samplePoint = data?.find((entry) => entry?.date || entry?.cycleDay != null) ?? {};
  const sampleDate = compactDate(samplePoint?.date || '00/00');
  const sampleDay = String(samplePoint?.cycleDay ?? totalPoints ?? '');
  ctx.font = `900 ${responsiveFontSize(1.05)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const dateWidth = ctx.measureText(sampleDate).width;
  ctx.font = `900 ${responsiveFontSize(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const dayWidthText = ctx.measureText(sampleDay).width;
  const minLabelWidth = Math.max(dateWidth, dayWidthText) + responsiveFontSize(0.8);
  return Math.max(1, Math.ceil(minLabelWidth / dayWidth));
};

// Helper: rounded rect compatible (sin depender de ctx.roundRect)
const buildRoundRectPath = (ctx, x, y, w, h, r) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};
const FertilityChartCanvas = ({
  chartRef,
  chartWidth,
  chartHeight,
  scrollableContentHeight,
  padding,
  graphBottomY,
  rowsZoneHeight,
  textRowHeight,
  allDataPoints = [],
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
  todayIndex,
  handlePointInteraction,
  isRotatedForInput,
  isFullScreen = false,
  showRelationsRow = false,
  isScrolling = false,
  showLeftLegend = false,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const xsRef = useRef([]);
  const ysTempRef = useRef([]);
  const visibleRef = useRef({ start: 0, end: -1 });
  const canvasSizeRef = useRef({ viewportW: 0, viewportH: 0, dpr: 0 });
  const pointerStateRef = useRef(null);
  const textLayoutCacheRef = useRef(new Map());
  const spottingPatternRef = useRef(null); 

  useEffect(() => {
    xsRef.current = allDataPoints.map((_, i) => getX(i));
  }, [allDataPoints, getX]);

  useEffect(() => {
    ysTempRef.current = allDataPoints.map((point) => {
      const temp = point?.displayTemperature;
      return Number.isFinite(temp) ? getY(temp) : null;
    });
  }, [allDataPoints, getY, tempMin, tempMax]);

  const tempTicks = useMemo(() => {
    const ticks = [];
    if (tempRange > 0) {
      const inc = tempRange <= 2.5 ? 0.1 : 0.5;
      for (let t = tempMin; t <= tempMax + 1e-9; t += inc) ticks.push(Number(t.toFixed(1)));
      return ticks;
    }
    for (let t = 35.8; t <= 37.2 + 1e-9; t += 0.1) ticks.push(Number(t.toFixed(1)));
    return ticks;
  }, [tempMin, tempMax, tempRange]);

  const findRange = useCallback((scrollLeft, viewportW) => {
    const xs = xsRef.current;
    if (!xs.length) return { start: 0, end: -1 };
    const overscan = viewportW * 1.5;
    const minX = scrollLeft - overscan;
    const maxX = scrollLeft + viewportW + overscan;

    let lo = 0;
    let hi = xs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < minX) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - 1);

    lo = 0;
    hi = xs.length - 1;
    while (lo < hi) {
      const mid = ((lo + hi) >> 1) + 1;
      if (xs[mid] > maxX) hi = mid - 1;
      else lo = mid;
    }
    const end = Math.min(xs.length - 1, lo + 1);
    return { start, end };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = chartRef.current;
    if (!canvas || !scroller) return;

    const viewportW = scroller.clientWidth;
    const viewportH = scroller.clientHeight;
    const scrollLeft = scroller.scrollLeft;
    const scrollTop = scroller.scrollTop;
    const dpr = window.devicePixelRatio || 1;

    const prev = canvasSizeRef.current;
    if (prev.viewportW !== viewportW || prev.viewportH !== viewportH || prev.dpr !== dpr) {
      canvas.width = Math.floor(viewportW * dpr);
      canvas.height = Math.floor(viewportH * dpr);
      canvas.style.width = `${viewportW}px`;
      canvas.style.height = `${viewportH}px`;
      canvasSizeRef.current = { viewportW, viewportH, dpr };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);

    visibleRef.current = findRange(scrollLeft, viewportW);
    const { start, end } = visibleRef.current;

    ctx.save();
    ctx.translate(-scrollLeft, -scrollTop);
    ctx.beginPath();
    ctx.rect(scrollLeft, scrollTop, viewportW, viewportH);
    ctx.clip();

    const plotW = chartWidth - padding.left - padding.right;
    const chartAreaHeight = Math.max(chartHeight - padding.top - padding.bottom, 0);
    const perfMode = allDataPoints.length > 60 || isScrolling;

    // Fondo suave (como el SVG)
    const bgGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartAreaHeight);
    bgGrad.addColorStop(0, '#fffbfc');
    bgGrad.addColorStop(0.5, '#fff5f7');
    bgGrad.addColorStop(1, '#fff1f3');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(padding.left, padding.top, plotW, chartAreaHeight);

    // "Tarjeta" blanca con borde rosado y sombra suave (parecido al SVG)
    ctx.save();
    ctx.shadowColor = perfMode ? 'transparent' : 'rgba(244, 114, 182, 0.10)';
    ctx.shadowBlur = perfMode ? 0 : 12;
    ctx.shadowOffsetY = perfMode ? 0 : 4;
    ctx.fillStyle = '#ffffff';
    buildRoundRectPath(ctx, padding.left, padding.top, plotW, chartAreaHeight, 12);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.20)';
    ctx.lineWidth = 1;
    buildRoundRectPath(ctx, padding.left, padding.top, plotW, chartAreaHeight, 12);
    ctx.stroke();
    ctx.restore();

    const dataGrad = ctx.createLinearGradient(0, graphBottomY, 0, graphBottomY + rowsZoneHeight);
    dataGrad.addColorStop(0, '#fff7fb');
    dataGrad.addColorStop(0.5, '#ffe4f0');
    dataGrad.addColorStop(1, '#fff7fb');
    ctx.fillStyle = dataGrad;
    ctx.fillRect(padding.left, graphBottomY, plotW, rowsZoneHeight);

    // Bandas de interpretación (colores más parecidos al SVG)
    if (showInterpretation && Array.isArray(interpretationSegments)) {
      interpretationSegments.forEach((segment) => {
        const { x, width } = segment.bounds || {};
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return;
        const grad = ctx.createLinearGradient(0, padding.top + chartAreaHeight * 0.5, 0, graphBottomY);
        let c = 'rgba(203, 213, 225, 0.20)'; // nodata/fallback
        if (segment.phase === 'relativeInfertile') c = 'rgba(16, 185, 129, 0.16)'; // verde suave
        if (segment.phase === 'fertile') c = 'rgba(244, 114, 182, 0.22)'; // rosa
        if (segment.phase === 'postOvulatory') c = segment.status === 'pending'
          ? 'rgba(147, 197, 253, 0.24)' // azul claro
          : 'rgba(59, 130, 246, 0.26)'; // azul más intenso
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, c);
        ctx.fillStyle = grad;
        ctx.fillRect(x, padding.top + chartAreaHeight * 0.5, width, Math.max(graphBottomY - (padding.top + chartAreaHeight * 0.5), 0));
      });
    }

    tempTicks.forEach((temp) => {
      const y = getY(temp);
      const major = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
      ctx.strokeStyle = major ? '#f9a8d4' : '#fce7f3';
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.setLineDash(major ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chartWidth - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels SOLO en major (evita el duplicado y queda más limpio)
      if (major) {
        const label = temp.toFixed(1);
        ctx.fillStyle = '#be185d';
        ctx.font = `700 ${responsiveFontSize(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = 'middle';

        ctx.textAlign = 'right';
        ctx.fillText(label, padding.left - responsiveFontSize(0.9), y);

        ctx.textAlign = 'left';
        ctx.fillText(label, chartWidth - padding.right + responsiveFontSize(0.9), y);
      }
    });

    for (let i = start; i <= end; i += 1) {
      const x = xsRef.current[i];
      ctx.strokeStyle = '#fce7f3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, graphBottomY);
      ctx.stroke();
    }

    const ys = ysTempRef.current;
    const x0 = xsRef.current[Math.max(0, start)] ?? padding.left;
    const x1 = xsRef.current[Math.min(xsRef.current.length - 1, end)] ?? (chartWidth - padding.right);
    const lineGrad = ctx.createLinearGradient(x0, 0, x1, 0);
    lineGrad.addColorStop(0, '#f472b6');
    lineGrad.addColorStop(0.5, '#ec4899');
    lineGrad.addColorStop(1, '#be185d');

    ctx.strokeStyle = lineGrad;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let drawing = false;
    for (let i = Math.max(0, start - 1); i <= Math.min(ys.length - 1, end + 1); i += 1) {
      const y = ys[i];
      const x = xsRef.current[i];
      if (y == null || !Number.isFinite(y)) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    // Glow (como el SVG): doble trazo
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let i = start; i <= end; i += 1) {
      const y = ys[i];
      if (y == null || !Number.isFinite(y)) continue;
      const x = xsRef.current[i];
      const isToday = Number.isInteger(todayIndex) && i === todayIndex;
      // Gradiente radial del punto (similar al SVG)
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 5);
      g.addColorStop(0, '#FDF2F8');
      g.addColorStop(0.55, '#F9A8D4');
      g.addColorStop(1, '#EC4899');
      ctx.fillStyle = g;
      ctx.strokeStyle = isToday ? '#be185d' : '#E91E63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Centro brillante
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const obsRowIndex = isFullScreen ? 9 : 7.5;
    const halfBlock = isFullScreen ? 1 : 0.75;
    const rowH = Math.max(textRowHeight, Math.floor(rowsZoneHeight / (obsRowIndex + halfBlock)));
    const dateRowY = graphBottomY + rowH * 1;
    const cycleDayRowY = graphBottomY + rowH * 2;
    const symbolRowY = graphBottomY + rowH * 3;
    const mucusSensationRowY = graphBottomY + rowH * (isFullScreen ? 5 : 4.5);
    const mucusAppearanceRowY = graphBottomY + rowH * (isFullScreen ? 7 : 6);
    const observationsRowY = graphBottomY + rowH * (isFullScreen ? 9 : 7.5);
    const relationsRowY = showRelationsRow ? observationsRowY + rowH * (isFullScreen ? 2 : 1.5) : null;
    const dayW = xsRef.current.length > 1 ? Math.abs(xsRef.current[1] - xsRef.current[0]) : Math.max(8, (chartWidth - padding.left - padding.right) / Math.max(allDataPoints.length, 1));
    const availableTextWidth = Math.max(0, dayW - Math.min(12, Math.max(4, dayW * 0.12)) * 2);
    const rowLineHeight = responsiveFontSize(0.95);

    for (let row = 1; row <= 9; row += 1) {
      const y = graphBottomY + rowH * row - rowH * 0.5;
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chartWidth - padding.right, y);
      ctx.stroke();
    }
    const labelStep = getLabelStep({ totalPoints: allDataPoints.length, getX, responsiveFontSize, data: allDataPoints, ctx });

    for (let i = start; i <= end; i += 1) {
      const point = allDataPoints[i];
      if (!point) continue;
      const x = xsRef.current[i];
      if (i % labelStep === 0 || i === allDataPoints.length - 1) {
        ctx.fillStyle = '#60666f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${responsiveFontSize(1.05)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(compactDate(point.date), x, dateRowY);
        ctx.font = `900 ${responsiveFontSize(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(String(point.cycleDay ?? ''), x, cycleDayRowY);
      }

      const symbolInfo = getSymbolAppearance(point.fertility_symbol);
      const isFuture = point.isoDate
        ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
        : false;
      if (symbolInfo.value !== 'none') {
        const palette = getSymbolColorPalette(symbolInfo.value);
        const fill = palette.main || '#f9a8d4';
        const border = palette.border && palette.border !== 'none' ? palette.border : null;
        const rectX = x - 10;
        const rectY = symbolRowY - 12;
        const rectW = 20;
        const rectH = 14;
        const r = 3;

        ctx.save();
        if (symbolInfo.pattern === 'spotting-pattern') {
          if (!spottingPatternRef.current) {
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = 6;
            patternCanvas.height = 6;
            const pctx = patternCanvas.getContext('2d');
            if (pctx) {
              pctx.fillStyle = '#fb7185';
              pctx.fillRect(0, 0, 6, 6);
              pctx.fillStyle = 'rgba(255,255,255,0.85)';
              pctx.beginPath();
              pctx.arc(3, 3, 1.5, 0, Math.PI * 2);
              pctx.fill();
              spottingPatternRef.current = ctx.createPattern(patternCanvas, 'repeat');
            }
          }
          ctx.fillStyle = spottingPatternRef.current || fill;
        } else {
          ctx.fillStyle = fill;
        }
        buildRoundRectPath(ctx, rectX, rectY, rectW, rectH, r);
        ctx.fill();
        if (border) {
          ctx.strokeStyle = border;
          ctx.lineWidth = (symbolInfo.value === 'white') ? 1.6 : 1;
          buildRoundRectPath(ctx, rectX, rectY, rectW, rectH, r);
          ctx.stroke();
        }
        ctx.restore();
      }
      const peakStatus = point.peakStatus ? String(point.peakStatus).toUpperCase() : null;
      if (peakStatus) {
        ctx.fillStyle = peakStatus === 'P' || peakStatus === 'X' ? '#ec4899' : '#7f1d1d';
        ctx.font = `800 ${responsiveFontSize(peakStatus === 'P' || peakStatus === 'X' ? 1.35 : 1.1)}px ${DEFAULT_TEXT_FONT_FAMILY}`;
        ctx.fillText(peakStatus === 'P' || peakStatus === 'X' ? '✖' : peakStatus, x, symbolRowY - 2);
      }
      
      const sensText = isFullScreen ? limitWords(point.mucus_sensation, 2, isFuture ? '' : '–') : (point.mucus_sensation || (isFuture ? '' : '–'));
      const aparText = isFullScreen ? limitWords(point.mucus_appearance, 2, isFuture ? '' : '–') : (point.mucus_appearance || (isFuture ? '' : '–'));
      const obsText = isFullScreen ? limitWords(point.observations, 2, '') : (point.observations || '');
      const layoutFor = (field, text, baseSize, smallSize, fallback) => {
        const key = `${i}-${field}-${availableTextWidth}-${baseSize}-${smallSize}-${text || ''}`;
        const found = textLayoutCacheRef.current.get(key);
        if (found) return found;
        ctx.font = `700 ${baseSize}px ${DEFAULT_TEXT_FONT_FAMILY}`;
        const base = splitTextLinesByWidth(ctx, text, { maxWidth: availableTextWidth, maxLines: 3, fontSize: baseSize, fallback });
        const resolved = base[2]
          ? (() => {
            ctx.font = `700 ${smallSize}px ${DEFAULT_TEXT_FONT_FAMILY}`;
            return { lines: splitTextLinesByWidth(ctx, text, { maxWidth: availableTextWidth, maxLines: 3, fontSize: smallSize, fallback }), fontSize: smallSize };
          })()
          : { lines: base, fontSize: baseSize };
        textLayoutCacheRef.current.set(key, resolved);
        return resolved;
      };
      const sens = layoutFor('sens', sensText, responsiveFontSize(0.9), responsiveFontSize(0.8), isFuture ? '' : '–');
      const apar = layoutFor('apar', aparText, responsiveFontSize(0.9), responsiveFontSize(0.8), isFuture ? '' : '–');
      const obs = layoutFor('obs', obsText, responsiveFontSize(0.9), responsiveFontSize(0.8), '');
      const drawMultiline = (lines, xPos, baseY, color, fontSize) => {
        const count = Math.max(1, lines.filter((v) => v && String(v).trim()).length);
        ctx.fillStyle = color;
        ctx.font = `700 ${fontSize}px ${DEFAULT_TEXT_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        const startY = baseY - ((count - 1) * rowLineHeight) / 2;
        let lineIndex = 0;
        lines.forEach((line) => {
          if (!line) return;
          ctx.fillText(line, xPos, startY + rowLineHeight * lineIndex);
          lineIndex += 1;
        });
      };
      drawMultiline(sens.lines, x, mucusSensationRowY, SENSATION_COLOR, sens.fontSize);
      drawMultiline(apar.lines, x, mucusAppearanceRowY, APPEARANCE_COLOR, apar.fontSize);
      drawMultiline(obs.lines, x, observationsRowY, OBSERVATION_COLOR, obs.fontSize);

      const rawTemp = point.temperature_raw;
      const correctedTemp = point.temperature_corrected;
      const showCorrection = !perfMode && point.use_corrected && rawTemp != null && correctedTemp != null && Math.abs(correctedTemp - rawTemp) > 0.01;
      if (showCorrection) {
        const rawY = getY(rawTemp);
        if (Number.isFinite(rawY) && Number.isFinite(y)) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, rawY);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.beginPath();
          ctx.arc(x, rawY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (showRelationsRow && relationsRowY != null && point.hasRelations) {
        ctx.fillStyle = '#be123c';
        ctx.font = `700 ${responsiveFontSize(1.2)}px ${DEFAULT_TEXT_FONT_FAMILY}`;
        ctx.fillText('♥', x, relationsRowY);
      }
    }

    if (showInterpretation && shouldRenderBaseline && Number.isFinite(baselineY)) {
      ctx.strokeStyle = baselineStroke || '#F59E0B';
      ctx.lineWidth = baselineWidth || 3;
      ctx.globalAlpha = Number.isFinite(baselineOpacity) ? baselineOpacity : 1;
      const dashList = typeof baselineDash === 'string' ? baselineDash.split(/\s+/).map(Number).filter(Number.isFinite) : [];
      ctx.setLineDash(dashList);
      ctx.beginPath();
      ctx.moveTo(baselineStartX, baselineY);
      ctx.lineTo(baselineEndX, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (activeIndex != null && xsRef.current[activeIndex] != null) {
      const x = xsRef.current[activeIndex];
      const prev = activeIndex > 0 ? xsRef.current[activeIndex - 1] : x;
      const next = activeIndex < xsRef.current.length - 1 ? xsRef.current[activeIndex + 1] : x;
      const fallback = Math.max((chartWidth - padding.left - padding.right) / Math.max(allDataPoints.length, 1), 0);
      const dayWidth = Math.max(((next != null && prev != null ? next - prev : 0) || fallback), fallback, 0);
      ctx.strokeStyle = 'rgba(235, 171, 204,0.15)';
      ctx.lineWidth = Math.max(2, dayWidth * 0.14);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, graphBottomY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(235, 171, 204,0.32)';
      ctx.lineWidth = Math.max(4, dayWidth * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, graphBottomY);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();
    }

    if (!showLeftLegend) {
      ctx.fillStyle = '#be185d';
      ctx.font = `800 ${responsiveFontSize(1.4)}px ${DEFAULT_TEXT_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('°C', padding.left + responsiveFontSize(1.2), padding.top + responsiveFontSize(1.5));
    }

    ctx.restore();
  }, [chartRef, findRange, chartWidth, padding, chartHeight, graphBottomY, rowsZoneHeight, showInterpretation, interpretationSegments, tempTicks, getY, responsiveFontSize, textRowHeight, allDataPoints, getX, todayIndex, shouldRenderBaseline, baselineY, baselineStartX, baselineEndX, baselineStroke, baselineDash, baselineOpacity, baselineWidth, activeIndex, isFullScreen, showRelationsRow, isScrolling, showLeftLegend]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw]);

  useEffect(() => {
    const scroller = chartRef.current;
    if (!scroller) return;
    const onScroll = () => scheduleDraw();
    const onResize = () => scheduleDraw();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [chartRef, scheduleDraw]);

  const getWorldX = useCallback((event) => {
    const scroller = chartRef.current;
    if (!scroller) return null;
    const chartRect = scroller.getBoundingClientRect();
    if (!chartRect.width || !chartRect.height) return null;

    let localX = event.clientX - chartRect.left;
    if (isRotatedForInput) {
      const cx = chartRect.left + chartRect.width / 2;
      const cy = chartRect.top + chartRect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const ux = dy;
      const unrotW = chartRect.height || 1;
      localX = ux + unrotW / 2;
    }
    return scroller.scrollLeft + localX;
  }, [chartRef, isRotatedForInput]);

  const getClosestIndex = useCallback((worldX) => {
    const xs = xsRef.current;
    if (!xs.length || !Number.isFinite(worldX)) return null;
    let low = 0;
    let high = xs.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (xs[mid] < worldX) low = mid + 1;
      else high = mid - 1;
    }
    const right = Math.min(Math.max(low, 0), xs.length - 1);
    const left = Math.max(right - 1, 0);
    return Math.abs(xs[left] - worldX) <= Math.abs(xs[right] - worldX) ? left : right;
  }, []);

  const onPointerDown = useCallback((event) => {
    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((event) => {
    const state = pointerStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.hypot(dx, dy) > 8) {
      state.moved = true;
    }
  }, []);

  const onPointerUp = useCallback((event) => {
    const state = pointerStateRef.current;
    pointerStateRef.current = null;
    if (!state || state.pointerId !== event.pointerId || state.moved) return;
    if (!allDataPoints.length) return;

    const worldX = getWorldX(event);
    const index = getClosestIndex(worldX);
    if (index == null) return;

    const point = allDataPoints[index];
    if (!point) return;
    const isFuture = point.isoDate
      ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
      : false;
    if (isFuture) return;
    handlePointInteraction(point, index, event);
  }, [allDataPoints, getClosestIndex, getWorldX, handlePointInteraction]);

  return (
    <div style={{ width: chartWidth, height: scrollableContentHeight, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStateRef.current = null; }}
        style={{ position: 'sticky', left: 0, top: 0, touchAction: 'pan-x pan-y' }}
      />
    </div>
  );
};

export default FertilityChartCanvas;