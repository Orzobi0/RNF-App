import test from 'node:test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createFemometerSessionManager, femometerClockDriftSeconds, normalizeFemometerDeviceInfo } from '../src/lib/femometerSession.js';
import { thermometerName } from '../src/lib/thermometerCatalog.js';
import { createThermometerMetadataStore, mergeThermometerFields, sanitizeThermometerMetadata } from '../src/lib/thermometerMetadata.js';
import { normalizeBleMeasurement, authorizedBleMeasurement, prepareManualBleDraft, prepareAutomaticBleDraft, isPossibleBleDuplicate, classifyBleMeasurement, decideVinca2Reading, classifyBleMeasurementAge, vinca2DateNeedsReview, recoveredVinca2DateMessage } from '../src/lib/bleMeasurements.js';
import { measurementDisplay, measurementSourceLabel } from '../src/lib/temperatureMeasurements.js';
import { isBleVisualLabEnabled } from '../src/lib/bleVisualLab.js';
import { createFemometerLocalState, updateFemometerClockHistory } from '../src/lib/femometerLocalState.js';
import { loadFrontend, hooks as baseHooks, deferred, flush } from './helpers/load-frontend.mjs';

const hooks = () => { const harness = baseHooks(); Object.assign(harness.bindings, { Vinca2ThermometerDrawing: 'thermometer-drawing', Vinca2IncorporationSettings: 'incorporation-settings', Vinca2AutomationPrompt: 'automation-prompt', clearVinca2Capture: async () => {}, isVinca2CaptureAvailable: () => false, useThermometerMetadata: () => ({ devices: {}, get: () => ({}), patch: () => {} }), ThermometerName: 'device-name', useNavigate: () => () => {}, measurementSourceLabel, thermometerName, useCycleData: () => ({ currentCycle: null, isLoading: false }), prepareManualBleDraft, prepareAutomaticBleDraft, isPossibleBleDuplicate, vinca2DateNeedsReview, recoveredVinca2DateMessage }); return harness; };

const memoryStorage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

const standardVerificationFixture = () => {
  let state, trialEvent, normalEvent; const received = []; const calls = [];
  let saved = { remembered: true, deviceKey: 'old', model: 'BM-Vinca2', protocol: 'vinca2', bindings: [{ deviceKey: 'old', model: 'BM-Vinca2' }] };
  const local = createFemometerLocalState(memoryStorage(), 'a');
  const sample = { experimental: true, verificationId: 'proof', readingId: 'reading', deviceProtocol: 'health-thermometer',
    temperatureC: 36.5, temperatureOriginal: 97.7, temperatureUnit: 'fahrenheit', deviceTimestamp: '2026-11-18T08:00:01', receivedAt: '2026-11-18T09:00:00' };
  const api = {
    getRememberedFemometer: async () => saved,
    requestBluetoothPermissions: async () => {},
    scanForFemometer: async () => [{ id: 'standard', isRemembered: saved.deviceKey === 'standard-key' }],
    connectAndInspectFemometer: async () => ({ compatible: false, standardTrialAvailable: true, model: null, name: 'Test thermometer' }),
    disconnectFemometer: async () => calls.push('close'),
    addStandardThermometerTrialListener: async callback => { trialEvent = callback; return { remove: async () => calls.push('remove-trial') }; },
    startStandardThermometerTrial: async () => ({ experimental: true, connectionReady: true, indicationsActive: true, verificationId: 'proof' }),
    confirmStandardThermometerTrial: async (user, evidence) => {
      assert.deepEqual(evidence, { deviceId: 'standard', verificationId: 'proof', readingId: 'reading', basalConfirmed: true });
      assert.equal(user, 'a'); calls.push('confirm-and-close');
      saved = { remembered: true, deviceKey: 'standard-key', model: null, name: 'Test thermometer', protocol: 'health-thermometer', compatibility: 'experimental',
        bindings: [...saved.bindings, { deviceKey: 'standard-key', model: null, protocol: 'health-thermometer', compatibility: 'experimental' }] };
      return { ...saved, verifiedReading: { ...sample, experimental: false, deviceKey: saved.deviceKey, receptionValidated: true, promotedVerification: true } };
    },
    addFemometerTemperatureListener: async callback => { normalEvent = callback; return { remove: async () => calls.push('remove-normal') }; },
    startFemometerTemperatureListener: async () => { calls.push('listen-normal'); return { deviceKey: saved.deviceKey, connectionReady: true, indicationsActive: true,
      capabilities: { model: null, protocol: 'health-thermometer', compatibility: 'experimental' } }; },
    readFemometerClock: () => assert.fail('standard must not use Vinca clock'),
    setFemometerVolume: () => assert.fail('standard must not use Vinca volume'),
  };
  const session = createFemometerSessionManager(api)('a', value => { state = value; }, event => received.push(event), local);
  return { session, api, local, sample, received, calls, state: () => state, saved: () => saved,
    trial: event => trialEvent(event), normal: event => normalEvent(event) };
};

test('standard selection verifies, binds, promotes only the confirmed reading and reconnects without Vinca commands', async () => {
  const h = standardVerificationFixture();
  await h.session.scan(); assert.equal(await h.session.selectAndRemember('standard'), false);
  assert.equal(h.state().trial.status, 'listening'); assert.equal(h.saved().deviceKey, 'old');
  assert.equal(await h.session.confirmTrial({ readingId: 'invented', basalConfirmed: true }), false);
  h.trial(h.sample);
  h.trial({ ...h.sample, readingId: 'historical', temperatureC: 36.1, deviceTimestamp: '2020-01-01T08:00:00' });
  assert.equal(await h.session.confirmTrial({ readingId: 'reading', basalConfirmed: false }), false);
  assert.equal(h.received.length, 0);
  assert.equal(await h.session.confirmTrial({ readingId: 'reading', basalConfirmed: true }), true);
  assert.equal(h.state().status, 'listening'); assert.equal(h.saved().bindings.length, 2);
  assert.equal(h.state().boundModel, null); assert.deepEqual(h.local.preferences('standard-key'), {});
  assert.equal(h.received.length, 1); assert.equal(h.received[0].deviceTimestamp, h.sample.deviceTimestamp);
  assert.ok(h.calls.indexOf('confirm-and-close') < h.calls.indexOf('listen-normal'));
  h.normal({ ...h.received[0] }); h.normal({ ...h.received[0] }); assert.equal(h.received.length, 1);
  h.normal({ ...h.received[0], deviceTimestamp: '2026-11-18T08:10:01' }); assert.equal(h.received.length, 2);
  await h.session.suspend(); await h.session.resume(); assert.equal(h.state().status, 'listening');
  assert.equal(h.state().capabilities.clockSync, false); assert.equal(h.state().capabilities.volumeWrite, false);
  await h.session.dispose();
});

test('negative, timeout, late and failed standard confirmations preserve old bindings and never promote', async () => {
  for (const reason of ['negative', 'timeout', 'persistence']) {
    const h = standardVerificationFixture(); await h.session.scan(); await h.session.selectAndRemember('standard'); h.trial(h.sample);
    if (reason === 'persistence') {
      h.api.confirmStandardThermometerTrial = async () => { throw { code: 'PERSISTENCE_FAILED' }; };
      assert.equal(await h.session.confirmTrial({ readingId: 'reading', basalConfirmed: true }), false);
    } else if (reason === 'timeout') { h.trial({ status: 'timeout' }); await flush(); }
    else await h.session.stopTrial();
    h.trial({ ...h.sample, readingId: 'late' });
    assert.equal(await h.session.confirmTrial({ readingId: 'reading', basalConfirmed: true }), false);
    assert.equal(h.received.length, 0); assert.equal(h.saved().deviceKey, 'old'); assert.equal(h.saved().bindings.length, 1);
    assert.equal(h.state().trial.readings.length, 1);
    await h.session.dispose();
  }
});

test('account disposal invalidates a pending standard confirmation and its late readings', async () => {
  const h = standardVerificationFixture(); const result = deferred();
  await h.session.scan(); await h.session.selectAndRemember('standard'); h.trial(h.sample);
  h.api.confirmStandardThermometerTrial = () => result.promise;
  const confirmation = h.session.confirmTrial({ readingId: 'reading', basalConfirmed: true }); await flush();
  const disposal = h.session.dispose(); await flush();
  h.trial(h.sample);
  result.resolve({ remembered: true, deviceKey: 'obsolete', protocol: 'health-thermometer', verifiedReading: h.sample });
  assert.equal(await confirmation, false); await disposal;
  assert.equal(h.received.length, 0); assert.equal(h.state().deviceKey, 'old');
});

test('verification confirmation requires explicit basal/current take acknowledgement and selection', async () => {
  const harness = hooks(); const calls = [];
  const { ThermometerVerificationView } = await loadFrontend('src/components/ThermometerVerificationView.jsx', {
    ...harness.bindings, Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description',
  }, ['ThermometerVerificationView']);
  const props = { name: 'Unknown thermometer', trial: { status: 'listening', verificationId: 'proof', readings: [
    { readingId: 'old', temperatureC: 36.1 }, { readingId: 'current', temperatureC: 36.47 }] },
    onConfirm: value => calls.push(value), onStop: () => calls.push('cancel'), onRetry: () => {} };
  const nodes = () => treeNodes(harness.render(() => ({ props: { value: ThermometerVerificationView(props) } })));
  const button = text => nodes().find(node => node.type === 'button' && JSON.stringify(node.props.children).includes(text));
  assert.equal(button('Confirmar, incorporar y vincular').props.disabled, true);
  nodes().find(node => node.type === 'select').props.onChange({ target: { value: 'current' } }); nodes();
  nodes().find(node => node.props.type === 'date').props.onChange({ target: { value: '2026-11-18' } });
  nodes().find(node => node.props.type === 'time').props.onChange({ target: { value: '08:05' } });
  nodes().find(node => node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  assert.equal(button('Confirmar, incorporar y vincular').props.disabled, false);
  button('Confirmar, incorporar y vincular').props.onClick(); assert.deepEqual(calls[0], { readingId: 'current', basalConfirmed: true, isoDate: '2026-11-18', time: '08:05' });
  assert.match(JSON.stringify(nodes()), /36,47/);
  button('No coincide').props.onClick(); assert.equal(calls.at(-1), 'cancel');
  harness.cleanup();
});

test('manual multibrand incorporation requires validated reception and preserves transmitted units and original date', () => {
  const incoming = normalizeBleMeasurement({ temperatureC: 36.5, temperatureOriginal: 97.7, temperatureUnit: 'fahrenheit',
    deviceKey: 'key', deviceModel: null, deviceProtocol: 'health-thermometer', receptionValidated: true,
    deviceTimestamp: '2026-11-18T08:00:01', receivedAt: '2026-11-18T09:00:00' });
  const confirmation = { confirmed: true, userId: 'a', cycleId: 'cycle', isoDate: '2026-11-18', time: '08:00', nowMs: new Date(2026, 10, 19).getTime() };
  const draft = prepareManualBleDraft(incoming, confirmation).measurements[0];
  assert.equal(draft.device_model, null); assert.equal(draft.transmitted_temperature, 97.7); assert.equal(draft.transmitted_unit, 'fahrenheit');
  assert.equal(draft.device_timestamp, incoming.device_timestamp); assert.equal(draft.device_date_reliability, 'unverified');
  for (const patch of [{ reception_validated: false }, { device_key: null }, { device_protocol: 'unknown' }])
    assert.throws(() => prepareManualBleDraft({ ...incoming, ...patch }, confirmation));
  assert.equal(authorizedBleMeasurement({ ...incoming, device_model: 'EBT-300', device_protocol: 'easyhome-ebt300', transmitted_unit: 'celsius' }), true);
  assert.equal(authorizedBleMeasurement({ ...incoming, device_model: 'EBT-089', device_protocol: 'easyhome-ebt300' }), false);
});

const localText = millis => { const d = new Date(millis); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

const bridge = () => {
  const calls = { connections: 0, disconnects: 0, listeners: 0, peakListeners: 0, clock: 0, sync: 0, info: 0, volume: [], measurementMode: [], permissions: 0 };
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
      if (flags.listenerWait) await flags.listenerWait.promise;
      return { deviceKey, connectedAt: flags.now, connectionReady: flags.listenerReady !== false, indicationsActive: flags.indicationsActive !== false, timeoutSeconds: 360,
        capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible', clockRead: true, clockSync: true, volumeWrite: flags.volumeSupported !== false, modeConfiguration: flags.measurementModeSupported !== false } };
    },
    disconnectFemometer: async () => { calls.disconnects++; if (flags.disconnectWait) await flags.disconnectWait.promise; },
    readFemometerClock: async () => {
      calls.clock++;
      if (flags.clockWait) return flags.clockWait.promise;
      if (flags.clockFails) throw Error('clock failed');
      return { deviceKey, deviceLocalTime: localText(flags.now - 60_000) };
    },
    syncFemometerClock: async () => { calls.sync++; if (flags.syncWait) return flags.syncWait.promise; if (flags.syncFails) throw Error('sync failed'); return {}; },
    setFemometerMeasurementMode: async level => {
      calls.measurementMode.push(level);
      if (flags.measurementModeWait) return flags.measurementModeWait.promise;
      if (flags.measurementModeError) throw flags.measurementModeError;
      return flags.measurementModeResult ?? { level, outcome: 'accepted', commandsAccepted: true, verified: false };
    },
    setFemometerVolume: async level => {
      calls.volume.push(level);
      if (flags.volumeWait) return flags.volumeWait.promise;
      if (flags.volumeError) throw flags.volumeError;
      return flags.volumeResult ?? { level, outcome: 'accepted', commandsAccepted: true, verified: false };
    },
    readFemometerDeviceInfo: async () => {
      calls.info++;
      if (flags.infoWait) return flags.infoWait.promise;
      if (flags.infoError) throw flags.infoError;
      return flags.infoResult ?? { battery: 85, model: 'BM-Vinca2', manufacturer: 'Femometer', firmware: 'FW-1', software: 'SW-2' };
    },
  };
  return { factory: createFemometerSessionManager(api), api, calls, flags, storage, emit: event => emit?.({ deviceKey, deviceModel: 'BM-Vinca2', ...event }) };
};

async function mountedOwner(native, initialUser = 'a', cycle = { currentCycle: null, isLoading: false }, metadata, presentationClock = null) {
  const harness = hooks();
  let nativeResult = null, visible = true;
  const originalStart = native.api.startFemometerTemperatureListener;
  const originalDisconnect = native.api.disconnectFemometer;
  native.api.startFemometerTemperatureListener = async (...args) => (nativeResult = await originalStart(...args));
  native.api.disconnectFemometer = async (...args) => { nativeResult = null; return originalDisconnect(...args); };
  native.api.getFemometerReceptionState = async () => ({ visible, connectionReady: Boolean(nativeResult), deviceKey: nativeResult?.deviceKey, listenerResult: nativeResult });
  native.api.getPendingFemometerTemperatures = async () => ({ readings: native.flags.nativePending ?? [] });
  native.api.acknowledgeFemometerTemperature = async (_user, _device, id) => {
    if (native.flags.ackFails) throw Error('ACK unavailable');
    (native.calls.acks ??= []).push(id);
    native.flags.nativePending = (native.flags.nativePending ?? []).filter(row => row.nativeDeliveryId !== id);
  };
  let userId = initialUser;
  let routeKey = 'dashboard';
  const lifecycle = new Set();
  const timers = new Set();
  const { FemometerSessionOwner } = await loadFrontend('src/contexts/FemometerContext.jsx', {
    ...harness.bindings, ...(metadata ? { useThermometerMetadata: () => metadata } : {}), clearVinca2Capture: async () => { native.calls.captureClears = (native.calls.captureClears ?? 0) + 1; }, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => ({ key: routeKey }), normalizeBleMeasurement, decideVinca2Reading, createFemometerPanelSession: native.factory,
    FemometerFeedback: 'feedback', BleReadingReview: 'review', FemometerReviewCard: 'card',
    createFemometerLocalState: (_, user) => createFemometerLocalState(native.storage, user),
    document: { addEventListener() {}, removeEventListener() {} },
    addFemometerReceptionStateListener: callback => {
      if (native.flags.lifecycleThrow) throw native.flags.lifecycleThrow;
      return (async () => {
        if (native.flags.lifecycleWait) await native.flags.lifecycleWait.promise;
        if (native.flags.lifecycleReject) throw native.flags.lifecycleReject;
        lifecycle.add(callback);
        return { remove: async () => lifecycle.delete(callback) };
      })();
    },
    ...(presentationClock ? { Date: presentationClock.Date } : {}),
    setTimeout: (callback, delay) => { timers.add(callback); presentationClock?.delays.set(callback, delay); return callback; },
    clearTimeout: callback => { timers.delete(callback); presentationClock?.delays.delete(callback); },
  }, ['FemometerSessionOwner']);
  let lastTree;
  const render = () => harness.render(() => (lastTree = FemometerSessionOwner({ userId, children: null })));
  render(); await flush();
  return { render, cleanup: harness.cleanup, lifecycle, timers,
    prompt: () => { render(); return treeNodes(lastTree).find(node => node.type === 'automation-prompt')?.props; },
    card: () => { render(); return treeNodes(lastTree).find(node => node.type === 'card').props; },
    navigate: key => { routeKey = key; render(); },
    background: async () => { lifecycle.forEach(callback => callback({ visible: (visible = false) })); await flush(); },
    foreground: async () => {
      lifecycle.forEach(callback => callback({ visible: (visible = true) }));
      for (const callback of timers) { timers.delete(callback); callback(); }
      await flush();
    },
    changeAccount: async next => { userId = next; render(); await flush(); } };
}

test('foreground preserves healthy Vinca listening beyond six minutes and late readings across pages', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  try {
    native.flags.now = 120_000;
    await owner.foreground();
    native.flags.now = 900_000;
    await Promise.all([owner.foreground(), owner.foreground()]);
    owner.navigate('records'); owner.render(); await flush();
    native.emit({ temperatureC: 35.77 });
    assert.equal(native.calls.connections, 1);
    assert.equal(native.calls.disconnects, 0);
    assert.equal(native.calls.peakListeners, 1);
    assert.equal(owner.render().pendingCount, 1);
    native.emit({ status: 'disconnected' }); await flush();
    assert.notEqual(owner.render().sessionState.status, 'listening');
    await owner.background(); await owner.foreground();
    assert.equal(native.calls.connections, 1);
    assert.equal(native.calls.permissions, 0);
    await owner.changeAccount('b');
    assert.equal(owner.render().pendingCount, 0);
  } finally { owner.cleanup(); await flush(); }
  assert.equal(owner.lifecycle.size, 0);
  assert.equal(owner.timers.size, 0);
  assert.equal(native.calls.listeners, 0);
});

test('foreground after unsuccessful scan is bounded and requires a remembered device', async () => {
  const native = bridge(); native.flags.found = false;
  const owner = await mountedOwner(native);
  native.flags.found = true;
  await owner.background(); await owner.foreground();
  assert.equal(native.calls.connections, 0); // BLE-10 resume does not search.
  native.emit({ status: 'disconnected' }); await flush();
  await owner.foreground();
  assert.equal(native.calls.connections, 0);
  assert.equal(owner.render().sessionState.foreground.reason, 'native_disconnected');
  await Promise.all([owner.render().sessionRef.current.start(), owner.render().sessionRef.current.start()]);
  assert.equal(native.calls.connections, 1); // Explicit connection remains available.
  assert.equal(native.calls.peakListeners, 1);
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
    assert.equal(owner.render().sessionState.clockResult.significantDrift, false);
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
  owner.render(); await flush();
  assert.equal(owner.render().readings.length, 0);
  assert.equal(native.calls.peakListeners, 1);
  assert.equal(native.calls.clock, 2);
  owner.cleanup(); await flush();
  native.emit({ temperatureC: 37 });
  assert.equal(native.calls.listeners, 0);
});

test('scan cancellation drains native cleanup before automatic or manual searches can restart', async () => {
  const native = bridge(); const scan = deferred(); const cleanup = deferred();
  let searches = 0; let active = 0; let peak = 0;
  native.api.scanForFemometer = async () => {
    searches++; active++; peak = Math.max(peak, active);
    try { if (searches === 1) await scan.promise; return [{ id: 'saved', isRemembered: true }]; }
    finally { active--; }
  };
  native.api.disconnectFemometer = async () => {
    if (searches === 1) { await cleanup.promise; scan.reject({ code: 'CONNECTION_CANCELLED' }); }
  };
  let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  const initial = session.start(); await flush();
  await Promise.all([session.start(), session.resume(), session.scan()].map((p, i) => i === 1 ? Promise.resolve() : p));
  assert.equal(searches, 1);
  const adding = session.beginChange(); await flush();
  void session.resume(); await session.scan();
  assert.equal(searches, 1); assert.equal(state.status, 'stopping');
  cleanup.resolve(); await initial; await adding;
  await session.scan();
  assert.equal(searches, 2); assert.equal(peak, 1);
  await session.cancelChange();
  assert.equal(searches, 3); assert.equal(state.status, 'listening');
  await session.dispose();
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
    ble.sessionState = { status, listenerResult: status === 'listening' ? { connectionReady: true, indicationsActive: true } : null };
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
  treeNodes(render()).find(node => node.type === 'action' && node.props['aria-label'] === 'Conectar').props.onClick();
  assert.equal(starts, 1); assert.equal(scans, 0);
  ble.sessionState = { status: 'listening', listenerResult: { connectionReady: true, indicationsActive: true }, capabilities: { clockSync: true }, clockResult: { significantDrift: true } };
  let nodes = treeNodes(render());
  assert.equal(nodes.filter(node => node.type === 'action').length, 4);
  const restart = nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Reiniciar escucha');
  assert.equal(Boolean(restart.props.disabled), false); restart.props.onClick(); assert.equal(restarts, 1);
  nodes.find(node => node.type === 'action' && node.props['aria-label'] === 'Incorporar (3)').props.onClick();
  assert.equal(reviews, 1);
  ble.pendingCount = 0; ble.processingCount = 1;
  assert.equal(treeNodes(render()).some(node => node.type === 'readings'), false);
  assert.match(treeNodes(render()).find(node => node.type === 'button').props['aria-label'], /Procesando temperatura/);
  ble.pendingCount = 1;
  assert.ok(treeNodes(render()).some(node => node.props['aria-label'] === 'Incorporar (1)'));
  ble.enabled = false;
  assert.equal(render(), null);
});

test('global clock prompt stays closed until explicit action', async () => {
  const harness = hooks(); let syncs = 0; let reads = 0; const opened = [];
  const navigate = () => {};
  const { FemometerFeedback } = await loadFrontend('src/components/FemometerFeedback.jsx', {
    ...harness.bindings, useClockIssue: await clockHook(harness), useNavigate: () => navigate, useLocation: () => ({ key: 'page' }), BleSavedNotice: 'saved-notice', toast: () => ({ dismiss() {}, update() {} }), ToastAction: 'action',
    Thermometer: 'thermometer', Link2: 'icon', Check: 'check', Button: 'button', Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['FemometerFeedback']);
  const props = { readings: [], sessionRef: { current: { readClock: () => { reads++; }, syncClock: () => { syncs++; } } }, clockDialogOpen: false,
    setClockDialogOpen: value => opened.push(value), sessionState: { status: 'listening', listenerResult: { connectionReady: true, indicationsActive: true }, capabilities: { clockRead: true, clockSync: true },
      clockResult: { significantDrift: true, deviceLocalTime: '2020-01-01T08:00:00', phoneLocalTime: '2026-11-03T08:00:00' } } };
  const render = () => harness.render(() => ({ props: { value: FemometerFeedback(props) } }));
  let tree = render();
  assert.deepEqual(opened, []);
  assert.equal(syncs, 0);
  treeNodes(tree).find(node => node.type === 'button' && node.props.children.includes('Cerrar')).props.onClick();
  render(); render();
  assert.deepEqual(opened, [false]);
  const clockButton = label => treeNodes(render()).find(node => node.type === 'button' && node.props.children.includes(label));
  assert.equal(reads, 0);
  for (const flag of ['clockBusy', 'volumeBusy', 'measurementModeBusy', 'deviceInfoBusy']) {
    props.sessionState[flag] = true;
    assert.equal(clockButton('Leer reloj').props.disabled, true);
    assert.equal(clockButton('Sincronizar y verificar').props.disabled, true);
    props.sessionState[flag] = false;
  }
  clockButton('Leer reloj').props.onClick();
  assert.equal(reads, 1);
  await flush();
  clockButton('Sincronizar y verificar').props.onClick();
  assert.equal(syncs, 1);
  await flush();
  props.sessionState.clockResult = { operation: 'read', driftSeconds: 6, significantDrift: false, deviceLocalTime: '2026-11-11T11:08:56', phoneLocalTime: '2026-11-11T11:09:02' };
  tree = render();
  assert.match(JSON.stringify(tree), /La hora del termómetro parece correcta/);
  assert.match(JSON.stringify(tree), /11\/11\/2026 · 11:08:56/);
  assert.equal(treeNodes(tree).find(n => n.type === 'button' && n.props.children.includes('Cerrar')).props.variant, 'default');
  assert.equal(treeNodes(tree).find(n => n.type === 'button' && n.props.children.includes('Sincronizar y verificar')).props.variant, 'outline');
  props.sessionState.clockResult = { ...props.sessionState.clockResult, operation: 'sync', verified: true, driftSeconds: 0 };
  assert.match(JSON.stringify(render()), /Fecha y hora sincronizadas y verificadas/);
  props.sessionState = { ...props.sessionState, clockError: { message: 'read failed' } };
  tree = render();
  assert.ok(treeNodes(tree).some(node => node.props.role === 'alert'));
  props.sessionState = { ...props.sessionState, listenerResult: {} };
  render();
  assert.deepEqual(opened, [false]);
  harness.cleanup();
  props.sessionState = { ...props.sessionState, boundProtocol: 'easyhome-ebt300', clockError: null, capabilities: { clockSync: true, clockRead: false },
    clockResult: { operation: 'sync', writeAccepted: true, verified: false }, listenerResult: { connectionReady: true, indicationsActive: true } };
  assert.match(JSON.stringify(render()), /Enviar ajuste de reloj/);
  assert.match(JSON.stringify(render()), /El protocolo no permite verificar el reloj/);
  assert.doesNotMatch(JSON.stringify(render()), /Sincronizar y verificar|Hora del termómetro|Leer reloj/);

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
  for (const route of ['records', 'chart', 'settings', 'cycle-detail']) { page = route; assert.equal(render().notice.count, 2); }
  render().onDismiss();
  page = 'dashboard'; assert.equal(render().notice, null);
  page = 'chart'; assert.equal(render().notice, null);
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
    ...harness.bindings, useParams: () => ({}), useAuth: () => ({ user: { uid: 'a' } }),
    useFemometer: () => enabled ? { enabled, pendingCount: 2, sessionState: deviceState } : { enabled: false },
    Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer', Link: 'link', Navigate: 'redirect', Vinca2Panel: 'panel', thermometerName, ThermometerVerificationView: 'verification', vinca2StatusText: status => status === 'listening' ? 'Escuchando temperaturas' : 'Desconectado', Button: 'button', CheckCircle2: 'check', X: 'close', ChevronLeft: 'back', ChevronRight: 'next', Thermometer: 'thermometer', Link2: 'icon',
  }, ['DevicesPage', 'Vinca2DevicePage']);
  const render = () => harness.render(() => ({ props: { value: DevicesPage() } }));
  assert.ok(treeNodes(render()).some(node => node.type === 'link' && node.props.to === '/settings/devices/vinca2'));
  assert.ok(treeNodes(Vinca2DevicePage()).some(node => node.type === 'panel'));
  assert.match(JSON.stringify(render()), /Femometer Vinca 2/);
  deviceState = { remembered: true, status: 'stopped' };
  assert.match(JSON.stringify(render()), /Desconectado/);
  deviceState = { remembered: false, status: 'idle' };
  assert.match(JSON.stringify(render()), /Enciende el termómetro/);
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
  const { FemometerReviewCard } = await loadFrontend('src/components/FemometerReviewCard.jsx', {
    ...harness.bindings, Button: 'button', PlusCircle: 'plus', Copy: 'copy', AlertTriangle: 'alert', ChevronDown: 'down', X: 'close',
    window: { clearTimeout() {} },
  }, ['FemometerReviewCard'], source => source.replace('export default function FemometerReviewCard', 'function FemometerReviewCard'));
  const card = FemometerReviewCard({ readings: [reading], selected: reading, expanded: true, onDismiss: () => closed++ });
  treeNodes(card).find(node => node.props['aria-label'] === 'Cerrar aviso').props.onClick();
  assert.equal(reading.importStatus, 'pending');
  assert.equal(saves.length, 0); assert.equal(closed, 1);
  nodes = treeNodes(render());
  await nodes.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Confirmar e incorporar')).props.onClick();
  assert.equal(saves[0].options.allowPossibleDuplicate, false);
  assert.equal(saves[0].draft.measurements[0].device_date_reliability, 'unverified');
  nodes = treeNodes(render());
  assert.ok(nodes.some(node => node.props['aria-label'] === 'Posible duplicado'));
  const guarded = nodes.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Confirmar e incorporar'));
  assert.equal(guarded.props.disabled, true); await guarded.props.onClick(); assert.equal(saves.length, 1);
  nodes.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Sí, es otra medición')).props.onClick();
  nodes = treeNodes(render());
  await nodes.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Confirmar e incorporar')).props.onClick();
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
  rows[0].deviceKey = 'previous'; rows[1].deviceKey = 'previous';
  assert.equal(treeNodes(render()).filter(node => node.props.role === 'note').length, 1);
  assert.doesNotMatch(JSON.stringify(render()), /revisar origen/);
  props.deviceKey = null;
  assert.equal(treeNodes(render()).filter(node => node.props.role === 'note').length, 0);
  assert.doesNotMatch(JSON.stringify(render()), /Otra vinculación/);
  assert.equal(rows[0].deviceKey, 'previous');
  props.deviceKey = 'device'; rows.forEach(row => { row.deviceKey = 'device'; });
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

test('Bluetooth success presentation has no expiry and ignores outside clicks and supports swipe and explicit dismissal', async () => {
  const harness = hooks(); const events = new Map(); let dismissed = 0; const days = [];
  const { BleSavedNotice } = await loadFrontend('src/components/BleSavedNotice.jsx', {
    ...harness.bindings, Toast: { Provider: 'provider', Root: 'notice', Title: 'title', Description: 'description', Close: 'close', Viewport: 'viewport' },
    Thermometer: 'thermometer', Link2: 'icon', Check: 'check', X: 'x', Button: 'button',
    document: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), documentElement: { style: { setProperty() {}, removeProperty() {} } } },
  }, ['BleSavedNotice']);
  const props = { notice: { count: 1, temperature: 36.4, time: '08:00', isoDate: '2026-11-04' }, onDismiss: () => dismissed++, onViewDay: date => days.push(date) };
  const tree = harness.render(() => ({ props: { value: BleSavedNotice(props) } }));
  assert.equal(tree.props.duration, Infinity);
  const nodes = treeNodes(tree), root = nodes.find(node => node.type === 'notice');
  assert.equal(root.props.duration, Infinity);
  assert.equal(events.has('click'), false); assert.equal(dismissed, 0);
  root.props.onTouchStart({ touches: [{ clientX: 10, clientY: 100 }] });
  root.props.onTouchEnd({ changedTouches: [{ clientX: 10, clientY: 10 }] }); assert.equal(dismissed, 1);
  root.props.onOpenChange(false); assert.equal(dismissed, 2);
  nodes.find(node => node.type === 'button' && node.props.children.includes('Ver día')).props.onClick();
  assert.deepEqual(days, ['2026-11-04']); assert.equal(dismissed, 3);
  harness.cleanup(); assert.equal(events.size, 0);
});


