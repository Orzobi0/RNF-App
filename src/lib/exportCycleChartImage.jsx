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

export async function renderCycleChartToPng({
  cycle,
  entries,
  widthPx,
  heightPx,
 pixelRatio = 1.5,
}) {
  if (typeof window === 'undefined') {
    throw new Error('renderCycleChartToPng solo está disponible en el navegador.');
  }

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
        cycleId={cycle?.id ?? 'export'}
        initialScrollIndex={0}
        visibleDays={Math.max(entries?.length ?? 0, 1)}
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
    return { dataUrl, widthPx, heightPx };


  } finally {
    root.unmount();
    container.remove();
  }
}