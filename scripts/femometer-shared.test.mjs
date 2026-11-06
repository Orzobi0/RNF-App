import test from 'node:test';
import assert from 'node:assert/strict';
import { createFemometerSessionManager, femometerClockDriftSeconds } from '../src/lib/femometerSession.js';
import { normalizeBleMeasurement, prepareManualBleDraft, classifyBleMeasurement, decideVinca2Reading, classifyBleMeasurementAge } from '../src/lib/bleMeasurements.js';
import { measurementDisplay, measurementSourceLabel } from '../src/lib/temperatureMeasurements.js';
import { isBleVisualLabEnabled } from '../src/lib/bleVisualLab.js';
import { createFemometerLocalState, updateFemometerClockHistory } from '../src/lib/femometerLocalState.js';
import { loadFrontend, hooks, deferred, flush } from './helpers/load-frontend.mjs';

const memoryStorage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

const bridge = () => {
  const calls = { connections: 0, disconnects: 0, listeners: 0, peakListeners: 0, clock: 0, sync: 0, permissions: 0 };
  let emit; let deviceKey = null; const storage = memoryStorage();
  const flags = { clockFails: false, clockWait: null, disconnectWait: null, syncFails: false, now: 0, remembered: true, found: true };
  const api = {
    now: () => flags.now,
    getRememberedFemometer: async user => ({ remembered: flags.remembered, deviceKey: flags.remembered ? 'bound-' + user : null }),
    scanForFemometer: async () => flags.found ? [{ id: 'temporary', isRemembered: true }] : [],
    requestBluetoothPermissions: async () => { calls.permissions++; },
    addFemometerTemperatureListener: async callback => {
      emit = callback; calls.listeners++; calls.peakListeners = Math.max(calls.peakListeners, calls.listeners);
      return { remove: async () => { calls.listeners--; } };
    },
    startFemometerTemperatureListener: async (id, user) => {
      deviceKey = 'bound-' + user;
      calls.connections++;
      return { deviceKey, connectionReady: true, indicationsActive: true, timeoutSeconds: 360,
        capabilities: { model: 'BM-Vinca2', clockRead: true, clockSync: true } };
    },
    disconnectFemometer: async () => { calls.disconnects++; if (flags.disconnectWait) await flags.disconnectWait.promise; },
    readFemometerClock: async () => {
      calls.clock++;
      if (flags.clockWait) return flags.clockWait.promise;
      if (flags.clockFails) throw Error('clock failed');
      return { deviceKey, deviceLocalTime: '2020-01-01T08:00:00' };
    },
    syncFemometerClock: async () => { calls.sync++; if (flags.syncFails) throw Error('sync failed'); return {}; },
  };
  return { factory: createFemometerSessionManager(api), calls, flags, storage, emit: event => emit?.({ deviceKey, ...event }) };
};

async function mountedOwner(native, initialUser = 'a') {
  const harness = hooks();
  let userId = initialUser;
  let routeKey = 'dashboard';
  const lifecycle = new Set();
  const timers = new Set();
  const { FemometerSessionOwner } = await loadFrontend('src/contexts/FemometerContext.jsx', {
    ...harness.bindings, useLocation: () => ({ key: routeKey }), normalizeBleMeasurement, decideVinca2Reading, createFemometerPanelSession: native.factory,
    FemometerFeedback: 'feedback', BleReadingReview: 'review', FemometerReviewCard: 'card',
    createFemometerLocalState: (_, user) => createFemometerLocalState(native.storage, user),
    CapacitorApp: { addListener: async (name, callback) => {
      assert.equal(name, 'appStateChange'); lifecycle.add(callback);
      return { remove: async () => lifecycle.delete(callback) };
    } },
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback),
  }, ['FemometerSessionOwner']);
  let lastTree;
  const render = () => harness.render(() => (lastTree = FemometerSessionOwner({ userId, children: null })));
  render(); await flush();
  return { render, cleanup: harness.cleanup, lifecycle, timers,
    card: () => { render(); return treeNodes(lastTree).find(node => node.type === 'card').props; },
    navigate: key => { routeKey = key; render(); },
    background: async () => { lifecycle.forEach(callback => callback({ isActive: false })); await flush(); },
    foreground: async () => {
      lifecycle.forEach(callback => callback({ isActive: true }));
      for (const callback of timers) { timers.delete(callback); callback(); }
      await flush();
    },
    changeAccount: async next => { userId = next; render(); await flush(); } };
}

test('foreground keeps live listening, restarts an expired listener once and retains pending readings', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  native.emit({ temperatureC: 36.4 });
  native.flags.now = 120_000;
  await owner.foreground();
  assert.equal(native.calls.connections, 1);
  assert.equal(native.calls.disconnects, 0);
  // No native timeout event arrived while suspended.
  native.flags.now = 361_000;
  await Promise.all([owner.foreground(), owner.foreground()]);
  assert.equal(native.calls.connections, 2);
  assert.equal(native.calls.disconnects, 1);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(owner.render().pendingCount, 1);
  native.emit({ status: 'timeout' }); // Queued terminal event, cleanup in flight.
  await owner.foreground();
  assert.equal(native.calls.connections, 2); // Cooldown.
  assert.equal(owner.render().sessionState.foreground.reason, 'brief_cooldown');
  native.flags.now += 5_001;
  await owner.foreground();
  assert.equal(native.calls.connections, 3);
  assert.equal(native.calls.permissions, 0);
  await owner.changeAccount('b');
  assert.equal(owner.lifecycle.size, 1);
  assert.equal(owner.render().pendingCount, 0);
  owner.cleanup(); await flush();
  assert.equal(owner.lifecycle.size, 0);
  assert.equal(owner.timers.size, 0);
  assert.equal(native.calls.listeners, 0);
  await owner.foreground();
  assert.equal(native.calls.connections, 4);
});

test('foreground after unsuccessful scan is bounded and requires a remembered device', async () => {
  const native = bridge(); native.flags.found = false;
  const owner = await mountedOwner(native);
  native.flags.found = true;
  await owner.foreground();
  assert.equal(native.calls.connections, 1); // First return is not blocked by mount's scan.
  native.emit({ status: 'disconnected' }); await flush();
  await owner.foreground();
  assert.equal(native.calls.connections, 1);
  assert.equal(owner.render().sessionState.foreground.reason, 'brief_cooldown');
  await Promise.all([owner.render().sessionRef.current.start(), owner.render().sessionRef.current.start()]);
  assert.equal(native.calls.connections, 2); // Explicit retry bypasses only the cooldown.
  assert.equal(native.calls.peakListeners, 1);
  native.flags.remembered = false;
  await owner.changeAccount('b');
  native.flags.now += 120_000;
  await owner.foreground();
  assert.equal(native.calls.connections, 2);
  owner.cleanup(); await flush();
});

test('shared owner survives page consumers and retains consecutive identical readings; only successful save marks its row', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  try {
    assert.equal(native.calls.connections, 1);
    assert.equal(native.calls.clock, 1);
    assert.equal(owner.render().sessionState.clockResult.significantDrift, true);
    assert.equal(native.calls.permissions, 0);
    // Route consumers re-render against the same owner, without owning cleanup.
    const session = owner.render().sessionRef.current;
    for (let i = 0; i < 3; i++) assert.equal(owner.render().sessionRef.current, session);
    assert.equal(native.calls.disconnects, 0);
    const event = { temperatureC: 36.42, deviceTimestamp: '2020-01-01T08:00:00' };
    native.emit(event); native.emit(event);
    let value = owner.render();
    assert.equal(value.readings.length, 2);
    assert.notEqual(value.readings[0].uiId, value.readings[1].uiId);
    assert.equal(value.pendingCount, 2); // Cancelling review calls no save, so both remain.
    await assert.rejects(() => value.incorporateReading(1, async () => { throw { code: 'ble-import-conflict' }; }));
    assert.equal(owner.render().pendingCount, 2);
    const pending = deferred();
    const saving = owner.render().incorporateReading(1, () => pending.promise);
    await assert.rejects(() => owner.render().incorporateReading(1, async () => {}));
    owner.render(); // Navigating during save does not lose its shared state.
    pending.resolve({ id: 'saved' }); await saving;
    value = owner.render();
    assert.equal(value.readings[0].importStatus, 'incorporated');
    assert.equal(value.readings[1].importStatus, 'pending');
    assert.equal(value.pendingCount, 1);
    assert.equal(native.calls.connections, 1);
    assert.equal(native.calls.sync, 0);
  } finally { owner.cleanup(); await flush(); }
  assert.equal(native.calls.listeners, 0);
});

test('account change and unmount dispose old listener, clear readings and ignore a late save', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  native.emit({ temperatureC: 36.4 });
  const pending = deferred();
  const saving = owner.render().incorporateReading(1, () => pending.promise);
  await owner.changeAccount('b');
  pending.resolve({}); await saving;
  assert.equal(owner.render().readings.length, 0);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(native.calls.clock, 2);
  owner.cleanup(); await flush();
  native.emit({ temperatureC: 37 });
  assert.equal(native.calls.listeners, 0);
});

test('StrictMode-style remount and duplicate starts leave one native connection/listener', async () => {
  const native = bridge();
  const first = native.factory('a', () => {}, () => {});
  const starting = first.start();
  const disposing = first.dispose();
  const second = native.factory('a', () => {}, () => {});
  await Promise.all([starting, disposing, second.start(), second.start()]);
  assert.equal(native.calls.connections, 1);
  assert.equal(native.calls.listeners, 1);
  assert.equal(native.calls.peakListeners, 1);
  await second.dispose();
});

test('automatic clock read fails without interrupting temperatures, and is repeated only on reconnection', async () => {
  const native = bridge(); native.flags.clockFails = true;
  let state; const readings = [];
  const session = native.factory('a', next => { state = next; }, event => readings.push(event));
  await session.start();
  assert.equal(state.status, 'listening');
  assert.equal(state.clockError.message, 'clock failed');
  native.emit({ temperatureC: 36.4 });
  assert.equal(readings.length, 1);
  await session.start();
  assert.equal(native.calls.clock, 1);
  assert.equal(native.calls.disconnects, 0);
  await session.stop(); await session.start();
  assert.equal(native.calls.clock, 2);
  await session.dispose();
});

test('clock comparison uses phone local time and rejects invalid dates', () => {
  const now = new Date(2026, 9, 30, 10, 0, 0).getTime();
  assert.equal(femometerClockDriftSeconds('2026-10-30T10:00:00', now), 0);
  assert.equal(femometerClockDriftSeconds('2026-10-30T09:55:00', now), -300);
  assert.equal(femometerClockDriftSeconds('2026-02-30T10:00:00', now), null);
});

