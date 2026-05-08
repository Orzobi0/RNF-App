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
  const radius = Math.max(0, Math.min(theme.background.boardRadius ?? 0, areaW / 2, areaH / 2, rowsContentHeight / 2));

  const drawTopRoundedRect = (x, y, width, height, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const drawBottomRoundedRect = (x, y, width, height, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y);
    ctx.closePath();
  };

  ctx.save();
  ctx.fillStyle = theme.background.chartArea;
  drawTopRoundedRect(padding.left, padding.top, areaW, areaH, radius);
  ctx.fill();
  ctx.fillStyle = theme.background.rowsArea;
  drawBottomRoundedRect(padding.left, graphBottomY, areaW, rowsContentHeight, radius);
  ctx.fill();

  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.background.chartBorder;
  drawTopRoundedRect(
    Math.round(padding.left) + 0.5,
    Math.round(padding.top) + 0.5,
    Math.max(areaW - 1, 0),
    Math.max(areaH - 1, 0),
    radius
  );
  ctx.stroke();
  drawBottomRoundedRect(
    Math.round(padding.left) + 0.5,
    Math.round(graphBottomY) + 0.5,
    Math.max(areaW - 1, 0),
    Math.max(rowsContentHeight - 1, 0),
    radius
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(Math.round(padding.left) + 0.5, Math.round(graphBottomY) + 0.5);
  ctx.lineTo(Math.round(chartWidth - padding.right) - 0.5, Math.round(graphBottomY) + 0.5);
  ctx.strokeStyle = theme.background.rowsSeparator;
  ctx.stroke();
  ctx.restore();
};
