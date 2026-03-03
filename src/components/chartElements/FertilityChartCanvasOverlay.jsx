import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAfter, parseISO, startOfDay } from 'date-fns';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';

const parseDash = (dash) => {
  if (!dash) return [];
  if (Array.isArray(dash)) return dash;
  return String(dash)
    .split(/[ ,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
};

const FertilityChartCanvasOverlay = ({
  chartRef,
  chartWidth,
  chartHeight,
  scrollableContentHeight,
  padding,
  graphBottomY,
  rowsZoneHeight,
  allDataPoints,
  tempMin,
  tempMax,
  tempRange,
  getX,
  getY,
  responsiveFontSize,
  visibleRange,
  activeIndex,
  todayIndex,
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
  forceLandscape,
  exportMode,
  temperatureRiseHighlightPath,
  handlePointInteraction,
  getNearestDataIndexByX,
}) => {
  const canvasRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0, dpr: 1 });
  const scrollRef = useRef({ left: 0, top: 0 });
  const rafRef = useRef(0);

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
    const snap = (value) => Math.round(value * dpr) / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewportW, viewportH);
    ctx.clip();
    ctx.translate(-scrollLeft, -scrollTop);

    const areaX = padding.left;
    const areaY = padding.top;
    const areaW = chartWidth - padding.left - padding.right;
    const areaH = Math.max(graphBottomY - padding.top, 0);

    // Background card + rows zone
    ctx.fillStyle = theme.background.chartArea;
    ctx.fillRect(areaX, areaY, areaW, areaH);
    ctx.fillStyle = theme.background.rowsArea;
    ctx.fillRect(areaX, graphBottomY, areaW, rowsZoneHeight);

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

    // Interpretation band backgrounds
    if (showInterpretation && Array.isArray(interpretationSegments)) {
      interpretationSegments.forEach((segment) => {
        const x = segment?.bounds?.x;
        const w = segment?.bounds?.width;
        if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 0) return;
        if (segment.phase === 'fertile') ctx.fillStyle = theme.interpretation.fertile;
        else if (segment.phase === 'relativeInfertile') ctx.fillStyle = theme.interpretation.relativeInfertile;
        else if (segment.phase === 'postOvulatory' && segment.status === 'absolute') ctx.fillStyle = theme.interpretation.postOvulatoryAbsolute;
        else if (segment.phase === 'postOvulatory') ctx.fillStyle = theme.interpretation.postOvulatory;
        else ctx.fillStyle = theme.interpretation.default;
        ctx.fillRect(x, graphBottomY - Math.max(areaH * 0.5, 0), w, Math.max(areaH * 0.5, 0));
      });
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
    drawPath(theme.temperature.lineWidth, theme.temperature.line, 1);

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
        ctx.beginPath();
        ctx.arc(x, rawY, 3, 0, Math.PI * 2);
        ctx.fillStyle = theme.points.correctionPointFill;
        ctx.fill();
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
      ctx.moveTo(snappedHighlightX, 0);
      ctx.lineTo(snappedHighlightX, snap(graphBottomY));
      ctx.strokeStyle = theme.highlight.activeColumn;
      ctx.lineWidth = thinStrokeWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(snappedHighlightX, snap(graphBottomY));
      ctx.lineTo(snappedHighlightX, snap(chartHeight));
      ctx.lineWidth = thickStrokeWidth;
      ctx.stroke();
    }

    const DEBUG = typeof window !== 'undefined' && window.__CHART_CANVAS_DEBUG__;
    if (DEBUG) {
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.font = '11px monospace';
      ctx.fillText(`vp ${viewportW}x${viewportH} scroll ${scrollLeft}/${scrollTop}`, scrollLeft + 8, scrollTop + 14);
      ctx.fillText(`chartH ${chartHeight} graphBottomY ${graphBottomY} rows ${rowsZoneHeight}`, scrollLeft + 8, scrollTop + 28);
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
    rowsZoneHeight,
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

    const ro = new ResizeObserver(syncViewportSize);
    ro.observe(node);

    const onResize = () => syncViewportSize();
    window.addEventListener('resize', onResize);

    const onScroll = () => {
      scrollRef.current = { left: node.scrollLeft, top: node.scrollTop };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    scrollRef.current = { left: node.scrollLeft, top: node.scrollTop };
    node.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      node.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [chartRef, draw, syncViewportSize]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw, isScrolling, isFullScreen, visualOrientation]);

  const handleCanvasPointer = useCallback((event) => {
    if (exportMode) return;
    const node = chartRef?.current;
    const canvas = canvasRef.current;
    if (!node || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const isRotated =
      !exportMode &&
      isFullScreen &&
      forceLandscape &&
      typeof window !== 'undefined' &&
      window.innerWidth < window.innerHeight;

    let localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (isRotated) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const ux = dy;
      const unrotW = rect.height || 1;
      localX = ux + unrotW / 2;
    }

    const worldX = node.scrollLeft + localX;
    const worldY = node.scrollTop + localY;
    if (worldY > graphBottomY) return;
    const index = getNearestDataIndexByX(worldX);
    if (index == null) return;

    const point = points[index];
    if (!point) return;
    const isFuture = point.isoDate
      ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
      : false;
    if (isFuture) return;

    handlePointInteraction(point, index, event);
  }, [chartRef, exportMode, forceLandscape, getNearestDataIndexByX, graphBottomY, handlePointInteraction, isFullScreen, points]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          display: 'block',
          marginBottom: `-${viewportSize.height}px`,
          zIndex: 0,
          pointerEvents: 'none',
        }}
        width={Math.max(1, Math.floor(viewportSize.width * viewportSize.dpr))}
        height={Math.max(1, Math.floor(viewportSize.height * viewportSize.dpr))}
        data-chart-canvas-overlay="true"
        aria-hidden="true"
      />
      {!exportMode && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
            marginBottom: `-${viewportSize.height}px`,
            zIndex: 5,
            pointerEvents: 'auto',
            background: 'transparent',
          }}
          onPointerDown={handleCanvasPointer}
          data-chart-canvas-interaction="true"
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default FertilityChartCanvasOverlay;
