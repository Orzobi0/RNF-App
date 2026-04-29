export const drawDebugOverlay = ({
  ctx,
  contentW,
  contentHeight,
  chartHeight,
  graphBottomY,
}) => {
  const DEBUG = typeof window !== 'undefined' && window.__CHART_CANVAS_DEBUG__;
  if (!DEBUG) return;

  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  ctx.font = '11px monospace';
  ctx.fillText(`canvas ${contentW}x${contentHeight}`, 8, 14);
  ctx.fillText(`chartH ${chartHeight} contentH ${contentHeight} graphBottomY ${graphBottomY}`, 8, 28);
  ctx.beginPath();
  ctx.moveTo(0, graphBottomY);
  ctx.lineTo(contentW, graphBottomY);
  ctx.strokeStyle = 'rgba(220,38,38,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
};
