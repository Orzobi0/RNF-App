import React, { useEffect, useState } from 'react';
import { Bluetooth, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFemometer } from '@/contexts/FemometerContext';
import { cn } from '@/lib/utils';

const DEFAULT_TEMPERATURE_LISTEN_SECONDS = 6 * 60;

const Vinca2Panel = () => {
  const { sessionRef, sessionState, readings, listeningStartedAt, temperatureListenerMessage, openReadingReview, openClockDialog, lifecycleStatus, clockHistory } = useFemometer();
  const [selectedReadingId, setSelectedReadingId] = useState(null);
  const lastTemperatureReading = readings.find(item => item.uiId === selectedReadingId) ?? readings.at(-1) ?? null;
  useEffect(() => {
    if (window.location.hash !== '#bluetooth-readings') return undefined;
    const frame = requestAnimationFrame(() => document.getElementById('bluetooth-readings')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const { status, busy, remembered, devices, selectedDeviceId, inspectionResult } = sessionState;
  const isScanning = status === 'searching';
  const isInspecting = status === 'inspecting';
  const isStartingTemperatureListener = status === 'connecting';
  const isTemperatureListenerActive = status === 'listening';
  const isUpdatingRemembered = busy && !isScanning && !isInspecting && !isStartingTemperatureListener;
  const temperatureConnectionReady = Boolean(sessionState.listenerResult?.connectionReady);
  const temperatureIndicationsActive = Boolean(sessionState.listenerResult?.indicationsActive);
  const lastTechnicalError = sessionState.error ? {
    code: sessionState.error.code || 'UNKNOWN',
    technicalMessage: String(sessionState.error.technicalMessage || sessionState.error.message || 'Sin detalle técnico').split('\n')[0].slice(0, 500),
  } : null;
  const rememberedSearch = status === 'error' ? 'error'
    : status === 'missing' ? 'missing' : devices.some(device => device.isRemembered) ? 'found' : 'pending';
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

  const handleScan = () => sessionRef.current?.scan();
  const handleInspect = () => sessionRef.current?.inspect();
  const handleRememberedChange = (forget = false) => sessionRef.current?.remember(forget);
  const handleStartTemperatureListener = () => sessionRef.current?.listen();
  const handleStopTemperatureListener = () => {
    return sessionRef.current?.stop();
  };
  const statusText = {
    checking: 'Consultando termómetro recordado…', idle: 'Selección manual disponible',
    searching: 'Buscando termómetro', connecting: 'Conectando', listening: 'Escuchando temperaturas',
    missing: 'No encontrado', error: 'Error', stopping: 'Deteniendo…', stopped: 'Detenido', inspecting: 'Comprobando compatibilidad',
  }[status];
  const renderStatusLine = (ok, successText, missingText) => (
    <li className={cn('flex gap-2 text-sm', ok ? 'text-emerald-700' : 'text-amber-700')}>
      <span className="shrink-0 font-semibold" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span>{ok ? successText : missingText}</span>
    </li>
  );

  return (
    <div id="bluetooth-readings" className="bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <Thermometer className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Vinca 2
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
              Si tienes un termómetro recordado, intentaremos escucharlo al abrir esta pantalla. También puedes buscarlo manualmente.
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
              Permite probar la recepción de temperaturas. Todavía no las guarda en tus registros.
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
              Mantén esta pantalla abierta mientras mides. Puedes detener la escucha en cualquier momento.
            </p>
          </div>

          <div className="space-y-2">
            <p role="status" className="text-sm font-medium text-slate-700">{statusText}</p>
            {clockHistory && <div className="text-xs text-slate-600">
              <p>Último estado horario conservado: {({ synchronized_verified: 'sincronizado y verificado', read_correct: 'leído y aparentemente correcto', misaligned: 'desajustado', unknown: 'desconocido' })[clockHistory.state]}.</p>
              {clockHistory.lastVerifiedSync && <p>Última sincronización verificada: {new Date(clockHistory.lastVerifiedSync.checkedAt).toLocaleString()}.</p>}
              <p>Este historial no verifica las fechas de las temperaturas.</p>
            </div>}
            <div className="text-xs text-slate-500" role="status">
              <p>Ciclo de vida Android: {lifecycleStatus === 'registered' ? 'listener registrado (pendiente de comprobar eventos reales)' : lifecycleStatus === 'unavailable' ? 'no disponible; utiliza la búsqueda manual' : 'registrando listener'}.</p>
              <p>{sessionState.foreground ? `Regreso detectado a las ${new Date(sessionState.foreground.detectedAt).toLocaleTimeString()}: ${({
                reconnecting: 'iniciando reconexión', listening_active: 'escucha vigente; no se reconecta',
                operation_in_progress: 'ya hay una operación en curso', no_remembered_device: 'sin termómetro recordado',
                brief_cooldown: 'espera breve de 5 segundos entre intentos de regreso',
              })[sessionState.foreground.reason]}.` : 'Todavía no se ha detectado ningún regreso a primer plano.'}</p>
            </div>
            {sessionState.error?.message ? <p className="text-sm text-amber-700">{sessionState.error.message}</p> : null}
            {remembered && !busy && !isTemperatureListenerActive ? (
              <Button type="button" variant="outline" onClick={() => sessionRef.current?.start()}>Reintentar</Button>
            ) : null}
            {(busy || isTemperatureListenerActive) && status !== 'stopping' ? (
              <Button type="button" variant="outline" onClick={handleStopTemperatureListener}>Detener</Button>
            ) : null}
          </div>

          <Button
            type="button"
            onClick={handleScan}
            disabled={busy || isScanning || isInspecting || isUpdatingRemembered || isStartingTemperatureListener || isTemperatureListenerActive}
            className="min-h-11 w-full bg-fertiliapp-fuerte text-white hover:brightness-95"
          >
            <Bluetooth className="mr-2 h-4 w-4" aria-hidden="true" />
            {isScanning ? 'Buscando…' : 'Buscar termómetro'}
          </Button>

          <p role="status" className="text-sm text-slate-600">
            {remembered === null
              ? (rememberedSearch === 'error' ? 'No se pudo consultar el termómetro recordado. Vuelve a buscar.' : 'Consultando termómetro recordado…')
              : !remembered ? 'No hay termómetro recordado para esta cuenta en este móvil.'
                : rememberedSearch === 'found' ? 'Termómetro recordado encontrado en la última búsqueda.'
                  : rememberedSearch === 'missing' ? 'Termómetro recordado no encontrado. Enciéndelo y vuelve a buscar, o selecciona otro manualmente.'
                    : rememberedSearch === 'error' ? 'No se pudo comprobar si está presente. La asociación se conserva.'
                      : 'Tienes un termómetro recordado. Busca para comprobar si está presente.'}
          </p>
          {isTemperatureListenerActive ? (
            <div className="space-y-2 rounded-xl border border-slate-100 px-3 py-3">
              <p className="text-sm font-semibold text-slate-800">Reloj del termómetro</p>
              <p className="text-sm text-slate-500">
                El ajuste utiliza la hora local del móvil. No corrige las fechas de lecturas anteriores.
              </p>
              {!sessionState.capabilities?.clockSync ? <p className="text-sm text-slate-500">Sin soporte de ajuste de reloj anunciado.</p> : null}
              <Button type="button" variant="outline"
                disabled={busy || sessionState.clockBusy || !sessionState.capabilities?.clockRead}
                onClick={() => sessionRef.current?.readClock()}>Leer reloj</Button>
              <Button type="button" variant="outline"
                disabled={busy || sessionState.clockBusy || !sessionState.capabilities?.clockSync}
                onClick={() => sessionRef.current?.syncClock()}>Sincronizar fecha y hora</Button>
              {sessionState.clockBusy ? <p role="status" className="text-sm">Consultando/ajustando reloj…</p> : null}
              {sessionState.clockError ? <p role="status" className="text-sm text-amber-700">{sessionState.clockError.message}</p> : null}
              {sessionState.clockResult?.significantDrift ? <p role="status" className="text-sm text-amber-700">
                El reloj difiere más de 2 minutos de la hora local del móvil. Puedes usar «Sincronizar fecha y hora».
                Esto no verifica las fechas de lecturas históricas.
              </p> : null}
              {sessionState.capabilities?.clockSync && <Button type="button" variant="outline" onClick={openClockDialog}>Revisar reloj</Button>}
              {sessionState.clockResult ? (
                <div role="status" className="text-sm text-slate-600">
                  <p>{sessionState.clockResult.operation === 'read' ? 'Lectura del reloj'
                    : sessionState.clockResult.verified ? 'Ajuste verificado mediante lectura (tolerancia de 5 segundos).'
                      : 'Escritura aceptada, pero el ajuste no ha podido verificarse. Comprueba el reloj.'}</p>
                  <p>Hora del dispositivo: {sessionState.clockResult.deviceLocalTime || 'no disponible'} (zona desconocida)</p>
                  {sessionState.clockResult.requestedLocalTime ? <p>Hora enviada: {sessionState.clockResult.requestedLocalTime} · {sessionState.clockResult.phoneTimeZone}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {remembered ? (
            <Button type="button" variant="outline" onClick={() => handleRememberedChange(true)}
              disabled={busy || isUpdatingRemembered || isScanning || isInspecting || isTemperatureListenerActive}>
              Olvidar termómetro
            </Button>
          ) : null}

          {devices.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Dispositivo disponible
              </p>
              {devices.map((device) => {
                const selected = selectedDeviceId === device.id;
                return (
                  <button
                    key={device.id}
                    type="button"
                    disabled={busy || isScanning || isInspecting || isUpdatingRemembered || isStartingTemperatureListener || isTemperatureListenerActive}
                    onClick={() => sessionRef.current?.select(device.id)}
                    className={cn(
                      'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                      selected
                        ? 'border-rose-200 bg-rose-50 text-slate-800'
                        : 'border-slate-100 bg-white text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{device.name}</span>
                      <span className="block text-xs text-slate-500">Señal {device.rssi} dBm</span>
                      {device.isRemembered ? <span className="block text-xs text-emerald-700">Termómetro recordado</span> : null}
                    </span>
                    {selected ? (
                      <span className="shrink-0 text-sm font-semibold text-rose-600">
                        Seleccionado
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <Button
                type="button"
                onClick={handleInspect}
                disabled={busy || !selectedDeviceId || isScanning || isInspecting || isTemperatureListenerActive}
                variant="outline"
                className="min-h-11 w-full border-rose-200 bg-white text-fertiliapp-fuerte hover:bg-rose-50"
              >
                {isInspecting ? 'Comprobando conexión…' : 'Comprobar compatibilidad'}
              </Button>

              <Button type="button" variant="outline" onClick={() => handleRememberedChange()}
                disabled={busy || !inspectionResult?.compatible || !selectedDeviceId || isScanning || isInspecting || isUpdatingRemembered || isStartingTemperatureListener || isTemperatureListenerActive}>
                {isUpdatingRemembered ? 'Actualizando…' : 'Recordar termómetro seleccionado'}
              </Button>

              {!isTemperatureListenerActive ? (
                <Button
                  type="button"
                  onClick={handleStartTemperatureListener}
                  disabled={busy || !selectedDeviceId || isScanning || isInspecting || isStartingTemperatureListener}
                  className="min-h-11 w-full bg-fertiliapp-fuerte text-white hover:brightness-95"
                >
                  {isStartingTemperatureListener ? 'Preparando escucha…' : 'Escuchar temperatura'}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleStopTemperatureListener}
                  variant="outline"
                  className="min-h-11 w-full border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                >
                  Detener escucha
                </Button>
              )}
            </div>
          ) : null}

          {(isStartingTemperatureListener ||
            isTemperatureListenerActive ||
            temperatureListenerMessage ||
            lastTemperatureReading) ? (
            <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-3">
              <div className="space-y-1.5">
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
                    className="w-full rounded-lg border border-rose-100 bg-white px-3 py-2 text-left text-sm"
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
      </div>
    </div>
  );
};

export default Vinca2Panel;
