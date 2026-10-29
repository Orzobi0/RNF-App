import { format, parseISO, isValid } from 'date-fns';

export const temperatureNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

export const hasMeasurementTemperature = (measurement) =>
  temperatureNumber(measurement?.temperature) !== null ||
  temperatureNumber(measurement?.temperature_corrected) !== null;

export const normalizeMeasurements = (measurements) => {
  const valid = measurements.filter(hasMeasurementTemperature);
  const selected = Math.max(0, valid.findIndex((m) => m.selected));
  return valid.map((m, index) => ({ ...m, selected: index === selected }));
};

export const newManualMeasurement = () => ({
  temperature: '', time: format(new Date(), 'HH:mm'), selected: false,
  temperature_corrected: '', time_corrected: '', use_corrected: false,
  source: 'manual', device_model: null, device_key: null,
});

export const measurementsFromRecord = (record, loaded = record?.measurements) => {
  if (loaded?.length) return normalizeMeasurements(loaded);
  const time = record?.timestamp && isValid(parseISO(record.timestamp))
    ? format(parseISO(record.timestamp), 'HH:mm') : '';
  return normalizeMeasurements([{
    temperature: record?.temperature_raw ?? '',
    temperature_corrected: record?.temperature_corrected ?? '',
    time, time_corrected: record?.temperature_time_corrected ?? time,
    selected: true, use_corrected: !!record?.use_corrected,
    source: record?.temperature_source ?? null,
    device_model: record?.temperature_device_model ?? null,
    device_key: record?.temperature_device_key ?? null,
  }]);
};

// Sort only the presentation, retaining the original index for every action.
export const sortedMeasurements = (measurements) => measurements
  .map((measurement, index) => ({ measurement, index }))
  .sort((a, b) => (a.measurement.time || '99:99').localeCompare(b.measurement.time || '99:99') || a.index - b.index);

export const measurementSourceLabel = (measurement, resolvedLabel) => {
  if (resolvedLabel) return resolvedLabel;
  if (measurement?.source === 'manual') return 'Manual';
  if (measurement?.source === 'bluetooth') {
    return measurement.device_model === 'BM-Vinca2' ? 'Vinca 2' : measurement.device_model || 'Bluetooth';
  }
  return null;
};

export const measurementDisplay = (measurement) => {
  const value = temperatureNumber(measurement?.use_corrected
    ? measurement.temperature_corrected : measurement?.temperature)
    ?? temperatureNumber(measurement?.temperature);
  return value === null ? '-' : `${value.toFixed(2).replace('.', ',')} °C`;
};

export const selectedMeasurementSummary = (measurements) => {
  const valid = normalizeMeasurements(measurements);
  const selected = valid.find((m) => m.selected);
  const raw = temperatureNumber(selected?.temperature);
  const corrected = temperatureNumber(selected?.temperature_corrected);
  const useCorrected = !!selected?.use_corrected && corrected !== null;
  return {
    temperature_raw: raw,
    temperature_corrected: corrected,
    use_corrected: useCorrected,
    temperature_chart: useCorrected ? corrected : raw,
    temperature_source: selected?.source ?? null,
    temperature_device_model: selected?.device_model ?? null,
    temperature_device_key: selected?.device_key ?? null,
    temperature_time_corrected: selected?.time_corrected ?? null,
  };
};

export const measurementTimeForSummary = (measurements) => {
  const selected = normalizeMeasurements(measurements).find((m) => m.selected);
  return selected?.time?.trim() || measurements.find((m) => m?.time?.trim())?.time || null;
};

export const loadRecordMeasurements = async (record, cycleId, getMeasurements, options = {}) => {
  if (!record?.id || String(record.id).startsWith('placeholder-')) return measurementsFromRecord(record);
  const complete = options.requireComplete
    ? record.measurementsLoaded === true && record.measurementsComplete === true
    : record.measurementsComplete !== false && (record.measurementsLoaded || record.measurements?.length);
  const loaded = complete ? record.measurements : options.requireComplete
    ? await getMeasurements(cycleId, record.id, options)
    : await getMeasurements(cycleId, record.id);
  return measurementsFromRecord(record, loaded);
};

// Sheet actions commit only their own changes. Inline temperature/correction
// drafts stay in the form until Update, even when another row is selected.
export const measurementsForSheetSave = (saved, current, next, operation = {}) => {
  if (saved.length !== current.length) return next;
  const { action, index } = operation;
  if (action === 'select') return saved.map((m, i) => ({ ...m, selected: next[i].selected }));
  if (action === 'edit') return saved.map((m, i) => i === index ? next[i] : m);
  if (action === 'add') return normalizeMeasurements([...saved, next[next.length - 1]]);
  if (action === 'delete') return normalizeMeasurements(saved.filter((_, i) => i !== index));
  return next;
};

// Summary-only edits must never claim that the subcollection is complete.
export const measurementPayloadForRecord = (record) => ({
  measurements: measurementsFromRecord(record),
  measurementsComplete: record?.measurementsComplete !== false && Boolean(record?.measurementsLoaded || record?.measurements?.length),
});
