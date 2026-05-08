const DEFAULT_TILE_DAY_COUNT = 21;
const DEFAULT_OVERSCAN_TILES = 1;
const DEFAULT_PAINT_OVERSCAN_DAYS = 1;

const clampIndex = (value, min, max) => Math.min(max, Math.max(min, value));

const hasValidVisibleRange = (visibleRange) =>
  Number.isInteger(visibleRange?.startIndex) &&
  Number.isInteger(visibleRange?.endIndex) &&
  visibleRange.endIndex >= visibleRange.startIndex;

const resolveDayLeft = ({ day, index, padding }) => {
  if (Number.isFinite(day?.left)) return day.left;
  if (Number.isFinite(day?.x)) return day.x;
  return padding?.left ?? 0;
};

const resolveDayRight = ({ day, index, lastIndex, chartWidth, padding }) => {
  if (Number.isFinite(day?.right)) return day.right;
  if (Number.isFinite(day?.x) && Number.isFinite(day?.width)) return day.x + day.width;
  return chartWidth - (padding?.right ?? 0);
};

export function buildCanvasTiles({
  renderModel,
  chartWidth,
  contentHeight,
  visibleRange,
  tileDayCount = DEFAULT_TILE_DAY_COUNT,
  overscanTiles = DEFAULT_OVERSCAN_TILES,
}) {
  const days = Array.isArray(renderModel?.days) ? renderModel.days : [];
  const totalDays = days.length;
  const safeChartWidth = Math.max(1, Number(chartWidth) || renderModel?.dimensions?.chartWidth || 1);
  const safeHeight = Math.max(
    1,
    Number(contentHeight) || renderModel?.dimensions?.scrollableContentHeight || renderModel?.dimensions?.chartHeight || 1
  );

  if (!totalDays) {
    return [
      {
        key: 'tile-empty',
        startIndex: 0,
        endIndex: -1,
        paintStartIndex: 0,
        paintEndIndex: -1,
        left: 0,
        right: safeChartWidth,
        width: safeChartWidth,
        height: safeHeight,
      },
    ];
  }

  const safeTileDayCount = Math.max(1, Math.floor(Number(tileDayCount) || DEFAULT_TILE_DAY_COUNT));
  const safeOverscanTiles = Math.max(0, Math.floor(Number(overscanTiles) || 0));
  const lastIndex = totalDays - 1;
  const totalTileCount = Math.ceil(totalDays / safeTileDayCount);
  const rangeStartIndex = hasValidVisibleRange(visibleRange)
    ? clampIndex(visibleRange.startIndex, 0, lastIndex)
    : 0;
  const rangeEndIndex = hasValidVisibleRange(visibleRange)
    ? clampIndex(visibleRange.endIndex, rangeStartIndex, lastIndex)
    : lastIndex;

  const firstTileIndex = hasValidVisibleRange(visibleRange)
    ? clampIndex(Math.floor(rangeStartIndex / safeTileDayCount) - safeOverscanTiles, 0, totalTileCount - 1)
    : 0;
  const lastTileIndex = hasValidVisibleRange(visibleRange)
    ? clampIndex(Math.floor(rangeEndIndex / safeTileDayCount) + safeOverscanTiles, firstTileIndex, totalTileCount - 1)
    : totalTileCount - 1;

  const padding = renderModel?.padding ?? { left: 0, right: 0 };
  const tiles = [];
  for (let tileIndex = firstTileIndex; tileIndex <= lastTileIndex; tileIndex += 1) {
    const startIndex = tileIndex * safeTileDayCount;
    const endIndex = Math.min(startIndex + safeTileDayCount - 1, lastIndex);
    const firstDay = days[startIndex];
    const lastDay = days[endIndex];
    const left = clampIndex(
      resolveDayLeft({ day: firstDay, index: startIndex, padding }),
      0,
      safeChartWidth
    );
    const right = clampIndex(
      resolveDayRight({ day: lastDay, index: endIndex, lastIndex, chartWidth: safeChartWidth, padding }),
      left,
      safeChartWidth
    );
    const width = Math.max(1, right - left);

    tiles.push({
      key: `tile-${startIndex}-${endIndex}-${Math.round(left)}-${Math.round(right)}`,
      startIndex,
      endIndex,
      paintStartIndex: clampIndex(startIndex - DEFAULT_PAINT_OVERSCAN_DAYS, 0, lastIndex),
      paintEndIndex: clampIndex(endIndex + DEFAULT_PAINT_OVERSCAN_DAYS, 0, lastIndex),
      left,
      right,
      width,
      height: safeHeight,
    });
  }

  return tiles;
}
