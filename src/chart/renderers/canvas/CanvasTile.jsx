import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  dataChartCanvasOverlay = true,
}) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const bandPaintCacheRef = useRef(new Map());
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

  const width = Math.max(1, Number(tile?.width) || 1);
  const height = Math.max(1, Number(tile?.height) || Number(drawProps?.contentHeight) || 1);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const nextDpr = resolveTileDpr({ width, height });
    const physicalWidth = Math.max(1, Math.floor(width * nextDpr));
    const physicalHeight = Math.max(1, Math.floor(height * nextDpr));

    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      bandPaintCacheRef.current.clear();
    }

    setDevicePixelRatio((prev) => (prev === nextDpr ? prev : nextDpr));
  }, [height, width]);

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drawProps?.chartWidth || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawChartCanvas({
      ...drawProps,
      ctx,
      canvas,
      dpr: devicePixelRatio,
      tileViewport: {
        x: tile.left,
        y: 0,
        width,
        height,
        startIndex: tile.startIndex,
        endIndex: tile.endIndex,
      },
      measureTextWidth,
      bandPaintCache: bandPaintCacheRef.current,
      textLayoutCache,
    });
  }, [devicePixelRatio, drawProps, height, measureTextWidth, textLayoutCache, tile, width]);

  useEffect(() => {
    syncCanvasSize();
  }, [syncCanvasSize]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onResize = () => {
      syncCanvasSize();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw, syncCanvasSize]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

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
        zIndex: 0,
        pointerEvents: 'none',
      }}
      width={Math.max(1, Math.floor(width * devicePixelRatio))}
      height={Math.max(1, Math.floor(height * devicePixelRatio))}
      data-chart-canvas-overlay={dataChartCanvasOverlay ? 'true' : undefined}
      data-chart-canvas-tile="true"
      data-tile-start-index={tile.startIndex}
      data-tile-end-index={tile.endIndex}
      aria-hidden="true"
    />
  );
};

export default React.memo(CanvasTile);
