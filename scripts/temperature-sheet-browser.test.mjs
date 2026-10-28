// Real React components in a local browser, with synthetic records and no network.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('../.firebase/browser-tests/node_modules/playwright-core');
const chart = await readFile('src/pages/ChartPage.jsx', 'utf8');
const chartOpen = chart.slice(chart.indexOf('  const openTemperatures = async (point, signal)'), chart.indexOf('  const buildChartRecordPayload'));
const entry = `
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DayDetail from './src/components/DayDetail.jsx';
import ChartTooltip from './src/components/chartElements/ChartTooltip.jsx';
import TemperatureMeasurementsSheet from './src/components/TemperatureMeasurementsSheet.jsx';
import { loadRecordMeasurements, measurementsFromRecord } from './src/lib/temperatureMeasurements.js';
const rows = [
 { id: 'one', temperature: 36.4, time: '07:00', selected: true, source: 'manual' },
 { id: 'two', temperature: 36.6, time: '08:00', selected: false, source: 'manual' }
];
let pending = [], calls = 0, remoteRows = rows, partial = false;
const fetchRows = (cycle, id, options) => {
 calls++;
 if (!options.requireComplete) throw Error('Missing complete-read requirement');
 return new Promise((resolve, reject) => pending.push({ resolve: () => partial ? reject(Error('incomplete')) : resolve(remoteRows), reject }));
};
function Harness() {
 const [kind, setKind] = useState('day');
 const [record, setRecord] = useState(null);
 const [shown, setShown] = useState(true);
 const [temperatureRecord, setTemperatureRecord] = useState(null);
 const [sheetMeasurements, setSheetMeasurements] = useState([]);
 const sheetLoadVersion = useRef(0);
 const targetCycle = { id: 'cycle', data: record ? [record] : [] };
 const loadTemperatures = (r, options) => loadRecordMeasurements(r, 'cycle', fetchRows, options);
 ${chartOpen}
 const save = async (_, next) => { setRecord(previous => ({ ...previous, measurements: next, measurementsLoaded: true, measurementsComplete: true })); window.saved = next; };
 window.testUI = {
  configure: (mode, count, complete = false, isPartial = false) => {
   calls = 0; pending = []; partial = isPartial; remoteRows = rows.slice(0, count);
   setKind(mode); setShown(true); setTemperatureRecord(null);
   setRecord({ id: 'entry', isoDate: '2026-10-01', temperature_raw: count ? 36.4 : null, observations: 'preserve me', measurements: complete || isPartial ? rows.slice(0, count) : undefined, measurementsLoaded: complete, measurementsComplete: complete && !isPartial });
  },
  resolve: () => pending.shift()?.resolve(), reject: () => pending.shift()?.reject(Error('offline')),
  calls: () => calls, completeNext: () => { partial = false; },
  changeDay: () => setRecord(previous => ({ ...previous, id: 'other', isoDate: '2026-10-02' })),
  unmount: () => setShown(false), record: () => record,
 };
 if (!record || !shown) return null;
 return kind === 'day' ? <DayDetail isoDate={record.isoDate} cycleDay={1} details={{ record, hasTemperature: Boolean(record.temperature_raw) }}
  onLoadMeasurements={loadTemperatures} onSaveMeasurements={save} onClose={() => setShown(false)} />
 : <><ChartTooltip point={record} position={{clientX:180,clientY:180}} chartWidth={390} chartHeight={800}
  onOpenTemperatures={openTemperatures} onClose={() => setShown(false)} />
  <TemperatureMeasurementsSheet open={Boolean(temperatureRecord)} onOpenChange={value => !value && setTemperatureRecord(null)} isoDate={record.isoDate} measurements={sheetMeasurements} onChange={async next => { await save(record,next); setSheetMeasurements(next); }} /></>;
}
// Keep chart sheet mounted after the tooltip closes, like ChartPage.
const root = createRoot(document.getElementById('root'));
root.render(<Harness />);
`;
// In this harness the successful close hides only the tooltip, not its sibling sheet.
const contents = entry.replace("if (!record || !shown) return null;", "if (!record) return null; if (!shown && !temperatureRecord) return null;")
 .replace(': <><ChartTooltip', ': <>{shown && <ChartTooltip')
 .replace('onOpenTemperatures={openTemperatures} onClose={() => setShown(false)} />', 'onOpenTemperatures={openTemperatures} onClose={() => setShown(false)} />}');
