export const getTempTicks = ({ tempMin, tempMax, tempRange }) => {
  const ticks = [];
  if (tempRange > 0) {
    const increment = tempRange <= 2.5 ? 0.1 : 0.5;
    for (let t = tempMin; t <= tempMax + 1e-9; t += increment) {
      ticks.push(Number(t.toFixed(1)));
    }
    return ticks;
  }
  for (let t = 35.8; t <= 37.2 + 1e-9; t += 0.1) ticks.push(Number(t.toFixed(1)));
  return ticks;
};
