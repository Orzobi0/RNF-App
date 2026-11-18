// Adapter facts only. Local standard verification never adds a global model entry.
export const thermometerCatalog = Object.freeze([
  { model: 'BM-Vinca2', name: 'Femometer Vinca 2', protocol: 'vinca2', compatibility: 'compatible' },
  { model: 'EBT-300', name: 'Easy@Home EBT-300', protocol: 'easyhome-ebt300', compatibility: 'experimental' },
]);

export const implementedThermometer = ({ model, protocol, compatibility } = {}) =>
  thermometerCatalog.some(item => item.model === model && item.protocol === protocol && item.compatibility === compatibility)
  || (protocol === 'health-thermometer' && compatibility === 'experimental');

export const thermometerName = device => thermometerCatalog.find(item => item.model === device?.model)?.name
  || device?.name || device?.model || 'Termómetro Bluetooth';