test('end of bounded listening retains readings without automatically reconnecting', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 });
    native.emit({ status: 'timeout' });
    await flush();
    const value = owner.render();
    assert.equal(value.sessionState.status, 'stopped');
    assert.equal(value.readings.length, 1);
    assert.equal(value.pendingCount, 1);
    assert.equal(native.calls.listeners, 0);
    assert.equal(native.calls.connections, 1);
    await value.sessionRef.current.start();
    assert.equal(owner.render().readings.length, 1);
    assert.equal(native.calls.connections, 2);
  } finally { owner.cleanup(); await flush(); }
});

test('disposing during automatic clock read drains it and removes the temperature listener', async () => {
  const native = bridge();
  native.flags.clockWait = deferred();
  const states = [];
  const session = native.factory('a', value => states.push(value), () => {});
  const starting = session.start();
  await flush();
  assert.equal(native.calls.clock, 1);
  const disposing = session.dispose();
  const count = states.length;
  native.flags.clockWait.resolve({ deviceLocalTime: '2020-01-01T08:00:00' });
  await Promise.all([starting, disposing]);
  assert.equal(states.length, count);
  assert.equal(native.calls.listeners, 0);
});

test('web, production and signed-out sessions never mount a BLE owner', async () => {
  for (const flags of [{ android: false, staging: true, uid: 'a' }, { android: true, staging: false, uid: 'a' },
    { android: true, staging: true, uid: null }]) {
    const harness = hooks(); let created = 0;
    const { FemometerProvider } = await loadFrontend('src/contexts/FemometerContext.jsx', {
      ...harness.bindings, isBleVisualLabEnabled, Capacitor: { isNativePlatform: () => flags.android }, useAuth: () => ({ user: flags.uid ? { uid: flags.uid } : null }),
      isFemometerBleAndroidNative: () => flags.android, isFemometerBlePrototypeEnabled: () => flags.staging,
      createFemometerPanelSession: () => { created++; },
    }, ['FemometerProvider']);
    assert.equal(harness.render(FemometerProvider).enabled, false);
    assert.equal(created, 0);
  }
});

const clockHook = async harness => (await loadFrontend('src/components/useClockIssue.js', harness.bindings, ['useClockIssue'])).useClockIssue;

const treeNodes = node => !node || typeof node !== 'object' ? [] : typeof node.type === 'function' ? treeNodes(node.type(node.props)) : [node,
  ...(node.props?.children ?? []).flat(Infinity).flatMap(treeNodes)];

test('Bluetooth popover keeps waves during listening and offers manual restart with independent indicators', async () => {
  const harness = hooks();
  let restarts = 0; let starts = 0; let scans = 0; let clocks = 0; let reviews = 0;
  let ble = { enabled: true, pendingCount: 3, sessionState: { status: 'listening' },
    sessionRef: { current: { restart: () => restarts++, start: () => starts++, scan: () => scans++ } }, openClockDialog: () => clocks++, openReadingReview: () => reviews++ };
  const destinations = [];
  const { DeviceStatusButtonView } = await loadFrontend('src/components/DeviceStatusButtonView.jsx', {
    ...harness.bindings, useClockIssue: await clockHook(harness), useFemometer: () => ble, useNavigate: () => path => destinations.push(path),
    Bluetooth: 'connected', BluetoothOff: 'disconnected', Plus: 'plus', Clock: 'clock',
    Popover: 'popover', PopoverTrigger: 'trigger', PopoverContent: 'content', Button: 'action', RefreshCw: 'refresh',
Settings2: 'settings',
ClipboardList: 'readings',
Clock3: 'clock',
  }, ['DeviceStatusButtonView']);
  const render = () => harness.render(() => ({ props: { value: DeviceStatusButtonView({ ble, navigate: path => destinations.push(path) }) } }));
  for (const [status, icon] of [['listening', 'connected'], ['searching', 'connected'], ['connecting', 'connected'], ['stopped', 'disconnected'], ['error', 'disconnected']]) {
    ble.sessionState = { status };
    const tree = render();
    assert.equal(tree.type, 'popover');
    const button = treeNodes(tree).find(node => node.type === 'button');
    assert.match(button.props.className, /min-h-\[44px\]/);
    assert.match(button.props.className, /min-w-\[44px\]/);
    assert.ok(treeNodes(button).some(node => node.type === icon));
    assert.equal(treeNodes(button).some(node => node.type === 'svg'), ['listening', 'searching', 'connecting'].includes(status));
    assert.match(button.props['aria-label'], /3 lecturas pendientes/);
    treeNodes(tree).find(node => node.type === 'action' && node.props['aria-label'] === 'Ir a Dispositivos').props.onClick();
  }
  assert.ok(destinations.every(path => path === '/settings/devices'));
  ble.sessionState = { status: 'stopped', remembered: true };
  treeNodes(render()).find(node => node.type === 'action' && node.props['aria-label'] === 'Buscar nuevas').props.onClick();
  assert.equal(starts, 1); assert.equal(scans, 0);
  ble.sessionState = { status: 'listening', capabilities: { clockSync: true }, clockResult: { significantDrift: true } };
  let nodes = treeNodes(render());
  assert.equal(nodes.filter(node => node.type === 'action').length, 4);
  const restart = nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Reiniciar escucha');
  assert.equal(Boolean(restart.props.disabled), false); restart.props.onClick(); assert.equal(restarts, 1);
  nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Incorporar (3)').props.onClick();
  assert.equal(reviews, 1);
  ble.enabled = false;
  assert.equal(render(), null);
});

test('global clock prompt stays closed until explicit action', async () => {
  const harness = hooks(); let syncs = 0; const opened = [];
  const navigate = () => {};
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useClockIssue: await clockHook(harness), useNavigate: () => navigate, useLocation: () => ({ key: 'page' }), BleSavedNotice: 'saved-notice', toast: () => ({ dismiss() {}, update() {} }), ToastAction: 'action',
    Thermometer: 'thermometer', Check: 'check', Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['FemometerFeedback']);
  const props = { readings: [], sessionRef: { current: { syncClock: () => { syncs++; } } }, clockDialogOpen: false,
    setClockDialogOpen: value => opened.push(value), sessionState: { status: 'listening', listenerResult: {}, capabilities: { clockSync: true },
      clockResult: { significantDrift: true, deviceLocalTime: '2020-01-01T08:00:00', phoneLocalTime: '2026-11-03T08:00:00' } } };
  const render = () => harness.render(() => ({ props: { value: FemometerFeedback(props) } }));
  let tree = render();
  assert.deepEqual(opened, []);
  assert.equal(syncs, 0);
  treeNodes(tree).find(node => node.type === 'button' && node.props.children.includes('Cerrar')).props.onClick();
  render(); render();
  assert.deepEqual(opened, [false]);
  treeNodes(tree).find(node => node.type === 'button' && node.props.children.includes('Sincronizar y verificar')).props.onClick();
  assert.equal(syncs, 1);
  props.sessionState = { ...props.sessionState, clockError: { message: 'read failed' } };
  tree = render();
  assert.ok(treeNodes(tree).some(node => node.props.role === 'alert'));
  props.sessionState = { ...props.sessionState, listenerResult: {} };
  render();
  assert.deepEqual(opened, [false]);
  harness.cleanup();
});

test('confirmed notices group, remain dismissible and link to the exact day', async () => {
  const harness = hooks(); const routes = []; let page = 'dashboard';
  const navigate = (...args) => routes.push(args);
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useClockIssue: await clockHook(harness), useNavigate: () => navigate, useLocation: () => ({ key: page }), BleSavedNotice: 'saved-notice',
    Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['FemometerFeedback']);
  const props = { sessionState: {}, readings: [], setClockDialogOpen() {} };
  const render = () => { harness.render(() => ({ props: { value: FemometerFeedback(props) } }));
    return treeNodes(harness.render(() => ({ props: { value: FemometerFeedback(props) } }))).find(n => n.type === 'saved-notice').props; };
  assert.equal(render().notice, null);
  props.readings = [{ uiId: 1, importStatus: 'saving' }]; assert.equal(render().notice, null);
  props.readings = [{ uiId: 1, importStatus: 'incorporated', savedIsoDate: '2026-11-03' }];
  assert.equal(render().notice.count, 1);
  props.readings = [...props.readings, { uiId: 2, importStatus: 'incorporated', savedIsoDate: '2026-11-04' }];
  assert.equal(render().notice.count, 2);
  render().onViewDay(render().notice.isoDate);
  assert.deepEqual(routes.at(-1), ['/records', { state: { selectedDate: '2026-11-04', scrollToDayDetail: true } }]);
  page = 'records'; assert.equal(render().notice, null);
  harness.cleanup();
});

test('a voluntary failed clock synchronization preserves listening and pending readings', async () => {
  const native = bridge(); native.flags.syncFails = true;
  const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 });
    assert.equal(native.calls.sync, 0);
    await owner.render().sessionRef.current.syncClock();
    assert.equal(native.calls.sync, 1);
    assert.equal(owner.render().sessionState.clockError.message, 'sync failed');
    assert.equal(owner.render().sessionState.status, 'listening');
    assert.equal(owner.render().pendingCount, 1);
    assert.equal(native.calls.disconnects, 0);
  } finally { owner.cleanup(); await flush(); }
});

test('device routes use the shared state and are unavailable outside the enabled prototype', async () => {
  const harness = hooks(); let enabled = true;
  let deviceState = { remembered: true, status: 'listening' };
  const { DevicesPage, Vinca2DevicePage } = await loadFrontend('src/pages/DevicesPage.jsx', {
    ...harness.bindings, useAuth: () => ({ user: { uid: 'a' } }),
    useFemometer: () => enabled ? { enabled, pendingCount: 2, sessionState: deviceState } : { enabled: false },
    Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer', Link: 'link', Navigate: 'redirect', Vinca2Panel: 'panel', vinca2StatusText: status => status === 'listening' ? 'Escuchando temperaturas' : 'Desconectado', Button: 'button', ChevronLeft: 'back', ChevronRight: 'next', Thermometer: 'thermometer', 
  }, ['DevicesPage', 'Vinca2DevicePage']);
  const render = () => harness.render(() => ({ props: { value: DevicesPage() } }));
  assert.ok(treeNodes(render()).some(node => node.type === 'link' && node.props.to === '/settings/devices/vinca2'));
  assert.ok(treeNodes(Vinca2DevicePage()).some(node => node.type === 'panel'));
  assert.match(JSON.stringify(render()), /Vinculado/);
  deviceState = { remembered: true, status: 'stopped' };
  assert.match(JSON.stringify(render()), /Desconectado/);
  deviceState = { remembered: false, status: 'idle' };
  assert.match(JSON.stringify(render()), /Vincula un termómetro compatible/);
  assert.equal(treeNodes(render()).some(n => n.type === 'link' && n.props.to === '/settings/devices/vinca2'), false);
  assert.equal(Vinca2DevicePage().props.to, '/settings/devices');
  deviceState = { remembered: null, status: 'checking' };
  assert.match(JSON.stringify(render()), /Consultando vinculación/);
  assert.equal(treeNodes(Vinca2DevicePage()).some(n => n.type === 'panel'), false);
  enabled = false;
  assert.equal(render().type, 'redirect');
  assert.equal(Vinca2DevicePage().props.to, '/settings');
});

