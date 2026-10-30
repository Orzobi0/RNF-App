import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBleMeasurement } from '../src/lib/bleMeasurements.js';
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