test('integrated lab keeps the real application children and route state; fake BLE never runs a save adapter', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const routes = []; const timers = new Set();
  let location = { key: 'dashboard', pathname: '/', search: '', hash: '' };
  const children = { type: 'real-application', props: {} };
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => location, useNavigate: () => (...args) => routes.push(args),
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
  const finish = () => { for (const fn of timers) { timers.delete(fn); fn(); render(); } };
  assert.equal(lab().sessionState.remembered, false);
  lab().sessionRef.current.scan();
  assert.equal(lab().sessionState.status, 'searching'); finish();
  assert.equal(lab().sessionState.devices.length, 6);
  assert.ok(lab().sessionState.devices.some(device => device.id === 'lab-easy' && device.model === 'EBT-300'));
  let binding = lab().sessionRef.current.selectAndRemember('lab-other'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.remembered, false);
  binding = lab().sessionRef.current.selectAndRemember('lab-inspection-error'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.inspectionResult, null);
  binding = lab().sessionRef.current.selectAndRemember('lab-vinca');
  assert.equal(await lab().sessionRef.current.selectAndRemember('lab-vinca'), false);
  assert.equal(lab().sessionState.status, 'inspecting'); finish();
  assert.equal(await binding, true); assert.equal(lab().sessionState.remembered, true);
  assert.equal(lab().sessionState.status, 'listening');
  await lab().sessionRef.current.stop();
  const oldKey = lab().sessionState.deviceKey;
  binding = lab().sessionRef.current.selectAndRemember('lab-save-error'); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.deviceKey, oldKey);
  binding = lab().sessionRef.current.selectAndRemember('lab-vinca');
  await lab().sessionRef.current.stop(); finish();
  assert.equal(await binding, false); assert.equal(lab().sessionState.deviceKey, oldKey);
  lab().sessionRef.current.start(); finish(); assert.equal(lab().sessionState.status, 'listening');
  await lab().sessionRef.current.remember(true); assert.equal(lab().sessionState.remembered, false);
  assert.equal(lab().sessionState.status, 'stopped');
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
  const harness = hooks(); const requests = []; const payloads = []; let writes = 0; let removed = 0; let closed = 0;
  const sessionRef = { current: {} }; let cycle = { id: 'current-cycle' }; let active = true;
  const reading = { uiId: 7, temperatureC: 36.4, deviceTimestamp: '2020-01-01T08:00:00', importStatus: 'uncertain',
    draft: { isoDate: '2026-11-03', time: '09:15' },
    attempt: { id: 'attempt', userId: 'a', cycleId: 'original-cycle', isoDate: '2026-11-02', time: '08:15' }, ...patch };
  const { BleReadingReview } = await loadFrontend('src/components/BleReadingReview.jsx', {
    ...harness.bindings, BleReadingReviewView: 'view', normalizeBleMeasurement, prepareManualBleDraft, useNavigate: () => () => {},
    fetchBleAttemptDayDB: attempt => { const wait = deferred(); requests.push({ attempt, wait }); return wait.promise; },
    useCycleData: () => ({ currentCycle: cycle, isLoading: false, incorporateBleMeasurement: async payload => { writes++; payloads.push(payload); return {}; } }),
    useFemometer: () => ({ sessionRef, updateReadingDraft() {}, incorporateReading: async (_, save) => save(), discardReading: () => removed++ }),
  }, ['BleReadingReview']);
  const render = () => harness.render(() => ({ props: { value: BleReadingReview({ userId: 'a', reading, active, onClose: () => closed++ }) } })).props;
  render(); await flush();
  return { render, reading, requests, payloads, sessionRef, active: value => { active = value; render(); }, cleanup: harness.cleanup, cycle: id => { cycle = { id }; },
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
  assert.equal(hasButton('Confirmar descarte'), true);
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

async function vincaPanelFixture(initial = {}, props = {}, metadata = { devices: {} }) {
  const harness = hooks();
  const calls = [];
  let ble = { pendingCount: 2, clockHistory: null, sessionState: { remembered: false, status: 'idle', devices: [], ...initial },
    sessionRef: { current: {} }, openReadingReview: () => calls.push('review'), openClockDialog: () => calls.push('clock') };
  const { Vinca2Panel } = await loadFrontend('src/components/Vinca2Panel.jsx', {
    ...harness.bindings, useThermometerMetadata: () => metadata, thermometerName, useFemometer: () => ble, window: { location: { hash: '' } },
    Button: 'button', Bluetooth: 'icon', RefreshCw: 'icon', ChevronRight: 'icon', Clock3: 'icon', Info: 'icon', Thermometer: 'icon', Link2: 'icon', Unlink: 'icon',
    Dialog: 'dialog', DialogContent: 'dialog-content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer', Vinca2Diagnostics: 'diagnostics',
  }, ['Vinca2Panel']);
  const render = () => harness.render(() => ({ props: { value: Vinca2Panel(props) } }));
  const button = label => treeNodes(render()).find(node =>
  node.type === 'button' &&
  (
    node.props['aria-label'] === label ||
    JSON.stringify(node.props.children).includes(label)
  )
);
  const toggleInfo = open => {
    const details = treeNodes(render()).find(node => node.type === 'details' && typeof node.props.onToggle === 'function');
    assert.ok(details, 'Modelo y compatibilidad must support automatic refresh');
    return details.props.onToggle({ currentTarget: { open } });
  };
  render();
  return { ble, calls, render, button, toggleInfo, cleanup: harness.cleanup };
}

async function devicesFixture(initial = {}) {
  const harness = hooks();
  const timers = new Map();
  const ble = { enabled: true, pendingCount: 2, sessionState: { remembered: false, status: 'idle', devices: [], ...initial }, sessionRef: { current: {} } };
  const { DevicesPage } = await loadFrontend('src/pages/DevicesPage.jsx', {
    setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn),
    ...harness.bindings, useFemometer: () => ble, useParams: () => ({}), useAuth: () => ({ user: { uid: 'a' } }),
    Link: 'link', Navigate: 'redirect', Vinca2Panel: 'panel', thermometerName, ThermometerVerificationView: 'verification', vinca2StatusText: status => status === 'listening' ? 'Escuchando temperaturas' : 'Desconectado',
    Button: 'button', CheckCircle2: 'check', X: 'close', ChevronLeft: 'icon', ChevronRight: 'icon', Thermometer: 'icon', Link2: 'icon',
    Dialog: 'dialog', DialogContent: 'content', DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description', DialogFooter: 'footer',
  }, ['DevicesPage']);
  const render = () => harness.render(() => ({ props: { value: DevicesPage() } }));
  const button = label => treeNodes(render()).find(n => n.type === 'button' && JSON.stringify(n.props.children).includes(label));
  render();
  return { ble, render, button, timers, cleanup: harness.cleanup };
}

test('Devices searches with one permission request and links with one result tap after inspection and cleanup', async () => {
  const h = await devicesFixture();
  let permissions = 0;
  const calls = [];
  const session = createFemometerSessionManager({
    getRememberedFemometer: async () => ({ remembered: false }),
    requestBluetoothPermissions: async () => { permissions++; },
    scanForFemometer: async () => [{ id: 'other', name: 'Otro' }, { id: 'vinca', name: 'BM-Vinca2' }],
    connectAndInspectFemometer: async id => { calls.push('inspect:' + id); return { compatible: id === 'vinca', model: id === 'vinca' ? 'BM-Vinca2' : null, protocol: id === 'vinca' ? 'vinca2' : null }; },
    disconnectFemometer: async () => { calls.push('disconnect'); },
    rememberFemometer: async (_, id) => { calls.push('remember:' + id); return { remembered: true, deviceKey: 'new' }; },
    addFemometerTemperatureListener: async () => ({ remove: async () => {} }),
    startFemometerTemperatureListener: async () => { calls.push('listen'); return { deviceKey: 'new', connectionReady: true, indicationsActive: true, capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } }; },
  })('a', state => { h.ble.sessionState = state; }, () => {}, createFemometerLocalState(memoryStorage(), 'a'));
  h.ble.sessionRef.current = session;
  try {
    assert.match(JSON.stringify(h.render()), /Cierra la aplicación del termómetro/);
    const search = h.button('Buscar termómetros');
    assert.match(search.props.className, /w-fit/); assert.doesNotMatch(search.props.className, /(^|\s)w-full(\s|$)/);
    await search.props.onClick(); assert.equal(permissions, 1);
    assert.ok(h.button('Comprobar compatibilidad'));
    await h.button('Otro').props.onClick();
    assert.match(JSON.stringify(h.render()), /No se puede vincular actualmente/);
    const click = h.button('Pulsa para vincular').props.onClick;
    const first = click(); await click(); await first;
    assert.deepEqual(calls, ['inspect:other', 'disconnect', 'inspect:vinca', 'disconnect', 'remember:vinca', 'listen']);
    assert.match(JSON.stringify(h.render()), /Termómetro vinculado/);
    assert.equal(h.ble.sessionState.status, 'listening');
    assert.ok(treeNodes(h.render()).some(n => n.type === 'link' && n.props.to.startsWith('/settings/devices/')));
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

test('saved devices stay visible while adding and scan results connect by opaque key, not model name', async () => {
  const h = await devicesFixture({ remembered: true, status: 'stopped', deviceKey: 'first',
    bindings: [{ deviceKey: 'first', model: 'BM-Vinca2' }, { deviceKey: 'second', model: 'BM-Vinca2' }] });
  const calls = [];
  h.ble.sessionRef.current = {
    beginChange: async () => true,
    scan: async () => { h.ble.sessionState.devices = [
      { id: 'scan-second', deviceKey: 'second', name: 'BM-Vinca2' }, { id: 'new-physical', name: 'BM-Vinca2' }]; },
    connectSaved: async key => { calls.push(['connect', key]); return false; },
    selectAndRemember: async id => { calls.push(['inspect', id]); return false; },
  };
  await h.button('+ Añadir').props.onClick();
  for (const status of ['searching', 'inspecting', 'stopping', 'stopped']) {
    h.ble.sessionState.status = status;
    const links = treeNodes(h.render()).filter(n => n.type === 'link');
    const firstCard = links.find(n => n.props.to === '/settings/devices/first');
    assert.ok(firstCard);
    assert.ok(treeNodes(firstCard).some(n => n.type === 'img'));
    assert.match(JSON.stringify(firstCard), /Vinculado/);
    assert.ok(links.some(n => n.props.to === '/settings/devices/second'));
    assert.match(JSON.stringify(h.render()), /Vinculado/);
  }
  await h.button('Buscar termómetros').props.onClick();
  await h.button('Conectar').props.onClick();
  await h.button('Pulsa para vincular').props.onClick();
  assert.deepEqual(calls, [['connect', 'second'], ['inspect', 'new-physical']]);
  assert.equal(h.ble.pendingCount, 2);
  h.ble.readings = [{ uiId: 1, deviceKey: 'first', importStatus: 'pending' }, { uiId: 2, deviceKey: 'first', promotedVerification: true, importStatus: 'pending' }];
  h.ble.sessionState.verificationPromoted = true;
  h.ble.openReadingReview = id => calls.push(['review', id]);
  h.button('Revisar temperatura de comprobación').props.onClick();
  assert.deepEqual(calls.at(-1), ['review', 2]);
  assert.doesNotMatch(JSON.stringify(h.render()), /Pendientes de revisar e incorporar/);
  h.cleanup();
});

test('adding can be abandoned and retains the existing device on failure', async () => {
  const h = await devicesFixture({ remembered: true, status: 'listening', deviceKey: 'old' });
  h.ble.sessionRef.current = { beginChange: async () => { h.ble.sessionState.status = 'stopped'; return true; }, cancelChange: async () => {}, scan: async () => { h.ble.sessionState.devices = [{ id: 'new', name: 'BM-Vinca2 nuevo' }]; },
    selectAndRemember: async id => { h.ble.sessionState = { ...h.ble.sessionState, status: 'error', selectedDeviceId: id, inspectionResult: null, error: { message: 'Timeout de comprobación' } }; return false; } };
  await h.button('+ Añadir').props.onClick();
  await h.button('Buscar termómetros').props.onClick();
  await h.button('Pulsa para vincular').props.onClick();
  assert.equal(h.ble.sessionState.deviceKey, 'old'); assert.equal(h.ble.pendingCount, 2);
  await h.button('Cancelar').props.onClick();
  assert.equal(h.button('Buscar termómetros'), undefined);
  assert.ok(treeNodes(h.render()).some(n => n.type === 'link' && n.props.to === '/settings/devices/old'));
  h.cleanup();
});

test('linked Vinca exposes shared pending review and clock, serializes operations and confirms unlink without deleting readings', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'stopped' });
  const wait = deferred();
  h.ble.sessionRef.current = { start: () => { h.calls.push('start'); return wait.promise; },
    restart: async () => h.calls.push('restart'), stop: async () => h.calls.push('stop'), unlink: async () => { h.calls.push(['unlink']); return true; } };
  assert.match(JSON.stringify(h.render()), /Femometer Vinca 2/); assert.match(JSON.stringify(h.render()), /Desconectado/);
  h.button('Temperaturas pendientes').props.onClick(); h.button('Reloj').props.onClick();
  assert.deepEqual(h.calls, ['review', 'clock']);
  assert.match(h.button('Conectar').props.className, /w-11/);
  assert.equal(h.button('Conectar').props['aria-label'], 'Conectar');
  assert.doesNotMatch(h.button('Conectar').props.className, /(^|\s)w-full(\s|$)/);
  assert.equal(h.button('Buscar termómetros'), undefined);
  const click = h.button('Conectar').props.onClick;
  const operation = click(); await click(); assert.equal(h.calls.filter(x => x === 'start').length, 1);
  wait.resolve(); await operation;
  for (const status of ['searching', 'connecting', 'stopping', 'inspecting']) {
    h.ble.sessionState.status = status;
    const action = h.button(status === 'searching' ? 'Cancelar búsqueda' : status === 'stopping'
  ? 'Desconectado'
  : 'Conectando…');

assert.ok(action);
assert.equal(action.props.disabled, status !== 'searching');
  }
  h.ble.sessionState.status = 'listening';
  h.ble.sessionState.listenerResult = { connectionReady: true, indicationsActive: true };
  assert.match(JSON.stringify(h.render()), /Conectado/);
  assert.equal(h.button('Reconectar'), undefined);
  const diagnostics = treeNodes(h.render()).find(n => n.type === 'diagnostics');
  await diagnostics.props.onRestart(); assert.ok(h.calls.includes('restart'));
  h.ble.sessionState.listenerResult.indicationsActive = false;
  assert.doesNotMatch(JSON.stringify(h.render()), /Escuchando temperaturas/);
  h.ble.sessionState.listenerResult.indicationsActive = true;
  h.button('Desvincular termómetro').props.onClick();
  assert.equal(treeNodes(h.render()).find(n => n.type === 'dialog').props.open, true);
  assert.equal(h.button('Confirmar desvinculación').props.disabled, false);
  assert.match(JSON.stringify(h.render()), /Se detendrá la escucha/);
  await h.button('Desconectar').props.onClick(); assert.ok(h.calls.includes('stop'));
  h.ble.sessionState.status = 'stopped';
  h.button('Cancelar').props.onClick(); assert.equal(h.calls.some(Array.isArray), false);
  h.button('Desvincular termómetro').props.onClick();
  await h.button('Confirmar desvinculación').props.onClick();
  assert.deepEqual(h.calls.at(-1), ['unlink']); assert.equal(h.ble.pendingCount, 2);
  h.cleanup();
});

test('technical diagnostics are collapsed by default and rendering never calls the session', async () => {
  const harness = hooks();
  let recoveryReason = 'initial';
  const { Vinca2Diagnostics } = await loadFrontend('src/components/Vinca2Diagnostics.jsx', {
    ...harness.bindings, Button: 'button', cn: (...values) => values.join(' '),
    useFemometer: () => ({ sessionState: { recoveryReason, foreground: { detectedAt: 0, reason: 'already_active' }, status: 'stopped', devices: [], inspectionResult: { services: [{ uuid: 'service', characteristics: [{ uuid: 'characteristic', properties: ['indicate'] }] }] } }, readings: [], lifecycleStatus: 'unavailable', lifecycleError: { code: 'UNIMPLEMENTED', message: 'App plugin unavailable in test' },
      sessionRef: { current: new Proxy({}, { get: () => { throw Error('Diagnostics must not access BLE'); } }) } }),
  }, ['Vinca2Diagnostics']);
  const tree = harness.render(() => ({ props: { value: Vinca2Diagnostics() } }));
  assert.equal(tree.type, 'details'); assert.equal(tree.props.open, undefined);
  assert.match(JSON.stringify(tree), /Error del ciclo de vida nativo/);
  assert.match(JSON.stringify(tree), /UNIMPLEMENTED/); assert.match(JSON.stringify(tree), /App plugin unavailable in test/);
  assert.match(JSON.stringify(tree), /Diagnóstico técnico/); assert.match(JSON.stringify(tree), /characteristic/);
  for (const [reason, label] of Object.entries({ initial: 'búsqueda automática inicial', automatic_retry: 'único reintento automático',
    connected: 'conexión e indicaciones preparadas', window_exhausted: 'no encontrado tras las dos búsquedas',
    manual: 'conexión solicitada manualmente', foreground: 'nueva oportunidad tras segundo plano',
    connection_ready: 'conexión ya preparada; sin búsqueda', lifecycle_cancelled: 'cancelada por segundo plano',
    unrecoverable_error: 'error no recuperable' })) {
    recoveryReason = reason;
    const rendered = JSON.stringify(harness.render(() => ({ props: { value: Vinca2Diagnostics() } })));
    assert.ok(rendered.includes(label)); assert.ok(rendered.includes('la app ya estaba activa'));
  }
  harness.cleanup();
});

test('Vinca configuration distinguishes clock states and opens the shared clock dialog', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening', capabilities: { clockRead: true, clockSync: true } });
  h.ble.sessionRef.current = { readClock: async () => h.calls.push('read'), syncClock: async () => h.calls.push('sync') };
  for (const [state, label] of [['unknown', 'Sin verificar'], ['read_correct', 'Parece correcto'], ['synchronized_verified', 'Verificado'], ['misaligned', 'Desajustado']]) {
    h.ble.clockHistory = { state };
    assert.ok(JSON.stringify(h.button('Reloj')).includes(label));
  }
  assert.equal(h.button('Leer reloj'), undefined);
  assert.equal(h.button('Sincronizar fecha y hora'), undefined);
  h.button('Reloj').props.onClick();
  assert.deepEqual(h.calls, ['clock']);
  h.ble.sessionState.clockBusy = true;
  assert.equal(treeNodes(h.render()).find(n => n.type === 'diagnostics').props.restartDisabled, true);
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
    connectAndInspectFemometer: async id => { calls.push(['inspect', id]); return { compatible: true, model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' }; },
    disconnectFemometer: async () => { calls.push(['disconnect']); },
    rememberFemometer: async (user, id) => { calls.push(['remember', user, id]); storedKey = id; return { remembered: true, deviceKey: id }; },
    forgetFemometer: () => { throw Error('Never forget before replacing'); },
    addFemometerTemperatureListener: async () => ({ remove: async () => {} }),
    startFemometerTemperatureListener: async id => { calls.push(['listen', id]); return { deviceKey: id, connectionReady: true, indicationsActive: true, capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } }; },
    ...overrides,
  };
  const factory = createFemometerSessionManager(api);
  const local = createFemometerLocalState(memoryStorage(), 'a');
  const session = factory('a', next => { state = next; }, () => {}, local);
  await session.scan();
  return { session, factory, api, calls, local, state: () => state, storedKey: () => storedKey };
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
  inspection.resolve({ compatible: true, model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' }); await flush();
  assert.deepEqual(h.calls, [['inspect', 'new'], ['disconnect']]);
  assert.equal(h.state().deviceKey, 'old');
  cleanup.resolve(); await flush();
  assert.deepEqual(h.calls.at(-1), ['remember', 'a', 'new']);
  assert.equal(h.state().deviceKey, 'old');
  persistence.resolve({ remembered: true, deviceKey: 'new' });
  assert.equal(await binding, true); assert.equal(h.state().deviceKey, 'new');
  assert.equal(h.state().status, 'listening'); assert.equal(h.state().busy, false);
  assert.deepEqual(h.state().preferences, { volume: 'medium', measurementMode: 'normal' });
  await h.session.dispose();
});

test('incompatible, failed inspection/cleanup and unconfirmed persistence never replace the previous binding', async () => {
  for (const failure of ['incompatible', 'inspection', 'cleanup', 'persistence', 'unconfirmed', 'malformed']) {
    const h = await coordinatedBindingFixture();
    let remembers = 0;
    h.api.connectAndInspectFemometer = async () => {
      if (failure === 'inspection') throw { code: 'CONNECTION_TIMEOUT', message: 'Timeout' };
      return failure === 'malformed' ? null : { compatible: failure !== 'incompatible', model: 'BM-Vinca2', protocol: 'vinca2' };
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
    wait.resolve({ compatible: true, model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' });
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


test('device info validates each field without conflating firmware/software or retaining identifiers', () => {
  const empty = { battery: null, model: null, manufacturer: null, firmware: null, software: null };
  assert.deepEqual(normalizeFemometerDeviceInfo(null), empty);
  assert.deepEqual(normalizeFemometerDeviceInfo({ battery: 0, model: ' Vinca\0 ', manufacturer: 'Fémometer',
    firmware: null, software: ' SW-2 ', serial: 'private', address: 'private' }),
  { battery: 0, model: 'Vinca', manufacturer: 'Fémometer', firmware: null, software: 'SW-2' });
  for (const battery of [-1, 101, 255, 1.5, '85', NaN, Infinity]) assert.equal(normalizeFemometerDeviceInfo({ battery }).battery, null);
  assert.equal(normalizeFemometerDeviceInfo({ battery: 100 }).battery, 100);
  assert.deepEqual(normalizeFemometerDeviceInfo({ model: 'x'.repeat(129), manufacturer: {}, firmware: '\0\uFFFD', software: '' }), empty);
});

test('device info is explicit, sequential with clock jobs, ignores duplicate presses and keeps temperatures', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  const session = owner.render().sessionRef.current;
  assert.equal(native.calls.info, 0);
  native.flags.infoWait = deferred();
  const pending = session.readDeviceInfo();
  await flush();
  assert.equal(owner.render().sessionState.deviceInfoStatus, 'loading');
  await Promise.all([session.readDeviceInfo(), session.readClock(), session.syncClock()]);
  assert.equal(native.calls.info, 1); assert.equal(native.calls.clock, 1); assert.equal(native.calls.sync, 0);
  native.emit({ temperatureC: 36.4 });
  assert.equal(owner.render().pendingCount, 1);
  native.flags.infoWait.resolve({ battery: 85, model: 'BM-Vinca2', manufacturer: 'Femometer', firmware: 'FW-1', software: 'SW-2' });
  await pending;
  assert.deepEqual(owner.render().sessionState.deviceInfoResult, { battery: 85, model: 'BM-Vinca2', manufacturer: 'Femometer', firmware: 'FW-1', software: 'SW-2' });
  assert.equal(owner.render().sessionState.deviceInfoStatus, 'received');
  assert.equal(owner.render().sessionState.status, 'listening');
  assert.equal(native.calls.connections, 1); assert.equal(native.calls.disconnects, 0);
  native.flags.syncWait = deferred();
  const sync = session.syncClock(); await flush();
  await session.readDeviceInfo(); assert.equal(native.calls.info, 1);
  native.flags.syncWait.resolve({}); await sync;
  owner.cleanup(); await flush();
});

test('device info absent fields, total absence and transport/timeout errors stay local to the query', async () => {
  const native = bridge(); let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.readDeviceInfo(); assert.equal(native.calls.info, 0);
  await session.start();
  native.flags.infoResult = { battery: 85, software: 'SW-2' };
  await session.readDeviceInfo();
  assert.equal(state.deviceInfoResult.firmware, null); assert.equal(state.deviceInfoResult.software, 'SW-2');
  native.flags.infoResult = { model: 'Vinca' };
  await session.readDeviceInfo(); assert.equal(state.deviceInfoResult.battery, null);
  native.flags.infoResult = {};
  await session.readDeviceInfo(); assert.equal(state.deviceInfoStatus, 'unavailable');
  for (const code of ['DEVICE_INFO_READ_FAILED', 'DEVICE_INFO_TIMEOUT', 'DEVICE_INFO_RECONNECT_REQUIRED']) {
    await session.stop(); await session.start();
    native.flags.infoError = { code, message: 'Reconnect before retrying' };
    await session.readDeviceInfo();
    assert.equal(state.deviceInfoStatus, 'error'); assert.equal(state.deviceInfoError.code, code);
    assert.equal(state.deviceInfoResult, null); assert.equal(state.status, 'listening'); assert.equal(state.error, null);
  }
  assert.equal(native.calls.disconnects, 3);
  await session.dispose();
});

test('device info cancellation clears immediately and late results cannot cross connections or accounts', async () => {
  for (const reason of ['disconnect', 'dispose', 'account', 'suspend']) {
    const native = bridge(); let state; let nextState;
    const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); native.flags.infoWait = deferred();
    const query = session.readDeviceInfo(); await flush();
    let successor;
    if (reason === 'account') successor = native.factory('b', next => { nextState = next; }, () => {});
    const stopped = reason === 'suspend' ? session.suspend() : reason === 'dispose' || reason === 'account' ? session.dispose() : session.stop();
    if (reason !== 'dispose' && reason !== 'account') {
      assert.equal(state.deviceInfoResult, null); assert.equal(state.deviceInfoStatus, 'idle');
    }
    native.flags.infoWait.resolve({ battery: 99, software: 'old' });
    await query; await stopped;
    native.flags.infoWait = null;
    if (successor) {
      await successor.start(); assert.equal(nextState.deviceInfoResult, null);
      await successor.readDeviceInfo(); assert.equal(nextState.deviceInfoResult.battery, 85);
      await successor.dispose();
    } else if (reason === 'disconnect') {
      await session.start(); assert.equal(state.deviceInfoResult, null);
      await session.readDeviceInfo(); assert.equal(state.deviceInfoResult.battery, 85);
      await session.dispose();
    }
  }
});

test('a disconnected event cancels device info without removing pending measurements', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  native.emit({ temperatureC: 36.4 });
  native.flags.infoWait = deferred();
  const pending = owner.render().sessionRef.current.readDeviceInfo(); await flush();
  native.emit({ status: 'disconnected' });
  assert.equal(owner.render().sessionState.deviceInfoResult, null);
  native.flags.infoWait.resolve({ battery: 85 }); await pending; await flush();
  assert.equal(owner.render().sessionState.deviceInfoResult, null);
  assert.equal(owner.render().pendingCount, 1);
  owner.cleanup(); await flush();
});

test('Vinca device info refreshes on opening only when ready, renders separate rows and a local error', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening' });
  h.ble.sessionRef.current.readDeviceInfo = async () => h.calls.push('info');
  await h.toggleInfo(true); assert.deepEqual(h.calls, []);
  h.ble.sessionState.listenerResult = { connectionReady: true, indicationsActive: true };
  await h.toggleInfo(false); assert.deepEqual(h.calls, []);
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['info']);
  assert.equal(h.button('Consultar datos'), undefined);
  h.ble.sessionState.deviceInfoResult = { battery: 85, firmware: null, software: 'SW-only' };
  const text = JSON.stringify(h.render());
  assert.match(text, /85 %/); assert.match(text, /SW-only/); assert.doesNotMatch(text, /No disponible/);
  assert.equal(treeNodes(h.render()).filter(node => node.type === 'dd').length, 2);
  const summary = treeNodes(h.render()).find(node => node.type === 'summary' && JSON.stringify(node.props.children).includes('Modelo y compatibilidad'));
  assert.ok(summary);
  assert.ok(treeNodes(summary).some(node => node.type === 'span' && node.props.title === 'Último nivel conocido de batería' && node.props.children.includes(85)));
  h.ble.sessionState.deviceInfoBusy = true;
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['info']);
  assert.match(JSON.stringify(h.render()), /Consultando datos/);
  h.ble.sessionState.deviceInfoBusy = false;
  h.ble.sessionState.deviceInfoError = { message: 'Consulta fallida' };
  assert.match(JSON.stringify(h.render()), /Consulta fallida/);
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['info', 'info']);
  for (const flag of ['clockBusy', 'gattReconnectRequired', 'volumeReconnectRequired', 'measurementModeReconnectRequired']) {
    h.ble.sessionState[flag] = true;
    await h.toggleInfo(true); assert.deepEqual(h.calls, ['info', 'info']);
    h.ble.sessionState[flag] = false;
  }
  h.ble.sessionState.status = 'stopped';
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['info', 'info']);
  assert.doesNotMatch(JSON.stringify(h.render()), /85 %|SW-only/);
  h.cleanup();
});


