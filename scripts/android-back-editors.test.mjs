import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { loadFrontend, hooks, flush } from './helpers/load-frontend.mjs';
import { backLayers, registerBackLayer, androidBackDestination } from '../src/lib/backNavigation.js';


test('Android editor ignores transient visualViewport collapse', async () => {
  const events = [];

  const viewport = {
    height: 430,
    addEventListener: (...args) =>
      events.push(['visual-add', ...args]),
    removeEventListener: (...args) =>
      events.push(['visual-remove', ...args]),
  };

  const win = {
    innerHeight: 844,
    visualViewport: viewport,
    addEventListener: (...args) =>
      events.push(['window-add', ...args]),
    removeEventListener: (...args) =>
      events.push(['window-remove', ...args]),
  };

  let native = true;
  let subscribe;
  let snapshot;

  const { useAndroidEditor } = await loadFrontend(
    'src/hooks/useAndroidEditor.js',
    {
      useCallback: fn => fn,
      useSyncExternalStore: (listen, read) => {
        subscribe = listen;
        snapshot = read;
        return read();
      },
      isNativeAndroid: () => native,
      window: win,
    },
    ['useAndroidEditor'],
    s => s.replace(
      'export default function',
      'function'
    )
  );

  assert.deepEqual(useAndroidEditor(false).style, {});
  subscribe(() => {})();
  assert.deepEqual(events, []);

  const editor = useAndroidEditor(true);
  assert.equal(editor.style.height, 844);
  assert.equal(editor.style.display, 'grid');
  assert.equal(
    editor.style.gridTemplateRows,
    'auto minmax(0, 1fr) auto'
  );

  const listener = () => {};
  const cleanup = subscribe(listener);

  assert.deepEqual(events, [
    ['window-add', 'resize', listener],
    ['visual-add', 'resize', listener],
  ]);

  // Caso medido en el teléfono:
  // visualViewport cae temporalmente a 188 px,
  // mientras innerHeight ya indica 551 px.
  win.innerHeight = 551;
  viewport.height = 188;

  assert.equal(snapshot(), 551);
  assert.equal(useAndroidEditor(true).style.height, 551);

  // El viewport visual termina estabilizándose.
  viewport.height = 551;
  assert.equal(snapshot(), 551);

  // Recuperación ante una medida visual inválida.
  win.innerHeight = 844;
  viewport.height = NaN;
  assert.equal(snapshot(), 844);

  cleanup();

  assert.deepEqual(events.slice(-2), [
    ['window-remove', 'resize', listener],
    ['visual-remove', 'resize', listener],
  ]);

  native = false;
  assert.deepEqual(useAndroidEditor(true).style, {});
  subscribe(listener)();
  assert.equal(events.length, 4);
});


test('Editor uses only window resize when visualViewport is unavailable', async () => {
  const events = [];
  const win = { innerHeight: 600, addEventListener: (...args) => events.push(['add', ...args]), removeEventListener: (...args) => events.push(['remove', ...args]) };
  let subscribe;
  const { useAndroidEditor } = await loadFrontend('src/hooks/useAndroidEditor.js', {
    useCallback: fn => fn, useSyncExternalStore: (listen, read) => { subscribe = listen; return read(); },
    isNativeAndroid: () => true, window: win,
  }, ['useAndroidEditor'], s => s.replace('export default function', 'function'));
  assert.equal(useAndroidEditor(true).style.height, 600);
  const listener = () => {};
  subscribe(listener)();
  assert.deepEqual(events, [['add', 'resize', listener], ['remove', 'resize', listener]]);
});

test('Android parents ignore tab visit order and preserve archived/settings hierarchy', () => {
  for (const path of ['/records','/chart','/settings','/archived-cycles']) assert.equal(androidBackDestination(path), '/');
  assert.equal(androidBackDestination('/settings/devices/vinca2'), '/settings/devices');
  assert.equal(androidBackDestination('/settings/devices'), '/settings');
  assert.equal(androidBackDestination('/settings/preferences'), '/settings');
  assert.equal(androidBackDestination('/cycle/old'), '/archived-cycles');
  assert.equal(androidBackDestination('/chart/old'), '/archived-cycles');
  assert.equal(androidBackDestination('/'), null);
});

