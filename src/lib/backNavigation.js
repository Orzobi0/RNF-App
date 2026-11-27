export const backLayers = [];
export function registerBackLayer(close) {
  const layer = { close };
  backLayers.push(layer);
  return () => { const i = backLayers.indexOf(layer); if (i !== -1) backLayers.splice(i, 1); };
}
export function androidBackDestination(path) {
  if (/^\/settings\/devices\/.+/.test(path)) return '/settings/devices';
  if (path.startsWith('/settings/')) return '/settings';
  if (path.startsWith('/cycle/') || /^\/chart\/.+/.test(path)) return '/archived-cycles';
  return path === '/' || path === '/auth' ? null : '/';
}
