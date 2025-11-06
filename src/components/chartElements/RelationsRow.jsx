import React, { useMemo } from 'react';

const HEART_COLOR = '#be123c'; // mantenemos el tono, pero lo usaremos con menos tamaño/sombra
// Fondo y borde alineados al estilo de las otras filas (tinte suave + borde muy fino)
const BACKGROUND_COLOR = 'rgba(252, 231, 243, 0.40)';          // rosa MUY suave (≈ a las otras filas)
const BORDER_COLOR = 'rgba(244, 114, 182, 0.08)';              // borde tenue como en el chart
const ROW_BOX_SHADOW = '0 1px 1px rgba(244, 114, 182, 0.03)';  // sombra sutil (no “tarjeta”)

const RelationsRow = ({
  allDataPoints = [],
  getX,
  padding,
  chartWidth,
  textRowHeight,
  isFullScreen,
  responsiveFontSize,
}) => {
  const baseHeight = (isFullScreen ? 2 : 1.5) * textRowHeight;
  const rowHeight = Math.max(baseHeight, 28);
  const safePadding = padding || { left: 0, right: 0 };
  const safeWidth = Number.isFinite(chartWidth) && chartWidth > 0 ? chartWidth : 0;
  // Corazón más discreto: clamp entre 14–20 px, proporcional a la altura como el resto
  const heartSize = Math.min(Math.max(rowHeight * 0.46, 14), 15);
  const widthStyle = safeWidth > 0
    ? { width: safeWidth, minWidth: safeWidth }
    : { width: '100%', minWidth: '100%' };
  

  const relationsPoints = useMemo(() => {
    if (!Array.isArray(allDataPoints) || !getX) return [];
    return allDataPoints
      .map((point, index) => {
        const hasRelations = Boolean(point?.had_relations ?? point?.hadRelations);
        if (!hasRelations) return null;
        const x = getX(index) - (padding?.left ?? 0);
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
        position: 'relative',
        marginTop: -7,
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
            className="font-sans font-bold select-none"
            style={{fontSize: responsiveFontSize(1.05), fontWeight: "800", color: HEART_COLOR }}
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
         border: `0.5px solid ${BORDER_COLOR}`,   // borde fino como en las filas de mucus/obs
         borderRadius: 6,                        // rx≈3 en SVG -> 6px en CSS
         boxShadow: ROW_BOX_SHADOW,              // sombra ligera
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
              textShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
              lineHeight: 1,
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