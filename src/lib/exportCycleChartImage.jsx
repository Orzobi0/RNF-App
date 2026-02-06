import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import FertilityChart from '@/components/FertilityChart';

async function waitForSvgReady(container, timeoutMs = 2500) {
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    const svg = container.querySelector('svg');
    if (svg) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) return svg;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }

  throw new Error('No se pudo renderizar el SVG del gráfico (timeout).');
}
function copyCssVars(fromEl, toEl) {
  const vars = [
    '--phase-rel',
    '--phase-fertile',
    '--phase-post',
    '--phase-post-abs',
    '--phase-rel-stop',
    '--phase-fertile-stop',
    '--phase-post-stop',
    '--phase-post-abs-stop',
    '--phase-text-shadow',
  ];
  const cs = getComputedStyle(fromEl);
  vars.forEach((name) => {
    const v = cs.getPropertyValue(name);
    if (v && v.trim()) toEl.style.setProperty(name, v.trim());
  });
}

async function svgToPngDataUrl(svgEl, { widthPx, heightPx, pixelRatio = 2, background = '#ffffff' }) {
  const xmlns = 'http://www.w3.org/2000/svg';
  const cloned = svgEl.cloneNode(true);

  // Fija tamaño para evitar export a 0x0
  cloned.setAttribute('width', String(widthPx));
  cloned.setAttribute('height', String(heightPx));

  // Si en el SVG usas CSS vars, cópialas para que no se “pierdan”
  copyCssVars(svgEl, cloned);

  // Fondo blanco dentro del SVG (si no, puede salir transparente)
  const bg = document.createElementNS(xmlns, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', background);
  cloned.insertBefore(bg, cloned.firstChild);

  const svgStr = new XMLSerializer().serializeToString(cloned);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPx * pixelRatio);
  canvas.height = Math.round(heightPx * pixelRatio);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, widthPx, heightPx);


  return canvas.toDataURL('image/png');
}

async function assertPngNotBlank(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  // Reducimos a una muestra pequeña para detectar si todo es blanco/trasparente
  const w = Math.min(img.width, 220);
  const h = Math.min(img.height, 220);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Muestra cada ~25 píxeles. Si encontramos algo "no blanco", no es blank.
  for (let i = 0; i < data.length; i += 4 * 25) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Si hay algo visible y suficientemente distinto de blanco -> OK
    if (a > 10 && (r < 245 || g < 245 || b < 245)) {
      return;
    }
  }

  throw new Error('PNG generado en blanco');
}
async function trimWhiteBorderPng(
  dataUrl,
  {
    threshold = 248,      // cuanto más alto, más “blanco” considera
    alphaThreshold = 10,
    padding = 12,         // deja un margen pequeño para no cortar texto
    sampleMax = 700,      // para escanear rápido
  } = {},
) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const w = img.width;
  const h = img.height;

  // Escaneo en versión reducida (más rápido)
  const scale = Math.min(1, sampleMax / w);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const sCanvas = document.createElement('canvas');
  sCanvas.width = sw;
  sCanvas.height = sh;
  const sCtx = sCanvas.getContext('2d');
  sCtx.drawImage(img, 0, 0, sw, sh);

  const { data } = sCtx.getImageData(0, 0, sw, sh);

  let minX = sw, minY = sh, maxX = -1, maxY = -1;

  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = (y * sw + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Pixel “no blanco”
      const visible = a > alphaThreshold;
      const notWhite = r < threshold || g < threshold || b < threshold;

      if (visible && notWhite) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Si no encuentra nada (todo blanco), no recorta
  if (maxX < 0 || maxY < 0) {
    return { dataUrl, widthPx: w, heightPx: h };
  }

  // Pasar a coordenadas originales
  const inv = 1 / scale;
  let left = Math.floor(minX * inv);
  let top = Math.floor(minY * inv);
  let right = Math.ceil((maxX + 1) * inv);
  let bottom = Math.ceil((maxY + 1) * inv);

  // Añadir padding
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(w, right + padding);
  bottom = Math.min(h, bottom + padding);

  const outW = Math.max(1, right - left);
  const outH = Math.max(1, bottom - top);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const oCtx = outCanvas.getContext('2d');

  // Fondo blanco para evitar transparencias raras
  oCtx.fillStyle = '#ffffff';
  oCtx.fillRect(0, 0, outW, outH);

  oCtx.drawImage(img, left, top, outW, outH, 0, 0, outW, outH);

  return { dataUrl: outCanvas.toDataURL('image/png'), widthPx: outW, heightPx: outH };
}


export async function renderCycleChartToPng({
  cycle,
  entries,
  widthPx,
  heightPx,
 pixelRatio = 1.5,
  visibleDays,
  initialScrollIndex = 0,
}) {
  if (typeof window === 'undefined') {
    throw new Error('renderCycleChartToPng solo está disponible en el navegador.');
  }

  const safeVisibleDays = Math.max(
    Number.isFinite(Number(visibleDays)) ? Number(visibleDays) : (entries?.length ?? 0),
    1,
  );
  const maxStart = Math.max((entries?.length ?? 1) - 1, 0);
  const safeInitialScrollIndex = Math.min(
    Math.max(Number.isFinite(Number(initialScrollIndex)) ? Number(initialScrollIndex) : 0, 0),
    maxStart,
  );
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${widthPx}px`;
  container.style.height = `${heightPx}px`;
  container.style.background = '#ffffff';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';

  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    flushSync(() => {
      root.render(
      <FertilityChart
        data={entries}
        isFullScreen={true}
        orientation="landscape"
        onToggleIgnore={() => {}}
        onEdit={() => {}}
        onTogglePeak={() => {}}
        cycleId={`${cycle?.id ?? 'export'}-${entries?.[0]?.isoDate ?? 'seg'}`}
        initialScrollIndex={safeInitialScrollIndex}
        visibleDays={safeVisibleDays}
        showInterpretation={false}
        reduceMotion
        forceLandscape
        currentPeakIsoDate={null}
        showRelationsRow={false}
        fertilityStartConfig={null}
        fertilityCalculatorCycles={[]}
        fertilityCalculatorCandidates={null}
        onShowPhaseInfo={null}
        isArchivedCycle={false}
        cycleEndDate={cycle?.endDate ?? null}
        exportMode
      />
    );
    });

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
      // Asegura render síncrono (React 18 puede diferir el render)
    flushSync(() => {});

    // Espera a fuentes y a que exista el SVG con tamaño
    if (document.fonts?.ready) await document.fonts.ready;

    const svg = await waitForSvgReady(container);

    // Exporta el SVG real a PNG (esto sí respeta gradientes/defs del chart)
    const dataUrl = await svgToPngDataUrl(svg, {
  widthPx,
  heightPx,
  pixelRatio,
  background: '#ffffff',
});

await assertPngNotBlank(dataUrl);

// Recorta bordes blancos y devuelve el PNG “apretado”
const trimmed = await trimWhiteBorderPng(dataUrl, { padding: 12 });

return {
  dataUrl: trimmed.dataUrl,
  widthPx: trimmed.widthPx,
  heightPx: trimmed.heightPx,
};



  } finally {
    root.unmount();
    container.remove();
  }
}