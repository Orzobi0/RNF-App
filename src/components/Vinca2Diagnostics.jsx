import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFemometer } from '@/contexts/FemometerContext';
import { cn } from '@/lib/utils';

const DEFAULT_TEMPERATURE_LISTEN_SECONDS = 6 * 60;

// Read-only session diagnostics. Opening this disclosure never starts BLE work.
const Vinca2Diagnostics = () => {
  const { sessionState, readings, listeningStartedAt, temperatureListenerMessage, openReadingReview, lifecycleStatus, clockHistory } = useFemometer();
  const { inspectionResult } = sessionState;
  const isStartingTemperatureListener = sessionState.status === 'connecting';
  const isTemperatureListenerActive = sessionState.status === 'listening';
  const temperatureConnectionReady = Boolean(sessionState.listenerResult?.connectionReady);
  const temperatureIndicationsActive = Boolean(sessionState.listenerResult?.indicationsActive);
  const lastTechnicalError = sessionState.error ? {
    code: sessionState.error.code || 'UNKNOWN',
    technicalMessage: String(sessionState.error.technicalMessage || sessionState.error.message || 'Sin detalle técnico').split('\n')[0].slice(0, 500),
  } : null;
  const [selectedReadingId, setSelectedReadingId] = useState(null);
  const lastTemperatureReading = readings.find(item => item.uiId === selectedReadingId) ?? readings.at(-1) ?? null;
  const [temperatureSecondsRemaining, setTemperatureSecondsRemaining] = useState(DEFAULT_TEMPERATURE_LISTEN_SECONDS);
  useEffect(() => {
    if (!isTemperatureListenerActive) return undefined;
    const timeout = Number(sessionState.listenerResult?.timeoutSeconds);
    const duration = Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : DEFAULT_TEMPERATURE_LISTEN_SECONDS;
    const startedAt = listeningStartedAt ?? Date.now();
    setTemperatureSecondsRemaining(Math.max(0, duration - Math.floor((Date.now() - startedAt) / 1000)));
    const interval = window.setInterval(() => {
      setTemperatureSecondsRemaining(Math.max(0, duration - Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTemperatureListenerActive, sessionState.listenerResult, listeningStartedAt]);

  const renderStatusLine = (ok, successText, missingText) => (
    <li className={cn('flex gap-2 text-sm', ok ? 'text-emerald-700' : 'text-amber-700')}>
      <span className="shrink-0 font-semibold" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span>{ok ? successText : missingText}</span>
    </li>
  );

  return <details className="mt-6 border-t border-slate-100">
    <summary className="flex min-h-11 cursor-pointer items-center py-3 text-sm font-medium text-slate-500">Diagnóstico técnico</summary>
    <div className="min-w-0 space-y-4 break-words pb-4 text-xs text-slate-600">

      {sessionState.volumeResult?.commandsAccepted && <p>Comandos Bluetooth de volumen aceptados; volumen físico no verificado.</p>}
      {sessionState.measurementModeResult?.commandsAccepted && <p>Comandos Bluetooth de modo aceptados; modo real no verificado.</p>}
      <p>Estado de escucha: {sessionState.status}</p>
      {clockHistory && <div><p>Historial del reloj: {clockHistory.state}</p>
        {clockHistory.lastVerifiedSync && <p>Última sincronización verificada: {new Date(clockHistory.lastVerifiedSync.checkedAt).toLocaleString()}</p>}
        <p>Este historial no verifica las fechas de las temperaturas.</p></div>}
      {sessionState.clockError && <p>{sessionState.clockError.code}: {sessionState.clockError.message}</p>}
      {sessionState.devices?.length > 0 && <ul aria-label="Dispositivos detectados">{sessionState.devices.map(device => <li key={device.id}>{device.name || 'Sin nombre'} · Señal {device.rssi ?? 'no disponible'} dBm{device.isRemembered ? ' · Vinculado' : ''}</li>)}</ul>}
            <div className="text-xs text-slate-500" role="status">
              <p>Ciclo de vida Android: {lifecycleStatus === 'preview' ? 'simulado en laboratorio; sin listener nativo' : lifecycleStatus === 'registered' ? 'listener registrado (pendiente de comprobar eventos reales)' : lifecycleStatus === 'unavailable' ? 'no disponible; utiliza la búsqueda manual' : 'registrando listener'}.</p>
              <p>{sessionState.foreground ? `Regreso detectado a las ${new Date(sessionState.foreground.detectedAt).toLocaleTimeString()}: ${({
                reconnecting: 'iniciando reconexión', listening_active: 'escucha vigente; no se reconecta',
                operation_in_progress: 'ya hay una operación en curso', no_remembered_device: 'sin termómetro recordado',
                brief_cooldown: 'espera breve de 5 segundos entre intentos de regreso',
              })[sessionState.foreground.reason]}.` : 'Todavía no se ha detectado ningún regreso a primer plano.'}</p>
            </div>
              {sessionState.clockResult ? (
                <div role="status" className="text-sm text-slate-600">
                  <p>{sessionState.clockResult.operation === 'read' ? 'Lectura del reloj'
                    : sessionState.clockResult.verified ? 'Ajuste verificado mediante lectura (tolerancia de 5 segundos).'
                      : 'Escritura aceptada, pero el ajuste no ha podido verificarse. Comprueba el reloj.'}</p>
                  <p>Hora del dispositivo: {sessionState.clockResult.deviceLocalTime || 'no disponible'} (zona desconocida)</p>
                  {sessionState.clockResult.requestedLocalTime ? <p>Hora enviada: {sessionState.clockResult.requestedLocalTime} · {sessionState.clockResult.phoneTimeZone}</p> : null}
                </div>
              ) : null}
          {(isStartingTemperatureListener ||
            isTemperatureListenerActive ||
            temperatureListenerMessage ||
            lastTemperatureReading) ? (
            <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-3">
              <ul className="space-y-1.5">
                {renderStatusLine(
                  temperatureConnectionReady,
                  'Conexión lista',
                  isStartingTemperatureListener ? 'Preparando conexión BLE' : 'Conexión no activa'
                )}
                {renderStatusLine(
                  temperatureIndicationsActive,
                  'Indicaciones activas',
                  isStartingTemperatureListener ? 'Activando indicaciones' : 'Indicaciones no activas'
                )}
              </ul>
              <div>
                {isTemperatureListenerActive ? (
                  <p className="text-sm font-medium text-slate-700">
                    Escuchando el termómetro… {Math.floor(temperatureSecondsRemaining / 60)}:
                    {String(temperatureSecondsRemaining % 60).padStart(2, '0')} restantes
                  </p>
                ) : null}
                {temperatureListenerMessage ? (
                  <p className="text-sm leading-relaxed text-slate-600">
                    {temperatureListenerMessage}
                  </p>
                ) : null}
              </div>

              {readings.length ? <ul aria-label="Lecturas Bluetooth de esta sesión" className="max-h-64 space-y-2 overflow-y-auto">
                {readings.map(reading => <li key={reading.uiId}>
                  <button type="button" disabled={reading.importStatus === 'saving'} aria-pressed={lastTemperatureReading?.uiId === reading.uiId}
                    className="min-h-11 w-full rounded-lg border border-rose-100 bg-white px-3 py-2 text-left text-sm"
                    onClick={() => setSelectedReadingId(reading.uiId)}>
                    {Number(reading.temperatureC).toFixed(2)} °C · {reading.deviceTimestamp || 'Sin fecha del termómetro'}
                    <span className="block text-xs text-slate-500">{reading.importStatus === 'incorporated' ? 'Incorporada' : reading.importStatus === 'saving' ? 'Guardando…' : 'Pendiente de revisión'}</span>
                  </button>
                </li>)}
              </ul> : null}
              {lastTemperatureReading ? (
                <div className="rounded-lg border border-white bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Lectura seleccionada
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {Number(lastTemperatureReading.temperatureC).toFixed(2)} °C
                  </p>
                  <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                    <p>Recibida: {lastTemperatureReading.receivedAt || 'sin hora'}</p>
                    <p>
                      Hora del termómetro:{' '}
                      {lastTemperatureReading.deviceTimestamp || 'no incluida'}
                    </p>
                    <p>Fiabilidad de la fecha: {lastTemperatureReading.normalized?.device_date_reliability === 'invalid'
                      ? 'inválida' : lastTemperatureReading.normalized?.device_date_reliability === 'missing'
                        ? 'no incluida' : 'sin verificar; zona horaria desconocida'}</p>
                    <p>Tipo: {lastTemperatureReading.measurementType || 'no incluido'}</p>
                  </div>
                  <Button type="button" variant="outline" disabled={!['pending', 'uncertain'].includes(lastTemperatureReading.importStatus)}
                    onClick={() => openReadingReview(lastTemperatureReading.uiId)}>Incorporar al registro</Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {lastTechnicalError ? (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-amber-800">
                Detalles del error
              </summary>
              <div className="mt-2 space-y-1 text-sm text-amber-900">
                <p>
                  <span className="font-semibold">Código:</span> {lastTechnicalError.code}
                </p>
                <p className="break-words">
                  <span className="font-semibold">Mensaje técnico:</span>{' '}
                  {lastTechnicalError.technicalMessage}
                </p>
              </div>
            </details>
          ) : null}

          {inspectionResult ? (
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <ul className="space-y-1.5">
                {renderStatusLine(
                  true,
                  'Termómetro BLE detectado',
                  'No se detectó el termómetro BLE'
                )}
                {renderStatusLine(
                  inspectionResult.healthThermometerFound,
                  'Servicio de termómetro encontrado',
                  'No se encontró el servicio Health Thermometer 0x1809'
                )}
                {renderStatusLine(
                  inspectionResult.temperatureMeasurementFound,
                  'Característica de temperatura encontrada',
                  'No se encontró la característica Temperature Measurement 0x2A1C'
                )}
              </ul>

              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Detalles técnicos
                </summary>
                <div className="mt-3 space-y-3">
                  {(inspectionResult.services || []).map((service) => (
                    <div key={service.uuid} className="space-y-1">
                      <code className="block break-all text-xs text-slate-700">{service.uuid}</code>
                      <ul className="space-y-1 pl-3">
                        {(service.characteristics || []).map((characteristic) => (
                          <li key={characteristic.uuid} className="text-xs text-slate-500">
                            <code className="break-all text-slate-700">{characteristic.uuid}</code>
                            <span className="block">
                              {(characteristic.properties || []).join(', ') || 'sin propiedades'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : null}

    </div>
  </details>;
};
export default Vinca2Diagnostics;