test('Bluetooth origin details show only available metadata and remain read-only and gated', async () => {
  const harness = hooks(); let enabled = true;
  const { BluetoothMeasurementDetails } = await loadFrontend('src/components/TemperatureMeasurementsSheet.jsx', {
    ...harness.bindings, isFemometerBlePrototypeEnabled: () => enabled, isFemometerBleAndroidNative: () => true,
  }, ['BluetoothMeasurementDetails'], source => source.replace('export default function TemperatureMeasurementsSheet', 'function TemperatureMeasurementsSheet'));
  const props = { measurement: { source: 'bluetooth', device_model: 'BM-Vinca2', device_timestamp: '2020-01-01T08:00:00',
    confirmed_timestamp: '2026-11-03T08:00:00', device_date_reliability: 'unverified' } };
  const tree = BluetoothMeasurementDetails(props);
  const rendered = treeNodes(tree).map(node => (node.props.children ?? []).filter(item => typeof item === 'string').join(' ')).join(' ');
  assert.match(rendered, /2020-01-01/);
  assert.match(rendered, /2026-11-03/);
  assert.match(rendered, /Sin verificar/);
  assert.doesNotMatch(rendered, /Recibida/);
  assert.ok(!treeNodes(tree).some(node => ['input', 'form', 'button'].includes(node.type)));
  enabled = false;
  assert.equal(BluetoothMeasurementDetails(props), null);
});

test('quick review preserves the original date, cancels without saving and requires a second explicit duplicate confirmation', async () => {
  const harness = hooks(); let closed = 0; const saves = []; let duplicate = true;
  const session = {}; const cycle = { id: 'cycle' };
  const reading = { uiId: 1, temperatureC: 36.42, deviceTimestamp: '2020-01-02T08:15:00', importStatus: 'pending' };
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', { ...harness.bindings, measurementDisplay, measurementSourceLabel, CheckCircle2: 'check', Trash2: 'trash', PlusCircle: 'plus', Button: 'button', Input: 'input' }, ['BleReadingReviewView']);
  const { BleReadingReview } = await loadFrontend('src/components/BleReadingReview.jsx', {
    ...harness.bindings, BleReadingReviewView, useNavigate: () => () => {}, normalizeBleMeasurement, prepareManualBleDraft,
    useFemometer: () => ({ sessionRef: { current: session }, incorporateReading: async (id, save) => { assert.equal(id, 1); return save(); } }),
    useCycleData: () => ({ currentCycle: cycle, isLoading: false, incorporateBleMeasurement: async (draft, options) => {
      saves.push({ draft, options });
      if (duplicate) { duplicate = false; throw { code: 'ble-possible-duplicate', title: 'Posible duplicado', message: 'Coincidencia sospechosa' }; }
      return { isoDate: draft.isoDate };
    } }),
    Button: 'button', Input: 'input', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description',
  }, ['BleReadingReview']);
  const render = () => harness.render(() => ({ props: { value: BleReadingReview({ userId: 'a', reading, onClose: () => closed++ }) } }));
  let nodes = treeNodes(render());
  assert.equal(nodes.find(node => node.type === 'input' && node.props.type === 'date').props.value, '2020-01-02');
  nodes.find(node => node.type === 'button' && node.props.children.includes('Cancelar')).props.onClick();
  assert.equal(saves.length, 0); assert.equal(closed, 1);
  nodes = treeNodes(render());
  await nodes.find(node => node.type === 'button' && node.props.children.includes('Confirmar e incorporar')).props.onClick();
  assert.equal(saves[0].options.allowPossibleDuplicate, false);
  assert.equal(saves[0].draft.measurements[0].device_date_reliability, 'unverified');
  nodes = treeNodes(render());
  assert.ok(nodes.some(node => node.props['aria-label'] === 'Posible duplicado'));
  const guarded = nodes.find(node => node.type === 'button' && node.props.children.includes('Confirmar e incorporar'));
  assert.equal(guarded.props.disabled, true); await guarded.props.onClick(); assert.equal(saves.length, 1);
  nodes.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Sí, es otra medición')).props.onClick();
  nodes = treeNodes(render());
  await nodes.find(node => node.type === 'button' && node.props.children.includes('Confirmar e incorporar')).props.onClick();
  assert.equal(saves[1].options.allowPossibleDuplicate, true);
  assert.equal(closed, 2);
  harness.cleanup();
});

test('current clock verification cannot make an unattributed historical measurement eligible automatically', () => {
  const reading = normalizeBleMeasurement({ temperatureC: 36.4, deviceTimestamp: '2020-01-02T08:00:00', receivedAt: '2026-11-04T08:00:00' }, 'BM-Vinca2');
  assert.equal(reading.device_key, null);
  assert.equal(classifyBleMeasurement(reading, { nowMs: Date.now(), clockResult: { verified: true } }).reason, 'unverified-date');
});

test('Ver día waits for exact date and loaded detail, scrolls once and never opens temperature sheet', async () => {
  const harness = hooks(); const selected = []; const scrolls = []; const frames = new Set();
  const { useBleDayDetailNavigation } = await loadFrontend('src/pages/RecordsPage.jsx', {
    ...harness.bindings,
    requestAnimationFrame: fn => { frames.add(fn); return fn; }, cancelAnimationFrame: fn => frames.delete(fn),
    document: { getElementById: id => { assert.equal(id, 'day-detail-card'); return { scrollIntoView: options => scrolls.push(options) }; } },
  }, ['useBleDayDetailNavigation']);
  const props = { enabled: true, requested: true, requestKey: 'nav1', isoDate: '2026-11-03', selectedDate: '2026-11-02', ready: false, select: date => selected.push(date) };
  const render = () => harness.render(() => { useBleDayDetailNavigation(props); return { props: { value: null } }; });
  render(); assert.equal(frames.size, 0);
  props.ready = true; render(); assert.deepEqual(selected, ['2026-11-03']);
  props.selectedDate = props.isoDate; render();
  for (const fn of frames) { frames.delete(fn); fn(); }
  assert.deepEqual(scrolls, [{ behavior: 'smooth', block: 'start' }]);
  render(); assert.equal(frames.size, 0);
  props.enabled = false; props.requestKey = 'nav2'; render(); assert.equal(frames.size, 0);
  harness.cleanup();
});

test('local pending queue recovers by account/device, preserves drafts and fails closed on interrupted writes', () => {
  const storage = memoryStorage(); const local = createFemometerLocalState(storage, 'a');
  const row = { uiId: 1, localId: 'review-operation', receivedOrder: 1, deviceKey: 'device-a', temperatureC: 36.42,
    deviceTimestamp: '2020-01-01T08:00:00', importStatus: 'pending', draft: { isoDate: '2026-11-03', time: '08:00', confirmed: false }, rawHex: 'not retained' };
  local.activate('device-a'); local.saveReadings([row]);
  const recovered = createFemometerLocalState(storage, 'a').recover();
  assert.equal(recovered[0].draft.isoDate, '2026-11-03'); assert.equal(recovered[0].rawHex, undefined);
  assert.equal(createFemometerLocalState(storage, 'b').recover().length, 0);
  local.saveReadings([{ ...row, importStatus: 'saving' }]);
  assert.equal(createFemometerLocalState(storage, 'a').recover()[0].importStatus, 'uncertain');
  local.activate('device-b');
  assert.equal(local.recover()[0].deviceKey, 'device-a'); // Retired association remains separate.
  local.saveReadings([{ ...row, importStatus: 'incorporated' }]);
  assert.equal(createFemometerLocalState(storage, 'a').recover().length, 0);
});

test('clock history distinguishes sync from read, survives recreation and invalidates trust on forget', () => {
  const storage = memoryStorage(); const local = createFemometerLocalState(storage, 'a'); local.activate('device');
  const sync = { operation: 'sync', checkedAt: 1, verified: true, driftSeconds: 0, phoneTimeZone: 'Europe/Madrid', phoneUtcOffsetMinutes: 60 };
  assert.equal(local.saveClock('device', sync).state, 'synchronized_verified');
  const reopened = createFemometerLocalState(storage, 'a');
  assert.equal(reopened.clock('device').lastVerifiedSync.checkedAt, 1);
  let history = reopened.saveClock('device', { ...sync, operation: 'read', verified: false, checkedAt: 2 });
  assert.equal(history.state, 'read_correct'); assert.equal(history.lastVerifiedSync.checkedAt, 1);
  history = reopened.saveClock('device', { ...sync, operation: 'read', verified: false, driftSeconds: -3600, checkedAt: 3 });
  assert.equal(history.state, 'misaligned'); assert.equal(history.lastSignificantChange.checkedAt, 3);
  history = reopened.saveClock('device', { operation: 'read', checkedAt: 4, errorCode: 'CLOCK_TIMEOUT' });
  assert.equal(history.state, 'unknown'); assert.equal(history.lastValidCheck.checkedAt, 3);
  reopened.activate(null); assert.equal(reopened.clock('device').state, 'unknown');
  reopened.activate('replacement'); assert.equal(reopened.clock('replacement'), null);
  assert.equal(reopened.saveClock('device', sync), null);
  assert.equal(createFemometerLocalState(storage, 'b').clock('device'), null);
  assert.equal(updateFemometerClockHistory(null, { ...sync, phoneZoneChanged: true }).state, 'unknown');
});

test('decision never infers a clock epoch or processing receipt from BLE time/model', () => {
  const measurement = normalizeBleMeasurement({ temperatureC: 36.42, deviceTimestamp: '2020-01-01T08:15:20', deviceKey: 'device' }, 'BM-Vinca2');
  const context = { userId: 'a', deviceKey: 'device', localId: 'local-only', clockHistory: { state: 'synchronized_verified' } };
  assert.equal(decideVinca2Reading(measurement, context).status, 'review');
  const sameMinute = { ...measurement, device_timestamp: '2020-01-01T08:15:59' };
  assert.equal(decideVinca2Reading(measurement, { ...context, existing: [sameMinute] }).status, 'possible_duplicate');
  assert.equal(decideVinca2Reading(measurement, { ...context, existing: [{ ...sameMinute, temperature_original: 36.43 }] }).status, 'review');
  const receipt = { localId: 'local-only', userId: 'a', deviceKey: 'device', serverConfirmed: true };
  assert.equal(decideVinca2Reading(measurement, { ...context, receipt }).status, 'already_processed');
  assert.equal(decideVinca2Reading(measurement, { ...context, receipt: { ...receipt, userId: 'b' } }).status, 'review');
  assert.equal(measurement.device_date_reliability, 'unverified');
});

