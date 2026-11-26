import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from 'date-fns';
import { createEmbeddedCycleLoader } from '../src/lib/embeddedCycleLoader.js';
import { loadFrontend, hooks, deferred, flush } from './helpers/load-frontend.mjs';

const snapshot = id => ({ currentCycle: { id, startDate: '2026-11-01', data: [] }, archivedCycles: [] });
function fixture(options = {}) {
  let offline = options.offline ?? false;
  const states = [], saved = [];
  let reads = 0;
  const loader = createEmbeddedCycleLoader({ accountId: 'a', timeoutMs: 25,
    readCache: async () => options.cache ?? null,
    readServer: () => { reads++; return options.server?.() ?? Promise.resolve(snapshot('server')); },
    saveCache: async (uid, data) => saved.push([uid, data]),
    onState: state => states.push(state), offline: () => offline,
  });
  return { loader, states, saved, state: () => states.at(-1), reads: () => reads,
    offline: value => { offline = value; if (value) loader.connectionLost(); } };
}

test('offline cached boot displays stored data and does not request Firebase', async () => {
  const f = fixture({ offline: true, cache: snapshot('cached') });
  await f.loader.load();
  assert.equal(f.state().hasData, true);
  assert.equal(f.state().phase, 'cached');
  assert.equal(f.reads(), 0);
  assert.equal(f.states.find(s => s.data)?.data.currentCycle.id, 'cached');
});
test('offline missing or empty cache is unavailable, never an invented empty cycle', async () => {
  for (const cache of [null, snapshot(null)]) {
    const f = fixture({ offline: true, cache }); await f.loader.load();
    assert.equal(f.state().phase, 'unavailable');
    assert.equal(f.state().hasData, false);
    assert.equal(f.reads(), 0);
  }
});
test('a confirmed empty server account is distinct from unavailable local data', async () => {
  const f = fixture({ server: async () => snapshot(null) }); await f.loader.load();
  assert.equal(f.state().phase, 'ready');
  assert.equal(f.state().hasData, true);
});
test('connection loss preserves displayed data; reconnect requests coalesce', async () => {
  const response = deferred(); let second = false;
  const f = fixture({ server: () => second ? response.promise : Promise.resolve(snapshot('first')) });
  await f.loader.load(); f.offline(true);
  assert.equal(f.state().hasData, true);
  assert.equal(f.state().data, undefined); // no overwrite of newer in-memory edits
  f.offline(false); second = true;
  const a = f.loader.load(), b = f.loader.load();
  assert.equal(a, b);
  response.resolve(snapshot('fresh')); await a;
  assert.equal(f.reads(), 2); assert.equal(f.state().phase, 'ready');
});
test('Firebase failure with onLine=true keeps cached data and distinguishes network hint', async () => {
  const f = fixture({ cache: snapshot('cached'), server: async () => { throw Error('permission-denied'); } });
  await f.loader.load(); assert.equal(f.state().hasData, true);
  assert.equal(f.state().knownOffline, false); assert.equal(f.state().phase, 'cached');
  assert.equal(f.saved.length, 0);
});
test('timeout releases loading and retries join the uncancellable read', async () => {
  const response = deferred(); const f = fixture({ server: () => response.promise });
  await f.loader.load(); assert.equal(f.state().phase, 'unavailable');
  const retry = f.loader.load(); await flush(); assert.equal(f.reads(), 1);
  response.resolve(snapshot('recovered')); await retry;
  assert.equal(f.state().phase, 'ready');
});
test('disposal on account switch ignores old read and never caches it for a new account', async () => {
  const response = deferred(); const f = fixture({ server: () => response.promise });
  const task = f.loader.load(); await flush(); f.loader.dispose();
  const count = f.states.length;
  response.resolve(snapshot('old-account')); await task;
  assert.equal(f.states.length, count); assert.equal(f.saved.length, 0);
});
test('unresponsive cache is bounded and a server read can still succeed', async () => {
  const states = [];
  const loader = createEmbeddedCycleLoader({ accountId: 'a', timeoutMs: 10, offline: () => false,
    readCache: () => new Promise(() => {}), readServer: async () => snapshot('server'),
    saveCache: async () => { throw Error('storage'); }, onState: s => states.push(s) });
  await loader.load(); assert.equal(states.at(-1).phase, 'ready');
});

