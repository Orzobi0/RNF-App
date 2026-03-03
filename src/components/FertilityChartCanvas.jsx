import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { isAfter, parseISO, startOfDay } from 'date-fns';
import { getCanvasTheme, FONT_FAMILY } from '@/components/chartElements/chartTheme';
import { getTempTicks } from '@/components/chartElements/chartTicks';

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
  isScrolling = false,
  showLegend = false,
  visibleRange,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const xsRef = useRef([]);
  const ysTempRef = useRef([]);
  const canvasSizeRef = useRef({ viewportW: 0, viewportH: 0, dpr: 0 });
  const pointerStateRef = useRef(null);
  const theme = useMemo(() => getCanvasTheme(), []);
  const tempTicks = useMemo(() => getTempTicks({ tempMin, tempMax, tempRange }), [tempMin, tempMax, tempRange]);

  useEffect(() => { xsRef.current = allDataPoints.map((_, i) => getX(i)); }, [allDataPoints, getX]);
  useEffect(() => {
    ysTempRef.current = allDataPoints.map((point) => {
      const temp = point?.displayTemperature;
      return Number.isFinite(temp) ? getY(temp) : null;
    });
  }, [allDataPoints, getY]);

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

    const start = Number.isInteger(visibleRange?.startIndex) ? visibleRange.startIndex : 0;
    const end = Number.isInteger(visibleRange?.endIndex) ? visibleRange.endIndex : allDataPoints.length - 1;

    ctx.save();
    ctx.translate(-scrollLeft, -scrollTop);
    ctx.beginPath();
    ctx.rect(scrollLeft, scrollTop, viewportW, viewportH);
    ctx.clip();

    const plotW = chartWidth - padding.left - padding.right;
    const chartAreaHeight = Math.max(chartHeight - padding.top - padding.bottom, 0);
    const perfMode = allDataPoints.length > 60 || isScrolling;

    const bgGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartAreaHeight);
    theme.bgGradient.forEach((stop) => bgGrad.addColorStop(Number(stop.offset.replace('%', '')) / 100, stop.color));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(padding.left, padding.top, plotW, chartAreaHeight);

    ctx.save();
    ctx.shadowColor = perfMode ? 'transparent' : theme.card.shadowRGBA;
    ctx.shadowBlur = perfMode ? 0 : 12;
    ctx.shadowOffsetY = perfMode ? 0 : 4;
    ctx.fillStyle = theme.card.fill;
    buildRoundRectPath(ctx, padding.left, padding.top, plotW, chartAreaHeight, 12);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = theme.card.border;
    ctx.lineWidth = 1;
    buildRoundRectPath(ctx, padding.left, padding.top, plotW, chartAreaHeight, 12);
    ctx.stroke();

    const dataGrad = ctx.createLinearGradient(0, graphBottomY, 0, graphBottomY + rowsZoneHeight);
    theme.dataZoneGradient.forEach((stop) => dataGrad.addColorStop(Number(stop.offset.replace('%', '')) / 100, stop.color));
    ctx.fillStyle = dataGrad;
    ctx.fillRect(padding.left, graphBottomY, plotW, rowsZoneHeight);

    if (showInterpretation && Array.isArray(interpretationSegments)) {
      interpretationSegments.forEach((segment) => {
        const { x, width } = segment.bounds || {};
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return;
        const grad = ctx.createLinearGradient(0, padding.top + chartAreaHeight * 0.5, 0, graphBottomY);
        let c = 'rgba(203, 213, 225, 0.20)';
        if (segment.phase === 'relativeInfertile') c = 'rgba(16, 185, 129, 0.16)';
        if (segment.phase === 'fertile') c = 'rgba(244, 114, 182, 0.22)';
        if (segment.phase === 'postOvulatory') c = segment.status === 'pending' ? 'rgba(147, 197, 253, 0.24)' : 'rgba(59, 130, 246, 0.26)';
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, c);
        ctx.fillStyle = grad;
        ctx.fillRect(x, padding.top + chartAreaHeight * 0.5, width, Math.max(graphBottomY - (padding.top + chartAreaHeight * 0.5), 0));
      });
    }

    tempTicks.forEach((temp) => {
      const y = getY(temp);
      const major = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
      ctx.strokeStyle = major ? theme.grid.major : theme.grid.minor;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.setLineDash(major ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chartWidth - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (major) {
        const label = temp.toFixed(1);
        ctx.fillStyle = theme.text.axisMajor;
        ctx.font = `700 ${responsiveFontSize(1)}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillText(label, padding.left - responsiveFontSize(0.9), y);
        ctx.textAlign = 'left';
        ctx.fillText(label, chartWidth - padding.right + responsiveFontSize(0.9), y);
      }
    });

    for (let i = start; i <= end; i += 1) {
      const x = xsRef.current[i];
      ctx.strokeStyle = theme.grid.vertical;
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
    theme.tempLineGradient.forEach((stop) => lineGrad.addColorStop(Number(stop.offset.replace('%', '')) / 100, stop.color));
    ctx.strokeStyle = lineGrad;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let drawing = false;
    for (let i = Math.max(0, start - 1); i <= Math.min(ys.length - 1, end + 1); i += 1) {
      const y = ys[i];
      const x = xsRef.current[i];
      if (y == null || !Number.isFinite(y)) { drawing = false; continue; }
      if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
    }
    ctx.save(); ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.stroke(); ctx.restore();
    ctx.lineWidth = 3; ctx.stroke();

    for (let i = start; i <= end; i += 1) {
      const y = ys[i]; if (y == null || !Number.isFinite(y)) continue;
      const x = xsRef.current[i];
      const isToday = Number.isInteger(todayIndex) && i === todayIndex;
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 5);
      theme.tempPointRadialGradient.forEach((stop) => g.addColorStop(Number(stop.offset.replace('%', '')) / 100, stop.color));
      ctx.fillStyle = g;
      ctx.strokeStyle = isToday ? theme.misc.today : theme.tempLineGradient[2].color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    if (showInterpretation && shouldRenderBaseline && Number.isFinite(baselineY)) {
      ctx.strokeStyle = baselineStroke || theme.baseline.strokeDefault;
      ctx.lineWidth = baselineWidth || 3;
      ctx.globalAlpha = Number.isFinite(baselineOpacity) ? baselineOpacity : theme.baseline.opacityDefault;
      const dashList = typeof baselineDash === 'string' ? baselineDash.split(/\s+/).map(Number).filter(Number.isFinite) : theme.baseline.dashDefault.split(/\s+/).map(Number);
      ctx.setLineDash(dashList);
      ctx.beginPath();
      ctx.moveTo(baselineStartX, baselineY);
      ctx.lineTo(baselineEndX, baselineY);
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    if (activeIndex != null && xsRef.current[activeIndex] != null) {
      const x = xsRef.current[activeIndex];
      const prev = activeIndex > 0 ? xsRef.current[activeIndex - 1] : x;
      const next = activeIndex < xsRef.current.length - 1 ? xsRef.current[activeIndex + 1] : x;
      const fallback = Math.max((chartWidth - padding.left - padding.right) / Math.max(allDataPoints.length, 1), 0);
      const dayWidth = Math.max(((next != null && prev != null ? next - prev : 0) || fallback), fallback, 0);
      ctx.strokeStyle = theme.highlight.strokeTop;
      ctx.lineWidth = Math.max(2, dayWidth * 0.14);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, graphBottomY); ctx.stroke();
      ctx.strokeStyle = theme.highlight.strokeBottom;
      ctx.lineWidth = Math.max(4, dayWidth * 0.5);
      ctx.beginPath(); ctx.moveTo(x, graphBottomY); ctx.lineTo(x, chartHeight); ctx.stroke();
    }

    if (!showLegend) {
      ctx.fillStyle = theme.text.axisMajor;
      ctx.font = `800 ${responsiveFontSize(1.4)}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('°C', padding.left + responsiveFontSize(1.2), padding.top + responsiveFontSize(1.5));
    }

    ctx.restore();
  }, [activeIndex, allDataPoints.length, baselineDash, baselineEndX, baselineOpacity, baselineStartX, baselineStroke, baselineWidth, chartHeight, chartRef, chartWidth, getY, graphBottomY, handlePointInteraction, interpretationSegments, isScrolling, padding, responsiveFontSize, rowsZoneHeight, shouldRenderBaseline, showInterpretation, showLegend, tempTicks, theme, todayIndex, visibleRange]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => { rafRef.current = null; draw(); });
  }, [draw]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw]);
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

  const onPointerDown = useCallback((event) => { pointerStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }; }, []);
  const onPointerMove = useCallback((event) => {
    const state = pointerStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 8) state.moved = true;
  }, []);
  const onPointerUp = useCallback((event) => {
    const state = pointerStateRef.current;
    pointerStateRef.current = null;
    if (!state || state.pointerId !== event.pointerId || state.moved || !allDataPoints.length) return;
    const worldX = getWorldX(event);
    if (!Number.isFinite(worldX)) return;
    const xs = xsRef.current;
    let low = 0; let high = xs.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (xs[mid] < worldX) low = mid + 1; else high = mid - 1;
    }
    const right = Math.min(Math.max(low, 0), xs.length - 1);
    const left = Math.max(right - 1, 0);
    const index = Math.abs(xs[left] - worldX) <= Math.abs(xs[right] - worldX) ? left : right;
    const point = allDataPoints[index];
    if (!point) return;
    const isFuture = point.isoDate ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date())) : false;
    if (isFuture) return;
    handlePointInteraction(point, index, event);
  }, [allDataPoints, getWorldX, handlePointInteraction]);

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