test('owner restores pending work and edits, removes only confirmed saves and never retries an interrupted save', async () => {
  const native = bridge(); let owner = await mountedOwner(native);
  native.emit({ temperatureC: 36.4, deviceTimestamp: '2020-01-01T08:00:00' });
  native.emit({ temperatureC: 36.5, deviceTimestamp: '2020-01-01T08:01:00' });
  owner.render().updateReadingDraft(1, { isoDate: '2026-11-03', time: '08:00', confirmed: true });
  owner.cleanup(); await flush(); owner = await mountedOwner(native);
  assert.equal(owner.render().pendingCount, 2);
  assert.equal(owner.render().readings[0].draft.confirmed, false);
  assert.equal(owner.render().readings[0].draft.isoDate, '2026-11-03');
  await owner.render().incorporateReading(1, async () => ({ isoDate: '2026-11-03', measurements: [{ time: '08:00' }] }));
  assert.equal(owner.render().pendingCount, 1);
  const saving = deferred(); const operation = owner.render().incorporateReading(2, () => saving.promise);
  owner.cleanup(); await flush(); owner = await mountedOwner(native);
  assert.equal(owner.render().readings[0].importStatus, 'uncertain');
  let attempts = 0;
  await assert.rejects(() => owner.render().incorporateReading(2, () => { attempts++; }));
  assert.equal(attempts, 0);
  saving.resolve({}); await operation;
  assert.equal(owner.render().pendingCount, 1);
  await owner.changeAccount('b'); assert.equal(owner.render().pendingCount, 0);
  owner.cleanup(); await flush();
});

test('persistent review card selects readings, minimizes explicitly and advances after save', async () => {
  const harness = hooks(); const selected = []; let minimized = 0; let dismissed = 0; let expanded = 0;
  const timers = new Map();
  const window = { innerWidth: 390, matchMedia: () => ({ matches: false }),
    setTimeout: (fn, ms) => { assert.equal(ms, 200); timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn) };
  const { FemometerReviewCard } = await loadFrontend('src/components/FemometerReviewCard.jsx', {
    ...harness.bindings, window, Button: 'button', PlusCircle: 'plus', Copy: 'copy', AlertTriangle: 'warning', ChevronDown: 'chevron', X: 'x',
  }, ['FemometerReviewCard'], source => source.replace('export default function FemometerReviewCard', 'function FemometerReviewCard'));
  const rows = [1, 2].map(uiId => ({ uiId, deviceKey: 'device', temperatureC: 36 + uiId / 10, importStatus: 'pending' }));
  const props = { visible: true, onDismiss: () => { dismissed++; props.visible = false; }, readings: rows, selected: rows[0], expanded: true,
    deviceKey: 'device', onSelect: id => selected.push(id), onMinimize: () => minimized++, onExpand: () => expanded++, children: 'editor' };
  const render = () => harness.render(() => ({ props: { value: FemometerReviewCard(props) } }));
  let nodes = treeNodes(render());
  nodes.find(node => node.type === 'button' && node.props['aria-pressed'] === false).props.onClick();
  assert.deepEqual(selected, [2]);
  rows[1].reviewError = { code: 'ble-possible-duplicate' };
  assert.ok(treeNodes(render()).some(node => node.props.role === 'status' && node.props.children.includes('2 temperaturas pendientes')));
  props.selected = rows[1];
  assert.ok(treeNodes(render()).some(node => node.type === 'copy'));
  props.expanded = false; assert.ok(treeNodes(render()).some(node => node.type === 'copy')); props.expanded = true;
  assert.ok(treeNodes(render()).some(node => node.props.role === 'status' && node.props.children.includes('Posible duplicado')));
  rows[1].importStatus = 'uncertain';
  assert.ok(treeNodes(render()).some(node => node.type === 'warning'));
  props.expanded = false; assert.ok(treeNodes(render()).some(node => node.type === 'warning')); props.expanded = true;
  assert.ok(treeNodes(render()).some(node => node.props.role === 'status' && node.props.children.includes('Guardado sin confirmar')));
  delete rows[1].reviewError; rows[1].importStatus = 'pending';
  assert.ok(treeNodes(render()).some(node => node.type === 'plus'));
  nodes.find(node => node.type === 'button' && node.props['aria-expanded'] === true).props.onClick();
  assert.equal(minimized, 1); assert.equal(rows.length, 2);
  props.readings = [rows[1]]; props.selected = rows[1];
  assert.equal(treeNodes(render()).filter(node => node.props['aria-pressed'] === true).length, 1);
  props.expanded = false;
  const area = () => treeNodes(render()).find(node => node.props['aria-label'] === 'Revisar 1 temperaturas pendientes');
  area().props.onClick(); assert.equal(expanded, 1);
  const swipe = (x, y) => {
    const region = area();
    const pointer = { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, currentTarget: { setPointerCapture() {} } };
    region.props.onPointerDown(pointer);
    region.props.onPointerMove({ ...pointer, clientX: x, clientY: y });
    region.props.onPointerUp({ ...pointer, clientX: x, clientY: y });
  };
  const finish = () => { for (const fn of timers.keys()) { timers.delete(fn); fn(); } render(); props.visible = true; render(); };
  swipe(110, 90); assert.equal(dismissed, 0); assert.equal(timers.size, 0);
  swipe(190, 100); assert.equal(dismissed, 0); assert.equal(timers.size, 1);
  area().props.onClick(); assert.equal(expanded, 1); finish(); assert.equal(dismissed, 1);
  swipe(100, 20); finish(); assert.equal(dismissed, 2);
  swipe(10, 100); finish(); assert.equal(dismissed, 3);
  treeNodes(render()).find(node => node.props['aria-label'] === 'Cerrar aviso').props.onClick();
  assert.equal(dismissed, 3); finish(); assert.equal(dismissed, 4);
  assert.equal(props.readings.length, 1);
  props.visible = false; assert.equal(render().props.hidden, true);
  assert.ok(treeNodes(render()).find(node => node.props.id === 'ble-pending-review').props.children.includes('editor'));
  harness.cleanup();
});


test('three pending readings do not prevent a new bounded listening session or a fourth reading', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    for (let i = 0; i < 3; i++) native.emit({ temperatureC: 36.4 + i / 10, deviceTimestamp: '2026-11-04T08:00:00' });
    const ids = owner.render().readings.map(row => row.localId);
    native.emit({ status: 'timeout' }); await flush();
    await Promise.all([owner.render().sessionRef.current.start(), owner.render().sessionRef.current.start()]);
    native.emit({ temperatureC: 36.7 });
    assert.equal(owner.render().pendingCount, 4);
    assert.deepEqual(owner.render().readings.slice(0, 3).map(row => row.localId), ids);
    assert.equal(native.calls.peakListeners, 1);
    assert.equal(native.calls.connections, 2);
  } finally { owner.cleanup(); await flush(); }
});

test('24-hour candidate window never verifies the clock and resolves DST conservatively', () => {
  const nowMs = Date.parse('2026-11-04T12:00:00Z');
  const age = (timestamp, options = {}) => classifyBleMeasurementAge({ device_timestamp: timestamp }, { nowMs, ...options });
  assert.equal(age('2026-11-03T12:00:00Z').candidate, true);
  assert.equal(age('2026-11-03T11:59:59Z').reason, 'older-than-24-hours');
  assert.equal(age('2026-11-04T12:00:01Z').reason, 'future-date');
  assert.equal(age(null).reason, 'missing-date');
  assert.equal(age('2026-02-30T12:00:00Z').reason, 'invalid-date');
  assert.equal(age('2026-11-04T12:00:00').reason, 'unknown-time-zone');
  assert.equal(age('2026-10-25T02:30:00', { timeZone: 'Europe/Madrid' }).reason, 'ambiguous-local-date');
  assert.equal(age('2026-03-29T02:30:00', { timeZone: 'Europe/Madrid' }).reason, 'nonexistent-local-date');
  assert.equal(age('2026-11-04T13:00:00', { timeZone: 'Europe/Madrid' }).ageMs, 0);
  const measurement = normalizeBleMeasurement({ temperatureC: 36.4, deviceKey: 'device', deviceTimestamp: '2026-11-04T08:00:00Z' });
  assert.equal(decideVinca2Reading(measurement, { nowMs, deviceKey: 'device' }).reason, 'clock-history-insufficient');
  const options = { nowMs, deviceKey: 'device', cycleCertain: true, clockHistory: { state: 'read_correct', lastValidCheck: {}, lastVerifiedSync: { checkedAt: nowMs - 3600000 } } };
  assert.equal(decideVinca2Reading(measurement, options).reason, 'measurement-before-clock-sync');
  options.clockHistory.lastVerifiedSync.checkedAt = nowMs - 86400000;
  assert.equal(decideVinca2Reading(measurement, options).reason, 'measurement-clock-epoch-unproven');
  assert.equal(measurement.device_date_reliability, 'unverified');
});

test('visual laboratory is explicitly localhost development only; state is fictitious and detached', async () => {
  const { isBleVisualLabEnabled, createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const env = { DEV: true, MODE: 'staging' }; const location = { hostname: 'localhost', search: '' };
  assert.equal(isBleVisualLabEnabled(env, location), true);
  for (const host of ['fertiliapp-staging.web.app', 'example.com', '192.168.1.5']) assert.equal(isBleVisualLabEnabled(env, { ...location, hostname: host }), false);
  for (const mode of ['production', 'experiment']) assert.equal(isBleVisualLabEnabled({ ...env, MODE: mode }, location), false);
  assert.equal(isBleVisualLabEnabled({ ...env, DEV: false }, location), false);
  assert.equal(isBleVisualLabEnabled(env, location, true), false);
  assert.equal(isBleVisualLabEnabled(env, { ...location, hostname: '127.0.0.1' }), true);
  assert.equal(isBleVisualLabEnabled(env, { ...location, search: '?visualLab=1' }), true);
  for (const scenario of Object.keys(bleLabScenarios)) {
    const first = createBleLabScenario(scenario), second = createBleLabScenario(scenario);
    first.readings.push({ uiId: 'demo' });
    assert.notDeepEqual(first.readings, second.readings);
    assert.ok(second.readings.every(row => row.deviceKey === 'fictional-device'));
  }
});

test('Bluetooth success presentation has no expiry and supports outside, swipe and explicit dismissal', async () => {
  const harness = hooks(); const events = new Map(); let dismissed = 0; const days = [];
  const { BleSavedNotice } = await loadFrontend('src/components/BleSavedNotice.jsx', {
    ...harness.bindings, Toast: { Provider: 'provider', Root: 'notice', Title: 'title', Description: 'description', Close: 'close', Viewport: 'viewport' },
    Thermometer: 'thermometer', Check: 'check', X: 'x', Button: 'button',
    document: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), documentElement: { style: { setProperty() {}, removeProperty() {} } } },
  }, ['BleSavedNotice']);
  const props = { notice: { count: 1, temperature: 36.4, time: '08:00', isoDate: '2026-11-04' }, onDismiss: () => dismissed++, onViewDay: date => days.push(date) };
  const tree = harness.render(() => ({ props: { value: BleSavedNotice(props) } }));
  assert.equal(tree.props.duration, Infinity);
  const nodes = treeNodes(tree), root = nodes.find(node => node.type === 'notice');
  assert.equal(root.props.duration, Infinity);
  root.props.ref({ contains: () => false });
  events.get('click')({ target: {} }); assert.equal(dismissed, 1);
  root.props.onTouchStart({ touches: [{ clientX: 10, clientY: 100 }] });
  root.props.onTouchEnd({ changedTouches: [{ clientX: 10, clientY: 10 }] }); assert.equal(dismissed, 2);
  root.props.onOpenChange(false); assert.equal(dismissed, 3);
  nodes.find(node => node.type === 'button' && node.props.children.includes('Ver día')).props.onClick();
  assert.deepEqual(days, ['2026-11-04']); assert.equal(dismissed, 4);
  harness.cleanup(); assert.equal(events.size, 0);
});


