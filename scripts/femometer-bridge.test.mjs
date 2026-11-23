import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('panel automatic session uses the real bridge wrappers without requesting permissions or inspecting', async () => {
  const server = await createServer({ mode: 'staging', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const oldWindow = globalThis.window;
  const calls = [];
  let session;
  try {
    globalThis.window = { Capacitor: {
      isNativePlatform: () => true, getPlatform: () => 'android',
      nativePromise: async (plugin, method, options) => {
        calls.push({ plugin, method, options });
        if (method === 'getRememberedDevice') return { remembered: true };
        if (method === 'scan') return { devices: [{ id: 'wrong' }, { id: 'right', isRemembered: true }] };
        if (method === 'startTemperatureListener') return { connectionReady: true, indicationsActive: true, capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } };
        if (method === 'disconnect') return {};
        throw new Error(`Unexpected method: ${method}`);
      },
      nativeCallback: (plugin, method, options) => {
        calls.push({ plugin, method, options });
        return 'subscription';
      },
    } };
    const ble = await server.ssrLoadModule('/src/lib/femometerBle.js');
    const states = [];
    session = ble.createFemometerPanelSession('account', state => states.push(state), () => {});
    await session.start();
    assert.deepEqual(calls.map(call => call.method), ['getRememberedDevice', 'scan', 'addListener', 'startTemperatureListener']);
    assert.deepEqual(calls[1].options, { userId: 'account', rememberedDevice: true, rememberedVinca: true, automaticRecovery: true });
    assert.deepEqual(calls[3].options, { deviceId: 'right', userId: 'account' });
    assert.equal(states.at(-1).status, 'listening');
    await session.dispose();
    assert.deepEqual(calls.slice(-2).map(call => call.method), ['disconnect', 'removeListener']);
    await ble.scanForFemometer('account', true);
    assert.deepEqual(calls.at(-1).options, { userId: 'account', expanded: true });
    await ble.scanForFemometer('account', false, true);
    assert.deepEqual(calls.at(-1).options, { userId: 'account', rememberedDevice: true, rememberedVinca: true });
  } finally {
    await session?.dispose();
    globalThis.window = oldWindow;
    await server.close();
  }
});

test('Android message bridge receives multiple readings and releases the subscription', async () => {
  const server = await createServer({ mode: 'staging', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const oldWindow = globalThis.window;
  const messages = [];
  const forwarded = [];
  const androidBridge = {
    postMessage: message => messages.push(JSON.parse(message)),
    onmessage: event => forwarded.push(event),
  };
  try {
    globalThis.window = { androidBridge, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } };
    const ble = await server.ssrLoadModule('/src/lib/femometerBle.js');
    const readings = [];
    const listener = await ble.addFemometerTemperatureListener(event => readings.push(event));
    const registration = messages.at(-1);
    assert.equal(registration.methodName, 'addListener');
    const deliver = data => androidBridge.onmessage({ data: JSON.stringify(data) });
    for (const temperatureC of [36.42, 36.51]) {
      deliver({ callbackId: registration.callbackId, success: true, save: true, data: { temperatureC } });
    }
    assert.deepEqual(readings.map(r => r.temperatureC), [36.42, 36.51]);
    const transport = { sessionId: 'opaque-connection', connectedAt: 1000, indicationsReadyAt: 2000, receivedAt: 900000 };
    deliver({ callbackId: registration.callbackId, success: true, save: true,
      data: { temperatureC: 35.77, deviceTimestamp: '2026-11-21T11:21:41', transport } });
    assert.deepEqual(readings.at(-1).transport, transport);
    assert.equal(readings.at(-1).deviceTimestamp, '2026-11-21T11:21:41');
    // Interleave an ordinary request with the persistent listener.
    const originalTimer = globalThis.setTimeout;
    let scanTimeout;
    let scan;
    try {
      globalThis.setTimeout = (callback, delay, ...args) => { scanTimeout = delay; return originalTimer(callback, delay, ...args); };
      scan = ble.scanForFemometer();
    } finally { globalThis.setTimeout = originalTimer; }
    assert.equal(scanTimeout, 35000);
    const request = messages.at(-1);
    deliver({ callbackId: request.callbackId, success: true, data: { devices: [{ id: 'test' }] } });
    assert.equal((await scan)[0].id, 'test');
    // Identity stays native: only account scope, temporary IDs and presence flags cross the bridge.
    for (const [method, invoke, options, response] of [
      ['getRememberedDevice', () => ble.getRememberedFemometer('user-a'), { userId: 'user-a' }, { remembered: true }],
      ['rememberDevice', () => ble.rememberFemometer('user-a', 'temporary-id'), { userId: 'user-a', deviceId: 'temporary-id' }, { remembered: true }],
      ['selectRememberedDevice', () => ble.selectRememberedFemometer('user-a', 'opaque-key'), { userId: 'user-a', deviceKey: 'opaque-key' }, { remembered: true, deviceKey: 'opaque-key' }],
      ['forgetDevice', () => ble.forgetFemometer('user-a', 'opaque-key'), { userId: 'user-a', deviceKey: 'opaque-key' }, { remembered: false, bindings: [] }],
      ['startStandardTrial', () => ble.startStandardThermometerTrial('candidate', 'user-a'), { deviceId: 'candidate', userId: 'user-a' }, { experimental: true }],
      ['confirmStandardTrial', () => ble.confirmStandardThermometerTrial('user-a', { deviceId: 'candidate', verificationId: 'session-proof', readingId: 'received-proof', basalConfirmed: true }), { userId: 'user-a', deviceId: 'candidate', verificationId: 'session-proof', readingId: 'received-proof', basalConfirmed: true }, { remembered: true, deviceKey: 'opaque-standard', protocol: 'health-thermometer' }],
      ['setTemperatureUnit', () => ble.setFemometerTemperatureUnit('F'), { unit: 'F' }, { writeAccepted: true, verified: false }],
      ['syncClock', () => ble.syncFemometerClock(), {}, { writeAccepted: true, verified: false }],
      ['forgetDevice', () => ble.forgetFemometer('user-b'), { userId: 'user-b' }, { remembered: false }],
    ]) {
      const pending = invoke();
      const request = messages.at(-1);
      assert.equal(request.methodName, method);
      assert.deepEqual(request.options, options);
      deliver({ callbackId: request.callbackId, success: true, data: response });
      assert.deepEqual(await pending, response);
    }
    const trials = [];
    const trialListener = await ble.addStandardThermometerTrialListener(value => trials.push(value));
    const trialRegistration = messages.at(-1);
    assert.equal(trialRegistration.options.eventName, 'thermometerTrialReading');
    deliver({ callbackId: trialRegistration.callbackId, success: true, save: true, data: { experimental: true, temperatureC: 36.5 } });
    assert.equal(trials.length, 1); assert.equal(readings.length, 3);
    await trialListener.remove();
    const rememberedScan = ble.scanForFemometer('user-a');
    const rememberedRequest = messages.at(-1);
    assert.deepEqual(rememberedRequest.options, { userId: 'user-a' });
    deliver({ callbackId: rememberedRequest.callbackId, success: true, data: {
      devices: [{ id: 'new-temporary-id', isRemembered: true }, { id: 'other', isRemembered: false }],
    } });
    assert.deepEqual((await rememberedScan).map(device => device.isRemembered), [true, false]);
    const failedSave = ble.rememberFemometer('user-a', 'unverified');
    deliver({ callbackId: messages.at(-1).callbackId, success: false, error: { code: 'DEVICE_NOT_VERIFIED' } });
    await assert.rejects(failedSave, error => error.code === 'DEVICE_NOT_VERIFIED');
    await listener.remove();
    const removal = messages.at(-1);
    assert.equal(removal.methodName, 'removeListener');
    assert.equal(removal.options.callbackId, registration.callbackId);
    const count = messages.length;
    await listener.remove();
    assert.equal(messages.length, count);
    deliver({ callbackId: registration.callbackId, success: true, save: true, data: { temperatureC: 37 } });
    assert.equal(readings.length, 3);
    assert.equal(forwarded.length, 1);
    const again = await ble.addFemometerTemperatureListener(event => readings.push(event));
    deliver({ callbackId: messages.at(-1).callbackId, success: true, save: true, data: { status: 'timeout' } });
    assert.equal(readings.at(-1).status, 'timeout');
    await again.remove();

    // The full Capacitor bridge must remove a listener without awaiting a reply.
    const nativeCalls = [];
    globalThis.window.Capacitor.nativeCallback = (...args) => { nativeCalls.push(args); return 'native-1'; };
    globalThis.window.Capacitor.nativePromise = () => { throw new Error('removeListener must not await a promise'); };
    const nativeListener = await ble.addFemometerTemperatureListener(event => readings.push(event));
    nativeCalls[0][3]({ temperatureC: 36.6 });
    assert.equal(readings.at(-1).temperatureC, 36.6);
    await nativeListener.remove();
    assert.equal(nativeCalls.at(-1)[1], 'removeListener');
    globalThis.window.Capacitor.isNativePlatform = () => false;
    await assert.rejects(ble.getRememberedFemometer('user-a'), error => error.code === 'UNAVAILABLE_PLATFORM');
    await assert.rejects(ble.scanForFemometer('user-a'), error => error.code === 'UNAVAILABLE_PLATFORM');
  } finally {
    globalThis.window = oldWindow;
    await server.close();
  }
});


test('A: delayed remembered discovery keeps a single connection and terminal events allow recovery', async () => {
  const { createFemometerSessionManager } = await import('../src/lib/femometerSession.js');
  for (const delay of [0, 5000, 10000, 15000]) {
    let resolveScan, event, state, scans = 0, connections = 0, now = 0;
    const api = {
      now: () => now,
      getRememberedFemometer: async () => ({ remembered: true, deviceKey: 'key', model: 'BM-Vinca2', protocol: 'vinca2' }),
      scanForFemometer: async (user, expanded, rememberedDevice) => {
        assert.equal(rememberedDevice, true); scans++;
        return new Promise(resolve => { resolveScan = resolve; });
      },
      addFemometerTemperatureListener: async callback => { event = callback; return { remove: async () => {} }; },
      startFemometerTemperatureListener: async () => { connections++; return { deviceKey: 'key', connectionReady: true, indicationsActive: true, timeoutSeconds: 360,
        capabilities: { model: 'BM-Vinca2', protocol: 'vinca2', compatibility: 'compatible' } }; },
      disconnectFemometer: async () => {},
    };
    const session = createFemometerSessionManager(api)('account', next => { state = next; }, () => {});
    const start = session.start();
    await new Promise(resolve => setImmediate(resolve));
    await session.start();
    assert.equal(scans, 1); assert.equal(connections, 0); assert.equal(state.status, 'searching');
    now = delay; resolveScan([{ id: 'candidate', isRemembered: true }]); await start;
    assert.equal(connections, 1); assert.equal(state.status, 'listening');
    event({ status: 'disconnected' }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.error.code, 'CONNECTION_LOST');
    await session.dispose();
  }
});
