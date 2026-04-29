export const drawActiveHighlight = ({
  ctx,
  theme,
  snap,
  activeIndex,
  xs,
  points,
  chartWidth,
  contentHeight,
  padding,
  graphBottomY,
  responsiveFontSize,
}) => {
  if (activeIndex == null || !Number.isFinite(xs[activeIndex])) return;

  const highlightX = xs[activeIndex];
  const prevX = activeIndex > 0 ? xs[activeIndex - 1] : highlightX;
  const nextX = activeIndex < points.length - 1 ? xs[activeIndex + 1] : highlightX;
  const fallbackDayWidth = Math.max(
    (chartWidth - padding.left - padding.right) / Math.max(points.length, 1),
    0
  );
  const dayWidth = Math.max(((nextX - prevX) || fallbackDayWidth), fallbackDayWidth, 0);
  const thinStrokeWidth = Math.max(3, Math.min(14, dayWidth * 0.4));
  const thickStrokeWidth = Math.max(thinStrokeWidth * 2, responsiveFontSize(0.85));
  const snappedHighlightX = snap(highlightX);

  ctx.beginPath();
  ctx.moveTo(snappedHighlightX, snap(padding.top));
  ctx.lineTo(snappedHighlightX, snap(graphBottomY));
  ctx.strokeStyle = theme.highlight.activeColumn;
  ctx.lineWidth = thinStrokeWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(snappedHighlightX, snap(graphBottomY));
  ctx.lineTo(snappedHighlightX, snap(contentHeight));
  ctx.lineWidth = thickStrokeWidth;
  ctx.stroke();
};