test('integrated lab keeps the real application children and route state; fake BLE never runs a save adapter', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const routes = []; const timers = new Set();
  let location = { key: 'dashboard', pathname: '/', search: '', hash: '' };
  const children = { type: 'real-application', props: {} };
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useLocation: () => location, useNavigate: () => (...args) => routes.push(args),
    createBleLabScenario, bleLabScenarios, Button: 'button', FemometerReviewCard: 'card', BleReadingReviewView: 'editor', BleSavedNotice: 'notice', FemometerFeedback: 'clock',
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, ['BluetoothVisualLab'], source => source.replace('export default function BluetoothVisualLab', 'function BluetoothVisualLab'));
  const render = () => harness.render(() => ({ props: { value: BluetoothVisualLab({ Provider: 'provider', children }) } }));
  let tree = render(); assert.equal(tree.props.children[0], children); assert.equal(tree.props.value.enabled, false);
  treeNodes(tree).find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick();
  tree = render();
  const select = (label, value) => treeNodes(render()).find(n => n.type === 'select' && n.props['aria-label'] === label).props.onChange({ target: { value } });
  select('Modo de previsualización', 'android'); select('Escenario visual', 'multiple');
  tree = render(); assert.equal(tree.props.value.enabled, true); assert.equal(tree.props.value.pendingCount, 3);
  assert.equal(tree.props.children[0], children); assert.equal(routes.length, 0);
  location = { ...location, key: 'records', pathname: '/records', search: '' };
  tree = render(); assert.equal(tree.props.value.pendingCount, 3); assert.equal(tree.props.value.enabled, true);
  let writes = 0;
  await assert.rejects(tree.props.value.incorporateReading(1, () => writes++), /guardados reales/);
  assert.equal(writes, 0);
  let editor = treeNodes(tree).find(n => n.type === 'editor');
  treeNodes(tree).find(n => n.type === 'editor').props.confirm();
  tree = render(); assert.equal(tree.props.value.pendingCount, 2); assert.equal(writes, 0);
  assert.equal(treeNodes(tree).find(n => n.type === 'notice').props.notice.count, 1);
  treeNodes(tree).find(n => n.type === 'card').props.onMinimize(); tree = render();
  assert.equal(treeNodes(tree).find(n => n.type === 'card').props.expanded, false);
  tree.props.value.openReadingReview(); tree = render();
  assert.equal(treeNodes(tree).find(n => n.type === 'card').props.expanded, true);
  select('Escenario visual', 'duplicate'); tree = render();
  let fakeEditor = () => treeNodes(render()).find(n => n.type === 'editor').props;
  fakeEditor().confirm(); assert.equal(render().props.value.pendingCount, 1);
  fakeEditor().onClose(); assert.equal(treeNodes(render()).find(n => n.type === 'card').props.visible, false);
  render().props.value.openReadingReview(); fakeEditor().onDifferent(); fakeEditor().confirm();
  assert.equal(render().props.value.pendingCount, 0);
  select('Escenario visual', 'duplicate'); fakeEditor().onRepeated(); fakeEditor().onCancelDiscard();
  assert.equal(render().props.value.pendingCount, 1);
  fakeEditor().onRepeated(); fakeEditor().onDiscard(); assert.equal(render().props.value.pendingCount, 0);
  select('Escenario visual', 'uncertain'); fakeEditor();
  assert.equal(timers.size, 1); fakeEditor(); assert.equal(timers.size, 1);
  for (const fn of timers) { timers.delete(fn); fn(); }
  assert.equal(fakeEditor().check.result.measurements.length, 2);
  fakeEditor().onAlreadyStored(); assert.equal(render().props.value.pendingCount, 1);
  fakeEditor().onConfirmStored(); assert.equal(render().props.value.pendingCount, 0);
  select('Escenario visual', 'uncertain'); fakeEditor().onCheck();
  for (const fn of timers) { timers.delete(fn); fn(); }
  fakeEditor().onMissing(); fakeEditor().confirm(); assert.equal(render().props.value.pendingCount, 0);
  select('Escenario visual', 'uncertain');
  treeNodes(render()).find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  fakeEditor().onCheck(); for (const fn of timers) { timers.delete(fn); fn(); }
  assert.equal(fakeEditor().check.status, 'error'); fakeEditor().onMissing(); fakeEditor().confirm();
  assert.equal(render().props.value.pendingCount, 1);
  treeNodes(render()).find(n => n.type === 'button' && n.props.children.includes('Simular nueva temperatura')).props.onClick();
  assert.equal(treeNodes(render()).find(n => n.type === 'card').props.expanded, true);
  assert.equal(render().props.value.pendingCount, 2); assert.equal(writes, 0);
  select('Escenario visual', 'disconnected'); tree = render();
  tree.props.value.sessionRef.current.start(); render();
  assert.equal(timers.size, 1);
  for (const fn of timers) { timers.delete(fn); fn(); }
  assert.equal(render().props.value.sessionState.status, 'listening');
  select('Escenario visual', 'unlinked');
  const lab = () => render().props.value;
  const finish = () => { for (const fn of timers) { timers.delete(fn); fn(); } };
  assert.equal(lab().sessionState.remembered, false);
  lab().sessionRef.current.scan();
  assert.equal(lab().sessionState.status, 'searching'); finish();
  assert.equal(lab().sessionState.devices.length, 4);
  let binding = lab().sessionRef.current.selectAndRemember('lab-other'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.remembered, false);
  binding = lab().sessionRef.current.selectAndRemember('lab-inspection-error'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.inspectionResult, null);
  binding = lab().sessionRef.current.selectAndRemember('lab-vinca');
  assert.equal(await lab().sessionRef.current.selectAndRemember('lab-vinca'), false);
  assert.equal(lab().sessionState.status, 'inspecting'); finish();
  assert.equal(await binding, true); assert.equal(lab().sessionState.remembered, true);
  assert.equal(lab().sessionState.status, 'idle');
  const oldKey = lab().sessionState.deviceKey;
  binding = lab().sessionRef.current.selectAndRemember('lab-save-error'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.deviceKey, oldKey);
  binding = lab().sessionRef.current.selectAndRemember('lab-vinca');
  await lab().sessionRef.current.stop(); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.deviceKey, oldKey);
  lab().sessionRef.current.start(); finish(); assert.equal(lab().sessionState.status, 'listening');
  await lab().sessionRef.current.remember(true); assert.equal(lab().sessionState.remembered, true);
  await lab().sessionRef.current.stop();
  await lab().sessionRef.current.remember(true); assert.equal(lab().sessionState.remembered, false);
  assert.equal(writes, 0);
  select('Modo de previsualización', 'web'); tree = render();
  assert.equal(tree.props.value.enabled, false); assert.equal(treeNodes(tree).some(n => n.type === 'card'), false);
  for (let i = 0; i < 3; i++) {
    select('Modo de previsualización', 'android'); tree = render(); assert.equal(tree.props.value.enabled, true);
    select('Modo de previsualización', 'web'); tree = render(); assert.equal(tree.props.value.enabled, false);
    assert.equal(tree.props.children[0], children); assert.equal(treeNodes(tree).some(n => n.type === 'aside'), true);
  }
  assert.equal(routes.length, 0);
  harness.cleanup();
});

test('lab owner is authenticated and available without query parameters across route navigation without mounting native BLE', async () => {
  const harness = hooks(); let user = { uid: 'a' }; const location = { hostname: 'localhost', search: '' };
  const { FemometerProvider } = await loadFrontend('src/contexts/FemometerContext.jsx', {
    ...harness.bindings, lazy: () => 'visual-lab', Suspense: 'suspense',
    isBleVisualLabEnabled, Capacitor: { isNativePlatform: () => false }, globalThis: { location },
    useAuth: () => ({ user }), isFemometerBleAndroidNative: () => false, isFemometerBlePrototypeEnabled: () => true,
  }, ['FemometerProvider'], source => source.replaceAll('import.meta.env', "({ DEV: true, MODE: 'staging' })"));
  const render = () => harness.render(() => ({ props: { value: FemometerProvider({ children: 'real-pages' }) } }));
  let tree = render(); assert.equal(tree.type, 'suspense');
  assert.equal(tree.props.children[0].type, 'visual-lab');
  location.search = ''; tree = render(); assert.equal(tree.type, 'suspense');
  user = null; tree = render(); assert.equal(tree.props.value.enabled, false);
  user = { uid: 'b' }; tree = render(); assert.equal(tree.props.children[0].props.key, 'b');
  harness.cleanup();
});


test('background invalidates listening immediately and foreground drains cleanup before reconnecting', async () => {
  const native = bridge(); let state;
  const readings = [];
  const session = native.factory('a', next => { state = next; }, row => readings.push(row));
  await session.start();
  native.emit({ temperatureC: 36.4 });
  const gate = deferred(); native.flags.disconnectWait = gate;
  const stopping = session.suspend();
  assert.equal(state.status, 'stopping');
  const returning = session.resume();
  await flush();
  assert.equal(native.calls.connections, 1);
  assert.equal(native.calls.disconnects, 1);
  gate.resolve(); await Promise.all([stopping, returning]);
  assert.equal(state.status, 'listening');
  assert.equal(native.calls.connections, 2);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(readings.length, 1);
  await session.dispose();
});

