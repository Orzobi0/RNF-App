import test from 'node:test';
import assert from 'node:assert/strict';
import { observeEmbeddedConnectivity } from '../src/lib/embeddedConnectivity.js';
import { createEmbeddedCycleLoader } from '../src/lib/embeddedCycleLoader.js';
import { deferred, flush } from './helpers/load-frontend.mjs';

const snapshot = id => ({ currentCycle: { id, data: [] }, archivedCycles: [] });
async function fixture(t, { connected = true, server = async () => snapshot('fresh'), cache = async () => snapshot('cached'), timeoutMs = 1000 } = {}) {
  const listeners = new Map(), web = new Map(), page = new Map(), states = [], saved = [];
  let reads = 0, active = 0, maxActive = 0, observer;
  const network = { getStatus: async () => ({ connected }), addListener: async (event, fn) => {
    listeners.set(event, fn); return { remove: async () => listeners.delete(event) };
  } };
  const app = { addListener: network.addListener };
  const surface = map => ({ visibilityState: 'visible', addEventListener: (n, fn) => map.set(n, fn), removeEventListener: n => map.delete(n) });
  const loader = createEmbeddedCycleLoader({ accountId: 'a', timeoutMs,
    offline: () => observer?.isOffline() ?? false, readCache: cache,
    readServer: async () => { reads++; active++; maxActive = Math.max(maxActive, active); try { return await server(); } finally { active--; } },
    saveCache: async (...args) => saved.push(args), onState: s => states.push(s),
  });
  observer = observeEmbeddedConnectivity({ network, app, browser: surface(web), page: surface(page), webOffline: () => false,
    onOffline: loader.connectionLost, onOnline: loader.connectionRestored });
  const dispose = () => { observer.dispose(); loader.dispose(); };
  t.after(dispose);
  await observer.ready; await flush();
  return { loader, observer, states, saved, state: () => states.at(-1), reads: () => reads, maxActive: () => maxActive,
    emit: value => { connected = value; listeners.get('networkStatusChange')?.({ connected: value }); },
    setConnected: value => { connected = value; }, resume: () => listeners.get('appStateChange')?.({ isActive: true }),
    visible: () => page.get('visibilitychange')?.(), listeners, web, page, dispose };
}

test('airplane mode with stale navigator updates immediately; Wi-Fi verifies Firebase before clearing notice', async t => {
  const response = deferred(); let pending = false;
  const f = await fixture(t, { server: () => pending ? response.promise : snapshot('initial') });
  assert.equal(f.state().phase, 'ready');
  f.emit(false);
  assert.equal(f.observer.isOffline(), true);
  assert.equal(f.state().knownOffline, true);
  pending = true; f.emit(true); await flush();
  assert.equal(f.state().knownOffline, false);
  assert.equal(f.state().needsServerConfirmation, true);
  response.resolve(snapshot('recovered')); await f.loader.load();
  assert.equal(f.state().needsServerConfirmation, false);
  assert.equal(f.state().phase, 'ready');
});

test('available network with inaccessible Firebase retains warning and cached data', async t => {
  const f = await fixture(t, { server: async () => { throw Error('unavailable'); } });
  assert.equal(f.state().serverReadFailed, true);
  f.emit(false); f.emit(true); await flush();
  assert.equal(f.state().knownOffline, false);
  assert.equal(f.state().needsServerConfirmation, true);
  assert.equal(f.state().hasData, true);
});

test('normal cached startup has no transient warning', async t => {
  const response = deferred(); const f = await fixture(t, { server: () => response.promise });
  assert.equal(f.state().phase, 'cached');
  assert.equal(f.state().serverReadFailed, false);
  assert.equal(f.state().needsServerConfirmation, false);
  response.resolve(snapshot('fresh')); await f.loader.load();
  assert.equal(f.state().phase, 'ready');
});

test('repeated native events and foreground signals coalesce; background return checks current state', async t => {
  const response = deferred(); const f = await fixture(t, { connected: false, server: () => response.promise });
  f.setConnected(true); f.resume(); f.visible(); await flush();
  for (let i = 0; i < 10; i++) f.emit(true);
  assert.equal(f.reads(), 1);
  response.resolve(snapshot('fresh')); await f.loader.load();
  assert.equal(f.maxActive(), 1);
  f.setConnected(false); f.resume(); await flush();
  assert.equal(f.state().knownOffline, true);
});

test('account disposal ignores reconnect responses and late callbacks, removes every listener', async t => {
  const response = deferred(); const f = await fixture(t, { server: () => response.promise });
  const callback = f.listeners.get('networkStatusChange');
  f.dispose(); const count = f.states.length;
  callback({ connected: false }); response.resolve(snapshot('old-account')); await flush();
  assert.equal(f.states.length, count); assert.equal(f.saved.length, 0);
  assert.equal(f.listeners.size, 0); assert.equal(f.web.size, 0); assert.equal(f.page.size, 0);
  const next = await fixture(t, { cache: async () => snapshot('other-cache') });
  assert.equal(next.state().data.currentCycle.id, 'fresh');
});

test('stale getStatus cannot override a newer disconnect; late listener handles are removed', async () => {
  const response = deferred(), registration = deferred(); let callback, removed = 0, offline = 0, online = 0;
  const surface = { addEventListener() {}, removeEventListener() {} };
  const observer = observeEmbeddedConnectivity({
    network: { getStatus: () => response.promise, addListener: async (_, fn) => { callback = fn; return { remove: async () => { removed++; } }; } },
    app: { addListener: () => registration.promise }, browser: surface, page: surface, webOffline: () => false,
    onOffline: () => offline++, onOnline: () => online++,
  });
  await flush(); callback({ connected: false }); response.resolve({ connected: true }); await observer.ready;
  assert.equal(observer.isOffline(), true); assert.equal(online, 0); assert.equal(offline, 1);
  observer.dispose(); registration.resolve({ remove: async () => { removed++; } }); await flush();
  assert.equal(removed, 2);
});

test('reconnect during a failing in-flight read retries once without parallel reads', async t => {
  const first = deferred(); let attempt = 0;
  const f = await fixture(t, { server: () => ++attempt === 1 ? first.promise : snapshot('recovered') });
  f.emit(false); f.emit(true); first.reject(Error('old-network')); await flush(); await flush();
  assert.equal(f.reads(), 2); assert.equal(f.maxActive(), 1);
  assert.equal(f.state().phase, 'ready');
});

test('timeout retries still join the existing SDK request', async t => {
  const response = deferred(); const f = await fixture(t, { server: () => response.promise, timeoutMs: 10 });
  await f.loader.load();
  assert.equal(f.state().serverReadFailed, true);
  f.emit(false); f.emit(true); await flush();
  assert.equal(f.reads(), 1);
  response.resolve(snapshot('recovered')); await f.loader.load();
  assert.equal(f.state().needsServerConfirmation, false);
});


test('late initial native online confirmation does not repeat an already confirmed load', async () => {
  let reads = 0;
  const loader = createEmbeddedCycleLoader({ accountId: 'a', readCache: async () => null,
    readServer: async () => { reads++; return snapshot('fresh'); }, saveCache: async () => {},
    offline: () => false, onState() {} });
  await loader.load(); await loader.connectionRestored(); await loader.connectionRestored();
  assert.equal(reads, 1);
  loader.dispose();
});
