import {
  BASELINE_NUMBER_COLOR,
  HIGH_SEQUENCE_NUMBER_COLOR,
  drawText,
} from './canvasUtils';

export const drawTemperatureInterpretationNumbers = ({
  ctx,
  renderModel,
  points,
  xs,
  ysTemp,
  visibleStartIndex,
  visibleEndIndex,
  showInterpretation,
  opacity = 1,
  responsiveFontSize,
  isFullScreen,
  isWithinTemperaturePlotArea,
}) => {
  if (!showInterpretation) return;

  const highSequenceOrderByIndex =
    renderModel?.fertility?.highSequenceOrderByIndex ?? {};
  const baselineOrderByIndex =
    renderModel?.fertility?.baselineOrderByIndex ?? {};

  for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
    const point = points[index];
    if (!point) continue;

    const x = xs[index];
    const y = ysTemp[index];

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!isWithinTemperaturePlotArea(y)) continue;

    const hasTemp = point.displayTemperature != null;
    if (!hasTemp) continue;

    const correctedTemp = point.temperature_corrected;
    const usesCorrected = Boolean(point.use_corrected ?? point.useCorrected);
    const isCorrectedDisplayed =
      usesCorrected &&
      correctedTemp != null &&
      point.displayTemperature === correctedTemp;

    const isIgnoredForDisplay =
      point.ignored || (usesCorrected && !isCorrectedDisplayed);

    if (isIgnoredForDisplay) continue;

    const highOrder = highSequenceOrderByIndex[index];
    const baselineOrder = baselineOrderByIndex[index];
    const hasHighOrder = highOrder != null;
    const hasBaselineOrder = baselineOrder != null;

    if (!hasHighOrder && !hasBaselineOrder) continue;

    const numberFontSize = responsiveFontSize(isFullScreen ? 0.75 : 1.2);
    const numberStrokeWidth = Math.max(0.5, numberFontSize * 0.18);

    if (hasHighOrder) {
      ctx.save();
      ctx.globalAlpha *= opacity;
      drawText({
        ctx,
        text: highOrder,
        x,
        y: y - numberFontSize * (isFullScreen ? 2.6 : 1.8),
        fontSize: numberFontSize,
        weight: 900,
        color: HIGH_SEQUENCE_NUMBER_COLOR,
        stroke: '#fff',
        strokeWidth: numberStrokeWidth,
      });
      ctx.restore();
    }

    if (hasBaselineOrder) {
      ctx.save();
      ctx.globalAlpha *= opacity;
      drawText({
  ctx,
  text: baselineOrder,
  x,
  y: y + numberFontSize * (isFullScreen ? 1.9 : 1.6),
  fontSize: numberFontSize,
  weight: 800,
  color: BASELINE_NUMBER_COLOR,
  stroke: 'rgba(255,255,255,0.72)',
  strokeWidth: Math.max(0.35, numberFontSize * 0.12),
});
      ctx.restore();
    }
  }
};
