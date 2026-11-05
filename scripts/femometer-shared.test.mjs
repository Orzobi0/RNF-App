import test from 'node:test';
import assert from 'node:assert/strict';
import { createFemometerSessionManager, femometerClockDriftSeconds } from '../src/lib/femometerSession.js';
import { normalizeBleMeasurement, prepareManualBleDraft, classifyBleMeasurement, decideVinca2Reading, classifyBleMeasurementAge } from '../src/lib/bleMeasurements.js';
import { isBleVisualLabEnabled } from '../src/lib/bleVisualLab.js';
import { createFemometerLocalState, updateFemometerClockHistory } from '../src/lib/femometerLocalState.js';
import { loadFrontend, hooks, deferred, flush } from './helpers/load-frontend.mjs';

const memoryStorage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

const bridge = () => {
  const calls = { connections: 0, disconnects: 0, listeners: 0, peakListeners: 0, clock: 0, sync: 0, permissions: 0 };
  let emit; let deviceKey = null; const storage = memoryStorage();
  const flags = { clockFails: false, clockWait: null, syncFails: false, now: 0, remembered: true, found: true };
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
    disconnectFemometer: async () => { calls.disconnects++; },
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
  const lifecycle = new Set();
  const timers = new Set();
  const { FemometerSessionOwner } = await loadFrontend('src/contexts/FemometerContext.jsx', {
    ...harness.bindings, normalizeBleMeasurement, decideVinca2Reading, createFemometerPanelSession: native.factory,
    FemometerFeedback: 'feedback', BleReadingReview: 'review', FemometerReviewCard: 'card',
    createFemometerLocalState: (_, user) => createFemometerLocalState(native.storage, user),
    CapacitorApp: { addListener: async (name, callback) => {
      assert.equal(name, 'appStateChange'); lifecycle.add(callback);
      return { remove: async () => lifecycle.delete(callback) };
    } },
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback),
  }, ['FemometerSessionOwner']);
  const render = () => harness.render(() => FemometerSessionOwner({ userId, children: null }));
  render(); await flush();
  return { render, cleanup: harness.cleanup, lifecycle, timers,
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

const treeNodes = node => !node || typeof node !== 'object' ? [] : typeof node.type === 'function' ? treeNodes(node.type(node.props)) : [node,
  ...(node.props?.children ?? []).flat(Infinity).flatMap(treeNodes)];

test('mobile Bluetooth popover offers three independent actions despite pending readings', async () => {
  const harness = hooks();
  let starts = 0; let scans = 0; let clocks = 0; let reviews = 0;
  let ble = { enabled: true, pendingCount: 3, sessionState: { status: 'listening' },
    sessionRef: { current: { start: () => starts++, scan: () => scans++ } }, openClockDialog: () => clocks++, openReadingReview: () => reviews++ };
  const destinations = [];
  const { DeviceStatusButtonView } = await loadFrontend('src/components/DeviceStatusButtonView.jsx', {
    ...harness.bindings, useFemometer: () => ble, useNavigate: () => path => destinations.push(path),
    Bluetooth: 'connected', BluetoothOff: 'disconnected', CircleAlert: 'attention', Loader2: 'searching',
    Popover: 'popover', PopoverTrigger: 'trigger', PopoverContent: 'content', Button: 'action', RefreshCw: 'refresh',
Settings2: 'settings',
ClipboardList: 'readings',
Clock3: 'clock',
  }, ['DeviceStatusButtonView']);
  const render = () => harness.render(() => ({ props: { value: DeviceStatusButtonView({ ble, navigate: path => destinations.push(path) }) } }));
  for (const [status, icon] of [['listening', 'connected'], ['searching', 'searching'], ['connecting', 'searching'], ['stopped', 'disconnected'], ['error', 'attention']]) {
    ble.sessionState = { status };
    const tree = render();
    assert.equal(tree.type, 'popover');
    const button = treeNodes(tree).find(node => node.type === 'button');
    assert.match(button.props.className, /min-h-\[44px\]/);
    assert.match(button.props.className, /min-w-\[44px\]/);
    assert.equal(button.props.children[0].type, icon);
    assert.match(button.props['aria-label'], /3 lecturas pendientes/);
    treeNodes(tree).find(node => node.type === 'action' && node.props['aria-label'] === 'Ir a Dispositivos').props.onClick();
  }
  assert.ok(destinations.every(path => path === '/settings/devices'));
  ble.sessionState = { status: 'stopped', remembered: true };
  treeNodes(render()).find(node => node.type === 'action' && node.props['aria-label'] === 'Buscar nuevas').props.onClick();
  assert.equal(starts, 1); assert.equal(scans, 0);
  ble.sessionState = { status: 'listening', capabilities: { clockSync: true }, clockResult: { significantDrift: true } };
  let nodes = treeNodes(render());
  assert.equal(nodes.filter(node => node.type === 'action').length, 3);
  assert.equal(nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Buscar nuevas').props.disabled, true);
  nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Incorporar (3)').props.onClick();
  assert.equal(reviews, 1);
  ble.enabled = false;
  assert.equal(render(), null);
});

test('global clock prompt appears once per connection and synchronizes only on explicit action', async () => {
  const harness = hooks(); let syncs = 0; const opened = [];
  const navigate = () => {};
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useNavigate: () => navigate, useLocation: () => ({ key: 'page' }), BleSavedNotice: 'saved-notice', toast: () => ({ dismiss() {}, update() {} }), ToastAction: 'action',
    Thermometer: 'thermometer', Check: 'check', Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['FemometerFeedback']);
  const props = { readings: [], sessionRef: { current: { syncClock: () => { syncs++; } } }, clockDialogOpen: false,
    setClockDialogOpen: value => opened.push(value), sessionState: { status: 'listening', listenerResult: {}, capabilities: { clockSync: true },
      clockResult: { significantDrift: true, deviceLocalTime: '2020-01-01T08:00:00', phoneLocalTime: '2026-11-03T08:00:00' } } };
  const render = () => harness.render(() => ({ props: { value: FemometerFeedback(props) } }));
  let tree = render();
  assert.deepEqual(opened, [true]);
  assert.equal(syncs, 0);
  treeNodes(tree).find(node => node.type === 'button' && node.props.children.includes('Más tarde')).props.onClick();
  render(); render();
  assert.deepEqual(opened, [true, false]);
  treeNodes(tree).find(node => node.type === 'button' && node.props.children.includes('Sincronizar reloj')).props.onClick();
  assert.equal(syncs, 1);
  props.sessionState = { ...props.sessionState, clockError: { message: 'read failed' } };
  tree = render();
  assert.ok(treeNodes(tree).some(node => node.props.role === 'alert'));
  props.sessionState = { ...props.sessionState, listenerResult: {} };
  render();
  assert.deepEqual(opened, [true, false, true]);
  harness.cleanup();
});

test('confirmed notices group, remain dismissible and link to the exact day', async () => {
  const harness = hooks(); const routes = []; let page = 'dashboard';
  const navigate = (...args) => routes.push(args);
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useNavigate: () => navigate, useLocation: () => ({ key: page }), BleSavedNotice: 'saved-notice',
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
  const { DevicesPage, Vinca2DevicePage } = await loadFrontend('src/pages/DevicesPage.jsx', {
    ...harness.bindings, useAuth: () => ({ user: { uid: 'a' } }),
    useFemometer: () => ({ enabled, pendingCount: 2, sessionState: { remembered: true, status: 'listening' } }),
    Link: 'link', Navigate: 'redirect', Vinca2Panel: 'panel', Button: 'button', ChevronLeft: 'back', ChevronRight: 'next', Thermometer: 'thermometer', 
  }, ['DevicesPage', 'Vinca2DevicePage']);
  assert.ok(treeNodes(DevicesPage()).some(node => node.type === 'link' && node.props.to === '/settings/devices/vinca2'));
  assert.ok(treeNodes(Vinca2DevicePage()).some(node => node.type === 'panel' && node.props.userId === 'a'));
  enabled = false;
  assert.equal(DevicesPage().type, 'redirect');
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
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', { ...harness.bindings, Button: 'button', Input: 'input' }, ['BleReadingReviewView']);
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
  nodes.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  nodes = treeNodes(render());
  await nodes.find(node => node.type === 'button' && node.props.children.includes('Confirmar e incorporar')).props.onClick();
  assert.equal(saves[0].options.allowPossibleDuplicate, false);
  assert.equal(saves[0].draft.measurements[0].device_date_reliability, 'unverified');
  nodes = treeNodes(render());
  assert.ok(nodes.some(node => node.props.role === 'alert'));
  await nodes.find(node => node.type === 'button' && node.props.children.includes('Es otra medición: confirmar y guardar')).props.onClick();
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
  const harness = hooks(); const selected = []; let minimized = 0;
  const { FemometerReviewCard } = await loadFrontend('src/components/FemometerReviewCard.jsx', {
    ...harness.bindings, window: {}, Button: 'button', Thermometer: 'thermometer', ChevronDown: 'chevron',
  }, ['FemometerReviewCard'], source => source.replace('export default function FemometerReviewCard', 'function FemometerReviewCard'));
  const rows = [1, 2].map(uiId => ({ uiId, deviceKey: 'device', temperatureC: 36 + uiId / 10, importStatus: 'pending' }));
  const props = { readings: rows, selected: rows[0], expanded: true, deviceKey: 'device', onSelect: id => selected.push(id), onMinimize: () => minimized++, onExpand() {}, children: 'editor' };
  const render = () => harness.render(() => ({ props: { value: FemometerReviewCard(props) } }));
  let nodes = treeNodes(render());
  nodes.find(node => node.type === 'button' && node.props['aria-pressed'] === false).props.onClick();
  assert.deepEqual(selected, [2]);
  nodes.find(node => node.type === 'button' && node.props['aria-expanded'] === true).props.onClick();
  assert.equal(minimized, 1); assert.equal(rows.length, 2);
  props.readings = [rows[1]]; props.selected = rows[1];
  assert.equal(treeNodes(render()).filter(node => node.props['aria-pressed'] === true).length, 1);
  props.expanded = false; assert.equal(treeNodes(render()).some(node => node.props.id === 'ble-pending-review'), false);
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
  editor.props.onConfirmation(true); tree = render();
  treeNodes(tree).find(n => n.type === 'editor').props.confirm();
  tree = render(); assert.equal(tree.props.value.pendingCount, 2); assert.equal(writes, 0);
  assert.equal(treeNodes(tree).find(n => n.type === 'notice').props.notice.count, 1);
  treeNodes(tree).find(n => n.type === 'card').props.onMinimize(); tree = render();
  assert.equal(treeNodes(tree).find(n => n.type === 'card').props.expanded, false);
  tree.props.value.openReadingReview(); tree = render();
  assert.equal(treeNodes(tree).find(n => n.type === 'card').props.expanded, true);
  select('Escenario visual', 'disconnected'); tree = render();
  tree.props.value.sessionRef.current.start(); render();
  assert.equal(timers.size, 1);
  for (const fn of timers) { timers.delete(fn); fn(); }
  assert.equal(render().props.value.sessionState.status, 'listening');
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
