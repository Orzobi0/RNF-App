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
    temperature: event.temperatureC, time: valid ? raw.slice(11, 16) : '', selected: false,
    temperature_corrected: '', time_corrected: '', use_corrected: false,
    source: 'bluetooth', device_model: model, device_key: null,
    device_timestamp: raw, received_at: event.receivedAt ?? null,
    device_date_reliability: raw === null
      ? (event.deviceTimestampReliability === 'invalid' ? 'invalid' : 'missing')
      : valid ? 'unverified' : 'invalid',
    device_timezone: 'unknown',
  };
};
