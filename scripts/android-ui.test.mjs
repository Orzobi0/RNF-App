import test from 'node:test';
import assert from 'node:assert/strict';
import { isFemometerPrototypeEnabled } from '../src/lib/appFeatures.js';
import { createFemometerSessionManager } from '../src/lib/femometerSession.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const sessionFixture = (overrides = {}) => {
  const calls = [];
  const states = [];
  const readings = [];
  let event;
  const api = {
    getRememberedFemometer: async uid => { calls.push(['saved', uid]); return { remembered: true }; },
    scanForFemometer: async uid => { calls.push(['scan', uid]); return [{ id: 'other' }, { id: 'saved', isRemembered: true }]; },
    requestBluetoothPermissions: async () => { calls.push(['request']); },
    addFemometerTemperatureListener: async callback => {
      calls.push(['subscribe']); event = callback;
      return { remove: async () => calls.push(['remove']) };
    },
    startFemometerTemperatureListener: async id => { calls.push(['listen', id]); return { timeoutSeconds: 360 }; },
    disconnectFemometer: async () => { calls.push(['disconnect']); },
    ...overrides,
  };
  const create = createFemometerSessionManager(api);
  const mount = (uid = 'a') => create(uid, state => states.push(state), reading => readings.push(reading));
  return { mount, calls, states, readings, emit: value => event(value) };
};

const clockFixture = (overrides = {}) => sessionFixture({
  startFemometerTemperatureListener: async () => ({ capabilities: {
    model: 'BM-Vinca2', clockSync: true, clockRead: true, clockProtocol: 'bluetooth-current-time',
  } }),
  ...overrides,
});

test('clock is explicit and unsupported or failed sync does not stop temperature events', async () => {
  let writes = 0;
  for (const supported of [false, true]) {
    const f = clockFixture({
      startFemometerTemperatureListener: async () => ({ capabilities: { model: 'BM-Vinca2', clockSync: supported } }),
      syncFemometerClock: async () => { writes++; throw { code: 'CLOCK_WRITE_FAILED' }; },
    });
    const session = f.mount();
    await session.start();
    assert.equal(writes, 0);
    await session.syncClock();
    assert.equal(f.states.at(-1).clockError.code, supported ? 'CLOCK_WRITE_FAILED' : 'CLOCK_UNSUPPORTED');
    assert.equal(f.states.at(-1).status, 'listening');
    f.emit({ temperatureC: 36.7 });
    assert.equal(f.readings.length, 1);
    assert.equal(f.calls.some(([name]) => name === 'disconnect'), false);
    await session.dispose();
  }
});

test('clock operations serialize without invalidating the temperature subscription', async () => {
  const sync = deferred();
  let writes = 0;
  let reads = 0;
  const f = clockFixture({
    syncFemometerClock: () => { writes++; return sync.promise; },
    readFemometerClock: async () => { reads++; return {}; },
  });
  const session = f.mount();
  await session.start();
  const pending = session.syncClock();
  await session.syncClock();
  await session.readClock();
  await tick();
  f.emit({ temperatureC: 36.6, deviceTimestamp: '2020-01-01T00:00:00' });
  assert.equal(f.readings.length, 1);
  assert.equal(writes, 1);
  assert.equal(reads, 0);
  sync.resolve({ verified: true, writeAccepted: true });
  await pending;
  f.emit({ temperatureC: 36.5 });
  assert.equal(f.readings.length, 2);
  assert.equal(f.states.at(-1).clockResult.verified, true);
  assert.equal(f.states.at(-1).clockBusy, false);
  await session.dispose();
});

test('account change cancels a pending clock result and waits before opening another connection', async () => {
  const sync = deferred();
  let attempts = 0;
  const f = clockFixture({
    syncFemometerClock: () => sync.promise,
    disconnectFemometer: async () => { sync.reject({ code: 'CONNECTION_CANCELLED' }); },
    startFemometerTemperatureListener: async () => {
      attempts++;
      return { capabilities: { model: 'BM-Vinca2', clockSync: true } };
    },
  });
  const first = f.mount('a');
  await first.start();
  const pending = first.syncClock();
  await tick();
  const second = f.mount('b');
  await second.start();
  await pending;
  assert.equal(attempts, 2);
  assert.equal(f.states.at(-1).clockResult, null);
  assert.equal(f.states.at(-1).clockError, null);
  await second.dispose();
});

