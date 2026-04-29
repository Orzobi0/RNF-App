import { createSnap } from './canvasUtils';
import { drawActiveHighlight } from './drawActiveHighlight';
import { drawBottomRows } from './drawBottomRows';
import { drawChartBackground } from './drawChartBackground';
import { drawDebugOverlay } from './drawDebugOverlay';
import { drawFertilityMarkers } from './drawFertilityMarkers';
import { drawInterpretationBands } from './drawInterpretationBands';
import { drawTemperatureGrid } from './drawTemperatureGrid';
import { drawTemperatureLine } from './drawTemperatureLine';
import { drawTemperaturePoints } from './drawTemperaturePoints';

export function drawChartCanvas({
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
  activeIndex,
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
  bandPaintCache,
  textLayoutCache,
}) {
  const contentW = chartWidth;
  const snap = createSnap(dpr);
  const effectivePadding = renderModel?.padding ?? padding;
  const effectiveGraphBottomY = renderModel?.graph?.graphBottomY ?? graphBottomY;
  const areaW = chartWidth - effectivePadding.left - effectivePadding.right;
  const areaH = Math.max(effectiveGraphBottomY - effectivePadding.top, 0);

  if (!canvas || chartWidth <= 0 || contentHeight <= 0 || areaW <= 0 || areaH <= 0) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, contentW, contentHeight);

  const rangeStart = Number.isInteger(visibleRange?.startIndex) ? visibleRange.startIndex : 0;
  const rangeEnd = Number.isInteger(visibleRange?.endIndex)
    ? visibleRange.endIndex
    : Math.max(points.length - 1, 0);
  const visibleStartIndex = points.length ? Math.max(0, Math.min(points.length - 1, rangeStart)) : 0;
  const visibleEndIndex = points.length ? Math.max(visibleStartIndex, Math.min(points.length - 1, rangeEnd)) : -1;
  const isWithinTemperaturePlotArea = (y) =>
    Number.isFinite(y) && y >= effectivePadding.top && y <= effectiveGraphBottomY;

  drawChartBackground({
    ctx,
    theme,
    chartWidth,
    contentHeight,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
  });
  drawTemperatureGrid({
    ctx,
    theme,
    snap,
    chartWidth,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
    tempMin,
    tempMax,
    tempRange,
    getY,
    points,
    xs,
    visibleStartIndex,
    visibleEndIndex,
  });
  drawInterpretationBands({
    ctx,
    theme,
    snap,
    dpr,
    graphBottomY: effectiveGraphBottomY,
    areaH,
    showInterpretation,
    interpretationSegments,
    bandPaintCache,
  });
  drawFertilityMarkers({
    ctx,
    theme,
    showInterpretation,
    shouldRenderBaseline,
    baselineY,
    baselineStartX,
    baselineEndX,
    baselineStroke,
    baselineDash,
    baselineOpacity,
    baselineWidth,
  });
  drawTemperatureLine({
    ctx,
    theme,
    snap,
    chartWidth,
    padding: effectivePadding,
    points,
    xs,
    ysTemp,
    visibleStartIndex,
    visibleEndIndex,
    isWithinTemperaturePlotArea,
    temperatureRiseHighlightPath,
  });
  drawTemperaturePoints({
    ctx,
    theme,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
    points,
    xs,
    ysTemp,
    getY,
    visibleStartIndex,
    visibleEndIndex,
    isWithinTemperaturePlotArea,
  });
  drawBottomRows({
    ctx,
    chartWidth,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
    rowsZoneHeight,
    textRowHeight,
    bottomRowsResponsiveFontSize,
    responsiveFontSize,
    points,
    xs,
    ysTemp,
    visibleStartIndex,
    visibleEndIndex,
    totalPoints: points.length,
    autoLabelStep,
    isFullScreen,
    exportMode,
    showRelationsRow,
    showInterpretation,
    ovulationDetails,
    firstHighIndex,
    manualModeEnabled,
    manualBaselineTemp,
    isPointEligibleForManualMode,
    measureTextWidth,
    textLayoutCache,
    isWithinTemperaturePlotArea,
  });
  drawActiveHighlight({
    ctx,
    theme,
    snap,
    activeIndex,
    xs,
    points,
    chartWidth,
    contentHeight,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
    responsiveFontSize,
  });
  drawDebugOverlay({
    ctx,
    contentW,
    contentHeight,
    chartHeight,
    graphBottomY: effectiveGraphBottomY,
  });
}
