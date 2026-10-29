import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from 'date-fns';
import { loadFrontend } from './helpers/load-frontend.mjs';
import { selectedMeasurementSummary } from '../src/lib/temperatureMeasurements.js';

const base = 'users/u/cycles/c/entries/2026-10-01';
const rows = [0, 1, 2].map(i => ({ id: 'old-' + i, temperature: 36.4 + i / 10,
  temperature_corrected: 36.6 + i / 10, time: '07:0' + i, time_corrected: '08:0' + i,
  selected: i === 1, use_corrected: i === 1, source: i === 1 ? 'bluetooth' : 'manual',
  device_model: i === 1 ? 'BM-Vinca2' : null, device_key: i === 1 ? 'device' : null }));

async function setup(initial = rows) {
  let store = new Map([
    ['users/u/cycles/c', { start_date: '2026-10-01' }],
    [base, { iso_date: '2026-10-01', ...selectedMeasurementSummary(initial), observations: 'before' }],
  ]);
  if (initial.length >= 2) initial.forEach((m, i) => store.set(base + '/measurements/old-' + i, m));
  let serial = 0, commits = 0, reads = 0;
  const flags = { fail: false, offline: false, incomplete: false, cacheRows: null };
  const ref = (...args) => { const path = args.filter(x => x !== db).map(x => x.path ?? x).join('/'); return { path, id: path.split('/').at(-1) }; };
  const db = {};
  const snapshot = path => ({ id: path.split('/').at(-1), ref: { path }, exists: () => store.has(path), data: () => store.get(path) });
  const querySnap = r => {
    let docs = [...store.keys()].filter(p => p.startsWith(r.path + '/') && !p.slice(r.path.length + 1).includes('/')).map(snapshot);
    if (r.iso) docs = docs.filter(d => d.data().iso_date === r.iso);
    return { docs, size: docs.length, metadata: { fromCache: flags.incomplete, hasPendingWrites: false } };
  };
  const bindings = {
    ...dates, db, collection: ref,
    doc: (...args) => args.length === 1 ? ref(args[0], 'new-' + ++serial) : ref(...args),
    getDoc: async r => snapshot(r.path), getDocFromServer: async r => snapshot(r.path), getDocs: async r => {
      const result = querySnap(r);
      if (flags.offline) {
        result.metadata.fromCache = true;
        if (flags.cacheRows !== null) result.docs = result.docs.slice(0, flags.cacheRows);
      }
      return result;
    },
    getDocsFromServer: async r => { reads++; if (flags.offline) throw Error('offline'); return querySnap(r); },
    query: (r, w) => ({ ...r, iso: w.value }), where: (_, __, value) => ({ value }), limit() {},
    writeBatch: () => {
      const ops = [];
      return {
        set: (r, d, options) => ops.push(['set', r.path, d, options]),
        update: (r, d) => ops.push(['update', r.path, d]),
        delete: r => ops.push(['delete', r.path]),
        commit: async () => {
          commits++;
          if (flags.fail) throw Error('write-failed');
          const next = new Map(store);
          for (const [op, p, d, options] of ops) {
            if (op === 'delete') next.delete(p);
            else next.set(p, op === 'update' || options?.merge ? { ...next.get(p), ...d } : d);
          }
          store = next;
        },
      };
    },
  };
  const api = await loadFrontend('src/lib/cycleDataHandler.js', bindings,
    ['updateCycleEntry', 'upsertCycleEntryByIsoDateDB', 'fetchEntryMeasurementsDB']);
  return { flags, api, data: () => store, commits: () => commits, reads: () => reads,
    save: (measurements, extra = {}) => api.updateCycleEntry('u', 'c', '2026-10-01', {
      ...selectedMeasurementSummary(measurements), measurements, measurementsComplete: true, ...extra,
    }),
    read: async () => (await api.fetchEntryMeasurementsDB('u', 'c', '2026-10-01')).measurements,
    readResult: () => api.fetchEntryMeasurementsDB('u', 'c', '2026-10-01'),
  };
}

