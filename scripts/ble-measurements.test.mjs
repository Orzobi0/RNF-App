import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBleMeasurement, classifyBleMeasurement } from '../src/lib/bleMeasurements.js';
import { thermometerCapabilities } from '../src/lib/thermometerCapabilities.js';

test('BLE normalization keeps original old date separate from receipt and never trusts the clock', () => {
  const event = { temperatureC: 36.42, deviceTimestamp: '2020-10-30T08:21:00', receivedAt: '2026-10-30T14:00:00+01:00' };
  const result = normalizeBleMeasurement(event, 'BM-Vinca2');
  assert.equal(result.device_timestamp, event.deviceTimestamp);
  assert.equal(result.received_at, event.receivedAt);
  assert.equal(result.device_date_reliability, 'unverified');
  assert.equal(result.device_timezone, 'unknown');
  assert.equal(result.time, '08:21');
  assert.equal(result.selected, false);
  assert.equal(result.device_key, null);
  assert.equal(result.source, 'bluetooth');
  assert.equal(result.temperature, 36.42);
  assert.equal(event.deviceTimestamp, '2020-10-30T08:21:00');
});

test('normalization validates dates without repairing them or assuming a timezone', () => {
  for (const raw of ['2023-02-29T00:00:00', '2026-04-31T00:00:00', '2026-01-01T24:00:00', '0000-00-00T00:00:00', 'bad']) {
    const result = normalizeBleMeasurement({ temperatureC: 36, deviceTimestamp: raw });
    assert.equal(result.device_date_reliability, 'invalid');
    assert.equal(result.device_timestamp, raw);
    assert.equal(result.time, '');
  }
  for (const raw of ['2024-02-29T00:00:00', '2026-03-29T02:30:00', '2026-10-25T02:30:00', '2020-01-01T08:00:00.000+01:00']) {
    assert.equal(normalizeBleMeasurement({ temperatureC: 36, deviceTimestamp: raw }).device_date_reliability, 'unverified');
  }
  assert.equal(normalizeBleMeasurement({ temperatureC: 36 }).device_date_reliability, 'missing');
  assert.equal(normalizeBleMeasurement({ temperatureC: 36, deviceTimestampReliability: 'invalid' }).device_date_reliability, 'invalid');
  for (const value of [NaN, Infinity, null, '36.4']) assert.equal(normalizeBleMeasurement({ temperatureC: value }), null);
});

test('unknown models do not inherit Vinca capabilities and unimplemented modes remain unavailable', () => {
  assert.equal(thermometerCapabilities({ model: 'other', clockSync: true }).clockSync, false);
  assert.equal(thermometerCapabilities().clockRead, false);
  const result = thermometerCapabilities({ model: 'BM-Vinca2', clockRead: true, clockSync: false, historyReceive: true });
  assert.equal(result.clockRead, true);
  assert.equal(result.clockSync, false);
  assert.equal(result.historyReceive, true);
  assert.equal(result.historyRequest, false);
  assert.equal(result.modeConfiguration, false);
});

// Synthetic authoritative key, supplied by a hypothetical future model adapter.
// The real Vinca normalizer deliberately does not generate one.
const incoming = () => ({ ...normalizeBleMeasurement({ temperatureC: 36.42, deviceTimestamp: '2026-10-30T08:00:00' }, 'BM-Vinca2'),
  externalMeasurementKey: 'device-scope/sample-7' });
const classificationContext = () => ({
  cycles: [{ id: 'cycle', startDate: '2026-10-01', endDate: null, data: [] }],
  cyclesComplete: true, recordsComplete: true,
  getStableMeasurementKey: item => item.externalMeasurementKey,
  duplicateCheck: { key: 'device-scope/sample-7', status: 'absent' },
  nowMs: Date.parse('2026-10-30T12:00:00Z'),
  dateEvidence: { verified: true, deviceTimestamp: incoming().device_timestamp,
    epochMs: Date.parse('2026-10-30T07:00:00Z'), isoDate: '2026-10-30' },
});
const dayRecord = (measurements = []) => ({ id: 'day', iso_date: '2026-10-30',
  measurementsLoaded: true, measurementsComplete: true, measurements });

test('classification is pure and ready needs explicit date evidence and destination completeness', () => {
  const measurement = incoming();
  const context = classificationContext();
  const before = structuredClone({ measurement, context: { ...context, getStableMeasurementKey: undefined } });
  assert.deepEqual(classifyBleMeasurement(measurement, context), {
    status: 'ready', reason: 'ready-for-import', cycleId: 'cycle', isoDate: '2026-10-30', entryId: null,
  });
  assert.deepEqual({ measurement, context: { ...context, getStableMeasurementKey: undefined } }, before);
  assert.equal(classifyBleMeasurement(measurement, { ...context, dateEvidence: undefined }).reason, 'unverified-date');
  assert.equal(classifyBleMeasurement({ ...measurement, device_date_reliability: 'verified' }, { ...context, dateEvidence: undefined }).status, 'review');
  assert.equal(classifyBleMeasurement(measurement, { ...context, dateEvidence: { ...context.dateEvidence, deviceTimestamp: 'other' } }).reason, 'unverified-date');
  assert.equal(classifyBleMeasurement(measurement, { ...context, cyclesComplete: false }).reason, 'cycles-incomplete');
  assert.equal(classifyBleMeasurement(measurement, { ...context, recordsComplete: false }).reason, 'records-incomplete');
});

