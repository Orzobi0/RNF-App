// Synthetic data only; no login or remote services. Uses an existing Playwright installation.
// Run: node scripts/pdf-export-browser.test.mjs [--baseline]
// Set PLAYWRIGHT_MODULE to a playwright/playwright-core module path if needed.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.firebase/browser-tests/node_modules/playwright-core');
const baseline = process.argv.includes('--baseline');
await mkdir('tmp/pdfs', { recursive: true });
const bundle = await build({
  stdin: { contents: `export * from './src/lib/cycleExport.js'; export * from './src/components/export/FertilityChartPdf.jsx'; export * from './src/lib/exportCycleChartPdfImage.jsx'; export {default as Chart} from './src/components/export/FertilityChartPdf.jsx'; export {renderToStaticMarkup} from 'react-dom/server'; export {default as React} from 'react';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'pdfExport',
  alias: { '@': path.resolve('src') }, define: { 'import.meta': '{"env":{}}' },
  plugins: [{ name: 'no-firebase', setup(b) {
    b.onResolve({ filter: /firebaseClient$/ }, () => ({ path: 'firebase', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const db = null;' }));
  } }],
});
const browser = await chromium.launch({ headless: true, channel: process.env.PDF_BROWSER_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  await page.route('**/*', r => r.abort());
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async ({ baseline }) => {
    const api = window.pdfExport;
    const makeCycle = (n, verbose = false) => {
      const date = i => new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10);
      return { startDate: date(0), endDate: date(n - 1), data: Array.from({ length: n }, (_, i) => ({
        id: `synthetic-${i}`, cycleDay: i + 1, isoDate: date(i),
        temperature_raw: i % 7 === 3 ? null : 36.3 + (i % 9) * 0.07,
        ignored: i === 8, temperature_corrected: i === 4 ? 36.6 : null, use_corrected: i === 4,
        fertility_symbol: ['red', 'green', 'yellow', 'white', 'spot'][i % 5],
        peakStatus: i === 12 ? 'P' : i > 12 && i < 16 ? String(i - 12) : null,
        mucusSensation: verbose ? 'Sensación húmeda' : '', mucusAppearance: verbose ? 'Transparente y elástico' : '',
        observations: verbose ? (i === 5 ? 'Observación extensa con saltos.\n' + 'Texto completo de prueba. '.repeat(900) + 'FIN-EXTREMO' : `Observación del día ${i + 1}. Sin información personal.`) : '',
        had_relations: i % 4 === 0,
      })) };
    };
    window.makePdfTestCycle = makeCycle;
    if (!baseline) {
      const check = (v, label) => { if (!v) throw Error(label); };
      const points = days => days.map((day, index) => ({ cycleDay: day, index: day - 1, displayTemperature: 36.5, ignored: false }));
      const paths = days => api.buildTemperaturePaths(points(days), x => x, y => y);
      const segments = d => (d.match(/ L /g) || []).length;
      check(segments(paths([1,2,3]).mainPath) === 2 && !paths([1,2,3]).gapConnectorPath, 'consecutive points');
      check(!paths([1,3]).mainPath && segments(paths([1,3]).gapConnectorPath) === 1, 'single gap');
      check(segments(paths([1,2,4,5,8]).mainPath) === 2 && segments(paths([1,2,4,5,8]).gapConnectorPath) === 2, 'multiple gaps without duplicates');
      const ignored = points([1,2,3]); ignored[1].ignored = true;
      check(!api.buildTemperaturePaths(ignored, x=>x, y=>y).mainPath, 'ignored point excluded from solid path');
      const selected = api.resolveTemperaturePoint({ displayTemperature: 30, measurements: [{selected:false,temperature:40}, {selected:true,temperature:36.2,temperature_corrected:36.6,use_corrected:true,ignored:true}] },0);
      check(selected.displayTemperature === 36.6 && selected.raw === 36.2 && selected.hasCorrection && selected.ignored, 'selected measurement overrides stale summary');
      const range = api.getCycleTemperatureRange([{temperature_raw:35.2,ignored:true},{temperature_raw:38.2,temperature_corrected:36.5,use_corrected:true}]);
      check(range.minTemp < 35.2 && range.maxTemp > 38.2, 'range contains ignored and original values');
      const widths = [];
      for (const n of [10,25,31,32,65,217]) {
        const cycle = makeCycle(n);
        const blocks = api.buildFixedChartSegments(cycle.data);
        check(blocks.reduce((sum,b)=>sum+b.visibleDays,0) === n, 'segmentation preserves days');
        for (const block of blocks) {
          const entries = cycle.data.slice(block.startIndex,block.endExclusive);
          const layout = api.preparePdfChart(entries,true,range);
          widths.push(layout.colW);
          check(layout.minTemp === range.minTemp && layout.maxTemp === range.maxTemp, 'shared range');
          const paths = api.buildTemperaturePaths(layout.points,x=>x,y=>y);
          check(!paths.mainPath.includes('NaN') && !paths.gapConnectorPath.includes('NaN'), 'local block paths');
          document.body.innerHTML = api.renderToStaticMarkup(api.React.createElement(api.Chart,{entries,layout}));
          const svg = document.querySelector('svg');
          for (const text of svg.querySelectorAll('text')) {
            const box = text.getBBox();
            check(box.x >= -0.1 && box.x + box.width <= layout.width + 0.1 && box.y >= -0.1 && box.y + box.height <= layout.height + 0.1, 'SVG text inside bounds: '+text.textContent);
            if (text.getAttribute('text-anchor') === 'middle') check(box.width <= layout.colW - 1, 'cell text fits column');
          }
        }
      }
      check(widths.every(w=>w===widths[0]), 'constant physical day width');
      const long = makeCycle(32,true).data;
      const layout = api.preparePdfChart(long.slice(0,28));
      check(layout.notes.find(n=>n.cycleDay===6 && n.label==='Observaciones').text === long[5].observations, 'complete extreme observation');
      check(api.getPdfCellLines('Sí')[0] === 'Sí' && api.getPdfCellLines('W'.repeat(200)) === null, 'short and unbroken long words');
      check(api.preparePdfChart(makeCycle(10).data,false).rows.every(r=>r.key!=='had_relations'), 'hide relations');
      check(api.getPdfCellLines('WWWW') === null, 'wide glyphs go to notes');
      const unicode = 'Observación 🩷: “texto íntegro”, 漢字. '.repeat(50);
      check(api.wrapPdfUnicodeNote(unicode, 300).join('') === unicode, 'Unicode text retained');
    }
    const unicodeCycle = makeCycle(10);
    unicodeCycle.data[0].observations = 'Observación 🩷: “texto íntegro”, 漢字.\n' + 'Texto con emoji 🌸 y letras acentuadas. '.repeat(50);
    const shortNotes = makeCycle(31);
    shortNotes.data.forEach(e => { e.observations = 'Sí\nNo'; });
    const tallBlocks = makeCycle(62);
    tallBlocks.data.forEach(e => { e.observations = e.mucusSensation = e.mucusAppearance = 'Sí\nNo'; });
    const current = makeCycle(10); current.startDate = new Date(Date.now() - 9 * 86400000).toISOString().slice(0,10); delete current.endDate;
    const scenarios = baseline ? [['reference', [makeCycle(125)], { chartOnly: true }]] : [
      ...[10,25,31,32,65,217].map(n => [`days-${n}`, [makeCycle(n)], { chartOnly: true }]),
      ['reference', [makeCycle(125)], { chartOnly: true }],
      ['notes', [makeCycle(32, true)], { chartOnly: true }],
      ['multiple', [makeCycle(10), makeCycle(25)], { chartOnly: true, includeRs: false }],
      ['table', [makeCycle(10)], { includeChart: false }],
      ['both', [makeCycle(32)], { includeRs: false }],
      ['unicode', [unicodeCycle], { chartOnly: true }],
      ['short-notes', [shortNotes], { chartOnly: true }],
      ['tall-blocks', [tallBlocks], { chartOnly: true }],
      ['current', [current], { chartOnly: true }],
    ];
    const files = [];
    for (const [name, cycles, options] of scenarios) {
      const start = performance.now();
      const blob = await api.buildCyclesPdfBlob(cycles, options);
      window.lastPdfTestBlob = blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      files.push({ name, size: blob.size, ms: Math.round(performance.now() - start), data: btoa(binary) });
    }
    return files;
  }, { baseline });
  for (const file of result) {
    assert(file.size > 1000);
    if (!baseline && file.name === 'reference') assert(file.size < 5_000_000);
    await writeFile(`tmp/pdfs/${baseline ? 'before-' : ''}${file.name}.pdf`, Buffer.from(file.data, 'base64'));
    console.log(JSON.stringify({ name: file.name, bytes: file.size, ms: file.ms }));
  }
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.pdfExport.downloadBlobAsFile(window.lastPdfTestBlob, 'export-test.pdf'));
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'export-test.pdf');
  assert.equal((await stat(await download.path())).size, result.at(-1).size);
  console.log('PASS: thermal paths, selection, fixed columns, text bounds, full notes and actual PDF download');
} finally { await browser.close(); }