async function context(t, embedded = true) {
  const h = hooks(), events = new Map(), cache = new Map([['a', snapshot('a-cycle')]]);
  let user = { uid: 'a' }, writes = 0;
  const navigator = { onLine: false };
  const bindings = { ...dates, ...h.bindings,
    useCallback: (fn, deps) => {
      const ref = h.bindings.useRef();
      if (!ref.current || deps.some((v, i) => v !== ref.current.deps[i])) ref.current = { deps, fn };
      return ref.current.fn;
    },
    useAuth: () => ({ user }), isEmbeddedAndroid: () => embedded,
    createEmbeddedCycleLoader: options => createEmbeddedCycleLoader({ ...options, offline: () => !navigator.onLine, timeoutMs: 25 }),
    useToast: () => ({ toast() {} }), navigator,
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    getCachedCycleData: async uid => cache.get(uid), saveCycleDataToCache: async (uid, data) => cache.set(uid, data),
    clearCycleDataCache: async () => { throw Error('must not clear storage'); },
    fetchCurrentCycleDB: async uid => snapshot(uid + '-server').currentCycle,
    fetchArchivedCyclesDB: async () => [], processCycleEntries: entries => entries, detectCycleDataIssues: () => ({}),
    createAppError: (code, title, message) => Object.assign(Error(message), { code }),
    updateCyclePostpartumModeDB: async () => { writes++; throw Error('write-failed'); },
    console: { error() {} },
  };
  const { CycleDataProvider } = await loadFrontend('src/contexts/CycleDataContext.jsx', bindings, ['CycleDataProvider']);
  const state = () => h.render(CycleDataProvider);
  state(); await flush(); await flush();
  t.after(() => h.cleanup());
  return { state, cache, navigator, events, writes: () => writes, switchUser: uid => { user = { uid }; state(); } };
}
test('provider exposes cached account, isolates switches and keeps local storage', async t => {
  const f = await context(t);
  assert.equal(f.state().currentCycle.id, 'a-cycle');
  f.switchUser('b'); await flush();
  assert.equal(f.state().currentCycle.id, null);
  assert.equal(f.state().dataAvailability.phase, 'unavailable');
  assert.equal(f.cache.has('a'), true);
});
test('manual offline mutation is not submitted; a real failure rejects and reconnect never retries it', async t => {
  const f = await context(t);
  await assert.rejects(f.state().updateCyclePostpartumMode('a-cycle', true), /No se ha enviado/);
  assert.equal(f.writes(), 0);
  f.navigator.onLine = true;
  await assert.rejects(f.state().updateCyclePostpartumMode('a-cycle', true), /write-failed/);
  assert.equal(f.state().currentCycle.postpartumMode, false);
  f.events.get('online')(); f.events.get('online')(); await flush(); await flush();
  assert.equal(f.writes(), 1);
});
test('web and remote APK retain their original offline behavior with no new notice', async t => {
  const f = await context(t, false);
  assert.equal(f.state().dataAvailability, null);
  assert.equal(f.state().currentCycle.id, 'a-cycle');
  assert.equal(f.events.size, 0);
});

test('single-cycle offline consultation returns the already loaded snapshot', async t => {
  const f = await context(t);
  assert.equal((await f.state().getCycleById('a-cycle')).id, 'a-cycle');
  assert.equal(await f.state().getCycleById('not-cached'), null);
});

test('embedded reads reject cache/pending metadata; default web reads retain SDK behavior', async () => {
  let server = 0, automatic = 0;
  const result = { metadata: { fromCache: true, hasPendingWrites: false } };
  const { readCycleQuery } = await loadFrontend('src/lib/cycleDataHandler.js', {
    getDocsFromServer: async () => { server++; return result; },
    getDocs: async () => { automatic++; return result; },
  }, ['readCycleQuery']);
  assert.equal(await readCycleQuery({}, false), result);
  await assert.rejects(readCycleQuery({}, true), /not confirmed/);
  result.metadata = { fromCache: false, hasPendingWrites: true };
  await assert.rejects(readCycleQuery({}, true), /not confirmed/);
  result.metadata.hasPendingWrites = false;
  assert.equal(await readCycleQuery({}, true), result);
  assert.equal(server, 3); assert.equal(automatic, 1);
});

test('availability UI hides unavailable cycles but retains settings and the unchanged web content', async () => {
  const h = hooks(); let pathname = '/records';
  let state = { phase: 'unavailable', knownOffline: true, hasData: false };
  const child = 'cycle-screen';
  const { CycleAvailability } = await loadFrontend('src/components/layout/MainLayout.jsx', {
    ...h.bindings, useLocation: () => ({ pathname }),
    useCycleDataContext: () => ({ dataAvailability: state, refreshData() {} }),
  }, ['CycleAvailability']);
  const rendered = () => JSON.stringify(CycleAvailability({ children: child }));
  assert.doesNotMatch(rendered(), /cycle-screen/);
  assert.match(rendered(), /Sin conexión y sin datos/);
  state.knownOffline = false;
  assert.match(rendered(), /consultar Firebase/);
  pathname = '/settings'; assert.match(rendered(), /cycle-screen/);
  state = null; assert.equal(CycleAvailability({ children: child }), child);
});
