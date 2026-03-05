import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';

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
  chartRef,
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
  visibleRange,
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
  isScrolling,
  isFullScreen,
  visualOrientation,
  temperatureRiseHighlightPath,
}) => {
  const canvasRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0, dpr: 1 });
  const scrollRef = useRef({ left: 0, top: 0 });
  const rafRef = useRef(0);
  const bandPaintCacheRef = useRef(new Map());

  const points = useMemo(() => allDataPoints || [], [allDataPoints]);
  const theme = useMemo(() => getCanvasTheme(), []);
  const xs = useMemo(() => points.map((_, index) => getX(index)), [points, getX]);
  const ysTemp = useMemo(
    () => points.map((point) => (Number.isFinite(point?.displayTemperature) ? getY(point.displayTemperature) : null)),
    [points, getY]
  );

  const syncViewportSize = useCallback(() => {
    const node = chartRef?.current;
    const canvas = canvasRef.current;
    if (!node || !canvas) return;
    const width = Math.max(1, node.clientWidth || 1);
    const height = Math.max(1, node.clientHeight || 1);
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    setViewportSize((prev) => {
      if (prev.width === width && prev.height === height && prev.dpr === dpr) return prev;
      return { width, height, dpr };
    });
  }, [chartRef]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const node = chartRef?.current;
    if (!canvas || !node || !viewportSize.width || !viewportSize.height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scrollLeft = node.scrollLeft || 0;
    const scrollTop = node.scrollTop || 0;
    const { width: viewportW, height: viewportH, dpr } = viewportSize;
    const contentHeight =
      Number.isFinite(scrollableContentHeight) && scrollableContentHeight > 0
        ? scrollableContentHeight
        : chartHeight;
    const snap = (value) => Math.round(value * dpr) / dpr;

    const areaW = chartWidth - padding.left - padding.right;
    const areaH = Math.max(graphBottomY - padding.top, 0);
    if (chartWidth <= 0 || contentHeight <= 0 || areaW <= 0 || areaH <= 0) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewportW, viewportH);
    ctx.clip();
    ctx.translate(-scrollLeft, -scrollTop);

    const areaX = padding.left;
    const areaY = padding.top;
    const rowsContentHeight = Math.max(contentHeight - graphBottomY, 0);

    // Background card + rows zone
    ctx.fillStyle = theme.background.chartArea;
    ctx.fillRect(areaX, areaY, areaW, areaH);
    ctx.fillStyle = theme.background.rowsArea;
    ctx.fillRect(areaX, graphBottomY, areaW, rowsContentHeight);

    // Temperature horizontal grid + right labels
    const ticks = [];
    const tickIncrement = tempRange > 0 && tempRange <= 2.5 ? 0.1 : 0.5;
    const from = tempRange > 0 ? tempMin : 35.8;
    const to = tempRange > 0 ? tempMax : 37.2;
    for (let t = from; t <= to + 1e-9; t += tickIncrement) ticks.push(Number(t.toFixed(1)));

    ctx.font = `700 ${responsiveFontSize(1)}px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`;
    ticks.forEach((temp) => {
      const y = getY(temp);
      const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
      const snappedY = snap(y);
      ctx.beginPath();
      ctx.moveTo(snap(areaX), snappedY);
      ctx.lineTo(snap(chartWidth - padding.right), snappedY);
      ctx.strokeStyle = isMajor ? theme.grid.horizontalMajor : theme.grid.horizontalMinor;
      ctx.lineWidth = isMajor ? 1.2 : 1;
      ctx.setLineDash(isMajor ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isMajor ? theme.grid.labelMajor : theme.grid.labelMinor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const labelText = isMajor ? temp.toFixed(1) : `.${temp.toFixed(1).split('.')[1]}`;
      ctx.fillText(labelText, snap(chartWidth - padding.right + responsiveFontSize(1)), snappedY);
    });

    // Vertical grid limited to visible range
    const startIndex = Math.max(0, visibleRange?.startIndex ?? 0);
    const endIndex = Math.min(points.length - 1, visibleRange?.endIndex ?? points.length - 1);
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
        if (!Number.isFinite(y) || p?.ignored) {
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
      if (!Number.isFinite(y) || p?.ignored) continue;
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
      const showCorrection = p.use_corrected && rawTemp != null && correctedTemp != null && Math.abs(correctedTemp - rawTemp) > 0.01;
      const rawY = showCorrection ? getY(rawTemp) : null;
      const isCorrectedDisplayed = p.use_corrected && correctedTemp != null && p.displayTemperature === correctedTemp;
      const isIgnoredForDisplay = p.ignored || (p.use_corrected && !isCorrectedDisplayed);

      if (showCorrection && Number.isFinite(rawY)) {
        ctx.beginPath();
        ctx.moveTo(x, rawY);
        ctx.lineTo(x, y);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = theme.points.correctionLine;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        // Raw (discarded) point: render like an ignored point
  ctx.beginPath();
  ctx.arc(x, rawY, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = theme.points.discardedFill ?? theme.points.ignoredFill;
  ctx.fill();
  ctx.strokeStyle = theme.points.discardedStroke ?? theme.points.ignoredStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = isIgnoredForDisplay ? theme.points.ignoredFill : theme.points.fill;
      ctx.fill();
      ctx.strokeStyle = isIgnoredForDisplay ? theme.points.ignoredStroke : theme.points.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
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
      ctx.fillText(`vp ${viewportW}x${viewportH} scroll ${scrollLeft}/${scrollTop}`, scrollLeft + 8, scrollTop + 14);
      ctx.fillText(`chartH ${chartHeight} contentH ${contentHeight} graphBottomY ${graphBottomY}`, scrollLeft + 8, scrollTop + 28);
      ctx.beginPath();
      ctx.moveTo(scrollLeft, graphBottomY);
      ctx.lineTo(scrollLeft + viewportW, graphBottomY);
      ctx.strokeStyle = 'rgba(220,38,38,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }, [
    activeIndex,
    baselineDash,
    baselineEndX,
    baselineOpacity,
    baselineStartX,
    baselineStroke,
    baselineWidth,
    baselineY,
    chartHeight,
    chartRef,
    chartWidth,
    getY,
    graphBottomY,
    interpretationSegments,
    padding,
    points,
    responsiveFontSize,
    scrollableContentHeight,
    theme,
    shouldRenderBaseline,
    showInterpretation,
    tempMax,
    tempMin,
    tempRange,
    temperatureRiseHighlightPath,
    viewportSize,
    visibleRange,
    xs,
    ysTemp,
  ]);

  useEffect(() => {
    syncViewportSize();
    const node = chartRef?.current;
    if (!node) return undefined;

    const canObserve = typeof window !== 'undefined' && typeof window.ResizeObserver === 'function';
    let ro;
    if (canObserve) {
      ro = new ResizeObserver(syncViewportSize);
      ro.observe(node);
    }

    const onResize = () => syncViewportSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const onScroll = () => {
      scrollRef.current = { left: node.scrollLeft, top: node.scrollTop };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    scrollRef.current = { left: node.scrollLeft, top: node.scrollTop };
    node.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (ro) {
        ro.disconnect();
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      node.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [chartRef, draw, syncViewportSize]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw, isScrolling, isFullScreen, visualOrientation]);

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
    width={Math.max(1, Math.floor(viewportSize.width * viewportSize.dpr))}
    height={Math.max(1, Math.floor(viewportSize.height * viewportSize.dpr))}
    data-chart-canvas-overlay="true"
    aria-hidden="true"
  />
);
};

export default FertilityChartCanvasOverlay;