test('manual restart is single flight, drains listeners, retains readings and allows retry after missing device', async () => {
  const native = bridge(); let state;
  const readings = [];
  const session = native.factory('a', next => { state = next; }, row => readings.push(row));
  await session.start();
  native.emit({ temperatureC: 36.5 });
  const gate = deferred(); native.flags.disconnectWait = gate;
  const restart = session.restart();
  assert.equal(session.restart(), restart);
  assert.equal(state.restarting, true);
  await flush();
  assert.equal(native.calls.connections, 1);
  assert.equal(native.calls.disconnects, 1);
  await session.start(); // Cannot overlap a manual restart.
  gate.resolve(); await restart;
  assert.equal(native.calls.connections, 2);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(state.status, 'listening');
  assert.equal(state.restarting, false);
  assert.equal(readings.length, 1);
  native.flags.found = false;
  await session.restart();
  assert.equal(state.status, 'missing');
  native.flags.found = true;
  await session.start();
  assert.equal(state.status, 'listening');
  assert.equal(readings.length, 1);
  await session.dispose();
});

test('background during manual restart cancels its search; rapid lifecycle changes cannot overlap connections', async () => {
  const native = bridge(); let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.start();
  const gate = deferred(); native.flags.disconnectWait = gate;
  const restart = session.restart(); await flush();
  const background = session.suspend();
  const foreground = session.resume();
  const backgroundAgain = session.suspend();
  const foregroundAgain = session.resume();
  gate.resolve();
  await Promise.all([restart, background, foreground, backgroundAgain, foregroundAgain]);
  assert.equal(native.calls.connections, 2);
  assert.equal(native.calls.disconnects, 1);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(state.status, 'listening');
  await session.dispose();
});

test('pending notice hides on dismissal and navigation, reopens explicitly and resurfaces compact for a new reading', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 });
    assert.equal(owner.card().visible, true);
    assert.equal(owner.card().expanded, false);
    const row = owner.render().readings[0];
    owner.render().updateReadingDraft(row.uiId, { isoDate: '2026-11-05', time: '08:15' });
    owner.card().onDismiss();
    assert.equal(owner.card().visible, false);
    assert.equal(owner.render().pendingCount, 1);
    owner.render().openReadingReview();
    assert.equal(owner.card().visible, true);
    assert.equal(owner.card().expanded, true);
    owner.navigate('records');
    assert.equal(owner.card().visible, false);
    owner.navigate('dashboard');
    assert.equal(owner.card().visible, false);
    owner.render().openReadingReview();
    assert.equal(owner.card().selected.draft.time, '08:15');
    native.emit({ temperatureC: 36.6 });
    assert.equal(owner.card().visible, true);
    assert.equal(owner.card().expanded, true);
    assert.equal(owner.render().pendingCount, 2);
  } finally { owner.cleanup(); await flush(); }
});


test('discard commits only the selected local pending and fails closed on storage, saving and stale sessions', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 }); native.emit({ temperatureC: 36.6 });
    let value = owner.render(); const session = value.sessionRef.current;
    const originalWrite = native.storage.setItem;
    native.storage.setItem = () => { throw Error('storage full'); };
    assert.throws(() => value.discardReading(1, session));
    assert.equal(owner.render().pendingCount, 2);
    native.storage.setItem = originalWrite;
    const pending = deferred();
    const saving = owner.render().incorporateReading(2, () => pending.promise);
    assert.throws(() => owner.render().discardReading(1, session));
    pending.reject(Error('network')); await assert.rejects(saving);
    owner.render().discardReading(1, session);
    assert.deepEqual(owner.render().readings.map(row => row.uiId), [2]);
    assert.deepEqual(createFemometerLocalState(native.storage, 'a').recover().map(row => row.uiId), [2]);
    const oldDiscard = owner.render().discardReading;
    await owner.changeAccount('b');
    assert.throws(() => oldDiscard(2, session));
  } finally { owner.cleanup(); await flush(); }
});

test('original attempt destination is durable before saving and recovers uncertain without opening the notice', async () => {
  const native = bridge(); let owner = await mountedOwner(native);
  native.emit({ temperatureC: 36.4, deviceTimestamp: '2020-01-01T08:00:00' });
  const attempt = { id: 'attempt-a', userId: 'a', cycleId: 'old-cycle', isoDate: '2026-11-03', time: '09:15' };
  await assert.rejects(owner.render().incorporateReading(1, async () => {
    const saved = createFemometerLocalState(native.storage, 'a').recover()[0];
    assert.deepEqual(saved.attempt, attempt); assert.equal(saved.importStatus, 'uncertain');
    throw Error('network');
  }, { attempt }));
  owner.cleanup(); await flush();
  owner = await mountedOwner(native);
  try {
    assert.equal(owner.card().visible, false);
    assert.equal(owner.render().readings[0].importStatus, 'uncertain');
    assert.deepEqual(owner.render().readings[0].attempt, attempt);
    let writes = 0;
    await assert.rejects(owner.render().incorporateReading(1, () => writes++, { reviewedUncertain: true, reviewedAttemptId: 'other' }));
    assert.equal(writes, 0);
    assert.throws(() => owner.render().discardReading(1, owner.render().sessionRef.current, 'other'));
  } finally { owner.cleanup(); await flush(); }
});

async function uncertainEditorFixture(patch = {}) {
  const harness = hooks(); const requests = []; let writes = 0; let removed = 0; let closed = 0;
  const sessionRef = { current: {} }; let cycle = { id: 'current-cycle' }; let active = true;
  const reading = { uiId: 7, temperatureC: 36.4, deviceTimestamp: '2020-01-01T08:00:00', importStatus: 'uncertain',
    draft: { isoDate: '2026-11-03', time: '09:15' },
    attempt: { id: 'attempt', userId: 'a', cycleId: 'original-cycle', isoDate: '2026-11-02', time: '08:15' }, ...patch };
  const { BleReadingReview } = await loadFrontend('src/components/BleReadingReview.jsx', {
    ...harness.bindings, BleReadingReviewView: 'view', normalizeBleMeasurement, prepareManualBleDraft, useNavigate: () => () => {},
    fetchBleAttemptDayDB: attempt => { const wait = deferred(); requests.push({ attempt, wait }); return wait.promise; },
    useCycleData: () => ({ currentCycle: cycle, isLoading: false, incorporateBleMeasurement: async () => { writes++; return {}; } }),
    useFemometer: () => ({ sessionRef, updateReadingDraft() {}, incorporateReading: async (_, save) => save(), discardReading: () => removed++ }),
  }, ['BleReadingReview']);
  const render = () => harness.render(() => ({ props: { value: BleReadingReview({ userId: 'a', reading, active, onClose: () => closed++ }) } })).props;
  render(); await flush();
  return { render, reading, requests, sessionRef, active: value => { active = value; render(); }, cleanup: harness.cleanup, cycle: id => { cycle = { id }; },
    counts: () => ({ writes, removed, closed }),
    complete: request => request.wait.resolve({ complete: true, userId: 'a', cycleId: 'original-cycle', isoDate: '2026-11-02', exists: true, measurements: [] }) };
}

test('uncertain review queries the original destination and requires an explicit missing decision before saving', async () => {
  const h = await uncertainEditorFixture();
  try {
    await h.render().confirm(); assert.equal(h.counts().writes, 0);
    const query = h.render().onCheck();
    assert.deepEqual(h.requests[0].attempt, h.reading.attempt);
    h.complete(h.requests[0]); await query; await flush();
    await h.render().confirm(); assert.equal(h.counts().writes, 0);
    h.render().onMissing();
    assert.equal(h.render().checkedUncertain, true);
    await h.render().confirm(); assert.equal(h.counts().writes, 1);
  } finally { h.cleanup(); }
});

test('uncertain query rejects partial or failed reads, invalidates date/cycle changes and ignores stale completions', async () => {
  const h = await uncertainEditorFixture();
  try {
    let operation = h.render().onCheck(); h.requests.at(-1).wait.resolve({ complete: false }); await operation; await flush();
    assert.equal(h.render().check.status, 'error');
    operation = h.render().onCheck(); h.requests.at(-1).wait.reject(Error('offline')); await operation; await flush();
    assert.equal(h.render().check.status, 'error');
    operation = h.render().onCheck(); h.render().change({ isoDate: '2026-11-04' }); h.render();
    h.complete(h.requests.at(-1)); await operation; await flush();
    assert.notEqual(h.render().check.status, 'complete');
    operation = h.render().onCheck(); h.complete(h.requests.at(-1)); await operation; await flush();
    h.render().onMissing(); assert.equal(h.render().checkedUncertain, true);
    h.cycle('another-cycle'); h.render(); assert.equal(h.render().checkedUncertain, false);
    operation = h.render().onCheck(); h.sessionRef.current = {}; h.complete(h.requests.at(-1)); await operation; await flush();
    assert.notEqual(h.render().check.status, 'complete');
    assert.equal(h.counts().writes, 0);
  } finally { h.cleanup(); }
});

test('already stored retires only the local reading; later and legacy attempts never retry', async () => {
  const h = await uncertainEditorFixture();
  try {
    const query = h.render().onCheck(); h.complete(h.requests[0]); await query; await flush();
    h.render().onAlreadyStored(); assert.equal(h.counts().removed, 0);
    assert.equal(h.render().storedConfirm, true);
    h.render().onBackStored(); assert.equal(h.render().storedConfirm, false);
    h.render().onAlreadyStored(); await h.render().onConfirmStored(); assert.equal(h.counts().removed, 1); assert.equal(h.counts().writes, 0);
    h.render().onClose(); assert.equal(h.counts().closed, 2);
    delete h.reading.attempt; h.render();
    assert.equal(h.render().canCheck, false);
    await h.render().confirm(); assert.equal(h.counts().writes, 0);
  } finally { h.cleanup(); }
});


test('duplicate permission is explicit and invalidated by editing; discard has a separate confirmation', async () => {
  const h = await uncertainEditorFixture({ importStatus: 'pending', reviewError: { code: 'ble-possible-duplicate', message: 'Possible match' } });
  try {
    await h.render().confirm(); assert.equal(h.counts().writes, 0);
    h.render().onRepeated(); assert.equal(h.render().discardConfirm, true);
    h.render().onDifferent(); assert.equal(h.render().duplicateApproved, true);
    assert.equal(h.render().discardConfirm, false);
    h.render().onRepeated(); assert.equal(h.render().duplicateApproved, false);
    h.render().onCancelDiscard(); assert.equal(h.render().discardConfirm, false);
    h.render().onDifferent();
    h.render().change({ time: '09:20' }); h.render();
    assert.equal(h.render().duplicateApproved, false);
    h.render().onRepeated(); assert.equal(h.render().discardConfirm, true);
    h.render().onCancelDiscard(); assert.equal(h.render().discardConfirm, false);
    assert.equal(h.counts().removed, 0);
    h.render().onRepeated(); await h.render().onDiscard();
    assert.equal(h.counts().removed, 1); assert.equal(h.counts().writes, 0);
  } finally { h.cleanup(); }
});

