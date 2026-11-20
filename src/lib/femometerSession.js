import { thermometerCapabilities } from './thermometerCapabilities.js';

// Only these five session-scoped values cross into the UI; never retain identifiers.
export const normalizeFemometerDeviceInfo = value => {
  const text = input => {
    if (typeof input !== 'string') return null;
    const clean = input.replace(/[\p{C}\uFFFD]/gu, '').trim();
    return clean && [...clean].length <= 128 ? clean : null;
  };
  return {
    battery: Number.isInteger(value?.battery) && value.battery >= 0 && value.battery <= 100 ? value.battery : null,
    model: text(value?.model), manufacturer: text(value?.manufacturer),
    firmware: text(value?.firmware), software: text(value?.software),
  };
};

// Compare wall-clock components: the thermometer reports local time without a zone.
export const femometerClockDriftSeconds = (value, now = Date.now()) => {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || !Number.isFinite(now)) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const device = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (device.getUTCFullYear() !== year || device.getUTCMonth() !== month - 1 || device.getUTCDate() !== day
    || device.getUTCHours() !== hour || device.getUTCMinutes() !== minute || device.getUTCSeconds() !== second) return null;
  const phone = new Date(now);
  return Math.round((device.getTime() - Date.UTC(phone.getFullYear(), phone.getMonth(), phone.getDate(),
    phone.getHours(), phone.getMinutes(), phone.getSeconds())) / 1000);
};

// Local wall-clock thresholds; never reinterpret a thermometer timestamp as UTC.
export const FEMOMETER_CLOCK_TOLERANCE_SECONDS = 120;
export const FEMOMETER_AUTO_CLOCK_SYNC_SECONDS = 24 * 60 * 60;
const requiresReconnect = code => /(?:TIMEOUT|RECONNECT_REQUIRED|INVALID_RESPONSE|FIRST_WRITE_FAILED|CONFIRM_WRITE_FAILED)$/.test(code || '')
  || ['CLOCK_OPERATION_FAILED', 'DEVICE_INFO_READ_FAILED', 'NATIVE_BRIDGE_UNAVAILABLE', 'UNKNOWN'].includes(code);

