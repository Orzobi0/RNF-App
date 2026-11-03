import React, { useEffect, useRef, useState } from 'react';
import { Bluetooth, Thermometer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCycleData } from '@/hooks/useCycleData';
import { useFemometer } from '@/contexts/FemometerContext';
import { normalizeBleMeasurement, prepareManualBleDraft } from '@/lib/bleMeasurements';
import { cn } from '@/lib/utils';

const DEFAULT_TEMPERATURE_LISTEN_SECONDS = 6 * 60;

const Vinca2Panel = ({ userId }) => {
  const { sessionRef, sessionState, readings, listeningStartedAt, temperatureListenerMessage, incorporateReading, openClockDialog } = useFemometer();
  const [selectedReadingId, setSelectedReadingId] = useState(null);
  const lastTemperatureReading = readings.find(item => item.uiId === selectedReadingId) ?? readings.at(-1) ?? null;
  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (window.location.hash !== '#bluetooth-readings') return undefined;
    const frame = requestAnimationFrame(() => document.getElementById('bluetooth-readings')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const navigate = useNavigate();
  const { currentCycle, isLoading, incorporateBleMeasurement } = useCycleData();
  const cycleRef = useRef(currentCycle);
  cycleRef.current = currentCycle;
  const [importDraft, setImportDraft] = useState(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [possibleDuplicate, setPossibleDuplicate] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importBusyRef = useRef(false);
  const beginImport = () => {
    const measurement = normalizeBleMeasurement(lastTemperatureReading, 'BM-Vinca2');
    if (!measurement || lastTemperatureReading.importStatus !== 'pending') return;
    setSelectedReadingId(lastTemperatureReading.uiId);
    setImportError('');
    setPossibleDuplicate(false);
    setImportResult(null);
    setImportDraft({ readingId: lastTemperatureReading.uiId, measurement, isoDate: measurement.time ? measurement.device_timestamp.slice(0, 10) : '',
      time: measurement.time, confirmed: false });
  };
  const confirmImport = async (allowPossibleDuplicate = false) => {
    if (importBusyRef.current) return;
    const session = sessionRef.current;
    const cycleId = currentCycle?.id;
    importBusyRef.current = true;
    setImportBusy(true);
    setImportError('');
    try {
      if (isLoading || !cycleId || !session) throw new Error('Espera a que se cargue el ciclo actual.');
      const draft = prepareManualBleDraft(importDraft.measurement, { ...importDraft, userId, cycleId, nowMs: Date.now() });
      const saved = await incorporateReading(importDraft.readingId, () => incorporateBleMeasurement(draft, { allowPossibleDuplicate }));
      if (!mountedRef.current || sessionRef.current !== session || cycleRef.current?.id !== cycleId) return;
      setImportResult(saved);
      setImportDraft(null);
      setPossibleDuplicate(false);
    } catch (error) {
      if (mountedRef.current && sessionRef.current === session) {
        setPossibleDuplicate(error?.code === 'ble-possible-duplicate');
        setImportError(`${error?.code === 'ble-possible-duplicate' ? 'Posible duplicado' : 'Requiere revisión'}: ${error?.title ? error.message : 'No se pudo incorporar la lectura. Revisa la fecha y la conexión antes de reintentar.'}`);
      }
    } finally {
      importBusyRef.current = false;
      if (mountedRef.current && sessionRef.current === session) setImportBusy(false);
    }
  };
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
                  <button type="button" disabled={importBusy} aria-pressed={lastTemperatureReading?.uiId === reading.uiId}
                    className="w-full rounded-lg border border-rose-100 bg-white px-3 py-2 text-left text-sm"
                    onClick={() => { setSelectedReadingId(reading.uiId); setImportDraft(null); setImportError(''); setPossibleDuplicate(false); }}>
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
                  <Button type="button" variant="outline" disabled={importBusy || lastTemperatureReading.importStatus !== 'pending'} onClick={beginImport}>Incorporar al registro</Button>
                  {importDraft ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm">Confirma la fecha y hora reales de {importDraft.measurement.temperature} °C (hora local del teléfono). La fecha del termómetro sigue sin verificar.</p>
                      <label className="block text-sm">Fecha
                        <Input type="date" value={importDraft.isoDate} disabled={importBusy}
                          onChange={event => { setPossibleDuplicate(false); setImportError(''); setImportDraft({ ...importDraft, isoDate: event.target.value, confirmed: false }); }} />
                      </label>
                      <label className="block text-sm">Hora
                        <Input type="time" value={importDraft.time} disabled={importBusy}
                          onChange={event => { setPossibleDuplicate(false); setImportError(''); setImportDraft({ ...importDraft, time: event.target.value, confirmed: false }); }} />
                      </label>
                      <label className="flex gap-2 text-sm"><input type="checkbox" checked={importDraft.confirmed} disabled={importBusy}
                        onChange={event => setImportDraft({ ...importDraft, confirmed: event.target.checked })} />Confirmo la fecha y hora reales y autorizo guardar esta temperatura en el registro.</label>
                      <Button type="button" disabled={!importDraft.confirmed || importBusy} onClick={() => confirmImport(possibleDuplicate)}>
                        {importBusy ? 'Incorporando…' : possibleDuplicate ? 'Es otra medición: confirmar y guardar' : 'Confirmar e incorporar'}
                      </Button>
                      <Button type="button" variant="ghost" disabled={importBusy} onClick={() => { setImportDraft(null); setImportError(''); setPossibleDuplicate(false); }}>Cancelar</Button>
                      {importError ? <p role="alert" className="text-sm text-amber-800">{importError}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {importResult ? <div role="status" className="space-y-2 text-sm">
            <p>Temperatura incorporada al registro del {importResult.isoDate}.</p>
            <Button type="button" variant="outline" onClick={() => navigate('/records', { state: { selectedDate: importResult.isoDate } })}>Ver registro actualizado</Button>
          </div> : null}
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
