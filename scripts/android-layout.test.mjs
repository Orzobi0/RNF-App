import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createEmbeddedCycleLoader } from '../src/lib/embeddedCycleLoader.js';
import { deferred } from './helpers/load-frontend.mjs';
import postcss from 'postcss';
import { transform } from 'esbuild';
import { loadFrontend, hooks, flush } from './helpers/load-frontend.mjs';

const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
const nodes = tree => !tree || typeof tree !== 'object' ? []
  : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
async function fixture({ state = null, pathname = '/', platform = 'android' } = {}) {
  let retries = 0;
  const effects = [], layouts = [], calls = [], events = new Map();
  const bindings = { ...hooks().bindings,
    useEffect: fn => effects.push(fn), useLayoutEffect: fn => layouts.push(fn),
    useCycleDataContext: () => ({ dataAvailability: state, refreshData: () => { retries++; } }),
    useLocation: () => ({ pathname }), BottomNav: 'BottomNav', WifiOff: 'WifiOff',
    ...Object.fromEntries(['Dialog', 'DialogTrigger', 'DialogContent', 'DialogTitle', 'DialogDescription'].map(n => [n, n])),
    Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform },
    SystemBars: { setStyle: async opts => calls.push(['style', opts]) }, SystemBarsStyle: { Light: 'LIGHT' },
    window: { FertiliAppStatusBar: { setColor: color => calls.push(['color', color]) } },
    document: { visibilityState: 'visible', querySelector: () => ({ setAttribute: (_, color) => calls.push(['meta', color]) }),
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  };
  const module = await loadFrontend('src/components/layout/MainLayout.jsx', bindings,
    ['MainLayout', 'CycleAvailability', 'CycleAvailabilityIndicator', 'getStatusBarColor']);
  return { ...module, effects, layouts, calls, events, retries: () => retries };
}

test('Staging and production share layout and fixed native text zoom', async () => {
  const source = await read('src/components/layout/MainLayout.jsx');
  assert.doesNotMatch(source, /isStaging|Entorno de pruebas|VITE_APP_ENV/);
  const activity = await read('android/app/src/main/java/com/fertiliapp/fertiliapp/MainActivity.java');
  assert.match(activity, /getSettings\(\)\.setTextZoom\(100\)/);
  assert.doesNotMatch(activity, /endsWith\("\.staging"\)/);
});

test('all settings descendants use slate; general and archived screens use rose', async () => {
  const f = await fixture();
  for (const path of ['/settings', '/settings/preferences', '/settings/devices', '/settings/devices/vinca2', '/settings/support']) {
    assert.equal(f.getStatusBarColor(path), '#F8FAFC');
  }
  for (const path of ['/', '/records', '/chart', '/chart/archived', '/cycle/archived', '/archived-cycles']) {
    assert.equal(f.getStatusBarColor(path), '#FFF7F9');
  }
});

test('SystemBars owns dark icons; visibility restores style and route background', async () => {
  const f = await fixture({ pathname: '/settings/devices' });
  const tree = f.MainLayout({ children: 'content' });
  assert.equal(tree.props.style['--status-bar-color'], '#F8FAFC');
  f.layouts.forEach(fn => fn());
  const cleanup = f.effects.map(fn => fn());
  await flush();
  assert.deepEqual(f.calls.slice(-2), [['style', { style: 'LIGHT' }], ['color', '#F8FAFC']]);
  f.events.get('visibilitychange')(); await flush();
  assert.deepEqual(f.calls.at(-1), ['color', '#F8FAFC']);
  cleanup.forEach(fn => fn?.()); assert.equal(f.events.size, 0);
  const activity = await read('android/app/src/main/java/com/fertiliapp/fertiliapp/MainActivity.java');
  assert.doesNotMatch(activity, /SYSTEM_UI_FLAG|setSystemUiVisibility|setAppearanceLight/);
  assert.match(activity, /setBackgroundColor\(background\)/);
  const config = await read('capacitor.config.ts');
  assert.match(config, /insetsHandling: 'css'.*initialViewportFitValueHint: 'cover'.*style: 'LIGHT'/);
});

test('cached offline/error state leaves content alone and offers accessible detail + existing retry', async () => {
  for (const knownOffline of [true, false]) {
    const f = await fixture({ state: { hasData: true, phase: 'cached', knownOffline, serverReadFailed: !knownOffline } });
    assert.equal(f.CycleAvailability({ children: 'cycles' }), 'cycles');
    const indicator = f.CycleAvailabilityIndicator();
    const buttons = nodes(indicator).filter(n => n.type === 'button');
    assert.match(buttons[0].props['aria-label'], /Estado de conexión/);
    assert.match(JSON.stringify(indicator), knownOffline ? /Sin conexión conocida/ : /Firebase no ha podido actualizar/);
    assert.match(JSON.stringify(indicator), /podrían no estar actualizados/);
    buttons[1].props.onClick(); assert.equal(f.retries(), 1);
    const layout = f.MainLayout({ children: 'cycles' });
    assert.equal(nodes(layout).find(n => n.type === 'BottomNav').props.availabilityIndicator, undefined);
  }
});

