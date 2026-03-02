import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { isAfter, parseISO, startOfDay } from 'date-fns';
import { getSymbolAppearance, getSymbolColorPalette } from '@/config/fertilitySymbols';

const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = String(dateStr).split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

const getLabelStep = ({ autoLabelStep, totalPoints, getX, responsiveFontSize, data, ctx }) => {
  if (!autoLabelStep || totalPoints < 2 || !ctx) return 1;
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

const FertilityChartCanvas = ({
  chartWidth,
  chartHeight,
  viewportHeight,
  scrollableContentHeight,
  padding,
  graphBottomY,
  rowsZoneHeight,
  textRowHeight,
  tempMin,
  tempMax,
  tempRange,
  getX,
  getY,
  allDataPoints,
  validDataMap,
  activeIndex,
  interpretationSegments,
  showInterpretation,
  baselineY,
  shouldRenderBaseline,
  baselineStartX,
  baselineEndX,
  responsiveFontSize,
  handlePointInteraction,
  chartRef,
  autoLabelStep = false,
  todayIndex,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const xsRef = useRef([]);
  const ysTempRef = useRef([]);
  const visibleRef = useRef({ start: 0, end: -1 });

  useEffect(() => {
    xsRef.current = allDataPoints.map((_, i) => getX(i));
  }, [allDataPoints, chartWidth, padding.left, padding.right, getX]);

  useEffect(() => {
    ysTempRef.current = allDataPoints.map((point) => {
      const valid = point && point.id != null ? validDataMap.get(point.id) : null;
      const temp = valid?.displayTemperature;
      return Number.isFinite(temp) ? getY(temp) : null;
    });
  }, [allDataPoints, validDataMap, getY, tempMin, tempMax]);

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
    const viewportH = viewportHeight;
    const scrollLeft = scroller.scrollLeft;
    const scrollTop = scroller.scrollTop;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewportW * dpr);
    canvas.height = Math.floor(viewportH * dpr);
    canvas.style.width = `${viewportW}px`;
    canvas.style.height = `${viewportH}px`;

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

    const bgGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartAreaHeight);
    bgGrad.addColorStop(0, '#fffbfc');
    bgGrad.addColorStop(0.5, '#fff5f7');
    bgGrad.addColorStop(1, '#fff1f3');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(padding.left, padding.top, plotW, chartAreaHeight);

    const dataGrad = ctx.createLinearGradient(0, graphBottomY, 0, graphBottomY + rowsZoneHeight);
    dataGrad.addColorStop(0, '#fff7fb');
    dataGrad.addColorStop(0.5, '#ffe4f0');
    dataGrad.addColorStop(1, '#fff7fb');
    ctx.fillStyle = dataGrad;
    ctx.fillRect(padding.left, graphBottomY, plotW, rowsZoneHeight);

    if (showInterpretation) {
      interpretationSegments.forEach((segment) => {
        const { x, width } = segment.bounds || {};
        if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return;
        const grad = ctx.createLinearGradient(0, padding.top + chartAreaHeight * 0.5, 0, graphBottomY);
        const c = segment.phase === 'fertile' ? 'rgba(244,63,94,0.28)' : segment.phase === 'postOvulatory' ? 'rgba(234,179,8,0.32)' : 'rgba(45,212,191,0.2)';
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

      const label = major ? temp.toFixed(1) : `.${temp.toFixed(1).split('.')[1]}`;
      ctx.fillStyle = major ? '#be185d' : '#db2777';
      ctx.font = `${major ? '700' : '600'} ${responsiveFontSize(1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, chartWidth - padding.right + responsiveFontSize(1), y);
      ctx.textAlign = 'right';
      ctx.fillText(label, padding.left - responsiveFontSize(1), y);
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
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 3;
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
    ctx.stroke();

    for (let i = start; i <= end; i += 1) {
      const y = ys[i];
      if (y == null || !Number.isFinite(y)) continue;
      const x = xsRef.current[i];
      ctx.fillStyle = i === todayIndex ? '#be185d' : '#ec4899';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const rowH = Math.max(textRowHeight, Math.floor(rowsZoneHeight / 10));
    const dateRowY = graphBottomY + rowH * 1;
    const cycleDayRowY = graphBottomY + rowH * 2;
    const symbolRowY = graphBottomY + rowH * 3;
    const labelStep = getLabelStep({ autoLabelStep, totalPoints: allDataPoints.length, getX, responsiveFontSize, data: allDataPoints, ctx });

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
      if (symbolInfo.value !== 'none') {
        const palette = getSymbolColorPalette(symbolInfo.value);
        ctx.fillStyle = palette.main || '#f9a8d4';
        ctx.fillRect(x - 8, symbolRowY - 12, 16, 12);
      }
      const peakStatus = point.peakStatus ? String(point.peakStatus).toUpperCase() : null;
      if (peakStatus) {
        ctx.fillStyle = peakStatus === 'P' || peakStatus === 'X' ? '#ec4899' : '#7f1d1d';
        ctx.font = `800 ${responsiveFontSize(1.05)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(peakStatus === 'P' || peakStatus === 'X' ? '✖' : peakStatus, x, symbolRowY - 2);
      }
    }

    if (showInterpretation && shouldRenderBaseline && Number.isFinite(baselineY)) {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(baselineStartX, baselineY);
      ctx.lineTo(baselineEndX, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (activeIndex != null && xsRef.current[activeIndex] != null) {
      const x = xsRef.current[activeIndex];
      ctx.strokeStyle = 'rgba(235, 171, 204,0.15)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();
    }

    ctx.restore();
  }, [chartRef, viewportHeight, findRange, chartWidth, padding, chartHeight, graphBottomY, rowsZoneHeight, showInterpretation, interpretationSegments, tempTicks, getY, responsiveFontSize, textRowHeight, autoLabelStep, allDataPoints, getX, todayIndex, shouldRenderBaseline, baselineY, baselineStartX, baselineEndX, activeIndex]);

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

  const onPointerDown = useCallback((event) => {
    const scroller = chartRef.current;
    if (!scroller || !allDataPoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = event.clientX - rect.left + scroller.scrollLeft;

    const xs = xsRef.current;
    let low = 0;
    let high = xs.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (xs[mid] < worldX) low = mid + 1;
      else high = mid - 1;
    }
    const right = Math.min(Math.max(low, 0), xs.length - 1);
    const left = Math.max(right - 1, 0);
    const index = Math.abs(xs[left] - worldX) <= Math.abs(xs[right] - worldX) ? left : right;

    const point = allDataPoints[index];
    if (!point) return;
    const isFuture = point.isoDate
      ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
      : false;
    if (isFuture) return;
    handlePointInteraction(point, index, event);
  }, [allDataPoints, chartRef, handlePointInteraction]);

  return (
    <div style={{ width: chartWidth, height: scrollableContentHeight, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        style={{ position: 'sticky', left: 0, top: 0, touchAction: 'manipulation' }}
      />
    </div>
  );
};

export default FertilityChartCanvas;