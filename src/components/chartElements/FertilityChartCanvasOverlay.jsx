import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';
import { drawChartCanvas } from '@/chart/renderers/canvas/drawChartCanvas';

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
  renderModel = null,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const bandPaintCacheRef = useRef(new Map());
  const textLayoutCacheRef = useRef(new Map());
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

  const points = useMemo(() => allDataPoints || [], [allDataPoints]);
  const theme = useMemo(() => getCanvasTheme(), []);
  const xs = useMemo(() => points.map((_, index) => getX(index)), [points, getX]);
  const ysTemp = useMemo(
    () => points.map((point) => (Number.isFinite(point?.displayTemperature) ? getY(point.displayTemperature) : null)),
    [points, getY]
  );
  const contentHeight =
    Number.isFinite(scrollableContentHeight) && scrollableContentHeight > 0
      ? scrollableContentHeight
      : chartHeight;

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
    const canvas = canvasRef.current;
    if (!canvas || !chartWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(devicePixelRatio || 1, 3));
    drawChartCanvas({
      ctx,
      canvas,
      renderModel,
      theme,
      dpr,
      chartWidth,
      chartHeight,
      contentHeight,
      padding,
      graphBottomY,
      points,
      xs,
      ysTemp,
      tempMin,
      tempMax,
      tempRange,
      getY,
      responsiveFontSize,
      bottomRowsResponsiveFontSize,
      visibleRange,
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
      textRowHeight,
      rowsZoneHeight,
      isFullScreen,
      showRelationsRow,
      autoLabelStep,
      ovulationDetails,
      firstHighIndex,
      manualModeEnabled,
      manualBaselineTemp,
      isPointEligibleForManualMode,
      exportMode,
      measureTextWidth,
      bandPaintCache: bandPaintCacheRef.current,
      textLayoutCache: textLayoutCacheRef.current,
    });
  }, [
    autoLabelStep,
    baselineDash,
    baselineEndX,
    baselineOpacity,
    baselineStartX,
    baselineStroke,
    baselineWidth,
    baselineY,
    bottomRowsResponsiveFontSize,
    chartHeight,
    chartWidth,
    contentHeight,
    devicePixelRatio,
    exportMode,
    firstHighIndex,
    getY,
    graphBottomY,
    interpretationSegments,
    isFullScreen,
    isPointEligibleForManualMode,
    manualBaselineTemp,
    manualModeEnabled,
    measureTextWidth,
    ovulationDetails,
    padding,
    points,
    renderModel,
    responsiveFontSize,
    rowsZoneHeight,
    shouldRenderBaseline,
    showInterpretation,
    showRelationsRow,
    tempMax,
    tempMin,
    tempRange,
    textRowHeight,
    theme,
    temperatureRiseHighlightPath,
    visibleRange,
    xs,
    ysTemp,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    syncCanvasSize();
    return undefined;
  }, [syncCanvasSize]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onResize = () => {
      syncCanvasSize();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw, syncCanvasSize]);

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
