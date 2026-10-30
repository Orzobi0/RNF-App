import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from 'date-fns';
import { loadFrontend } from './helpers/load-frontend.mjs';
import { normalizeBleMeasurement, prepareManualBleDraft, classifyBleMeasurement, isPossibleBleDuplicate } from '../src/lib/bleMeasurements.js';
import { selectedMeasurementSummary, measurementsFromRecord } from '../src/lib/temperatureMeasurements.js';

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
  const day = root + '/entries/2026-10-01';
  const store = new Map([[root, { start_date: '2026-10-01', end_date: null }]]);
  const flags = { enabled: true, android: true, offline: false, cached: false, beforeTransaction: null,
    afterMeasurementQuery: null, reorderTransactionMaps: false };
  const transactionReads = [];
  let commits = 0, serial = 0;
  const ref = (...parts) => {
    const path = parts.filter(part => part !== db).map(part => part.path ?? part).join('/');
    return { path, id: path.split('/').at(-1) };
  };
  const snap = path => {
    const value = structuredClone(store.get(path));
    return { id: path.split('/').at(-1), ref: ref(path), exists: () => value !== undefined, data: () => value };
  };
  const read = async reference => { if (flags.offline) throw Error('offline'); return snap(reference.path); };
  const writer = () => {
    const writes = [];
    return {
      get: read,
      set: (reference, data, options) => writes.push(() => store.set(reference.path, options?.merge ? { ...store.get(reference.path), ...data } : data)),
      update: (reference, data) => writes.push(() => store.set(reference.path, { ...store.get(reference.path), ...data })),
      delete: reference => writes.push(() => store.delete(reference.path)),
      commit: async () => { if (flags.offline) throw Error('offline'); writes.forEach(write => write()); commits++; },
    };
  };
  const api = await loadFrontend('src/lib/cycleDataHandler.js', {
    ...dates, db, doc: (...parts) => parts.length === 1 ? ref(parts[0], 'generated-' + ++serial) : ref(...parts),
    collection: ref, getDoc: read, getDocFromServer: read,
    prepareManualBleDraft, isPossibleBleDuplicate, measurementsFromRecord, selectedMeasurementSummary,
    isFemometerBleAndroidNative: () => flags.android, isFemometerBlePrototypeEnabled: () => flags.enabled,
    getDocsFromServer: async reference => {
      if (flags.offline) throw Error('offline');
      const result = { docs: [...store.keys()].filter(path => path.startsWith(reference.path + '/')
        && !path.slice(reference.path.length + 1).includes('/')).map(snap),
      metadata: { fromCache: flags.cached, hasPendingWrites: false } };
      if (reference.path === day + '/measurements') flags.afterMeasurementQuery?.();
      return result;
    },
    writeBatch: writer,
    runTransaction: async (_, callback) => {
      flags.beforeTransaction?.();
      for (let attempt = 0; attempt < 3; attempt++) {
        const transaction = writer();
        const readValues = new Map();
        transaction.get = async reference => {
          transactionReads.push(reference.path);
          const result = await read(reference);
          readValues.set(reference.path, structuredClone(result.data()));
          const reverseMaps = value => Array.isArray(value) ? value.map(reverseMaps)
            : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseMaps(item)])) : value;
          return flags.reorderTransactionMaps ? { ...result, data: () => reverseMaps(result.data()) } : result;
        };
        const result = await callback(transaction);
        // Model the SDK retry when a read document changes before commit.
        try { for (const [path, value] of readValues) assert.deepEqual(store.get(path), value); }
        catch { continue; }
        await transaction.commit();
        return result;
      }
      throw Error('transaction retries exhausted');
    },
  }, ['incorporateBleMeasurementDB', 'updateCycleEntry']);
  const draft = prepareManualBleDraft(measurement, confirmation);
  return { flags, store, root, day, draft, api, transactionReads, commits: () => commits,
    readings: () => [...store.entries()].filter(([path]) => path.startsWith(day + '/measurements/')).map(([, data]) => data),
    save: (options) => api.incorporateBleMeasurementDB(draft, options) };
}

test('incorporation into an empty day selects the reading and round-trips Bluetooth origin through the summary', async () => {
  const h = await fixture();
  const saved = await h.save();
  assert.equal(h.commits(), 1);
  assert.equal(saved.measurements[0].selected, true);
  assert.equal(h.readings().length, 0);
  const restored = measurementsFromRecord(h.store.get(h.day))[0];
  assert.equal(restored.device_timestamp, measurement.device_timestamp);
  assert.equal(restored.temperature_original, 36.42);
  assert.equal(restored.confirmed_timestamp, '2026-10-01T08:00:00');
  assert.equal(restored.device_date_reliability, 'unverified');
  assert.equal(restored.device_model, 'BM-Vinca2');
});

