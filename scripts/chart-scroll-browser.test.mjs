// Local browser regression using the real chart and synthetic data; no network.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.firebase/browser-tests/node_modules/playwright-core');
const chartPath = path.resolve('src/components/FertilityChart.jsx');
const source = await readFile(chartPath, 'utf8');
const bundle = await build({
 stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
 import React, { useState } from 'react';
 import { createRoot } from 'react-dom/client';
 import FertilityChart from './src/components/FertilityChart.jsx';
 const data = Array.from({length:40},(_,i)=>({id:'day-'+i,isoDate:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),cycleDay:i+1,temperature_raw:36.3+(i%5)*0.1,temperature_chart:36.3+(i%5)*0.1}));
 function Harness(){
  const [props,setProps]=useState({cycleId:'current',data,initialScrollIndex:35,visibleDays:5,orientation:'portrait',isFullScreen:false,forceLandscape:false});
  window.configureChart=patch=>setProps(previous=>({...previous,...patch}));
  window.editDay=patch=>setProps(previous=>({...previous,data:previous.data.map((row,i)=>i===6?{...row,...patch}:row)}));
  window.shortenChart=()=>setProps(previous=>({...previous,data:previous.data.slice(0,8)}));
  return <FertilityChart {...props} reduceMotion={true} />;
 }
 createRoot(document.getElementById('root')).render(<Harness />);` },
 bundle:true,write:false,format:'iife',alias:{'@':path.resolve('src')},define:{'process.env.NODE_ENV':'"development"','import.meta':'{"env":{"DEV":false}}'},
 plugins:[{name:'chart-observation',setup(b){
  b.onLoad({filter:/[\\/]FertilityChart\.jsx$/},()=>({loader:'jsx',resolveDir:path.dirname(chartPath),contents:source.replace('const scrollPositionRef = useRef(null);',`const scrollPositionRef = useRef(null);
  window.chartTest = () => ({node: chartRef.current, x0:getX(0), step:getX(1)-getX(0), dimensions, cycleId});`)}));
 }}],
});
const browser = await chromium.launch({headless:true,channel:'msedge'});
let checks=0;
try {
 for(const ios of [false,true]) {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',...(ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<html><body style="margin:0"><div id="root" style="width:390px;height:700px"></div></body></html>');
  const css=(await readdir('dist-staging/assets')).find(f=>f.endsWith('.css'));
  await page.addStyleTag({content:await readFile('dist-staging/assets/'+css,'utf8')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.chartTest?.().node?.scrollLeft>1000);
  const settle=()=>page.waitForTimeout(250);
  const state=()=>page.evaluate(()=>{const {node,x0,step,cycleId}=window.chartTest();return {left:node.scrollLeft,width:node.clientWidth,max:node.scrollWidth-node.clientWidth,anchor:(node.scrollLeft-x0)/step,cycleId};});
  const seek=async day=>{await page.evaluate(day=>{const {node,x0,step}=window.chartTest();node.scrollLeft=x0+step*day;node.dispatchEvent(new Event('scroll'));},day);await settle();};
  const resize=async(w,h)=>{await page.evaluate(([w,h])=>{const root=document.getElementById('root');root.style.width=w+'px';root.style.height=h+'px';window.dispatchEvent(new Event('resize'));},[w,h]);await settle();};
  let s=await state();assert.ok(Math.abs(s.left-Math.min(s.max,s.width/5*35))<1,'initial current cycle position');checks++;
  await seek(6);
  for(const edit of [
   {temperature_raw:36.7,temperature_chart:36.7},
   {measurements:[{temperature:36.4,selected:false},{temperature:36.8,selected:true}],temperature_chart:36.8},
   {temperature_corrected:36.9,use_corrected:true,temperature_chart:36.9},
   {mucusSensation:'húmeda'},{mucusAppearance:'elástico'},{observations:'edited'},
   {fertility_symbol:'yellow'},{peak_marker:'peak'},{had_relations:true},
  ]){
   const before=await state();await page.evaluate(patch=>window.editDay(patch),edit);await resize(390,520);await resize(390,700);
   const after=await state();assert.ok(Math.abs(after.left-before.left)<1,'editing and sheet viewport changes preserve scroll');checks++;
  }
  for(const h of [490,680,500,700]){const before=await state();await resize(390,h);assert.ok(Math.abs((await state()).left-before.left)<1,'height-only changes');checks++;}
  await page.evaluate(()=>window.configureChart({initialScrollIndex:39}));await settle();assert.ok(Math.abs((await state()).anchor-6)<0.03,'new initial prop ignored within same cycle');checks++;
  for(const w of [600,320,390]) {await resize(w,700);assert.ok(Math.abs((await state()).anchor-6)<0.03,'width changes preserve fractional day');checks++;}
  for(const props of [
   {isFullScreen:true,orientation:'portrait',visibleDays:5},
   {isFullScreen:true,orientation:'landscape',visibleDays:10},
   {isFullScreen:true,orientation:'portrait',forceLandscape:true,visibleDays:10},
   {isFullScreen:false,orientation:'portrait',forceLandscape:false,visibleDays:5},
  ]){
   await page.evaluate(patch=>window.configureChart(patch),props);await settle();
   const result=await state();assert.ok(Math.abs(result.anchor-6)<0.06,`orientation/fullscreen preserves anchor: ${JSON.stringify({props,result,ios})}`);checks++;
  }
  await page.evaluate(()=>window.configureChart({visibleDays:60}));await settle();s=await state();assert.ok(s.left>=0&&s.left<=s.max,'full cycle fits within valid bounds');
  await page.evaluate(()=>window.configureChart({visibleDays:5}));await settle();assert.ok(Math.abs((await state()).anchor-6)<0.06,'return from all-days view restores previous day');checks++;
  await page.evaluate(()=>window.configureChart({cycleId:'archived',initialScrollIndex:30}));await settle();s=await state();assert.ok(Math.abs(s.left-Math.min(s.max,s.width/5*30))<1,'archived cycle initializes');checks++;
  await seek(34);await page.evaluate(()=>window.shortenChart());await settle();s=await state();assert.ok(s.left>=0&&s.left<=s.max,'data shrink clamps to valid bounds');checks++;
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: '+checks+' chart scroll scenarios (mobile viewport and simulated iPhone rotation).');
}finally{await browser.close();}