test('lab device info simulates all results and cancellation without a native adapter', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const timers = new Set();
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => ({ key: 'devices' }), useNavigate: () => () => {},
    createBleLabScenario, bleLabScenarios, Button: 'button', FemometerReviewCard: 'card', BleReadingReviewView: 'editor', BleSavedNotice: 'notice', FemometerFeedback: 'clock',
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, ['BluetoothVisualLab'], source => source.replace('export default function BluetoothVisualLab', 'function BluetoothVisualLab'));
  const render = () => harness.render(() => ({ props: { value: BluetoothVisualLab({ Provider: 'provider', children: null }) } }));
  const lab = () => render().props.value;
  treeNodes(render()).find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick();
  const select = (label, value) => treeNodes(render()).find(n => n.type === 'select' && n.props['aria-label'] === label).props.onChange({ target: { value } });
  const finish = () => { for (const fn of timers) { timers.delete(fn); fn(); render(); } };
  select('Modo de previsualización', 'android');
  await lab().sessionRef.current.readDeviceInfo(); assert.equal(timers.size, 0);
  select('Escenario visual', 'multiple');
  const count = lab().pendingCount;
  for (const scenario of ['complete', 'noFirmware', 'noBattery', 'error']) {
    select('Escenario de datos', scenario);
    const query = lab().sessionRef.current.readDeviceInfo();
    assert.equal(lab().sessionState.deviceInfoStatus, 'loading');
    await lab().sessionRef.current.readDeviceInfo();
    await lab().sessionRef.current.syncClock();
    assert.equal(timers.size, 1);
    finish(); await query;
    const state = lab().sessionState;
    assert.equal(state.status, 'listening'); assert.equal(lab().pendingCount, count);
    assert.equal(state.deviceInfoStatus, scenario === 'error' ? 'error' : 'received');
    if (scenario !== 'error') {
      assert.equal(state.deviceInfoResult.battery, scenario === 'noBattery' ? null : 85);
      assert.equal(state.deviceInfoResult.firmware, scenario === 'noFirmware' ? null : 'FW-demo');
      assert.equal(state.deviceInfoResult.software, 'SW-demo');
    } else assert.equal(state.deviceInfoResult, null);
  }
  const pending = lab().sessionRef.current.readDeviceInfo();
  const late = [...timers];
  select('Escenario visual', 'disconnected'); await pending;
  late.forEach(fn => fn());
  assert.equal(lab().sessionState.deviceInfoResult ?? null, null);
  await lab().sessionRef.current.readDeviceInfo(); assert.equal(timers.size, 0);
  select('Escenario visual', 'listening');
  const cancelled = lab().sessionRef.current.readDeviceInfo();
  await lab().sessionRef.current.stop(); await cancelled;
  assert.equal(lab().sessionState.deviceInfoResult, null);
  harness.cleanup();
});


test('volume adapter validates the level and keeps the Android Staging boundary', async () => {
  const calls = []; let staging = true; let platform = 'android';
  const capacitor = { isNativePlatform: () => platform === 'android', getPlatform: () => platform,
    nativePromise: async (...args) => { calls.push(args); return { commandsAccepted: true }; } };
  const { setFemometerVolume } = await loadFrontend('src/lib/femometerBle.js', {
    Capacitor: capacitor, window: { Capacitor: capacitor }, registerPlugin: () => ({}),
    isFemometerPrototypeEnabled: () => staging, createFemometerSessionManager,
  }, ['setFemometerVolume']);
  for (const level of ['low', 'medium', 'high']) await setFemometerVolume(level);
  assert.deepEqual(calls, ['low', 'medium', 'high'].map(level => ['FemometerBle', 'setVolume', { level }]));
  for (const level of [null, undefined, '', 9, 'LOW', 'mute', ' low ']) await assert.rejects(setFemometerVolume(level), { code: 'VOLUME_INVALID_LEVEL' });
  staging = false; await assert.rejects(setFemometerVolume('low'), { code: 'UNAVAILABLE_PLATFORM' });
  staging = true; platform = 'web'; await assert.rejects(setFemometerVolume('low'), { code: 'UNAVAILABLE_PLATFORM' });
  assert.equal(calls.length, 3);
});

test('volume is explicit, has no default and preserves listening and pending temperatures', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  const session = owner.render().sessionRef.current;
  assert.equal(owner.render().sessionState.volumeResult, null); assert.deepEqual(native.calls.volume, []);
  for (const level of ['low', 'medium', 'high']) {
    await session.setVolume(level);
    assert.deepEqual(owner.render().sessionState.volumeResult, { level, outcome: 'accepted', commandsAccepted: true, verified: false });
  }
  native.flags.volumeWait = deferred();
  const pending = session.setVolume('low'); await flush();
  assert.equal(owner.render().sessionState.volumeBusy, true); assert.equal(owner.render().sessionState.volumeResult, null);
  await Promise.all([session.setVolume('high'), session.readClock(), session.syncClock(), session.readDeviceInfo(), session.restart()]);
  assert.deepEqual(native.calls.volume, ['low', 'medium', 'high', 'low']);
  assert.equal(native.calls.clock, 1); assert.equal(native.calls.sync, 0); assert.equal(native.calls.info, 0);
  native.emit({ temperatureC: 36.4 }); assert.equal(owner.render().pendingCount, 1);
  native.flags.volumeWait.resolve({ level: 'low', outcome: 'accepted', commandsAccepted: true, verified: true }); await pending;
  assert.equal(owner.render().sessionState.volumeResult.verified, false);
  assert.equal(owner.render().sessionState.status, 'listening'); assert.equal(owner.render().pendingCount, 1);
  assert.equal(native.calls.connections, 1); assert.equal(native.calls.disconnects, 0);
  await session.stop(); assert.equal(owner.render().pendingCount, 1); assert.equal(owner.render().sessionState.volumeResult, null);
  owner.cleanup(); await flush();
});

test('volume refuses unsupported and invalid requests and is excluded by clock and device info', async () => {
  const native = bridge(); let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.setVolume('low'); assert.equal(state.volumeError.code, 'VOLUME_NOT_CONNECTED');
  native.flags.volumeSupported = false; await session.start();
  await session.setVolume('low'); assert.equal(state.volumeError.code, 'VOLUME_UNSUPPORTED');
  for (const level of ['mute', null, 0, 'Low']) {
    await session.setVolume(level); assert.equal(state.volumeError.code, 'VOLUME_INVALID_LEVEL');
  }
  assert.deepEqual(native.calls.volume, []);
  await session.stop(); native.flags.volumeSupported = true; await session.start();
  native.flags.syncWait = deferred(); const sync = session.syncClock(); await flush();
  await session.setVolume('low'); assert.deepEqual(native.calls.volume, []);
  native.flags.syncWait.resolve({}); await sync;
  native.flags.clockWait = deferred(); const clock = session.readClock(); await flush();
  await session.setVolume('low'); assert.deepEqual(native.calls.volume, []);
  native.flags.clockWait.resolve({}); await clock;
  native.flags.infoWait = deferred(); const info = session.readDeviceInfo(); await flush();
  await session.setVolume('low'); assert.deepEqual(native.calls.volume, []);
  native.flags.infoWait.resolve({ battery: 85 }); await info;
  await session.setVolume('medium'); assert.equal(state.volumeResult.level, 'medium');
  await session.dispose();
});

test('volume errors distinguish write failure, cancellation and unknown result and require reconnection', async () => {
  for (const code of ['VOLUME_FIRST_WRITE_FAILED', 'VOLUME_CONFIRM_WRITE_FAILED', 'VOLUME_TIMEOUT', 'VOLUME_CANCELLED']) {
    const native = bridge(); let state; const events = [];
    const session = native.factory('a', next => { state = next; }, event => events.push(event));
    await session.start(); await session.setVolume('low');
    native.flags.volumeError = { code, message: 'Simulated volume failure' };
    await session.setVolume('high');
    assert.equal(state.volumeResult, null); assert.equal(state.volumeBusy, false);
    assert.equal(state.volumeError.outcome, code === 'VOLUME_TIMEOUT' ? 'unknown' : code === 'VOLUME_CANCELLED' ? 'cancelled' : 'error');
    assert.equal(state.volumeReconnectRequired, true); assert.equal(state.status, 'listening'); assert.equal(state.error, null);
    const count = native.calls.volume.length;
    await Promise.all([session.setVolume('medium'), session.readDeviceInfo(), session.syncClock(), session.readClock()]);
    assert.equal(native.calls.volume.length, count); assert.equal(native.calls.info, 0); assert.equal(native.calls.sync, 0); assert.equal(native.calls.clock, 1);
    native.emit({ temperatureC: 36.4 }); assert.equal(events.length, 1); assert.equal(native.calls.disconnects, 0);
    await session.stop(); native.flags.volumeError = null; await session.start();
    assert.equal(state.volumeResult, null); assert.equal(state.volumeReconnectRequired, false);
    await session.setVolume('medium'); assert.equal(state.volumeResult.level, 'medium');
    await session.dispose();
  }
});

test('malformed volume responses never advertise an accepted or verified adjustment', async () => {
  for (const result of [{}, { level: 'high', outcome: 'accepted', commandsAccepted: true }, { level: 'low', commandsAccepted: false }]) {
    const native = bridge(); let state; const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); native.flags.volumeResult = result; await session.setVolume('low');
    assert.equal(state.volumeResult, null); assert.equal(state.volumeError.outcome, 'unknown');
    assert.equal(state.volumeReconnectRequired, true); await session.dispose();
  }
});

test('volume cancellation and late completion cannot cross account or connection boundaries', async () => {
  for (const reason of ['stop', 'suspend', 'dispose', 'account', 'disconnect']) {
    const native = bridge(); let state; let successorState;
    const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); native.flags.volumeWait = deferred();
    const pending = session.setVolume('high'); await flush();
    let successor;
    if (reason === 'account') successor = native.factory('b', next => { successorState = next; }, () => {});
    if (reason === 'disconnect') native.emit({ status: 'disconnected' });
    const stopped = reason === 'suspend' ? session.suspend() : ['account', 'dispose'].includes(reason) ? session.dispose() : session.stop();
    if (!['account', 'dispose'].includes(reason)) {
      assert.equal(state.volumeResult, null); assert.equal(state.volumeError.outcome, 'cancelled');
    }
    native.flags.volumeWait.resolve({ level: 'high', outcome: 'accepted', commandsAccepted: true });
    await pending; await stopped; native.flags.volumeWait = null;
    if (successor) {
      await successor.start(); assert.equal(successorState.volumeResult, null);
      await successor.setVolume('low'); assert.equal(successorState.volumeResult.level, 'low'); await successor.dispose();
    } else if (['stop', 'disconnect'].includes(reason)) {
      await session.start(); assert.equal(state.volumeResult, null);
      await session.setVolume('low'); assert.equal(state.volumeResult.level, 'low'); await session.dispose();
    }
  }
});

test('Vinca volume controls show only sent levels, no default, and disable unsafe actions', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening', capabilities: { volumeWrite: true, clockRead: true, clockSync: true } });
  assert.equal(h.button('Bajo').props.disabled, true);
  h.ble.sessionState.listenerResult = { connectionReady: true, indicationsActive: true };
  for (const label of ['Bajo', 'Medio', 'Alto']) {
    assert.equal(h.button(label).props['aria-pressed'], false); assert.match(h.button(label).props.className, /min-h-11/);
    assert.equal(h.button(label).props.disabled, false);
  }
  h.ble.sessionRef.current.setVolume = async level => h.calls.push(level);
  for (const [level, label] of [['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto']]) {
    await h.button(label).props.onClick();
    h.ble.sessionState.volumeResult = { level, commandsAccepted: true, verified: false };
    h.ble.sessionState.preferences = { ...h.ble.sessionState.preferences, volume: level };
    assert.match(JSON.stringify(h.render()), /Aplicado en esta conexión/);
    assert.equal(h.button(label).props['aria-pressed'], true);
  }
  assert.deepEqual(h.calls, ['low', 'medium', 'high']);
  h.ble.sessionState.volumeResult = null; h.ble.sessionState.volumeBusy = true;
  assert.match(JSON.stringify(h.render()), /Aplicando ajuste/);
  h.ble.sessionRef.current.readDeviceInfo = async () => h.calls.push('info');
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['low', 'medium', 'high']);
  h.ble.sessionState.volumeBusy = false; h.ble.sessionState.volumeReconnectRequired = true;
  h.ble.sessionState.volumeError = { message: 'Resultado desconocido; reconecta' };
  assert.match(JSON.stringify(h.render()), /Resultado desconocido/); assert.doesNotMatch(JSON.stringify(h.render()), /Ajuste enviado:/);
  assert.equal(h.button('Bajo').props.disabled, true); assert.equal(treeNodes(h.render()).find(n => n.type === 'diagnostics').props.recoveryRequired, true); assert.equal(treeNodes(h.render()).find(n => n.type === 'diagnostics').props.restartDisabled, false);
  h.ble.sessionState.volumeReconnectRequired = false;
  for (const flag of ['clockBusy', 'deviceInfoBusy']) { h.ble.sessionState[flag] = true; assert.equal(h.button('Bajo').props.disabled, true); h.ble.sessionState[flag] = false; }
  h.ble.sessionState.status = 'stopped'; assert.equal(h.button('Alto').props.disabled, true);
  h.cleanup();
});


test('volume lab simulates two stages, errors, timeout and exclusions without native access', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const timers = new Set();
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => ({ key: 'devices' }), useNavigate: () => () => {},
    createBleLabScenario, bleLabScenarios, Button: 'button', FemometerReviewCard: 'card', BleReadingReviewView: 'editor', BleSavedNotice: 'notice', FemometerFeedback: 'clock',
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, ['BluetoothVisualLab'], source => source.replace('export default function BluetoothVisualLab', 'function BluetoothVisualLab'));
  const render = () => harness.render(() => ({ props: { value: BluetoothVisualLab({ Provider: 'provider', children: null }) } }));
  const lab = () => render().props.value;
  treeNodes(render()).find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick();
  const select = (label, value) => treeNodes(render()).find(n => n.type === 'select' && n.props['aria-label'] === label).props.onChange({ target: { value } });
  const advance = () => { for (const fn of [...timers]) { timers.delete(fn); fn(); } };
  await lab().sessionRef.current.setVolume('low'); assert.equal(timers.size, 0);
  select('Modo de previsualización', 'android');
  await lab().sessionRef.current.setVolume('low'); assert.equal(lab().sessionState.volumeError.code, 'VOLUME_NOT_CONNECTED');
  select('Escenario visual', 'multiple');
  await lab().sessionRef.current.setVolume('invalid'); assert.equal(lab().sessionState.volumeError.code, 'VOLUME_INVALID_LEVEL');
  for (const level of ['low', 'medium', 'high']) {
    const pending = lab().sessionRef.current.setVolume(level);
    await lab().sessionRef.current.setVolume('low');
    await lab().sessionRef.current.readClock(); await lab().sessionRef.current.syncClock(); await lab().sessionRef.current.readDeviceInfo();
    assert.equal(timers.size, 1); assert.equal(lab().sessionState.volumeBusy, true);
    advance(); assert.equal(lab().sessionState.volumeBusy, true); assert.equal(lab().sessionState.volumeResult, null);
    advance(); await pending;
    assert.deepEqual(lab().sessionState.volumeResult, { level, outcome: 'accepted', commandsAccepted: true, verified: false });
    assert.equal(lab().pendingCount, 3); assert.equal(lab().sessionState.status, 'listening');
  }
  for (const [scenario, code, outcome] of [['firstError', 'VOLUME_FIRST_WRITE_FAILED', 'error'], ['confirmError', 'VOLUME_CONFIRM_WRITE_FAILED', 'error'], ['timeout', 'VOLUME_TIMEOUT', 'unknown']]) {
    select('Escenario de volumen', scenario);
    const pending = lab().sessionRef.current.setVolume('high');
    advance(); if (scenario !== 'firstError') { assert.equal(lab().sessionState.volumeBusy, true); advance(); }
    await pending;
    assert.equal(lab().sessionState.volumeError.code, code); assert.equal(lab().sessionState.volumeError.outcome, outcome);
    assert.equal(lab().sessionState.volumeResult, null); assert.equal(lab().pendingCount, 3);
    await lab().sessionRef.current.setVolume('low');
    await lab().sessionRef.current.readDeviceInfo(); await lab().sessionRef.current.syncClock(); assert.equal(timers.size, 0);
    select('Escenario de volumen', 'accepted');
    await lab().sessionRef.current.stop(); lab().sessionRef.current.start();
    for (let step = 0; step < 10 && timers.size; step++) { advance(); await flush(); lab(); }
    assert.equal(lab().sessionState.volumeResult.level, 'high');
    select('Escenario visual', 'multiple'); // Begin the next explicit failure with no connection result.
    assert.equal(lab().sessionState.volumeResult, null);
  }
  select('Escenario de volumen', 'accepted');
  const clock = lab().sessionRef.current.syncClock();
  // Also blocked through a stale React closure before another render.
  await lab().sessionRef.current.setVolume('high'); assert.equal(timers.size, 1);
  advance(); await clock; assert.equal(lab().sessionState.volumeResult, null);
  const info = lab().sessionRef.current.readDeviceInfo();
  await lab().sessionRef.current.setVolume('high'); assert.equal(timers.size, 1);
  advance(); await info; assert.equal(lab().sessionState.volumeResult, null);
  const pending = lab().sessionRef.current.setVolume('high'); advance();
  const late = [...timers];
  await lab().sessionRef.current.stop(); await pending;
  assert.equal(lab().sessionState.volumeError.outcome, 'cancelled');
  late.forEach(fn => fn()); assert.equal(lab().sessionState.volumeResult, null);
  assert.equal(lab().pendingCount, 3);
  select('Escenario visual', 'listening');
  const unmounted = lab().sessionRef.current.setVolume('low'); const afterUnmount = [...timers];
  harness.cleanup(); await unmounted; afterUnmount.forEach(fn => fn()); assert.equal(timers.size, 0);
});


test('volume cannot write while listener initialization is pending or readiness is incomplete', async () => {
  const native = bridge(); native.flags.listenerWait = deferred();
  const session = native.factory('a', () => {}, () => {});
  const starting = session.start(); await flush();
  await session.setVolume('high'); assert.deepEqual(native.calls.volume, []);
  native.flags.listenerWait.resolve(); await starting;
  await session.setVolume('low'); assert.deepEqual(native.calls.volume, ['low']);
  await session.dispose();
  for (const flag of ['listenerReady', 'indicationsActive']) {
    const incomplete = bridge(); incomplete.flags[flag] = false;
    let state; const owner = incomplete.factory('a', next => { state = next; }, () => {});
    await owner.start(); assert.equal(state.status, 'error'); assert.equal(state.error.code, 'LISTENER_NOT_READY'); await owner.setVolume('low');
    assert.deepEqual(incomplete.calls.volume, []); assert.equal(state.volumeError.code, 'VOLUME_NOT_CONNECTED');
    await owner.dispose();
  }
});


test('measurement mode adapter validates the level and keeps the Android Staging boundary', async () => {
  const calls = []; let staging = true; let platform = 'android';
  const capacitor = { isNativePlatform: () => platform === 'android', getPlatform: () => platform,
    nativePromise: async (...args) => { calls.push(args); return { commandsAccepted: true }; } };
  const { setFemometerMeasurementMode } = await loadFrontend('src/lib/femometerBle.js', {
    Capacitor: capacitor, window: { Capacitor: capacitor }, registerPlugin: () => ({}),
    isFemometerPrototypeEnabled: () => staging, createFemometerSessionManager,
  }, ['setFemometerMeasurementMode']);
  for (const level of ['quick', 'normal', 'precise']) await setFemometerMeasurementMode(level);
  assert.deepEqual(calls, ['quick', 'normal', 'precise'].map(level => ['FemometerBle', 'setMeasurementMode', { level }]));
  for (const level of [null, undefined, '', 9, 'QUICK', 'low', 'medium', 'high', 'mute', ' quick ']) await assert.rejects(setFemometerMeasurementMode(level), { code: 'MEASUREMENT_MODE_INVALID_LEVEL' });
  staging = false; await assert.rejects(setFemometerMeasurementMode('quick'), { code: 'UNAVAILABLE_PLATFORM' });
  staging = true; platform = 'web'; await assert.rejects(setFemometerMeasurementMode('quick'), { code: 'UNAVAILABLE_PLATFORM' });
  assert.equal(calls.length, 3);
});

test('measurement mode is explicit, has no default and preserves listening and pending temperatures', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  const session = owner.render().sessionRef.current;
  assert.equal(owner.render().sessionState.measurementModeResult, null); assert.deepEqual(native.calls.measurementMode, []);
  for (const level of ['quick', 'normal', 'precise']) {
    await session.setMeasurementMode(level);
    assert.deepEqual(owner.render().sessionState.measurementModeResult, { level, outcome: 'accepted', commandsAccepted: true, verified: false });
  }
  native.flags.measurementModeWait = deferred();
  const pending = session.setMeasurementMode('quick'); await flush();
  assert.equal(owner.render().sessionState.measurementModeBusy, true); assert.equal(owner.render().sessionState.measurementModeResult, null);
  await Promise.all([session.setVolume('low'), session.setMeasurementMode('precise'), session.readClock(), session.syncClock(), session.readDeviceInfo(), session.restart()]);
  assert.deepEqual(native.calls.measurementMode, ['quick', 'normal', 'precise', 'quick']);
  assert.equal(native.calls.clock, 1); assert.equal(native.calls.sync, 0); assert.equal(native.calls.info, 0);
  native.emit({ temperatureC: 36.4 }); assert.equal(owner.render().pendingCount, 1);
  native.flags.measurementModeWait.resolve({ level: 'quick', outcome: 'accepted', commandsAccepted: true, verified: true }); await pending;
  assert.equal(owner.render().sessionState.measurementModeResult.verified, false);
  assert.equal(owner.render().sessionState.status, 'listening'); assert.equal(owner.render().pendingCount, 1);
  assert.equal(native.calls.connections, 1); assert.equal(native.calls.disconnects, 0);
  await session.stop(); assert.equal(owner.render().pendingCount, 1); assert.equal(owner.render().sessionState.measurementModeResult, null);
  owner.cleanup(); await flush();
});

test('measurement mode refuses unsupported and invalid requests and is excluded by clock and device info', async () => {
  const native = bridge(); let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.setMeasurementMode('quick'); assert.equal(state.measurementModeError.code, 'MEASUREMENT_MODE_NOT_CONNECTED');
  native.flags.measurementModeSupported = false; await session.start();
  await session.setMeasurementMode('quick'); assert.equal(state.measurementModeError.code, 'MEASUREMENT_MODE_UNSUPPORTED');
  for (const level of ['mute', null, 0, 'Low']) {
    await session.setMeasurementMode(level); assert.equal(state.measurementModeError.code, 'MEASUREMENT_MODE_INVALID_LEVEL');
  }
  assert.deepEqual(native.calls.measurementMode, []);
  await session.stop(); native.flags.measurementModeSupported = true; await session.start();
  native.flags.syncWait = deferred(); const sync = session.syncClock(); await flush();
  await session.setMeasurementMode('quick'); assert.deepEqual(native.calls.measurementMode, []);
  native.flags.syncWait.resolve({}); await sync;
  native.flags.clockWait = deferred(); const clock = session.readClock(); await flush();
  await session.setMeasurementMode('quick'); assert.deepEqual(native.calls.measurementMode, []);
  native.flags.clockWait.resolve({}); await clock;
  native.flags.infoWait = deferred(); const info = session.readDeviceInfo(); await flush();
  await session.setMeasurementMode('quick'); assert.deepEqual(native.calls.measurementMode, []);
  native.flags.infoWait.resolve({ battery: 85 }); await info;
  await session.setMeasurementMode('normal'); assert.equal(state.measurementModeResult.level, 'normal');
  await session.dispose();
});