test('cancel hides the whole pending window; only a subsequent new reading automatically shows a compact notice', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 });
    owner.render().openReadingReview();
    const card = owner.card();
    card.children[0].props.onClose();
    assert.equal(owner.card().visible, false); assert.equal(owner.render().pendingCount, 1);
    owner.navigate('records'); owner.navigate('dashboard');
    assert.equal(owner.card().visible, false);
    native.emit({ temperatureC: 36.5 });
    assert.equal(owner.card().visible, true); assert.equal(owner.card().expanded, false);
    assert.equal(owner.card().selected.temperatureC, 36.5);
  } finally { owner.cleanup(); await flush(); }
});


test('uncertain check starts once per opening and ignores a closed or replaced review', async () => {
  const h = await uncertainEditorFixture();
  try {
    assert.equal(h.requests.length, 1);
    h.render(); h.render(); await flush(); assert.equal(h.requests.length, 1);
    h.active(false); h.complete(h.requests[0]); await flush();
    assert.notEqual(h.render().check.status, 'complete');
    h.active(true); await flush(); assert.equal(h.requests.length, 2);
    h.complete(h.requests[1]); await flush();
    h.render().onMissing(); assert.equal(h.render().checkedUncertain, true);
    h.render().onAlreadyStored();
    assert.equal(h.render().checkedUncertain, false); assert.equal(h.render().storedConfirm, true);
    h.render().onMissing();
    assert.equal(h.render().storedConfirm, false); assert.equal(h.render().checkedUncertain, true);
    h.render().change({ time: '09:30' }); h.render(); await flush();
    assert.equal(h.render().checkedUncertain, false);
    assert.equal(h.render().incorporationRequested, true);
    assert.equal(h.requests.length, 2); // Editing invalidates evidence without a query on every keystroke.
    h.active(false); h.active(true); await flush(); assert.equal(h.requests.length, 3);
    h.reading.uiId = 8; h.render(); await flush(); assert.equal(h.requests.length, 4);
    h.complete(h.requests[2]); await flush(); assert.notEqual(h.render().check.status, 'complete');
    h.complete(h.requests[3]); await flush(); assert.equal(h.render().check.status, 'complete');
    assert.equal(h.counts().writes, 0); assert.equal(h.counts().removed, 0);
  } finally { h.cleanup(); }
});

test('special review sections replace decisions and hide unsafe or redundant incorporation controls', async () => {
  const harness = hooks();
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', {
    ...harness.bindings, measurementDisplay, measurementSourceLabel, CheckCircle2: 'check', Trash2: 'trash', PlusCircle: 'plus', Button: 'button', Input: 'input',
  }, ['BleReadingReviewView']);
  const props = { reading: { importStatus: 'pending' }, draft: { isoDate: '2026-11-03', time: '08:00' },
    error: { code: 'ble-possible-duplicate' }, check: { status: 'complete', result: { measurements: [], exists: false } } };
  const nodes = () => treeNodes(BleReadingReviewView(props));
  const hasButton = text => nodes().some(node => node.type === 'button' && JSON.stringify(node.props.children).includes(text));
  assert.equal(hasButton('Sí, es otra medición'), true);
  props.discardConfirm = true;
  assert.equal(hasButton('Sí, es otra medición'), false);
  assert.equal(hasButton('Confirmar descarte local'), true);
  assert.equal(hasButton('Volver'), true);
  assert.equal(hasButton('Confirmar e incorporar'), false);
  props.discardConfirm = false; props.error = null; props.reading.importStatus = 'uncertain';
  assert.equal(nodes().some(node => node.type === 'input'), false);
  assert.equal(hasButton('No, incorporarla'), true);
  props.storedConfirm = true;
  assert.equal(hasButton('No, incorporarla'), false);
  assert.equal(hasButton('Confirmar que ya está guardada'), true);
  props.storedConfirm = false; props.incorporationRequested = true;
  assert.equal(nodes().filter(node => node.type === 'input').length, 2);
  assert.equal(hasButton('Confirmar e incorporar'), true);
  assert.equal(hasButton('Cancelar'), false);
});

async function vincaPanelFixture(initial = {}) {
  const harness = hooks();
  const calls = [];
  let ble = { pendingCount: 2, clockHistory: null, sessionState: { remembered: false, status: 'idle', devices: [], ...initial },
    sessionRef: { current: {} }, openReadingReview: () => calls.push('review'), openClockDialog: () => calls.push('clock') };
  const { Vinca2Panel } = await loadFrontend('src/components/Vinca2Panel.jsx', {
    ...harness.bindings, useFemometer: () => ble, window: { location: { hash: '' } },
    Button: 'button', Bluetooth: 'icon', ChevronRight: 'icon', Clock3: 'icon', Info: 'icon', Thermometer: 'icon', Unlink: 'icon',
    Dialog: 'dialog', DialogContent: 'dialog-content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer', Vinca2Diagnostics: 'diagnostics',
  }, ['Vinca2Panel']);
  const render = () => harness.render(() => ({ props: { value: Vinca2Panel() } }));
  const button = label => treeNodes(render()).find(node => node.type === 'button' && JSON.stringify(node.props.children).includes(label));
  render();
  return { ble, calls, render, button, cleanup: harness.cleanup };
}

async function devicesFixture(initial = {}) {
  const harness = hooks();
  const ble = { enabled: true, pendingCount: 2, sessionState: { remembered: false, status: 'idle', devices: [], ...initial }, sessionRef: { current: {} } };
  const { DevicesPage } = await loadFrontend('src/pages/DevicesPage.jsx', {
    ...harness.bindings, useFemometer: () => ble, useAuth: () => ({ user: { uid: 'a' } }),
    Link: 'link', Navigate: 'redirect', Vinca2Panel: 'panel', vinca2StatusText: status => status === 'listening' ? 'Escuchando temperaturas' : 'Desconectado',
    Button: 'button', ChevronLeft: 'icon', ChevronRight: 'icon', Thermometer: 'icon',
    Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['DevicesPage']);
  const render = () => harness.render(() => ({ props: { value: DevicesPage() } }));
  const button = label => treeNodes(render()).find(n => n.type === 'button' && JSON.stringify(n.props.children).includes(label));
  render();
  return { ble, render, button, cleanup: harness.cleanup };
}

test('Devices searches with one permission request and links with one result tap after inspection and cleanup', async () => {
  const h = await devicesFixture();
  let permissions = 0;
  const calls = [];
  const session = createFemometerSessionManager({
    getRememberedFemometer: async () => ({ remembered: false }),
    requestBluetoothPermissions: async () => { permissions++; },
    scanForFemometer: async () => [{ id: 'other', name: 'Otro' }, { id: 'vinca', name: 'BM-Vinca2' }],
    connectAndInspectFemometer: async id => { calls.push('inspect:' + id); return { compatible: id === 'vinca' }; },
    disconnectFemometer: async () => { calls.push('disconnect'); },
    rememberFemometer: async (_, id) => { calls.push('remember:' + id); return { remembered: true }; },
  })('a', state => { h.ble.sessionState = state; }, () => { throw Error('No listening during binding'); });
  h.ble.sessionRef.current = session;
  try {
    assert.match(JSON.stringify(h.render()), /Cierra completamente Femometer Connect/);
    const search = h.button('Buscar termómetros');
    assert.match(search.props.className, /w-fit/); assert.doesNotMatch(search.props.className, /(^|\s)w-full(\s|$)/);
    await search.props.onClick(); assert.equal(permissions, 1);
    assert.equal(h.button('Comprobar compatibilidad'), undefined);
    await h.button('Otro').props.onClick();
    assert.match(JSON.stringify(h.render()), /Este termómetro no es compatible actualmente/);
    const click = h.button('BM-Vinca2').props.onClick;
    const first = click(); await click(); await first;
    assert.deepEqual(calls, ['inspect:other', 'disconnect', 'inspect:vinca', 'disconnect', 'remember:vinca']);
    assert.match(JSON.stringify(h.render()), /Termómetro vinculado/);
    assert.equal(h.ble.sessionState.status, 'idle');
    assert.ok(treeNodes(h.render()).some(n => n.type === 'link' && n.props.to === '/settings/devices/vinca2'));
  } finally { await session.dispose(); h.cleanup(); }
});

test('Devices loading and permission/Bluetooth failures are retryable without a second permission mechanism', async () => {
  const h = await devicesFixture({ remembered: null, status: 'checking' });
  assert.match(JSON.stringify(h.render()), /Consultando vinculación/);
  assert.equal(h.button('Buscar termómetros'), undefined);
  let scans = 0;
  h.ble.sessionRef.current.scan = async () => { scans++; };
  h.ble.sessionState = { remembered: false, status: 'error', devices: [], error: { code: 'PERMISSION_NOT_GRANTED', message: 'Permiso denegado' } };
  assert.match(JSON.stringify(h.render()), /permisos de FertiliApp/);
  await h.button('Buscar termómetros').props.onClick(); assert.equal(scans, 1);
  h.ble.sessionState.error = { code: 'BLUETOOTH_DISABLED', message: 'Bluetooth está apagado.' };
  assert.match(JSON.stringify(h.render()), /Activa Bluetooth en los ajustes/);
  h.ble.sessionState = { remembered: false, status: 'missing', devices: [] };
  assert.match(JSON.stringify(h.render()), /No se han encontrado termómetros/);
  h.cleanup();
});

test('replacement requires confirmation, can be abandoned and retains the linked row on failure', async () => {
  const h = await devicesFixture({ remembered: true, status: 'listening', deviceKey: 'old' });
  h.ble.sessionRef.current = { scan: async () => { h.ble.sessionState.devices = [{ id: 'new', name: 'BM-Vinca2 nuevo' }]; },
    selectAndRemember: async id => { h.ble.sessionState = { ...h.ble.sessionState, status: 'error', selectedDeviceId: id, inspectionResult: null, error: { message: 'Timeout de comprobación' } }; return false; } };
  h.button('Cambiar termómetro').props.onClick();
  assert.equal(h.button('Continuar').props.disabled, true);
  h.button('Cancelar').props.onClick();
  h.ble.sessionState.status = 'stopped';
  h.button('Cambiar termómetro').props.onClick(); h.button('Continuar').props.onClick();
  await h.button('Buscar termómetros').props.onClick();
  await h.button('BM-Vinca2 nuevo').props.onClick();
  assert.doesNotMatch(JSON.stringify(h.render()), /Este termómetro no es compatible actualmente/);
  assert.equal(h.ble.sessionState.deviceKey, 'old'); assert.equal(h.ble.pendingCount, 2);
  h.button('Cancelar cambio').props.onClick();
  assert.equal(h.button('Buscar termómetros'), undefined);
  assert.ok(treeNodes(h.render()).some(n => n.type === 'link' && n.props.to === '/settings/devices/vinca2'));
  h.cleanup();
});

test('linked Vinca exposes shared pending review and clock, serializes operations and confirms unlink without deleting readings', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'stopped' });
  const wait = deferred();
  h.ble.sessionRef.current = { start: () => { h.calls.push('start'); return wait.promise; },
    restart: async () => h.calls.push('restart'), stop: async () => h.calls.push('stop'), remember: async forget => h.calls.push(['remember', forget]) };
  assert.match(JSON.stringify(h.render()), /Vinculado/); assert.match(JSON.stringify(h.render()), /Desconectado/);
  h.button('Temperaturas pendientes').props.onClick(); h.button('Reloj del termómetro').props.onClick();
  assert.deepEqual(h.calls, ['review', 'clock']);
  assert.match(h.button('Conectar').props.className, /w-fit/);
  assert.doesNotMatch(h.button('Conectar').props.className, /(^|\s)w-full(\s|$)/);
  assert.equal(h.button('Buscar termómetros'), undefined);
  const click = h.button('Conectar').props.onClick;
  const operation = click(); await click(); assert.equal(h.calls.filter(x => x === 'start').length, 1);
  wait.resolve(); await operation;
  for (const status of ['searching', 'connecting', 'stopping', 'inspecting']) {
    h.ble.sessionState.status = status;
    assert.ok(treeNodes(h.render()).filter(n => n.type === 'button' && n.props.className?.includes('bg-fertiliapp-fuerte')).every(n => n.props.disabled));
  }
  h.ble.sessionState.status = 'listening';
  await h.button('Reiniciar escucha').props.onClick(); assert.ok(h.calls.includes('restart'));
  h.button('Desvincular termómetro').props.onClick();
  assert.equal(treeNodes(h.render()).find(n => n.type === 'dialog').props.open, true);
  assert.equal(h.button('Confirmar desvinculación').props.disabled, true);
  assert.match(JSON.stringify(h.render()), /Debes detener la escucha/);
  await h.button('Detener escucha').props.onClick(); assert.ok(h.calls.includes('stop'));
  h.ble.sessionState.status = 'stopped';
  h.button('Cancelar').props.onClick(); assert.equal(h.calls.some(Array.isArray), false);
  h.button('Desvincular termómetro').props.onClick();
  await h.button('Confirmar desvinculación').props.onClick();
  assert.deepEqual(h.calls.at(-1), ['remember', true]); assert.equal(h.ble.pendingCount, 2);
  h.cleanup();
});

