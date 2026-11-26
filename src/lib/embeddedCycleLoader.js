// Read orchestration only: no writes to Firebase, retries of mutations, or new storage.
export function createEmbeddedCycleLoader({ accountId, readCache, readServer, saveCache,
  onState, offline = () => navigator.onLine === false, timeoutMs = 12000 }) {
  let disposed = false, loaded = null, task = null, serverTask = null;
  let phase = 'loading';
  // Presentation metadata only; cached data is not evidence of a server failure.
  let serverReadFailed = false, needsServerConfirmation = false, reconnectVersion = 0;
  const publish = (next, apply = false) => {
    phase = next;
    if (!disposed) onState({ accountId, phase, serverReadFailed, needsServerConfirmation, hasData: Boolean(loaded), knownOffline: offline(), data: apply ? loaded : undefined });
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
    const startedVersion = reconnectVersion;
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
      if (offline()) { needsServerConfirmation = true; publish(loaded ? 'cached' : 'unavailable'); return; }
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
        serverReadFailed = false;
        needsServerConfirmation = offline();
        loaded = data;
        publish(offline() ? 'cached' : 'ready', true);
        // Cache failures never turn a confirmed server read into an empty cycle.
        await bounded(Promise.resolve().then(() => disposed ? undefined : saveCache(accountId, data))).catch(() => {});
      } catch {
        serverReadFailed = true;
        if (!disposed) publish(loaded ? 'cached' : 'unavailable');
      }
    })().finally(() => {
      task = null;
      // A reconnect can race an offline cache load or an earlier failing read.
      // At most one follow-up for that transition; retain the SDK request coalescing.
      if (!disposed && reconnectVersion !== startedVersion && needsServerConfirmation && !offline()) void load();
    });
    return task;
  };
  return {
    load,
    connectionLost: () => {
      needsServerConfirmation = true;
      publish(loaded ? 'cached' : phase === 'loading' ? 'loading' : 'unavailable');
    },
    connectionRestored: () => {
      // Initial native status can arrive after the initial Firebase response.
      if (phase === 'ready' && !needsServerConfirmation && !serverReadFailed) return Promise.resolve();
      reconnectVersion++;
      return load();
    },
    dispose: () => { disposed = true; },
  };
}
