import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bluetooth,
  Settings2,
  ChevronRight,
  CircleAlert,
  FileDown,
  Lock,
  LogOut,
  Mail,
  Thermometer,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthErrorMessage } from '@/lib/authErrorMessages';
import ExportCyclesDialog from '@/components/ExportCyclesDialog';
import { useCycleData } from '@/hooks/useCycleData';
import InstallPrompt from '@/components/InstallPrompt';
import { normalizeBleMeasurement } from '@/lib/bleMeasurements';
import {
  createFemometerPanelSession,
  isFemometerBleAndroidNative,
  isFemometerBlePrototypeEnabled,
} from '@/lib/femometerBle';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
const getSettingsIconToneClasses = (tone = 'cool', destructive = false) => {
  if (destructive) return 'bg-red-50 text-red-600';

  switch (tone) {
    case 'warm':
      return 'bg-amber-50 text-amber-600';
    case 'purple':
      return 'bg-violet-50 text-violet-600';
    case 'mint':
      return 'bg-emerald-50 text-emerald-600';
    case 'rose':
      return 'bg-rose-50 text-rose-500';
    case 'cool':
    default:
      return 'bg-slate-50 text-slate-500';
  }
};
const SETTINGS_ROW_CLASS =
  'flex min-h-14 w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-slate-50';
const formatFilenameDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
  }

  const str = String(value).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
};

const buildCyclesExportFilename = (cycles = []) => {
  const selectedCycles = Array.isArray(cycles) ? cycles.filter(Boolean) : [];
  const todayLocal = formatFilenameDate(new Date()) ?? 'sin-fecha';

  if (selectedCycles.length !== 1) {
    return `ciclos-exportados-${todayLocal}.pdf`;
  }

  const cycle = selectedCycles[0];
  const start = formatFilenameDate(cycle?.startDate);
  const end = formatFilenameDate(cycle?.endDate);
  const isCurrentCycle = cycle?.type === 'current';

  if (start && end) {
    return `ciclo-${start}-a-${end}.pdf`;
  }
  if (start && !end && isCurrentCycle) {
    return `ciclo-${start}-actualidad.pdf`;
  }
  if (start) {
    return `ciclo-${start}.pdf`;
  }
  return `ciclos-exportados-${todayLocal}.pdf`;
};

