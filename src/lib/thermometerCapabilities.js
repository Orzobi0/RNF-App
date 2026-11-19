import { implementedThermometer } from './thermometerCatalog.js';
// App operations, not a promise about every feature in a manufacturer's firmware.
// Unknown models fail closed. Add a model here only when its adapter exists.
export const thermometerCapabilities = (reported) => {
  const known = reported?.model === 'BM-Vinca2'
    && reported.protocol === 'vinca2' && reported.compatibility === 'compatible';
  const implemented = implementedThermometer(reported ?? {});
  return {
    model: typeof reported?.model === 'string' ? reported.model : null,
    protocol: implemented ? reported.protocol : null,
    compatibility: implemented ? reported.compatibility : 'pending',
    temperatureReceive: implemented,
    deviceInfo: implemented,
    clockProtocol: known ? reported.clockProtocol || 'unavailable' : 'unavailable',
    volumeWrite: known && reported.volumeWrite === true,
    clockRead: known && reported.clockRead === true,
    clockSync: (known || (implemented && reported.protocol === 'easyhome-ebt300')) && reported.clockSync === true,
    unitWrite: implemented && reported.protocol === 'easyhome-ebt300' && reported.unitWrite === true,
    historyReceive: implemented && reported.protocol !== 'health-thermometer' && reported.historyReceive === true,
    historyRequest: known && reported.historyRequest === true,
    modeConfiguration: known && reported.modeConfiguration === true,
  };
};