const bundle = await build({ stdin: { contents, resolveDir: process.cwd(), loader:'jsx' }, bundle:true, write:false, format:'iife', alias:{'@':path.resolve('src')}, define:{'process.env.NODE_ENV':'"development"'}, plugins:[{name:'test-auth',setup(b){b.onResolve({filter:/contexts\/AuthContext$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const useAuth = () => ({ preferences: {}, savePreferences: async () => {} });'}));}}] });
const browser = await chromium.launch({headless:true,channel:'msedge'});
let checks = 0;
try {
 const page = await browser.newPage({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/*', route => route.abort());
 await page.setContent('<html><body><div id="root"></div></body></html>');
 const css = (await readdir('dist-staging/assets')).find(f=>f.endsWith('.css'));
 await page.addStyleTag({content:await readFile('dist-staging/assets/'+css,'utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.waitForFunction(()=>window.testUI);
 const configure = async (kind,count,complete=false,partial=false) => {
  await page.evaluate(()=>window.testUI.unmount());
  await page.waitForTimeout(30);
  await page.evaluate(args=>window.testUI.configure(...args),[kind,count,complete,partial]);
  await page.waitForTimeout(500);
 };
 const trigger = () => page.getByRole('button',{name:/^(Gestionar temperaturas|Añadir temperatura)$/});
 const dialog = () => page.getByRole('dialog',{name:'Temperaturas',exact:true});
 const sampleHeights = () => page.evaluate(async () => {
  const heights=[];
  for(let i=0;i<12;i++){await new Promise(requestAnimationFrame); const el=document.querySelector('[role="dialog"]');if(el)heights.push(el.getBoundingClientRect().height);}
  return heights;
 });
 for (const kind of ['day','chart']) {
  for (const count of [0,1,2]) {
   await configure(kind,count);
   const before = await trigger().boundingBox();
   await trigger().click();
   await page.waitForTimeout(120);
   assert.equal(await dialog().count(),0,'sheet stays closed during slow read');
   const after = await page.getByRole('button',{name:'Cancelar carga de temperaturas'}).boundingBox();
   assert.ok(Math.abs(before.height-after.height)<0.1 && Math.abs(before.width-after.width)<0.1,`trigger size unchanged (${kind}, ${count}): ${JSON.stringify({before,after})}`);
   assert.equal(await page.evaluate(()=>window.testUI.calls()),1);
   await page.evaluate(()=>window.testUI.resolve());
   await dialog().waitFor();
   const heights=await sampleHeights();
   assert.ok(heights.length && Math.max(...heights)-Math.min(...heights)<1, 'stable sheet height');
   assert.equal(await page.getByText('Cargando temperaturas…',{exact:true}).count(),0);
   if(count===0) await page.getByRole('button',{name:'Guardar medición',exact:true}).waitFor();
   else assert.equal(await page.getByRole('radio').count(),count);
   await page.getByRole('button',{name:'Cerrar temperaturas'}).click();
   checks++;
  }
  await configure(kind,2,true);
  await trigger().click(); await dialog().waitFor();
  assert.equal(await page.evaluate(()=>window.testUI.calls()),0,'complete data opens without query');
  await page.getByRole('button',{name:'Cerrar temperaturas'}).click(); checks++;
  for(const cancel of ['click','day','unmount']) {
   await configure(kind,2); await trigger().click();
   if(cancel==='click') await page.getByRole('button',{name:'Cancelar carga de temperaturas'}).click();
   if(cancel==='day') await page.evaluate(()=>window.testUI.changeDay());
   if(cancel==='unmount') await page.evaluate(()=>window.testUI.unmount());
   await page.waitForTimeout(30); await page.evaluate(()=>window.testUI.resolve()); await page.waitForTimeout(30);
   assert.equal(await dialog().count(),0,'obsolete read cannot open sheet'); checks++;
  }
  for(const failure of ['partial','offline']) {
   await configure(kind,1,false,failure==='partial'); await trigger().click();
   await page.evaluate(type=>type==='partial'?window.testUI.resolve():window.testUI.reject(),failure);
   await page.getByRole('alert').waitFor(); assert.equal(await dialog().count(),0);
   await page.evaluate(()=>window.testUI.completeNext()); await trigger().click(); await page.evaluate(()=>window.testUI.resolve());
   await dialog().waitFor(); assert.equal(await page.evaluate(()=>window.testUI.calls()),2);
   await page.getByRole('button',{name:'Cerrar temperaturas'}).click(); checks++;
  }
 }
 // Exercise actual sheet actions without replacing the rest of the day's data.
 await configure('day',2,true); await trigger().click(); await dialog().waitFor();
 await page.getByRole('radio').nth(1).check();
 assert.equal(await page.evaluate(()=>window.saved[1].selected),true);
 await page.getByRole('button',{name:'Opciones de medición 1'}).click();
 await page.getByRole('menuitem',{name:'Editar',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Temperatura (°C)',exact:true}).fill('36.45');
 await page.getByRole('button',{name:'Corregir',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Temperatura corregida (opcional)',exact:true}).fill('36.55');
 await page.getByRole('button',{name:'Guardar medición',exact:true}).click();
 await page.getByRole('button',{name:'+ Añadir medición manual',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Temperatura (°C)',exact:true}).fill('36.7');
 await page.getByLabel('Hora de toma',{exact:true}).fill('09:00');
 await page.getByRole('button',{name:'Guardar medición',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.saved.length),3);
 await page.getByRole('button',{name:'Opciones de medición 3'}).click();
 await page.getByRole('menuitem',{name:'Eliminar',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Eliminar',exact:true}).click();
 await page.waitForFunction(()=>window.saved.length===2);
 assert.equal(await page.evaluate(()=>window.saved[0].temperature_corrected),36.55);
 assert.equal(await page.evaluate(()=>window.testUI.record().observations),'preserve me'); checks++;
 assert.deepEqual(errors,[]);
 console.log('PASS: '+checks+' browser scenarios (DayDetail and chart tooltip), stable mobile layout and measurement actions.');
} finally { await browser.close(); }