test('a day with mucus and observations retains all existing information', async () => {
  const h = await fixture();
  const original = { iso_date: '2026-10-01', mucus_sensation: 'wet', mucus_appearance: 'clear',
    observations: 'keep', had_relations: true, peak_marker: 'peak', ignored: true, extra: { keep: true } };
  h.store.set(h.day, original);
  await h.save();
  for (const [key, value] of Object.entries(original)) assert.deepEqual(h.store.get(h.day)[key], value);
  assert.equal(h.store.get(h.day).temperature_raw, 36.42);
});

test('second and third temperatures append without changing selection, corrections or existing measurement documents', async () => {
  const h = await fixture();
  h.store.set(h.day, { iso_date: '2026-10-01', timestamp: '2026-10-01T06:00:00',
    temperature_raw: 36.7, temperature_corrected: 36.9, temperature_chart: 36.9,
    use_corrected: true, temperature_source: 'manual', observations: 'keep' });
  const original = structuredClone(h.store.get(h.day));
  await h.save();
  assert.deepEqual(h.store.get(h.day), { ...original, measurements_revision: 1 });
  assert.equal(h.readings().length, 2);
  assert.equal(h.readings().find(item => item.selected).temperature, 36.7);
  assert.equal(h.readings().find(item => item.selected).temperature_corrected, 36.9);
  const before = structuredClone(h.store);
  await assert.rejects(h.save, { code: 'ble-possible-duplicate' });
  assert.deepEqual(h.store, before);
  await h.save({ allowPossibleDuplicate: true });
  assert.equal(h.readings().length, 3);
  for (const [path, data] of before) assert.deepEqual(h.store.get(path), path === h.day ? { ...data, measurements_revision: 2 } : data);
  assert.equal(h.readings().filter(item => item.selected).length, 1);
});

test('possible duplicates include the single-summary case and a different confirmed day', async () => {
  const h = await fixture();
  await h.save();
  const before = structuredClone(h.store);
  const nextDay = prepareManualBleDraft(measurement, { ...confirmation, isoDate: '2026-10-02' });
  await assert.rejects(() => h.api.incorporateBleMeasurementDB(nextDay), { code: 'ble-possible-duplicate' });
  assert.deepEqual(h.store, before);
});

test('different map property order is not a conflict for the day, origin metadata or measurements', async () => {
  const h = await fixture();
  await h.save();
  h.flags.reorderTransactionMaps = true;
  await h.save({ allowPossibleDuplicate: true }); // summary -> two readings
  await h.save({ allowPossibleDuplicate: true }); // queried measurement maps -> transaction maps
  assert.equal(h.readings().length, 3);
  assert.equal(h.readings().filter(item => item.selected).length, 1);
  assert.equal(h.store.get(h.day).temperature_bluetooth_origin.device_timestamp, measurement.device_timestamp);
});

test('unrelated days are not locked; current non-temperature fields are preserved from the transaction', async () => {
  const h = await fixture();
  await h.save();
  const other = h.root + '/entries/other';
  h.store.set(other, { iso_date: '2026-10-02', observations: 'before' });
  h.flags.beforeTransaction = () => {
    h.store.set(other, { ...h.store.get(other), observations: 'after' });
    h.store.set(h.day, { ...h.store.get(h.day), observations: 'new note', mucus_sensation: 'wet', had_relations: true, peak_marker: 'peak' });
  };
  const result = await h.save({ allowPossibleDuplicate: true });
  assert.equal(result.observations, 'new note');
  assert.equal(result.mucus_sensation, 'wet');
  assert.equal(result.had_relations, true);
  assert.equal(result.peak_marker, 'peak');
  assert.ok(!h.transactionReads.some(path => path === other || path.startsWith(other + '/')));
});

test('an SDK retry cannot reuse membership after a concurrent append changes the parent revision', async () => {
  const h = await fixture();
  await h.save();
  h.flags.afterMeasurementQuery = () => {
    h.flags.afterMeasurementQuery = null;
    h.store.set(h.day, { ...h.store.get(h.day), measurements_revision: 2 });
  };
  await assert.rejects(() => h.save({ allowPossibleDuplicate: true }), error => error.details.check === 'day-temperature-changed');
  assert.equal(h.commits(), 1);
});

