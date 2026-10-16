import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

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
    // Interleave an ordinary request with the persistent listener.
    const scan = ble.scanForFemometer();
    const request = messages.at(-1);
    deliver({ callbackId: request.callbackId, success: true, data: { devices: [{ id: 'test' }] } });
    assert.equal((await scan)[0].id, 'test');
    await listener.remove();
    const removal = messages.at(-1);
    assert.equal(removal.methodName, 'removeListener');
    assert.equal(removal.options.callbackId, registration.callbackId);
    const count = messages.length;
    await listener.remove();
    assert.equal(messages.length, count);
    deliver({ callbackId: registration.callbackId, success: true, save: true, data: { temperatureC: 37 } });
    assert.equal(readings.length, 2);
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
  } finally {
    globalThis.window = oldWindow;
    await server.close();
  }
});
