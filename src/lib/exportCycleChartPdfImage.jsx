import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FertilityChartPdf, { preparePdfChart } from '@/components/export/FertilityChartPdf';

async function rasterizePdfSvg(markup, layout, pixelRatio = 240 / 72) {
  if (typeof window === 'undefined') throw new Error('La exportación de gráfica requiere un navegador.');
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  const canvas = document.createElement('canvas');
  // Bound peak memory for Safari; rendering is sequential and never exceeds 3 MP.
  const ratio = Math.min(Math.max(1, pixelRatio), Math.sqrt(3_000_000 / (layout.width * layout.height)), 4096 / Math.max(layout.width, layout.height));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('No se pudo cargar la gráfica PDF.'));
      image.src = url;
    });
    canvas.width = Math.floor(layout.width * ratio);
    canvas.height = Math.floor(layout.height * ratio);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo inicializar canvas para exportar.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), widthPt: layout.width, heightPt: layout.height };
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
    canvas.width = canvas.height = 1;
  }
}

export async function renderCycleChartPdfToPng({ entries, includeRs = true, temperatureRange, layout: prepared, pixelRatio }) {
  const layout = prepared ?? preparePdfChart(entries, includeRs, temperatureRange);
  const markup = renderToStaticMarkup(<FertilityChartPdf entries={entries} layout={layout} />);
  return rasterizePdfSvg(markup, layout, pixelRatio);
}

// Helvetica in jsPDF cannot represent arbitrary Unicode. Use the browser's font
// fallback only for those annotations, keeping ordinary notes searchable text.
export const wrapPdfUnicodeNote = (text, widthPt) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = '9px Arial';
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      if (line && context.measureText(line + token).width > widthPt - 2) { lines.push(line); line = ''; }
      if (context.measureText(token).width <= widthPt - 2) { line += token; continue; }
      const characters = typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(token), part => part.segment)
        : Array.from(token);
      for (const character of characters) {
        if (line && context.measureText(line + character).width > widthPt - 2) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
};

export const renderPdfUnicodeNote = (lines, widthPt) => {
  const lineHeight = 4 * 72 / 25.4;
  const height = lines.length * lineHeight;
  const markup = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={widthPt} height={height}>
    <rect width={widthPt} height={height} fill="#fff" />
    {lines.map((line, i) => <text key={i} x="0" y={9 + i * lineHeight} fontFamily="Arial, sans-serif" fontSize="9" fill="#475569">{line}</text>)}
  </svg>);
  return rasterizePdfSvg(markup, { width: widthPt, height });
};

export default renderCycleChartPdfToPng;
