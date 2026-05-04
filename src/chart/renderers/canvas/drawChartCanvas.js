import { createSnap } from './canvasUtils';
import { drawBottomRows } from './drawBottomRows';
import { drawChartBackground } from './drawChartBackground';
import { drawDebugOverlay } from './drawDebugOverlay';
import { drawFertilityMarkers } from './drawFertilityMarkers';
import { drawInterpretationBands } from './drawInterpretationBands';
import { drawTemperatureGrid } from './drawTemperatureGrid';
import { drawTemperatureInterpretationNumbers } from './drawTemperatureInterpretationNumbers';
import { drawTemperatureLine } from './drawTemperatureLine';
import { drawTemperaturePoints } from './drawTemperaturePoints';

function resolveCanvasDrawState({
  renderModel,
  chartWidth,
  padding,
  graphBottomY,
  rowsZoneHeight,
  tempMin,
  tempMax,
  tempRange,
  points,
  xs,
  ysTemp,
  getY,
  interpretationSegments,
  baselineY,
  baselineStartX,
  baselineEndX,
}) {
  const hasRenderModelDays = Array.isArray(renderModel?.days) && renderModel.days.length > 0;
  const graph = renderModel?.graph ?? {};
  const resolvedPadding = renderModel?.padding ?? padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const resolvedGraphBottomY = graph.graphBottomY ?? graphBottomY;
  const resolvedRowsZoneHeight = graph.rowsZoneHeight ?? rowsZoneHeight;
  const resolvedTempMin = graph.tempMin ?? tempMin;
  const resolvedTempMax = graph.tempMax ?? tempMax;
  const resolvedTempRange = graph.tempRange ?? tempRange;
  const resolvedPoints = hasRenderModelDays ? renderModel.days : (points ?? []);
  const resolvedXs = hasRenderModelDays
    ? renderModel.days.map((day) => day.x)
    : (xs ?? []);
  const temperaturesByIndex = renderModel?.temperaturesByIndex ?? null;
  const resolvedYsTemp = hasRenderModelDays
    ? renderModel.days.map((day) => temperaturesByIndex?.[day.index]?.y ?? null)
    : (ysTemp ?? []);
  const resolvedGetY = (temp) => {
    if (typeof getY === 'function' && !renderModel?.graph) return getY(temp);
    const effectiveHeight = graph.effectiveChartAreaHeight ?? graph.chartAreaHeight ?? 0;
    if (
      temp === null ||
      temp === undefined ||
      resolvedTempRange === 0 ||
      effectiveHeight <= 0
    ) {
      return resolvedGraphBottomY;
    }
    return resolvedGraphBottomY - ((temp - resolvedTempMin) / resolvedTempRange) * effectiveHeight;
  };
  const resolvedInterpretationSegments =
    Array.isArray(renderModel?.interpretationSegments) && renderModel.interpretationSegments.length > 0
      ? renderModel.interpretationSegments
      : interpretationSegments;
  const resolvedBaselineY = renderModel?.fertility?.baselineY ?? baselineY;
  const resolvedBaselineStartX = renderModel?.fertility?.baselineStartX ?? baselineStartX;
  const resolvedBaselineEndX = renderModel?.fertility?.baselineEndX ?? baselineEndX;
  const areaW = chartWidth - resolvedPadding.left - resolvedPadding.right;
  const areaH = Math.max(resolvedGraphBottomY - resolvedPadding.top, 0);

  return {
    padding: resolvedPadding,
    graph: {
      graphBottomY: resolvedGraphBottomY,
      rowsZoneHeight: resolvedRowsZoneHeight,
      tempMin: resolvedTempMin,
      tempMax: resolvedTempMax,
      tempRange: resolvedTempRange,
      areaW,
      areaH,
    },
    points: resolvedPoints,
    xs: resolvedXs,
    ysTemp: resolvedYsTemp,
    getY: resolvedGetY,
    interpretationSegments: resolvedInterpretationSegments,
    baseline: {
      y: resolvedBaselineY,
      startX: resolvedBaselineStartX,
      endX: resolvedBaselineEndX,
    },
  };
}

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
  const drawState = resolveCanvasDrawState({
    renderModel,
    chartWidth,
    padding,
    graphBottomY,
    rowsZoneHeight,
    tempMin,
    tempMax,
    tempRange,
    points,
    xs,
    ysTemp,
    getY,
    interpretationSegments,
    baselineY,
    baselineStartX,
    baselineEndX,
  });
  const {
    padding: effectivePadding,
    points: effectivePoints,
    xs: effectiveXs,
    ysTemp: effectiveYsTemp,
    getY: effectiveGetY,
    interpretationSegments: effectiveInterpretationSegments,
    baseline,
  } = drawState;
  const {
    graphBottomY: effectiveGraphBottomY,
    rowsZoneHeight: effectiveRowsZoneHeight,
    tempMin: effectiveTempMin,
    tempMax: effectiveTempMax,
    tempRange: effectiveTempRange,
    areaW,
    areaH,
  } = drawState.graph;

  if (!canvas || chartWidth <= 0 || contentHeight <= 0 || areaW <= 0 || areaH <= 0) {
    return;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, -tileX * dpr, -tileY * dpr);

  const indexRange = tileViewport ?? visibleRange;
  const rangeStart = Number.isInteger(indexRange?.paintStartIndex)
    ? indexRange.paintStartIndex
    : Number.isInteger(indexRange?.startIndex)
      ? indexRange.startIndex
      : 0;
  const rangeEnd = Number.isInteger(indexRange?.endIndex)
    ? (Number.isInteger(indexRange?.paintEndIndex) ? indexRange.paintEndIndex : indexRange.endIndex)
    : Math.max(effectivePoints.length - 1, 0);
  const visibleStartIndex = effectivePoints.length ? Math.max(0, Math.min(effectivePoints.length - 1, rangeStart)) : 0;
  const visibleEndIndex = effectivePoints.length ? Math.max(visibleStartIndex, Math.min(effectivePoints.length - 1, rangeEnd)) : -1;
  const isWithinTemperaturePlotArea = (y) =>
    Number.isFinite(y) && y >= effectivePadding.top && y <= effectiveGraphBottomY;
  const rowsContentHeight = Math.max(contentHeight - effectiveGraphBottomY, 0);
  const boardRadius = Math.max(
    0,
    Math.min(theme.background.boardRadius ?? 0, areaW / 2, areaH / 2, rowsContentHeight / 2)
  );
  const addTopRoundedRectPath = (x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };
  const addBottomRoundedRectPath = (x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y);
    ctx.closePath();
  };

  drawChartBackground({
    ctx,
    theme,
    chartWidth,
    contentHeight,
    padding: effectivePadding,
    graphBottomY: effectiveGraphBottomY,
  });
  ctx.save();
  addTopRoundedRectPath(effectivePadding.left, effectivePadding.top, areaW, areaH, boardRadius);
  ctx.clip();
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
    baselineY: baseline.y,
    baselineStartX: baseline.startX,
    baselineEndX: baseline.endX,
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
  drawTemperatureInterpretationNumbers({
    ctx,
    renderModel,
    points: effectivePoints,
    xs: effectiveXs,
    ysTemp: effectiveYsTemp,
    visibleStartIndex,
    visibleEndIndex,
    showInterpretation,
    responsiveFontSize,
    isFullScreen,
    isWithinTemperaturePlotArea,
  });
  ctx.restore();
  ctx.save();
  addBottomRoundedRectPath(effectivePadding.left, effectiveGraphBottomY, areaW, rowsContentHeight, boardRadius);
  ctx.clip();
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
    manualModeEnabled,
    manualBaselineTemp,
    isPointEligibleForManualMode,
    measureTextWidth,
    textLayoutCache,
    isWithinTemperaturePlotArea,
  });
  ctx.restore();
  drawDebugOverlay({
    ctx,
    contentW,
    contentHeight: tileViewport ? tileHeight : contentHeight,
    chartHeight,
    graphBottomY: effectiveGraphBottomY,
  });
}
