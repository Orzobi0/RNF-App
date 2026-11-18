// App operations, not a promise about every feature in a manufacturer's firmware.
// Unknown models fail closed. Add a model here only when its adapter exists.
export const thermometerCapabilities = (reported) => {
  const known = reported?.model === 'BM-Vinca2'
    && reported.protocol === 'vinca2' && reported.compatibility === 'compatible';
  return {
    model: typeof reported?.model === 'string' ? reported.model : null,
    protocol: known ? 'vinca2' : null,
    compatibility: known ? 'compatible' : 'pending',
    clockProtocol: known ? reported.clockProtocol || 'unavailable' : 'unavailable',
    volumeWrite: known && reported.volumeWrite === true,
    clockRead: known && reported.clockRead === true,
    clockSync: known && reported.clockSync === true,
    historyReceive: known && reported.historyReceive === true,
    historyRequest: known && reported.historyRequest === true,
    modeConfiguration: known && reported.modeConfiguration === true,
  };
};
