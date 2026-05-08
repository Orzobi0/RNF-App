export const drawTemperatureLine = ({
  ctx,
  theme,
  snap,
  chartWidth,
  padding,
  points,
  xs,
  ysTemp,
  visibleStartIndex,
  visibleEndIndex,
  isWithinTemperaturePlotArea,
  temperatureRiseHighlightPath,
}) => {
  const stops = theme.svg?.temperatureGradient;
  const tempLineStroke = (() => {
    if (!Array.isArray(stops) || stops.length < 3) return theme.temperature.line;
    const gradient = ctx.createLinearGradient(padding.left, 0, chartWidth - padding.right, 0);
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(0.5, stops[1]);
    gradient.addColorStop(1, stops[2]);
    return gradient;
  })();

  const drawPath = (lineWidth, strokeStyle, alpha = 1) => {
    let started = false;
    let prevValidIndex = null;
    ctx.beginPath();
    for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
      const y = ysTemp[index];
      const point = points[index];
      if (!isWithinTemperaturePlotArea(y) || point?.ignored) {
        started = false;
        continue;
      }
      const snappedX = snap(xs[index]);
      const snappedY = snap(y);
      if (!started) {
        ctx.moveTo(snappedX, snappedY);
        started = true;
      } else if (prevValidIndex != null && index === prevValidIndex + 1) {
        ctx.lineTo(snappedX, snappedY);
      } else {
        ctx.moveTo(snappedX, snappedY);
      }
      prevValidIndex = index;
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  if (theme.temperature.haloWidth > 0) {
    drawPath(theme.temperature.haloWidth, theme.temperature.halo, 1);
  }
  drawPath(theme.temperature.lineWidth, tempLineStroke, 1);

  let prevValidIndex = null;
  for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
    const y = ysTemp[index];
    const point = points[index];
    if (!isWithinTemperaturePlotArea(y) || point?.ignored) continue;
    if (prevValidIndex != null && index > prevValidIndex + 1) {
      const prevY = ysTemp[prevValidIndex];
      if (Number.isFinite(prevY)) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(snap(xs[prevValidIndex]), snap(prevY));
        ctx.lineTo(snap(xs[index]), snap(y));
        ctx.strokeStyle = theme.temperature.gapStroke;
        ctx.setLineDash(theme.temperature.gapDash);
        ctx.lineWidth = theme.temperature.gapWidth;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }
    prevValidIndex = index;
  }

  if (temperatureRiseHighlightPath) {
    const numbers = temperatureRiseHighlightPath.match(/-?\d*\.?\d+/g)?.map(Number) || [];
    if (numbers.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(numbers[0], numbers[1]);
      for (let index = 2; index < numbers.length; index += 2) {
        ctx.lineTo(numbers[index], numbers[index + 1]);
      }
      ctx.strokeStyle = theme.highlight.risePath;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
};
