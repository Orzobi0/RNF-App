import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { drawChartCanvas } from './drawChartCanvas';

const resolveTileDpr = ({ width, height }) => {
  if (typeof window === 'undefined') return 1;

  const estimatedPixels = Math.max(1, width) * Math.max(1, height);
  const maxDpr = estimatedPixels > 2_000_000
    ? 1.5
    : estimatedPixels > 1_000_000
      ? 2
      : 3;

  return Math.max(1, Math.min(window.devicePixelRatio || 1, maxDpr));
};

const CanvasTile = ({
  tile,
  drawProps,
  textLayoutCache,
  resizeVersion = 0,
  dataChartCanvasOverlay = true,
}) => {
  const canvasRef = useRef(null);
  const bandPaintCacheRef = useRef(new Map());

  const width = Math.max(1, Number(tile?.width) || 1);
  const height = Math.max(1, Number(tile?.height) || Number(drawProps?.contentHeight) || 1);

  const measureTextWidth = useCallback((text, font) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return String(text).length * 7;

    context.save();
    context.font = font;
    const measuredWidth = context.measureText(String(text)).width;
    context.restore();

    return measuredWidth;
  }, []);

  const syncCanvasSize = useCallback((canvas, dpr) => {
    const physicalWidth = Math.max(1, Math.floor(width * dpr));
    const physicalHeight = Math.max(1, Math.floor(height * dpr));

    const sizeChanged =
      canvas.width !== physicalWidth ||
      canvas.height !== physicalHeight;

    if (sizeChanged) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      bandPaintCacheRef.current.clear();
    }

    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;

    if (canvas.style.width !== cssWidth) {
      canvas.style.width = cssWidth;
    }

    if (canvas.style.height !== cssHeight) {
      canvas.style.height = cssHeight;
    }

    return sizeChanged;
  }, [height, width]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || !drawProps?.chartWidth || width <= 0 || height <= 0) {
      return false;
    }

    const dpr = resolveTileDpr({ width, height });

    canvas.style.visibility = 'hidden';

    syncCanvasSize(canvas, dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return false;
    }

    ctx.clearRect(0, 0, canvas.width || 1, canvas.height || 1);

    drawChartCanvas({
      ...drawProps,
      ctx,
      canvas,
      dpr,
      tileViewport: {
        x: tile.left,
        y: 0,
        width,
        height,
        startIndex: tile.startIndex,
        endIndex: tile.endIndex,
        paintStartIndex: tile.paintStartIndex,
        paintEndIndex: tile.paintEndIndex,
      },
      measureTextWidth,
      bandPaintCache: bandPaintCacheRef.current,
      textLayoutCache,
    });

    canvas.style.visibility = 'visible';

    return true;
  }, [
    drawProps,
    height,
    measureTextWidth,
    syncCanvasSize,
    textLayoutCache,
    tile,
    width,
  ]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    canvas.style.visibility = 'hidden';

    const didDraw = draw();

    if (!didDraw) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
    }

    return undefined;
  }, [draw, resizeVersion]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: `${tile.left}px`,
        top: 0,
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        visibility: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      data-chart-canvas-overlay={dataChartCanvasOverlay ? 'true' : undefined}
      data-chart-canvas-tile="true"
      data-tile-start-index={tile.startIndex}
      data-tile-end-index={tile.endIndex}
      data-tile-paint-start-index={tile.paintStartIndex}
      data-tile-paint-end-index={tile.paintEndIndex}
      aria-hidden="true"
    />
  );
};

export default React.memo(CanvasTile);
