import React, { useMemo } from 'react';

const HITBOX_OVERSCAN_DAYS = 2;
const MIN_TOUCH_WIDTH = 24;

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const getHitboxBounds = ({ day, previousDay, nextDay, padding, chartWidth }) => {
  const fallbackWidth = Math.max(Number(day?.width) || 0, MIN_TOUCH_WIDTH);
  const center = Number.isFinite(day?.x)
    ? day.x
    : Number.isFinite(day?.left) && Number.isFinite(day?.right)
      ? (day.left + day.right) / 2
      : padding.left;
  let left = Number.isFinite(previousDay?.x)
    ? (previousDay.x + center) / 2
    : Number.isFinite(day?.left)
      ? day.left
      : center - fallbackWidth / 2;
  let right = Number.isFinite(nextDay?.x)
    ? (center + nextDay.x) / 2
    : Number.isFinite(day?.right)
      ? day.right
      : center + fallbackWidth / 2;

  if (right - left < MIN_TOUCH_WIDTH) {
    left = center - MIN_TOUCH_WIDTH / 2;
    right = center + MIN_TOUCH_WIDTH / 2;
  }

  const width = Math.max(right - left, MIN_TOUCH_WIDTH);
  const maxLeft = Math.max(padding.left, chartWidth - padding.right - width);

  return {
    x: clampValue(left, padding.left, maxLeft),
    width,
  };
};

const ChartHitLayer = ({
  renderModel,
  visibleRange,
  padding: fallbackPadding,
  graphBottomY: fallbackGraphBottomY,
  contentHeight,
  chartWidth,
  onPointInteraction,
  exportMode = false,
  isScrolling = false,
}) => {
  const days = Array.isArray(renderModel?.days) ? renderModel.days : [];
  const padding = renderModel?.padding ?? fallbackPadding;
  const graphBottomY = renderModel?.graph?.graphBottomY ?? fallbackGraphBottomY;
  const totalDays = days.length;

  const visibleDays = useMemo(() => {
    if (exportMode || !totalDays || !padding || typeof onPointInteraction !== 'function') {
      return [];
    }

    const start = Number.isInteger(visibleRange?.startIndex)
      ? clampValue(visibleRange.startIndex - HITBOX_OVERSCAN_DAYS, 0, totalDays - 1)
      : 0;
    const end = Number.isInteger(visibleRange?.endIndex)
      ? clampValue(visibleRange.endIndex + HITBOX_OVERSCAN_DAYS, start, totalDays - 1)
      : totalDays - 1;

    return days.slice(start, end + 1).map((day, offset) => ({
      day,
      index: start + offset,
    }));
  }, [days, exportMode, onPointInteraction, padding, totalDays, visibleRange]);

  if (
    exportMode ||
    !visibleDays.length ||
    !padding ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(chartWidth) ||
    !Number.isFinite(graphBottomY)
  ) {
    return null;
  }

  const y = padding.top;
  const height = Math.max(1, contentHeight - y);

  return (
    <g data-chart-hit-layer="true" aria-hidden="true">
      {visibleDays.map(({ day, index }) => {
        if (!day || day.isFuture || !day.isoDate) return null;

        const bounds = getHitboxBounds({
          day,
          previousDay: days[index - 1],
          nextDay: days[index + 1],
          padding,
          chartWidth,
        });
        const sourcePoint = day.point || day.source || day;

        return (
          <rect
            key={`hit-${index}-${day.isoDate || day.id || index}`}
            x={bounds.x}
            y={y}
            width={bounds.width}
            height={height}
            fill="transparent"
            pointerEvents="all"
            data-chart-interactive="true"
            data-chart-hit-index={index}
            onClick={(event) => {
              if (isScrolling) return;
              onPointInteraction(sourcePoint, index, event);
            }}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </g>
  );
};

export default React.memo(ChartHitLayer);