test('missing, invalid, future and suspicious old dates require review', () => {
  const measurement = incoming();
  const context = classificationContext();
  for (const [patch, reason] of [
    [{ temperature: NaN }, 'invalid-measurement'],
    [{ device_timestamp: null }, 'missing-date'],
    [{ device_timestamp: '2026-02-30T08:00:00' }, 'invalid-date'],
  ]) assert.equal(classifyBleMeasurement({ ...measurement, ...patch }, context).reason, reason);
  assert.equal(classifyBleMeasurement(measurement, { ...context, nowMs: context.dateEvidence.epochMs - 1 }).reason, 'future-date');
  const old = { ...measurement, device_timestamp: '2020-01-01T08:00:00' };
  assert.equal(classifyBleMeasurement(old, { ...context, dateEvidence: {
    verified: true, deviceTimestamp: old.device_timestamp, epochMs: Date.parse('2020-01-01T07:00:00Z'), isoDate: '2020-01-01',
  } }).reason, 'suspicious-old-date');
});

test('cycle matching is inclusive and refuses gaps, overlaps and invalid ranges', () => {
  const measurement = incoming();
  const context = classificationContext();
  assert.equal(classifyBleMeasurement(measurement, { ...context, cycles: [] }).reason, 'no-matching-cycle');
  assert.equal(classifyBleMeasurement(measurement, { ...context, cycles: [...context.cycles, { ...context.cycles[0], id: 'second' }] }).reason, 'ambiguous-cycle');
  assert.equal(classifyBleMeasurement(measurement, { ...context, cycles: [{ ...context.cycles[0], startDate: 'invalid' }] }).reason, 'invalid-cycle-range');
  assert.equal(classifyBleMeasurement(measurement, { ...context, cycles: [{ ...context.cycles[0], startDate: '2026-10-30', endDate: '2026-10-30' }] }).status, 'ready');
});

test('same-day temperatures are review, not duplicate measurements or duplicate daily records', () => {
  const context = classificationContext();
  context.getStableMeasurementKey = undefined;
  const measurement = incoming();
  context.cycles[0].data = [dayRecord([{ ...measurement, time: '07:00' }, { ...measurement, temperature: 36.5 }])];
  assert.equal(classifyBleMeasurement(measurement, context).reason, 'day-has-temperatures');
  // Even identical time and temperature, or the same device identity, prove nothing.
  context.cycles[0].data = [dayRecord([{ ...measurement, device_key: 'same-device' }])];
  assert.equal(classifyBleMeasurement({ ...measurement, device_key: 'same-device' }, context).status, 'review');
  context.cycles[0].data.push(dayRecord());
  assert.equal(classifyBleMeasurement(measurement, context).reason, 'duplicate-iso-date');
});

test('only supplied authoritative measurement keys identify duplicates; key conflicts require review', () => {
  const context = classificationContext();
  const measurement = { ...incoming(), externalMeasurementKey: 'device-scope/sample-7' };
  context.getStableMeasurementKey = item => item.externalMeasurementKey;
  context.cycles[0].data = [dayRecord([{ ...measurement, id: 'stored' }])];
  assert.equal(classifyBleMeasurement(measurement, context).status, 'duplicate');
  context.cycles[0].data[0].measurements[0].externalMeasurementKey = 'device-scope/sample-8';
  assert.equal(classifyBleMeasurement(measurement, context).reason, 'day-has-temperatures');
  context.cycles[0].data[0].measurements = [{ ...measurement, temperature: 37 }];
  assert.equal(classifyBleMeasurement(measurement, context).reason, 'measurement-key-conflict');
});

test('unloaded and partial measurement lists are never treated as empty', () => {
  const context = classificationContext();
  for (const record of [
    { id: 'day', iso_date: '2026-10-30' },
    { ...dayRecord(), measurementsComplete: false },
    { ...dayRecord(), measurementsLoaded: false },
    { ...dayRecord([{ temperature: 36.5, source: 'manual' }]), measurementsComplete: false },
  ]) {
    context.cycles[0].data = [record];
    assert.equal(classifyBleMeasurement(incoming(), context).reason, 'measurements-incomplete');
  }
  context.cycles[0].data = [{ ...dayRecord(), temperature_raw: 36.4 }];
  assert.equal(classifyBleMeasurement(incoming(), context).reason, 'day-has-temperatures');
  context.cycles[0].data = [dayRecord()];
  assert.equal(classifyBleMeasurement(incoming(), context).status, 'ready');
  assert.equal(classifyBleMeasurement(incoming(), context).entryId, 'day');
});

test('only destination-day measurements need loading, not other days or historical cycles', () => {
  const context = classificationContext();
  context.cycles.push({ id: 'old', startDate: '2020-01-01', endDate: '2020-01-31' });
  context.cycles[0].data = [{ id: 'other-day', isoDate: '2026-10-29', measurementsComplete: false }];
  assert.equal(classifyBleMeasurement(incoming(), context).status, 'ready');
  context.cycles[0].data.push({ ...dayRecord(), measurementsComplete: false });
  assert.equal(classifyBleMeasurement(incoming(), context).reason, 'measurements-incomplete');
});

test('an empty destination is not proof of global uniqueness', () => {
  const context = classificationContext();
  assert.equal(classifyBleMeasurement(incoming(), { ...context, getStableMeasurementKey: undefined }).reason, 'missing-stable-measurement-key');
  for (const duplicateCheck of [undefined, { key: 'other', status: 'absent' }, { key: 'device-scope/sample-7', status: 'unknown' }]) {
    assert.equal(classifyBleMeasurement(incoming(), { ...context, duplicateCheck }).reason, 'duplicate-check-incomplete');
  }
  // A reliable positive key match in a loaded portion of history still proves a duplicate.
  context.cycles.push({ id: 'old', startDate: '2020-01-01', endDate: '2020-01-31',
    data: [{ id: 'stored-day', measurements: [{ ...incoming(), id: 'stored' }], measurementsComplete: false }] });
  assert.equal(classifyBleMeasurement(incoming(), { ...context, duplicateCheck: undefined }).status, 'duplicate');
});
