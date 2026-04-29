import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';
import CanvasTile from '@/chart/renderers/canvas/CanvasTile';
import { buildCanvasTiles } from '@/chart/renderers/canvas/buildCanvasTiles';

const INTERACTIVE_TILE_DAY_COUNT = 21;
const INTERACTIVE_OVERSCAN_TILES = 1;

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
  const textLayoutCacheRef = useRef(new Map());
  const [canvasResizeVersion, setCanvasResizeVersion] = useState(0);

  const hasRenderModelDays = Array.isArray(renderModel?.days) && renderModel.days.length > 0;
  const points = useMemo(
    () => (hasRenderModelDays ? renderModel.days : allDataPoints || []),
    [allDataPoints, hasRenderModelDays, renderModel?.days]
  );
  const theme = useMemo(() => getCanvasTheme(), []);
  const xs = useMemo(
    () => (hasRenderModelDays ? null : points.map((_, index) => getX(index))),
    [hasRenderModelDays, points, getX]
  );
  const ysTemp = useMemo(
    () => (hasRenderModelDays
      ? null
      : points.map((point) => (Number.isFinite(point?.displayTemperature) ? getY(point.displayTemperature) : null))),
    [hasRenderModelDays, points, getY]
  );
  const contentHeight =
    Number.isFinite(scrollableContentHeight) && scrollableContentHeight > 0
      ? scrollableContentHeight
      : chartHeight;

  const tiles = useMemo(() => {
    if (exportMode) {
      // Export keeps one full tile because the PNG/PDF compositor expects one complete canvas.
      return [
        {
          key: 'tile-export-full',
          startIndex: 0,
          endIndex: Math.max(points.length - 1, -1),
          paintStartIndex: 0,
          paintEndIndex: Math.max(points.length - 1, -1),
          left: 0,
          right: Math.max(1, chartWidth || 1),
          width: Math.max(1, chartWidth || 1),
          height: Math.max(1, contentHeight || 1),
        },
      ];
    }

    return buildCanvasTiles({
      renderModel,
      chartWidth,
      contentHeight,
      visibleRange,
      tileDayCount: INTERACTIVE_TILE_DAY_COUNT,
      overscanTiles: INTERACTIVE_OVERSCAN_TILES,
    });
  }, [chartWidth, contentHeight, exportMode, points.length, renderModel, visibleRange]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onResize = () => {
      setCanvasResizeVersion((version) => version + 1);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const drawProps = useMemo(() => ({
    renderModel,
    theme,
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
    visibleRange: null,
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
  }), [
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
    exportMode,
    firstHighIndex,
    getY,
    graphBottomY,
    interpretationSegments,
    isFullScreen,
    isPointEligibleForManualMode,
    manualBaselineTemp,
    manualModeEnabled,
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
    xs,
    ysTemp,
  ]);

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

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      data-chart-canvas-tiles="true"
      data-chart-canvas-export-fallback={exportMode ? 'true' : undefined}
      aria-hidden="true"
    >
      {tiles.map((tile) => (
        <CanvasTile
          key={tile.key}
          tile={tile}
          drawProps={drawProps}
          textLayoutCache={textLayoutCacheRef.current}
          resizeVersion={canvasResizeVersion}
          dataChartCanvasOverlay
        />
      ))}
    </div>
  );
};

export default FertilityChartCanvasOverlay;
