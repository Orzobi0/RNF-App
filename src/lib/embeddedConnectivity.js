// Account-scoped adapter for the official Capacitor plugins. No polling or writes.
export function observeEmbeddedConnectivity({ network, app, onOffline, onOnline,
  browser = window, page = document, webOffline = () => navigator.onLine === false,
  onError = error => console.warn('No se pudo consultar conectividad Android', error) }) {
  let disposed = false, connected, revision = 0, query = null;
  const handles = [];
  const isOffline = () => connected === undefined ? webOffline() : !connected;
  const apply = (status, checkServer = false) => {
    if (disposed || typeof status?.connected !== 'boolean') return;
    const previous = connected;
    connected = status.connected;
    if (!connected) onOffline();
    else if (previous !== true || checkServer) onOnline();
  };
  const check = () => {
    if (disposed) return Promise.resolve();
    if (query) return query;
    const started = revision;
    query = Promise.resolve().then(() => network.getStatus()).then(status => {
      // A newer push event wins over an older getStatus response.
      if (started === revision) apply(status, true);
    }).catch(error => {
      if (disposed) return;
      onError(error);
      // Keep the last native result on transient bridge failures.
      if (connected === undefined) apply({ connected: !webOffline() }, true);
    }).finally(() => { query = null; });
    return query;
  };
  const listen = async (plugin, event, callback) => {
    try {
      const handle = await plugin.addListener(event, callback);
      if (disposed) await handle.remove();
      else handles.push(handle);
    } catch (error) { if (!disposed) onError(error); }
  };
  const visible = () => { if (page.visibilityState === 'visible') void check(); };
  browser.addEventListener('online', check);
  browser.addEventListener('offline', check);
  page.addEventListener('visibilitychange', visible);
  void listen(app, 'appStateChange', state => { if (!disposed && state.isActive) void check(); });
  const ready = listen(network, 'networkStatusChange', status => {
    if (disposed) return;
    revision++;
    apply(status);
  }).then(check);
  return { isOffline, ready, dispose() {
    disposed = true;
    browser.removeEventListener('online', check);
    browser.removeEventListener('offline', check);
    page.removeEventListener('visibilitychange', visible);
    for (const handle of handles) void handle.remove().catch(onError);
  } };
}
