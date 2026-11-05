// Pure gate. Never substitute Capacitor platform detection globally.
export const isBleVisualLabEnabled = (env, location, native = false) => env?.DEV === true
  && env.MODE === 'staging' && !native
  && ['localhost', '127.0.0.1'].includes(location?.hostname);

export const bleLabScenarios = {
  unlinked: 'Sin vincular', disconnected: 'Desconectado', searching: 'Buscando termómetro',
  connecting: 'Conectando', listening: 'Escuchando temperaturas', missing: 'Termómetro no encontrado',
  error: 'Error de conexión', clock: 'Reloj desajustado', one: 'Una temperatura pendiente',
  multiple: 'Varias temperaturas pendientes', compact: 'Tarjeta minimizada', expanded: 'Tarjeta expandida',
  old: 'Fecha fuera de rango', duplicate: 'Posible duplicado', saving: 'Guardado en curso',
  saved: 'Temperatura incorporada', batch: 'Varias incorporaciones', uncertain: 'Resultado incierto',
};
export function createBleLabScenario(scenario) {
  const statuses = { unlinked: 'stopped', disconnected: 'stopped', searching: 'searching', connecting: 'connecting', missing: 'missing', error: 'error' };
  const hasReadings = ['one', 'multiple', 'compact', 'expanded', 'old', 'duplicate', 'saving', 'uncertain'].includes(scenario);
  const readings = hasReadings ? Array.from({ length: ['multiple', 'expanded', 'compact'].includes(scenario) ? 3 : 1 }, (_, i) => ({
    uiId: i + 1, deviceKey: 'fictional-device', temperatureC: 36.4 + i / 10,
    deviceTimestamp: `${scenario === 'old' ? '2020-01-01' : '2026-11-04'}T08:${10 + i}:00`,
    importStatus: scenario === 'uncertain' ? 'uncertain' : scenario === 'saving' ? 'saving' : 'pending',
    draft: { isoDate: scenario === 'old' ? '2020-01-01' : '2026-11-04', time: `08:${10 + i}`, confirmed: false },
  })) : [];
  return { readings, expanded: hasReadings && !['one', 'compact'].includes(scenario),
    sessionState: { devices: [], selectedDeviceId: '', capabilities: { clockRead: true, clockSync: true }, deviceKey: 'fictional-device', status: statuses[scenario] ?? 'listening', remembered: scenario !== 'unlinked',
      clockResult: { significantDrift: scenario === 'clock' } },
    notice: ['saved', 'batch'].includes(scenario) ? { count: scenario === 'batch' ? 3 : 1, temperature: 36.4, time: '08:10', isoDate: '2026-11-04' } : null,
  };
}
