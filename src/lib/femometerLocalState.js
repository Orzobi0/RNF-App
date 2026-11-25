export const femometerPreferenceValues = {
  volume: ['low', 'medium', 'high'], temperatureUnit: ['C', 'F'], measurementMode: ['quick', 'normal', 'precise'],
};
const validPreferences = values => Object.fromEntries(Object.entries(femometerPreferenceValues)
  .filter(([field, allowed]) => allowed.includes(values?.[field])).map(([field]) => [field, values[field]]));

// One small local document per account. Never a second collection of daily records.
// Local IDs identify review work only, not unique thermometer measurements.
export const createFemometerLocalState = (storage, userId, metadata = null) => {
  const key = `fertiliapp:ble-review:v1:${encodeURIComponent(userId)}`;
  const empty = () => ({ version: 1, activeDeviceKey: null, devices: {} });
  const raw = storage.getItem(key);
  let state = raw ? JSON.parse(raw) : empty();
  if (state.version !== 1 || !state.devices || typeof state.devices !== 'object') throw new Error('Almacenamiento Bluetooth no válido.');
  const commit = next => { storage.setItem(key, JSON.stringify(next)); state = next; };
  return {
    preferences: deviceKey => validPreferences({ ...state.devices[deviceKey]?.preferences, ...metadata?.get(deviceKey) }),
    saveMetadata: (deviceKey, values) => metadata?.patch(deviceKey, values),
    initializePreferences: deviceKey => {
      if (!deviceKey) throw new Error('Vinculación no confirmada.');
      const device = state.devices[deviceKey] ?? { pending: [], clock: null };
      if (device.preferences) return validPreferences(device.preferences);
      const preferences = { volume: 'medium', measurementMode: 'normal' };
      commit({ ...state, devices: { ...state.devices, [deviceKey]: { ...device, preferences } } });
      metadata?.patch(deviceKey, preferences, true);
      return { ...preferences };
    },
    savePreference: (deviceKey, field, value) => {
      if (!deviceKey || !femometerPreferenceValues[field]?.includes(value)) throw new Error('Preferencia Bluetooth no válida.');
      const device = state.devices[deviceKey] ?? { pending: [], clock: null };
      const preferences = { ...validPreferences(device.preferences), [field]: value };
      commit({ ...state, devices: { ...state.devices, [deviceKey]: { ...device, preferences } } });
      metadata?.patch(deviceKey, { [field]: value });
      return { ...preferences };
    },
    recover: () => Object.entries(state.devices).flatMap(([deviceKey, device]) => (device.pending ?? []).map(row => ({
      ...row, deviceKey, importStatus: row.importStatus === 'saving' ? 'uncertain' : row.importStatus,
      reviewError: row.importStatus === 'saving' ? { code: 'ble-result-uncertain', message: 'El guardado se interrumpió. Comprueba el día en Mis registros antes de volver a incorporar.' } : row.reviewError,
    }))).sort((a, b) => a.receivedOrder - b.receivedOrder),
    hasNativeDelivery: id => Boolean(id && state.nativeDeliveries?.includes(id)),
    saveReadings: (readings, nativeDeliveryId = null) => {
      const devices = Object.fromEntries(Object.entries(state.devices).map(([id, device]) => [id, { ...device, pending: [] }]));
      for (const row of readings) {
        if (!row.deviceKey || row.importStatus === 'incorporated' || row.importStatus === 'discarded') continue;
        devices[row.deviceKey] ??= { clock: null, pending: [] };
        // Retain only minimal transport provenance, never raw packets or MAC addresses.
        const { nativeDeliveryId, uiId, localId, receivedOrder, deviceKey, deviceModel, temperatureC, deviceTimestamp, receivedAt,
          normalized, transport, importStatus, draft, reviewError, dateReview, attempt, automaticEligible, automaticChecked } = row;
        devices[row.deviceKey].pending.push({ nativeDeliveryId, uiId, localId, receivedOrder, deviceKey, deviceModel, temperatureC,
          deviceTimestamp, receivedAt, normalized, transport, importStatus, draft, reviewError, dateReview, attempt, automaticEligible, automaticChecked });
      }
      // Receipt and pending row commit together. Receipt survives incorporation:
      // an interrupted native ACK must never replay a Firestore attempt on reload.
      const nativeDeliveries = nativeDeliveryId && !state.nativeDeliveries?.includes(nativeDeliveryId)
        ? [...(state.nativeDeliveries ?? []), nativeDeliveryId] : state.nativeDeliveries ?? [];
      commit({ ...state, devices, nativeDeliveries });
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
      const next = { ...state, devices: { ...state.devices, [deviceKey]: { ...device, clock } } };
      try { commit(next); } catch (error) { state = next; throw error; } // Never forget an observed incident in this session.
      return clock;
    },
  };
};

