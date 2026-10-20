import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measurementPayloadForRecord, loadRecordMeasurements, measurementsFromRecord, measurementSourceLabel,
  newManualMeasurement, normalizeMeasurements, selectedMeasurementSummary, sortedMeasurements, measurementTimeForSummary, measurementsForSheetSave,
} from '../src/lib/temperatureMeasurements.js';

const measurements = [
  { temperature: 36.48, time: '09:00', selected: true, source: 'manual' },
  { temperature: 36.43, time: '10:03', selected: false, source: 'bluetooth', device_model: 'BM-Vinca2', device_key: 'test-device', temperature_corrected: 36.63, time_corrected: '12:03', use_corrected: true },
  { temperature: 36.51, time: '08:12', selected: false },
];

test('visual order preserves the original action indices and stored order', () => {
  assert.deepEqual(sortedMeasurements(measurements).map((m) => m.index), [2, 0, 1]);
  assert.deepEqual(measurements.map((m) => m.time), ['09:00', '10:03', '08:12']);
});

test('selection drives chart, corrections and provenance together', () => {
  const next = normalizeMeasurements(measurements.map((m, i) => ({ ...m, selected: i === 1 })));
  assert.equal(next.filter((m) => m.selected).length, 1);
  assert.deepEqual(selectedMeasurementSummary(next), {
    temperature_raw: 36.43, temperature_corrected: 36.63, use_corrected: true,
    temperature_chart: 36.63, temperature_source: 'bluetooth',
    temperature_device_model: 'BM-Vinca2', temperature_device_key: 'test-device',
    temperature_time_corrected: '12:03',
  });
  assert.equal(next.find((m) => m.selected).time, '10:03');
  assert.equal(measurementTimeForSummary(next), '10:03');
  assert.equal(selectedMeasurementSummary(measurements).temperature_chart, 36.48);
});

test('summary time falls back only when the selected measurement has no time', () => {
  assert.equal(measurementTimeForSummary([{ ...measurements[0], time: '' }, measurements[1]]), '10:03');
  assert.equal(measurementTimeForSummary([]), null);
});

test('new manual measurement starts empty and cannot replace the selected measurement', () => {
  const manual = newManualMeasurement();
  assert.equal(manual.temperature, '');
  assert.match(manual.time, /^\d{2}:\d{2}$/);
  assert.equal(manual.source, 'manual');
  assert.equal(manual.device_model, null);
  assert.equal(manual.device_key, null);
  const next = normalizeMeasurements([...measurements, { ...manual, temperature: 36.7 }]);
  assert.equal(next[0].selected, true);
  assert.equal(next[3].selected, false);
  assert.equal(normalizeMeasurements([{ ...manual, temperature: 36.7 }])[0].selected, true);
});

test('one measurement round-trips through the summary, including corrected time and origin', () => {
  const selected = { ...measurements[1], selected: true };
  const summary = selectedMeasurementSummary([selected]);
  const restored = measurementsFromRecord({ ...summary, timestamp: '2026-10-01T10:03:00', measurements: [] });
  assert.equal(restored.length, 1);
  for (const key of ['temperature', 'temperature_corrected', 'time', 'time_corrected', 'use_corrected', 'source', 'device_model', 'device_key']) {
    assert.equal(restored[0][key], selected[key], key);
  }
  assert.equal(measurementSourceLabel(restored[0]), 'Vinca 2');
});

test('legacy records have no fabricated Manual source; removing the only temperature clears the summary', () => {
  const legacy = measurementsFromRecord({ temperature_raw: 36.5, timestamp: '2026-10-01T07:15:00' });
  assert.equal(measurementSourceLabel(legacy[0]), null);
  assert.equal(legacy[0].source, null);
  assert.equal(selectedMeasurementSummary([]).temperature_chart, null);
  assert.equal(selectedMeasurementSummary([]).temperature_source, null);
  assert.deepEqual(measurementsFromRecord({ temperature_raw: null }), []);
});

