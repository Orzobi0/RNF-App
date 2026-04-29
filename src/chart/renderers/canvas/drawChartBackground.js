export const drawChartBackground = ({
  ctx,
  theme,
  chartWidth,
  contentHeight,
  padding,
  graphBottomY,
}) => {
  const areaW = chartWidth - padding.left - padding.right;
  const areaH = Math.max(graphBottomY - padding.top, 0);
  const rowsContentHeight = Math.max(contentHeight - graphBottomY, 0);

  ctx.fillStyle = theme.background.chartArea;
  ctx.fillRect(padding.left, padding.top, areaW, areaH);
  ctx.fillStyle = theme.background.rowsArea;
  ctx.fillRect(padding.left, graphBottomY, areaW, rowsContentHeight);
};
