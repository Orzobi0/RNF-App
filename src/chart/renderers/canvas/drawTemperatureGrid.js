export const drawTemperatureGrid = ({
  ctx,
  theme,
  snap,
  chartWidth,
  padding,
  graphBottomY,
  tempMin,
  tempMax,
  tempRange,
  getY,
  points,
  xs,
  visibleStartIndex,
  visibleEndIndex,
}) => {
  const ticks = [];
  const tickIncrement = tempRange > 0 && tempRange <= 2.5 ? 0.1 : 0.5;
  const from = tempRange > 0 ? tempMin : 35.8;
  const to = tempRange > 0 ? tempMax : 37.2;
  for (let temp = from; temp <= to + 1e-9; temp += tickIncrement) {
    ticks.push(Number(temp.toFixed(1)));
  }

  ticks.forEach((temp) => {
    const y = getY(temp);
    const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
    const snappedY = snap(y);
    ctx.beginPath();
    ctx.moveTo(snap(padding.left), snappedY);
    ctx.lineTo(snap(chartWidth - padding.right), snappedY);
    ctx.strokeStyle = isMajor ? theme.grid.horizontalMajor : theme.grid.horizontalMinor;
    ctx.lineWidth = isMajor ? 1.2 : 1.3;
    ctx.setLineDash(isMajor ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  for (let index = visibleStartIndex; index <= visibleEndIndex; index += 1) {
    const x = xs[index];
    if (!Number.isFinite(x) || !points[index]) continue;
    const snappedX = snap(x);
    ctx.beginPath();
    ctx.moveTo(snappedX, snap(padding.top));
    ctx.lineTo(snappedX, snap(graphBottomY));
    ctx.strokeStyle = theme.grid.vertical;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};
