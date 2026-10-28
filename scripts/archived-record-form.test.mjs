import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFormMeasurements } from '../src/lib/loadFormMeasurements.js';
import { deferred, flush } from './helpers/load-frontend.mjs';

const source = await readFile(new URL('../src/pages/RecordsPage.jsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('  const handleCloseForm ='), source.indexOf('  const handleAddRecordForDay ='));
function form(getMeasurementsForEntry, cycleId = 'archived') {
  const state = {};
  const setters = Object.fromEntries(['ShowForm', 'EditingRecord', 'DefaultFormIsoDate', 'FocusedField', 'InitialSectionKey', 'IsDetailLoading', 'SelectedDate', 'RecordToDelete'].map(name => ['set' + name, value => { state[name] = value; }]));
  const bindings = { ...setters, useCallback: fn => fn, cycle: { id: cycleId }, activeRecordLoadRef: { current: null }, getMeasurementsForEntry, loadFormMeasurements, toast: value => { state.error = value; } };
  const api = Function(...Object.keys(bindings), handlers + '\nreturn { openRecordForm, handleDateSelect, handleCloseForm };')(...Object.values(bindings));
  return { ...api, state };
}
const record = { id: 'entry', isoDate: '2026-10-01', observations: 'original' };
const rows = [{ temperature: 36.4, selected: true }, { temperature: 36.6, selected: false }];

for (const cycle of ['archived', 'current']) {
  for (const temperatures of [[], rows.slice(0, 1), rows]) {
    test(`${cycle}: ${temperatures.length} measurements, duplicate date notifications and reopen`, async () => {
      let calls = 0;
      const pending = deferred();
      const f = form(async (cycleId, id, options) => {
        calls++;
        assert.equal(cycleId, cycle);
        assert.equal(id, record.id);
        assert.equal(options.requireComplete, true);
        return pending.promise;
      }, cycle);
      f.openRecordForm(record);
      f.handleDateSelect({ ...record }); // Initial form effect.
      await flush();
      assert.equal(calls, 1);
      assert.equal(f.state.IsDetailLoading, true);
      pending.resolve(temperatures);
      await flush();
      assert.equal(f.state.IsDetailLoading, false);
      assert.equal(f.state.EditingRecord.measurements.length, temperatures.length);
      const draft = f.state.EditingRecord;
      draft.observations = 'edited';
      await f.handleDateSelect({ ...record, measurements: temperatures }); // Context update.
      assert.equal(f.state.EditingRecord, draft);
      assert.equal(calls, 1);
      f.handleCloseForm();
      f.openRecordForm({ ...record, observations: 'saved' });
      await flush();
      assert.equal(calls, 2);
      assert.equal(f.state.EditingRecord.observations, 'saved');
      assert.equal(f.state.IsDetailLoading, false);
    });
  }
}

test('cancel and reopen the same record ignores late results from the old session', async () => {
  const old = deferred(), next = deferred();
  let calls = 0;
  const f = form(() => ++calls === 1 ? old.promise : next.promise);
  f.openRecordForm(record);
  await flush();
  f.handleCloseForm();
  f.openRecordForm(record);
  await flush();
  old.reject(Error('late failure'));
  await flush();
  assert.equal(f.state.ShowForm, true);
  assert.equal(f.state.IsDetailLoading, true);
  assert.equal(f.state.error, undefined);
  next.resolve(rows);
  await flush();
  assert.equal(f.state.IsDetailLoading, false);
});

test('failed or partial reads close the blocked form and allow retry', async () => {
  let fail = true;
  const f = form(async () => { if (fail) throw Error('incomplete'); return rows; });
  f.openRecordForm({ ...record, measurements: [rows[0]], measurementsComplete: false });
  await flush();
  assert.equal(f.state.ShowForm, false);
  assert.equal(f.state.IsDetailLoading, false);
  assert.ok(f.state.error);
  fail = false;
  f.openRecordForm(record);
  await flush();
  assert.equal(f.state.ShowForm, true);
  assert.equal(f.state.EditingRecord.measurements.length, 2);
});

test('a hanging read times out; partial arrays never bypass the complete-read requirement', async () => {
  await assert.rejects(loadFormMeasurements(record, 'archived', () => new Promise(() => {}), 10), /demasiado/);
  let calls = 0;
  await loadFormMeasurements({ ...record, measurementsLoaded: true, measurementsComplete: false, measurements: [rows[0]] }, 'archived', async (_, __, options) => {
    calls++;
    assert.equal(options.requireComplete, true);
    return rows;
  });
  assert.equal(calls, 1);
});

test('cycle initial effect excludes the mutable state selector and saving still explicitly refreshes', async () => {
  const cycle = await readFile(new URL('../src/pages/CycleDetailPage.jsx', import.meta.url), 'utf8');
  const deps = cycle.slice(cycle.indexOf('   }, ['), cycle.indexOf('  const handleAddOrUpdateRecord'));
  assert.doesNotMatch(deps, /\bgetCycleFromState\b/);
  assert.match(cycle, /getCycleFromStateRef.current\(cycleId\)/);
  assert.match(cycle, /await addOrUpdateDataPoint\(newData, editingRecord, cycleData.id\);\s+const updatedCycle = await refreshCycleData\(\)/);
});

test('the context rejects partial reads for the form while preserving consultation access', async () => {
  const context = await readFile(new URL('../src/contexts/CycleDataContext.jsx', import.meta.url), 'utf8');
  const start = context.indexOf('  const getMeasurementsForEntry = useCallback(');
  const end = context.indexOf('  const deleteRecord =', start);
  let complete = false;
  const bindings = {
    useCallback: fn => fn, user: { uid: 'synthetic' },
    fetchEntryMeasurementsDB: async () => ({ measurements: rows.slice(0, 1), measurementsComplete: complete }),
    measurementReadStatus: { current: new Map() }, updateEntryMeasurementsState: () => {},
  };
  const get = Function(...Object.keys(bindings), context.slice(start, end) + '\nreturn getMeasurementsForEntry;')(...Object.values(bindings));
  assert.equal((await get('c', 'e')).length, 1);
  await assert.rejects(get('c', 'e', { requireComplete: true }), /incompleta/);
  complete = true;
  assert.equal((await get('c', 'e', { requireComplete: true })).length, 1);
});