const SettingsActionRow = ({
  icon: Icon,
  title,
  description,
  onClick,
  destructive = false,
  trailing = null,
  ariaLabel,
  iconTone = 'cool',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel ?? title}
    className={cn(SETTINGS_ROW_CLASS, destructive && 'hover:bg-red-50/60')}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          getSettingsIconToneClasses(iconTone, destructive)
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className={cn('text-sm font-semibold text-slate-800', destructive && 'text-red-700')}>
          {title}
        </p>
        {description ? (
          <p className="mt-0.5 break-words text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
    </div>

    {trailing ? <div className="shrink-0">{trailing}</div> : null}
  </button>
);

const SettingsLinkRow = ({
  icon: Icon,
  title,
  description,
  to,
  ariaLabel,
  iconTone = 'cool',
  showNewBadge = false,
}) => (
  <Link
    to={to}
    aria-label={ariaLabel ?? title}
    className={SETTINGS_ROW_CLASS}
  >
    <div className="flex min-w-0 items-center gap-3">
      <span
  className={cn(
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
    getSettingsIconToneClasses(iconTone)
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="truncate">{title}</span>
          {showNewBadge ? (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-rose-400 shadow-sm"
            />
          ) : null}
        </p>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>

    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
  </Link>
);

const SettingsSection = ({ title, children, className }) => (
  <section className={cn('space-y-2', className)}>
    <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      {title}
    </h2>
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  </section>
);

const DEFAULT_TEMPERATURE_LISTEN_SECONDS = 6 * 60;

const FemometerBlePrototypePanel = ({ userId }) => {
  const sessionRef = useRef(null);
  const [sessionState, setSessionState] = useState({
    status: 'checking', busy: true, remembered: null, devices: [], selectedDeviceId: '',
    inspectionResult: null, error: null, listenerResult: null,
  });
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
  const [temperatureListenerMessage, setTemperatureListenerMessage] = useState('');
  const [lastTemperatureReading, setLastTemperatureReading] = useState(null);
  const temperatureReceivedInSessionRef = useRef(false);

  useEffect(() => {
    let previousStatus;
    const session = createFemometerPanelSession(userId, next => {
      setSessionState(next);
      if (next.status !== previousStatus) {
        if (next.status === 'searching' || next.status === 'connecting') {
          setLastTemperatureReading(null);
          temperatureReceivedInSessionRef.current = false;
          setTemperatureListenerMessage('');
        }
        if (next.status === 'listening' && !temperatureReceivedInSessionRef.current) {
          setTemperatureListenerMessage('Escuchando el termómetro…');
        }
      }
      previousStatus = next.status;
    }, event => {
      if (event?.temperatureC !== undefined && event?.temperatureC !== null) {
        temperatureReceivedInSessionRef.current = true;
        setLastTemperatureReading({ ...event, normalized: normalizeBleMeasurement(event, 'BM-Vinca2') });
        setTemperatureListenerMessage('Temperatura recibida. La escucha continúa para recibir otra medición.');
      } else if (event?.status === 'timeout') {
        setTemperatureListenerMessage(temperatureReceivedInSessionRef.current
          ? 'Escucha finalizada. La última temperatura recibida se muestra abajo.'
          : 'Escucha finalizada sin recibir temperaturas. Puedes volver a escuchar cuando el termómetro esté preparado.');
      } else if (event?.message) {
        setTemperatureListenerMessage(event.message);
      }
    });
    sessionRef.current = session;
    void session.start();
    return () => {
      sessionRef.current = null;
      void session.dispose();
    };
  }, [userId]);

  useEffect(() => {
    if (!isTemperatureListenerActive) return undefined;
    const timeout = Number(sessionState.listenerResult?.timeoutSeconds);
    const duration = Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : DEFAULT_TEMPERATURE_LISTEN_SECONDS;
    const startedAt = Date.now();
    setTemperatureSecondsRemaining(duration);
    const interval = window.setInterval(() => {
      setTemperatureSecondsRemaining(Math.max(0, duration - Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTemperatureListenerActive, sessionState.listenerResult]);

  const handleScan = () => sessionRef.current?.scan();
  const handleInspect = () => sessionRef.current?.inspect();
  const handleRememberedChange = (forget = false) => sessionRef.current?.remember(forget);
  const handleStartTemperatureListener = () => sessionRef.current?.listen();
  const handleStopTemperatureListener = () => {
    setTemperatureListenerMessage('Escucha detenida.');
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
    <div className="bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <Thermometer className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Termómetro Femometer — prueba técnica
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

              {lastTemperatureReading ? (
                <div className="rounded-lg border border-white bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Última lectura recibida
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

const SettingsPage = () => {
  const {
    user,
    updateEmail,
    updatePassword,
    login,
    logout,
    refreshCurrentUser,
    resendVerificationEmail,
  } = useAuth();
  const { currentCycle, archivedCycles } = useCycleData();

  const { toast } = useToast();

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [pdfContentMode, setPdfContentMode] = useState('chart');
  const [includeRs, setIncludeRs] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedPdf, setExportedPdf] = useState(null);

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);
  const [refreshingVerification, setRefreshingVerification] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const forceInstallPrompt = import.meta.env.VITE_FORCE_INSTALL_PROMPT === 'true';
  const showFemometerBlePrototype =
    isFemometerBleAndroidNative() && isFemometerBlePrototypeEnabled();

    const allCycles = useMemo(() => {
    const combined = [];
    if (currentCycle?.id) {
      combined.push({
        id: currentCycle.id,
        name: 'Ciclo actual',
        startDate: currentCycle.startDate,
        endDate: currentCycle.endDate,
        recordCount: currentCycle.data?.length ?? 0,
        type: 'current',
        raw: currentCycle,
      });
    }

    if (Array.isArray(archivedCycles) && archivedCycles.length > 0) {
      archivedCycles.forEach((cycle, index) => {
        combined.push({
          id: cycle.id,
          name: cycle.name || `Ciclo archivado ${index + 1}`,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          recordCount: cycle.data?.length ?? 0,
          type: 'archived',
          raw: cycle,
        });
      });
    }

    return combined;
  }, [archivedCycles, currentCycle]);

  const resetExportState = () => {
    setSelectedCycleIds([]);
    setPdfContentMode('chart');
    setIncludeRs(true);
    setIsExporting(false);
  };

  const handleCloseExportDialog = () => {
    setShowExportDialog(false);
    resetExportState();
  };

  const handleToggleCycle = (cycleId, checked) => {
    const isChecked = Boolean(checked);
    setSelectedCycleIds((prev) => {
      const set = new Set(prev);
      if (isChecked) {
        set.add(cycleId);
      } else {
        set.delete(cycleId);
      }
      return Array.from(set);
    });
  };

  const handleToggleAllCycles = (checked) => {
    if (checked) {
      setSelectedCycleIds(allCycles.map((cycle) => cycle.id));
    } else {
      setSelectedCycleIds([]);
    }
  };

  const handleConfirmExport = async () => {
    if (!selectedCycleIds.length) return;

    setIsExporting(true);
    try {
      const selectedCycles = allCycles.filter((cycle) => selectedCycleIds.includes(cycle.id));
      const cyclesToExport = selectedCycles.map((cycle) => cycle.raw).filter(Boolean);

      if (!cyclesToExport.length) {
        toast({
          title: 'Sin ciclos seleccionados',
          description: 'Selecciona al menos un ciclo para exportar.',
          variant: 'destructive',
        });
        return;
      }

      const { buildCyclesPdfBlob, downloadBlobAsFile } = await import('@/lib/cycleExport');
      const filename = buildCyclesExportFilename(selectedCycles);
      const includeChart = pdfContentMode !== 'table';
      const chartOnly = pdfContentMode === 'chart';
      const blob = await buildCyclesPdfBlob(cyclesToExport, {

        includeChart,
        includeRs,
        chartOnly,
      });

      if (!blob) return;

      if (exportedPdf?.url) {
        URL.revokeObjectURL(exportedPdf.url);
      }
      const url = URL.createObjectURL(blob);
      downloadBlobAsFile(blob, filename, { url });
      setExportedPdf({ blob, url, filename });

      toast({
        title: 'Exportación completada',
        description: 'Los ciclos seleccionados se han exportado correctamente.',
      });
      setShowExportDialog(false);
      resetExportState();
    } catch (error) {
      console.error('Error al exportar ciclos', error);
      toast({
        title: 'Error al exportar',
        description:
          'No se pudieron exportar los ciclos seleccionados. Inténtalo nuevamente más tarde.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearExportedPdf = () => {
    setExportedPdf((previous) => {
      if (previous?.url) {
        URL.revokeObjectURL(previous.url);
      }
      return null;
    });
  };

  const handleOpenExportedPdf = () => {
    if (!exportedPdf?.url) return;
    const opened = window.open(exportedPdf.url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      toast({
        title: 'No se pudo abrir automáticamente',
        description: 'Puedes buscar el archivo en Descargas o compartirlo desde aquí.',
      });
    }
  };

  const handleShareExportedPdf = async () => {
    if (!exportedPdf?.blob || !exportedPdf?.filename) return;

    const file = new File([exportedPdf.blob], exportedPdf.filename, { type: 'application/pdf' });
    const sharePayload = {
      title: 'PDF exportado',
      text: 'Archivo PDF exportado desde FertiliApp.',
      files: [file],
    };

    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      toast({
        title: 'Compartir no disponible',
        description:
          'Este dispositivo no permite compartir el PDF. Puedes abrirlo o buscarlo en Descargas.',
      });
      return;
    }

    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      toast({
        title: 'Compartir no disponible',
        description:
          'Este dispositivo no permite compartir el PDF desde la PWA. Puedes abrirlo o buscarlo en Descargas.',
      });
      return;
    }

    try {
      await navigator.share(sharePayload);
    } catch (error) {
      const errorName = String(error?.name || '').toLowerCase();
      const errorMessage = String(error?.message || '').toLowerCase();
      const isCancelled =
        errorName.includes('abort') ||
        errorName.includes('cancel') ||
        errorMessage.includes('abort') ||
        errorMessage.includes('cancel');

      if (!isCancelled) {
        toast({
          title: 'Compartir no disponible',
          description:
            'Este dispositivo no permite compartir el PDF desde la PWA. Puedes abrirlo o buscarlo en Descargas.',
        });
      }
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoadingEmail(true);
    try {
      const result = await updateEmail(newEmail);
      if (result?.unchanged) {
        toast({
          title: 'Correo sin cambios',
          description: 'Ese correo ya está asociado a tu cuenta.',
        });
      } else if (result?.verificationSent) {
        toast({
          title: 'Verifica el nuevo correo',
          description:
            'Te hemos enviado un enlace al nuevo email. El cambio se aplicará cuando lo confirmes.',
        });
      }
      setShowEmailDialog(false);
    } catch (error) {
      toast({
        title: 'No se pudo solicitar el cambio de correo',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        variant: 'destructive',
      });
      return;
    }
    setLoadingPassword(true);
    try {
      await login(user?.email, oldPassword);
      await updatePassword(newPassword);
      toast({ title: 'Contraseña actualizada' });
      setShowPasswordDialog(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la contraseña',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    setSendingVerificationEmail(true);
    try {
      const result = await resendVerificationEmail();
      toast({
        title: result?.alreadyVerified ? 'Correo ya verificado' : 'Correo enviado',
        description: result?.alreadyVerified
          ? 'Tu correo ya aparece como verificado.'
          : 'Correo de verificación enviado. Revisa tu bandeja de entrada y spam.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo reenviar el correo',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSendingVerificationEmail(false);
    }
  };

  const handleRefreshVerification = async () => {
    setRefreshingVerification(true);
    try {
      const refreshedUser = await refreshCurrentUser();
      toast({
        title: refreshedUser?.emailVerified ? 'Correo verificado' : 'Correo pendiente',
        description: refreshedUser?.emailVerified
          ? 'Tu correo ya aparece como verificado.'
          : 'Aún no vemos tu correo como verificado. Revisa el enlace de verificación.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo comprobar el correo',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setRefreshingVerification(false);
    }
  };

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await logout();
      toast({ title: 'Sesión cerrada' });
    } catch (error) {
      console.error('Error al cerrar sesión', error);
    } finally {
      setLoadingLogout(false);
      setShowLogoutDialog(false);
    }
  };

  const emailStatusIcon = user?.email
    ? user.emailVerified
      ? (
        <BadgeCheck
          className="h-5 w-5 text-secundario-fuerte"
          aria-label="Correo verificado"
          title="Correo verificado"
        />
      )
      : (
        <CircleAlert
          className="h-5 w-5 text-amber-500"
          aria-label="Correo pendiente de verificar"
          title="Correo pendiente de verificar"
        />
      )
    : null;

  useEffect(() => {
    return () => {
      if (exportedPdf?.url) {
        URL.revokeObjectURL(exportedPdf.url);
      }
    };
  }, [exportedPdf]);

  return (
    <div className="relative flex min-h-full flex-col bg-slate-50">
      <div className="sticky top-0 z-30 border-b border-slate-100 bg-slate-50/95 px-4 py-4">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="truncate text-[24px] font-semibold leading-tight text-titulo">
            Ajustes
          </h1>
          <p className="mt-1 truncate text-sm font-medium text-subtitulo">
            Gestiona tu cuenta y preferencias
          </p>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col box-border px-4 pb-6 pt-4">
        <div className="flex flex-1 flex-col gap-5">
          <SettingsSection title="Cuenta">
            <SettingsActionRow
              icon={Mail}
              iconTone="cool"
              title="Correo electrónico"
              description={user?.email || 'Sin correo'}
              onClick={() => {
                setNewEmail(user?.email || '');
                setShowEmailDialog(true);
              }}
              ariaLabel="Actualizar correo electrónico"
              trailing={emailStatusIcon}
            />

            <SettingsActionRow
              icon={Lock}
              iconTone="cool"
              title="Contraseña"
              description="Cambiar contraseña"
              onClick={() => setShowPasswordDialog(true)}
              ariaLabel="Actualizar contraseña"
            />
          </SettingsSection>

          {user?.email && user?.emailVerified === false ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">Correo sin verificar</p>
                <p className="text-sm leading-relaxed text-slate-600">
                  Verifica tu correo para recuperar el acceso a tu cuenta si algún día olvidas la
                  contraseña. Revisa también spam o correo no deseado.
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={sendingVerificationEmail || refreshingVerification}
                  className="min-h-10 flex-1 bg-fertiliapp-fuerte text-white hover:brightness-95"
                >
                  {sendingVerificationEmail ? 'Enviando...' : 'Reenviar correo'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefreshVerification}
                  disabled={sendingVerificationEmail || refreshingVerification}
                  className="min-h-10 flex-1 border-amber-200 bg-white text-fertiliapp-fuerte hover:bg-amber-50"
                >
                  {refreshingVerification ? 'Comprobando...' : 'Ya lo verifiqué'}
                </Button>
              </div>
            </div>
          ) : null}

          <SettingsSection title="Datos">
            <SettingsActionRow
              icon={FileDown}
              iconTone="warm"
              title="Exportar ciclos"
              description="Selecciona qué ciclos exportar"
              onClick={() => setShowExportDialog(true)}
              ariaLabel="Exportar ciclos"
            />
          </SettingsSection>

          <SettingsSection title="App">
            <SettingsLinkRow
              icon={Settings2}
              iconTone="mint"
              title="Preferencias"
              description="Registro, cálculo y gráfica"
              to="/settings/preferences"
              ariaLabel="Abrir preferencias"
            />
          </SettingsSection>

          {showFemometerBlePrototype ? (
            <SettingsSection title="Integraciones">
              {user?.uid ? <FemometerBlePrototypePanel key={user.uid} userId={user.uid} /> : null}
            </SettingsSection>
          ) : null}

          <SettingsSection title="Ayuda">
            <SettingsLinkRow
              icon={Mail}
              iconTone="cool"
              title="Contacto y soporte"
              description="Problemas, dudas o sugerencias"
              to="/settings/support"
              ariaLabel="Abrir contacto y soporte"
            />
            <div className="bg-white px-4 py-3">
              <InstallPrompt
                align="end"
                buttonClassName="bg-fertiliapp-fuerte hover:brightness-95"
                forceVisible={forceInstallPrompt}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Sesión" className="mt-auto pt-1">
            <SettingsActionRow
              icon={LogOut}
              iconTone="cool"
              title="Cerrar sesión"
              description="Salir de tu cuenta"
              onClick={() => setShowLogoutDialog(true)}
              destructive
              ariaLabel="Cerrar sesión"
              trailing={
                loadingLogout ? (
                  <span className="text-sm font-medium text-red-600">Cerrando...</span>
                ) : null
              }
            />
          </SettingsSection>
        </div>
      </div>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Actualizar correo</DialogTitle>
              <DialogDescription>
                Introduce el nuevo correo electrónico.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEmailDialog(false)}
                disabled={loadingEmail}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loadingEmail}>
                {loadingEmail ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Actualizar contraseña</DialogTitle>
              <DialogDescription>Cambia tu contraseña.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Label htmlFor="confirm-password">Repite la contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPasswordDialog(false)}
                disabled={loadingPassword}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loadingPassword}>
                {loadingPassword ? 'Actualizando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Confirma que deseas salir de tu cuenta actual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              disabled={loadingLogout}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loadingLogout}
            >
              {loadingLogout ? 'Cerrando...' : 'Cerrar sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportCyclesDialog
        isOpen={showExportDialog}
        onClose={handleCloseExportDialog}
        cycles={allCycles}
        onConfirm={handleConfirmExport}
        selectedIds={selectedCycleIds}
        onToggleId={handleToggleCycle}
        onToggleAll={handleToggleAllCycles}
        format="pdf"
        pdfContentMode={pdfContentMode}
        onPdfContentModeChange={setPdfContentMode}
        includeRs={includeRs}
        onIncludeRsChange={setIncludeRs}
        isProcessing={isExporting}
      />
      
      <Dialog
        open={Boolean(exportedPdf)}
        onOpenChange={(open) => {
          if (!open) {
            clearExportedPdf();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PDF exportado</DialogTitle>
            <DialogDescription>
              El archivo se ha descargado en tu dispositivo. También puedes abrirlo ahora o
              compartirlo desde aquí.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" className="w-full" onClick={handleOpenExportedPdf}>
              Abrir PDF
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={handleShareExportedPdf}>
              Compartir
            </Button>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={clearExportedPdf}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
