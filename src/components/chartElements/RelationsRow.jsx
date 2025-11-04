import React, { useMemo } from 'react';

const HEART_COLOR = '#be123c';
const BACKGROUND_COLOR = 'rgba(255, 228, 230, 0.65)';
const BORDER_COLOR = 'rgba(251, 113, 133, 0.45)';

const RelationsRow = ({
  allDataPoints = [],
  getX,
  padding,
  chartWidth,
  textRowHeight,
  isFullScreen,
}) => {
  const baseHeight = (isFullScreen ? 2 : 1.5) * textRowHeight;
  const rowHeight = Math.max(baseHeight, 32);
  const safePadding = padding || { left: 0, right: 0 };
  const safeWidth = Number.isFinite(chartWidth) && chartWidth > 0 ? chartWidth : 0;
  const heartSize = Math.max(rowHeight * 0.55, 18);
  const widthStyle = safeWidth > 0
    ? { width: safeWidth, minWidth: safeWidth }
    : { width: '100%', minWidth: '100%' };

  const relationsPoints = useMemo(() => {
    if (!Array.isArray(allDataPoints) || !getX) return [];
    return allDataPoints
      .map((point, index) => {
        const hasRelations = Boolean(point?.had_relations ?? point?.hadRelations);
        if (!hasRelations) return null;
        const x = getX(index);
        if (!Number.isFinite(x)) return null;
        const isoDate = point?.isoDate || `day-${index}`;
        return {
          key: `${isoDate}-${index}`,
          x,
          isoDate,
        };
      })
      .filter(Boolean);
  }, [allDataPoints, getX]);

  return (
    <div
      className="relative w-full"
      style={{
        height: rowHeight,
        minHeight: rowHeight,
        ...widthStyle,
        flexShrink: 0,
      }}
    >
      <div
        className="absolute inset-y-0"
        style={{
          width: safePadding.left,
          left: 0,
        }}
      >
        <div className="h-full flex items-center justify-end pr-3">
          <span
            className="text-xs font-semibold uppercase tracking-wide text-rose-600"
            style={{ letterSpacing: '0.08em' }}
          >
            RS
          </span>
        </div>
      </div>

      <div
        className="absolute inset-y-0 rounded-xl"
        style={{
          left: safePadding.left,
          right: safePadding.right,
          backgroundColor: BACKGROUND_COLOR,
          border: `1px solid ${BORDER_COLOR}`,
          boxShadow: '0 4px 12px rgba(244, 114, 182, 0.12)',
        }}
      />

      <div
        className="absolute inset-y-0"
        style={{
          left: safePadding.left,
          right: safePadding.right,
        }}
      >
        {relationsPoints.map(({ key, x, isoDate }) => (
          <span
            key={key}
            className="absolute font-semibold select-none"
            style={{
              left: x,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: heartSize,
              color: HEART_COLOR,
              textShadow: '0 2px 6px rgba(244, 63, 94, 0.35)',
            }}
            role="img"
            aria-label={`Relación registrada el ${isoDate}`}
          >
            ❤
          </span>
        ))}
      </div>
    </div>
  );
};

export default RelationsRow;