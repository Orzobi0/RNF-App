import React from 'react';
import { getCanvasTheme } from '@/components/chartElements/chartTheme';

const ChartDynamicOverlay = ({
  renderModel,
  activeIndex,
  chartWidth,
  contentHeight,
  padding: fallbackPadding,
  graphBottomY: fallbackGraphBottomY,
  responsiveFontSize,
}) => {
  const days = Array.isArray(renderModel?.days) ? renderModel.days : [];
  const padding = renderModel?.padding ?? fallbackPadding;
  const graphBottomY = renderModel?.graph?.graphBottomY ?? fallbackGraphBottomY;
  const activeDay = Number.isInteger(activeIndex) ? days[activeIndex] : null;

  if (
    !activeDay ||
    !padding ||
    !Number.isFinite(activeDay.x) ||
    !Number.isFinite(chartWidth) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(graphBottomY)
  ) {
    return null;
  }

  const previousX = activeIndex > 0 ? days[activeIndex - 1]?.x : activeDay.x;
  const nextX = activeIndex < days.length - 1 ? days[activeIndex + 1]?.x : activeDay.x;
  const fallbackDayWidth = Math.max(
    (chartWidth - padding.left - padding.right) / Math.max(days.length, 1),
    0
  );
  const dayWidth = Math.max(((nextX - previousX) || fallbackDayWidth), fallbackDayWidth, 0);
  const thinStrokeWidth = Math.max(3, Math.min(14, dayWidth * 0.4));
  const selectedRowsColumnWidth = Number.isFinite(activeDay.width)
  ? activeDay.width
  : fallbackDayWidth;

const thickStrokeWidth = Math.max(
  thinStrokeWidth * 2,
  selectedRowsColumnWidth * 0.9,
  responsiveFontSize(0.85)
);
  const theme = getCanvasTheme();
  const stroke = theme.highlight.activeColumn;

  return (
    <svg
      width={chartWidth}
      height={contentHeight}
      viewBox={`0 0 ${chartWidth} ${contentHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      <line
        x1={activeDay.x}
        y1={padding.top}
        x2={activeDay.x}
        y2={graphBottomY}
        stroke={stroke}
        strokeWidth={thinStrokeWidth}
      />
      <line
        x1={activeDay.x}
        y1={graphBottomY}
        x2={activeDay.x}
        y2={contentHeight}
        stroke={stroke}
        strokeWidth={thickStrokeWidth}
      />
    </svg>
  );
};

export default React.memo(ChartDynamicOverlay);