test('technical diagnostics are collapsed by default and rendering never calls the session', async () => {
  const harness = hooks();
  const { Vinca2Diagnostics } = await loadFrontend('src/components/Vinca2Diagnostics.jsx', {
    ...harness.bindings, Button: 'button', cn: (...values) => values.join(' '),
    useFemometer: () => ({ sessionState: { status: 'stopped', devices: [], inspectionResult: { services: [{ uuid: 'service', characteristics: [{ uuid: 'characteristic', properties: ['indicate'] }] }] } }, readings: [], lifecycleStatus: 'unavailable',
      sessionRef: { current: new Proxy({}, { get: () => { throw Error('Diagnostics must not access BLE'); } }) } }),
  }, ['Vinca2Diagnostics']);
  const tree = harness.render(() => ({ props: { value: Vinca2Diagnostics() } }));
  assert.equal(tree.type, 'details'); assert.equal(tree.props.open, undefined);
  assert.match(JSON.stringify(tree), /Diagnóstico técnico/); assert.match(JSON.stringify(tree), /characteristic/);
  harness.cleanup();
});

test('Vinca configuration distinguishes read-correct history from verified sync and keeps manual clock controls', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening', capabilities: { clockRead: true, clockSync: true } });
  h.ble.sessionRef.current = { readClock: async () => h.calls.push('read'), syncClock: async () => h.calls.push('sync') };
  for (const [state, label] of [['unknown', 'Sin verificar'], ['read_correct', 'Hora leída y aparentemente correcta'], ['synchronized_verified', 'Verificado'], ['misaligned', 'Desajustado']]) {
    h.ble.clockHistory = { state };
    assert.ok(JSON.stringify(h.button('Reloj del termómetro')).includes(label));
  }
  await h.button('Leer reloj').props.onClick(); await h.button('Sincronizar fecha y hora').props.onClick();
  assert.deepEqual(h.calls, ['read', 'sync']);
  h.ble.sessionState.clockBusy = true;
  assert.equal(h.button('Leer reloj').props.disabled, true);
  assert.equal(h.button('Reiniciar escucha').props.disabled, true);
  h.cleanup();
});

const coordinatedBindingFixture = async (overrides = {}) => {
  let state;
  let storedKey = 'old';
  const calls = [];
  const api = {
    getRememberedFemometer: async () => ({ remembered: true, deviceKey: storedKey }),
    requestBluetoothPermissions: async () => {},
    scanForFemometer: async () => [{ id: 'old', isRemembered: true }, { id: 'new' }, { id: 'other' }],
    connectAndInspectFemometer: async id => { calls.push(['inspect', id]); return { compatible: true }; },
    disconnectFemometer: async () => { calls.push(['disconnect']); },
    rememberFemometer: async (user, id) => { calls.push(['remember', user, id]); storedKey = id; return { remembered: true, deviceKey: id }; },
    forgetFemometer: () => { throw Error('Never forget before replacing'); },
    startFemometerTemperatureListener: () => { throw Error('Binding must not start listening'); },
    ...overrides,
  };
  const factory = createFemometerSessionManager(api);
  const session = factory('a', next => { state = next; }, () => {});
  await session.scan();
  return { session, factory, api, calls, state: () => state, storedKey: () => storedKey };
};

test('coordinated binding waits for disconnect, freezes selection and keeps previous binding until native confirmation', async () => {
  const inspection = deferred(); const cleanup = deferred(); const persistence = deferred();
  const h = await coordinatedBindingFixture();
  h.api.connectAndInspectFemometer = async id => { h.calls.push(['inspect', id]); return inspection.promise; };
  h.api.disconnectFemometer = async () => { h.calls.push(['disconnect']); await cleanup.promise; };
  h.api.rememberFemometer = async (user, id) => { h.calls.push(['remember', user, id]); return persistence.promise; };
  const binding = h.session.selectAndRemember('new'); await flush();
  assert.equal(h.state().status, 'inspecting'); assert.equal(h.state().busy, true);
  h.session.select('other');
  assert.equal(h.state().selectedDeviceId, 'new');
  assert.equal(await h.session.selectAndRemember('other'), false);
  await h.session.scan(); // Another operation cannot replace the scan during the job.
  inspection.resolve({ compatible: true }); await flush();
  assert.deepEqual(h.calls, [['inspect', 'new'], ['disconnect']]);
  assert.equal(h.state().deviceKey, 'old');
  cleanup.resolve(); await flush();
  assert.deepEqual(h.calls.at(-1), ['remember', 'a', 'new']);
  assert.equal(h.state().deviceKey, 'old');
  persistence.resolve({ remembered: true, deviceKey: 'new' });
  assert.equal(await binding, true); assert.equal(h.state().deviceKey, 'new');
  assert.equal(h.state().status, 'idle'); assert.equal(h.state().busy, false);
  await h.session.dispose();
});

test('incompatible, failed inspection/cleanup and unconfirmed persistence never replace the previous binding', async () => {
  for (const failure of ['incompatible', 'inspection', 'cleanup', 'persistence', 'unconfirmed', 'malformed']) {
    const h = await coordinatedBindingFixture();
    let remembers = 0;
    h.api.connectAndInspectFemometer = async () => {
      if (failure === 'inspection') throw { code: 'CONNECTION_TIMEOUT', message: 'Timeout' };
      return failure === 'malformed' ? null : { compatible: failure !== 'incompatible' };
    };
    h.api.disconnectFemometer = async () => { if (failure === 'cleanup') throw Error('disconnect failed'); };
    h.api.rememberFemometer = async () => {
      remembers++;
      if (failure === 'persistence') throw { code: 'PERSISTENCE_FAILED', message: 'No guardado' };
      return { remembered: false };
    };
    assert.equal(await h.session.selectAndRemember('new'), false, failure);
    assert.equal(remembers, ['persistence', 'unconfirmed'].includes(failure) ? 1 : 0, failure);
    assert.equal(h.state().remembered, true); assert.equal(h.state().deviceKey, 'old'); assert.equal(h.storedKey(), 'old');
    assert.equal(h.state().status, failure === 'incompatible' ? 'idle' : 'error');
    await h.session.dispose();
  }
});

test('binding rejects identifiers outside the current scan without inspecting or persisting them', async () => {
  const h = await coordinatedBindingFixture();
  h.api.scanForFemometer = async () => [{ id: 'replacement-result' }];
  await h.session.scan();
  assert.equal(await h.session.selectAndRemember('new'), false);
  assert.equal(h.state().error.code, 'DEVICE_NOT_FOUND');
  assert.equal(h.calls.some(call => ['inspect', 'remember'].includes(call[0])), false);
  assert.equal(h.state().deviceKey, 'old');
  await h.session.dispose();
});

test('stop, suspend and account replacement invalidate late inspections before persistence', async () => {
  for (const cancellation of ['stop', 'suspend', 'account']) {
    const wait = deferred(); const h = await coordinatedBindingFixture();
    h.api.connectAndInspectFemometer = async () => wait.promise;
    const binding = h.session.selectAndRemember('new'); await flush();
    let cleanup;
    let successor;
    if (cancellation === 'account') {
      successor = h.factory('b', () => {}, () => {});
      cleanup = h.session.dispose();
    } else cleanup = h.session[cancellation]();
    wait.resolve({ compatible: true });
    assert.equal(await binding, false); await cleanup;
    assert.equal(h.calls.some(call => call[0] === 'remember'), false);
    assert.equal(h.storedKey(), 'old');
    await successor?.dispose(); await h.session.dispose();
  }
});

test('cancellation while inspection disconnect is pending cannot proceed to native remember', async () => {
  const cleanup = deferred(); const h = await coordinatedBindingFixture();
  h.api.disconnectFemometer = () => cleanup.promise;
  const binding = h.session.selectAndRemember('new'); await flush();
  const stopping = h.session.stop();
  cleanup.resolve();
  assert.equal(await binding, false); await stopping;
  assert.equal(h.calls.some(call => call[0] === 'remember'), false);
  assert.equal(h.storedKey(), 'old'); await h.session.dispose();
});