// One native BLE owner across panel remounts, including React StrictMode replay.
// The injected bridge also lets lifecycle races be tested without BLE hardware.
export const createFemometerSessionManager = (api) => {
  let owner;
  return (userId, onState, onTemperature, localState = null) => {
    const ready = owner ? owner.dispose() : Promise.resolve();
    let disposed = false;
    let acquired = false;
    let version = 0;
    let job;
    let clockJob;
    let deviceInfoJob;
    let volumeJob;
    let measurementModeJob;
    let automaticConfigurationPending = false;
    let configurationJob;
    let bindingJob;
    let cancelChangeJob;
    let promotedReplay;
    const sameReading = (a, b) => a && b && a.deviceKey === b.deviceKey && a.deviceProtocol === b.deviceProtocol
      && a.deviceTimestamp && a.deviceTimestamp === b.deviceTimestamp && a.temperatureC === b.temperatureC
      && a.temperatureUnit === b.temperatureUnit;
    let stopping;
    let disposal;
    let subscription;
    const now = api.now ?? Date.now;
    let listeningExpiresAt = 0;
    let lastForegroundAttempt = -Infinity;
    let resumeJob;
    let resumeLifecycle;
    let restartJob;
    let suspended = false;
    let lifecycleVersion = 0;
    let disconnectJob;
    const disconnect = () => {
      if (disconnectJob) return disconnectJob;
      if (!acquired) return Promise.resolve();
      disconnectJob = Promise.resolve().then(() => api.disconnectFemometer())
        .then(() => { acquired = false; }).finally(() => { disconnectJob = null; });
      return disconnectJob;
    };
    let state = {
      preferences: {}, preferenceError: null, configurationBusy: false, configurationIssue: false, gattReconnectRequired: false, bindingBusy: false, changingDevice: false,
      status: 'checking', busy: false, remembered: null, devices: [], bindings: [], preferencesByDevice: {},
      selectedDeviceId: '', inspectionResult: null, error: null, listenerResult: null,
      volumeBusy: false, volumeResult: null, volumeError: null, volumeReconnectRequired: false,
      measurementModeBusy: false, measurementModeResult: null, measurementModeError: null, measurementModeReconnectRequired: false,
      deviceInfoStatus: 'idle', deviceInfoBusy: false, deviceInfoResult: null, deviceInfoError: null,
      capabilities: thermometerCapabilities(), clockBusy: false, clockResult: null, clockError: null,
    };
    const publish = (patch) => {
      state = { ...state, ...patch };
      if (!disposed) onState(state);
    };
    const applyBindings = saved => {
      const bindings = Array.isArray(saved.bindings) ? saved.bindings : saved.remembered && saved.deviceKey
        ? [{ deviceKey: saved.deviceKey, model: saved.model ?? 'BM-Vinca2' }] : [];
      const preferencesByDevice = Object.fromEntries(bindings.map(device => {
        try { return [device.deviceKey, { ...localState?.preferences(device.deviceKey), ...(device.protocol === 'easyhome-ebt300' ? { temperatureUnit: 'C' } : {}) }]; } catch { return [device.deviceKey, {}]; }
      }));
      publish({ bindings, preferencesByDevice, remembered: saved.remembered, deviceKey: saved.deviceKey ?? null,
        boundModel: saved.model ?? (saved.remembered && !saved.protocol ? 'BM-Vinca2' : null), boundName: saved.name, boundProtocol: saved.protocol, boundCompatibility: saved.compatibility });
    };
    const loadPreferences = deviceKey => {
      try {
        if (!localState) throw new Error('Almacenamiento no disponible.');
        const preferences = { ...localState.preferences(deviceKey), ...(state.boundProtocol === 'easyhome-ebt300' ? { temperatureUnit: 'C' } : {}) };
        publish({ preferences, preferencesByDevice: { ...state.preferencesByDevice, [deviceKey]: preferences }, preferenceError: null });
      } catch {
        publish({ preferences: {}, preferenceError: 'No se pudieron recuperar las preferencias locales.' });
      }
    };
    const savePreference = (field, level) => {
      try {
        if (!localState) throw new Error('Almacenamiento no disponible.');
        const preferences = localState.savePreference(state.deviceKey, field, level);
        publish({ preferences, preferencesByDevice: { ...state.preferencesByDevice, [state.deviceKey]: preferences }, preferenceError: null });
      } catch {
        publish({ preferenceError: 'El ajuste fue aceptado, pero no se pudo guardar la preferencia en este dispositivo.' });
      }
    };
    const connectionPrepared = () => state.status === 'listening' && state.listenerResult?.connectionReady === true
      && state.listenerResult?.indicationsActive === true;
    const removeSubscription = async () => {
      const old = subscription;
      subscription = null;
      await old?.remove();
    };
    const run = (task, restarting = false) => {
      if (disposed || suspended || bindingJob || configurationJob || (restartJob && !restarting) || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || ['listening', 'trial'].includes(state.status)) return Promise.resolve();
      const token = ++version;
      const current = () => !disposed && token === version;
      const check = () => { if (!current()) throw { code: 'CONNECTION_CANCELLED' }; };
      const call = async (fn) => { check(); const result = await fn(); check(); return result; };
      publish({ busy: true, error: null });
      job = (async () => {
        await ready;
        check();
        if (acquired && state.status === 'error') await call(disconnect);
        acquired = true;
        await task(call, current);
      })().catch(async error => {
        if (!current()) return;
        await disconnect().catch(() => {});
        await removeSubscription().catch(() => {});
        if (current()) publish({ status: 'error', error, listenerResult: null, trial: state.trial ? { ...state.trial, status: 'complete' } : null });
      }).finally(() => {
        job = null;
        if (current()) {
          publish({ busy: false });
          if (automaticConfigurationPending) {
            automaticConfigurationPending = false;
            return configureConnection();
          }
        }
      });
      return job;
    };
    const listen = async (deviceId, call, current) => {
      automaticConfigurationPending = false;
      publish({ unitResult: null, unitError: null, configurationBusy: false, configurationIssue: false, gattReconnectRequired: false, measurementModeBusy: false, measurementModeResult: null, measurementModeError: null, measurementModeReconnectRequired: false, volumeBusy: false, volumeResult: null, volumeError: null, volumeReconnectRequired: false, deviceInfoStatus: 'idle', deviceInfoBusy: false, deviceInfoResult: null, deviceInfoError: null, status: 'connecting', listenerResult: null, clockResult: null, clockError: null, capabilities: thermometerCapabilities() });
      // Assign even a late subscription so cancellation can remove it after job settles.
      subscription = await api.addFemometerTemperatureListener(event => {
        if (!current() || event?.experimental === true) return;
        if (event?.deviceProtocol && (event.receptionValidated !== true || event.deviceKey !== state.deviceKey)) return;
        if (promotedReplay && now() < promotedReplay.until && sameReading(promotedReplay.reading, event)) {
          return; // Suppress exact replays of the promoted take during the initial five-minute window.
        }
        onTemperature({ ...event, deviceModel: event?.deviceModel ?? state.listenerResult?.capabilities?.model ?? null });
        if (['timeout', 'stopped', 'disconnected', 'error'].includes(event?.status)) {
          void session.stop(['timeout', 'stopped'].includes(event.status) ? 'stopped' : 'error',
            ['timeout', 'stopped'].includes(event.status) ? null : { message: event.message || 'El termómetro se desconectó.' });
        }
      });
      const result = await call(() => api.startFemometerTemperatureListener(deviceId, userId));
      if (result?.connectionReady !== true || result?.indicationsActive !== true) {
        throw { code: 'LISTENER_NOT_READY', message: 'No se pudo preparar la escucha. Reconecta el termómetro.' };
      }
      if (state.deviceKey && result?.deviceKey !== state.deviceKey) {
        throw { code: 'CONNECTION_IDENTITY_MISMATCH', message: 'La conexión no corresponde a la vinculación activa.' };
      }
      if (!thermometerCapabilities(result?.capabilities).temperatureReceive) throw { code: 'DEVICE_NOT_VERIFIED', message: 'El perfil de este termómetro no está validado.' };
      listeningExpiresAt = now() + (Number(result?.timeoutSeconds) || 360) * 1000;
      const configure = result.capabilities?.protocol === 'vinca2';
      publish({ status: 'listening', configurationBusy: configure, listenerResult: result, capabilities: thermometerCapabilities(result?.capabilities) });
      automaticConfigurationPending = configure;
    };
    const search = async (automatic, call, current, expanded = false) => {
      publish({ status: 'checking', devices: [], selectedDeviceId: '', inspectionResult: null, trial: null });
      const saved = await call(() => api.getRememberedFemometer(userId));
      applyBindings(saved);
      loadPreferences(saved.deviceKey);
      if (automatic && !saved.remembered) {
        publish({ status: 'idle' });
        return;
      }
      if (!automatic) await call(() => api.requestBluetoothPermissions());
      publish({ status: 'searching' });
      // Native scan checks existing permissions and Bluetooth before starting;
      // unlike requestBluetoothPermissions, it never opens a permission dialog.
      const found = await call(() => api.scanForFemometer(userId, expanded));
      const matches = found.filter(device => device.isRemembered === true);
      const match = matches.length === 1 ? matches[0] : null;
      const devices = automatic ? (match ? [match] : []) : found;
      publish({ devices, selectedDeviceId: match?.id || (!saved.remembered && !automatic ? found[0]?.id || '' : '') });
      if (automatic) {
        if (!match) publish({ status: 'missing' });
        else await listen(match.id, call, current);
      } else publish({ status: (!found.length || (saved.remembered && !match)) ? 'missing' : 'idle' });
    };
    const clock = (sync, automatic = false) => {
      if (bindingJob || state.gattReconnectRequired || (!automatic && state.configurationBusy) || !connectionPrepared()) return Promise.resolve();
      if (state.volumeReconnectRequired || state.measurementModeReconnectRequired) return Promise.resolve();
      if (disposed || suspended || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || state.status !== 'listening') return Promise.resolve();
      const token = version; // Do not invalidate the existing temperature subscription.
      const current = () => !disposed && token === version;
      if (!state.capabilities[sync ? 'clockSync' : 'clockRead']) {
        publish({ clockError: { code: 'CLOCK_UNSUPPORTED', message: 'Operación de reloj no disponible en este dispositivo.' } });
        return Promise.resolve();
      }
      publish({ clockBusy: true, clockResult: null, clockError: null, clockAttempt: {
        deviceKey: state.listenerResult?.deviceKey ?? null, operation: sync ? 'sync' : 'read', checkedAt: now(),
        phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, phoneUtcOffsetMinutes: -new Date().getTimezoneOffset(),
      } });
      clockJob = Promise.resolve().then(() => {
        if (!current()) return;
        return sync ? api.syncFemometerClock() : api.readFemometerClock();
      }).then(result => {
        if (current()) {
          const driftSeconds = femometerClockDriftSeconds(result?.deviceLocalTime, now());
          const phone = new Date(now());
          const pad = value => String(value).padStart(2, '0');
          const phoneLocalTime = `${phone.getFullYear()}-${pad(phone.getMonth() + 1)}-${pad(phone.getDate())}T${pad(phone.getHours())}:${pad(phone.getMinutes())}:${pad(phone.getSeconds())}`;
          publish({ clockResult: { ...result, verified: sync && result?.verified === true && result?.phoneZoneChanged !== true && driftSeconds !== null && Math.abs(driftSeconds) <= FEMOMETER_CLOCK_TOLERANCE_SECONDS, operation: sync ? 'sync' : 'read', driftSeconds,
            checkedAt: result?.checkedAt ?? now(),
            phoneLocalTime,
            significantDrift: driftSeconds !== null && Math.abs(driftSeconds) > FEMOMETER_CLOCK_TOLERANCE_SECONDS } });
        }
      }).catch(error => {
        if (current()) publish({ gattReconnectRequired: state.gattReconnectRequired || requiresReconnect(error?.code), clockError: { ...error, message: error.message, operation: sync ? 'sync' : 'read',
          checkedAt: now(), deviceKey: state.listenerResult?.deviceKey ?? null } }); // Keep receiving.
      }).finally(() => {
        clockJob = null;
        if (current()) publish({ clockBusy: false });
      });
      return clockJob;
    };
    const setTemperatureUnit = unit => {
      if ((state.boundProtocol === 'easyhome-ebt300' && unit !== 'C') || !['C', 'F'].includes(unit) || !state.capabilities?.unitWrite || !connectionPrepared()
        || disposed || suspended || bindingJob || job || stopping || clockJob || deviceInfoJob || volumeJob || measurementModeJob || state.configurationBusy || state.gattReconnectRequired) return Promise.resolve();
      const token = version, key = state.deviceKey;
      savePreference('temperatureUnit', unit);
      publish({ clockBusy: true, unitError: null, unitResult: null });
      clockJob = Promise.resolve().then(() => api.setFemometerTemperatureUnit(unit)).then(result => {
        if (!disposed && token === version && key === state.deviceKey) publish({ unitResult: { ...result, requestedUnit: unit }, gattReconnectRequired: true });
      }).catch(error => {
        if (!disposed && token === version) publish({ unitError: error, gattReconnectRequired: true });
      }).finally(() => { clockJob = null; if (!disposed && token === version) publish({ clockBusy: false }); });
      return clockJob;
    };
    const readDeviceInfo = () => {
      if (bindingJob || state.configurationBusy || state.gattReconnectRequired) return Promise.resolve();
      if (disposed || suspended || job || stopping || state.status !== 'listening'
        || state.listenerResult?.connectionReady !== true || state.listenerResult?.indicationsActive !== true) return Promise.resolve();
      if (deviceInfoJob || clockJob || volumeJob || measurementModeJob || state.measurementModeReconnectRequired || state.volumeReconnectRequired) return Promise.resolve();
      const token = version;
      const queriedDeviceKey = state.deviceKey;
      const current = () => !disposed && token === version;
      publish({ deviceInfoStatus: 'loading', deviceInfoBusy: true, deviceInfoResult: null, deviceInfoError: null });
      deviceInfoJob = Promise.resolve().then(() => {
        if (current()) return api.readFemometerDeviceInfo();
      }).then(result => {
        if (!current()) return;
        const data = normalizeFemometerDeviceInfo(result);
        localState?.saveMetadata?.(queriedDeviceKey, { ...data, infoCheckedAt: now(), ...(data.battery != null ? { batteryLevel: data.battery, batteryCheckedAt: now() } : {}) });
        publish({ deviceInfoResult: data, deviceInfoStatus: Object.values(data).some(value => value !== null) ? 'received' : 'unavailable' });
      }).catch(error => {
        if (current()) publish({ gattReconnectRequired: state.gattReconnectRequired || requiresReconnect(error?.code), deviceInfoStatus: 'error', deviceInfoError: { code: error?.code,
          message: error?.message || 'No se pudo consultar los datos. Vuelve a intentarlo.' } });
      }).finally(() => {
        deviceInfoJob = null;
        if (current()) publish({ deviceInfoBusy: false });
      });
      return deviceInfoJob;
    };
    const setVolume = (level, automatic = false) => {
      if (bindingJob || state.gattReconnectRequired || (!automatic && state.configurationBusy)) return Promise.resolve();
      if (disposed || suspended || stopping || job || (!automatic && restartJob) || clockJob || deviceInfoJob || volumeJob || measurementModeJob || state.volumeBusy) return Promise.resolve();
      const reject = (code, message, outcome = 'error') => {
        publish({ volumeResult: null, volumeError: { code, message, outcome } });
        return Promise.resolve();
      };
      if (!['low', 'medium', 'high'].includes(level)) return reject('VOLUME_INVALID_LEVEL', 'Selecciona Bajo, Medio o Alto.');
      if (state.status !== 'listening' || state.listenerResult?.connectionReady !== true || state.listenerResult?.indicationsActive !== true) {
        return reject('VOLUME_NOT_CONNECTED', 'Conecta el termómetro y espera a que la escucha esté preparada.');
      }
      if (state.measurementModeReconnectRequired) return reject('MEASUREMENT_MODE_RECONNECT_REQUIRED', 'Detén y reconecta antes de ajustar el volumen.', 'unknown');
      if (state.volumeReconnectRequired) return reject('VOLUME_RECONNECT_REQUIRED', 'Detén y vuelve a conectar antes de reintentar.', 'unknown');
      if (!state.capabilities.volumeWrite) return reject('VOLUME_UNSUPPORTED', 'Este termómetro no anuncia escritura con respuesta compatible para el volumen.');
      const token = version;
      const current = () => !disposed && token === version;
      publish({ volumeBusy: true, volumeResult: null, volumeError: null });
      volumeJob = Promise.resolve().then(() => {
        if (current()) return api.setFemometerVolume(level);
      }).then(result => {
        if (!current()) return;
        if (result?.commandsAccepted !== true || result?.level !== level || result?.outcome !== 'accepted') {
          throw { code: 'VOLUME_INVALID_RESPONSE', message: 'Resultado desconocido. Detén y reconecta antes de reintentar.' };
        }
        publish({ volumeResult: { level, outcome: 'accepted', commandsAccepted: true, verified: false } });
        if (!automatic) savePreference('volume', level);
      }).catch(error => {
        if (!current()) return;
        const code = error?.code || 'VOLUME_INVALID_RESPONSE';
        const cancelled = ['VOLUME_CANCELLED', 'CONNECTION_CANCELLED'].includes(code);
        const unknown = ['VOLUME_TIMEOUT', 'VOLUME_INVALID_RESPONSE', 'NATIVE_BRIDGE_UNAVAILABLE', 'VOLUME_RECONNECT_REQUIRED', 'MEASUREMENT_MODE_RECONNECT_REQUIRED', 'UNKNOWN'].includes(code);
        const reconnect = cancelled || unknown || ['VOLUME_FIRST_WRITE_FAILED', 'VOLUME_CONFIRM_WRITE_FAILED'].includes(code);
        publish({ volumeResult: null, volumeReconnectRequired: reconnect, volumeError: {
          code, outcome: cancelled ? 'cancelled' : unknown ? 'unknown' : 'error',
          message: error?.message || 'No se pudo completar el ajuste. Detén y reconecta antes de reintentar.',
        } });
      }).finally(() => {
        volumeJob = null;
        if (current()) publish({ volumeBusy: false });
      });
      return volumeJob;
    };
    const setMeasurementMode = (level, automatic = false) => {
      if (bindingJob || state.gattReconnectRequired || (!automatic && state.configurationBusy)) return Promise.resolve();
      if (disposed || suspended || stopping || job || (!automatic && restartJob) || clockJob || deviceInfoJob || volumeJob || measurementModeJob || state.measurementModeBusy) return Promise.resolve();
      const reject = (code, message, outcome = 'error') => {
        publish({ measurementModeResult: null, measurementModeError: { code, message, outcome } });
        return Promise.resolve();
      };
      if (!['quick', 'normal', 'precise'].includes(level)) return reject('MEASUREMENT_MODE_INVALID_LEVEL', 'Selecciona Rápido, Normal o Preciso.');
      if (state.status !== 'listening' || state.listenerResult?.connectionReady !== true || state.listenerResult?.indicationsActive !== true) {
        return reject('MEASUREMENT_MODE_NOT_CONNECTED', 'Conecta el termómetro y espera a que la escucha esté preparada.');
      }
      if (state.volumeReconnectRequired || state.measurementModeReconnectRequired) return reject('MEASUREMENT_MODE_RECONNECT_REQUIRED', 'Detén y vuelve a conectar antes de reintentar.', 'unknown');
      if (!state.capabilities.modeConfiguration) return reject('MEASUREMENT_MODE_UNSUPPORTED', 'Este termómetro no anuncia escritura con respuesta compatible para el modo.');
      const token = version;
      const current = () => !disposed && token === version;
      publish({ measurementModeBusy: true, measurementModeResult: null, measurementModeError: null });
      measurementModeJob = Promise.resolve().then(() => {
        if (current()) return api.setFemometerMeasurementMode(level);
      }).then(result => {
        if (!current()) return;
        if (result?.commandsAccepted !== true || result?.level !== level || result?.outcome !== 'accepted') {
          throw { code: 'MEASUREMENT_MODE_INVALID_RESPONSE', message: 'Resultado desconocido. Detén y reconecta antes de reintentar.' };
        }
        publish({ measurementModeResult: { level, outcome: 'accepted', commandsAccepted: true, verified: false } });
        if (!automatic) savePreference('measurementMode', level);
      }).catch(error => {
        if (!current()) return;
        const code = error?.code || 'MEASUREMENT_MODE_INVALID_RESPONSE';
        const cancelled = ['MEASUREMENT_MODE_CANCELLED', 'CONNECTION_CANCELLED'].includes(code);
        const unknown = ['MEASUREMENT_MODE_TIMEOUT', 'MEASUREMENT_MODE_INVALID_RESPONSE', 'NATIVE_BRIDGE_UNAVAILABLE', 'MEASUREMENT_MODE_RECONNECT_REQUIRED', 'UNKNOWN'].includes(code);
        const reconnect = cancelled || unknown || ['MEASUREMENT_MODE_FIRST_WRITE_FAILED', 'MEASUREMENT_MODE_CONFIRM_WRITE_FAILED'].includes(code);
        publish({ measurementModeResult: null, measurementModeReconnectRequired: reconnect, measurementModeError: {
          code, outcome: cancelled ? 'cancelled' : unknown ? 'unknown' : 'error',
          message: error?.message || 'No se pudo completar el ajuste. Detén y reconecta antes de reintentar.',
        } });
      }).finally(() => {
        measurementModeJob = null;
        if (current()) publish({ measurementModeBusy: false });
      });
      return measurementModeJob;
    };
    const configureConnection = () => {
      if (configurationJob || disposed || !connectionPrepared()) return configurationJob ?? Promise.resolve();
      const token = version;
      const current = () => !disposed && !suspended && token === version && connectionPrepared() && !bindingJob;
      const safe = () => current() && !state.gattReconnectRequired && !state.volumeReconnectRequired && !state.measurementModeReconnectRequired;
      publish({ configurationBusy: true, configurationIssue: false });
      configurationJob = Promise.resolve().then(async () => {
        if (!safe()) return;
        if (state.capabilities.clockRead) {
          await clock(false, true);
          if (safe() && !state.clockError && Math.abs(state.clockResult?.driftSeconds ?? 0) > FEMOMETER_AUTO_CLOCK_SYNC_SECONDS && state.capabilities.clockSync) {
            // Exactly one attempt per connection. Native sync includes a read-back.
            await clock(true, true);
            if (current() && !state.clockError && state.clockResult?.verified !== true) {
              publish({ clockError: { code: 'CLOCK_VERIFY_FAILED', message: 'El ajuste del reloj no pudo verificarse. Puedes sincronizarlo manualmente.',
                operation: 'sync', checkedAt: now(), deviceKey: state.deviceKey } });
            }
          }
        }
        if (safe() && state.capabilities.volumeWrite && state.preferences.volume) await setVolume(state.preferences.volume, true);
        if (safe() && state.capabilities.modeConfiguration && state.preferences.measurementMode) await setMeasurementMode(state.preferences.measurementMode, true);
      }).finally(() => {
        configurationJob = null;
        if (current()) publish({ configurationBusy: false, configurationIssue: Boolean(state.clockError || state.volumeError || state.measurementModeError || state.preferenceError) });
      });
      return configurationJob;
    };
    const changeBinding = (forget, deviceKey = state.deviceKey) => {
      if (bindingJob) return Promise.resolve(false);
      if (disposed || suspended) return Promise.resolve(false);
      const lifecycle = lifecycleVersion;
      publish({ bindingBusy: true });
      bindingJob = Promise.resolve().then(async () => {
        await session.stop();
        const current = () => !disposed && !suspended && lifecycle === lifecycleVersion;
        if (!current()) return false;
        if (state.error || acquired) throw state.error || new Error('No se pudo cerrar la conexión.');
        if (!forget) { publish({ changingDevice: true, status: 'idle' }); return true; }
        const result = await api.forgetFemometer(userId, deviceKey);
        if (!current()) return false;
        if (Array.isArray(result?.bindings) ? result.bindings.some(device => device.deviceKey === deviceKey) : result?.remembered !== false) throw new Error('No se pudo confirmar la desvinculación.');
        applyBindings(result);
        loadPreferences(result.deviceKey);
        publish({ changingDevice: false,
          status: 'idle', devices: [], selectedDeviceId: '', inspectionResult: null, clockResult: null, clockError: null });
        return true;
      }).catch(error => { if (!disposed) publish({ error, status: 'error' }); return false; })
        .finally(() => { bindingJob = null; if (!disposed) publish({ bindingBusy: false }); });
      return bindingJob;
    };
    const trialTask = async (deviceId, call, current) => {
        if (state.selectedDeviceId !== deviceId || state.inspectionResult?.standardTrialAvailable !== true
          || state.inspectionResult?.compatible === true) throw { code: 'DEVICE_NOT_VERIFIED', message: 'Comprueba primero la recepción estándar disponible.' };
        publish({ changingDevice: true, status: 'connecting', trial: { status: 'connecting', deviceId, readings: [] } });
        subscription = await api.addStandardThermometerTrialListener(event => {
          if (!current()) return;
          if (event?.experimental === true && Number.isFinite(event.temperatureC)) {
            publish({ trial: { ...state.trial, readings: [...state.trial.readings, {
              ...event, deviceTimestamp: event.deviceTimestamp ?? null,
            }].slice(-50) } });
          }
          if (event?.error) publish({ trial: { ...state.trial, error: 'Medición no válida.' } });
          if (['timeout', 'stopped', 'disconnected', 'error'].includes(event?.status)) void session.stop();
        });
        const result = await call(() => api.startStandardThermometerTrial(deviceId, userId));
        if (result?.experimental !== true || result?.connectionReady !== true || result?.indicationsActive !== true) {
          throw { code: 'LISTENER_NOT_READY', message: 'No se pudo iniciar la recepción de prueba.' };
        }
        publish({ status: 'trial', trial: { ...state.trial, verificationId: result.verificationId, status: 'listening' } });
    };
    const session = {
      recheckSaved: async () => {
        const key = state.deviceKey;
        await session.stop();
        if (disposed || suspended) return false;
        await session.scan(true);
        const candidate = state.devices.find(device => device.deviceKey === key);
        if (!candidate) return false;
        return session.selectAndRemember(candidate.id);
      },
      unlink: deviceKey => changeBinding(true, deviceKey),
      connectSaved: deviceKey => {
        if (bindingJob || disposed || suspended) return Promise.resolve(false);
        if (!state.bindings.some(device => device.deviceKey === deviceKey)) return Promise.resolve(false);
        const lifecycle = lifecycleVersion;
        publish({ bindingBusy: true });
        bindingJob = (async () => {
          await session.stop();
          if (disposed || suspended || lifecycle !== lifecycleVersion || state.error || acquired) return false;
          const saved = await api.selectRememberedFemometer(userId, deviceKey);
          if (disposed || suspended || lifecycle !== lifecycleVersion) return false;
          if (saved?.deviceKey !== deviceKey) throw new Error('No se pudo confirmar la selección.');
          applyBindings(saved); loadPreferences(deviceKey);
          publish({ changingDevice: false, clockResult: null, clockError: null });
          return true;
        })().catch(error => { if (!disposed) publish({ error, status: 'error' }); return false; })
          .finally(() => { bindingJob = null; if (!disposed) publish({ bindingBusy: false }); });
        return bindingJob.then(async selected => {
          if (selected && !disposed && !suspended && lifecycle === lifecycleVersion) await session.start();
          return selected;
        });
      },
      beginChange: () => changeBinding(false),
      cancelChange: () => {
        if (cancelChangeJob) return cancelChangeJob;
        if (disposed || bindingJob) return Promise.resolve();
        cancelChangeJob = (async () => {
          await session.stop();
          if (disposed || suspended || state.error) return;
          publish({ changingDevice: false });
          await session.start();
        })().finally(() => { cancelChangeJob = null; });
        return cancelChangeJob;
      },
      setMeasurementMode,
      setVolume,
      readDeviceInfo, setTemperatureUnit,
      readClock: () => clock(false),
      syncClock: () => clock(true),
      start: () => state.changingDevice || bindingJob ? Promise.resolve() : run((call, current) => search(true, call, current)),
      suspend: () => {
        if (disposed || suspended) return stopping ?? Promise.resolve();
        suspended = true;
        ++lifecycleVersion;
        // Android handleOnStop closes GATT without a terminal event once ready.
        // Invalidate JS immediately and share the normal ordered cleanup.
        return session.stop();
      },
      restart: () => {
        if (restartJob) return restartJob;
        if (disposed || suspended || bindingJob || state.changingDevice || configurationJob || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || resumeJob) return Promise.resolve();
        const lifecycle = lifecycleVersion;
        publish({ restarting: true });
        restartJob = Promise.resolve().then(async () => {
          await session.stop();
          if (!disposed && !suspended && lifecycle === lifecycleVersion && state.status !== 'error') {
            await run((call, current) => search(true, call, current), true);
          }
        }).finally(() => { restartJob = null; publish({ restarting: false }); });
        return restartJob;
      },
      resume: () => {
        if (disposed) return Promise.resolve();
        suspended = false;
        if (bindingJob || state.changingDevice) return Promise.resolve();
        const lifecycle = lifecycleVersion;
        const decision = reason => publish({ foreground: { detectedAt: now(), reason } });
        if (resumeJob) {
          decision('operation_in_progress');
          return resumeLifecycle === lifecycle ? resumeJob : resumeJob.then(() => {
            if (!disposed && !suspended && lifecycle === lifecycleVersion) return session.resume();
          });
        }
        if (!stopping && (job || restartJob)) { decision('operation_in_progress'); return job ?? restartJob; }
        if (state.remembered === false) { decision('no_remembered_device'); return Promise.resolve(); }
        if (state.status === 'listening' && now() < listeningExpiresAt) { decision('listening_active'); return Promise.resolve(); }
        // Mount/manual searches do not consume the first foreground attempt.
        if (now() - lastForegroundAttempt < 5_000) { decision('brief_cooldown'); return Promise.resolve(); }
        decision('reconnecting');
        resumeLifecycle = lifecycle;
        resumeJob = Promise.resolve().then(async () => {
          if (stopping) await stopping;
          else if (state.status === 'listening') await session.stop();
          if (restartJob) await restartJob;
          if (!disposed && !suspended && lifecycle === lifecycleVersion && !job && !clockJob && !stopping) {
            lastForegroundAttempt = now();
            await session.start();
          }
        }).finally(() => { resumeJob = null; });
        return resumeJob;
      },
      scan: (expanded = false) => run((call, current) => search(false, call, current, expanded === true)),
      // One job owns the captured scan result through inspection, cleanup and persistence.
      // Resolves true only after native confirmation; errors/cancellation retain the old binding.
      selectAndRemember: (deviceId) => {
        let confirmed = false;
        return run(async (call, current) => {
          if (!state.devices.some(device => device.id === deviceId)) {
            throw { code: 'DEVICE_NOT_FOUND', message: 'Este resultado ya no está disponible. Vuelve a buscar.' };
          }
          publish({ status: 'inspecting', selectedDeviceId: deviceId, inspectionResult: null, trial: null });
          const inspection = await call(() => api.connectAndInspectFemometer(deviceId));
          await call(() => api.disconnectFemometer());
          if (typeof inspection?.compatible !== 'boolean') {
            throw { code: 'INSPECTION_FAILED', message: 'No se pudo comprobar la compatibilidad. Vuelve a intentarlo.' };
          }
          publish({ inspectionResult: inspection, devices: state.devices.map(device => device.id === deviceId
            ? { ...device, model: inspection.model, manufacturer: inspection.manufacturer, compatibility: inspection.compatibility ?? 'unknown', standardTrialAvailable: inspection.standardTrialAvailable === true } : device) });
          if (inspection?.compatible !== true || !thermometerCapabilities(inspection.capabilities ?? {
            model: inspection.model, protocol: inspection.protocol, compatibility: inspection.compatibility ?? 'compatible',
          }).temperatureReceive) {
            if (inspection.standardTrialAvailable === true) { await trialTask(deviceId, call, current); return; }
            publish({ status: 'idle' });
            return;
          }
          const previousKey = state.deviceKey;
          const previousKeys = state.bindings.map(device => device.deviceKey);
          publish({ status: 'binding' });
          const saved = await call(() => api.rememberFemometer(userId, deviceId));
          if (saved?.remembered !== true) {
            throw { code: 'PERSISTENCE_FAILED', message: 'No se pudo confirmar la vinculación. Vuelve a intentarlo.' };
          }
          applyBindings(saved);
          try { localState?.saveMetadata?.(saved.deviceKey, { ...inspection, infoCheckedAt: now() }); } catch { publish({ preferenceError: "No se pudo conservar la información del termómetro." }); }
          publish({ remembered: true, boundModel: inspection.model, deviceKey: saved.deviceKey ?? null, status: 'idle', clockResult: null, clockError: null,
            devices: state.devices.map(device => ({ ...device, isRemembered: device.id === deviceId })) });
          confirmed = true;
          publish({ changingDevice: false });
          if (inspection.protocol === 'vinca2' && saved.deviceKey && saved.deviceKey !== previousKey && !previousKeys.includes(saved.deviceKey)) {
            try {
              if (!localState) throw new Error('Almacenamiento no disponible.');
              localState.initializePreferences(saved.deviceKey);
              loadPreferences(saved.deviceKey);
            } catch { publish({ preferences: {}, preferenceError: 'Vinculación confirmada, pero no se pudieron guardar los ajustes iniciales.' }); }
          } else loadPreferences(saved.deviceKey);
          acquired = true;
          await listen(deviceId, call, current);
        }).then(() => confirmed);
      },
      startTrial: deviceId => run((call, current) => trialTask(deviceId, call, current)),
      confirmTrial: ({ readingId, basalConfirmed, incorporate } = {}) => {
        const trial = state.trial;
        const reading = trial?.readings.find(item => item.readingId === readingId && item.verificationId === trial.verificationId);
        if (disposed || suspended || bindingJob || job || stopping || trial?.status !== 'listening'
          || !trial.verificationId || !reading || basalConfirmed !== true) return Promise.resolve(false);
        let committed = false;
        const token = ++version;
        const current = () => !disposed && !suspended && token === version;
        publish({ bindingBusy: true });
        bindingJob = (async () => {
          await removeSubscription();
          if (!current()) return false;
          const saved = await api.confirmStandardThermometerTrial(userId, { deviceId: trial.deviceId,
            verificationId: trial.verificationId, readingId, basalConfirmed: true });
          if (!current()) return false;
          if (!saved?.remembered || !saved.deviceKey || saved.protocol !== 'health-thermometer') throw { code: 'VERIFICATION_INVALID' };
          committed = true;
          acquired = false;
          applyBindings(saved); loadPreferences(saved.deviceKey);
          try { localState?.saveMetadata?.(saved.deviceKey, { ...state.inspectionResult, protocol: saved.protocol, compatibility: saved.compatibility, infoCheckedAt: now() }); } catch { publish({ preferenceError: "No se pudo conservar la información del termómetro." }); }
          const promoted = saved.verifiedReading;
          const canPromote = promoted?.receptionValidated === true && promoted.deviceKey === saved.deviceKey
            && promoted.experimental !== true
            && promoted.deviceProtocol === saved.protocol && promoted.deviceTimestamp === reading.deviceTimestamp
            && promoted.temperatureC === reading.temperatureC && promoted.promotedVerification === true;
          if (canPromote) {
            if (promoted.deviceTimestamp && promoted.exactReplayEligible !== false) promotedReplay = { reading: promoted, until: now() + 300000 };
            const pending = onTemperature(promoted);
            if (incorporate) await incorporate(pending);
          }
          publish({ status: 'idle', changingDevice: false, trial: null, inspectionResult: { ...state.inspectionResult, compatible: true, compatibility: 'experimental', protocol: 'health-thermometer' }, verificationPromoted: canPromote,
            verificationNeedsNewReading: !canPromote });
          return true;
        })().catch(async error => {
          await disconnect().catch(() => {});
          if (current()) publish({ status: 'error', error, changingDevice: !committed, trial: committed ? null : state.trial ? { ...state.trial, status: 'complete' } : null });
          return committed;
        }).finally(() => { bindingJob = null; if (!disposed) publish({ bindingBusy: false }); });
        return bindingJob.then(async confirmed => {
          if (confirmed && current() && state.status !== 'error') await run((call, valid) => listen(trial.deviceId, call, valid));
          return confirmed;
        });
      },
      stopTrial: () => session.stop(),
      select: (id) => {
        if (disposed || job || stopping || bindingJob || ['listening', 'trial'].includes(state.status)) return;
        if (state.devices.some(device => device.id === id)) publish({ selectedDeviceId: id, inspectionResult: null });
      },
      listen: () => run((call, current) => listen(state.selectedDeviceId, call, current)),
      inspect: () => run(async call => {
        publish({ status: 'inspecting', inspectionResult: null });
        const result = await call(() => api.connectAndInspectFemometer(state.selectedDeviceId));
        await call(() => api.disconnectFemometer());
        publish({ status: 'idle', inspectionResult: result });
      }),
      remember: (forget = false) => forget ? session.unlink() : run(async call => {
        const result = await call(() => forget ? api.forgetFemometer(userId)
          : api.rememberFemometer(userId, state.selectedDeviceId));
        publish({ remembered: result.remembered, deviceKey: result.deviceKey ?? null, status: 'idle', clockResult: null, clockError: null, devices: state.devices.map(device => ({
          ...device, isRemembered: !forget && device.id === state.selectedDeviceId,
        })) });
      }),
      stop: (status = 'stopped', error = null) => {
        if (stopping) return stopping;
        listeningExpiresAt = 0;
        automaticConfigurationPending = false;
        ++version; // Invalidate all continuations and events synchronously.
        publish({ status: 'stopping', busy: true, configurationBusy: false, configurationIssue: false, measurementModeBusy: false, measurementModeResult: null, measurementModeReconnectRequired: false,
          measurementModeError: measurementModeJob ? { code: 'MEASUREMENT_MODE_CANCELLED', outcome: 'cancelled', message: 'Ajuste de modo cancelado. Un comando enviado podría haberse aplicado.' } : null, volumeBusy: false, volumeResult: null, volumeReconnectRequired: false,
          volumeError: volumeJob ? { code: 'VOLUME_CANCELLED', outcome: 'cancelled', message: 'Ajuste de volumen cancelado. Un comando enviado podría haberse aplicado.' } : null, deviceInfoStatus: 'idle', deviceInfoBusy: false, deviceInfoResult: null, deviceInfoError: null });
        const pending = Promise.all([job, clockJob, deviceInfoJob, volumeJob, measurementModeJob, configurationJob]);
        stopping = (async () => {
          await ready;
          // A StrictMode mount cancelled before acquisition must not stop its successor.
          try {
            await disconnect();
          } finally {
            // Even if native cleanup fails, drain late JS work and remove its listener.
            await pending;
            await removeSubscription();
          }
        })().catch(failure => { status = 'error'; error = failure; }).finally(() => {
          stopping = null;
          publish({ status, error, busy: false, listenerResult: null, clockBusy: false,
            trial: state.trial ? { ...state.trial, status: 'complete' } : null });
        });
        return stopping;
      },
      dispose: () => {
        if (disposal) return disposal;
        disposed = true;
        disposal = session.stop().then(() => bindingJob);
        return disposal;
      },
    };
    owner = session;
    return session;
  };
};
