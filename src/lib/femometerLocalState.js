export const femometerPreferenceValues = {
  volume: ['low', 'medium', 'high'], measurementMode: ['quick', 'normal', 'precise'],
};
const validPreferences = values => Object.fromEntries(Object.entries(femometerPreferenceValues)
  .filter(([field, allowed]) => allowed.includes(values?.[field])).map(([field]) => [field, values[field]]));

// One small local document per account. Never a second collection of daily records.
// Local IDs identify review work only, not unique thermometer measurements.
export const createFemometerLocalState = (storage, userId) => {
  const key = `fertiliapp:ble-review:v1:${encodeURIComponent(userId)}`;
  const empty = () => ({ version: 1, activeDeviceKey: null, devices: {} });
  const raw = storage.getItem(key);
  let state = raw ? JSON.parse(raw) : empty();
  if (state.version !== 1 || !state.devices || typeof state.devices !== 'object') throw new Error('Almacenamiento Bluetooth no válido.');
  const commit = next => { storage.setItem(key, JSON.stringify(next)); state = next; };
  return {
    preferences: deviceKey => validPreferences(state.devices[deviceKey]?.preferences),
    initializePreferences: deviceKey => {
      if (!deviceKey) throw new Error('Vinculación no confirmada.');
      const device = state.devices[deviceKey] ?? { pending: [], clock: null };
      if (device.preferences) return validPreferences(device.preferences);
      const preferences = { volume: 'medium', measurementMode: 'normal' };
      commit({ ...state, devices: { ...state.devices, [deviceKey]: { ...device, preferences } } });
      return { ...preferences };
    },
    savePreference: (deviceKey, field, value) => {
      if (!deviceKey || !femometerPreferenceValues[field]?.includes(value)) throw new Error('Preferencia Bluetooth no válida.');
      const device = state.devices[deviceKey] ?? { pending: [], clock: null };
      const preferences = { ...validPreferences(device.preferences), [field]: value };
      commit({ ...state, devices: { ...state.devices, [deviceKey]: { ...device, preferences } } });
      return { ...preferences };
    },
    recover: () => Object.entries(state.devices).flatMap(([deviceKey, device]) => (device.pending ?? []).map(row => ({
      ...row, deviceKey, importStatus: row.importStatus === 'saving' ? 'uncertain' : row.importStatus,
      reviewError: row.importStatus === 'saving' ? { code: 'ble-result-uncertain', message: 'El guardado se interrumpió. Comprueba el día en Mis registros antes de volver a incorporar.' } : row.reviewError,
    }))).sort((a, b) => a.receivedOrder - b.receivedOrder),
    saveReadings: readings => {
      const devices = Object.fromEntries(Object.entries(state.devices).map(([id, device]) => [id, { ...device, pending: [] }]));
      for (const row of readings) {
        if (!row.deviceKey || row.importStatus === 'incorporated' || row.importStatus === 'discarded') continue;
        devices[row.deviceKey] ??= { clock: null, pending: [] };
        // Do not retain raw packets or transport diagnostics in durable review work.
        const { uiId, localId, receivedOrder, deviceKey, temperatureC, deviceTimestamp, receivedAt,
          normalized, importStatus, draft, reviewError, dateReview, attempt } = row;
        devices[row.deviceKey].pending.push({ uiId, localId, receivedOrder, deviceKey, temperatureC,
          deviceTimestamp, receivedAt, normalized, importStatus, draft, reviewError, dateReview, attempt });
      }
      commit({ ...state, devices });
    },
    activate: deviceKey => {
      if (deviceKey === state.activeDeviceKey) return;
      const devices = { ...state.devices };
      const old = state.activeDeviceKey;
      if (old && devices[old]?.clock) devices[old] = { ...devices[old], clock: { ...devices[old].clock, state: 'unknown', invalidatedAt: Date.now() } };
      commit({ ...state, activeDeviceKey: deviceKey ?? null, devices });
    },
    clock: deviceKey => state.devices[deviceKey]?.clock ?? null,
    saveClock: (deviceKey, observation) => {
      if (!deviceKey || deviceKey !== state.activeDeviceKey) return null;
      const device = state.devices[deviceKey] ?? { pending: [] };
      const clock = updateFemometerClockHistory(device.clock, observation);
      commit({ ...state, devices: { ...state.devices, [deviceKey]: { ...device, clock } } });
      return clock;
    },
  };
};

export const updateFemometerClockHistory = (previous, observation) => {
  const valid = !observation.errorCode && !observation.phoneZoneChanged && Number.isFinite(observation.driftSeconds);
  const syncVerified = valid && observation.operation === 'sync' && observation.verified === true;
  const state = !valid ? 'unknown' : Math.abs(observation.driftSeconds) > 120 ? 'misaligned'
    : syncVerified ? 'synchronized_verified' : 'read_correct';
  const last = previous?.lastCheck;
  const changed = last && (last.phoneTimeZone !== observation.phoneTimeZone
    || last.phoneUtcOffsetMinutes !== observation.phoneUtcOffsetMinutes
    || (valid && Number.isFinite(last.driftSeconds) && Math.abs(last.driftSeconds - observation.driftSeconds) > 120));
  return { ...previous, state, lastCheck: observation,
    lastValidCheck: valid ? observation : previous?.lastValidCheck ?? null,
    lastVerifiedSync: syncVerified ? observation : previous?.lastVerifiedSync ?? null,
    lastSignificantChange: changed ? observation : previous?.lastSignificantChange ?? null };
};
