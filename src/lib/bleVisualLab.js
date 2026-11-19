// Pure gate. Never substitute Capacitor platform detection globally.
export const isBleVisualLabEnabled = (env, location, native = false) => env?.DEV === true
  && env.MODE === 'staging' && !native
  && ['localhost', '127.0.0.1'].includes(location?.hostname);

export const bleLabScenarios = {
  standardLinked: 'Estandar vinculado (experimental)', easyLinked: 'Easy@Home EBT-300 (experimental)',
  twoDevices: 'Dos termómetros vinculados', standardTrial: 'Recepción estándar de prueba',
  notReady: 'Conexión no preparada (reintentar)',
  savedPreferences: 'Preferencias guardadas (reconectar para aplicar)', legacyPreferences: 'Vinculación antigua sin preferencias', clockReset: 'Reloj reiniciado (reconectar para corregir)',
  unlinked: 'Sin vincular', disconnected: 'Desconectado', searching: 'Buscando termómetro',
  checking: 'Comprobando vínculo (desconocido)', inspecting: 'Inspeccionando', stopping: 'Desconectando',
  connecting: 'Conectando', listening: 'Escuchando temperaturas', missing: 'Termómetro no encontrado',
  error: 'Error de conexión', cancelled: 'Conexión cancelada', clock: 'Escuchando con reloj desajustado',
  clockDisconnected: 'Desconectado con incidencia horaria', clockPending: 'Pendientes y reloj',
  clockFailure: 'Reloj: fallo al sincronizar', clockUnverified: 'Reloj: ajuste sin verificar',
  clockUnsupported: 'Reloj: ajuste no soportado', one: 'Una temperatura pendiente',
  multiple: 'Varias temperaturas pendientes', compact: 'Tarjeta minimizada', expanded: 'Tarjeta expandida',
  old: 'Fecha fuera de rango', duplicate: 'Posible duplicado', saving: 'Guardado en curso',
  saved: 'Temperatura incorporada', batch: 'Varias incorporaciones', uncertain: 'Resultado incierto',
};
export function createBleLabScenario(scenario) {
  const generic = ['standardLinked', 'easyLinked'].includes(scenario);
  const profile = scenario === 'easyLinked' ? { model: 'EBT-300', name: 'Easy@Home EBT-300', protocol: 'easyhome-ebt300', compatibility: 'experimental' } : { model: null, name: 'Termometro estandar (simulado)', protocol: 'health-thermometer', compatibility: 'experimental' };
  const statuses = { twoDevices: 'stopped', standardTrial: 'trial', notReady: 'error', checking: 'checking', inspecting: 'inspecting', stopping: 'stopping', unlinked: 'stopped', disconnected: 'stopped', searching: 'searching', connecting: 'connecting', missing: 'missing', error: 'error', cancelled: 'error', clockDisconnected: 'stopped' };
  const hasReadings = ['one', 'multiple', 'compact', 'expanded', 'old', 'duplicate', 'saving', 'uncertain', 'clockPending'].includes(scenario);
  const readings = hasReadings ? Array.from({ length: ['multiple', 'expanded', 'compact'].includes(scenario) ? 3 : 1 }, (_, i) => ({
    uiId: i + 1, deviceModel: 'BM-Vinca2', deviceKey: 'fictional-device', temperatureC: 36.4 + i / 10,
    deviceTimestamp: `${scenario === 'old' ? '2020-01-01' : '2026-11-04'}T08:${10 + i}:00`,
    importStatus: scenario === 'uncertain' ? 'uncertain' : scenario === 'saving' ? 'saving' : 'pending',
    draft: { isoDate: scenario === 'old' ? '2020-01-01' : '2026-11-04', time: `08:${10 + i}`, confirmed: false },
  })) : [];
  return { readings, expanded: hasReadings && !['one', 'compact'].includes(scenario),
    sessionState: { bindings: scenario === 'unlinked' || scenario === 'checking' ? [] : [{ deviceKey: 'fictional-device', ...(generic ? profile : { model: 'BM-Vinca2' }) }, ...(scenario === 'twoDevices' ? [{ deviceKey: 'fictional-second', model: 'BM-Vinca2' }] : [])],
      preferencesByDevice: {}, ...(generic ? { boundModel: profile.model, boundName: profile.name, boundProtocol: profile.protocol, boundCompatibility: 'experimental' } : {}), trial: scenario === 'standardTrial' ? { status: 'listening', verificationId: 'lab-preset', deviceId: 'lab-standard', readings: [{ verificationId: 'lab-preset', readingId: 'lab-reading', temperatureC: 36.65, deviceTimestamp: '2026-11-18T08:05:00' }] } : null, devices: [], selectedDeviceId: scenario === 'standardTrial' ? 'lab-standard' : '', inspectionResult: scenario === 'standardTrial' ? { compatible: false, standardTrialAvailable: true } : null, capabilities: generic ? { ...profile, temperatureReceive: true, deviceInfo: true, clockSync: profile.protocol === 'easyhome-ebt300', unitWrite: profile.protocol === 'easyhome-ebt300' } : { model: 'BM-Vinca2', clockRead: true, clockSync: scenario !== 'clockUnsupported' }, deviceKey: 'fictional-device', visualScenario: scenario, status: statuses[scenario] ?? 'listening', remembered: scenario === 'checking' ? null : scenario !== 'unlinked',
      // Scenario changes replace the whole state; match the real session's empty results.
      volumeResult: null, measurementModeResult: null,
      error: scenario === 'notReady' ? { code: 'LISTENER_NOT_READY', message: 'Simulación: faltan las indicaciones. Reconecta para preparar la escucha.' } : scenario === 'cancelled' ? { code: 'CONNECTION_CANCELLED' } : scenario === 'error' ? { message: 'Error de conexión ficticio.' } : null,
      clockResult: scenario.startsWith('clock') && scenario !== 'clockDisconnected'
        ? { operation: 'read', significantDrift: true, driftSeconds: 600 } : null },
    clockHistory: scenario.startsWith('clock') ? { state: 'misaligned', lastValidCheck: { driftSeconds: 600 } } : null,
    notice: ['saved', 'batch'].includes(scenario) ? { count: scenario === 'batch' ? 3 : 1, temperature: 36.4, time: '08:10', isoDate: '2026-11-04' } : null,
  };
}