test('App listener: IME, Radix, custom top layer, Dashboard, double Back and cleanup', async () => {
  const effects = [], calls = [];
  let handler, focused = true, radix = true;
  const win = { innerHeight: 800, visualViewport: { height: 500 }, addEventListener() {}, removeEventListener() {} };
  const doc = { activeElement: { matches: () => focused, blur: () => calls.push('blur') }, querySelector: () => radix, dispatchEvent: () => calls.push('escape') };
  const location = { pathname: '/records' };
  const { AndroidBackNavigation } = await loadFrontend('src/components/AndroidBackNavigation.jsx', {
    useEffect: effect => effects.push(effect), useRef: value => ({ current: value }), useLocation: () => location,
    useNavigate: () => (path, options) => calls.push([path, options]),
    Capacitor: { isPluginAvailable: () => true }, isNativeAndroid: () => true,
    App: { getInfo: async () => ({}), addListener: async (event, callback) => { assert.equal(event, 'backButton'); handler = callback; return { remove: () => calls.push('removed') }; }, minimizeApp: async () => calls.push('minimized') },
    window: win, document: doc, KeyboardEvent: class {}, toast: value => calls.push(value.title), androidBackDestination, backLayers,
  }, ['AndroidBackNavigation'], s => s.replace('export default function', 'function'));
  AndroidBackNavigation(); const cleanup = effects.map(effect => effect()); await flush();
  await handler(); assert.deepEqual(calls.splice(0), ['blur']);
  win.visualViewport.height = 800; focused = false;
  await handler(); assert.deepEqual(calls.splice(0), ['escape']);
  radix = false;
  const parent = registerBackLayer(() => calls.push('parent'));
  const child = registerBackLayer(() => calls.push('child'));
  await handler(); assert.deepEqual(calls.splice(0), ['child']); child();
  await handler(); assert.deepEqual(calls.splice(0), ['parent']); parent();
  await handler(); assert.deepEqual(calls.splice(0), [['/', { replace: true }]]);
  location.pathname = '/'; await handler(); await handler();
  assert.deepEqual(calls.splice(0), ['Pulsa otra vez para salir', 'minimized']);
  cleanup.forEach(fn => fn?.()); assert.deepEqual(calls, ['removed']);
});

test('Browser Back closes one layer, preserves router state and removes the sole marker', async () => {
  const listeners = {}; const entries = [{ key: 'router-key', idx: 4, usr: null }];
  const timers = [];
  const win = { history: {
    get state() { return entries.at(-1); },
    pushState(state) { entries.push(state); },
    back() { entries.pop(); timers.push(() => listeners.popstate()); },
  }, addEventListener(name, fn) { listeners[name] = fn; } };
  const effects = [];
  const { useBackClose } = await loadFrontend('src/hooks/useBackClose.js', {
    useEffect: effect => effects.push(effect), useRef: value => ({ current: value }), isNativeAndroid: () => false,
    backLayers, registerBackLayer, window: win, setTimeout: fn => timers.push(fn),
  }, ['useBackClose'], s => s.replace('export default function', 'function'));
  let parentClosed = 0, childClosed = 0, parentCleanup, childCleanup;
  useBackClose(true, () => { parentClosed++; parentCleanup(); }); parentCleanup = effects.shift()();
  useBackClose(true, () => { childClosed++; childCleanup(); }); childCleanup = effects.shift()();
  assert.equal(entries.length, 2); assert.equal(win.history.state.key, 'router-key');
  win.history.back(); while (timers.length) timers.shift()();
  assert.equal(childClosed, 1); assert.equal(parentClosed, 0); assert.equal(entries.length, 2);
  parentCleanup(); while (timers.length) timers.shift()(); assert.equal(entries.length, 1);
});

