// Read orchestration only: no writes to Firebase, retries of mutations, or new storage.
export function createEmbeddedCycleLoader({ accountId, readCache, readServer, saveCache,
  onState, offline = () => navigator.onLine === false, timeoutMs = 12000 }) {
  let disposed = false, loaded = null, task = null, serverTask = null;
  let phase = 'loading';
  const publish = (next, apply = false) => {
    phase = next;
    if (!disposed) onState({ accountId, phase, hasData: Boolean(loaded), knownOffline: offline(), data: apply ? loaded : undefined });
  };
  const bounded = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('cycle-read-timeout')), timeoutMs);
    })]).finally(() => clearTimeout(timer));
  };
  const usable = data => data && Array.isArray(data.archivedCycles) &&
    data.currentCycle && Array.isArray(data.currentCycle.data);
  const load = () => {
    if (disposed) return Promise.resolve();
    if (task) return task;
    task = (async () => {
      publish(loaded ? 'refreshing' : 'loading');
      if (!loaded) {
        try {
          const cached = await bounded(Promise.resolve().then(() => readCache(accountId)));
          if (disposed) return;
          if (usable(cached) && (cached.currentCycle.id || cached.archivedCycles.length)) {
            loaded = cached; publish('cached', true);
          }
        } catch { /* Restricted/unresponsive storage is not an empty account. */ }
      }
      if (disposed) return;
      if (offline()) { publish(loaded ? 'cached' : 'unavailable'); return; }
      try {
        // Keep the real request after a UI timeout: retries join it instead of
        // issuing simultaneous requests that the Firestore SDK cannot cancel.
        if (!serverTask) {
          serverTask = Promise.resolve().then(() => readServer(accountId));
          const current = serverTask;
          current.finally(() => { if (serverTask === current) serverTask = null; }).catch(() => {});
        }
        const data = await bounded(serverTask);
        if (disposed) return;
        if (!usable(data)) throw new Error('invalid-cycle-snapshot');
        loaded = data;
        publish(offline() ? 'cached' : 'ready', true);
        // Cache failures never turn a confirmed server read into an empty cycle.
        await bounded(Promise.resolve().then(() => disposed ? undefined : saveCache(accountId, data))).catch(() => {});
      } catch {
        if (!disposed) publish(loaded ? 'cached' : 'unavailable');
      }
    })().finally(() => { task = null; });
    return task;
  };
  return {
    load,
    connectionLost: () => publish(loaded ? 'cached' : phase === 'loading' ? 'loading' : 'unavailable'),
    dispose: () => { disposed = true; },
  };
}
