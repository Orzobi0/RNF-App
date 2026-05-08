export const drawTemperaturePoints = ({
  ctx,
  theme,
  padding,
  graphBottomY,
  points,
  xs,
  ysTemp,
  getY,
  visibleStartIndex,
  visibleEndIndex,
  isWithinTemperaturePlotArea,
}) => {
  for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
    const point = points[index];
    const y = ysTemp[index];
    if (!point || !Number.isFinite(y)) continue;

    const x = xs[index];
    const rawTemp = point.temperature_raw;
    const correctedTemp = point.temperature_corrected;
    const showCorrection =
      point.use_corrected &&
      rawTemp != null &&
      correctedTemp != null &&
      Math.abs(correctedTemp - rawTemp) > 0.01;
    const rawY = showCorrection ? getY(rawTemp) : null;
    const clampedRawY = Number.isFinite(rawY)
      ? Math.min(graphBottomY, Math.max(padding.top, rawY))
      : null;
    const isCorrectedDisplayed =
      point.use_corrected &&
      correctedTemp != null &&
      point.displayTemperature === correctedTemp;
    const isIgnoredForDisplay =
      point.ignored || (point.use_corrected && !isCorrectedDisplayed);
    const shouldDrawCorrectionLine =
      showCorrection &&
      isWithinTemperaturePlotArea(y) &&
      Number.isFinite(clampedRawY) &&
      clampedRawY !== y;
    const shouldDrawRawDiscardedPoint =
      showCorrection &&
      isWithinTemperaturePlotArea(rawY);

    if (shouldDrawCorrectionLine) {
      ctx.beginPath();
      ctx.moveTo(x, clampedRawY);
      ctx.lineTo(x, y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = theme.points.correctionLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (shouldDrawRawDiscardedPoint) {
      ctx.beginPath();
      ctx.arc(x, rawY, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = theme.points.discardedFill ?? theme.points.ignoredFill;
      ctx.fill();
      ctx.strokeStyle = theme.points.discardedStroke ?? theme.points.ignoredStroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (isWithinTemperaturePlotArea(y)) {
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = isIgnoredForDisplay ? theme.points.ignoredFill : theme.points.fill;
      ctx.fill();
      ctx.strokeStyle = isIgnoredForDisplay ? theme.points.ignoredStroke : theme.points.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
};