test('if stored measurements have no selection, the appended reading is selected without rewriting them', async () => {
  const h = await fixture();
  await h.save();
  await h.save({ allowPossibleDuplicate: true });
  for (const [path, data] of h.store) if (path.includes('/measurements/')) h.store.set(path, { ...data, selected: false });
  const previous = structuredClone(h.readings());
  await h.save({ allowPossibleDuplicate: true });
  assert.deepEqual(h.readings().slice(0, 2), previous);
  assert.equal(h.readings().at(-1).selected, true);
  assert.equal(h.readings().filter(item => item.selected).length, 1);
});

test('cancellation or missing authorization never writes; connectivity and feature gates fail closed', async () => {
  const h = await fixture();
  assert.equal(h.commits(), 0); // Preparing/reviewing a draft has no persistence.
  await assert.rejects(() => h.api.incorporateBleMeasurementDB({ ...h.draft, manuallyConfirmed: false }));
  assert.equal(h.commits(), 0);
  for (const patch of [{ offline: true }, { cached: true }, { android: false }, { enabled: false }]) {
    const fixtureData = await fixture();
    Object.assign(fixtureData.flags, patch);
    await assert.rejects(fixtureData.save);
    assert.equal(fixtureData.commits(), 0);
  }
});

test('ambiguous cycles, duplicate daily records and concurrent modifications stop without overwriting', async () => {
  for (const change of [
    h => h.store.set('users/u/cycles/other', { start_date: '2026-10-01' }),
    h => h.store.set(h.root, { start_date: '2026-10-01', end_date: '2026-10-02' }),
    h => { h.store.set(h.day, { iso_date: '2026-10-01' }); h.store.set(h.root + '/entries/other', { iso_date: '2026-10-01' }); },
  ]) {
    const h = await fixture(); change(h);
    const before = structuredClone(h.store);
    await assert.rejects(h.save);
    assert.deepEqual(h.store, before);
  }
  for (const path of ['entries/2026-10-01', 'entries_by_iso/2026-10-01']) {
    const h = await fixture();
    h.flags.beforeTransaction = () => h.store.set(h.root + '/' + path, { observations: 'concurrent', entryId: 'legacy' });
    await assert.rejects(h.save, { code: 'ble-import-conflict' });
    assert.equal(h.store.get(h.root + '/' + path).observations, 'concurrent');
    assert.equal(h.commits(), 0);
  }
  const h = await fixture();
  await h.save();
  await h.save({ allowPossibleDuplicate: true });
  const path = [...h.store.keys()].find(key => key.includes('/measurements/'));
  h.flags.afterMeasurementQuery = () => h.store.set(path, { ...h.store.get(path), temperature_corrected: 37 });
  await assert.rejects(() => h.save({ allowPossibleDuplicate: true }), error => error.details.check === 'measurement-changed');
  assert.equal(h.store.get(path).temperature_corrected, 37);
  assert.equal(h.readings().length, 2);
});

test('a concurrent append with an unchanged selected summary is detected through the day revision', async () => {
  const h = await fixture();
  await h.save();
  h.flags.beforeTransaction = () => h.store.set(h.day, { ...h.store.get(h.day), measurements_revision: 2 });
  await assert.rejects(() => h.save({ allowPossibleDuplicate: true }), { code: 'ble-import-conflict' });
  assert.equal(h.store.get(h.day).measurements_revision, 2);
  assert.equal(h.commits(), 1);
});

test('normal manual replacement can still edit measurements and preserve their original Bluetooth information', async () => {
  const h = await fixture();
  const first = await h.save();
  const rows = [{ ...first.measurements[0], temperature_corrected: 36.8, use_corrected: true },
    { temperature: 36.5, source: 'manual', selected: false, time: '09:00' }];
  await h.api.updateCycleEntry('u', 'c', '2026-10-01', {
    ...selectedMeasurementSummary(rows), measurements: rows, measurementsComplete: true, observations: 'edited normally',
  });
  assert.equal(h.store.get(h.day).observations, 'edited normally');
  assert.equal(h.readings().length, 2);
  const restored = h.readings().find(item => item.source === 'bluetooth');
  assert.equal(restored.device_timestamp, measurement.device_timestamp);
  assert.equal(restored.temperature_corrected, 36.8);
  assert.equal(restored.device_date_reliability, 'unverified');
  await h.api.updateCycleEntry('u', 'c', '2026-10-01', {
    ...selectedMeasurementSummary([restored]), measurements: [restored], measurementsComplete: true,
  });
  assert.equal(h.readings().length, 0);
  assert.equal(measurementsFromRecord(h.store.get(h.day))[0].device_timestamp, measurement.device_timestamp);
  assert.equal(measurementsFromRecord(h.store.get(h.day))[0].confirmed_timestamp, restored.confirmed_timestamp);
});