test('All changed UI modules parse without building Android or web', async () => {
  for (const file of ['App','components/AndroidBackNavigation','components/DayDetail','components/ObservationsQuickEditSheet','components/MucusQuickEditSheet','components/TemperatureMeasurementsSheet','pages/AuthPage']) {
    await transform(await readFile(`src/${file}.jsx`, 'utf8'), { loader: 'jsx' });
  }
});

function nodes(value, result = []) {
  if (Array.isArray(value)) value.forEach(item => nodes(item, result));
  else if (value && typeof value === 'object' && value.props) { result.push(value); nodes(value.props.children, result); }
  return result;
}
for (const kind of ['Observations', 'Mucus']) test(`${kind}: Android keeps dirty draft on refused Back, blocks closing during save, retains failure`, async () => {
  const h = hooks(); const closes = []; let accept = false, back, finish, rejectSave;
  const initialValues = kind === 'Observations' ? { observations: 'original' } : { mucusSensation: 'original', mucusAppearance: '' };
  const { Sheet } = await loadFrontend(`src/components/${kind}QuickEditSheet.jsx`, {
    ...h.bindings, useLayoutEffect: h.bindings.useEffect,
    useAndroidEditor: () => ({ android: true, style: { top: 0, height: 500 } }),
    useBackClose: (active, fn) => { back = fn; }, allowDiscard: changed => !changed || accept,
    Dialog: Object.fromEntries(['Root','Portal','Overlay','Content','Title','Description','Close'].map(k => [k, k])),
    Button: 'Button', Textarea: 'Textarea', FileText: 'FileText', Edit3: 'Edit3', X: 'X', Circle: 'Circle', Droplets: 'Droplets',
    format: () => 'date', parseISO: value => value, es: {}, window: {},
  }, ['Sheet'], s => s.replace(`export default function ${kind}QuickEditSheet`, 'function Sheet'));
  const props = { open: true, isoDate: '2026-11-27', initialValues, onOpenChange: v => closes.push(v), onSave: () => new Promise((resolve, reject) => { finish = resolve; rejectSave = reject; }) };
  const render = () => h.render(() => ({ props: { value: Sheet(props) } }));
  render(); let tree = render();
  nodes(tree).find(n => n.props.id?.startsWith('quick-')).props.onChange({ target: { value: 'draft' } });
  tree = render(); back(); assert.deepEqual(closes, []);
  const save = nodes(tree).find(n => n.type === 'Button' && n.props.children.includes('Guardar'));
  const pending = save.props.onClick(); back(); assert.deepEqual(closes, []);
  rejectSave(Error('offline')); await pending; tree = render();
  assert.ok(nodes(tree).some(n => n.props.role === 'alert'));
  assert.equal(nodes(tree).find(n => n.props.id?.startsWith('quick-')).props.value, 'draft');
  accept = true; back(); assert.deepEqual(closes, [false]); h.cleanup();
});