test('measurement mode errors distinguish write failure, cancellation and unknown result and require reconnection', async () => {
  for (const code of ['MEASUREMENT_MODE_FIRST_WRITE_FAILED', 'MEASUREMENT_MODE_CONFIRM_WRITE_FAILED', 'MEASUREMENT_MODE_TIMEOUT', 'MEASUREMENT_MODE_CANCELLED']) {
    const native = bridge(); let state; const events = [];
    const session = native.factory('a', next => { state = next; }, event => events.push(event));
    await session.start(); await session.setMeasurementMode('quick');
    native.flags.measurementModeError = { code, message: 'Simulated measurementMode failure' };
    await session.setMeasurementMode('precise');
    assert.equal(state.measurementModeResult, null); assert.equal(state.measurementModeBusy, false);
    assert.equal(state.measurementModeError.outcome, code === 'MEASUREMENT_MODE_TIMEOUT' ? 'unknown' : code === 'MEASUREMENT_MODE_CANCELLED' ? 'cancelled' : 'error');
    assert.equal(state.measurementModeReconnectRequired, true); assert.equal(state.status, 'listening'); assert.equal(state.error, null);
    const count = native.calls.measurementMode.length;
    await Promise.all([session.setMeasurementMode('normal'), session.readDeviceInfo(), session.syncClock(), session.readClock()]);
    assert.equal(native.calls.measurementMode.length, count); assert.equal(native.calls.info, 0); assert.equal(native.calls.sync, 0); assert.equal(native.calls.clock, 1);
    native.emit({ temperatureC: 36.4 }); assert.equal(events.length, 1); assert.equal(native.calls.disconnects, 0);
    await session.stop(); native.flags.measurementModeError = null; await session.start();
    assert.equal(state.measurementModeResult, null); assert.equal(state.measurementModeReconnectRequired, false);
    await session.setMeasurementMode('normal'); assert.equal(state.measurementModeResult.level, 'normal');
    await session.dispose();
  }
});

test('malformed measurement mode responses never advertise an accepted or verified adjustment', async () => {
  for (const result of [{}, { level: 'precise', outcome: 'accepted', commandsAccepted: true }, { level: 'quick', commandsAccepted: false }]) {
    const native = bridge(); let state; const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); native.flags.measurementModeResult = result; await session.setMeasurementMode('quick');
    assert.equal(state.measurementModeResult, null); assert.equal(state.measurementModeError.outcome, 'unknown');
    assert.equal(state.measurementModeReconnectRequired, true); await session.dispose();
  }
});

test('measurement mode cancellation and late completion cannot cross account or connection boundaries', async () => {
  for (const reason of ['stop', 'suspend', 'dispose', 'account', 'disconnect']) {
    const native = bridge(); let state; let successorState;
    const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); native.flags.measurementModeWait = deferred();
    const pending = session.setMeasurementMode('precise'); await flush();
    let successor;
    if (reason === 'account') successor = native.factory('b', next => { successorState = next; }, () => {});
    if (reason === 'disconnect') native.emit({ status: 'disconnected' });
    const stopped = reason === 'suspend' ? session.suspend() : ['account', 'dispose'].includes(reason) ? session.dispose() : session.stop();
    if (!['account', 'dispose'].includes(reason)) {
      assert.equal(state.measurementModeResult, null); assert.equal(state.measurementModeError.outcome, 'cancelled');
    }
    native.flags.measurementModeWait.resolve({ level: 'precise', outcome: 'accepted', commandsAccepted: true });
    await pending; await stopped; native.flags.measurementModeWait = null;
    if (successor) {
      await successor.start(); assert.equal(successorState.measurementModeResult, null);
      await successor.setMeasurementMode('quick'); assert.equal(successorState.measurementModeResult.level, 'quick'); await successor.dispose();
    } else if (['stop', 'disconnect'].includes(reason)) {
      await session.start(); assert.equal(state.measurementModeResult, null);
      await session.setMeasurementMode('quick'); assert.equal(state.measurementModeResult.level, 'quick'); await session.dispose();
    }
  }
});

test('Vinca measurement mode controls show only sent levels, no default, and disable unsafe actions', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening', capabilities: { modeConfiguration: true, clockRead: true, clockSync: true } });
  assert.equal(h.button('Rápido').props.disabled, true);
  assert.match(JSON.stringify(h.render()), /Sin preferencia guardada/);
  h.ble.sessionState.listenerResult = { connectionReady: true, indicationsActive: true };
  for (const label of ['Rápido', 'Normal', 'Preciso']) {
    assert.equal(h.button(label).props['aria-pressed'], false); assert.match(h.button(label).props.className, /min-h-11/);
    assert.equal(h.button(label).props.disabled, false);
  }
  h.ble.sessionRef.current.setMeasurementMode = async level => h.calls.push(level);
  for (const [level, label] of [['quick', 'Rápido'], ['normal', 'Normal'], ['precise', 'Preciso']]) {
    await h.button(label).props.onClick();
    h.ble.sessionState.measurementModeResult = { level, commandsAccepted: true, verified: false };
    h.ble.sessionState.preferences = { ...h.ble.sessionState.preferences, measurementMode: level };
    assert.match(JSON.stringify(h.render()), /Aplicado en esta conexión/);
    assert.equal(h.button(label).props['aria-pressed'], true);
  }
  assert.deepEqual(h.calls, ['quick', 'normal', 'precise']);
  h.ble.sessionState.measurementModeResult = null; h.ble.sessionState.measurementModeBusy = true;
  assert.match(JSON.stringify(h.render()), /Aplicando ajuste…/);
  h.ble.sessionRef.current.readDeviceInfo = async () => h.calls.push('info');
  await h.toggleInfo(true); assert.deepEqual(h.calls, ['quick', 'normal', 'precise']);
  h.ble.sessionState.measurementModeBusy = false; h.ble.sessionState.measurementModeReconnectRequired = true;
  h.ble.sessionState.measurementModeError = { message: 'Resultado desconocido; reconecta' };
  assert.match(JSON.stringify(h.render()), /Resultado desconocido/); assert.doesNotMatch(JSON.stringify(h.render()), /Ajuste enviado:/);
  assert.equal(h.button('Rápido').props.disabled, true); assert.equal(treeNodes(h.render()).find(n => n.type === 'diagnostics').props.recoveryRequired, true); assert.equal(treeNodes(h.render()).find(n => n.type === 'diagnostics').props.restartDisabled, false);
  h.ble.sessionState.measurementModeReconnectRequired = false;
  for (const flag of ['clockBusy', 'deviceInfoBusy']) { h.ble.sessionState[flag] = true; assert.equal(h.button('Rápido').props.disabled, true); h.ble.sessionState[flag] = false; }
  h.ble.sessionState.status = 'stopped'; assert.equal(h.button('Preciso').props.disabled, true);
  h.cleanup();
});


test('measurement mode lab simulates two stages, errors, timeout and exclusions without native access', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const timers = new Set();
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => ({ key: 'devices' }), useNavigate: () => () => {},
    createBleLabScenario, bleLabScenarios, Button: 'button', FemometerReviewCard: 'card', BleReadingReviewView: 'editor', BleSavedNotice: 'notice', FemometerFeedback: 'clock',
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, ['BluetoothVisualLab'], source => source.replace('export default function BluetoothVisualLab', 'function BluetoothVisualLab'));
  const render = () => harness.render(() => ({ props: { value: BluetoothVisualLab({ Provider: 'provider', children: null }) } }));
  const lab = () => render().props.value;
  treeNodes(render()).find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick();
  const select = (label, value) => treeNodes(render()).find(n => n.type === 'select' && n.props['aria-label'] === label).props.onChange({ target: { value } });
  const advance = () => { for (const fn of [...timers]) { timers.delete(fn); fn(); } };
  await lab().sessionRef.current.setMeasurementMode('quick'); assert.equal(timers.size, 0);
  select('Modo de previsualización', 'android');
  await lab().sessionRef.current.setMeasurementMode('quick'); assert.equal(lab().sessionState.measurementModeError.code, 'MEASUREMENT_MODE_NOT_CONNECTED');
  select('Escenario visual', 'multiple');
  await lab().sessionRef.current.setMeasurementMode('invalid'); assert.equal(lab().sessionState.measurementModeError.code, 'MEASUREMENT_MODE_INVALID_LEVEL');
  for (const level of ['quick', 'normal', 'precise']) {
    const pending = lab().sessionRef.current.setMeasurementMode(level);
    await lab().sessionRef.current.setMeasurementMode('quick');
    await lab().sessionRef.current.setVolume('low');
    await lab().sessionRef.current.readClock(); await lab().sessionRef.current.syncClock(); await lab().sessionRef.current.readDeviceInfo();
    assert.equal(timers.size, 1); assert.equal(lab().sessionState.measurementModeBusy, true);
    advance(); assert.equal(lab().sessionState.measurementModeBusy, true); assert.equal(lab().sessionState.measurementModeResult, null);
    advance(); await pending;
    assert.deepEqual(lab().sessionState.measurementModeResult, { level, outcome: 'accepted', commandsAccepted: true, verified: false });
    assert.equal(lab().pendingCount, 3); assert.equal(lab().sessionState.status, 'listening');
  }
  for (const [scenario, code, outcome] of [['firstError', 'MEASUREMENT_MODE_FIRST_WRITE_FAILED', 'error'], ['confirmError', 'MEASUREMENT_MODE_CONFIRM_WRITE_FAILED', 'error'], ['timeout', 'MEASUREMENT_MODE_TIMEOUT', 'unknown']]) {
    select('Escenario de modo de medición', scenario);
    const pending = lab().sessionRef.current.setMeasurementMode('precise');
    advance(); if (scenario !== 'firstError') { assert.equal(lab().sessionState.measurementModeBusy, true); advance(); }
    await pending;
    assert.equal(lab().sessionState.measurementModeError.code, code); assert.equal(lab().sessionState.measurementModeError.outcome, outcome);
    assert.equal(lab().sessionState.measurementModeResult, null); assert.equal(lab().pendingCount, 3);
    await lab().sessionRef.current.setMeasurementMode('quick');
    await lab().sessionRef.current.readDeviceInfo(); await lab().sessionRef.current.syncClock(); assert.equal(timers.size, 0);
    select('Escenario de modo de medición', 'accepted');
    await lab().sessionRef.current.stop(); lab().sessionRef.current.start();
    for (let step = 0; step < 10 && timers.size; step++) { advance(); await flush(); lab(); }
    assert.equal(lab().sessionState.measurementModeResult.level, 'precise');
    select('Escenario visual', 'multiple'); // Begin the next explicit failure with no connection result.
    assert.equal(lab().sessionState.measurementModeResult, null);
  }
  select('Escenario de modo de medición', 'accepted');
  const clock = lab().sessionRef.current.syncClock();
  // Also blocked through a stale React closure before another render.
  await lab().sessionRef.current.setMeasurementMode('precise'); assert.equal(timers.size, 1);
  advance(); await clock; assert.equal(lab().sessionState.measurementModeResult, null);
  const info = lab().sessionRef.current.readDeviceInfo();
  await lab().sessionRef.current.setMeasurementMode('precise'); assert.equal(timers.size, 1);
  advance(); await info; assert.equal(lab().sessionState.measurementModeResult, null);
  const volume = lab().sessionRef.current.setVolume('low');
  await lab().sessionRef.current.setMeasurementMode('quick'); assert.equal(timers.size, 1);
  advance(); advance(); await volume;
  assert.equal(lab().sessionState.volumeResult.level, 'low');
  assert.equal(lab().sessionState.measurementModeResult, null);
  const pending = lab().sessionRef.current.setMeasurementMode('precise'); advance();
  const late = [...timers];
  await lab().sessionRef.current.stop(); await pending;
  assert.equal(lab().sessionState.measurementModeError.outcome, 'cancelled');
  late.forEach(fn => fn()); assert.equal(lab().sessionState.measurementModeResult, null);
  assert.equal(lab().pendingCount, 3);
  select('Escenario visual', 'listening');
  const unmounted = lab().sessionRef.current.setMeasurementMode('quick'); const afterUnmount = [...timers];
  harness.cleanup(); await unmounted; afterUnmount.forEach(fn => fn()); assert.equal(timers.size, 0);
});


test('measurement mode cannot write while listener initialization is pending or readiness is incomplete', async () => {
  const native = bridge(); native.flags.listenerWait = deferred();
  const session = native.factory('a', () => {}, () => {});
  const starting = session.start(); await flush();
  await session.setMeasurementMode('precise'); assert.deepEqual(native.calls.measurementMode, []);
  native.flags.listenerWait.resolve(); await starting;
  await session.setMeasurementMode('quick'); assert.deepEqual(native.calls.measurementMode, ['quick']);
  await session.dispose();
  for (const flag of ['listenerReady', 'indicationsActive']) {
    const incomplete = bridge(); incomplete.flags[flag] = false;
    let state; const owner = incomplete.factory('a', next => { state = next; }, () => {});
    await owner.start(); assert.equal(state.status, 'error'); assert.equal(state.error.code, 'LISTENER_NOT_READY'); await owner.setMeasurementMode('quick');
    assert.deepEqual(incomplete.calls.measurementMode, []); assert.equal(state.measurementModeError.code, 'MEASUREMENT_MODE_NOT_CONNECTED');
    await owner.dispose();
  }
});


test('measurement mode and volume exclude each other and quarantine their shared characteristic', async () => {
  const native = bridge(); let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.start();
  native.flags.volumeWait = deferred();
  const volume = session.setVolume('low'); await flush();
  await session.setMeasurementMode('quick'); assert.deepEqual(native.calls.measurementMode, []);
  native.flags.volumeWait.resolve({ level: 'low', outcome: 'accepted', commandsAccepted: true }); await volume;
  native.flags.volumeWait = null;
  native.flags.measurementModeWait = deferred();
  const mode = session.setMeasurementMode('precise'); await flush();
  await session.setVolume('high'); assert.deepEqual(native.calls.volume, ['low']);
  native.flags.measurementModeWait.resolve({ level: 'precise', outcome: 'accepted', commandsAccepted: true }); await mode;
  native.flags.measurementModeWait = null;
  assert.equal(state.volumeResult.level, 'low'); assert.equal(state.measurementModeResult.level, 'precise');
  native.flags.volumeError = { code: 'VOLUME_TIMEOUT', message: 'Timeout' };
  await session.setVolume('high'); await session.setMeasurementMode('normal');
  assert.deepEqual(native.calls.measurementMode, ['precise']); assert.equal(state.measurementModeResult, null);
  await session.restart(); native.flags.volumeError = null;
  native.flags.measurementModeError = { code: 'MEASUREMENT_MODE_CONFIRM_WRITE_FAILED', message: 'Confirmation failed' };
  await session.setMeasurementMode('quick');
  await session.setVolume('high'); await session.readClock(); await session.readDeviceInfo();
  assert.deepEqual(native.calls.volume, ['low', 'high']); assert.equal(native.calls.info, 0);
  assert.equal(native.calls.clock, 2); assert.equal(state.status, 'listening');
  await session.dispose();
});

// Final integration: independent groups for local preferences, binding, lifecycle,
// clock policy and individual discard. All transports and storage are in memory.
const integratedSession = (options = {}) => {
  const native = bridge();
  const local = createFemometerLocalState(native.storage, 'a');
  if (options.preferences) for (const [field, value] of Object.entries(options.preferences)) local.savePreference('bound-a', field, value);
  const order = [];
  for (const [method, label] of [['readFemometerClock', 'read'], ['syncFemometerClock', 'sync'], ['setFemometerVolume', 'volume'], ['setFemometerMeasurementMode', 'mode'], ['disconnectFemometer', 'disconnect']]) {
    const original = native.api[method];
    native.api[method] = (...args) => { order.push([label, ...args]); return original(...args); };
  }
  let state;
  const temperatures = [];
  const session = native.factory('a', next => { state = next; }, event => temperatures.push(event), local);
  return { ...native, local, session, order, temperatures, state: () => state };
};

test('preferences: account/device isolation, legacy absence, invalid values and non-destructive persistence', () => {
  const storage = memoryStorage(); const local = createFemometerLocalState(storage, 'a');
  local.activate('old');
  local.saveReadings([{ uiId: 1, deviceKey: 'old', importStatus: 'pending', temperatureC: 36.4, draft: { time: '07:00' }, receivedOrder: 1 }]);
  local.saveClock('old', { operation: 'read', driftSeconds: 600, checkedAt: 1 });
  const pending = local.recover(); const clock = local.clock('old');
  assert.deepEqual(local.preferences('old'), {});
  assert.deepEqual(local.initializePreferences('new'), { volume: 'medium', measurementMode: 'normal' });
  local.savePreference('old', 'volume', 'low'); local.savePreference('old', 'measurementMode', 'precise');
  for (const [field, value] of [['volume', 'loud'], ['measurementMode', 'fast'], ['mac', 'address']]) assert.throws(() => local.savePreference('old', field, value));
  assert.deepEqual(local.recover(), pending); assert.deepEqual(local.clock('old'), clock);
  assert.deepEqual(createFemometerLocalState(storage, 'b').preferences('old'), {});
  const reopened = createFemometerLocalState(storage, 'a');
  assert.deepEqual(reopened.preferences('old'), { volume: 'low', measurementMode: 'precise' });
  assert.deepEqual(reopened.preferences('new'), { volume: 'medium', measurementMode: 'normal' });
  storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => reopened.savePreference('old', 'volume', 'high'));
  assert.equal(reopened.preferences('old').volume, 'low');
});

test('preferences: accepted manual changes persist; rejected writes and failed storage retain the last durable choice', async () => {
  const h = integratedSession({ preferences: { volume: 'low', measurementMode: 'precise' } });
  await h.session.start();
  await h.session.setVolume('medium'); assert.equal(h.local.preferences('bound-a').volume, 'medium');
  h.storage.setItem = () => { throw Error('quota'); };
  await h.session.setVolume('high');
  assert.equal(h.state().volumeResult.level, 'high'); // GATT accepted, storage did not.
  assert.equal(h.state().preferences.volume, 'medium'); assert.match(h.state().preferenceError, /no se pudo guardar/);
  h.flags.measurementModeError = { code: 'MEASUREMENT_MODE_FIRST_WRITE_FAILED' };
  await h.session.setMeasurementMode('quick');
  assert.equal(h.state().preferences.measurementMode, 'precise'); assert.equal(h.state().measurementModeResult, null);
  await h.session.stop(); assert.equal(h.state().preferences.volume, 'medium'); assert.equal(h.state().volumeResult, null);
  await h.session.dispose();
});

test('binding: confirmed link survives a subsequent listener failure and retry does not bind again', async () => {
  const h = await coordinatedBindingFixture();
  h.api.startFemometerTemperatureListener = async () => { throw { code: 'CONNECTION_TIMEOUT' }; };
  assert.equal(await h.session.selectAndRemember('new'), true);
  assert.equal(h.state().remembered, true); assert.equal(h.state().deviceKey, 'new'); assert.equal(h.state().status, 'error');
  assert.deepEqual(h.local.preferences('new'), { volume: 'medium', measurementMode: 'normal' });
  h.api.scanForFemometer = async () => [{ id: 'new', isRemembered: true }];
  h.api.startFemometerTemperatureListener = async () => ({ deviceKey: 'new', connectionReady: true, indicationsActive: true, capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } });
  await h.session.start(); assert.equal(h.state().status, 'listening');
  assert.equal(h.calls.filter(row => row[0] === 'remember').length, 1);
  await h.session.dispose();
});

test('binding: unlink drains configuration and closes before forget, preserving pending review', async () => {
  const h = integratedSession({ preferences: { volume: 'low', measurementMode: 'precise' } });
  h.flags.volumeWait = deferred();
  h.api.forgetFemometer = async () => { h.order.push(['forget']); return { remembered: false }; };
  const starting = h.session.start(); await flush();
  const unlink = h.session.unlink(); await flush();
  assert.equal(h.state().bindingBusy, true); assert.equal(h.order.some(row => row[0] === 'forget'), false);
  await h.session.setMeasurementMode('quick');
  h.flags.volumeWait.resolve({ level: 'low', commandsAccepted: true, outcome: 'accepted' });
  await starting; assert.equal(await unlink, true);
  assert.deepEqual(h.order.map(row => row[0]), ['read', 'volume', 'disconnect', 'forget']);
  assert.equal(h.state().remembered, false); assert.deepEqual(h.local.preferences('bound-a'), { volume: 'low', measurementMode: 'precise' });
  await h.session.dispose();
});

test('binding: failed close or native forget keeps binding; change suppresses foreground reconnect until cancelled', async () => {
  for (const failure of ['close', 'forget']) {
    const h = integratedSession(); await h.session.start();
    let forgets = 0;
    h.api.forgetFemometer = async () => { forgets++; throw Error('forget failed'); };
    const close = h.api.disconnectFemometer;
    if (failure === 'close') h.api.disconnectFemometer = async () => { throw { code: 'GATT_CLOSE_FAILED' }; };
    assert.equal(await h.session.unlink(), false); assert.equal(h.state().remembered, true);
    assert.equal(h.state().deviceKey, 'bound-a'); assert.equal(forgets, failure === 'close' ? 0 : 1);
    h.api.disconnectFemometer = close;
    assert.equal(await h.session.beginChange(), true);
    const connections = h.calls.connections;
    await h.session.resume(); await h.session.start(); assert.equal(h.calls.connections, connections);
    await h.session.cancelChange(); assert.equal(h.calls.connections, connections + 1);
    await h.session.dispose();
  }
});

test('lifecycle: automatic settings serialize, exclude manual work and still deliver temperatures', async () => {
  const h = integratedSession({ preferences: { volume: 'medium', measurementMode: 'normal' } });
  h.flags.clockWait = deferred(); h.flags.volumeWait = deferred();
  const starting = h.session.start(); await flush();
  assert.equal(h.state().configurationBusy, true); assert.equal(h.state().status, 'listening');
  h.emit({ temperatureC: 36.5 });
  await h.session.setVolume('high'); await h.session.setMeasurementMode('quick'); await h.session.readDeviceInfo(); await h.session.syncClock();
  assert.deepEqual(h.order, [['read']]); assert.equal(h.temperatures.length, 1);
  h.flags.clockWait.resolve({ deviceLocalTime: localText(h.flags.now) }); await flush();
  assert.deepEqual(h.order, [['read'], ['volume', 'medium']]);
  h.flags.volumeWait.resolve({ level: 'medium', outcome: 'accepted', commandsAccepted: true }); await starting;
  assert.deepEqual(h.order, [['read'], ['volume', 'medium'], ['mode', 'normal']]);
  assert.equal(h.state().configurationBusy, false); assert.equal(h.state().listenerResult.timeoutSeconds, 360);
  assert.equal(h.calls.connections, 1); assert.equal(h.calls.disconnects, 0);
  await h.session.dispose();
});

test('lifecycle: uncertain configuration stops the sequence without stopping temperatures; late result cannot cross accounts', async () => {
  const h = integratedSession({ preferences: { volume: 'high', measurementMode: 'quick' } });
  h.flags.volumeError = { code: 'VOLUME_TIMEOUT' }; await h.session.start();
  assert.deepEqual(h.calls.measurementMode, []); assert.equal(h.state().volumeReconnectRequired, true);
  assert.equal(h.state().configurationIssue, true); assert.equal(h.state().status, 'listening');
  h.emit({ temperatureC: 36.6 }); assert.equal(h.temperatures.length, 1);
  await h.session.readDeviceInfo(); await h.session.setVolume('low'); assert.equal(h.calls.volume.length, 1);
  await h.session.stop(); h.flags.volumeError = null; h.flags.volumeWait = deferred();
  const starting = h.session.start(); await flush();
  let nextState; const next = h.factory('b', value => { nextState = value; }, () => {}, createFemometerLocalState(h.storage, 'b'));
  const nextStart = next.start();
  h.flags.volumeWait.resolve({ level: 'high', outcome: 'accepted', commandsAccepted: true });
  await starting; await nextStart;
  assert.deepEqual(nextState.preferences, {}); assert.equal(nextState.volumeResult, null); assert.equal(nextState.deviceKey, 'bound-b');
  assert.equal(h.calls.peakListeners, 1); await next.dispose();
});

test('clock: 120-second threshold, one automatic correction with read-back verification', async () => {
  for (const seconds of [0, 120, 121, 86400, 86401, -86401]) {
    const h = integratedSession(); h.flags.now = new Date(2026, 10, 10, 12, 0, 0).getTime();
    h.api.readFemometerClock = async () => ({ deviceKey: 'bound-a', deviceLocalTime: localText(h.flags.now + seconds * 1000) });
    h.api.syncFemometerClock = async () => { h.calls.sync++; return { deviceKey: 'bound-a', deviceLocalTime: localText(h.flags.now), verified: true }; };
    await h.session.start();
    assert.equal(h.calls.sync, Math.abs(seconds) > 120 ? 1 : 0);
    assert.equal(h.state().clockResult.verified, Math.abs(seconds) > 120);
    assert.equal(h.state().clockResult.significantDrift, false);
    await h.session.resume(); assert.ok(h.calls.sync <= 1); await h.session.dispose();
  }
});

test('clock: failed/unverified correction is not a verified sync, does not loop or mutate pending history', async () => {
  for (const result of ['unverified', 'failed', 'timeout']) {
    const h = integratedSession({ preferences: { volume: 'low' } });
    h.api.readFemometerClock = async () => ({ deviceLocalTime: '2020-01-01T08:00:00' });
    h.flags.now = new Date(2026, 10, 10, 12).getTime();
    h.api.syncFemometerClock = async () => {
      h.calls.sync++;
      if (result !== 'unverified') throw { code: result === 'timeout' ? 'CLOCK_TIMEOUT' : 'CLOCK_WRITE_FAILED' };
      return { deviceLocalTime: '2020-01-01T08:00:00', verified: true };
    };
    await h.session.start(); await h.session.resume();
    assert.equal(h.calls.sync, 1); assert.equal(h.state().status, 'listening'); assert.ok(h.state().clockError);
    assert.notEqual(h.state().clockResult?.verified, true);
    assert.equal(h.calls.volume.length, result === 'timeout' ? 0 : 1);
    await h.session.dispose();
  }
});

test('discard: ordinary pending review requests confirmation, cancel retains it, confirm never incorporates', async () => {
  const h = await uncertainEditorFixture({ importStatus: 'pending', attempt: undefined });
  try {
    await h.render().onDiscard(); assert.equal(h.counts().removed, 0);
    h.render().onRequestDiscard(); assert.equal(h.render().discardConfirm, true);
    h.render().onCancelDiscard(); assert.equal(h.counts().removed, 0);
    h.render().onRequestDiscard(); await h.render().onDiscard();
    assert.deepEqual(h.counts(), { writes: 0, removed: 1, closed: 1 }); assert.equal(h.requests.length, 0);
  } finally { h.cleanup(); }
});

test('discard: unlink leaves pending readings reviewable with original binding and individual durable removal', async () => {
  const native = bridge(); native.api.forgetFemometer = async () => { native.flags.remembered = false; return { remembered: false }; };
  const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 }); native.emit({ temperatureC: 36.6 });
    const session = owner.render().sessionRef.current;
    assert.equal(await session.unlink(), true);
    assert.equal(owner.render().pendingCount, 2); assert.equal(owner.render().readings[0].deviceKey, 'bound-a');
    owner.render().discardReading(1, session);
    assert.equal(owner.render().pendingCount, 1);
    assert.deepEqual(createFemometerLocalState(native.storage, 'a').recover().map(row => row.uiId), [2]);
  } finally { owner.cleanup(); await flush(); }
});

