import { createSnap } from './canvasUtils';
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
  tileViewport = null,
}) {
  const snap = createSnap(dpr);
  const tileX = Number.isFinite(tileViewport?.x) ? tileViewport.x : 0;
  const tileY = Number.isFinite(tileViewport?.y) ? tileViewport.y : 0;
  const tileHeight = Number.isFinite(tileViewport?.height) ? tileViewport.height : contentHeight;
  const contentW = chartWidth;
  const effectivePadding = renderModel?.padding ?? padding;
  const effectiveGraph = renderModel?.graph ?? {};
  const effectiveGraphBottomY = effectiveGraph.graphBottomY ?? graphBottomY;
  const effectiveRowsZoneHeight = effectiveGraph.rowsZoneHeight ?? rowsZoneHeight;
  const effectiveTempMin = effectiveGraph.tempMin ?? tempMin;
  const effectiveTempMax = effectiveGraph.tempMax ?? tempMax;
  const effectiveTempRange = effectiveGraph.tempRange ?? tempRange;
  const effectivePoints = Array.isArray(renderModel?.days) && renderModel.days.length
    ? renderModel.days
    : points;
  const effectiveXs = Array.isArray(renderModel?.days) && renderModel.days.length
    ? renderModel.days.map((day) => day.x)
    : xs;
  const temperaturesByIndex = renderModel?.temperaturesByIndex ?? null;
  const effectiveYsTemp = Array.isArray(renderModel?.days) && renderModel.days.length
    ? renderModel.days.map((day) => temperaturesByIndex?.[day.index]?.y ?? null)
    : ysTemp;
  const effectiveGetY = (temp) => {
    if (typeof getY === 'function' && !renderModel?.graph) return getY(temp);
    const effectiveHeight = effectiveGraph.effectiveChartAreaHeight ?? effectiveGraph.chartAreaHeight ?? 0;
    if (
      temp === null ||
      temp === undefined ||
      effectiveTempRange === 0 ||
      effectiveHeight <= 0
    ) {
      return effectiveGraphBottomY;
    }
    return effectiveGraphBottomY - ((temp - effectiveTempMin) / effectiveTempRange) * effectiveHeight;
  };
  const effectiveInterpretationSegments =
    Array.isArray(renderModel?.interpretationSegments) && renderModel.interpretationSegments.length > 0
      ? renderModel.interpretationSegments
      : interpretationSegments;
  const effectiveBaselineY = renderModel?.fertility?.baselineY ?? baselineY;
  const effectiveBaselineStartX = renderModel?.fertility?.baselineStartX ?? baselineStartX;
  const effectiveBaselineEndX = renderModel?.fertility?.baselineEndX ?? baselineEndX;
  const areaW = chartWidth - effectivePadding.left - effectivePadding.right;
  const areaH = Math.max(effectiveGraphBottomY - effectivePadding.top, 0);

  if (!canvas || chartWidth <= 0 || contentHeight <= 0 || areaW <= 0 || areaH <= 0) {
    return;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, -tileX * dpr, -tileY * dpr);

  const indexRange = tileViewport ?? visibleRange;
  const rangePadding = tileViewport ? 1 : 0;
  const rangeStart = Number.isInteger(indexRange?.startIndex) ? indexRange.startIndex - rangePadding : 0;
  const rangeEnd = Number.isInteger(indexRange?.endIndex)
    ? indexRange.endIndex + rangePadding
    : Math.max(effectivePoints.length - 1, 0);
  const visibleStartIndex = effectivePoints.length ? Math.max(0, Math.min(effectivePoints.length - 1, rangeStart)) : 0;
  const visibleEndIndex = effectivePoints.length ? Math.max(visibleStartIndex, Math.min(effectivePoints.length - 1, rangeEnd)) : -1;
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
    tempMin: effectiveTempMin,
    tempMax: effectiveTempMax,
    tempRange: effectiveTempRange,
    getY: effectiveGetY,
    points: effectivePoints,
    xs: effectiveXs,
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
    interpretationSegments: effectiveInterpretationSegments,
    bandPaintCache,
  });
  drawFertilityMarkers({
    ctx,
    theme,
    showInterpretation,
    shouldRenderBaseline,
    baselineY: effectiveBaselineY,
    baselineStartX: effectiveBaselineStartX,
    baselineEndX: effectiveBaselineEndX,
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
    points: effectivePoints,
    xs: effectiveXs,
    ysTemp: effectiveYsTemp,
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
    points: effectivePoints,
    xs: effectiveXs,
    ysTemp: effectiveYsTemp,
    getY: effectiveGetY,
    visibleStartIndex,
    visibleEndIndex,
    isWithinTemperaturePlotArea,
  });
  drawBottomRows({
    ctx,
    renderModel,
    chartWidth,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
    rowsZoneHeight: effectiveRowsZoneHeight,
    textRowHeight,
    bottomRowsResponsiveFontSize,
    responsiveFontSize,
    points: effectivePoints,
    xs: effectiveXs,
    ysTemp: effectiveYsTemp,
    visibleStartIndex,
    visibleEndIndex,
    totalPoints: effectivePoints.length,
    autoLabelStep,
    isFullScreen,
    exportMode,
    showRelationsRow,
    showInterpretation,
    manualModeEnabled,
    manualBaselineTemp,
    isPointEligibleForManualMode,
    measureTextWidth,
    textLayoutCache,
    isWithinTemperaturePlotArea,
  });
  drawDebugOverlay({
    ctx,
    contentW,
    contentHeight: tileViewport ? tileHeight : contentHeight,
    chartHeight,
    graphBottomY: effectiveGraphBottomY,
  });
}