test('no indicator for ready, ordinary refresh, web state or missing cache', async () => {
  for (const state of [null, { hasData: true, phase: 'cached', serverReadFailed: false }, { hasData: true, phase: 'ready' }, { hasData: true, phase: 'refreshing' }, { hasData: false, phase: 'unavailable', knownOffline: true }]) {
    assert.equal((await fixture({ state })).CycleAvailabilityIndicator(), null);
  }
});

test('missing data remains visible and retryable; settings remain accessible', async () => {
  for (const pathname of ['/records', '/settings/devices']) {
    const f = await fixture({ pathname, state: { hasData: false, phase: 'unavailable', knownOffline: true } });
    const tree = f.CycleAvailability({ children: 'cycles-or-settings' });
    assert.match(JSON.stringify(tree), /Sin conexión y sin datos/);
    assert.equal(JSON.stringify(tree).includes('cycles-or-settings'), pathname.startsWith('/settings'));
    nodes(tree).find(n => n.type === 'button').props.onClick(); assert.equal(f.retries(), 1);
  }
});

test('web and iOS preserve env padding, default theme and never call native controls', async () => {
  for (const platform of ['web', 'ios']) {
    const f = await fixture({ platform, pathname: '/settings' });
    const tree = f.MainLayout({ children: 'content' });
    assert.equal(tree.props.style, undefined);
    assert.doesNotMatch(tree.props.className, /android-layout/);
    assert.match(nodes(tree).find(n => n.type === 'main').props.className, /pt-\[env\(safe-area-inset-top\)\]/);
    f.layouts.forEach(fn => fn()); f.effects.forEach(fn => fn());
    assert.deepEqual(f.calls, [['meta', '#FFE4E6']]);
  }
});

test('Android safe area has one owner outside scroll; native zero is not added to env', async () => {
  const root = postcss.parse(await read('src/index.css'));
  const declarations = selector => {
    const result = {};
    root.walkRules(selector, rule => rule.walkDecls(d => { result[d.prop] = d.value; }));
    return result;
  };
  const layout = declarations('.android-layout');
  assert.equal(layout['--safe-top'], 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))');
  assert.equal(layout['padding-top'], 'var(--safe-top)');
  assert.equal(layout['--safe-bottom-clamped'], 'var(--safe-bottom)');
  assert.equal(layout['--bottom-nav-safe'], 'calc(var(--bottom-nav-height) + var(--safe-bottom-clamped))');
  assert.equal(declarations('.android-layout > .android-main')['padding-top'], '0');
  assert.equal(declarations('.android-layout > .android-main')['min-height'], '0');
  assert.equal(declarations('.android-layout > .status-bar-surface').height, 'var(--safe-top)');
  assert.equal(declarations(':root')['--safe-bottom'], 'env(safe-area-inset-bottom, 0px)');
  assert.equal(declarations('.android-chart-scroll')['scrollbar-color'], '#cbd5e1 transparent');
  assert.equal(declarations('.android-chart-scroll').overflow, undefined);
});

test('navigation always has exactly five original destinations and columns', async () => {
  const { BottomNav } = await loadFrontend('src/components/layout/BottomNav.jsx', {
    ...hooks().bindings, useMatch: () => null, NavLink: 'NavLink', Heart: 'Heart', ChartSpline: 'ChartSpline', Calendar: 'Calendar', Archive: 'Archive', UserRoundCog: 'UserRoundCog',
  }, ['BottomNav']);
  const normal = BottomNav({}), offline = BottomNav({ availabilityIndicator: 'status' });
  assert.equal(normal.props.className, offline.props.className);
  for (const tree of [normal, offline]) {
    assert.deepEqual(nodes(tree).filter(n => n.type === 'NavLink').map(n => n.props.to), ['/records', '/chart', '/', '/archived-cycles', '/settings']);
  }
  assert.equal(nodes(offline).filter(n => n.type === 'li').length, 5);
  assert.match(nodes(offline).find(n => n.type === 'ul').props.className, /grid-cols-5/);
  assert.doesNotMatch(await read('src/components/ChartControls.jsx'), /CycleAvailabilityIndicator/);
});

test('changed JSX and Capacitor config parse without a build', async () => {
  for (const file of ['src/components/layout/MainLayout.jsx', 'src/components/layout/BottomNav.jsx', 'src/components/ChartControls.jsx', 'capacitor.config.ts', ...['DashboardPage', 'ArchivedCyclesPage', 'SettingsPage', 'DevicesPage', 'PreferencesPage', 'ContactSupportPage', 'ChartPage'].map(p => `src/pages/${p}.jsx`)]) {
    await transform(await read(file), { loader: file.endsWith('.ts') ? 'ts' : 'jsx' });
  }
});


