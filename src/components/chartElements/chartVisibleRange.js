export const computeVisibleRange = ({ xs, scrollLeft, viewportW, overscanPx = viewportW * 1.5 }) => {
  if (!Array.isArray(xs) || xs.length === 0) {
    return { startIndex: 0, endIndex: -1 };
  }

  const minX = scrollLeft - overscanPx;
  const maxX = scrollLeft + viewportW + overscanPx;

  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < minX) lo = mid + 1;
    else hi = mid;
  }
  const startIndex = Math.max(0, lo - 1);

  lo = 0;
  hi = xs.length - 1;
  while (lo < hi) {
    const mid = ((lo + hi) >> 1) + 1;
    if (xs[mid] > maxX) hi = mid - 1;
    else lo = mid;
  }
  const endIndex = Math.min(xs.length - 1, lo + 1);
  return { startIndex, endIndex };
};