test('UI: stored preferences remain selected when disconnected, and normal review puts discard before the primary incorporation action', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'stopped', preferences: { volume: 'medium', measurementMode: 'normal' } });
  for (const label of ['Medio', 'Normal']) {
    assert.equal(h.button(label).props['aria-pressed'], true);
    assert.equal(h.button(label).props.disabled, true);
    assert.match(h.button(label).props.className, /font-semibold text-fertiliapp-fuerte/);
    assert.match(JSON.stringify(h.button(label)), /seleccionado/);
  }
  assert.match(JSON.stringify(h.render()), /Pendiente de aplicar al conectar/);
  assert.doesNotMatch(JSON.stringify(h.render()), /Aplicado en esta conexión/);
  h.cleanup();
  const harness = hooks();
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', {
    ...harness.bindings, measurementDisplay, measurementSourceLabel, CheckCircle2: 'check', Trash2: 'trash', PlusCircle: 'plus', Button: 'button', Input: 'input',
  }, ['BleReadingReviewView']);
  const nodes = treeNodes(BleReadingReviewView({ reading: { importStatus: 'pending' }, draft: { isoDate: '2026-11-10', time: '08:00' } }));
  const discard = nodes.findIndex(n => n.type === 'button' && JSON.stringify(n.props.children).includes('Descartar temperatura'));
  const incorporate = nodes.findIndex(n => n.type === 'button' && JSON.stringify(n.props.children).includes('Confirmar e incorporar'));
  assert.ok(discard >= 0 && incorporate > discard);
  assert.equal(nodes[discard].props.variant, 'ghost'); assert.match(nodes[discard].props.className, /min-h-11/);
  assert.match(nodes[incorporate].props.className, /min-h-11.*w-full.*bg-fertiliapp-fuerte/);
  assert.ok(nodes.some(n => n.type === 'footer' && n.props.className.includes('safe-area-inset-bottom')));
  harness.cleanup();
});

test('lab integration: new binding prepares preferences, restoration is serial, cancellation and unlink keep fictitious pending work', async () => {
  const { createBleLabScenario, bleLabScenarios } = await import('../src/lib/bleVisualLab.js');
  const harness = hooks(); const timers = new Set();
  const { BluetoothVisualLab } = await loadFrontend('src/components/dev/BluetoothVisualLab.jsx', {
    ...harness.bindings, useCycleData: () => cycle, authorizedBleMeasurement, useLocation: () => ({ key: 'devices' }), useNavigate: () => () => {},
    createBleLabScenario, bleLabScenarios, Button: 'button', FemometerReviewCard: 'card', BleReadingReviewView: 'editor', BleSavedNotice: 'notice', FemometerFeedback: 'clock',
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, ['BluetoothVisualLab'], source => source.replace('export default function BluetoothVisualLab', 'function BluetoothVisualLab'));
  const render = () => harness.render(() => ({ props: { value: BluetoothVisualLab({ Provider: 'provider', children: null }) } }));
  const lab = () => render().props.value;
  const advance = async () => { for (const fn of [...timers]) { timers.delete(fn); fn(); } await flush(); render(); };
  const drain = async () => { for (let i = 0; i < 12 && timers.size; i++) await advance(); assert.equal(timers.size, 0); };
  treeNodes(render()).find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick();
  const select = (label, value) => treeNodes(render()).find(n => n.type === 'select' && n.props['aria-label'] === label).props.onChange({ target: { value } });
  select('Modo de previsualización', 'android'); select('Escenario visual', 'unlinked');
  lab().sessionRef.current.scan(); await drain();
  const binding = lab().sessionRef.current.selectAndRemember('lab-vinca'); await advance(); assert.equal(await binding, true);
  await advance(); assert.equal(lab().sessionState.configurationBusy, true);
  await lab().sessionRef.current.setVolume('high'); // Excluded while preparing defaults.
  await drain();
  assert.deepEqual(lab().sessionState.preferences, { volume: 'medium', measurementMode: 'normal' });
  assert.equal(lab().sessionState.volumeResult.level, 'medium'); assert.equal(lab().sessionState.measurementModeResult.level, 'normal');
  await lab().sessionRef.current.stop(); assert.equal(lab().sessionState.preferences.volume, 'medium');
  lab().sessionRef.current.start(); await drain(); assert.equal(lab().sessionState.measurementModeResult.level, 'normal');
  select('Escenario visual', 'multiple');
  const pending = lab().sessionRef.current.setVolume('low'); await advance();
  await lab().sessionRef.current.unlink(); await pending;
  assert.equal(lab().sessionState.remembered, false); assert.equal(lab().pendingCount, 3); assert.equal(lab().sessionState.volumeResult, null);
  let editor = () => treeNodes(render()).find(n => n.type === 'editor').props;
  editor().onRequestDiscard(); editor().onCancelDiscard(); assert.equal(lab().pendingCount, 3);
  editor().onRequestDiscard(); editor().onDiscard(); assert.equal(lab().pendingCount, 2);
  assert.equal(lab().readings[0].deviceKey, 'fictional-device');
  await assert.rejects(lab().incorporateReading(), /guardados reales/);
  select('Escenario visual', 'legacyPreferences'); await lab().sessionRef.current.stop(); lab().sessionRef.current.start(); await drain();
  assert.deepEqual(lab().sessionState.preferences, {}); assert.equal(lab().sessionState.volumeResult, null);
  select('Escenario visual', 'clockReset'); await lab().sessionRef.current.stop(); lab().sessionRef.current.start(); await drain();
  assert.equal(lab().sessionState.clockResult.verified, true);
  harness.cleanup(); assert.equal(timers.size, 0);
});

test('preferences: an existing binding without preferences never receives defaults, including reselecting the same thermometer', async () => {
  const h = integratedSession(); await h.session.start();
  assert.deepEqual(h.state().preferences, {}); assert.deepEqual(h.calls.volume, []); assert.deepEqual(h.calls.measurementMode, []);
  await h.session.dispose();
  const existing = await coordinatedBindingFixture();
  assert.equal(await existing.session.selectAndRemember('old'), true);
  assert.deepEqual(existing.state().preferences, {}); assert.deepEqual(existing.local.preferences('old'), {});
  await existing.session.dispose();
});

test('lifecycle: a listener reporting another binding is closed before any automatic settings', async () => {
  const h = integratedSession({ preferences: { volume: 'medium', measurementMode: 'normal' } });
  h.api.startFemometerTemperatureListener = async () => ({ deviceKey: 'different', connectionReady: true, indicationsActive: true });
  await h.session.start(); assert.equal(h.state().error.code, 'CONNECTION_IDENTITY_MISMATCH');
  assert.equal(h.state().status, 'error'); assert.equal(h.calls.clock, 0); assert.deepEqual(h.calls.volume, []);
  assert.equal(h.calls.disconnects, 1); assert.equal(h.calls.listeners, 0); await h.session.dispose();
});


test('presentation: local clock formatting validates calendar fields without timezone conversion', async () => {
  const { formatClockLocalTime } = await loadFrontend('src/components/FemometerFeedback.jsx', {}, ['formatClockLocalTime']);
  assert.equal(formatClockLocalTime('2026-11-11T11:09:02'), '11/11/2026 · 11:09:02');
  assert.equal(formatClockLocalTime('2024-02-29T00:00:00'), '29/02/2024 · 00:00:00');
  assert.equal(formatClockLocalTime('2026-03-29T02:30:00'), '29/03/2026 · 02:30:00');
  for (const value of [null, undefined, '', 'bad', '2026-02-29T10:00:00', '2026-04-31T10:00:00',
    '2026-00-10T10:00:00', '2026-13-10T10:00:00', '2026-01-00T10:00:00', '0000-01-01T00:00:00',
    '2026-11-11T24:00:00', '2026-11-11T11:60:00', '2026-11-11T11:00:60',
    '2026-11-11T11:09:02Z', '2026-11-11T11:09:02+01:00']) assert.equal(formatClockLocalTime(value), 'No disponible');
});

test('presentation: segmented preferences retain accessible selection and three equal touch targets', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'stopped', preferences: { volume: 'medium', measurementMode: 'precise' } });
  for (const label of ['Nivel de volumen', 'Modo de medición']) {
    const group = treeNodes(h.render()).find(n => n.props.role === 'group' && n.props['aria-label'] === label);
    assert.match(group.props.className, /grid-cols-3/);
    assert.match(group.props.className, /divide-x/);
    const buttons = treeNodes(group).filter(n => n.type === 'button');
    assert.equal(buttons.length, 3);
    assert.equal(buttons.filter(n => n.props['aria-pressed']).length, 1);
    for (const button of buttons) {
      assert.equal(button.props.disabled, true);
      assert.match(button.props.className, /min-h-11/);
      assert.doesNotMatch(button.props.className, /rounded-full|bg-rose-50/);
    }
    assert.match(JSON.stringify(group), /seleccionado/);
  }
  h.ble.sessionState.preferences = {};
  assert.equal(treeNodes(h.render()).filter(n => n.props['aria-pressed'] === true).length, 0);
  h.cleanup();
});

test('presentation: binding notice only follows confirmation, closes and expires without hiding the device', async () => {
  const h = await devicesFixture({ devices: [{ id: 'new', name: 'Vinca test' }] });
  let reviews = 0;
  h.ble.openReadingReview = () => reviews++;
  h.button('Temperaturas pendientes').props.onClick(); assert.equal(reviews, 1);
  const notice = () => treeNodes(h.render()).find(n => n.props['aria-label'] === 'Vinculación confirmada');
  assert.equal(notice(), undefined);
  h.ble.sessionRef.current.selectAndRemember = async () => false;
  await h.button('Vinca test').props.onClick(); assert.equal(notice(), undefined);
  h.ble.sessionRef.current.selectAndRemember = async () => {
    h.ble.sessionState = { ...h.ble.sessionState, remembered: true, status: 'error' };
    return true;
  };
  await h.button('Vinca test').props.onClick();
  assert.match(JSON.stringify(notice()), /Termómetro vinculado/);
  h.ble.sessionState = { ...h.ble.sessionState, status: 'listening', configurationBusy: true, listenerResult: { connectionReady: true, indicationsActive: true } };
  assert.doesNotMatch(JSON.stringify(notice()), /está listo/);
  h.ble.sessionState.configurationBusy = false;
  assert.match(JSON.stringify(notice()), /Termómetro vinculado/);
  h.render(); h.render(); assert.equal(h.timers.size, 1);
  for (const [fn, ms] of h.timers) { assert.equal(ms, 8000); fn(); }
  assert.equal(notice(), undefined);
  assert.equal(h.timers.size, 0);
  assert.ok(treeNodes(h.render()).some(n => n.type === 'link' && n.props.to.startsWith('/settings/devices/')));
  h.ble.sessionState.status = 'stopped'; h.render(); h.ble.sessionState.status = 'listening';
  assert.equal(notice(), undefined);
  h.ble.sessionState = { ...h.ble.sessionState, remembered: false, status: 'idle' };
  await h.button('Vinca test').props.onClick();
  treeNodes(h.render()).find(n => n.props['aria-label'] === 'Cerrar aviso de vinculación').props.onClick();
  assert.equal(notice(), undefined);
  h.ble.pendingCount = 0; assert.equal(h.button('Temperaturas pendientes'), undefined);
  h.cleanup(); assert.equal(h.timers.size, 0);
});

test('presentation: review footer has discard on the left and incorporation on the right; closing belongs to the container', async () => {
  const harness = hooks(); const calls = [];
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', {
    ...harness.bindings, Button: 'button', Input: 'input', CheckCircle2: 'check', Trash2: 'trash', PlusCircle: 'plus', measurementDisplay, measurementSourceLabel,
  }, ['BleReadingReviewView']);
  const props = { reading: { importStatus: 'pending' }, draft: { isoDate: '2026-11-11', time: '09:00' },
    onClose: () => calls.push('close'), onRequestDiscard: () => calls.push('requestDiscard'), confirm: () => calls.push('incorporate') };
  const nodes = treeNodes(BleReadingReviewView(props));
  const footer = nodes.find(n => n.type === 'footer');
  const rows = footer.props.children;
  assert.equal(rows.length, 2);
  const labels = row => treeNodes(row).filter(n => n.type === 'button').map(n => JSON.stringify(n.props.children));
  assert.match(footer.props.className, /grid grid-cols-2/);
  assert.equal(labels(rows[0]).length, 1); assert.match(labels(rows[0])[0], /Descartar temperatura/);
  assert.equal(labels(rows[1]).length, 1); assert.match(labels(rows[1])[0], /Confirmar e incorporar/);
  const buttons = treeNodes(footer).filter(n => n.type === 'button');
  assert.equal(buttons.length, 2);
  buttons[0].props.onClick(); buttons[1].props.onClick(); assert.deepEqual(calls, ['requestDiscard', 'incorporate']);
  for (const button of treeNodes(BleReadingReviewView({ ...props, busy: true })).filter(n => n.type === 'button')) assert.equal(button.props.disabled, true);
  const duplicate = treeNodes(BleReadingReviewView({ ...props, error: { code: 'ble-possible-duplicate' } }));
  assert.equal(duplicate.filter(n => n.type === 'button' && n.props.children.includes('Cancelar')).length, 0);
  assert.equal(duplicate.find(n => n.type === 'button' && JSON.stringify(n.props.children).includes('Confirmar e incorporar')).props.disabled, true);
  harness.cleanup();
});


test('presentation: readiness requires active indications and connection, and product images keep their proportions', async () => {
  const { vinca2StatusText } = await loadFrontend('src/components/Vinca2Panel.jsx', {}, ['vinca2StatusText']);
  assert.equal(vinca2StatusText('listening', { listenerResult: { connectionReady: true } }), 'Conectando…');
  assert.equal(vinca2StatusText('listening', { listenerResult: { connectionReady: true, indicationsActive: true } }), 'Conectado');
  assert.equal(vinca2StatusText('listening', { listenerResult: { indicationsActive: true } }), 'Conectando…');
  for (const boundProtocol of ['easyhome-ebt300', 'health-thermometer']) {
    assert.equal(vinca2StatusText('missing', { boundProtocol }), 'Termómetro no encontrado');
    assert.equal(vinca2StatusText('error', { boundProtocol }), 'No se pudo conectar');
    assert.equal(vinca2StatusText('searching', { boundProtocol }), 'Buscando termómetro…');
  }
  assert.equal(vinca2StatusText('stopped'), 'Desconectado');
  assert.equal(vinca2StatusText('error'), 'Desconectado');
  assert.equal(vinca2StatusText('missing'), 'Desconectado');
  assert.equal(vinca2StatusText('searching'), 'Conectando…');
  assert.equal(vinca2StatusText('error', { error: { code: 'CONNECTION_LOST' } }), 'Desconectado');
  const h = await devicesFixture();
  for (const remembered of [false, true]) {
    h.ble.sessionState.remembered = remembered;
    const photos = treeNodes(h.render()).filter(n => n.type === 'img');
    assert.equal(photos.length, remembered ? 1 : 0);
    if (!remembered) continue;
    assert.equal(photos[0].props.src, '/images/vinca2.jpg');
    assert.match(photos[0].props.className, /object-contain/);
    assert.ok(photos[0].props.alt && photos[0].props.width && photos[0].props.height);
  }
  h.cleanup();
});


test('multibrand: expanded search is explicit and never changes an existing binding', async () => {
  const h = await coordinatedBindingFixture();
  const scans = [];
  h.api.scanForFemometer = async (user, expanded) => { scans.push({ user, expanded }); return [{ id: 'unknown' }]; };
  await h.session.scan(); await h.session.scan(true);
  assert.deepEqual(scans, [{ user: 'a', expanded: false }, { user: 'a', expanded: true }]);
  assert.equal(h.storedKey(), 'old'); assert.equal(h.state().deviceKey, 'old');
  assert.equal(h.calls.some(([name]) => name === 'remember'), false);
  await h.session.dispose();
});

test('multibrand: only the implemented and inspected profile can replace a binding', async () => {
  for (const inspection of [
    { compatible: false, compatibility: 'unknown' },
    { compatible: false, compatibility: 'possible_standard', healthThermometerFound: true, temperatureMeasurementFound: true },
    { compatible: false, compatibility: 'recognized_unsupported', model: 'Other model', manufacturer: 'Other brand' },
    { compatible: true, model: 'Other model', protocol: 'vinca2' },
    { compatible: true, model: 'BM-Vinca2', protocol: 'standard' },
    { compatible: true },
  ]) {
    const h = await coordinatedBindingFixture({ connectAndInspectFemometer: async () => inspection });
    assert.equal(await h.session.selectAndRemember('new'), false);
    assert.equal(h.storedKey(), 'old'); assert.equal(h.state().deviceKey, 'old');
    assert.deepEqual(h.local.preferences('new'), {});
    assert.equal(h.calls.some(([name]) => ['remember', 'listen'].includes(name)), false);
    await h.session.dispose();
  }
});

test('multibrand: a reconnected unknown profile cannot configure clock, volume or mode', async () => {
  const native = bridge();
  native.api.startFemometerTemperatureListener = async () => ({ deviceKey: 'bound-a', connectionReady: true, indicationsActive: true,
    capabilities: { model: 'Other model', protocol: 'standard', compatibility: 'compatible', clockRead: true, clockSync: true, volumeWrite: true, modeConfiguration: true } });
  let state;
  const session = native.factory('a', next => { state = next; }, () => {});
  await session.start(); await session.readClock(); await session.syncClock(); await session.setVolume('medium'); await session.setMeasurementMode('normal');
  assert.equal(state.status, 'error'); assert.equal(state.error.code, 'DEVICE_NOT_VERIFIED');
  assert.equal(native.calls.clock, 0); assert.equal(native.calls.sync, 0);
  assert.deepEqual(native.calls.volume, []); assert.deepEqual(native.calls.measurementMode, []);
  assert.equal(native.calls.listeners, 0);
  await session.dispose();
});

test('multibrand: origin stays with each pending reading across device changes and recovery', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.42, deviceTimestamp: '2026-11-18T08:00:00', receivedAt: '2026-11-18T08:01:00' });
    const first = owner.render().readings[0];
    assert.equal(first.normalized.device_model, 'BM-Vinca2');
    assert.equal(first.normalized.device_key, 'bound-a');
    // Normalization preserves an explicitly reported different origin, without granting import support.
    const other = normalizeBleMeasurement({ deviceModel: 'Other model', deviceKey: 'other', temperatureC: 36.8, deviceTimestamp: '2026-11-18T09:00:00' }, 'BM-Vinca2');
    assert.equal(other.device_model, 'Other model');
    assert.throws(() => prepareManualBleDraft(other, { confirmed: true, isoDate: '2026-11-18', time: '09:00', userId: 'a', cycleId: 'cycle' }));
    const local = createFemometerLocalState(native.storage, 'a');
    local.activate('another-binding');
    const recovered = createFemometerLocalState(native.storage, 'a').recover()[0];
    assert.deepEqual(recovered.normalized, first.normalized);
    assert.equal(recovered.normalized.received_at, '2026-11-18T08:01:00');
    assert.equal(recovered.normalized.device_date_reliability, 'unverified');
  } finally { owner.cleanup(); await flush(); }
});

test('multibrand: UI distinguishes discovery states and expanded search; unknown models have no Vinca image or settings', async () => {
  const h = await devicesFixture({ devices: [
    { id: 'standard', compatibility: 'possible_standard' },
    { id: 'other', model: 'Other model', compatibility: 'recognized_unsupported' },
    { id: 'unknown', name: 'BLE device', compatibility: 'unknown' },
  ] });
  const scans = []; h.ble.sessionRef.current.scan = async value => scans.push(value);
  assert.match(JSON.stringify(h.render()), /Posible termómetro/);
  assert.match(JSON.stringify(h.render()), /Soporte pendiente/);
  assert.match(JSON.stringify(h.render()), /Dispositivo sin identificar/);
  assert.doesNotMatch(JSON.stringify(h.render()), /La búsqueda ampliada incluye/);
  assert.equal(treeNodes(h.render()).filter(n => n.type === 'img').length, 0);
  assert.equal(h.button('¿No encuentras tu termómetro?'), undefined);
  await h.button('Buscar de nuevo').props.onClick();
  await h.button('¿No encuentras tu termómetro?').props.onClick();
  assert.deepEqual(scans, [undefined, true]); h.cleanup();
  const panel = await vincaPanelFixture({ remembered: true, boundModel: 'Other model', status: 'listening', capabilities: {} });
  assert.equal(treeNodes(panel.render()).filter(n => n.type === 'img').length, 0);
  assert.equal(panel.button('Medio'), undefined); assert.equal(panel.button('Normal'), undefined);
  assert.equal(panel.button('Leer reloj'), undefined);
  assert.doesNotMatch(JSON.stringify(panel.render()), /Femometer Vinca 2/);
  panel.cleanup();
});

test('multibrand: capability flags require both the implemented model and validated protocol', async () => {
  const { thermometerCapabilities } = await import('../src/lib/thermometerCapabilities.js');
  const flags = { clockRead: true, clockSync: true, volumeWrite: true, modeConfiguration: true, historyReceive: true };
  for (const identity of [{ model: 'Other model', protocol: 'vinca2', compatibility: 'compatible' },
    { model: 'BM-Vinca2', protocol: 'standard', compatibility: 'compatible' }, { model: 'BM-Vinca2' }]) {
    const result = thermometerCapabilities({ ...flags, ...identity });
    for (const flag of Object.keys(flags)) assert.equal(result[flag], false);
  }
  const result = thermometerCapabilities({ ...flags, model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' });
  for (const flag of Object.keys(flags)) assert.equal(result[flag], true);
});


test('review container dismissal retains the pending reading and draft in durable storage', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.42 });
    const before = owner.render().readings[0];
    owner.render().updateReadingDraft(before.uiId, { isoDate: '2026-11-18', time: '08:30' });
    owner.card().onDismiss();
    assert.equal(owner.card().visible, false);
    assert.equal(owner.render().pendingCount, 1);
    const recovered = createFemometerLocalState(native.storage, 'a').recover()[0];
    assert.equal(recovered.importStatus, 'pending');
    assert.equal(recovered.draft.time, '08:30');
    owner.render().openReadingReview();
    assert.equal(owner.card().visible, true);
  } finally { owner.cleanup(); await flush(); }
});


test('search presentation replaces instructions with progress/results and recognizes Vinca before inspection', async () => {
  const h = await devicesFixture(); const wait = deferred(); let inspected = 0;
  h.ble.sessionRef.current.scan = async () => { h.ble.sessionState.status = 'searching'; await wait.promise;
    h.ble.sessionState = { ...h.ble.sessionState, status: 'idle', devices: [{ id: 'vinca', name: 'BM-Vinca2' }] }; };
  h.ble.sessionRef.current.selectAndRemember = async () => { inspected++; return false; };
  assert.match(JSON.stringify(h.render()), /Cierra la aplicación del termómetro/);
  assert.equal(h.button('¿No encuentras tu termómetro?'), undefined);
  const scan = h.button('Buscar termómetros').props.onClick();
  assert.doesNotMatch(JSON.stringify(h.render()), /Cierra la aplicación del termómetro/);
  assert.match(JSON.stringify(h.render()), /Preparando búsqueda/);
  await flush(); assert.match(JSON.stringify(h.render()), /Buscando termómetros/);
  wait.resolve(); await scan;
  assert.equal(inspected, 0);
  assert.ok(h.button('¿No encuentras tu termómetro?'));
  assert.ok(treeNodes(h.render()).some(node => node.type === 'img' && node.props.src === '/images/vinca2.jpg'));
  assert.ok(h.button('Femometer Vinca 2'));
  await h.button('Pulsa para vincular').props.onClick(); assert.equal(inspected, 1);
  assert.equal(h.ble.sessionState.remembered, false);
  assert.doesNotMatch(JSON.stringify(h.render()), /Dispositivo sin identificar/);
  h.cleanup();
});

const multiDeviceFixture = () => {
  const native = bridge(); let selected = 'first'; let devices = ['first', 'second']; let state;
  const snapshot = () => ({ remembered: Boolean(selected), deviceKey: selected,
    bindings: devices.map(deviceKey => ({ deviceKey, model: 'BM-Vinca2' })) });
  native.api.getRememberedFemometer = async () => snapshot();
  native.api.rememberFemometer = async (_, key) => { if (!devices.includes(key)) devices.push(key); selected = key; return snapshot(); };
  native.api.selectRememberedFemometer = async (_, key) => { assert.ok(devices.includes(key)); selected = key; return snapshot(); };
  native.api.scanForFemometer = async () => [...devices.map(id => ({ id, deviceKey: id, isRemembered: id === selected })), { id: 'candidate' }];
  native.api.startFemometerTemperatureListener = async id => {
    assert.equal(id, selected); native.calls.connections++;
    return { deviceKey: selected, connectionReady: true, indicationsActive: true, capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } };
  };
  native.api.forgetFemometer = async (_, key) => { devices = devices.filter(id => id !== key); if (selected === key) selected = null; return snapshot(); };
  native.api.connectAndInspectFemometer = async () => ({ compatible: false, standardTrialAvailable: true, compatibility: 'possible_standard' });
  const local = createFemometerLocalState(native.storage, 'a');
  local.savePreference('first', 'volume', 'low'); local.savePreference('second', 'volume', 'high');
  const session = native.factory('a', value => { state = value; }, () => {}, local);
  return { native, local, session, state: () => state, snapshot };
};

test('multiple bindings switch one connection, preserve preferences and reconnect only the selected device', async () => {
  const h = multiDeviceFixture();
  await h.session.start(); assert.equal(h.state().preferences.volume, 'low');
  const close = deferred(); h.native.flags.disconnectWait = close;
  const switching = h.session.connectSaved('second'); await flush();
  assert.equal(h.native.calls.connections, 1); assert.equal(h.snapshot().deviceKey, 'first');
  close.resolve(); await switching;
  assert.equal(h.native.calls.connections, 2); assert.equal(h.native.calls.peakListeners, 1);
  assert.equal(h.state().preferences.volume, 'high'); assert.equal(h.snapshot().bindings.length, 2);
  assert.equal(h.local.preferences('first').volume, 'low');
  await h.session.suspend(); await h.session.resume(); assert.equal(h.state().deviceKey, 'second');
  assert.equal(h.state().preferences.volume, 'high');
  await h.session.dispose();
});

test('failed addition and individual unlink preserve other bindings and durable pending temperatures', async () => {
  const h = multiDeviceFixture();
  h.local.saveReadings([{ deviceKey: 'first', uiId: 1, temperatureC: 36.5, importStatus: 'pending', receivedOrder: 1 }]);
  await h.session.scan();
  assert.equal(await h.session.selectAndRemember('candidate'), false);
  assert.equal(h.snapshot().deviceKey, 'first'); assert.equal(h.snapshot().bindings.length, 2);
  await h.session.unlink('second');
  assert.deepEqual(h.snapshot().bindings.map(row => row.deviceKey), ['first']);
  assert.equal(h.snapshot().deviceKey, 'first');
  await h.session.unlink('first'); assert.equal(h.snapshot().deviceKey, null);
  assert.equal(h.local.recover()[0].temperatureC, 36.5);
  assert.equal(h.local.preferences('first').volume, 'low');
  await h.session.dispose();
});

test('opening another device shows its own preferences and connects by its opaque key', async () => {
  const h = await vincaPanelFixture({ remembered: true, status: 'listening', deviceKey: 'first',
    bindings: [{ deviceKey: 'first', model: 'BM-Vinca2' }, { deviceKey: 'second', model: 'BM-Vinca2' }],
    preferences: { volume: 'low' }, preferencesByDevice: { second: { volume: 'high', measurementMode: 'quick' } },
    listenerResult: { connectionReady: true, indicationsActive: true }, capabilities: { volumeWrite: true } }, { deviceKey: 'second' });
  assert.equal(h.button('Alto').props['aria-pressed'], true); assert.equal(h.button('Alto').props.disabled, true);
  assert.equal(h.button('Bajo').props['aria-pressed'], false);
  assert.equal(h.button('Reloj').props.disabled, true);
  let connected; h.ble.sessionRef.current.connectSaved = async key => { connected = key; };
  await h.button('Conectar').props.onClick(); assert.equal(connected, 'second');
  assert.equal(treeNodes(h.render()).some(node => node.type === 'diagnostics'), false);
  h.cleanup();
});

