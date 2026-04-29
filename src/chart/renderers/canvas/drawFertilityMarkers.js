import { parseDash } from './canvasUtils';

export const drawFertilityMarkers = ({
  ctx,
  theme,
  showInterpretation,
  shouldRenderBaseline,
  baselineY,
  baselineStartX,
  baselineEndX,
  baselineStroke,
  baselineDash,
  baselineOpacity,
  baselineWidth,
}) => {
  if (!showInterpretation || !shouldRenderBaseline || !Number.isFinite(baselineY)) return;

  ctx.save();
  ctx.setLineDash(parseDash(baselineDash));
  ctx.strokeStyle = baselineStroke || theme.baseline.defaultStroke;
  ctx.globalAlpha = baselineOpacity ?? 1;
  ctx.lineWidth = baselineWidth || 3;
  ctx.beginPath();
  ctx.moveTo(baselineStartX, baselineY);
  ctx.lineTo(baselineEndX, baselineY);
  ctx.stroke();
  ctx.restore();
};
