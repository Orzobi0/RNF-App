import { temperatureNumber, measurementsFromRecord } from './temperatureMeasurements.js';

// Normalizes transport diagnostics to the common measurement shape, without persistence.
// A syntactically valid device clock is still unverified, including after a clock sync:
// buffered readings can predate the adjustment and contain no timezone information.
export const normalizeBleMeasurement = (event, model = null) => {
  if (typeof event?.temperatureC !== 'number' || !Number.isFinite(event.temperatureC)) return null;
  const raw = event.deviceTimestamp ?? null;
  const match = typeof raw === 'string' && raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
  let valid = false;
  if (match) {
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    valid = year >= 1582 && year <= 9999 && month >= 1 && month <= 12
      && day >= 1 && day <= days && hour < 24 && minute < 60 && second < 60;
  }
  return {
    temperature: event.temperatureC, temperature_original: event.temperatureC, time: valid ? raw.slice(11, 16) : '', selected: false,
    temperature_corrected: '', time_corrected: '', use_corrected: false,
    source: 'bluetooth', device_model: model, device_key: null,
    device_timestamp: raw, received_at: event.receivedAt ?? null,
    device_date_reliability: raw === null
      ? (event.deviceTimestampReliability === 'invalid' ? 'invalid' : 'missing')
      : valid ? 'unverified' : 'invalid',
    device_timezone: 'unknown',
  };
};

const validIsoDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && normalizeBleMeasurement({ temperatureC: 0, deviceTimestamp: `${day}T00:00:00` }).device_date_reliability === 'unverified';

// Manual confirmation authorizes this incorporation, never verifies the device clock.
export const prepareManualBleDraft = (measurement, { isoDate, time, confirmed, userId, cycleId, nowMs } = {}) => {
  const localDate = new Date(`${isoDate}T${time}:00`);
  if (confirmed !== true || !userId || !cycleId || !validIsoDay(isoDate)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')
    || !Number.isFinite(nowMs) || !Number.isFinite(localDate.getTime()) || localDate.getTime() > nowMs
    || localDate.getHours() !== Number(time.slice(0, 2)) || localDate.getMinutes() !== Number(time.slice(3))
    || measurement?.source !== 'bluetooth' || measurement.device_model !== 'BM-Vinca2'
    || temperatureNumber(measurement.temperature) === null) {
    throw new Error('Confirma una fecha y hora reales válidas, no futuras.');
  }
  return { userId, cycleId, isoDate, manuallyConfirmed: true,
    measurements: [{ ...measurement, time, selected: true,
      confirmed_timestamp: `${isoDate}T${time}:00`,
      confirmed_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }] };
};

// Suspicion only: these are not unique measurement identifiers.
export const isPossibleBleDuplicate = (existing, incoming) => existing?.source === 'bluetooth'
  && existing.device_model === incoming?.device_model
  && typeof incoming.device_timestamp === 'string' && incoming.device_timestamp.length > 0
  && existing.device_timestamp === incoming.device_timestamp
  && temperatureNumber(existing.temperature_original ?? existing.temperature) === temperatureNumber(incoming.temperature_original ?? incoming.temperature);

/** Classifies a normalized BLE measurement, without selecting or saving anything.
 * cycles use the existing {id, startDate, endDate, data: records[]} shape.
 * cyclesComplete certifies the cycle ranges; recordsComplete certifies only the
 * destination cycle's daily-record list. Historical measurements need not be loaded.
 * Only destination-day records require measurementsLoaded/measurementsComplete.
 * The caller can use loadRecordMeasurements(..., {requireComplete: true}) to read
 * that day before classification; this function never performs reads itself.
 * dateEvidence must bind verified=true to this exact deviceTimestamp, provide its
 * resolved epochMs and destination isoDate (timezone resolution belongs to the verifier).
 * nowMs is injected: neither the system clock nor received_at establishes reliability.
 * maxAgeDays (365 by default) is a review policy, not a correction or medical limit.
 * getStableMeasurementKey, if supplied, must return a globally scoped, authoritative
 * per-measurement key for both inputs. device_key identifies a DEVICE and is not one.
 * duplicateCheck: {key, status: 'absent'} certifies an authoritative global lookup
 * for that exact key. A cache miss or an unloaded history cannot supply this evidence.
 * Without it, absence of a duplicate in the supplied records still requires review.
 */
