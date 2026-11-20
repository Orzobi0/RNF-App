import { temperatureNumber, measurementsFromRecord } from './temperatureMeasurements.js';
import { implementedThermometer } from './thermometerCatalog.js';

// EBT-300 has no documented unit flag. This inference remains provisional.
const interpretEasyHome = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 32 && value <= 43) return { unit: 'celsius', celsius: value };
  if (value >= 89.6 && value <= 109.4) return { unit: 'fahrenheit', celsius: Math.round((value - 32) * 5 / 9 * 100) / 100 };
  return null;
};

export const authorizedBleMeasurement = measurement => {
  if (measurement?.device_protocol === 'easyhome-ebt300') {
    const original = interpretEasyHome(measurement.transmitted_temperature ?? measurement.temperature_original ?? measurement.temperature);
    const value = temperatureNumber(measurement.temperature);
    if (!original || value === null || value < 32 || value > 43) return false;
    if (measurement.transmitted_unit !== 'celsius' && (measurement.temperature_interpretation !== 'range-inference-provisional'
      || measurement.inferred_temperature_unit !== original.unit)) return false;
  }
  // Historical Vinca rows predate protocol/provenance fields and remain reviewable.
  if (!measurement?.device_protocol) return measurement?.device_model === 'BM-Vinca2';
  return Boolean(measurement.device_key) && measurement.reception_validated === true
    && implementedThermometer({ model: measurement.device_model, protocol: measurement.device_protocol,
      compatibility: measurement.device_protocol === 'vinca2' ? 'compatible' : 'experimental' });
};

// Normalizes transport diagnostics to the common measurement shape, without persistence.
// A syntactically valid device clock is still unverified, including after a clock sync:
// buffered readings can predate the adjustment and contain no timezone information.
export const normalizeBleMeasurement = (event, model = null) => {
  if (typeof event?.temperatureC !== 'number' || !Number.isFinite(event.temperatureC)) return null;
  const easy = event.deviceProtocol === 'easyhome-ebt300';
  const interpreted = easy ? interpretEasyHome(event.temperatureOriginal ?? event.temperatureC) : null;
  if (easy && !interpreted) return null;
  const temperature = interpreted?.celsius ?? event.temperatureC;
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
    temperature, temperature_original: temperature, time: valid ? raw.slice(11, 16) : '', selected: false,
    temperature_corrected: '', time_corrected: '', use_corrected: false,
    source: 'bluetooth', device_model: event.deviceModel ?? model, device_key: typeof event.deviceKey === 'string' ? event.deviceKey : null,
    device_protocol: event.deviceProtocol ?? null, reception_validated: event.receptionValidated === true && event.experimental !== true,
    device_custom_name: event.deviceCustomName ?? null, device_name: event.deviceName ?? null, transmitted_temperature: event.temperatureOriginal ?? event.temperatureC,
    ...(easy ? { inferred_temperature_unit: interpreted.unit, temperature_interpretation: 'range-inference-provisional' } : {}),
    transmitted_unit: easy ? 'unknown' : event.temperatureUnit ?? 'celsius', measurement_kind: event.measurementKind ?? null,
    device_timestamp: raw, received_at: event.receivedAt ?? null,
    device_date_reliability: raw === null
      ? (event.deviceTimestampReliability === 'invalid' ? 'invalid' : 'missing')
      : valid ? 'unverified' : 'invalid',
    device_timezone: 'unknown',
  };
};

