import test from 'node:test';
import assert from 'node:assert/strict';
import { createFemometerSessionManager, femometerClockDriftSeconds } from '../src/lib/femometerSession.js';
import { normalizeBleMeasurement } from '../src/lib/bleMeasurements.js';
import { loadFrontend, hooks, deferred, flush } from './helpers/load-frontend.mjs';

const bridge = () => {
  const calls = { connections: 0, disconnects: 0, listeners: 0, peakListeners: 0, clock: 0, sync: 0, permissions: 0 };
  let emit;
  const flags = { clockFails: false, clockWait: null, syncFails: false, now: 0, remembered: true, found: true };
  const api = {
    now: () => flags.now,
    getRememberedFemometer: async () => ({ remembered: flags.remembered }),
    scanForFemometer: async () => flags.found ? [{ id: 'temporary', isRemembered: true }] : [],
    requestBluetoothPermissions: async () => { calls.permissions++; },
    addFemometerTemperatureListener: async callback => {
      emit = callback; calls.listeners++; calls.peakListeners = Math.max(calls.peakListeners, calls.listeners);
      return { remove: async () => { calls.listeners--; } };
    },
    startFemometerTemperatureListener: async () => {
      calls.connections++;
      return { connectionReady: true, indicationsActive: true, timeoutSeconds: 360,
        capabilities: { model: 'BM-Vinca2', clockRead: true, clockSync: true } };
    },
    disconnectFemometer: async () => { calls.disconnects++; },
    readFemometerClock: async () => {
      calls.clock++;
      if (flags.clockWait) return flags.clockWait.promise;
      if (flags.clockFails) throw Error('clock failed');
      return { deviceLocalTime: '2020-01-01T08:00:00' };
    },
    syncFemometerClock: async () => { calls.sync++; if (flags.syncFails) throw Error('sync failed'); return {}; },
  };
  return { factory: createFemometerSessionManager(api), calls, flags, emit: event => emit?.(event) };
};

async function mountedOwner(native, initialUser = 'a') {
  const harness = hooks();
  let userId = initialUser;
  const lifecycle = new Set();
  const timers = new Set();
  const { FemometerSessionOwner } = await loadFrontend('src/contexts/FemometerContext.jsx', {
    ...harness.bindings, normalizeBleMeasurement, createFemometerPanelSession: native.factory,
    FemometerFeedback: 'feedback',
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
  native.flags.now += 60_001;
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
  assert.equal(native.calls.connections, 0);
  native.flags.now = 60_000;
  await owner.foreground();
  assert.equal(native.calls.connections, 1);
  native.flags.remembered = false;
  await owner.changeAccount('b');
  native.flags.now += 120_000;
  await owner.foreground();
  assert.equal(native.calls.connections, 1);
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
    await assert.rejects(() => value.incorporateReading(1, async () => { throw Error('save failed'); }));
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
      ...harness.bindings, useAuth: () => ({ user: flags.uid ? { uid: flags.uid } : null }),
      isFemometerBleAndroidNative: () => flags.android, isFemometerBlePrototypeEnabled: () => flags.staging,
      createFemometerPanelSession: () => { created++; },
    }, ['FemometerProvider']);
    assert.equal(harness.render(FemometerProvider).enabled, false);
    assert.equal(created, 0);
  }
});

const treeNodes = node => !node || typeof node !== 'object' ? [] : [node,
  ...(node.props?.children ?? []).flat(Infinity).flatMap(treeNodes)];

test('mobile Bluetooth indicator distinguishes states and navigates to devices without owning a session', async () => {
  const harness = hooks();
  let ble = { enabled: true, pendingCount: 3, sessionState: { status: 'listening' } };
  const destinations = [];
  const { DeviceStatusButton } = await loadFrontend('src/components/DeviceStatusButton.jsx', {
    ...harness.bindings, useFemometer: () => ble, useNavigate: () => path => destinations.push(path),
    Bluetooth: 'connected', BluetoothOff: 'disconnected', CircleAlert: 'attention', Loader2: 'searching',
  }, ['DeviceStatusButton']);
  for (const [status, icon] of [['listening', 'connected'], ['searching', 'searching'], ['connecting', 'searching'], ['stopped', 'disconnected'], ['error', 'attention']]) {
    ble.sessionState = { status };
    const button = DeviceStatusButton();
    assert.match(button.props.className, /min-h-\[44px\]/);
    assert.match(button.props.className, /min-w-\[44px\]/);
    assert.equal(button.props.children[0].type, icon);
    assert.match(button.props['aria-label'], /3 lecturas pendientes/);
    button.props.onClick();
  }
  assert.ok(destinations.every(path => path === '/settings/devices'));
  ble.enabled = false;
  assert.equal(DeviceStatusButton(), null);
});

test('global clock prompt appears once per connection and synchronizes only on explicit action', async () => {
  const harness = hooks(); let syncs = 0; const opened = [];
  const navigate = () => {};
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useNavigate: () => navigate, toast: () => ({ dismiss() {}, update() {} }), ToastAction: 'action',
    Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
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

test('receipt notices group readings and never announce incorporation before a confirmed save', async () => {
  const harness = hooks(); const notices = []; const routes = []; const navigate = (...args) => routes.push(args);
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useNavigate: () => navigate,
    toast: data => { const item = { ...data }; notices.push(item); return { dismiss() {}, update: next => Object.assign(item, next) }; },
    ToastAction: 'action', Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['FemometerFeedback']);
  const props = { sessionState: {}, readings: [], setClockDialogOpen: () => {} };
  const render = () => harness.render(() => ({ props: { value: FemometerFeedback(props) } }));
  render();
  props.readings = [{ uiId: 1, importStatus: 'pending' }]; render();
  assert.equal(notices.at(-1).title, 'Temperatura recibida');
  props.readings = [...props.readings, { uiId: 2, importStatus: 'pending' }]; render();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, 'Temperaturas recibidas');
  props.readings = props.readings.map(row => row.uiId === 1 ? { ...row, importStatus: 'saving' } : row); render();
  assert.equal(notices.length, 1);
  props.readings = props.readings.map(row => row.uiId === 1 ? { ...row, importStatus: 'pending' } : row); render();
  assert.equal(notices.length, 1);
  props.readings = props.readings.map(row => row.uiId === 1 ? { ...row, importStatus: 'incorporated', savedIsoDate: '2026-11-03' } : row); render();
  assert.equal(notices.at(-1).title, 'Temperatura incorporada');
  notices.at(-1).action.props.onClick();
  assert.deepEqual(routes.at(-1), ['/records', { state: { selectedDate: '2026-11-03' } }]);
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