test('automatic session exposes only the exact remembered match and subscribes once', async () => {
  const f = sessionFixture();
  const session = f.mount();
  await Promise.all([session.start(), session.start(), session.scan()]);
  assert.deepEqual(f.calls, [['saved', 'a'], ['scan', 'a'], ['subscribe'], ['listen', 'saved']]);
  assert.deepEqual(f.states.at(-1).devices, [{ id: 'saved', isRemembered: true }]);
  assert.equal(f.states.at(-1).status, 'listening');
  f.emit({ temperatureC: 36.5, deviceTimestamp: 'invalid diagnostic timestamp' });
  assert.equal(f.readings.length, 1);
  await session.stop();
  f.emit({ temperatureC: 37 });
  assert.equal(f.readings.length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'remove').length, 1);
});

test('no saved device does not scan; no match does not connect or expose other devices', async () => {
  for (const saved of [false, true]) {
    let scans = 0;
    const f = sessionFixture({
      getRememberedFemometer: async () => ({ remembered: saved }),
      scanForFemometer: async () => { scans++; return [{ id: 'other', isRemembered: false }]; },
    });
    const session = f.mount();
    await session.start();
    assert.equal(scans, saved ? 1 : 0);
    assert.equal(f.states.at(-1).status, saved ? 'missing' : 'idle');
    assert.deepEqual(f.states.at(-1).devices, []);
    assert.deepEqual(f.calls, []);
    await session.dispose();
  }
});

test('permissions denied and Bluetooth off never prompt automatically or forget the association', async () => {
  for (const code of ['PERMISSION_NOT_GRANTED', 'BLUETOOTH_DISABLED']) {
    const f = sessionFixture({ scanForFemometer: async () => { throw { code }; } });
    const session = f.mount();
    await session.start();
    assert.equal(f.states.at(-1).status, 'error');
    assert.equal(f.states.at(-1).error.code, code);
    assert.equal(f.states.at(-1).remembered, true);
    assert.equal(f.calls.some(([name]) => name === 'request' || name === 'listen'), false);
    await session.dispose();
  }
});

test('closing during scan cancels it and ignores late matches and UI updates', async () => {
  const scan = deferred();
  const f = sessionFixture({ scanForFemometer: () => scan.promise });
  const session = f.mount();
  const started = session.start();
  await tick();
  const count = f.states.length;
  const closed = session.dispose();
  await tick();
  assert.equal(f.calls.at(-1)[0], 'disconnect');
  scan.resolve([{ id: 'saved', isRemembered: true }]);
  await Promise.all([started, closed]);
  assert.equal(f.states.length, count);
  assert.equal(f.calls.some(([name]) => name === 'listen'), false);
});

test('StrictMode mount-cleanup-mount starts one scan and account replacement awaits cleanup', async () => {
  const f = sessionFixture();
  const first = f.mount();
  const firstRun = first.start();
  const disposed = first.dispose();
  const second = f.mount();
  await Promise.all([firstRun, disposed, second.start()]);
  assert.equal(f.calls.filter(([name]) => name === 'scan').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'subscribe').length, 1);
  const third = f.mount('b');
  await third.start();
  const removal = f.calls.findIndex(([name]) => name === 'remove');
  const nextScan = f.calls.findIndex(([name, uid]) => name === 'scan' && uid === 'b');
  assert.ok(removal >= 0 && nextScan > removal);
  await third.dispose();
});