test('Temperature editor: correction keeps original/BLE rows, Back guards draft and pending saves', async () => {
  const h = hooks(); let accept = false, back, resolveSave; const closes = [], saves = [];
  const measurements = [
    { id: 'ble', temperature: 36.4, time: '07:00', source: 'bluetooth', selected: true },
    { id: 'manual', temperature: 36.7, time: '08:00', source: 'manual', selected: false },
  ];
  const types = ['Button','Input','Checkbox','ChevronRight','Loader2','MoreHorizontal','Thermometer','X','Check','Edit3','Clock','Eye','EyeOff','Trash2'];
  const primitive = Object.fromEntries(['Root','Portal','Overlay','Content','Title','Description','Close','Trigger','Item','Cancel'].map(k => [k, k]));
  const { Sheet } = await loadFrontend('src/components/TemperatureMeasurementsSheet.jsx', {
    ...h.bindings, useLayoutEffect: h.bindings.useEffect, ...Object.fromEntries(types.map(k => [k, k])),
    useAndroidEditor: () => ({ android: true, style: { height: 500, top: 0 } }),
    useBackClose: (open, fn) => { back = fn; }, allowDiscard: changed => !changed || accept,
    useAuth: () => ({ preferences: {}, savePreferences: async () => {} }),
    normalizePreferenceValue: () => '', validatePreferenceField: () => '',
    Dialog: primitive, AlertDialog: primitive, DropdownMenu: primitive,
    normalizeMeasurements: value => value, sortedMeasurements: rows => rows.map((measurement,index) => ({ measurement,index })),
    temperatureNumber: value => value === '' || value == null ? null : Number(value),
    measurementDisplay: m => String(m?.temperature ?? ''), format: () => 'date', parseISO: x => x, es: {}, window: {},
  }, ['Sheet'], s => s.replace('export default function TemperatureMeasurementsSheet', 'function Sheet'));
  const props = { open: true, isoDate: '2026-11-27', measurements, onOpenChange: v => closes.push(v), onChange: (rows, operation) => { saves.push({ rows, operation }); return new Promise(resolve => { resolveSave = resolve; }); } };
  const render = () => h.render(() => ({ props: { value: Sheet(props) } }));
  render(); let tree = render();
  nodes(tree).find(n => n.type === 'Item' && n.props.children.includes('Editar')).props.onSelect();
  tree = render();
  nodes(tree).find(n => n.type === 'form').props.ref.current = { reportValidity: () => true };
  nodes(tree).find(n => n.props['aria-pressed'] === false).props.onClick();
  tree = render();
  back(); assert.deepEqual(closes, []); // correction changed the draft, discard refused
  const save = nodes(tree).find(n => n.type === 'Button' && n.props.onClick && n.props.children.includes('Guardar'));
  const pending = save.props.onClick(); back(); assert.deepEqual(closes, []);
  assert.equal(saves[0].rows[0].temperature, 36.4);
  assert.equal(saves[0].rows[0].source, 'bluetooth');
  assert.equal(saves[0].rows[0].temperature_corrected, 36.4);
  assert.deepEqual(saves[0].rows[1], measurements[1]);
  assert.equal(saves[0].operation.action, 'edit');
  resolveSave(); await pending; tree = render();
  assert.equal(nodes(tree).some(n => n.type === 'form'), false);
  back(); assert.deepEqual(closes, [false]); h.cleanup();
});

test('Both password eyes preserve focused selection and never focus inactive inputs', async () => {
  const h = hooks(); const doc = { activeElement: null };
  const components = ['Button','Input','Label','Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','LogIn','UserPlus','Mail','KeyRound','Eye','EyeOff','InstallPrompt'];
  const { AuthPage } = await loadFrontend('src/pages/AuthPage.jsx', {
    ...h.bindings, useLayoutEffect: h.bindings.useEffect, ...Object.fromEntries(components.map(k => [k,k])),
    isNativeAndroid: () => false, window: { innerHeight: 800 }, document: doc,
    flushSync: fn => fn(), useAuth: () => ({}), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()],
    useToast: () => ({ toast() {} }), motion: { div: 'div', h1: 'h1' }, isStaging: false,
  }, ['AuthPage']);
  const render = () => h.render(() => ({ props: { value: AuthPage() } }));
  let tree = render();
  nodes(tree).find(n => n.type === 'Button' && n.props.children.some(c => typeof c === 'string' && c.includes('Reg'))).props.onClick();
  tree = render();
  for (const id of ['password', 'confirmPassword']) {
    const field = nodes(tree).find(n => n.props.id === id);
    let focused = 0, selected;
    field.props.ref.current = { selectionStart: 2, selectionEnd: 4, focus: () => { focused++; }, setSelectionRange: (...args) => { selected = args; } };
    const parent = nodes(tree).find(n => n.props.children.includes(field));
    const eye = nodes(parent).find(n => n.type === 'button');
    doc.activeElement = field.props.ref.current;
    let prevented = false; eye.props.onPointerDown({ preventDefault: () => { prevented = true; } });
    eye.props.onClick(); assert.equal(prevented, true); assert.deepEqual(selected, [2,4]); assert.equal(focused,0);
    doc.activeElement = null; selected = null; eye.props.onClick(); assert.equal(focused,0); assert.equal(selected,null);
  }
  h.cleanup();
});