for (const [name, initial, next] of [
  ['one temperature', [], [rows[0]]], ['three temperatures', [], rows],
  ['change selection', rows, rows.map((m, i) => ({ ...m, selected: i === 2 }))],
  ['edit correction', rows, rows.map((m, i) => i === 1 ? { ...m, temperature_corrected: 37 } : m)],
  ['add measurement', rows, [...rows, { ...rows[0], time: '10:00', selected: false }]],
  ['remove one', rows, rows.slice(1)], ['three to one', rows, [rows[1]]],
  ['one to three / historical summary', [rows[0]], rows], ['delete all', rows, []],
]) test(name + ' commits the summary and full replacement once', async () => {
  const h = await setup(initial); await h.save(next);
  assert.equal(h.commits(), 1);
  const actual = await h.read();
  assert.equal(actual.length, next.length >= 2 ? next.length : 0);
  for (let i = 0; i < actual.length; i++) {
    for (const key of Object.keys(next[i]).filter(k => k !== 'id')) assert.deepEqual(actual[i][key], next[i][key], key);
    assert.equal(actual[i].order, i);
    assert.ok(actual[i].id.startsWith('new-'));
  }
  assert.equal(h.data().get(base).temperature_chart, selectedMeasurementSummary(next).temperature_chart);
});
for (const field of ['observations', 'mucus_sensation']) test(field + ' alone never reads or rewrites measurements', async () => {
  const h = await setup(); const before = await h.read(); const reads = h.reads();
  await h.api.updateCycleEntry('u', 'c', '2026-10-01', { [field]: 'changed' });
  assert.equal(h.reads(), reads);
  assert.deepEqual(await h.read(), before);
});
test('incomplete empty arrays cannot clear temperatures or the summary', async () => {
  const h = await setup(); const original = h.data().get(base).temperature_chart;
  await h.save([], { measurementsComplete: false, observations: 'changed' });
  assert.equal((await h.read()).length, 3);
  assert.equal(h.data().get(base).temperature_chart, original);
});
for (const failure of ['fail', 'offline', 'incomplete']) test(failure + ' leaves the entire original set intact', async () => {
  const h = await setup(); const before = structuredClone([...h.data()]);
  h.flags[failure] = true;
  await assert.rejects(h.save(rows.slice(1)));
  assert.deepEqual([...h.data()], before);
  assert.equal(h.commits(), failure === 'fail' ? 1 : 0);
});
test('operation limit fails before any commit', async () => {
  const h = await setup(); await assert.rejects(h.save(Array.from({ length: 500 }, () => rows[0])), /una sola operación/);
  assert.equal(h.commits(), 0);
});
test('new upsert includes daily index and measurements in its only commit', async () => {
  const h = await setup([]); h.data().delete(base);
  await h.api.upsertCycleEntryByIsoDateDB('u', 'c', '2026-10-01', { ...selectedMeasurementSummary(rows), measurements: rows });
  assert.equal(h.commits(), 1);
  assert.equal(h.data().get('users/u/cycles/c/entries_by_iso/2026-10-01').entryId, '2026-10-01');
  assert.equal((await h.read()).length, 3);
});
test('existing upsert of observations preserves omitted temperature fields', async () => {
  const h = await setup(); const temperature = h.data().get(base).temperature_chart;
  await h.api.upsertCycleEntryByIsoDateDB('u', 'c', '2026-10-01', { observations: 'changed' });
  assert.equal(h.data().get(base).temperature_chart, temperature);
  assert.equal((await h.read()).length, 3);
});

test('unchanged measurements in a non-temperature edit keep their document identities', async () => {
  const h = await setup(); const before = await h.read();
  await h.save(rows, { observations: 'changed' });
  assert.deepEqual(await h.read(), before);
});
test('returned measurement ids match the committed documents', async () => {
  const h = await setup([]);
  const saved = await h.save(rows);
  assert.deepEqual(saved.measurements, await h.read());
});

test('partial UI update preserves the summary, timestamp and loaded measurements in memory', async () => {
  const { buildEntryForState } = await loadFrontend('src/contexts/CycleDataContext.jsx', {
    ...dates, createContext: () => ({}), processCycleEntries: entries => entries,
  }, ['buildEntryForState']);
  const original = { id: 'day', ...selectedMeasurementSummary(rows),
    timestamp: '2026-10-01T07:01:00', measurements: rows, measurementsLoaded: true };
  const result = buildEntryForState({ payload: { observations: 'changed', measurementsComplete: false },
    entryId: 'day', isoDate: '2026-10-01', cycleStartDate: '2026-10-01', existingEntry: original });
  assert.equal(result.temperature_chart, original.temperature_chart);
  assert.equal(result.timestamp, original.timestamp);
  assert.deepEqual(result.measurements, rows);
  assert.equal(result.measurementsLoaded, true);
});

test('offline consultation returns cached rows with explicit incomplete status', async () => {
  const h = await setup(); h.flags.offline = true; h.flags.cacheRows = 1;
  const result = await h.readResult();
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurementsComplete, false);
  assert.equal(h.commits(), 0);
});
test('an empty offline cache is not a complete empty remote day', async () => {
  const h = await setup(); h.flags.offline = true; h.flags.cacheRows = 0;
  const result = await h.readResult();
  assert.equal(result.measurements.length, 0);
  assert.equal(result.measurementsComplete, false);
  await assert.rejects(h.save([]), /Conecta/);
  assert.equal(h.commits(), 0);
});
test('partial query metadata protects a direct partial patch, even after reconnection', async () => {
  const h = await setup(); const before = structuredClone([...h.data()]);
  h.flags.offline = true; h.flags.cacheRows = 1;
  const result = await h.readResult();
  h.flags.offline = false;
  await h.api.updateCycleEntry('u', 'c', '2026-10-01', { ...selectedMeasurementSummary([]), ...result, observations: 'changed' });
  assert.equal(h.data().get(base).temperature_chart, new Map(before).get(base).temperature_chart);
  assert.equal((await h.read()).length, 3);
});
test('context vetoes an editor relabelling a partial cache as complete until a complete reload', async () => {
  const { assertEditableMeasurementRead } = await loadFrontend('src/contexts/CycleDataContext.jsx', {
    ...dates, createContext: () => ({}), createAppError: (_, __, message) => Error(message),
  }, ['assertEditableMeasurementRead']);
  assert.throws(() => assertEditableMeasurementRead({ measurements: [rows[0]], measurementsComplete: true }, false), /caché/);
  assert.throws(() => assertEditableMeasurementRead({ measurements: [] }, false), /caché/);
  assert.doesNotThrow(() => assertEditableMeasurementRead({ measurements: [rows[0]], measurementsComplete: false, observations: 'changed' }, false));
  const h = await setup();
  const fresh = await h.readResult();
  assert.equal(fresh.measurementsComplete, true);
  assert.doesNotThrow(() => assertEditableMeasurementRead({ measurements: fresh.measurements, measurementsComplete: true }, fresh.measurementsComplete));
});