test('lazy loading uses only the requested day, reuses loaded data and respects single-entry fallback', async () => {
  const calls = [];
  const fetch = async (...args) => { calls.push(args); return measurements; };
  const record = { id: 'day', measurements: [], temperature_raw: 36.48 };
  assert.equal((await loadRecordMeasurements(record, 'cycle', fetch)).length, 3);
  assert.deepEqual(calls, [['cycle', 'day']]);
  await loadRecordMeasurements({ ...record, measurements, measurementsLoaded: true }, 'cycle', fetch);
  assert.equal(calls.length, 1);
  const single = await loadRecordMeasurements(record, 'cycle', async () => []);
  assert.equal(single.length, 1);
  assert.equal(single[0].temperature, 36.48);
  await assert.rejects(loadRecordMeasurements(record, 'cycle', async () => { throw Error('offline'); }), /offline/);
});

test('empty placeholders and duplicate selection flags normalize to one valid selection', () => {
  const result = normalizeMeasurements([{ temperature: '', selected: true }, ...measurements.map((m) => ({ ...m, selected: true }))]);
  assert.equal(result.length, 3);
  assert.equal(result.filter((m) => m.selected).length, 1);
});

test('immediate selection does not save pending inline temperature or correction edits', () => {
  const draft = measurements.map((m, i) => i === 0
    ? { ...m, temperature: 36.9, temperature_corrected: 37, use_corrected: true } : m);
  const next = draft.map((m, i) => ({ ...m, selected: i === 1 }));
  const saved = measurementsForSheetSave(measurements, draft, next, { action: 'select', index: 1 });
  assert.equal(saved[0].temperature, 36.48);
  assert.equal(saved[0].temperature_corrected, undefined);
  assert.equal(saved[1].selected, true);
  assert.equal(selectedMeasurementSummary(saved).temperature_chart, 36.63);
  assert.equal(draft[0].temperature_corrected, 37);
});

test('saving a manual row preserves other rows and allows immediate selection', () => {
  const draft = measurements.map((m, i) => i === 0 ? { ...m, temperature: 39 } : m);
  const manual = { ...newManualMeasurement(), temperature: 36.7 };
  const added = measurementsForSheetSave(measurements, draft, [...draft, manual], { action: 'add' });
  assert.equal(added[0].temperature, 36.48);
  assert.equal(added[3].source, 'manual');
  assert.equal(added[3].selected, false);
  const selected = added.map((m, i) => ({ ...m, selected: i === 3 }));
  assert.equal(selectedMeasurementSummary(measurementsForSheetSave(added, added, selected, { action: 'select' })).temperature_chart, 36.7);
});

test('quick mucus/peak edits preserve a non-first selection and all measurement metadata', () => {
  const rows = measurements.map((m, index) => ({ ...m, selected: index === 1 }));
  const payload = measurementPayloadForRecord({ measurements: rows, measurementsLoaded: true });
  assert.equal(payload.measurementsComplete, true);
  assert.deepEqual(payload.measurements, rows);
  assert.equal(selectedMeasurementSummary(payload.measurements).temperature_device_key, 'test-device');
});

test('summary-only edits remain incomplete and preserve original/corrected values and provenance', () => {
  const selected = measurements[1];
  const record = { id: 'day', timestamp: '2026-10-01T10:03:00', ...selectedMeasurementSummary([{ ...selected, selected: true }]) };
  const payload = measurementPayloadForRecord(record);
  assert.equal(payload.measurementsComplete, false);
  assert.equal(payload.measurements[0].temperature, selected.temperature);
  assert.equal(payload.measurements[0].time, selected.time);
  assert.equal(payload.measurements[0].time_corrected, selected.time_corrected);
  assert.deepEqual(selectedMeasurementSummary(payload.measurements), selectedMeasurementSummary([{ ...selected, selected: true }]));
});

test('new and empty days do not fetch a subcollection for a placeholder', async () => {
  const fetch = () => { throw new Error('Unexpected read'); };
  assert.deepEqual(await loadRecordMeasurements(null, 'cycle', fetch), []);
  assert.deepEqual(await loadRecordMeasurements({ id: 'placeholder-day' }, 'cycle', fetch), []);
  assert.deepEqual(measurementPayloadForRecord(null), { measurements: [], measurementsComplete: false });
  assert.equal(measurementPayloadForRecord({ measurements: [], measurementsLoaded: true }).measurementsComplete, true);
});
