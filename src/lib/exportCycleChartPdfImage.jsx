import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FertilityChartPdf from '@/components/export/FertilityChartPdf';

const loadSvgImage = (svgMarkup, widthPx, heightPx) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el SVG generado para exportación.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    img.width = widthPx;
    img.height = heightPx;
  });

export async function renderCycleChartPdfToPng({
  entries,
  widthPx,
  heightPx,
  title,
  includeRs = true,
  pixelRatio = 2,
}) {
  if (typeof window === 'undefined') {
    throw new Error('renderCycleChartPdfToPng solo está disponible en navegador.');
  }

  const safeWidth = Math.max(640, Math.round(widthPx));
  const safeHeight = Math.max(360, Math.round(heightPx));

  const svgMarkup = renderToStaticMarkup(
    <FertilityChartPdf
      entries={entries}
      width={safeWidth}
      height={safeHeight}
      title={title}
      includeRs={includeRs}
    />,
  );

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  const image = await loadSvgImage(svgMarkup, safeWidth, safeHeight);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(safeWidth * pixelRatio);
  canvas.height = Math.round(safeHeight * pixelRatio);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar canvas para exportación de gráfica PDF.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    svgDataUrl,
    svgMarkup,
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}

export default renderCycleChartPdfToPng;