test('stop during subscription registration removes the late listener without connecting', async () => {
  const registration = deferred();
  let removed = 0;
  const f = sessionFixture({ addFemometerTemperatureListener: () => registration.promise });
  const session = f.mount();
  const started = session.start();
  await tick();
  const stopped = session.stop();
  registration.resolve({ remove: async () => { removed++; } });
  await Promise.all([started, stopped]);
  assert.equal(removed, 1);
  assert.equal(f.calls.some(([name]) => name === 'listen'), false);
  assert.equal(f.states.at(-1).status, 'stopped');
});

test('stop during connection prevents late success and allows an explicit retry', async () => {
  const connection = deferred();
  let attempts = 0;
  const f = sessionFixture({ startFemometerTemperatureListener: () => ++attempts === 1 ? connection.promise : Promise.resolve({}) });
  const session = f.mount();
  const started = session.start();
  await tick();
  const stopped = session.stop();
  connection.resolve({});
  await Promise.all([started, stopped]);
  assert.equal(f.states.at(-1).status, 'stopped');
  await session.start();
  assert.equal(f.states.at(-1).status, 'listening');
  assert.equal(attempts, 2);
  await session.dispose();
});

test('manual search remains available and only it may request permissions', async () => {
  const f = sessionFixture();
  const session = f.mount();
  await session.scan();
  assert.equal(f.calls.some(([name]) => name === 'request'), true);
  assert.equal(f.calls.some(([name]) => name === 'listen'), false);
  assert.equal(f.states.at(-1).devices.length, 2);
  session.select('other');
  await session.listen();
  assert.deepEqual(f.calls.at(-1), ['listen', 'other']);
  await session.dispose();
});

test('native scan cancellation settles before another mounted panel starts scanning', async () => {
  const scan = deferred();
  let scans = 0;
  const order = [];
  const f = sessionFixture({
    scanForFemometer: () => {
      order.push('scan');
      return ++scans === 1 ? scan.promise : Promise.resolve([]);
    },
    disconnectFemometer: async () => { order.push('cancel'); scan.reject({ code: 'CONNECTION_CANCELLED' }); },
  });
  const first = f.mount();
  const started = first.start();
  await tick();
  const second = f.mount();
  await Promise.all([started, second.start()]);
  assert.deepEqual(order, ['scan', 'cancel', 'scan']);
  assert.equal(f.states.at(-1).status, 'missing');
  await second.dispose();
});

test('timeout and disconnection release the subscription without restarting automatically', async () => {
  for (const status of ['timeout', 'disconnected', 'error']) {
    const f = sessionFixture();
    const session = f.mount();
    await session.start();
    f.emit({ status });
    await tick();
    assert.equal(f.states.at(-1).status, status === 'timeout' ? 'stopped' : 'error');
    assert.equal(f.calls.filter(([name]) => name === 'scan').length, 1);
    assert.equal(f.calls.filter(([name]) => name === 'remove').length, 1);
    await session.dispose();
  }
});

test('staging exposes thermometer without a local flag; production cannot opt in', () => {
  assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: 'staging' }), true);
  assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: 'production' }), false);
  assert.equal(isFemometerPrototypeEnabled({}), false);
  for (const environment of ['staging', 'production']) {
    assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: environment, VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE: 'false' }), false);
    assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: environment, VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE: 'true' }), environment === 'staging');
  }
});

test('install instructions are suppressed in native apps even with forceVisible', async () => {
  const { createServer } = await import('vite');
  const { Capacitor } = await import('@capacitor/core');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const server = await createServer({ mode: 'staging', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const original = Capacitor.isNativePlatform;
  try {
    const { default: InstallPrompt } = await server.ssrLoadModule('/src/components/InstallPrompt.jsx');
    Capacitor.isNativePlatform = () => true;
    assert.equal(renderToStaticMarkup(React.createElement(InstallPrompt, { forceVisible: true })), '');
    Capacitor.isNativePlatform = () => false;
    assert.match(renderToStaticMarkup(React.createElement(InstallPrompt, { forceVisible: true })), /Abre el menú del navegador/);
  } finally {
    Capacitor.isNativePlatform = original;
    await server.close();
  }
});