test('standard trial is isolated from the normal queue, storage, settings and binding selection', async () => {
  const native = bridge(); let trialEvent; let trialRemoves = 0;
  native.api.scanForFemometer = async () => [{ id: 'temporary', isRemembered: true }, { id: 'standard' }];
  native.api.connectAndInspectFemometer = async () => ({ compatible: false, standardTrialAvailable: true });
  native.api.addStandardThermometerTrialListener = async callback => { trialEvent = callback; return { remove: async () => trialRemoves++ }; };
  native.api.startStandardThermometerTrial = async () => ({ experimental: true, connectionReady: true, indicationsActive: true });
  const owner = await mountedOwner(native);
  try {
    native.emit({ temperatureC: 36.4 });
    native.emit({ temperatureC: 37, experimental: true });
    assert.equal(owner.render().pendingCount, 1);
    const session = owner.render().sessionRef.current;
    await session.beginChange(); await session.scan(); await session.selectAndRemember('standard');
    const before = JSON.stringify(createFemometerLocalState(native.storage, 'a').recover());
    const configs = [native.calls.clock, native.calls.sync, native.calls.volume.length, native.calls.measurementMode.length];
    await session.startTrial('standard');
    trialEvent({ experimental: true, temperatureC: 36.65, deviceTimestamp: '2026-11-18T08:00:00' });
    trialEvent({ experimental: false, temperatureC: 50 });
    await session.setVolume('high'); await session.syncClock(); await session.setMeasurementMode('quick');
    assert.equal(owner.render().sessionState.trial.readings.length, 1);
    assert.equal(owner.render().pendingCount, 1);
    assert.equal(JSON.stringify(createFemometerLocalState(native.storage, 'a').recover()), before);
    assert.deepEqual([native.calls.clock, native.calls.sync, native.calls.volume.length, native.calls.measurementMode.length], configs);
    assert.equal(owner.render().sessionState.deviceKey, 'bound-a');
    trialEvent({ status: 'timeout' }); await flush();
    assert.equal(trialRemoves, 1); assert.equal(owner.render().sessionState.trial.status, 'complete');
    trialEvent({ experimental: true, temperatureC: 38 });
    assert.equal(owner.render().sessionState.trial.readings.length, 1);
  } finally { owner.cleanup(); await flush(); }
});


test('adding a supported device retains saved devices; reselecting an existing one never creates defaults', async () => {
  const h = multiDeviceFixture();
  h.native.api.connectAndInspectFemometer = async () => ({ compatible: true, protocol: 'vinca2', model: 'BM-Vinca2' });
  await h.session.start(); await h.session.beginChange(); await h.session.scan();
  assert.equal(await h.session.selectAndRemember('candidate'), true);
  assert.equal(h.state().bindings.length, 3); assert.equal(h.state().deviceKey, 'candidate');
  assert.deepEqual(h.local.preferences('candidate'), { volume: 'medium', measurementMode: 'normal' });
  await h.session.beginChange(); await h.session.scan();
  assert.equal(await h.session.selectAndRemember('first'), true);
  assert.deepEqual(h.local.preferences('first'), { volume: 'low' });
  assert.equal(h.state().bindings.length, 3); assert.equal(h.native.calls.peakListeners, 1);
  await h.session.dispose();
});

test('trial cancellation drains a late start and rejects late trial events without reconnecting', async () => {
  const h = multiDeviceFixture(); const start = deferred(); let event; let removed = 0;
  h.native.api.addStandardThermometerTrialListener = async callback => { event = callback; return { remove: async () => removed++ }; };
  h.native.api.startStandardThermometerTrial = () => start.promise;
  await h.session.scan();
  const beginning = h.session.selectAndRemember('candidate'); await flush();
  const stopped = h.session.stopTrial(); await flush();
  event({ experimental: true, temperatureC: 38 });
  start.resolve({ experimental: true, connectionReady: true, indicationsActive: true });
  await beginning; await stopped; await h.session.resume();
  assert.equal(h.state().trial.status, 'complete'); assert.equal(h.state().trial.readings.length, 0);
  assert.equal(h.state().deviceKey, 'first'); assert.equal(h.native.calls.connections, 0);
  assert.equal(removed, 1); await h.session.dispose();
});


test('concurrent unlink requests cannot report success for a different device', async () => {
  const h = multiDeviceFixture(); await h.session.start();
  const wait = deferred(); h.native.flags.disconnectWait = wait;
  const first = h.session.unlink('first'); await flush();
  assert.equal(await h.session.unlink('second'), false);
  wait.resolve(); assert.equal(await first, true);
  assert.deepEqual(h.snapshot().bindings.map(row => row.deviceKey), ['second']);
  assert.equal(h.snapshot().deviceKey, null); await h.session.dispose();
});


test('thermometer metadata migrates additively, merges partial updates and retains offline edits per account and key', async () => {
  const storage = memoryStorage(); let notify, state; let offline = false, revision = 0;
  const remoteData = { first: { customName: { value: 'Remote', updatedAt: 20, revision: 'remote' }, volume: { value: 'low', updatedAt: 20, revision: 'remote' } } };
  const remote = { subscribe: callback => { notify = callback; return () => {}; }, merge: async (key, fields) => {
    if (offline) throw new Error('offline');
    return remoteData[key] = mergeThermometerFields(remoteData[key], fields);
  } };
  let store = createThermometerMetadataStore({ userId: 'a', storage, remote, now: () => 30, uuid: () => String(++revision), changed: value => { state = value; } });
  store.patch('first', { volume: 'medium', model: 'BM-Vinca2' }, true); await flush();
  assert.equal(store.get('first').volume, 'low');
  assert.equal(store.get('first').customName, 'Remote');
  store.patch('second', { customName: 'Other', volume: 'high' }); await flush();
  offline = true; store.patch('first', { customName: null, firmware: '2' }); await flush();
  assert.match(state.error, /conservados/); assert.equal(store.get('first').customName, null);
  notify([['first', { batteryLevel: { value: 80, updatedAt: 40, revision: 'battery' } }]]);
  assert.equal(store.get('first').firmware, '2'); store.dispose();
  store = createThermometerMetadataStore({ userId: 'a', storage, remote, changed: value => { state = value; } });
  assert.equal(store.get('first').customName, null); offline = false; await store.flush();
  assert.equal(remoteData.first.customName.value, null); assert.equal(store.get('second').volume, 'high'); store.dispose();
  const other = createThermometerMetadataStore({ userId: 'b', storage, remote: { subscribe: () => () => {}, merge: async () => ({}) }, changed: () => {} });
  assert.deepEqual(other.get('first'), {}); other.dispose();
  assert.deepEqual(sanitizeThermometerMetadata({ address: 'private', serial: 'private', selected: true, model: 'AA:BB:CC:DD:EE:FF', customName: 'x'.repeat(41) }), {});
});

test('inline thermometer name commits Enter once, cancels Escape and preserves explicit removal', async () => {
  const harness = hooks(), calls = [], devices = {};
  const { ThermometerName } = await loadFrontend('src/components/ThermometerName.jsx', { ...harness.bindings, Pencil: 'pencil', thermometerName,
    useThermometerMetadata: () => ({ devices, patch: (key, value) => { calls.push([key, value]); devices[key] = value; } }) }, ['ThermometerName']);
  const nodes = () => treeNodes(harness.render(() => ({ props: { value: ThermometerName({ device: { deviceKey: 'one', model: 'BM-Vinca2' } }) } })));
  const edit = () => nodes().find(node => node.type === 'button').props.onClick();
  edit(); nodes().find(node => node.type === 'input').props.onChange({ target: { value: 'VINCA USO' } });
  const field = nodes().find(node => node.type === 'input');
  field.props.onKeyDown({ key: 'Enter', preventDefault() {} }); field.props.onBlur();
  assert.deepEqual(calls, [['one', { customName: 'VINCA USO' }]]);
  edit(); nodes().find(node => node.type === 'input').props.onKeyDown({ key: 'Escape', preventDefault() {} }); assert.equal(calls.length, 1);
  edit(); nodes().find(node => node.type === 'input').props.onChange({ target: { value: ' ' } }); nodes().find(node => node.type === 'input').props.onBlur();
  assert.equal(calls.at(-1)[1].customName, null);
  const measurement = normalizeBleMeasurement({ temperatureC: 36.5, deviceModel: 'BM-Vinca2', deviceKey: 'one', deviceCustomName: 'Old name' });
  assert.equal(measurementSourceLabel(measurement), 'Old name');
  assert.equal(measurementSourceLabel(measurement, 'Current name'), 'Current name');
  assert.equal(measurementSourceLabel(measurement, null), 'Vinca 2'); harness.cleanup();
});

test('standard promotion without original date persists before one manual save; partial failures retain binding and pending attempt', async () => {
  for (const outcome of ['success', 'duplicate', 'uncertain']) {
    const h = standardVerificationFixture(); h.sample.deviceTimestamp = null;
    const storage = memoryStorage(); let owner, saves = 0;
    const cycle = { currentCycle: { id: 'cycle', startDate: '2026-11-01' }, isLoading: false,
      incorporateBleMeasurement: async payload => {
        saves++; const row = createFemometerLocalState(storage, 'a').recover()[0];
        assert.equal(row.importStatus, 'uncertain'); assert.ok(row.attempt.id);
        assert.equal(payload.measurements[0].device_timestamp, null);
        assert.equal(payload.measurements[0].confirmed_timestamp, '2026-11-18T08:05:00');
        if (outcome !== 'success') throw Object.assign(new Error('failure'), outcome === 'duplicate' ? { code: 'ble-possible-duplicate' } : {});
        return { isoDate: payload.isoDate, measurements: payload.measurements };
      } };
    owner = await mountedOwner({ factory: createFemometerSessionManager(h.api), api: h.api, calls: {}, flags: {}, storage }, 'a', cycle);
    const session = owner.render().sessionRef.current;
    await session.scan(); await session.selectAndRemember('standard'); h.trial(h.sample);
    const action = owner.render().completeVerification({ readingId: 'reading', basalConfirmed: true, isoDate: '2026-11-18', time: '08:05' });
    if (outcome === 'success') assert.equal(await action, true); else await assert.rejects(action, /pendiente/);
    assert.equal(saves, 1); assert.equal(h.saved().deviceKey, 'standard-key');
    const state = owner.render(); assert.equal(state.pendingCount, outcome === 'success' ? 0 : 1);
    if (outcome !== 'success') assert.equal(state.readings[0].importStatus, outcome === 'duplicate' ? 'pending' : 'uncertain');
    owner.cleanup(); await flush(); await h.session.dispose();
  }
});

const easySample = { temperatureC: 36.52, temperatureOriginal: 36.52, deviceKey: 'easy', deviceModel: 'EBT-300', deviceProtocol: 'easyhome-ebt300', receptionValidated: true, temperatureUnit: 'unknown', measurementKind: 'historical', deviceTimestamp: '2026-02-07T22:15:00' };
test('EasyHome current and historical range inference preserves unknown transmitted units and original values', () => {
  for (const measurementKind of ['current', 'historical']) {
    for (const [original, celsius, unit] of [[32, 32, 'celsius'], [43, 43, 'celsius'], [89.6, 32, 'fahrenheit'], [109.4, 43, 'fahrenheit'], [97.7, 36.5, 'fahrenheit']]) {
      const m = normalizeBleMeasurement({ ...easySample, measurementKind, temperatureOriginal: original });
      assert.equal(m.temperature, celsius); assert.equal(m.temperature_original, celsius);
      assert.equal(isPossibleBleDuplicate(m, { ...m }), true);
      assert.equal(isPossibleBleDuplicate(m, { ...m, device_timestamp: '2026-02-06T22:15:00' }), false);
      assert.equal(m.transmitted_temperature, original); assert.equal(m.transmitted_unit, 'unknown');
      assert.equal(m.inferred_temperature_unit, unit); assert.equal(authorizedBleMeasurement(m), true);
    }
  }
  for (const original of [0, 31.99, 43.01, 89.59, 109.41, NaN, Infinity, '36.5'])
    assert.equal(normalizeBleMeasurement({ ...easySample, temperatureOriginal: original }), null);
  const m = normalizeBleMeasurement({ ...easySample, temperatureOriginal: 97.7 });
  const draft = { isoDate: '2026-02-08', time: '08:15', temperatureC: '36,62', confirmed: true, userId: 'a', cycleId: 'cycle', nowMs: Date.parse('2026-11-20') };
  const saved = prepareManualBleDraft(m, draft).measurements[0];
  assert.equal(saved.temperature, 36.62); assert.equal(saved.time, '08:15');
  assert.equal(saved.confirmed_timestamp, '2026-02-08T08:15:00');
  for (const field of ['temperature_original', 'transmitted_temperature', 'transmitted_unit', 'inferred_temperature_unit', 'temperature_interpretation', 'device_timestamp']) assert.equal(saved[field], m[field]);
  for (const patch of [{ temperatureC: '' }, { temperatureC: 44 }, { temperatureC: 31 }, { isoDate: '2026-02-30' }, { time: '25:00' }, { confirmed: false }]) assert.throws(() => prepareManualBleDraft(m, { ...draft, ...patch }));
  assert.equal(normalizeBleMeasurement({ ...easySample, deviceTimestamp: '2026-02-30T08:00:00' }).device_date_reliability, 'invalid');
});

test('EasyHome histories persist independently across reconnect, discard, uncertain writes and account changes', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.emit({ ...easySample, deviceKey: 'bound-a' }); native.emit({ ...easySample, deviceKey: 'bound-a', temperatureOriginal: 97.7 }); native.emit({ ...easySample, deviceKey: 'bound-a' });
    assert.equal(owner.render().pendingCount, 3);
    const session = owner.render().sessionRef.current;
    await session.stop(); await session.start();
    assert.equal(owner.render().pendingCount, 3);
    owner.render().updateReadingDraft(2, { temperatureC: '36.61', isoDate: '2026-02-08', time: '08:15' });
    const rows = createFemometerLocalState(native.storage, 'a').recover();
    assert.equal(rows.length, 3); assert.equal(rows[1].draft.temperatureC, '36.61');
    assert.equal(rows[1].normalized.transmitted_temperature, 97.7);
    owner.render().discardReading(1, session);
    await assert.rejects(owner.render().incorporateReading(2, async () => { throw Error('network'); }, { attempt: { id: 'easy-attempt', userId: 'a', cycleId: 'cycle', isoDate: '2026-02-08', time: '08:15' } }));
    assert.equal(owner.render().readings.find(row => row.uiId === 2).importStatus, 'uncertain');
    await owner.changeAccount('b'); assert.equal(owner.render().pendingCount, 0);
    await owner.changeAccount('a'); assert.equal(owner.render().pendingCount, 2);
  } finally { owner.cleanup(); await flush(); }
});


test('persisted thermometer info survives disconnection and keeps original identity separate from nickname', async () => {
  const metadata = { devices: { 'key': { customName: 'VINCA USO', firmware: 'FW-2', batteryLevel: 75, batteryCheckedAt: 10000, infoCheckedAt: 10000, volume: 'low' } } };
  const h = await vincaPanelFixture({ remembered: true, deviceKey: 'key', boundModel: 'BM-Vinca2', status: 'stopped' }, { deviceKey: 'key' }, metadata);
  const text = JSON.stringify(h.render());
  assert.match(text, /FW-2/); assert.match(text, /75 %/); assert.match(text, /BM-Vinca2/); assert.match(text, /Bajo/);
  h.ble.sessionRef.current.readDeviceInfo = async () => h.calls.push('info');
  await h.toggleInfo(true); assert.deepEqual(h.calls, []);
  assert.doesNotMatch(text, /No disponible/); h.cleanup();
});

test('EasyHome unit and clock operations exclude information reads and never invoke Vinca settings', async () => {
  const n = bridge(), pending = deferred(), local = createFemometerLocalState(n.storage, 'a'); let state;
  n.api.getRememberedFemometer = async () => ({ remembered: true, deviceKey: 'easy', model: 'EBT-300', protocol: 'easyhome-ebt300', compatibility: 'experimental' });
  n.api.startFemometerTemperatureListener = async () => ({ deviceKey: 'easy', connectionReady: true, indicationsActive: true,
    capabilities: { model: 'EBT-300', protocol: 'easyhome-ebt300', compatibility: 'experimental', clockSync: true, unitWrite: true } });
  local.savePreference('easy', 'temperatureUnit', 'F');
  let units = 0;
  n.api.setFemometerTemperatureUnit = async unit => { units++; assert.equal(unit, 'C'); return pending.promise; };
  const session = n.factory('a', next => { state = next; }, () => {}, local);
  await session.start(); assert.equal(state.preferences.temperatureUnit, 'C'); assert.equal(units, 0); assert.equal(n.calls.clock, 0); assert.equal(n.calls.sync, 0); assert.deepEqual(n.calls.volume, []);
  await session.setTemperatureUnit('F'); assert.equal(units, 0);
  const setting = session.setTemperatureUnit('C'); await flush();
  await session.readDeviceInfo(); await session.syncClock(); await session.setTemperatureUnit('C');
  assert.equal(n.calls.info, 0); assert.equal(n.calls.sync, 0); assert.equal(units, 1);
  pending.resolve({ writeAccepted: true, verified: false }); await setting;
  assert.equal(state.unitResult.verified, false); assert.equal(state.gattReconnectRequired, true);
  assert.equal(local.preferences('easy').temperatureUnit, 'C'); await session.dispose();
});

test('navigation during first binding leaves its received take pending without saving an obsolete destination', async () => {
  const h = standardVerificationFixture(), wait = deferred(), original = h.api.confirmStandardThermometerTrial;
  let saves = 0;
  h.api.confirmStandardThermometerTrial = async (...args) => { await wait.promise; return original(...args); };
  const owner = await mountedOwner({ factory: createFemometerSessionManager(h.api), api: h.api, calls: {}, flags: {}, storage: memoryStorage() }, 'a', {
    currentCycle: { id: 'cycle', startDate: '2026-11-01' }, isLoading: false, incorporateBleMeasurement: async () => { saves++; } });
  const session = owner.render().sessionRef.current;
  await session.scan(); await session.selectAndRemember('standard'); h.trial(h.sample);
  const result = owner.render().completeVerification({ readingId: 'reading', basalConfirmed: true, isoDate: '2026-11-18', time: '08:05' });
  await flush(); owner.navigate('other-screen'); wait.resolve(); await assert.rejects(result, /pendiente/);
  assert.equal(saves, 0); assert.equal(owner.render().pendingCount, 1); assert.equal(h.saved().deviceKey, 'standard-key');
  owner.cleanup(); await flush(); await h.session.dispose();
});

test('EasyHome historical editor confirms edited Celsius, date and time, preserving provenance', async () => {
  const normalized = normalizeBleMeasurement({ ...easySample, temperatureOriginal: 97.7 });
  const h = await uncertainEditorFixture({ ...easySample, normalized, importStatus: 'pending', draft: undefined, attempt: undefined });
  try {
    assert.equal(h.render().draft.temperatureC, 36.5);
    assert.equal(h.render().draft.isoDate, '2026-02-07');
    h.render().change({ temperatureC: '36.64', isoDate: '2026-02-08', time: '09:12' });
    await h.render().confirm();
    assert.equal(h.payloads.length, 1);
    const saved = h.payloads[0].measurements[0];
    assert.equal(saved.temperature, 36.64); assert.equal(saved.confirmed_timestamp, '2026-02-08T09:12:00');
    assert.equal(saved.transmitted_temperature, 97.7); assert.equal(saved.temperature_original, 36.5);
  } finally { h.cleanup(); }
});

test('EasyHome UI exposes only Celsius and the numeric editor belongs only to its histories', async () => {
  const h = await vincaPanelFixture({ remembered: true, boundProtocol: 'easyhome-ebt300', boundModel: 'EBT-300', status: 'listening',
    preferences: { temperatureUnit: 'F' }, capabilities: { unitWrite: true } });
  try {
    const text = JSON.stringify(h.render());
    assert.match(text, /Configuración automática/); assert.doesNotMatch(text, /°F/);
    assert.equal(treeNodes(h.render()).filter(n => n.type === 'button' && ['°C', '°F'].includes(n.props.children)).length, 0);
  } finally { h.cleanup(); }
  const harness = hooks(); const changes = [];
  const { BleReadingReviewView } = await loadFrontend('src/components/BleReadingReviewView.jsx', {
    ...harness.bindings, Button: 'button', Input: 'input', CheckCircle2: 'check', Trash2: 'trash', PlusCircle: 'plus', measurementDisplay, measurementSourceLabel,
  }, ['BleReadingReviewView']);
  try {
    for (const [protocol, kind, editable] of [['easyhome-ebt300', 'historical', true], ['easyhome-ebt300', 'current', false], ['vinca2', 'historical', false], ['health-thermometer', 'historical', false]]) {
      const props = { reading: { importStatus: 'pending', normalized: { device_protocol: protocol, measurement_kind: kind } },
        draft: { temperatureC: 36.5, isoDate: '2026-02-07', time: '22:15' }, change: patch => changes.push(patch) };
      const inputs = treeNodes(BleReadingReviewView(props)).filter(n => n.type === 'input' && n.props.type === 'number');
      assert.equal(inputs.length, editable ? 1 : 0);
      if (editable) {
        inputs[0].props.onChange({ target: { value: '36.61' } }); assert.deepEqual(changes, [{ temperatureC: '36.61' }]);
        assert.equal(treeNodes(BleReadingReviewView({ ...props, busy: true })).find(n => n.type === 'input' && n.props.type === 'number').props.disabled, true);
      }
    }
  } finally { harness.cleanup(); }
});


test('diagnostic capture is cleared on account change and logout without removing pending temperatures', async () => {
  const native = bridge();
  const owner = await mountedOwner(native);
  const before = (native.calls.captureClears ?? 0);
  await owner.changeAccount('other');
  assert.equal((native.calls.captureClears ?? 0), before + 1);
  owner.cleanup();
  assert.equal((native.calls.captureClears ?? 0), before + 2);
});

test('capture wrappers exclude PWA, production and Experiment and export only explicit fields', async () => {
  for (const [env, platform, allowed] of [['staging', 'android', true], ['staging', 'web', false], ['production', 'android', false], ['experiment', 'android', false]]) {
    const calls = [];
    const { bluetoothCapture, formatVinca2Capture } = await loadFrontend('src/lib/femometerBle.js', {
      Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform,
        nativePromise: async (...args) => { calls.push(args); return {}; } },
      registerPlugin: () => ({}), isFemometerPrototypeEnabled: () => true, createFemometerSessionManager: () => () => {},
    }, ['bluetoothCapture', 'formatVinca2Capture'], source => source.replaceAll("import.meta.env", "(" + JSON.stringify({ VITE_APP_ENV: env }) + ")"));
    if (allowed) { await bluetoothCapture('start'); assert.deepEqual(calls[0], ['FemometerBle', 'bluetoothCapture', { action: 'start', stagingFrontend: true }]); }
    else { assert.throws(() => bluetoothCapture('start')); assert.equal(calls.length, 0); }
    const output = formatVinca2Capture({ active: true, truncated: true, accountId: 'secret', events: [{ order: 1, receivedAt: 0, elapsedMs: 0, channel: '2a1c', direction: 'reception', status: 'received', hex: '86 E2', originalBytes: 200, mac: 'AA:BB:CC:DD:EE:FF', token: 'secret', serial: 'private' }] });
    assert.match(output, /1970-01-01T00:00:00.000Z/); assert.match(output, /TRUNCADO/);
    assert.doesNotMatch(output, /secret|private|AA:BB|\uFFFD/);
    assert.match(formatVinca2Capture({ active: true, prepared: true, observeClock: true, events: [{ order: 1, receivedAt: 0, elapsedMs: 0, channel: 'search', direction: 'control', status: 'scan_started', hex: '', originalBytes: 0, connection: 0 }] }), /HEX: \(sin bytes\)/);
  }
});