test('native top matches actual page CSS and chart surface, while web ignores override', async () => {
  assert.match(await read('src/index.css'), /background: #FFF7F9/);
  for (const file of ['DashboardPage', 'ArchivedCyclesPage', 'RecordsPage']) {
    assert.match(await read(`src/pages/${file}.jsx`), /bg-\[#fff7f9\]/i);
  }
  for (const file of ['SettingsPage', 'DevicesPage', 'PreferencesPage', 'ContactSupportPage']) {
    assert.match(await read(`src/pages/${file}.jsx`), /bg-slate-50/);
  }
  const chart = await read('src/pages/ChartPage.jsx');
  assert.match(chart, /backgroundColor: '#FFF8FA'/);
  assert.match(chart, /statusBarBackground=\{baseStyle.backgroundColor\}/);
  for (const platform of ['android', 'web', 'ios']) {
    const f = await fixture({ platform, pathname: '/chart' });
    const tree = f.MainLayout({ children: 'chart', statusBarBackground: '#FFF8FA' });
    const surface = nodes(tree).find(n => n.props?.className?.includes('status-bar-surface'));
    assert.equal(surface.props.style.backgroundColor, platform === 'android' ? '#FFF8FA' : '#FFE4E6');
  }
});

async function assertIndicator(state, visible) {
  const f = await fixture({ state });
  assert.equal(f.CycleAvailabilityIndicator() !== null, visible, JSON.stringify(state));
}
const cycleSnapshot = { currentCycle: { id: 'c', data: [] }, archivedCycles: [] };
test('real loader: cached startup never warns while Firebase is pending or after success', async () => {
  const response = deferred(), states = [];
  const loader = createEmbeddedCycleLoader({ accountId: 'a', readCache: async () => cycleSnapshot,
    readServer: () => response.promise, saveCache: async () => {}, offline: () => false,
    onState: state => states.push(state), timeoutMs: 1000 });
  const task = loader.load(); await flush();
  assert.equal(states.at(-1).phase, 'cached');
  await assertIndicator(states.at(-1), false);
  response.resolve(cycleSnapshot); await task;
  for (const state of states) await assertIndicator(state, false);
  assert.equal(states.at(-1).phase, 'ready');
});

test('real loader: offline, rejection and timeout warn; retry joins pending read and recovery clears warning', async () => {
  for (const scenario of ['offline', 'reject', 'timeout']) {
    let offline = scenario === 'offline', state, reads = 0, fail = scenario === 'reject';
    const response = deferred();
    const loader = createEmbeddedCycleLoader({ accountId: 'a', readCache: async () => cycleSnapshot,
      readServer: () => { reads++; return fail ? Promise.reject(Error('unavailable')) : scenario === 'timeout' ? response.promise : Promise.resolve(cycleSnapshot); },
      saveCache: async () => {}, offline: () => offline, onState: s => { state = s; }, timeoutMs: 15 });
    await loader.load(); await assertIndicator(state, true);
    if (scenario === 'offline') assert.equal(reads, 0);
    else assert.equal(state.serverReadFailed, true);
    offline = false; fail = false;
    const retry = loader.load();
    response.resolve(cycleSnapshot); await retry;
    await assertIndicator(state, false);
    assert.equal(state.serverReadFailed, false);
    assert.equal(reads, scenario === 'reject' ? 2 : 1);
  }
});

test('indicator uses explicit header slots; no global overlay or nav insertion', async () => {
  for (const file of ['DashboardPage', 'ArchivedCyclesPage', 'SettingsPage', 'DevicesPage', 'PreferencesPage', 'ContactSupportPage']) {
    assert.match(await read(`src/pages/${file}.jsx`), /<CycleAvailabilityIndicator \/>/);
  }
  const source = await read('src/components/layout/MainLayout.jsx');
  assert.doesNotMatch(source, /availabilityIndicator=/);
  const f = await fixture({ state: { hasData: true, knownOffline: true } });
  const button = nodes(f.CycleAvailabilityIndicator()).find(n => n.type === 'button');
  assert.doesNotMatch(button.props.className, /fixed|absolute/);
  assert.match(button.props.className, /h-8 w-8/);
});


test('native reconnect keeps cached warning while Firebase confirmation is pending', async () => {
  const f = await fixture({ state: { hasData: true, phase: 'refreshing', knownOffline: false, serverReadFailed: false, needsServerConfirmation: true } });
  const indicator = f.CycleAvailabilityIndicator();
  assert.ok(indicator);
  assert.match(JSON.stringify(indicator), /Comprobando actualización desde Firebase/);
  assert.equal(nodes(indicator).filter(n => n.type === 'button')[1].props.disabled, true);
});
