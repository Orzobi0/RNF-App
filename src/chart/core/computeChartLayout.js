const BASE_FONT_SIZE = 9;
const GRAPH_BOTTOM_LIFT_ROWS = 1.5;

export const clamp = (min, value, max) => Math.min(max, Math.max(min, value));

export const computeResponsiveFontSize = (
  {
    isFullScreen,
    chartWidth,
    viewportHeight,
    dataPointCount,
    baseFontSize = BASE_FONT_SIZE,
  },
  multiplier = 1
) => {
  if (!isFullScreen) return baseFontSize * multiplier;

  const smallerDim = Math.min(chartWidth, viewportHeight);
  return Math.max(
    8,
    Math.min(
      baseFontSize * multiplier,
      smallerDim / (dataPointCount > 0 ? (40 / multiplier) : 40)
    )
  );
};

export const computeBottomRowsResponsiveFontSize = (context, multiplier = 1) => {
  const {
    exportMode,
    dimensions = {},
    viewportWidth,
    chartWidth,
    visibleDays,
  } = context;

  if (exportMode) {
    const vw = dimensions.viewportWidth || viewportWidth || chartWidth || 1;
    const perDayPx = vw / Math.max(Number(visibleDays) || 1, 1);
    const base = clamp(11, perDayPx * 0.33, 15);
    const scaled = base * multiplier;
    return clamp(10, scaled, 18);
  }

  return computeResponsiveFontSize(context, multiplier);
};

export const computeRowsLayout = ({
  graphBottomY,
  rowsZoneHeight,
  textRowHeight,
  isFullScreen,
  showRelationsRow,
  exportMode,
  bottomRowsResponsiveFontSize,
}) => {
  const rowLineHeight = bottomRowsResponsiveFontSize(0.95);
  const rowsTopY = graphBottomY;
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const halfBlock = isFullScreen ? 1 : 0.75;
  const relationsRowIndex = showRelationsRow
    ? obsRowIndex + (isFullScreen ? 2 : 1.5)
    : null;
  const exportExtraRows = exportMode ? 6 : 0;
  const baseRowCount = obsRowIndex + halfBlock + exportExtraRows;
  const autoRowH = Math.max(1, Math.floor(rowsZoneHeight / baseRowCount));
  const rowH = Math.max(textRowHeight, autoRowH);

  const dateRowY = rowsTopY + rowH * 1;
  const cycleDayRowY = rowsTopY + rowH * 2;
  const symbolRowYBase = rowsTopY + rowH * 3;
  const exportTextBlockHeight = rowLineHeight * 3;
  const exportSensationBlockTop = rowsTopY + rowH * (isFullScreen ? 4 : 3.5);
  const exportAppearanceBlockTop = exportSensationBlockTop + exportTextBlockHeight;
  const exportObservationBlockTop = exportAppearanceBlockTop + exportTextBlockHeight;
  const mucusSensationRowY = exportMode
    ? exportSensationBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 5 : 4.5);
  const mucusAppearanceRowY = exportMode
    ? exportAppearanceBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 7 : 6);
  const observationsRowY = exportMode
    ? exportObservationBlockTop + exportTextBlockHeight / 2
    : rowsTopY + rowH * (isFullScreen ? 9 : 7.5);
  const relationsRowY = showRelationsRow
    ? (exportMode
      ? exportObservationBlockTop + exportTextBlockHeight + rowH
      : observationsRowY + rowH * (isFullScreen ? 2 : 1.5))
    : null;

  return {
    rowsTopY,
    dateRowY,
    cycleDayRowY,
    symbolRowYBase,
    mucusSensationRowY,
    mucusAppearanceRowY,
    observationsRowY,
    relationsRowY,
    rowH,
    rowLineHeight,
    rowBlockHeight: rowH * (isFullScreen ? 2 : 1.5),
    obsRowIndex,
    relationsRowIndex,
    baseRowCount,
    exportTextBlockHeight,
    exportSensationBlockTop,
    exportAppearanceBlockTop,
    exportObservationBlockTop,
  };
};

