// App operations, not a promise about every feature in a manufacturer's firmware.
// Unknown models fail closed. Add a model here only when its adapter exists.
export const thermometerCapabilities = (reported) => {
  const known = reported?.model === 'BM-Vinca2';
  return {
    model: known ? reported.model : null,
    clockProtocol: known ? reported.clockProtocol || 'unavailable' : 'unavailable',
    clockRead: known && reported.clockRead === true,
    clockSync: known && reported.clockSync === true,
    historyReceive: known && reported.historyReceive === true,
    historyRequest: known && reported.historyRequest === true,
    modeConfiguration: known && reported.modeConfiguration === true,
  };
};
