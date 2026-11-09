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

// One native BLE owner across panel remounts, including React StrictMode replay.
// The injected bridge also lets lifecycle races be tested without BLE hardware.
export const createFemometerSessionManager = (api) => {
  let owner;
  return (userId, onState, onTemperature) => {
    const ready = owner ? owner.dispose() : Promise.resolve();
    let disposed = false;
    let acquired = false;
    let version = 0;
    let job;
    let clockJob;
    let deviceInfoJob;
    let volumeJob;
    let measurementModeJob;
    let automaticClockPending = false;
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
      status: 'checking', busy: false, remembered: null, devices: [],
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
    const removeSubscription = async () => {
      const old = subscription;
      subscription = null;
      await old?.remove();
    };
    const run = (task, restarting = false) => {
      if (disposed || suspended || (restartJob && !restarting) || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || state.status === 'listening') return Promise.resolve();
      const token = ++version;
      const current = () => !disposed && token === version;
      const check = () => { if (!current()) throw { code: 'CONNECTION_CANCELLED' }; };
      const call = async (fn) => { check(); const result = await fn(); check(); return result; };
      publish({ busy: true, error: null });
      job = (async () => {
        await ready;
        check();
        acquired = true;
        await task(call, current);
      })().catch(async error => {
        if (!current()) return;
        await disconnect().catch(() => {});
        await removeSubscription().catch(() => {});
        if (current()) publish({ status: 'error', error, listenerResult: null });
      }).finally(() => {
        job = null;
        if (current()) {
          publish({ busy: false });
          if (automaticClockPending) {
            automaticClockPending = false;
            return clock(false);
          }
        }
      });
      return job;
    };
    const listen = async (deviceId, call, current) => {
      automaticClockPending = false;
      publish({ measurementModeBusy: false, measurementModeResult: null, measurementModeError: null, measurementModeReconnectRequired: false, volumeBusy: false, volumeResult: null, volumeError: null, volumeReconnectRequired: false, deviceInfoStatus: 'idle', deviceInfoBusy: false, deviceInfoResult: null, deviceInfoError: null, status: 'connecting', listenerResult: null, clockResult: null, clockError: null, capabilities: thermometerCapabilities() });
      // Assign even a late subscription so cancellation can remove it after job settles.
      subscription = await api.addFemometerTemperatureListener(event => {
        if (!current()) return;
        onTemperature(event);
        if (['timeout', 'stopped', 'disconnected', 'error'].includes(event?.status)) {
          void session.stop(['timeout', 'stopped'].includes(event.status) ? 'stopped' : 'error',
            ['timeout', 'stopped'].includes(event.status) ? null : { message: event.message || 'El termómetro se desconectó.' });
        }
      });
      const result = await call(() => api.startFemometerTemperatureListener(deviceId, userId));
      listeningExpiresAt = now() + (Number(result?.timeoutSeconds) || 360) * 1000;
      publish({ status: 'listening', listenerResult: result, capabilities: thermometerCapabilities(result?.capabilities) });
      automaticClockPending = state.capabilities.clockRead;
    };
    const search = async (automatic, call, current) => {
      publish({ status: 'checking', devices: [], selectedDeviceId: '', inspectionResult: null });
      const saved = await call(() => api.getRememberedFemometer(userId));
      publish({ remembered: saved.remembered, deviceKey: saved.deviceKey ?? null });
      if (automatic && !saved.remembered) {
        publish({ status: 'idle' });
        return;
      }
      if (!automatic) await call(() => api.requestBluetoothPermissions());
      publish({ status: 'searching' });
      // Native scan checks existing permissions and Bluetooth before starting;
      // unlike requestBluetoothPermissions, it never opens a permission dialog.
      const found = await call(() => api.scanForFemometer(userId));
      const matches = found.filter(device => device.isRemembered === true);
      const match = matches.length === 1 ? matches[0] : null;
      const devices = automatic ? (match ? [match] : []) : found;
      publish({ devices, selectedDeviceId: match?.id || (!saved.remembered && !automatic ? found[0]?.id || '' : '') });
      if (automatic) {
        if (!match) publish({ status: 'missing' });
        else await listen(match.id, call, current);
      } else publish({ status: (!found.length || (saved.remembered && !match)) ? 'missing' : 'idle' });
    };
    const clock = (sync) => {
      if (state.volumeReconnectRequired || state.measurementModeReconnectRequired) return Promise.resolve();
      if (disposed || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || state.status !== 'listening') return Promise.resolve();
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
          const driftSeconds = femometerClockDriftSeconds(result?.deviceLocalTime);
          const phone = new Date();
          const pad = value => String(value).padStart(2, '0');
          const phoneLocalTime = `${phone.getFullYear()}-${pad(phone.getMonth() + 1)}-${pad(phone.getDate())}T${pad(phone.getHours())}:${pad(phone.getMinutes())}:${pad(phone.getSeconds())}`;
          publish({ clockResult: { ...result, operation: sync ? 'sync' : 'read', driftSeconds,
            checkedAt: result?.checkedAt ?? now(),
            phoneLocalTime,
            significantDrift: driftSeconds !== null && Math.abs(driftSeconds) > 120 } });
        }
      }).catch(error => {
        if (current()) publish({ clockError: { ...error, message: error.message, operation: sync ? 'sync' : 'read',
          checkedAt: now(), deviceKey: state.listenerResult?.deviceKey ?? null } }); // Keep receiving.
      }).finally(() => {
        clockJob = null;
        if (current()) publish({ clockBusy: false });
      });
      return clockJob;
    };
    const readDeviceInfo = () => {
      if (disposed || suspended || job || stopping || state.status !== 'listening'
        || state.listenerResult?.connectionReady !== true || state.listenerResult?.indicationsActive !== true) return Promise.resolve();
      if (deviceInfoJob || clockJob || volumeJob || measurementModeJob || state.measurementModeReconnectRequired || state.volumeReconnectRequired) return Promise.resolve();
      const token = version;
      const current = () => !disposed && token === version;
      publish({ deviceInfoStatus: 'loading', deviceInfoBusy: true, deviceInfoResult: null, deviceInfoError: null });
      deviceInfoJob = Promise.resolve().then(() => {
        if (current()) return api.readFemometerDeviceInfo();
      }).then(result => {
        if (!current()) return;
        const data = normalizeFemometerDeviceInfo(result);
        publish({ deviceInfoResult: data, deviceInfoStatus: Object.values(data).some(value => value !== null) ? 'received' : 'unavailable' });
      }).catch(error => {
        if (current()) publish({ deviceInfoStatus: 'error', deviceInfoError: { code: error?.code,
          message: error?.message || 'No se pudo consultar los datos. Vuelve a intentarlo.' } });
      }).finally(() => {
        deviceInfoJob = null;
        if (current()) publish({ deviceInfoBusy: false });
      });
      return deviceInfoJob;
    };
    const setVolume = level => {
      if (disposed || suspended || stopping || job || restartJob || clockJob || deviceInfoJob || volumeJob || measurementModeJob || state.volumeBusy) return Promise.resolve();
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
    const setMeasurementMode = level => {
      if (disposed || suspended || stopping || job || restartJob || clockJob || deviceInfoJob || volumeJob || measurementModeJob || state.measurementModeBusy) return Promise.resolve();
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
    const session = {
      setMeasurementMode,
      setVolume,
      readDeviceInfo,
      readClock: () => clock(false),
      syncClock: () => clock(true),
      start: () => run((call, current) => search(true, call, current)),
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
        if (disposed || suspended || job || clockJob || deviceInfoJob || volumeJob || measurementModeJob || stopping || resumeJob) return Promise.resolve();
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
      scan: () => run((call, current) => search(false, call, current)),
      // One job owns the captured scan result through inspection, cleanup and persistence.
      // Resolves true only after native confirmation; errors/cancellation retain the old binding.
      selectAndRemember: (deviceId) => {
        let confirmed = false;
        return run(async call => {
          if (!state.devices.some(device => device.id === deviceId)) {
            throw { code: 'DEVICE_NOT_FOUND', message: 'Este resultado ya no está disponible. Vuelve a buscar.' };
          }
          publish({ status: 'inspecting', selectedDeviceId: deviceId, inspectionResult: null });
          const inspection = await call(() => api.connectAndInspectFemometer(deviceId));
          await call(() => api.disconnectFemometer());
          if (typeof inspection?.compatible !== 'boolean') {
            throw { code: 'INSPECTION_FAILED', message: 'No se pudo comprobar la compatibilidad. Vuelve a intentarlo.' };
          }
          publish({ inspectionResult: inspection });
          if (inspection?.compatible !== true) {
            publish({ status: 'idle' });
            return;
          }
          const saved = await call(() => api.rememberFemometer(userId, deviceId));
          if (saved?.remembered !== true) {
            throw { code: 'PERSISTENCE_FAILED', message: 'No se pudo confirmar la vinculación. Vuelve a intentarlo.' };
          }
          publish({ remembered: true, deviceKey: saved.deviceKey ?? null, status: 'idle', clockResult: null, clockError: null,
            devices: state.devices.map(device => ({ ...device, isRemembered: device.id === deviceId })) });
          confirmed = true;
        }).then(() => confirmed);
      },
      select: (id) => {
        if (disposed || job || stopping || state.status === 'listening') return;
        if (state.devices.some(device => device.id === id)) publish({ selectedDeviceId: id, inspectionResult: null });
      },
      listen: () => run((call, current) => listen(state.selectedDeviceId, call, current)),
      inspect: () => run(async call => {
        publish({ status: 'inspecting', inspectionResult: null });
        const result = await call(() => api.connectAndInspectFemometer(state.selectedDeviceId));
        await call(() => api.disconnectFemometer());
        publish({ status: 'idle', inspectionResult: result });
      }),
      remember: (forget = false) => run(async call => {
        const result = await call(() => forget ? api.forgetFemometer(userId)
          : api.rememberFemometer(userId, state.selectedDeviceId));
        publish({ remembered: result.remembered, deviceKey: result.deviceKey ?? null, status: 'idle', clockResult: null, clockError: null, devices: state.devices.map(device => ({
          ...device, isRemembered: !forget && device.id === state.selectedDeviceId,
        })) });
      }),
      stop: (status = 'stopped', error = null) => {
        if (stopping) return stopping;
        listeningExpiresAt = 0;
        automaticClockPending = false;
        ++version; // Invalidate all continuations and events synchronously.
        publish({ status: 'stopping', busy: true, measurementModeBusy: false, measurementModeResult: null, measurementModeReconnectRequired: false,
          measurementModeError: measurementModeJob ? { code: 'MEASUREMENT_MODE_CANCELLED', outcome: 'cancelled', message: 'Ajuste de modo cancelado. Un comando enviado podría haberse aplicado.' } : null, volumeBusy: false, volumeResult: null, volumeReconnectRequired: false,
          volumeError: volumeJob ? { code: 'VOLUME_CANCELLED', outcome: 'cancelled', message: 'Ajuste de volumen cancelado. Un comando enviado podría haberse aplicado.' } : null, deviceInfoStatus: 'idle', deviceInfoBusy: false, deviceInfoResult: null, deviceInfoError: null });
        const pending = Promise.all([job, clockJob, deviceInfoJob, volumeJob, measurementModeJob]);
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
          publish({ status, error, busy: false, listenerResult: null, clockBusy: false });
        });
        return stopping;
      },
      dispose: () => {
        if (disposal) return disposal;
        disposed = true;
        disposal = session.stop();
        return disposal;
      },
    };
    owner = session;
    return session;
  };
};