test('native hooks observe both Android callback signatures and proprietary bytes before the existing discard', async () => {
  const source = await fs.readFile(new URL('../android/app/src/main/java/com/fertiliapp/fertiliapp/FemometerGattSession.java', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('private synchronized void handleTemperatureCharacteristicChanged'), source.indexOf('private JSObject decodeTemperatureMeasurement'));
  assert.ok(handler.indexOf('captured = capture.record') < handler.indexOf('if (!receptionValidated'));
  assert.match(handler, /VINCA_INDICATION_UUID.equals/);
  assert.ok(handler.indexOf('capture.decoded(captured, safe.toString())') < handler.indexOf('decoded.put("deviceKey"'));
  assert.match(source, /handleTemperatureCharacteristicChanged\(gatt, characteristic, characteristic.getValue\(\), connectedDeviceKey\)/);
  assert.match(source, /handleTemperatureCharacteristicChanged\(gatt, characteristic, value, connectedDeviceKey\)/);
});


test('capture UI is manual, supports selectable text and clears on stop and unmount', async () => {
  const harness = hooks(); const calls = [];
  const empty = { active: false, truncated: false, events: [] };
  let snapshot = empty;
  const { BluetoothCapture } = await loadFrontend('src/components/Vinca2Diagnostics.jsx', {
    ...harness.bindings, Button: 'button', navigator: {},
    useAuth: () => ({ user: { uid: 'a' } }),
    useFemometer: () => ({ sessionState: { status: 'stopped', deviceKey: 'bound-a', bindings: [{ deviceKey: 'bound-a', model: 'BM-Vinca2', protocol: 'vinca2' }] } }),
    bluetoothCapture: async (action, options) => {
      calls.push(action);
      if (action === 'prepare') {
        assert.deepEqual(options, { userId: 'a', deviceKey: 'bound-a', observeClock: true });
        snapshot = { active: true, prepared: true, observeClock: true, truncated: false, events: [] };
      }
      if (action === 'start') snapshot = { active: true, truncated: false, events: [{ order: 1 }] };
      if (action === 'stop' || action === 'clear') snapshot = empty;
      return snapshot;
    },
    clearVinca2Capture: async () => { calls.push('clear'); snapshot = empty; },
    formatVinca2Capture: next => `Registro: ${next.events.length}`,
    setTimeout: () => 1, clearTimeout: () => {},
  }, ['BluetoothCapture']);
  const render = () => harness.render(() => ({ props: { value: BluetoothCapture() } }));
  const button = label => treeNodes(render()).find(node => node.type === 'button' && node.props.children.includes(label));
  render(); assert.deepEqual(calls, []);
  assert.equal(button('Preparar captura para la próxima conexión').props.disabled, false);
  treeNodes(render()).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  await button('Preparar captura para la próxima conexión').props.onClick();
  assert.deepEqual(calls, ['prepare']); assert.equal(snapshot.prepared, true);
  await button('Limpiar captura').props.onClick(); calls.length = 0;
  await button('Iniciar captura').props.onClick(); assert.deepEqual(calls, ['start']);
  await button('Copiar registro').props.onClick();
  const tree = render(); assert.match(JSON.stringify(tree), /Selecciona el texto/);
  const textarea = treeNodes(tree).find(node => node.type === 'textarea');
  assert.equal(textarea.props.readOnly, true); assert.equal(textarea.props.value, 'Registro: 1');
  let selected = false; textarea.props.onFocus({ target: { select: () => { selected = true; } } }); assert.equal(selected, true);
  await button('Detener captura').props.onClick();
  assert.equal(treeNodes(render()).some(node => node.type === 'textarea'), false);
  await button('Iniciar captura').props.onClick();
  await button('Limpiar captura').props.onClick(); assert.equal(snapshot.active, false);
  harness.cleanup(); assert.equal(calls.at(-1), 'clear');
});


test('prepared observation keeps automatic reads but suppresses only Vinca automatic clock correction', async () => {
  for (const observe of [true, false]) {
    const h = integratedSession();
    const start = h.api.startFemometerTemperatureListener;
    h.api.startFemometerTemperatureListener = async (...args) => ({ ...await start(...args), captureObserveClock: observe });
    h.api.readFemometerClock = async () => ({ deviceKey: 'bound-a', deviceLocalTime: '2020-01-01T08:00:00' });
    h.api.syncFemometerClock = async () => { h.calls.sync++; return { deviceLocalTime: localText(h.flags.now), verified: true }; };
    h.flags.now = new Date(2026, 10, 20, 12).getTime();
    await h.session.start();
    assert.equal(h.calls.sync, observe ? 0 : 1);
    assert.equal(h.state().status, 'listening');
    assert.ok(h.state().clockResult);
    await h.session.stop(); await h.session.start();
    assert.equal(h.calls.sync, observe ? 0 : 2);
    await h.session.dispose();
  }
});

test('preparation native guard uses saved identity and preserves the transport sequence', async () => {
  const source = await fs.readFile(new URL('../android/app/src/main/java/com/fertiliapp/fertiliapp/FemometerGattSession.java', import.meta.url), 'utf8');
  const prepare = source.slice(source.indexOf('} else if ("prepare".equals(action))'), source.indexOf('} else if ("start".equals(action))'));
  assert.match(prepare, /identities\(\).get\(user\)/);
  assert.match(prepare, /bound.compatibility/); assert.match(prepare, /bound.protocol/); assert.match(prepare, /bound.key.equals/);
  assert.doesNotMatch(prepare, /connectGatt|startReception|writeCharacteristic/);
  assert.match(source, /capture.connectionStarted\(\)/);
  assert.match(source, /capture.observingClock\(\)/);
  for (const status of ['scan_started', 'scan_finished', 'bound_device_found', 'bound_device_not_found', 'listening_until_disconnect', 'window_ended']) assert.ok(source.includes(status));
  const clockSource = await fs.readFile(new URL('../android/app/src/main/java/com/fertiliapp/fertiliapp/BleClockOperation.java', import.meta.url), 'utf8');
  assert.ok(clockSource.indexOf('capture.record(channel.toString()') < clockSource.indexOf('if (DATE_TIME.equals(channel))'));
  assert.match(clockSource, /CLOCK_INVALID_DATE/); assert.match(clockSource, /CLOCK_DIAGNOSTIC_READ_ONLY/);
});


test('B: calendar policy accepts yesterday with tracked operational clock confidence', async () => {
  const { assessVinca2AutomaticDate, prepareAutomaticBleDraft } = await import('../src/lib/bleMeasurements.js');
  const nowMs = Date.parse('2026-11-20T22:00:00Z');
  const reading = date => normalizeBleMeasurement({ temperatureC: 36.42, deviceTimestamp: date,
    deviceModel: 'BM-Vinca2', deviceProtocol: 'vinca2', deviceKey: 'v', receptionValidated: true });
  const context = { deviceKey: 'v', nowMs, timeZone: 'Europe/Madrid' };
  const reason = (date, patch = {}) => assessVinca2AutomaticDate(reading(date), { ...context, ...patch }).reason;
  for (const date of ['2026-11-20T08:00:00', '2026-11-19T01:00:00']) assert.equal(reason(date), 'clock-history-insufficient');
  assert.equal(reason('2026-11-18T23:59:00'), 'not-today-or-yesterday');
  assert.equal(reason('2026-11-20T23:30:00'), 'future-date');
  assert.equal(reason(null), 'missing-date'); assert.equal(reason('2000-00-00T00:00:00'), 'invalid-date');
  assert.equal(reason('2026-10-25T02:30:00', { nowMs: Date.parse('2026-10-25T12:00:00Z') }), 'ambiguous-local-date');
  assert.equal(reason('2026-03-29T02:30:00', { nowMs: Date.parse('2026-03-29T12:00:00Z') }), 'nonexistent-local-date');
  const sync = { operation: 'sync', verified: true, continuityTracked: true, checkedAt: Date.parse('2026-11-19T08:00:00Z'), driftSeconds: 0,
    phoneTimeZone: 'Europe/Madrid', phoneUtcOffsetMinutes: 60 };
  const check = { ...sync, operation: 'read', checkedAt: nowMs };
  const clockHistory = { historyVersion: 2, state: 'read_correct', lastVerifiedSync: sync, lastValidCheck: check };
  assert.equal(reason('2026-11-20T08:00:00', { clockHistory }), 'operational-clock-confidence');
  assert.equal(reason('2026-11-19T08:00:00', { clockHistory }), 'measurement-before-clock-sync');
  for (const patch of [{ phoneTimeZone: 'UTC' }, { phoneUtcOffsetMinutes: 120 }])
    assert.equal(reason('2026-11-20T08:00:00', { clockHistory: { ...clockHistory, lastValidCheck: { ...check, ...patch } } }), 'clock-time-zone-changed');
  assert.equal(reason('2026-11-20T08:00:00', { clockHistory: { ...clockHistory, invalidatedAt: nowMs - 1 } }), 'clock-trust-interrupted');
  assert.equal(reason('2026-11-20T08:00:00', { clockHistory: { ...clockHistory, lastValidCheck: sync } }), 'operational-clock-confidence');
  assert.equal(reason('2026-11-20T08:00:00', { deviceKey: 'other' }), 'device-identity-unavailable');
  assert.throws(() => prepareAutomaticBleDraft(reading('2026-11-20T08:00:00'), { ...context, clockHistory }), error => error.code === 'ble-auto-review');
  const draft = prepareAutomaticBleDraft(reading('2026-11-20T08:00:00'), { ...context, clockHistory, userId: 'u', cycleId: 'c', incorporationMode: 'automatic', automaticConsent: 'v2' });
  assert.equal(draft.isoDate, '2026-11-20');
  assert.equal(draft.manuallyConfirmed, undefined);
  assert.equal(reason('2026-11-20T08:00:00', { clockHistory: { ...clockHistory, lastIncidentAt: nowMs - 1 } }), 'clock-trust-interrupted');
});

test('B: mode choices require server success; prompt and choices persist per account/device, including close', async () => {
  const storage = memoryStorage(); const data = {}; let offline = false;
  const remote = {
    subscribe: () => () => {},
    merge: async (id, fields) => { if (offline) throw Error('offline'); return data[id] = mergeThermometerFields(data[id], fields); },
    claimAutomationPrompt: async (id, field) => {
      if (offline) throw Error('offline');
      const chosen = data[id]?.incorporationMode?.value === 'manual' || (data[id]?.incorporationMode?.value === 'automatic' && data[id]?.automaticConsent?.value === 'v2');
      if (chosen) return { fields: data[id], claimed: false };
      return { fields: data[id] = { ...data[id], automationPrompt: field, automationPromptVersion: { ...field, value: 'v2' } }, claimed: true };
    },
  };
  const create = (userId = 'a', backend = remote) => createThermometerMetadataStore({ userId, storage, remote: backend, changed: () => {} });
  let first = create(), otherSession = create();
  assert.deepEqual(await Promise.all([first.claimAutomationPrompt('v'), otherSession.claimAutomationPrompt('v')]), [true, true]);
  assert.equal(first.get('v').incorporationMode, undefined); // Closing chooses nothing.
  first.dispose(); first = create(); assert.equal(await first.claimAutomationPrompt('v'), true);
  offline = true; await assert.rejects(first.chooseIncorporationMode('v', 'automatic'));
  assert.equal(first.get('v').incorporationMode, undefined);
  offline = false; await first.chooseIncorporationMode('v', 'automatic');
  assert.equal(first.get('v').incorporationMode, 'automatic');
  assert.deepEqual(first.get('other-device'), {});
  first.dispose(); first = create(); assert.equal(first.get('v').incorporationMode, 'automatic');
  await first.chooseIncorporationMode('v', 'manual'); assert.equal(first.get('v').incorporationMode, 'manual');
  const accountB = create('b', { subscribe: () => () => {}, merge: async (_, fields) => fields });
  assert.deepEqual(accountB.get('v'), {});
  data.legacy = { incorporationMode: { value: 'automatic', updatedAt: 1, revision: 'old' }, automationPrompt: { value: 'chosen', updatedAt: 1, revision: 'old' } };
  assert.equal(await first.claimAutomationPrompt('legacy'), true);
  assert.equal(first.get('legacy').automaticConsent, undefined);
  assert.equal(await first.claimAutomationPrompt('legacy'), true);
  await first.chooseIncorporationMode('legacy', 'automatic');
  assert.equal(first.get('legacy').automaticConsent, 'v2');
  first.dispose(); otherSession.dispose(); accountB.dispose();
});

test('B: first confirmed Vinca save queues the question after review, never after a failed save', async () => {
  const native = bridge(); let claims = 0;
  const metadata = { devices: {}, get: () => ({}), patch: () => {}, claimAutomationPrompt: async () => { claims++; return claims === 1; } };
  const owner = await mountedOwner(native, 'a', undefined, metadata);
  try {
    native.emit({ temperatureC: 36.42, deviceProtocol: 'vinca2', receptionValidated: true });
    native.emit({ temperatureC: 36.43, deviceProtocol: 'vinca2', receptionValidated: true });
    owner.render().openReadingReview(1); owner.render();
    await assert.rejects(owner.render().incorporateReading(1, async () => { throw { code: 'ble-import-conflict' }; }));
    owner.render(); await flush(); assert.equal(claims, 0);
    const wait = deferred(); const save = owner.render().incorporateReading(1, () => wait.promise);
    owner.render(); await flush(); assert.equal(claims, 0);
    wait.resolve({ isoDate: '2026-11-20' }); await save;
    owner.render(); await flush(); assert.equal(claims, 0); // Second pending is still being reviewed.
    owner.card().onDismiss(); owner.render(); await flush();
    assert.equal(claims, 1); assert.equal(owner.prompt().open, true);
    owner.prompt().onClose(); assert.equal(owner.prompt(), undefined);
    await owner.render().incorporateReading(2, async () => ({ isoDate: '2026-11-20' }));
    owner.render(); await flush(); assert.equal(owner.prompt(), undefined);
  } finally { owner.cleanup(); await flush(); }
});

test('B: prompt close writes no mode, explicit buttons serialize and server errors keep it open', async () => {
  const h = hooks(); const calls = []; let closed = 0; const wait = deferred();
  const { Vinca2AutomationPrompt, Vinca2IncorporationSettings } = await loadFrontend('src/components/Vinca2Automation.jsx', {
    ...h.bindings, VINCA2_AUTOMATIC_IMPORT_BLOCKER: 'Blocked', Button: 'button', Dialog: 'dialog', DialogContent: 'content',
    DialogHeader: 'header', DialogTitle: 'title', DialogDescription: 'description',
    useThermometerMetadata: () => ({ devices: {}, chooseIncorporationMode: async (...args) => { calls.push(args); return wait.promise; } }),
  }, ['Vinca2AutomationPrompt', 'Vinca2IncorporationSettings']);
  const render = () => h.render(() => ({ props: { value: Vinca2AutomationPrompt({ deviceKey: 'v', open: true, onClose: () => closed++ }) } }));
  let tree = render(); tree.props.onOpenChange(false); assert.equal(closed, 1); assert.deepEqual(calls, []);
  const buttons = treeNodes(tree).filter(node => node.type === 'button');
  const saving = buttons[0].props.onClick(); await buttons[1].props.onClick();
  assert.deepEqual(calls, [['v', 'automatic']]);
  wait.reject(Error('offline')); await saving; tree = render();
  assert.equal(closed, 1); assert.ok(treeNodes(tree).some(node => node.props.role === 'alert'));
  h.cleanup();
});

test('automatic reception saves once without opening pending review; unknown results never retry', async () => {
  for (const uncertain of [false, true]) {
    const native = bridge();
    const now = Date.now(); native.flags.now = now;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const clock = checkedAt => ({ deviceKey: 'bound-a', deviceLocalTime: localText(checkedAt), checkedAt,
      phoneTimeZone: timeZone, phoneUtcOffsetMinutes: -new Date(checkedAt).getTimezoneOffset(), driftSeconds: 0 });
    native.api.readFemometerClock = async () => clock(now);
    const local = createFemometerLocalState(native.storage, 'a');
    local.activate('bound-a');
    local.saveClock('bound-a', { ...clock(now - 7200000), operation: 'sync', verified: true });
    const preference = { incorporationMode: 'automatic', automaticConsent: 'v2' };
    const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch: () => {} };
    let saves = 0;
    const cycle = { currentCycle: { id: 'c' }, isLoading: false, incorporateBleMeasurement: async (draft, options) => {
      saves++; options.automaticContext.assertCurrent();
      assert.equal(draft.manuallyConfirmed, undefined);
      if (uncertain) throw Error('response lost');
      return { isoDate: draft.isoDate, measurements: draft.measurements };
    } };
    const owner = await mountedOwner(native, 'a', cycle, metadata);
    try {
      const event = { temperatureC: 36.42, deviceTimestamp: localText(now - 3600000), deviceProtocol: 'vinca2', receptionValidated: true };
      native.emit(event);
      for (let i = 0; i < 6; i++) { owner.render(); await flush(); }
      assert.equal(saves, 1);
      assert.equal(owner.render().readings[0].importStatus, uncertain ? 'uncertain' : 'incorporated');
      assert.equal(owner.card().visible, uncertain);
      native.emit(event);
      for (let i = 0; i < 6; i++) { owner.render(); await flush(); }
      assert.equal(saves, 1);
      assert.equal(owner.render().readings[1].importStatus, 'pending');
    } finally { owner.cleanup(); await flush(); }
  }
});

test('clock incidents survive good reads; only a new verified sync starts a usable interval', () => {
  const local = createFemometerLocalState(memoryStorage(), 'a'); local.activate('v');
  const good = { operation: 'sync', verified: true, checkedAt: 1000, driftSeconds: 0, phoneTimeZone: 'UTC', phoneUtcOffsetMinutes: 0 };
  local.saveClock('v', good);
  local.saveClock('v', { ...good, operation: 'read', checkedAt: 2000, errorCode: 'CLOCK_FAILED' });
  local.saveClock('v', { ...good, operation: 'read', checkedAt: 3000 });
  assert.equal(local.clock('v').lastIncidentAt, 2000);
  assert.equal(local.clock('v').lastVerifiedSync.checkedAt, 1000);
  local.saveClock('v', { ...good, checkedAt: 4000 });
  assert.equal(local.clock('v').lastIncidentAt, 2000);
  assert.equal(local.clock('v').lastVerifiedSync.checkedAt, 4000);
  assert.equal(local.clock('v').lastVerifiedSync.continuityTracked, true);
});

test('remembered supported profiles request bounded extended search and propagate native disconnection', async () => {
  for (const [protocol, model, compatibility] of [['vinca2', 'BM-Vinca2', 'compatible'], ['easyhome-ebt300', 'EBT-300', 'experimental'], ['health-thermometer', null, 'experimental']]) {
    const native = bridge(); let searches = 0, state;
    native.api.getRememberedFemometer = async () => ({ remembered: true, deviceKey: 'bound-a', protocol, model, compatibility });
    native.api.scanForFemometer = async (user, expanded, remembered) => {
      assert.equal(user, 'a'); assert.equal(expanded, false); assert.equal(remembered, true); searches++;
      return [{ id: 'target', isRemembered: true }];
    };
    native.api.startFemometerTemperatureListener = async () => ({ deviceKey: 'bound-a', connectionReady: true, indicationsActive: true,
      capabilities: { protocol, model, compatibility } });
    const session = native.factory('a', next => { state = next; }, () => {});
    try {
      await session.start(); assert.equal(state.status, 'listening');
      native.emit({ status: 'disconnected', deviceKey: 'bound-a', deviceProtocol: protocol, receptionValidated: false });
      assert.notEqual(state.status, 'listening');
      await flush(); assert.equal(state.status, 'error');
      assert.equal(state.error.code, 'CONNECTION_LOST'); assert.equal(searches, 1);
    } finally { await session.dispose(); }
  }
});

test('Vinca automatic windows allow two searches, preserve healthy transport and leave manual retry available', async () => {
  for (const foundOn of [1, 2, Infinity]) {
    const native = bridge(); const timers = new Map(); let state, searches = 0;
    const modes = [];
    native.api.setTimeout = (fn, delay) => { timers.set(fn, delay); return fn; };
    native.api.clearTimeout = fn => timers.delete(fn);
    native.api.scanForFemometer = async (_user, _expanded, _remembered, limited) => {
      modes.push(limited); return ++searches >= foundOn ? [{ id: 'target', isRemembered: true }] : [];
    };
    const session = native.factory('a', next => { state = next; }, () => {});
    const tick = async () => { const [fn, delay] = [...timers][0]; assert.equal(delay, 8000); timers.delete(fn); native.flags.now += delay; fn(); await flush(); };
    try {
      await session.start(); assert.equal(searches, 1);
      await session.resume(); assert.equal(searches, 1);
      if (foundOn !== 1) await tick();
      assert.equal(searches, foundOn === 1 ? 1 : 2); assert.equal(timers.size, 0);
      assert.ok(modes.every(Boolean));
      await session.recoverReadings(); assert.equal(timers.size, 0);
      if (foundOn === Infinity) {
        assert.equal(state.recoveryExhausted, true);
        await session.start(); assert.equal(searches, 3); assert.equal(modes.at(-1), false);
        await session.suspend(); await Promise.all([session.resume(), session.resume()]);
        assert.equal(searches, 4); assert.equal(modes.at(-1), true);
        await tick(); assert.equal(searches, 5); assert.equal(timers.size, 0);
      } else {
        assert.equal(state.status, 'listening'); assert.equal(native.calls.connections, 1);
        assert.equal(native.calls.disconnects, foundOn === 1 ? 0 : 1);
      }
      assert.ok(native.calls.peakListeners <= 1);
    } finally { await session.dispose(); assert.equal(timers.size, 0); }
  }
});

test('automatic consent prepares a verified clock reference and preserves it on later connections', async () => {
  const native = bridge(); native.flags.now = Date.now() - 120000;
  const sample = () => ({ deviceKey: 'bound-a', checkedAt: native.flags.now, deviceLocalTime: localText(native.flags.now),
    phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date(native.flags.now).getTimezoneOffset() });
  native.api.readFemometerClock = async () => sample();
  native.api.syncFemometerClock = async () => { native.calls.sync++; return { ...sample(), verified: true }; };
  const preference = { incorporationMode: 'automatic', automaticConsent: 'v2' };
  const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch: () => {} };
  const owner = await mountedOwner(native, 'a', undefined, metadata);
  try {
    for (let i = 0; i < 3; i++) { owner.render(); await flush(); }
    assert.equal(native.calls.sync, 0);
    const syncAt = owner.render().clockHistory.confidenceStart.checkedAt;
    native.flags.now += 60000;
    native.emit({ status: 'disconnected' }); await flush();
    await owner.background(); await owner.background(); await owner.foreground();
    await owner.render().sessionRef.current.start(); owner.render();
    assert.equal(native.calls.sync, 0);
    assert.equal(owner.render().clockHistory.confidenceStart.checkedAt, syncAt);
    assert.ok(owner.render().clockHistory.lastValidCheck.checkedAt > syncAt);
    native.api.readFemometerClock = async () => { throw { code: 'CLOCK_INVALID_DATE' }; };
    native.flags.now += 60000;
    native.emit({ status: 'disconnected' }); await flush();
    await owner.background(); await owner.background(); await owner.foreground();
    await owner.render().sessionRef.current.start(); owner.render();
    assert.equal(native.calls.sync, 1);
    assert.equal(owner.render().clockHistory.lastVerifiedSync.checkedAt, native.flags.now);
  } finally { owner.cleanup(); await flush(); }
});

test('a fixed connection clock preserves confidence without interrupting reception or writing time', async () => {
  const native = bridge(); native.flags.now = Date.now();
  let snapshot = native.flags.now;
  const listen = native.api.startFemometerTemperatureListener;
  native.api.startFemometerTemperatureListener = async (...args) => { snapshot = native.flags.now; return listen(...args); };
  native.api.readFemometerClock = async () => ({ deviceKey: 'bound-a', deviceLocalTime: localText(snapshot), checkedAt: native.flags.now,
    phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date(native.flags.now).getTimezoneOffset() });
  const owner = await mountedOwner(native);
  try {
    native.flags.now += 180000;
    const session = owner.render().sessionRef.current;
    await session.readClock();
    assert.equal(owner.render().sessionState.clockError, null);
    assert.equal(owner.render().sessionState.clockResult.snapshot, true);
    assert.equal(owner.render().clockHistory.lastIncidentAt, null);
    await session.checkAutomaticClock();
    assert.equal(native.calls.connections, 1); assert.equal(native.calls.sync, 0);
    assert.equal(owner.render().sessionState.clockError, null);
    assert.equal(owner.render().sessionState.clockResult.snapshot, true);
    assert.ok(owner.render().clockHistory.staleCheck);
    // Only a natural loss creates a new connection; never interrupt reception for CTS.
    native.emit({ status: 'disconnected' }); await flush();
    native.flags.now += 60000;
    await owner.background(); await owner.foreground();
    await session.start(); owner.render();
    assert.equal(owner.render().clockHistory.staleCheck, null);
    assert.equal(owner.render().clockHistory.state, 'read_correct');
    assert.equal(native.calls.sync, 0);
  } finally { owner.cleanup(); await flush(); }
});

test('an interrupted unanswered automation question is recovered, but v2 consent is respected', async () => {
  const native = bridge(); let claims = 0;
  const preference = { automationPrompt: 'shown', automationPromptVersion: 'v2' };
  const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch: () => {}, claimAutomationPrompt: async () => { claims++; return true; } };
  let owner = await mountedOwner(native, 'a', undefined, metadata);
  for (let i = 0; i < 3; i++) { owner.render(); await flush(); } assert.ok(owner.prompt());
  owner.cleanup(); await flush(); owner = await mountedOwner(native, 'a', undefined, metadata);
  for (let i = 0; i < 3; i++) { owner.render(); await flush(); } assert.ok(owner.prompt());
  owner.prompt().onClose(); assert.equal(owner.prompt(), undefined);
  owner.navigate('records'); for (let i = 0; i < 3; i++) { owner.render(); await flush(); } assert.ok(owner.prompt());
  owner.cleanup(); await flush();
  metadata.devices = { 'bound-a': { incorporationMode: 'automatic', automaticConsent: 'v2' } };
  metadata.get = () => metadata.devices['bound-a'];
  const before = claims; owner = await mountedOwner(native, 'a', undefined, metadata);
  owner.render(); await flush(); assert.equal(owner.prompt(), undefined); assert.equal(claims, before);
  owner.cleanup(); await flush();
});

test('Add opens without stopping reception; search interrupts it and leaving closes the assistant', async () => {
  const h = await devicesFixture({ remembered: true, status: 'listening', deviceKey: 'v', devices: [{ id: 'stale' }], bindings: [{ deviceKey: 'v', model: 'BM-Vinca2' }] });
  let stopped = 0, searches = 0, cancelled = 0;
  h.ble.sessionRef.current = {
    beginChange: async () => { stopped++; h.ble.sessionState = { ...h.ble.sessionState, status: 'stopped', changingDevice: true, devices: [] }; return true; },
    scan: async () => { searches++; },
    cancelChange: async () => { cancelled++; h.ble.sessionState = { ...h.ble.sessionState, status: 'listening', changingDevice: false }; },
  };
  await h.button('+ Añadir').props.onClick();
  assert.equal(stopped, 0); assert.match(JSON.stringify(h.render()), /Escuchando temperaturas/);
  assert.ok(treeNodes(h.render()).find(node => node.props['aria-label'] === 'Cerrar adición'));
  assert.equal(h.button('Buscar termómetros').props.disabled, false);
  await h.button('Buscar termómetros').props.onClick();
  assert.equal(stopped, 1); assert.equal(searches, 1);
  h.cleanup(); await flush(); assert.equal(cancelled, 1); assert.equal(h.ble.sessionState.changingDevice, false);
});


test('Vinca minimal transport provenance survives pending recovery but does not identify a measurement', async () => {
  const native = bridge(); let delivered;
  const session = native.factory('a', () => {}, event => { delivered = event; });
  try {
    await session.start();
    const transport = { sessionId: 'opaque', connectedAt: 1, indicationsReadyAt: 2, receivedAt: 900000 };
    native.emit({ temperatureC: 35.77, transport });
    assert.deepEqual(delivered.transport, { ...transport, reconnect: false });
    const storage = memoryStorage();
    createFemometerLocalState(storage, 'a').saveReadings([{ ...delivered, deviceKey: 'v', localId: 'local-review',
      importStatus: 'pending', rawHex: 'must-not-persist', normalized: normalizeBleMeasurement(delivered) }]);
    const recovered = createFemometerLocalState(storage, 'a').recover()[0];
    assert.deepEqual(recovered.transport, delivered.transport);
    assert.equal(recovered.rawHex, undefined);
    assert.equal(createFemometerLocalState(storage, 'b').recover().length, 0);
    native.emit({ status: 'disconnected' }); await flush(); native.flags.now = 900001;
    await session.recoverReadings();
    native.emit({ temperatureC: 35.77, transport: { ...transport, sessionId: 'opaque-next' } });
    assert.equal(delivered.transport.reconnect, true);
  } finally { await session.dispose(); }
});

