import { thermometerCapabilities } from './thermometerCapabilities.js';

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
    let stopping;
    let disposal;
    let subscription;
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
        if (current()) publish({ busy: false });
      });
      return job;
    };
    const listen = async (deviceId, call, current) => {
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
      const result = await call(() => api.startFemometerTemperatureListener(deviceId));
      publish({ status: 'listening', listenerResult: result, capabilities: thermometerCapabilities(result?.capabilities) });
    };
    const search = async (automatic, call, current) => {
      publish({ status: 'checking', devices: [], selectedDeviceId: '', inspectionResult: null });
      const saved = await call(() => api.getRememberedFemometer(userId));
      publish({ remembered: saved.remembered });
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
      publish({ clockBusy: true, clockResult: null, clockError: null });
      clockJob = Promise.resolve().then(() => {
        if (!current()) return;
        return sync ? api.syncFemometerClock() : api.readFemometerClock();
      }).then(result => {
        if (current()) publish({ clockResult: { ...result, operation: sync ? 'sync' : 'read' } });
      }).catch(error => {
        if (current()) publish({ clockError: error }); // Never tear down measurement reception for a clock failure.
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
        publish({ remembered: result.remembered, status: 'idle', devices: state.devices.map(device => ({
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
