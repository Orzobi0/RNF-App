import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from 'date-fns';
import { loadFrontend } from './helpers/load-frontend.mjs';
import { normalizeBleMeasurement, prepareManualBleDraft, classifyBleMeasurement } from '../src/lib/bleMeasurements.js';
import { selectedMeasurementSummary } from '../src/lib/temperatureMeasurements.js';

const measurement = normalizeBleMeasurement({ temperatureC: 36.42, deviceTimestamp: '2020-01-01T08:00:00' }, 'BM-Vinca2');
const confirmation = { isoDate: '2026-10-01', time: '08:00', confirmed: true, userId: 'u', cycleId: 'c',
  nowMs: new Date('2026-10-02T12:00:00').getTime() };

test('manual BLE confirmation preserves the original clock and never establishes automatic reliability', () => {
  const before = structuredClone(measurement);
  assert.throws(() => prepareManualBleDraft(measurement, { ...confirmation, confirmed: false }));
  const draft = prepareManualBleDraft(measurement, confirmation);
  assert.deepEqual(measurement, before);
  assert.equal(draft.isoDate, confirmation.isoDate);
  assert.equal(draft.measurements[0].device_timestamp, '2020-01-01T08:00:00');
  assert.equal(draft.measurements[0].device_date_reliability, 'unverified');
  assert.equal(draft.measurements[0].device_key, null);
  assert.equal(draft.measurements[0].source, 'bluetooth');
  assert.equal(draft.measurements[0].device_model, 'BM-Vinca2');
  assert.equal(classifyBleMeasurement(draft.measurements[0]).reason, 'unverified-date');
  for (const patch of [{ isoDate: '2026-02-30' }, { time: '' }, { time: '24:00' }, { isoDate: '2027-01-01' }, { cycleId: null }, { userId: null }]) {
    assert.throws(() => prepareManualBleDraft(measurement, { ...confirmation, ...patch }));
  }
});

async function fixture() {
  const db = {};
  const root = 'users/u/cycles/c';
  const store = new Map([[root, { start_date: '2026-10-01', end_date: null }]]);
  const flags = { enabled: true, android: true, offline: false, cached: false, beforeTransaction: null };
  let commits = 0;
  const ref = (...parts) => ({ path: parts.filter(part => part !== db).map(part => part.path ?? part).join('/') });
  const snap = path => ({ id: path.split('/').at(-1), exists: () => store.has(path), data: () => store.get(path) });
  const read = async reference => { if (flags.offline) throw Error('offline'); return snap(reference.path); };
  const api = await loadFrontend('src/lib/cycleDataHandler.js', {
    ...dates, db, doc: ref, collection: ref, getDoc: read, getDocFromServer: read,
    isFemometerBleAndroidNative: () => flags.android, isFemometerBlePrototypeEnabled: () => flags.enabled,
    getDocsFromServer: async reference => {
      if (flags.offline) throw Error('offline');
      return { docs: [...store.keys()].filter(path => path.startsWith(reference.path + '/')
        && !path.slice(reference.path.length + 1).includes('/')).map(snap),
      metadata: { fromCache: flags.cached, hasPendingWrites: false } };
    },
    runTransaction: async (_, callback) => {
      flags.beforeTransaction?.();
      const writes = [];
      await callback({ get: read, set: (reference, data) => writes.push([reference.path, data]) });
      if (flags.offline) throw Error('offline');
      for (const [path, data] of writes) store.set(path, data);
      commits++;
    },
  }, ['assertBleImportDayAvailableDB', 'upsertCycleEntryByIsoDateDB']);
  const draft = prepareManualBleDraft(measurement, confirmation);
  const payload = { ...selectedMeasurementSummary(draft.measurements), measurements: draft.measurements,
    measurementsComplete: true, timestamp: '2026-10-01T08:00:00', observations: 'manual confirmation' };
  return { flags, store, root, commits: () => commits,
    check: () => api.assertBleImportDayAvailableDB('u', 'c', '2026-10-01'),
    save: () => api.upsertCycleEntryByIsoDateDB('u', 'c', '2026-10-01', payload, { requireEmptyDay: true }) };
}

test('BLE availability is read-only; explicit save uses the existing daily summary and index', async () => {
  const h = await fixture();
  await h.check();
  assert.equal(h.commits(), 0);
  assert.equal(h.store.size, 1);
  await h.save();
  const saved = h.store.get(h.root + '/entries/2026-10-01');
  assert.equal(saved.temperature_raw, 36.42);
  assert.equal(saved.temperature_source, 'bluetooth');
  assert.equal(saved.temperature_device_model, 'BM-Vinca2');
  assert.equal(saved.timestamp, '2026-10-01T08:00:00');
  assert.equal(h.commits(), 1);
  await assert.rejects(h.save);
  assert.equal(h.commits(), 1);
});

test('BLE import fails closed for unavailable server, partial data, other platforms and production', async () => {
  for (const patch of [{ offline: true }, { cached: true }, { android: false }, { enabled: false }]) {
    const h = await fixture();
    Object.assign(h.flags, patch);
    await assert.rejects(h.check);
    await assert.rejects(h.save);
    assert.equal(h.commits(), 0);
  }
});

test('BLE import refuses existing days, ambiguous ranges and archived cycles without any writes', async () => {
  for (const change of [
    h => h.store.set(h.root + '/entries/legacy', { iso_date: '2026-10-01', observations: 'keep' }),
    h => h.store.set(h.root + '/entries/legacy', { timestamp: '2026-10-01T08:00:00', temperature_raw: 36.8 }),
    h => h.store.set(h.root + '/entries/unknown', { observations: 'undated' }),
    h => h.store.set('users/u/cycles/other', { start_date: '2026-10-01' }),
    h => h.store.set(h.root, { start_date: '2026-10-01', end_date: '2026-10-02' }),
  ]) {
    const h = await fixture();
    change(h);
    const before = structuredClone(h.store);
    await assert.rejects(h.save);
    assert.deepEqual(h.store, before);
    assert.equal(h.commits(), 0);
  }
});

test('a day or index created after the check prevents the transaction from overwriting it', async () => {
  for (const path of ['entries/2026-10-01', 'entries_by_iso/2026-10-01']) {
    const h = await fixture();
    h.flags.beforeTransaction = () => h.store.set(h.root + '/' + path, { observations: 'concurrent', entryId: 'legacy' });
    await assert.rejects(h.save);
    assert.equal(h.store.get(h.root + '/' + path).observations, 'concurrent');
    assert.equal(h.commits(), 0);
  }
});