export const updateFemometerClockHistory = (previous, observation) => {
  if (observation.snapshot || observation.errorCode === 'CLOCK_SNAPSHOT_STALE') return { ...previous, pendingCheck: null, staleCheck: observation };
  if (observation.errorCode === 'CLOCK_PENDING') return { ...previous, pendingCheck: observation,
    lastIncidentAt: previous?.pendingCheck?.checkedAt ?? previous?.lastIncidentAt ?? null };
  const valid = !observation.errorCode && !observation.phoneZoneChanged && Number.isFinite(observation.driftSeconds);
  const syncVerified = valid && Math.abs(observation.driftSeconds) <= 120 && observation.operation === 'sync' && observation.verified === true;
  const state = !valid ? 'unknown' : Math.abs(observation.driftSeconds) > 120 ? 'misaligned'
    : syncVerified ? 'synchronized_verified' : 'read_correct';
  const last = previous?.lastCheck;
  const changed = last && (last.phoneTimeZone !== observation.phoneTimeZone
    || last.phoneUtcOffsetMinutes !== observation.phoneUtcOffsetMinutes
    || (valid && Number.isFinite(last.driftSeconds) && Math.abs(last.driftSeconds - observation.driftSeconds) > 120));
  const incident = !valid || (observation.operation === 'sync' && !syncVerified) || Math.abs(observation.driftSeconds) > 120 || changed;
  // A redundant verified write must not erase an already established clock interval.
  // A correction, incident, zone change or invalidation always starts a new one.
  const priorSync = previous?.confidenceStart ?? previous?.lastVerifiedSync;
  const continues = priorSync?.continuityTracked === true && !incident && !previous?.invalidatedAt
    && (previous?.lastIncidentAt ?? 0) <= priorSync.checkedAt
    && (previous?.lastSignificantChange?.checkedAt ?? 0) <= priorSync.checkedAt;
  // An attributed initial read is operational evidence for today's/yesterday's
  // takes too. A later good read cannot erase an observed clock incident.
  const initialRead = state === 'read_correct' && observation.operation === 'read'
    && observation.deviceKey && Number.isFinite(observation.connectedAt)
    && observation.checkedAt >= observation.connectedAt && !priorSync
    && !previous?.lastIncidentAt && !previous?.invalidatedAt && !incident;
  return { ...previous, confidenceStart: syncVerified
      ? (continues ? priorSync : { ...observation, continuityTracked: true })
      : initialRead ? { ...observation, continuityTracked: true } : previous?.confidenceStart ?? null,
    state, historyVersion: 2, pendingCheck: null, staleCheck: null, lastCheck: observation,
    invalidatedAt: syncVerified ? null : previous?.invalidatedAt ?? null,
    lastIncidentAt: incident ? Math.max(observation.checkedAt, previous?.lastIncidentAt ?? 0) : previous?.lastIncidentAt ?? null,
    lastValidCheck: valid ? observation : previous?.lastValidCheck ?? null,
    lastVerifiedSync: syncVerified ? { ...observation, continuityTracked: true } : previous?.lastVerifiedSync ?? null,
    lastSignificantChange: changed ? observation : previous?.lastSignificantChange ?? null };
};