export const computeDayX = ({
  index,
  chartWidth,
  viewportWidth,
  padding,
  dataPointCount,
  isFullScreen,
  forceLandscape,
  orientation,
  isLandscapeVisual,
  isDenseExport,
}) => {
  const extraMargin = isDenseExport
    ? 2
    : ((isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 5 : 10);
  const daySpacing = (isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 25 : 0;
  const extraRightGap = isDenseExport ? 4 : 15;
  const edgePadding = isDenseExport
    ? 0
    : isFullScreen
      ? Math.max(
        isLandscapeVisual ? 8 : 18,
        Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.01 : 0.05)
      )
      : 20;
  const paddingRightForX = padding.right + extraRightGap;
  const availableWidth =
    chartWidth -
    padding.left -
    paddingRightForX -
    extraMargin -
    edgePadding * 2 -
    daySpacing * (dataPointCount - 1);

  if (availableWidth <= 0) {
    return padding.left + extraMargin + edgePadding + daySpacing * index;
  }

  const pointsToDisplay = dataPointCount > 1 ? dataPointCount - 1 : 1;
  if (pointsToDisplay === 0 || dataPointCount === 0) {
    return padding.left + extraMargin + edgePadding + daySpacing * index;
  }

  return (
    padding.left +
    extraMargin +
    edgePadding +
    index * (availableWidth / (dataPointCount === 1 ? 1 : pointsToDisplay)) +
    daySpacing * index
  );
};

export const computeDayBounds = ({ index, dayXs, chartWidth, padding }) => {
  if (!Number.isFinite(index) || !dayXs.length) {
    return {
      left: padding.left,
      right: chartWidth - padding.right,
      width: Math.max(chartWidth - padding.left - padding.right, 0),
    };
  }

  const lastIndex = dayXs.length - 1;
  const left = index <= 0 ? padding.left : dayXs[index];
  const right = index >= lastIndex ? chartWidth - padding.right : dayXs[index + 1];

  return {
    left,
    right,
    width: Math.max(right - left, 0),
  };
};

export const computeChartLayout = ({
  dimensions = {},
  isFullScreen,
  orientation,
  forceLandscape,
  visibleDays,
  exportMode,
  showRelationsRow,
  rotatedSafeStartInsetPx,
  rotatedSafeEndInsetPx,
  dataPointCount,
  tempMin,
  tempMax,
}) => {
  const chartWidth = dimensions.width;
  const viewportHeight = dimensions.viewportHeight || dimensions.height;
  const viewportWidth = dimensions.viewportWidth || chartWidth;
  const isLandscapeVisual = forceLandscape || orientation === 'landscape';
  const bottomRowsVisualWeight =
    exportMode || isLandscapeVisual
      ? 1
      : isFullScreen
        ? 1.06
        : 1.12;
  const isDenseExport = exportMode && isFullScreen && isLandscapeVisual && visibleDays >= 28;

  const fontContext = {
    isFullScreen,
    chartWidth,
    viewportHeight,
    dataPointCount,
    exportMode,
    dimensions,
    viewportWidth,
    visibleDays,
  };
  const responsiveFontSize = (multiplier = 1) =>
    computeResponsiveFontSize(fontContext, multiplier);
  const bottomRowsResponsiveFontSize = (multiplier = 1) =>
    computeBottomRowsResponsiveFontSize(fontContext, multiplier);

  const textRowHeight = Math.round(
    bottomRowsResponsiveFontSize(isFullScreen ? (exportMode ? 1.45 : 1.6) : 2) *
      bottomRowsVisualWeight
  );
  const obsRowIndex = isFullScreen ? 9 : 7.5;
  const relationsRowIndex = obsRowIndex + (showRelationsRow ? (isFullScreen ? 2 : 1.5) : 0);
  const halfBlock = isFullScreen ? 1 : 0.75;
  const baseBottomRowsExact = Math.round(textRowHeight * (obsRowIndex + halfBlock));
  const relationsBottomRowsExact = Math.round(textRowHeight * (relationsRowIndex + halfBlock));
  const exportExtraTextRows = exportMode ? 6 : 0;
  const exportExtraBottomPx = exportExtraTextRows * textRowHeight;
  const bottomRowsExact = baseBottomRowsExact + exportExtraBottomPx;
  const extraScrollableHeight = showRelationsRow
    ? Math.max(0, relationsBottomRowsExact - baseBottomRowsExact)
    : 0;
  const minGraphArea = Math.max(
    viewportHeight - bottomRowsExact,
    textRowHeight * (isFullScreen ? 10 : 8)
  );
  const chartContentHeight = bottomRowsExact + Math.max(minGraphArea, 0);
  const scrollableContentHeight = chartContentHeight + extraScrollableHeight;

  const effectiveRotatedStartInset = Math.max(0, Number(rotatedSafeStartInsetPx) || 0);
  const effectiveRotatedEndInset = Math.max(0, Number(rotatedSafeEndInsetPx) || 0);
  const computedRight = isFullScreen
    ? Math.max(
      isLandscapeVisual ? 16 : 30,
      Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.01 : 0.05)
    )
    : 50;
  const computedLeft = isFullScreen
    ? Math.max(
      isLandscapeVisual ? 45 : 20,
      Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.02 : 0.05)
    )
    : 50;
  const cappedRotatedEndInset = isLandscapeVisual
    ? Math.min(effectiveRotatedEndInset, 12)
    : effectiveRotatedEndInset;
  const fullScreenRightPadding = computedRight + cappedRotatedEndInset + (isLandscapeVisual ? 8 : 0);
  const minRightLegendSpace = isFullScreen && isLandscapeVisual ? 36 : 0;
  const padding = {
    top: isFullScreen
      ? Math.max(
        isLandscapeVisual ? 6 : 12,
        viewportHeight * (isLandscapeVisual ? 0.015 : 0.03)
      )
      : 12,
    right: isFullScreen
      ? Math.max(fullScreenRightPadding, minRightLegendSpace)
      : 50,
    bottom: Math.max(0, bottomRowsExact - 1),
    left: isFullScreen
      ? computedLeft + effectiveRotatedStartInset
      : 50,
  };
  const graphBottomInset = Math.max(0, Math.round(textRowHeight * GRAPH_BOTTOM_LIFT_ROWS));
  const graphBottomY = chartContentHeight - padding.bottom - graphBottomInset;
  const tempRange = tempMax - tempMin;
  const chartAreaHeight = Math.max(
    chartContentHeight - padding.top - padding.bottom - graphBottomInset,
    0
  );
  const effectiveChartAreaHeight = Math.max(chartAreaHeight, textRowHeight * 6);
  const rowsZoneHeight = Math.max(chartContentHeight - graphBottomY, 0);

  const getY = (temp) => {
    if (temp === null || temp === undefined || tempRange === 0 || effectiveChartAreaHeight <= 0) {
      return graphBottomY;
    }

    return graphBottomY - ((temp - tempMin) / tempRange) * effectiveChartAreaHeight;
  };

  const getX = (index) =>
    computeDayX({
      index,
      chartWidth,
      viewportWidth,
      padding,
      dataPointCount,
      isFullScreen,
      forceLandscape,
      orientation,
      isLandscapeVisual,
      isDenseExport,
    });

  const dayXs = Array.from({ length: Math.max(dataPointCount, 0) }, (_, index) => getX(index));
  const dayBounds = dayXs.map((x, index) => ({
    index,
    x,
    ...computeDayBounds({ index, dayXs, chartWidth, padding }),
  }));
  const rows = computeRowsLayout({
    graphBottomY,
    rowsZoneHeight,
    textRowHeight,
    isFullScreen,
    showRelationsRow,
    exportMode,
    bottomRowsResponsiveFontSize,
  });

  return {
    dimensions: {
      chartWidth,
      chartHeight: chartContentHeight,
      viewportWidth,
      viewportHeight,
      scrollableContentHeight,
      contentHeight: chartContentHeight,
      extraScrollableHeight,
    },
    chartWidth,
    chartHeight: chartContentHeight,
    chartContentHeight,
    viewportWidth,
    viewportHeight,
    scrollableContentHeight,
    extraScrollableHeight,
    padding,
    graphBottomInset,
    graphBottomY,
    rowsZoneHeight,
    rowsZoneHeightBase: bottomRowsExact,
    chartAreaHeight,
    effectiveChartAreaHeight,
    textRowHeight,
    rows,
    dayXs,
    dayBounds,
    getX,
    getY,
    responsiveFontSize,
    bottomRowsResponsiveFontSize,
    metrics: {
      isLandscapeVisual,
      isDenseExport,
      obsRowIndex,
      relationsRowIndex,
      halfBlock,
      baseBottomRowsExact,
      relationsBottomRowsExact,
      exportExtraTextRows,
      exportExtraBottomPx,
      bottomRowsExact,
      minGraphArea,
      effectiveRotatedStartInset,
      effectiveRotatedEndInset,
      computedLeft,
      computedRight,
      fullScreenRightPadding,
      minRightLegendSpace,
      graphBottomLiftRows: GRAPH_BOTTOM_LIFT_ROWS,
    },
  };
};
