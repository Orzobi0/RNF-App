import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useFemometer } from '@/contexts/FemometerContext';
import { useAuth } from '@/contexts/AuthContext';
import { femometerBlockingReason } from '@/lib/femometerSession';

import { bluetoothCapture, clearVinca2Capture, isVinca2CaptureAvailable, formatVinca2Capture } from '@/lib/femometerBle';


// Poll only bounded session memory; opening this section never connects BLE.
const BluetoothCapture = () => {
  const { user } = useAuth();
  const { sessionState } = useFemometer();
  const binding = sessionState.bindings?.find(item => item.deviceKey === sessionState.deviceKey);
  const canPrepare = binding?.model === 'BM-Vinca2' && binding?.protocol === 'vinca2'
    && !sessionState.busy && !['connecting', 'listening', 'stopping'].includes(sessionState.status);
  const [observeClock, setObserveClock] = useState(false);
  const [snapshot, setSnapshot] = useState({ active: false, truncated: false, events: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const revision = useRef(0);
  useEffect(() => {
    alive.current = true;
    setSnapshot({ active: false, truncated: false, events: [] });
    setObserveClock(false); setBusy(false); setMessage('');
    return () => { alive.current = false; revision.current++; void clearVinca2Capture().catch(() => {}); };
  }, [user?.uid, sessionState.deviceKey]);
  useEffect(() => {
    if (!snapshot.active) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      const current = revision.current;
      try {
        const next = await bluetoothCapture('status');
        if (!cancelled && alive.current && current === revision.current) setSnapshot(next);
      } catch { if (!cancelled && alive.current) setMessage('No se pudo consultar la captura.'); }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [snapshot.active]);
  const act = async action => {
    const request = ++revision.current;
    const current = () => alive.current && request === revision.current;
    setBusy(true); setMessage('');
    try {
      const result = await bluetoothCapture(action, action === 'prepare'
        ? { userId: user?.uid, deviceKey: sessionState.deviceKey, observeClock } : {});
      const next = action === 'dateTime' ? await bluetoothCapture('status') : result;
      if (current()) setSnapshot(next);
    } catch { if (current()) setMessage('Captura no disponible. Se necesita la APK Staging y un BM-Vinca2 vinculado y validado. Para 0x2A08 debe anunciar lectura y estar conectado; una fecha inválida queda registrada.'); }
    finally { if (current()) setBusy(false); }
  };
  const copy = async () => {
    const request = revision.current;
    const current = () => alive.current && request === revision.current;
    setBusy(true);
    try {
      const next = await bluetoothCapture('status');
      if (!current()) return;
      setSnapshot(next);
      try { await navigator.clipboard.writeText(formatVinca2Capture(next)); if (current()) setMessage('Registro copiado.'); }
      catch { if (current()) setMessage('Selecciona el texto del registro y usa Copiar.'); }
    } catch { if (current()) setMessage('No se pudo obtener el registro.'); }
    finally { if (current()) setBusy(false); }
  };
  return <details className="rounded-lg border border-slate-200 p-3">
    <summary className="cursor-pointer font-medium">Captura Bluetooth — Solo Staging</summary>
    <div className="mt-3 space-y-3">
      <p>Con la escucha detenida, prepara la captura y usa los controles existentes para conectar. No se conecta al preparar. Si ya está conectado, inicia la captura y pulsa «Reconectar».</p>
      <p>Solo en memoria. Copia antes de detener: detener, limpiar, salir del diagnóstico o cerrar sesión borra la captura. El portapapeles queda bajo tu control y puede contener datos de salud y fechas.</p>
      <p role="status">{snapshot.prepared ? 'Captura preparada' : snapshot.active ? 'Captura activa' : 'Captura inactiva'} · {snapshot.events.length} eventos{snapshot.truncated ? ' · CAPTURA TRUNCADA' : ''}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={observeClock} disabled={busy || snapshot.active}
        onChange={event => setObserveClock(event.target.checked)} />No sincronizar automáticamente el reloj durante esta captura</label>
      <p>Esta opción se aplica al preparar la próxima conexión. También bloquea la sincronización manual mientras esté activa. Exporta y detén la captura para volver a sincronizar explícitamente.</p>
      <p>Reloj: {snapshot.observeClock ? 'solo lectura' : 'comportamiento normal'}. El estado refleja callbacks BLE; no confirma que el termómetro siga encendido.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || snapshot.active || !canPrepare} onClick={() => act('prepare')}>Preparar captura para la próxima conexión</Button>
        <Button disabled={busy || !snapshot.active || snapshot.prepared || sessionState.status !== 'listening'} onClick={() => act('dateTime')}>Leer 0x2A08 si está disponible</Button>
        <Button disabled={busy || snapshot.active} onClick={() => act('start')}>Iniciar captura</Button>
        <Button disabled={busy || !snapshot.active} onClick={() => act('stop')}>Detener captura</Button>
        <Button disabled={busy || !snapshot.events.length} onClick={copy}>Copiar registro</Button>
        <Button disabled={busy} onClick={() => act('clear')}>Limpiar captura</Button>
      </div>
      {message && <p role="status">{message}</p>}
      {snapshot.events.length > 0 && <textarea aria-label="Registro Bluetooth para seleccionar y copiar" readOnly
        className="h-48 w-full rounded border bg-white p-2 font-mono text-xs" value={formatVinca2Capture(snapshot)} onFocus={event => event.target.select()} />}
    </div>
  </details>;
};

// Explicit snapshots only; never reconcile, connect or read a BLE characteristic here.
const Vinca2Diagnostics = ({ onRestart, restartDisabled, recoveryRequired } = {}) => {
  const { sessionState, sessionRef, lifecycleStatus } = useFemometer();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const native = sessionState.diagnosticNative;
  const reason = femometerBlockingReason(sessionState);
  const history = sessionState.diagnosticHistory ?? [];
  const lastError = sessionState.diagnosticLastError;
  const formatEvent = event => event ? `${new Date(event.at).toLocaleTimeString()} · ${event.kind ?? 'error'} · ${event.code}` : 'Sin eventos registrados';
  const fields = { visible: 'Actividad visible', serviceActive: 'Servicio de recepción', connectionReady: 'GATT preparado',
    indicationsActive: 'Indicaciones habilitadas', searchPending: 'Búsqueda pendiente', connectPending: 'Conexión pendiente',
    preparationPending: 'Preparación pendiente', gattBusy: 'Operación GATT ocupada', cleanupPending: 'Limpieza sin terminar', backgroundSession: 'Sesión en segundo plano' };
  const value = field => typeof native?.[field] === 'boolean' ? native[field] ? 'Sí' : 'No' : 'No disponible en esta versión de Android';
  const differences = [];
  if (native && typeof native.connectionReady === 'boolean' && (sessionState.status === 'listening') !== native.connectionReady)
    differences.push('React y Android difieren en la conexión preparada.');
  if (native && typeof native.indicationsActive === 'boolean' && Boolean(sessionState.listenerResult?.indicationsActive) !== native.indicationsActive)
    differences.push('React y Android difieren en las indicaciones habilitadas.');
  const continuity = sessionState.status === 'searching' ? 'Buscando otra conexión'
    : sessionState.restarting || sessionState.recovering ? 'Recuperando conexión'
      : sessionState.status === 'listening' ? 'Conserva la conexión anterior según React'
        : 'Sin conexión preparada según React';
  const text = [
    'Diagnóstico Vinca 2', `Estado React: ${sessionState.status}`, `Continuidad: ${continuity}`,
    `Operación / bloqueo: ${reason ?? 'Ninguno'}`, `Ciclo de vida: ${lifecycleStatus ?? 'no disponible'}`,
    `Consulta Android: ${native ? new Date(native.at).toLocaleTimeString() : 'Sin consulta válida'}`,
    ...Object.entries(fields).map(([field, label]) => `${label}: ${value(field)}`),
    ...differences, `Último cambio: ${formatEvent(history.filter(event => event.kind === 'state').at(-1))}`,
    `Último error técnico: ${formatEvent(lastError)}`, 'Historial (máximo 40 eventos):', ...history.map(formatEvent),
  ].join('\n');
  const refresh = async () => {
    setRefreshing(true); setMessage('');
    try { await sessionRef.current?.refreshDiagnostic?.(); }
    finally { setRefreshing(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMessage('Diagnóstico copiado.'); }
    catch { setMessage('Selecciona el texto del diagnóstico para copiarlo.'); }
  };
  return <details className="mt-6 border-t border-slate-100">
    <summary className="flex min-h-11 cursor-pointer items-center py-3 text-sm font-medium text-slate-500">Diagnóstico técnico</summary>
    <div className="min-w-0 space-y-4 break-words pb-4 text-xs text-slate-600">
      <p>Estado React: {sessionState.status}. {continuity}.</p>
      <p role="status">Operación activa y motivo de bloqueo: {reason ?? 'Ninguno'}.</p>
      <p>listening y GATT preparado reflejan el último estado conocido; no prueban que el termómetro siga encendido o responda ahora. La consulta Android es una instantánea y puede quedar desactualizada.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={refreshing} onClick={refresh}>Actualizar diagnóstico</Button>
        <Button onClick={copy}>Copiar diagnóstico</Button>
        {onRestart && sessionState.status === 'listening' && <Button disabled={restartDisabled} title={reason ?? undefined} onClick={onRestart}>{recoveryRequired ? 'Recuperar conexión' : 'Reconectar'}</Button>}
      </div>
      {restartDisabled && <p>Reconectar bloqueado: {reason ?? 'Acción de la interfaz pendiente'}.</p>}
      <p>Consulta Android: {native ? new Date(native.at).toLocaleTimeString() : 'Pulsa Actualizar diagnóstico'}.</p>
      <dl>{Object.entries(fields).map(([field, label]) => <div key={field}><dt className="font-medium">{label}</dt><dd>{value(field)}</dd></div>)}</dl>
      {differences.map(item => <p role="status" key={item}>{item} Compara las horas de la consulta y los cambios de React.</p>)}
      <p>Último cambio de estado: {formatEvent(history.filter(event => event.kind === 'state').at(-1))}</p>
      <p>Último error técnico (código, sin mensajes que puedan contener datos privados): {formatEvent(lastError)}</p>
      <p>Ciclo de vida Android: {lifecycleStatus ?? 'no disponible'}.</p>
      <textarea aria-label="Diagnóstico de conexión e historial para copiar" readOnly className="h-48 w-full rounded border p-2 font-mono" value={text} onFocus={event => event.target.select()} />
      {message && <p role="status">{message}</p>}
      {isVinca2CaptureAvailable() && <BluetoothCapture />}
    </div>
  </details>;
};
export default Vinca2Diagnostics;