// Wall-clock resolution is a range check, NOT evidence of the clock's accuracy.
// A named zone is mandatory for timestamps without an offset. Enumerating the
// zone's offsets around that day detects both repeated and nonexistent DST times.
export const classifyBleMeasurementAge = (measurement, { nowMs, timeZone, calendarDays = false } = {}) => {
  const review = reason => ({ status: 'review', reason, candidate: false });
  const raw = measurement?.device_timestamp;
  if (!raw) return review('missing-date');
  if (normalizeBleMeasurement({ temperatureC: 0, deviceTimestamp: raw })?.device_date_reliability !== 'unverified') return review('invalid-date');
  if (!Number.isFinite(nowMs)) return review('unknown-reference-time');
  let epochs;
  if (/(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const epoch = Date.parse(raw);
    if (!Number.isFinite(epoch)) return review('invalid-date');
    epochs = [epoch];
  } else {
    if (!timeZone) return review('unknown-time-zone');
    try {
      const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      const wall = epoch => { const parts = Object.fromEntries(format.formatToParts(epoch).map(p => [p.type, p.value]));
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`; };
      const nominal = Date.parse(`${raw.slice(0, 19)}Z`);
      const offsets = new Set();
      for (let hour = -36; hour <= 36; hour++) {
        const probe = nominal + hour * 3600000;
        offsets.add(Date.parse(`${wall(probe)}Z`) - probe);
      }
      epochs = [...offsets].map(offset => nominal - offset).filter(epoch => wall(epoch) === raw.slice(0, 19));
    } catch { return review('unknown-time-zone'); }
  }
  if (!epochs.length) return review('nonexistent-local-date');
  if (epochs.length !== 1) return review('ambiguous-local-date');
  const ageMs = nowMs - epochs[0];
  if (ageMs < 0) return review('future-date');
  if (calendarDays) {
    try {
      const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const day = epoch => {
        const parts = Object.fromEntries(format.formatToParts(epoch).map(p => [p.type, p.value]));
        return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
      };
      const difference = day(nowMs) - day(epochs[0]);
      if (difference !== 0 && difference !== 86400000) return review('not-today-or-yesterday');
    } catch { return review('unknown-time-zone'); }
  } else if (ageMs > 86400000) return review('older-than-24-hours');
  return { status: 'candidate', candidate: true, reason: 'within-24-hours-not-verified', epochMs: epochs[0], ageMs };
};

// Operational confidence requires a history that retains clock incidents.
export const assessVinca2AutomaticDate = (measurement, { deviceKey, nowMs, timeZone, clockHistory } = {}) => {
  const review = reason => ({ status: 'review', reason });
  if (measurement?.device_protocol !== 'vinca2' || measurement.device_model !== 'BM-Vinca2'
    || measurement.reception_validated !== true || !deviceKey || measurement.device_key !== deviceKey) return review('device-identity-unavailable');
  if (!timeZone) return review('unknown-time-zone');
  const age = classifyBleMeasurementAge(measurement, { nowMs, timeZone, calendarDays: true });
  if (!age.candidate) return age;
  const sync = clockHistory?.lastVerifiedSync, check = clockHistory?.lastValidCheck;
  if (clockHistory?.historyVersion !== 2 || sync?.continuityTracked !== true || sync?.operation !== 'sync' || sync.verified !== true || !Number.isFinite(sync.checkedAt)
    || !Number.isFinite(check?.checkedAt)) return review('clock-history-insufficient');
  if (sync.checkedAt >= age.epochMs) return review('measurement-before-clock-sync');
  if (check.checkedAt < age.epochMs || check.checkedAt > nowMs) return review('clock-check-not-after-measurement');
  if (![sync, check].every(value => !value.errorCode && !value.phoneZoneChanged
    && Number.isFinite(value.phoneUtcOffsetMinutes) && Number.isFinite(value.driftSeconds) && Math.abs(value.driftSeconds) <= 120)) return review('clock-misaligned');
  if (sync.phoneTimeZone !== timeZone || check.phoneTimeZone !== timeZone
    || sync.phoneUtcOffsetMinutes !== check.phoneUtcOffsetMinutes) return review('clock-time-zone-changed');
  if (clockHistory.staleCheck || clockHistory.pendingCheck || clockHistory.invalidatedAt || clockHistory.lastIncidentAt > sync.checkedAt || clockHistory.lastSignificantChange?.checkedAt > sync.checkedAt
    || !['read_correct', 'synchronized_verified'].includes(clockHistory.state)) return review('clock-trust-interrupted');
  return { status: 'ready', reason: 'operational-clock-confidence', epochMs: age.epochMs };
};

export const automaticBleReviewMessage = reason => ({
  'clock-history-insufficient': 'Es necesario sincronizar el reloj. La nueva referencia servirá para las próximas mediciones.',
  'measurement-before-clock-sync': 'La temperatura es anterior a la última sincronización. Revisa su fecha original.',
  'clock-check-not-after-measurement': 'Falta una comprobación posterior del reloj. La temperatura necesita revisión.',
  'clock-misaligned': 'El reloj supera la tolerancia de 120 segundos. La temperatura necesita revisión.',
  'clock-trust-interrupted': 'Hay una incidencia del reloj. La temperatura necesita revisión.',
  'clock-time-zone-changed': 'Ha cambiado la zona horaria. Revisa la fecha de la temperatura.',
  'device-identity-unavailable': 'No se ha podido validar el termómetro vinculado.',
})[reason] ?? 'La fecha necesita revisión. Solo se incorporan automáticamente temperaturas de hoy o ayer con fecha válida.';

// Draft authorization only: the transaction rechecks server preferences and history.
export const prepareAutomaticBleDraft = (measurement, context = {}) => {
  const decision = assessVinca2AutomaticDate(measurement, context);
  if (decision.status !== 'ready' || context.incorporationMode !== 'automatic'
    || context.automaticConsent !== 'v2' || !context.userId || !context.cycleId
    || measurement?.source !== 'bluetooth' || temperatureNumber(measurement.temperature) === null
    || measurement.temperature < 32 || measurement.temperature > 43
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(measurement.device_timestamp)) {
    throw Object.assign(new Error(automaticBleReviewMessage(decision.reason)), {
      code: 'ble-auto-review', title: 'Temperatura pendiente de revisión', reason: decision.reason,
    });
  }
  const isoDate = measurement.device_timestamp.slice(0, 10);
  return { userId: context.userId, cycleId: context.cycleId, isoDate, automaticallyConfirmed: true,
    measurements: [{ ...measurement, selected: false, time: measurement.device_timestamp.slice(11, 16),
      confirmed_timestamp: measurement.device_timestamp, confirmed_timezone: context.timeZone,
      automatic_date_confidence: 'operational-v2' }] };
};

// Processing receipts must come from a confirmed app write, never BLE fields or
// matching temperature/time. No current packet proves the clock epoch of a take.
export const decideVinca2Reading = (measurement, { existing = [], receipt, localId, userId, deviceKey, nowMs, timeZone, clockHistory, cycleCertain, saveStatus } = {}) => {
  if (!measurement || measurement.source !== 'bluetooth') return { status: 'review', reason: 'invalid-measurement' };
  if (receipt?.serverConfirmed === true && localId && receipt.localId === localId
    && userId && receipt.userId === userId && deviceKey && receipt.deviceKey === deviceKey
    && measurement.device_key === deviceKey) return { status: 'already_processed', reason: 'confirmed-processing-receipt' };
  if (existing.some(item => isPossibleBleDuplicate(item, measurement))) return { status: 'possible_duplicate', reason: 'same-original-minute-and-temperature' };
  if (!deviceKey || measurement.device_key !== deviceKey) return { status: 'review', reason: 'device-identity-unavailable' };
  if (measurement.device_date_reliability === 'invalid' || measurement.device_date_reliability === 'missing') return { status: 'review', reason: 'invalid-or-missing-date' };
  if (saveStatus === 'uncertain') return { status: 'review', reason: 'save-result-unknown' };
  if (Number.isFinite(nowMs)) {
    const age = classifyBleMeasurementAge(measurement, { nowMs, timeZone });
    if (!age.candidate) return age;
    if (clockHistory?.state === 'misaligned') return { status: 'review', reason: 'clock-misaligned', candidate: true };
    if (!clockHistory?.lastVerifiedSync || !clockHistory?.lastValidCheck || clockHistory.invalidatedAt || clockHistory.state === 'unknown') return { status: 'review', reason: 'clock-history-insufficient', candidate: true };
    if (age.epochMs < clockHistory.lastVerifiedSync.checkedAt) return { status: 'review', reason: 'measurement-before-clock-sync', candidate: true };
    if (cycleCertain !== true) return { status: 'review', reason: 'destination-cycle-uncertain', candidate: true };
  }
  return { status: 'review', reason: 'measurement-clock-epoch-unproven' };
};

const validIsoDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && normalizeBleMeasurement({ temperatureC: 0, deviceTimestamp: `${day}T00:00:00` }).device_date_reliability === 'unverified';

// Manual confirmation authorizes this incorporation, never verifies the device clock.
export const prepareManualBleDraft = (measurement, { isoDate, time, temperatureC, confirmed, userId, cycleId, nowMs } = {}) => {
  if (measurement?.device_protocol === 'easyhome-ebt300' && !authorizedBleMeasurement(measurement)) {
    throw Object.assign(new Error('La lectura EBT-300 no tiene una temperatura o una recepción válidas.'), {
      code: 'ble-invalid-reading', title: 'Lectura pendiente de comprobación',
    });
  }
  const editable = measurement?.device_protocol === 'easyhome-ebt300' && measurement.measurement_kind === 'historical';
  const reviewed = editable ? temperatureNumber(temperatureC) : temperatureNumber(measurement?.temperature);
  if (editable && (reviewed === null || reviewed < 32 || reviewed > 43)) {
    throw Object.assign(new Error('Revisa la temperatura en °C (entre 32 y 43).'), { code: 'ble-invalid-temperature', title: 'Revisa la temperatura' });
  }
  const localDate = new Date(`${isoDate}T${time}:00`);
  if (confirmed !== true || !userId || !cycleId || !validIsoDay(isoDate)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')
    || !Number.isFinite(nowMs) || !Number.isFinite(localDate.getTime()) || localDate.getTime() > nowMs
    || localDate.getHours() !== Number(time.slice(0, 2)) || localDate.getMinutes() !== Number(time.slice(3))
    || measurement?.source !== 'bluetooth' || !authorizedBleMeasurement(measurement)
    || temperatureNumber(measurement.temperature) === null) {
    throw new Error('Confirma una fecha y hora reales válidas, no futuras.');
  }
  return { userId, cycleId, isoDate, manuallyConfirmed: true,
    measurements: [{ ...measurement, ...(editable ? { temperature: reviewed } : {}), time, selected: true,
      confirmed_timestamp: `${isoDate}T${time}:00`,
      confirmed_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }] };
};

// BM-Vinca2 can resend the same original minute with different seconds.
const originalMinute = timestamp => {
  const normalized = normalizeBleMeasurement({ temperatureC: 0, deviceTimestamp: timestamp });
  return normalized.device_date_reliability === 'unverified' ? timestamp.slice(0, 16) : null;
};

// Suspicion only: these are not unique measurement identifiers. Reception time
// and the user's confirmed date never identify a measurement from the device.
export const isPossibleBleDuplicate = (existing, incoming) => existing?.source === 'bluetooth'
  && existing.device_model === incoming?.device_model
  && (!existing.device_key || !incoming?.device_key || existing.device_key === incoming.device_key)
  && (typeof incoming.device_timestamp === 'string' && incoming.device_timestamp.length > 0 && existing.device_timestamp
    ? (incoming.device_model === 'BM-Vinca2'
    ? originalMinute(incoming.device_timestamp) !== null && originalMinute(existing.device_timestamp) === originalMinute(incoming.device_timestamp)
    : existing.device_timestamp === incoming.device_timestamp)
    : Boolean(incoming.confirmed_timestamp && existing.confirmed_timestamp && incoming.confirmed_timestamp.slice(0, 16) === existing.confirmed_timestamp.slice(0, 16)))
  && temperatureNumber(incoming.temperature_original ?? incoming.temperature) !== null
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
