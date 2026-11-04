import { thermometerCapabilities } from './thermometerCapabilities.js';

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
    let automaticClockPending = false;
    let stopping;
    let disposal;
    let subscription;
    const now = api.now ?? Date.now;
    let listeningExpiresAt = 0;
    let lastForegroundAttempt = -Infinity;
    let resumeJob;
    let state = {
      status: 'checking', busy: false, remembered: null, devices: [],
      selectedDeviceId: '', inspectionResult: null, error: null, listenerResult: null,
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
    const run = (task) => {
      if (disposed || job || clockJob || stopping || state.status === 'listening') return Promise.resolve();
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
        await api.disconnectFemometer().catch(() => {});
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
      publish({ status: 'connecting', listenerResult: null, clockResult: null, clockError: null, capabilities: thermometerCapabilities() });
      // Assign even a late subscription so cancellation can remove it after job settles.
      subscription = await api.addFemometerTemperatureListener(event => {
        if (!current()) return;
        onTemperature(event);
        if (['timeout', 'disconnected', 'error'].includes(event?.status)) {
          void session.stop(event.status === 'timeout' ? 'stopped' : 'error',
            event.status === 'timeout' ? null : { message: event.message || 'El termómetro se desconectó.' });
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
      if (disposed || job || clockJob || stopping || state.status !== 'listening') return Promise.resolve();
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
    const session = {
      readClock: () => clock(false),
      syncClock: () => clock(true),
      start: () => run((call, current) => search(true, call, current)),
      resume: () => {
        if (disposed) return Promise.resolve();
        const decision = reason => publish({ foreground: { detectedAt: now(), reason } });
        if (resumeJob || job) { decision('operation_in_progress'); return resumeJob ?? Promise.resolve(); }
        if (!state.remembered) { decision('no_remembered_device'); return Promise.resolve(); }
        if (state.status === 'listening' && now() < listeningExpiresAt) { decision('listening_active'); return Promise.resolve(); }
        // Mount/manual searches do not consume the first foreground attempt.
        if (now() - lastForegroundAttempt < 5_000) { decision('brief_cooldown'); return Promise.resolve(); }
        lastForegroundAttempt = now();
        decision('reconnecting');
        resumeJob = (async () => {
          // Drain a pending terminal event, or invalidate an expired native listener
          // whose timeout event Android has not delivered yet, before reconnecting.
          if (stopping) await stopping;
          else if (state.status === 'listening') await session.stop();
          if (!disposed && !job && !clockJob && !stopping) await session.start();
        })().finally(() => { resumeJob = null; });
        return resumeJob;
      },
      scan: () => run((call, current) => search(false, call, current)),
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
        ++version; // Invalidate all continuations and events synchronously.
        publish({ status: 'stopping', busy: true });
        const pending = Promise.all([job, clockJob]);
        stopping = (async () => {
          await ready;
          // A StrictMode mount cancelled before acquisition must not stop its successor.
          try {
            if (acquired) await api.disconnectFemometer();
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