test('native continuous policy is connected to setup while preserving operation deadlines and proprietary subscription', async () => {
  const source = await fs.readFile(new URL('../android/app/src/main/java/com/fertiliapp/fertiliapp/FemometerGattSession.java', import.meta.url), 'utf8');
  const timeout = source.slice(source.indexOf('private void scheduleTemperatureListenerTimeout()'), source.indexOf('private void clearTemperatureListenerTimeout()'));
  assert.match(timeout, /if \(Vinca2Reception.continuous\(temperatureProfileValidated, experimentalReception\)\) return;/);
  assert.match(timeout, /TEMPERATURE_LISTENER_TIMEOUT_MS/);
  assert.match(source, /scheduleTemperatureSetupTimeout\(\)/);
  assert.match(source, /CONNECT_TIMEOUT_MS \+ DISCOVER_TIMEOUT_MS/);
  assert.match(source, /VINCA_INDICATION_UUID/);
  assert.match(source, /vincaReception.accept\(value,/);
});


test('Vinca dates 2024/2099/invalid/missing remain durable and require an explicit manual destination', async () => {
  for (const deviceTimestamp of ['2024-02-03T06:38:27', '2099-11-21T14:04:00', null]) {
    const normalized = normalizeBleMeasurement({ temperatureC: 35.79, deviceTimestamp,
      deviceTimestampReliability: 'invalid', deviceModel: 'BM-Vinca2', deviceProtocol: 'vinca2',
      deviceKey: 'bound-a', receptionValidated: true });
    const h = await uncertainEditorFixture({ normalized, deviceTimestamp, draft: undefined,
      importStatus: 'pending', attempt: undefined });
    try {
      assert.equal(h.render().draft.isoDate, ''); assert.equal(h.render().draft.time, '');
      const storage = memoryStorage(); const local = createFemometerLocalState(storage, 'a');
      local.saveReadings([{ ...h.reading, deviceKey: 'bound-a', receivedOrder: 1 }]);
      assert.deepEqual(createFemometerLocalState(storage, 'a').recover()[0].normalized, normalized);
      assert.equal(createFemometerLocalState(storage, 'other-account').recover().length, 0);
      h.cycle('chosen-cycle'); h.render().change({ isoDate: '2026-11-20', time: '08:15' });
      await h.render().confirm();
      assert.equal(h.payloads[0].cycleId, 'chosen-cycle');
      assert.equal(h.payloads[0].measurements[0].temperature, 35.79);
      assert.equal(h.payloads[0].measurements[0].device_timestamp, deviceTimestamp);
      assert.equal(h.payloads[0].measurements[0].confirmed_timestamp, '2026-11-20T08:15:00');
    } finally { h.cleanup(); }
  }
});

test('Vinca clock 2024 and 2099 is corrected once and verified without closing reception', async () => {
  for (const date of ['2024-02-03T06:38:27', '2099-11-21T14:04:00']) {
    const h = integratedSession(); h.flags.now = new Date(2026, 10, 21, 14, 5).getTime();
    h.api.readFemometerClock = async () => ({ deviceKey: 'bound-a', deviceLocalTime: date });
    h.api.syncFemometerClock = async () => { h.calls.sync++; return { deviceKey: 'bound-a', deviceLocalTime: localText(h.flags.now), verified: true }; };
    try {
      await h.session.start(); await h.session.resume();
      assert.equal(h.calls.sync, 1); assert.equal(h.state().clockResult.verified, true);
      assert.equal(h.calls.disconnects, 0);
      h.emit({ temperatureC: 35.79, deviceTimestamp: date }); assert.equal(h.temperatures.length, 1);
    } finally { await h.session.dispose(); }
  }
});

test('a skipped posterior clock operation cannot reuse an earlier result', async () => {
  const h = integratedSession();
  try {
    await h.session.start(); await h.session.stop();
    await assert.rejects(h.session.checkAutomaticClock(), error => error.code === 'ble-auto-review');
  } finally { await h.session.dispose(); }
});

// Block A: bounded recovery, cancellation and serialized critical operations.
test('automatic retry is retained during a critical save and cancelled by lifecycle, binding or account', async () => {
  for (const action of ['unblock', 'suspend', 'stop', 'beginChange', 'unlink', 'account', 'dispose']) {
    const native = bridge(); const timers = new Map(); let searches = 0;
    native.api.setTimeout = (fn, delay) => { timers.set(fn, delay); return fn; };
    native.api.clearTimeout = fn => timers.delete(fn);
    native.api.scanForFemometer = async () => { searches++; return []; };
    native.api.forgetFemometer = async () => ({ remembered: false, bindings: [] });
    const session = native.factory('a', () => {}, () => {});
    await session.start(); assert.equal(searches, 1); assert.equal(timers.size, 1);
    session.setRecoveryBlocked(true);
    const [callback, delay] = [...timers][0]; timers.delete(callback); assert.equal(delay, 8000);
    callback(); await flush(); assert.equal(searches, 1); assert.equal(timers.size, 0);
    let replacement;
    if (action === 'unblock') {
      session.setRecoveryBlocked(false); await flush(); assert.equal(searches, 2);
    } else {
      if (action === 'account') replacement = native.factory('b', () => {}, () => {});
      else await session[action]();
      session.setRecoveryBlocked(false); await flush(); assert.equal(searches, 1);
    }
    await session.dispose(); await replacement?.dispose(); assert.equal(timers.size, 0);
  }
});

test('denied permissions, disabled Bluetooth and failed GATT cleanup never arm another search', async () => {
  for (const code of ['PERMISSION_NOT_GRANTED', 'BLUETOOTH_DISABLED', 'BLUETOOTH_UNAVAILABLE', 'GATT_CLOSE_FAILED']) {
    const native = bridge(); const timers = new Map(); let searches = 0, state;
    native.api.setTimeout = (fn, delay) => { timers.set(fn, delay); return fn; };
    native.api.clearTimeout = fn => timers.delete(fn);
    native.api.scanForFemometer = async () => { searches++; throw { code }; };
    const session = native.factory('a', next => { state = next; }, () => {});
    await session.start(); await session.resume(); await session.recoverReadings();
    assert.equal(searches, 1); assert.equal(timers.size, 0); assert.equal(state.recoveryReason, 'unrecoverable_error');
    await session.dispose();
  }
});

test('foreground recovery waits for a critical save and repeated active events do not duplicate it', async () => {
  const native = bridge(); let searches = 0;
  const scan = native.api.scanForFemometer;
  native.api.scanForFemometer = async (...args) => { searches++; return scan(...args); };
  const session = native.factory('a', () => {}, () => {});
  await session.start(); await session.suspend(); session.setRecoveryBlocked(true);
  await Promise.all([session.resume(), session.resume()]); assert.equal(searches, 1);
  session.setRecoveryBlocked(false); await flush(); assert.equal(searches, 2);
  assert.equal(native.calls.peakListeners, 1); await session.dispose();
});

// Block B: presentation does not change durable pending/saving/uncertain states.
test('automatic processing and saving exclude only the active row from manual review and survive navigation', async () => {
  for (const outcome of ['success', 'uncertain', 'clock', 'historical', 'consent', 'no-cycle']) {
    const native = bridge(); const now = Date.now(); native.flags.now = now;
    const clock = at => ({ deviceKey: 'bound-a', deviceLocalTime: localText(at), checkedAt: at,
      phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date(at).getTimezoneOffset(), driftSeconds: 0 });
    native.api.readFemometerClock = async () => clock(now);
    const local = createFemometerLocalState(native.storage, 'a'); local.activate('bound-a');
    local.saveClock('bound-a', { ...clock(now - 7200000), operation: 'sync', verified: true });
    const preference = { incorporationMode: 'manual' };
    const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch() {} };
    const saving = deferred(); let saves = 0;
    const cycle = { currentCycle: outcome === 'no-cycle' ? null : { id: 'c' }, isLoading: false,
      incorporateBleMeasurement: async () => { saves++; return saving.promise; } };
    const owner = await mountedOwner(native, 'a', cycle, metadata);
    try {
      native.emit({ temperatureC: 36.1, deviceTimestamp: localText(now - 4000000), deviceProtocol: 'vinca2', receptionValidated: true });
      assert.equal(owner.render().pendingCount, 1);
      preference.incorporationMode = 'automatic'; preference.automaticConsent = outcome === 'consent' ? undefined : 'v2';
      if (outcome === 'clock') native.api.readFemometerClock = async () => { throw { code: 'CLOCK_READ_TIMEOUT' }; };
      native.emit({ temperatureC: 36.5, deviceTimestamp: outcome === 'historical' ? '2024-01-01T08:00:00' : localText(now - 3600000), deviceProtocol: 'vinca2', receptionValidated: true });
      if (outcome !== 'consent') assert.equal(owner.render().pendingCount, 1);
      for (let i = 0; i < 4; i++) { owner.render(); await flush(); }
      if (['success', 'uncertain'].includes(outcome)) {
        assert.equal(saves, 1); assert.equal(owner.render().pendingCount, 1); assert.equal(owner.render().processingCount, 1);
        const durable = createFemometerLocalState(native.storage, 'a').recover();
        assert.equal(durable.length, 2); assert.equal(durable[1].importStatus, 'uncertain');
        assert.equal(durable[1].automaticProcessing, undefined);
        for (const route of ['chart', 'settings', 'records']) { owner.navigate(route); assert.equal(owner.render().pendingCount, 1); }
        if (outcome === 'uncertain') saving.reject(Error('lost response'));
        else saving.resolve({ isoDate: '2026-11-23', measurements: [{ time: '08:00' }] });
        for (let i = 0; i < 3; i++) { owner.render(); await flush(); }
        assert.equal(owner.render().pendingCount, outcome === 'success' ? 1 : 2);
        assert.equal(owner.render().processingCount, 0);
        owner.render().openReadingReview(1); assert.equal(owner.card().selected.uiId, 1);
      } else {
        assert.equal(saves, 0); assert.equal(owner.render().pendingCount, 2); assert.equal(owner.render().processingCount, 0);
      }
      await owner.changeAccount('b'); assert.equal(owner.render().pendingCount, 0);
      await owner.changeAccount('a');
      assert.equal(owner.render().pendingCount, outcome === 'success' ? 1 : 2);
      assert.equal(owner.render().processingCount, 0);
      assert.equal(saves, ['success', 'uncertain'].includes(outcome) ? 1 : 0);
    } finally { owner.cleanup(); await flush(); }
  }
});

test('a queued automatic row becomes reviewable after 30 seconds and old eligibility never hides restored work', async () => {
  const native = bridge(); const clock = { now: Date.now(), delays: new Map() };
  clock.Date = class extends Date { static now() { return clock.now; } };
  native.flags.now = clock.now;
  const preference = { incorporationMode: 'automatic', automaticConsent: 'v2' };
  const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch() {} };
  const owner = await mountedOwner(native, 'a', { isLoading: true }, metadata, clock);
  try {
    native.emit({ temperatureC: 36.4, deviceTimestamp: localText(clock.now - 60000), deviceProtocol: 'vinca2', receptionValidated: true });
    assert.equal(owner.render().pendingCount, 0); assert.equal(owner.render().processingCount, 1);
    const [callback, delay] = [...clock.delays][0]; assert.equal(delay, 30000);
    clock.now += delay; owner.timers.delete(callback); clock.delays.delete(callback); callback();
    assert.equal(owner.render().pendingCount, 1); assert.equal(owner.render().processingCount, 0);
    assert.equal(owner.render().readings[0].automaticChecked, true);
    native.emit({ temperatureC: 36.6, deviceTimestamp: localText(clock.now - 60000), deviceProtocol: 'vinca2', receptionValidated: true });
    owner.render(); await owner.changeAccount('b'); await owner.changeAccount('a');
    assert.equal(owner.render().pendingCount, 2); assert.equal(owner.render().processingCount, 0);
  } finally { owner.cleanup(); await flush(); }
});

test('a stalled automatic save becomes accessible after 120 seconds without unlocking or repeating the write', async () => {
  const native = bridge(); const clock = { now: Date.now(), delays: new Map() };
  clock.Date = class extends Date { static now() { return clock.now; } };
  native.flags.now = clock.now;
  const sample = at => ({ deviceKey: 'bound-a', deviceLocalTime: localText(at), checkedAt: at, driftSeconds: 0,
    phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date(at).getTimezoneOffset() });
  native.api.readFemometerClock = async () => sample(clock.now);
  const local = createFemometerLocalState(native.storage, 'a'); local.activate('bound-a');
  local.saveClock('bound-a', { ...sample(clock.now - 7200000), operation: 'sync', verified: true });
  const preference = { incorporationMode: 'automatic', automaticConsent: 'v2' };
  const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch() {} };
  const saving = deferred(); let saves = 0;
  const owner = await mountedOwner(native, 'a', { currentCycle: { id: 'c' }, isLoading: false,
    incorporateBleMeasurement: () => { saves++; return saving.promise; } }, metadata, clock);
  try {
    native.emit({ temperatureC: 36.4, deviceTimestamp: localText(clock.now - 3600000), deviceProtocol: 'vinca2', receptionValidated: true });
    for (let i = 0; i < 4; i++) { owner.render(); await flush(); }
    assert.equal(owner.render().pendingCount, 0); assert.equal(saves, 1);
    const [callback, delay] = [...clock.delays][0]; assert.equal(delay, 120000);
    clock.now += delay; owner.timers.delete(callback); clock.delays.delete(callback); callback();
    assert.equal(owner.render().pendingCount, 1); assert.equal(owner.render().processingCount, 0);
    assert.equal(owner.render().readings[0].importStatus, 'saving');
    await assert.rejects(owner.render().incorporateReading(1, () => { saves++; }), /Espera|espera/);
    assert.equal(saves, 1);
    saving.resolve({ isoDate: '2026-11-23', measurements: [{ time: '08:00' }] });
    await flush(); assert.equal(owner.render().pendingCount, 0);
    assert.equal(owner.render().readings[0].importStatus, 'incorporated');
  } finally { owner.cleanup(); await flush(); }
});


test('lifecycle registration failures retain the exact reason without claiming a foreground recovery', async () => {
  for (const failure of ['lifecycleReject', 'lifecycleThrow']) {
    const native = bridge(); native.flags.found = false;
    native.flags[failure] = { code: 'UNIMPLEMENTED', message: 'App.addListener unavailable in this test' };
    const owner = await mountedOwner(native);
    try {
      const state = owner.render();
      assert.equal(state.lifecycleStatus, 'unavailable');
      assert.deepEqual(state.lifecycleError, native.flags[failure]);
      assert.equal(owner.lifecycle.size, 0);
      assert.equal(state.sessionState.foreground, undefined);
      await owner.background(); await owner.foreground();
      assert.equal(owner.render().sessionState.foreground, undefined);
      assert.equal(native.calls.connections, 0);
      // Account replacement registers afresh and does not retain the old failure.
      delete native.flags[failure];
      await owner.changeAccount('b');
      assert.equal(owner.render().lifecycleStatus, 'registered');
      assert.equal(owner.render().lifecycleError, null);
      assert.equal(owner.lifecycle.size, 1);
    } finally { owner.cleanup(); await flush(); }
    assert.equal(owner.lifecycle.size, 0);
  }
});

test('late lifecycle registration is removed after unmount and cannot resume the old session', async () => {
  const native = bridge(); native.flags.lifecycleWait = deferred();
  const owner = await mountedOwner(native);
  assert.equal(owner.render().lifecycleStatus, 'registering');
  owner.cleanup(); await flush();
  const connections = native.calls.connections;
  native.flags.lifecycleWait.resolve(); await flush();
  assert.equal(owner.lifecycle.size, 0);
  await owner.foreground();
  assert.equal(native.calls.connections, connections);
});

test('native Android resume leaves exhausted search policy to BLE-11', async () => {
  const native = bridge(); const timers = new Map(); let searches = 0;
  native.api.setTimeout = (fn, delay) => { timers.set(fn, delay); return fn; };
  native.api.clearTimeout = fn => timers.delete(fn);
  native.api.scanForFemometer = async (_user, _expanded, _remembered, limited) => {
    assert.equal(limited, true); searches++; return [];
  };
  const owner = await mountedOwner(native);
  const tick = async () => {
    assert.equal(timers.size, 1);
    const [fn, delay] = [...timers][0]; assert.equal(delay, 8000);
    timers.delete(fn); fn(); await flush();
  };
  try {
    assert.equal(owner.render().lifecycleStatus, 'registered');
    assert.equal(searches, 1); await tick(); assert.equal(searches, 2);
    assert.equal(owner.render().sessionState.recoveryExhausted, true);
    owner.navigate('devices'); await owner.foreground();
    assert.equal(searches, 2);
    await owner.background(); await owner.foreground();
    assert.equal(searches, 2);
    await Promise.all([owner.foreground(), owner.foreground()]);
    owner.navigate('records'); assert.equal(searches, 2);
    assert.equal(timers.size, 0);
    await owner.foreground(); assert.equal(searches, 2);
    assert.equal(owner.render().sessionState.recoveryExhausted, true);
  } finally { owner.cleanup(); await flush(); }
  assert.equal(timers.size, 0); assert.equal(owner.lifecycle.size, 0);
});


const nativeReading = (id, extra = {}) => ({ nativeDeliveryId: id, nativeUserId: 'a', deviceKey: 'bound-a',
  deviceModel: 'BM-Vinca2', deviceProtocol: 'vinca2', receptionValidated: true,
  temperatureC: 36.45, temperatureUnit: 'celsius', deviceTimestamp: '2026-11-25T07:30:10',
  receivedAt: '2026-11-25T07:33:00', ...extra });

test('BLE-10: native background leaves the same connection, restores multiple deliveries and acknowledges individually', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    await owner.background(); await owner.background();
    assert.equal(native.calls.disconnects, 0);
    native.flags.nativePending = [nativeReading('one'), nativeReading('two', { deviceTimestamp: '2026-11-25T07:31:10' })];
    assert.equal(owner.render().readings.length, 0);
    await owner.foreground();
    assert.equal(native.calls.connections, 1);
    assert.equal(native.calls.disconnects, 0);
    assert.equal(native.calls.peakListeners, 1);
    assert.equal(owner.render().readings.length, 2);
    assert.deepEqual(native.calls.acks, ['one', 'two']);
    assert.equal(createFemometerLocalState(native.storage, 'a').recover().length, 2);
    await owner.foreground();
    assert.equal(owner.render().readings.length, 2);
  } finally { owner.cleanup(); await flush(); }
});

test('BLE-10: event plus queue recovery has one pending; failed ACK survives reload even after incorporation', async () => {
  const native = bridge(); native.flags.ackFails = true;
  const event = nativeReading('delivery'); native.flags.nativePending = [event];
  let owner = await mountedOwner(native);
  try {
    native.emit(event); await flush();
    assert.equal(owner.render().readings.length, 1);
    await owner.render().incorporateReading(owner.render().readings[0].uiId, async () => ({}));
    assert.equal(createFemometerLocalState(native.storage, 'a').recover().length, 0);
    owner.cleanup(); await flush();
    native.flags.ackFails = false;
    owner = await mountedOwner(native);
    assert.equal(owner.render().readings.length, 0);
    assert.deepEqual(native.calls.acks, ['delivery']);
    assert.equal(native.flags.nativePending.length, 0);
  } finally { owner.cleanup(); await flush(); }
});

test('BLE-10: local persistence failure never ACKs or exposes an unsafe pending, retry conserves it', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  const write = native.storage.setItem;
  try {
    const event = nativeReading('storage-failure'); native.flags.nativePending = [event];
    native.storage.setItem = () => { throw Error('quota'); };
    native.emit(event); await flush();
    assert.equal(owner.render().readings.length, 0);
    assert.equal(native.calls.acks, undefined);
    assert.equal(native.flags.nativePending.length, 1);
    native.storage.setItem = write;
    await owner.foreground();
    assert.equal(owner.render().readings.length, 1);
    assert.deepEqual(native.calls.acks, ['storage-failure']);
  } finally { native.storage.setItem = write; owner.cleanup(); await flush(); }
});

test('BLE-10: native deliveries retain account/device and invalid dates; interrupted Firestore is never retried', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    native.flags.nativePending = [nativeReading('other-account', { nativeUserId: 'b' }),
      nativeReading('old-device', { deviceKey: 'old', deviceTimestamp: null, deviceTimestampReliability: 'invalid' }),
      nativeReading('uncertain')];
    await owner.foreground();
    assert.deepEqual(native.calls.acks, ['old-device', 'uncertain']);
    assert.deepEqual(owner.render().readings.map(r => r.deviceKey), ['old', 'bound-a']);
    assert.equal(owner.render().readings[0].normalized.device_timestamp, null);
    const row = owner.render().readings[1];
    await assert.rejects(owner.render().incorporateReading(row.uiId, async () => { throw Error('response lost'); }));
    assert.equal(owner.render().readings[1].importStatus, 'uncertain');
    native.emit(nativeReading('uncertain')); await flush();
    await owner.foreground();
    assert.equal(owner.render().readings.length, 2);
    assert.equal(owner.render().readings[1].importStatus, 'uncertain');
    const restored = createFemometerLocalState(native.storage, 'a').recover();
    assert.equal(restored.find(r => r.nativeDeliveryId === 'uncertain').importStatus, 'uncertain');
    assert.equal(createFemometerLocalState(native.storage, 'b').recover().length, 0);
  } finally { owner.cleanup(); await flush(); }
});

test('BLE-10: expired native connection recovers queued temperature without scanning or claiming connected', async () => {
  const native = bridge(); const owner = await mountedOwner(native);
  try {
    await owner.background();
    native.flags.nativePending = [nativeReading('expired')];
    await native.api.disconnectFemometer(); // Native expiry; deliberately no delivered JS terminal event.
    await owner.foreground();
    assert.equal(owner.render().sessionState.status, 'stopped');
    assert.equal(owner.render().sessionState.listenerResult, null);
    assert.equal(native.calls.connections, 1);
    assert.equal(owner.render().readings.length, 1);
  } finally { owner.cleanup(); await flush(); }
});

test('BLE-10: rebuilt interface adopts ready native GATT without another connection or setup', async () => {
  const native = bridge(); let state;
  native.api.getFemometerReceptionState = async () => ({ visible: true, connectionReady: true, deviceKey: 'bound-a',
    listenerResult: { deviceKey: 'bound-a', connectionReady: true, indicationsActive: true, capabilities: { protocol: 'vinca2', model: 'BM-Vinca2', compatibility: 'compatible' } } });
  native.api.getPendingFemometerTemperatures = async () => ({ readings: [] });
  const session = native.factory('a', next => { state = next; }, () => {});
  try {
    await Promise.all([session.reconcileNative(true), session.reconcileNative()]);
    assert.equal(state.status, 'listening');
    assert.equal(native.calls.connections, 0);
    assert.equal(native.calls.clock, 0);
    assert.equal(native.calls.peakListeners, 1);
  } finally { await session.dispose(); }
});

test('BLE-10: late native state cannot restore Connected after suspension', async () => {
  const native = bridge(); const wait = deferred(); let state;
  native.api.getFemometerReceptionState = async () => wait.promise;
  native.api.getPendingFemometerTemperatures = async () => ({ readings: [] });
  const session = native.factory('a', next => { state = next; }, () => {});
  const reconcile = session.reconcileNative(true); await flush();
  await session.suspend();
  wait.resolve({ visible: true, connectionReady: true, deviceKey: 'bound-a', listenerResult: { connectionReady: true, indicationsActive: true } });
  await reconcile;
  assert.notEqual(state.status, 'listening');
  assert.equal(native.calls.connections, 0);
  await session.dispose();
  assert.equal(native.calls.listeners, 0);
});


test('BLE-10: restored GATT cannot invent clock confidence or forget a fixed same-session snapshot', async () => {
  for (const hasEvidence of [false, true]) {
    const native = bridge(); native.flags.now = 120000; let state;
    const local = createFemometerLocalState(native.storage, 'a'); local.activate('bound-a');
    if (hasEvidence) local.saveClock('bound-a', { deviceKey: 'bound-a', connectedAt: 5000, phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date(120000).getTimezoneOffset(), operation: 'read', checkedAt: 10000, deviceLocalTime: '2026-11-25T07:30:00', driftSeconds: 0 });
    native.api.getFemometerReceptionState = async () => ({ visible: true, connectionReady: true, deviceKey: 'bound-a',
      listenerResult: { connectedAt: 5000, connectionReady: true, indicationsActive: true, deviceKey: 'bound-a',
        capabilities: { protocol: 'vinca2', compatibility: 'compatible', model: 'BM-Vinca2', clockRead: true } } });
    native.api.getPendingFemometerTemperatures = async () => ({ readings: [] });
    native.api.readFemometerClock = async () => ({ deviceLocalTime: '2026-11-25T07:30:00' });
    const session = native.factory('a', next => { state = next; }, () => {}, local);
    try {
      await session.reconcileNative(true);
      if (!hasEvidence) await assert.rejects(session.checkAutomaticClock(), { code: 'ble-auto-review' });
      else { await session.checkAutomaticClock(); assert.equal(state.clockError, null); assert.equal(state.clockResult.snapshot, true); }
      assert.equal(native.calls.connections, 0); assert.equal(native.calls.sync, 0);
    } finally { await session.dispose(); }
  }
});


test('BLE-12: initial attributed clock accepts both physical takes and delayed calendar days', async () => {
  const { assessVinca2AutomaticDate } = await import('../src/lib/bleMeasurements.js');
  const at = value => Date.parse(`${value}+01:00`);
  const initial = { deviceKey: 'v', connectedAt: at('2026-11-25T22:59:50'), checkedAt: at('2026-11-25T22:59:50'),
    operation: 'read', driftSeconds: -6, deviceLocalTime: '2026-11-25T22:59:44', phoneTimeZone: 'Europe/Madrid', phoneUtcOffsetMinutes: 60 };
  const history = updateFemometerClockHistory(null, initial);
  const fixed = updateFemometerClockHistory(history, { ...initial, snapshot: true });
  const decide = (date, clockHistory = fixed, nowMs = at('2026-11-25T23:03:08'), extra = {}) => assessVinca2AutomaticDate(
    normalizeBleMeasurement({ temperatureC: date.endsWith('22:58:31') ? 35.94 : 36.10, deviceTimestamp: date,
      deviceModel: 'BM-Vinca2', deviceProtocol: 'vinca2', deviceKey: 'v', receptionValidated: true }),
    { deviceKey: 'v', connectedAt: initial.connectedAt, timeZone: 'Europe/Madrid', nowMs, clockHistory, ...extra });
  for (const date of ['2026-11-25T22:58:31', '2026-11-25T23:01:13']) assert.equal(decide(date).status, 'ready');
  const evening = { ...initial, connectedAt: at('2026-11-25T21:00:00'), checkedAt: at('2026-11-25T21:00:00') };
  for (const date of ['2026-11-25T07:00:00', '2026-11-24T07:00:00'])
    assert.equal(decide(date, updateFemometerClockHistory(null, evening), evening.checkedAt, { connectedAt: evening.connectedAt }).status, 'ready');
  const redundant = updateFemometerClockHistory(fixed, { ...initial, operation: 'sync', verified: true, checkedAt: at('2026-11-25T23:00:00'), driftSeconds: 0 });
  assert.equal(redundant.confidenceStart.checkedAt, initial.checkedAt);
  assert.equal(decide('2026-11-25T22:58:31', redundant).status, 'ready');
  const bad = updateFemometerClockHistory(null, { ...initial, driftSeconds: -3600 });
  const corrected = updateFemometerClockHistory(bad, { ...initial, operation: 'sync', verified: true, checkedAt: at('2026-11-25T23:00:00'), driftSeconds: 0 });
  assert.equal(decide('2026-11-25T22:58:31', corrected).reason, 'measurement-before-clock-sync');
  for (const patch of [{ connectedAt: null }, { deviceKey: 'other' }])
    assert.equal(decide('2026-11-25T22:58:31', updateFemometerClockHistory(null, { ...initial, ...patch })).status, 'review');
  assert.equal(decide('2026-11-25T22:58:31', null).status, 'review');
  assert.equal(decide('2026-11-25T22:58:31', fixed, undefined, { connectedAt: initial.connectedAt + 1 }).status, 'review');
  for (const date of ['2026-11-26T07:00:00', '2026-11-23T07:00:00', '2026-11-31T07:00:00']) assert.equal(decide(date).status, 'review');
  for (const errorCode of ['CLOCK_FAILED', 'CLOCK_PENDING'])
    assert.equal(decide('2026-11-25T22:58:31', updateFemometerClockHistory(fixed, { ...initial, checkedAt: initial.checkedAt + 1, errorCode })).status, 'review');
  assert.equal(decide('2026-11-25T22:58:31', fixed, undefined, { timeZone: 'UTC' }).status, 'review');
});


test('BLE-12: fixed initial clock survives redundant sync, saves once, and rechecks live trust', async () => {
  for (const invalidate of [false, true]) {
    const native = bridge(); const connected = Date.now() - 240000; native.flags.now = connected;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const sample = at => ({ deviceKey: 'bound-a', checkedAt: native.flags.now, deviceLocalTime: localText(at),
      phoneTimeZone: zone, phoneUtcOffsetMinutes: -new Date(at).getTimezoneOffset() });
    native.api.readFemometerClock = async () => sample(connected - 6000);
    native.api.syncFemometerClock = async () => ({ ...sample(native.flags.now), verified: true });
    const preference = { incorporationMode: 'automatic', automaticConsent: 'v2' };
    const metadata = { devices: { 'bound-a': preference }, get: () => preference, patch: () => {} };
    let owner, saves = 0;
    const cycle = { currentCycle: { id: 'c' }, isLoading: false, incorporateBleMeasurement: async (draft, { automaticContext }) => {
      automaticContext.assertCurrent();
      if (invalidate) {
        native.flags.now++;
        native.api.readFemometerClock = async () => { throw { code: 'CLOCK_READ_TIMEOUT' }; };
        await owner.render().sessionRef.current.readClock();
        assert.throws(() => automaticContext.assertCurrent(), { code: 'ble-auto-review' });
        const { prepareAutomaticBleDraft } = await import('../src/lib/bleMeasurements.js');
        assert.throws(() => prepareAutomaticBleDraft(draft.measurements[0], automaticContext), { code: 'ble-auto-review' });
        throw Object.assign(new Error('clock invalidated before write'), { code: 'ble-auto-review' });
      }
      saves++;
      return { isoDate: draft.isoDate, measurements: draft.measurements };
    } };
    owner = await mountedOwner(native, 'a', cycle, metadata);
    try {
      native.flags.now += 10000;
      await owner.render().sessionRef.current.syncClock();
      native.flags.now = Date.now();
      const first = { temperatureC: 35.94, deviceTimestamp: localText(connected - 79000), deviceProtocol: 'vinca2', receptionValidated: true };
      native.emit(first);
      for (let i = 0; i < 8; i++) { owner.render(); await flush(); }
      assert.equal(saves, invalidate ? 0 : 1);
      assert.equal(owner.render().readings[0].importStatus, invalidate ? 'pending' : 'incorporated');
      if (!invalidate) {
        native.emit({ ...first, temperatureC: 36.10, deviceTimestamp: localText(connected + 83000) });
        for (let i = 0; i < 8; i++) { owner.render(); await flush(); }
        assert.equal(saves, 2);
        assert.equal(owner.render().sessionState.clockError, null);
        assert.equal(owner.render().clockHistory.confidenceStart.checkedAt, connected);
      }
      native.emit(first);
      for (let i = 0; i < 8; i++) { owner.render(); await flush(); }
      assert.equal(saves, invalidate ? 0 : 2);
      assert.equal(native.calls.connections, 1);
    } finally { owner.cleanup(); await flush(); }
  }
});