export const classifyBleMeasurement = (measurement, {
  cycles = [], cyclesComplete = false, recordsComplete = false, dateEvidence,
  nowMs, maxAgeDays = 365, getStableMeasurementKey, duplicateCheck,
} = {}) => {
  const result = (status, reason, details = {}) => ({ status, reason, ...details });
  const review = (reason, details) => result('review', reason, details);
  const temperature = temperatureNumber(measurement?.temperature);
  if (measurement?.source !== 'bluetooth' || temperature === null) return review('invalid-measurement');
  const rawDate = measurement.device_timestamp;
  if (!rawDate) return review(measurement.device_date_reliability === 'invalid' ? 'invalid-date' : 'missing-date');
  const normalized = normalizeBleMeasurement({ temperatureC: temperature, deviceTimestamp: rawDate });
  if (normalized.device_date_reliability === 'invalid') return review('invalid-date');
  if (dateEvidence?.verified !== true || dateEvidence.deviceTimestamp !== rawDate
    || !Number.isFinite(dateEvidence.epochMs) || !validIsoDay(dateEvidence.isoDate)) {
    return review('unverified-date');
  }
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeDays) || maxAgeDays < 0) return review('invalid-date-policy');
  if (dateEvidence.epochMs > nowMs) return review('future-date');
  if (nowMs - dateEvidence.epochMs > maxAgeDays * 86400000 || dateEvidence.suspicious === true) {
    return review('suspicious-old-date');
  }
  const isoDate = dateEvidence.isoDate;
  if (!cyclesComplete || !Array.isArray(cycles)) return review('cycles-incomplete');
  if (cycles.some(cycle => !cycle?.id || !validIsoDay(cycle.startDate)
    || (cycle.endDate != null && (!validIsoDay(cycle.endDate) || cycle.endDate < cycle.startDate))
    || cycle.needsCompletion === true) || new Set(cycles.map(cycle => cycle.id)).size !== cycles.length) {
    return review('invalid-cycle-range');
  }
  const candidates = cycles.filter(cycle => isoDate >= cycle.startDate && (cycle.endDate == null || isoDate <= cycle.endDate));
  if (!candidates.length) return review('no-matching-cycle', { isoDate });
  if (candidates.length > 1) return review('ambiguous-cycle', { isoDate, cycleIds: candidates.map(cycle => cycle.id) });
  const cycle = candidates[0];
  const target = { isoDate, cycleId: cycle.id };
  if (!recordsComplete || !Array.isArray(cycle.data)) return review('records-incomplete', target);
  // Known positive matches are useful even in a partial history. A missing match
  // is not evidence of absence, and never triggers a demand to load all history.
  const records = cycles.flatMap(item => Array.isArray(item.data)
    ? item.data.filter(Boolean).map(record => ({ record, cycleId: item.id })) : []);
  const key = getStableMeasurementKey?.(measurement);
  if (typeof key === 'string' && key.trim()) {
    const matches = records.flatMap(({ record, cycleId }) => (Array.isArray(record.measurements) ? record.measurements : [])
      .filter(existing => existing?.source === 'bluetooth' && getStableMeasurementKey(existing) === key)
      .map(existing => ({ existing, entryId: record.id ?? null, cycleId })));
    if (matches.length > 1) return review('ambiguous-measurement-key', target);
    if (matches.length === 1) {
      const match = matches[0];
      if (temperatureNumber(match.existing.temperature) !== temperature) return review('measurement-key-conflict', target);
      return result('duplicate', 'stable-measurement-key', { cycleId: match.cycleId, entryId: match.entryId, measurementId: match.existing.id ?? null });
    }
  }
  // Only explicit canonical day fields are used; never infer timezone from timestamp.
  if (cycle.data.some(record => !record || !validIsoDay(record.isoDate ?? record.iso_date)
    || (record.isoDate && record.iso_date && record.isoDate !== record.iso_date))) {
    return review('invalid-record-date', target);
  }
  const dayRecords = cycle.data.filter(record => (record.isoDate ?? record.iso_date) === isoDate);
  if (dayRecords.length > 1) return review('duplicate-iso-date', target);
  const record = dayRecords[0];
  // Require the established strict-loading contract only for the destination day,
  // even when its cached array is empty or already contains some temperatures.
  if (record && (record.measurementsLoaded !== true || record.measurementsComplete !== true
    || !Array.isArray(record.measurements))) return review('measurements-incomplete', { ...target, entryId: record.id ?? null });
  if (record && measurementsFromRecord(record).length) return review('day-has-temperatures', { ...target, entryId: record.id ?? null });
  if (typeof key !== 'string' || !key.trim()) return review('missing-stable-measurement-key', target);
  if (duplicateCheck?.key !== key || duplicateCheck.status !== 'absent') {
    return review('duplicate-check-incomplete', target);
  }
  return result('ready', 'ready-for-import', { ...target, entryId: record?.id ?? null });
};
