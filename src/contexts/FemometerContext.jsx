import { thermometerName } from '@/lib/thermometerCatalog';
import { useCycleData } from '@/hooks/useCycleData';
import { prepareManualBleDraft, prepareAutomaticBleDraft, isPossibleBleDuplicate } from '@/lib/bleMeasurements';
import { useThermometerMetadata } from '@/contexts/ThermometerMetadataContext';
import React, { createContext, useContext, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { addFemometerReceptionStateListener, clearVinca2Capture, createFemometerPanelSession, isFemometerBleAndroidNative, isFemometerBlePrototypeEnabled } from '@/lib/femometerBle';
import { normalizeBleMeasurement, decideVinca2Reading, authorizedBleMeasurement, vinca2DateNeedsReview, recoveredVinca2DateMessage } from '@/lib/bleMeasurements';
import FemometerFeedback from '@/components/FemometerFeedback';
import BleReadingReview from '@/components/BleReadingReview';
import { createFemometerLocalState } from '@/lib/femometerLocalState';
import FemometerReviewCard from '@/components/FemometerReviewCard';
import { isBleVisualLabEnabled } from '@/lib/bleVisualLab';
import { Capacitor } from '@capacitor/core';
import { Vinca2AutomationPrompt } from '@/components/Vinca2Automation';

const inactive = { enabled: false, readings: [], pendingCount: 0 };
const FemometerContext = createContext(inactive);
export const useFemometer = () => useContext(FemometerContext);

// Local development only. The dev module is not included in published builds.
const BluetoothVisualLab = import.meta.env.DEV
  ? lazy(() => import('@/components/dev/BluetoothVisualLab')) : null;

// One owner per authenticated account, above the routes. Pages only consume it.
export const FemometerProvider = ({ children }) => {
  const { user } = useAuth();
  const preview = isBleVisualLabEnabled(import.meta.env, globalThis.location, Capacitor.isNativePlatform());
  if (user?.uid && preview && BluetoothVisualLab) return <Suspense fallback={null}>
    <BluetoothVisualLab key={user.uid} Provider={FemometerContext.Provider}>{children}</BluetoothVisualLab>
  </Suspense>;
  const enabled = Boolean(user?.uid) && isFemometerBlePrototypeEnabled() && isFemometerBleAndroidNative();
  return enabled ? <FemometerSessionOwner key={user.uid} userId={user.uid}>{children}</FemometerSessionOwner>
    : <FemometerContext.Provider value={inactive}>{children}</FemometerContext.Provider>;
};

export const FemometerSessionOwner = ({ userId, children }) => {
  const cycle = useCycleData();
  const cycleRef = useRef(cycle); cycleRef.current = cycle;
  const verificationBusy = useRef(false);
  const metadata = useThermometerMetadata();
  const metadataRef = useRef(metadata); metadataRef.current = metadata;
  const location = useLocation();
  const locationKey = useRef(location.key);
  locationKey.current = location.key;
  const [reviewVisibleOn, setReviewVisibleOn] = useState(null);
  useEffect(() => { setReviewVisibleOn(null); }, [location.key]);
  const sessionRef = useRef(null);
  const readingsRef = useRef([]);
  const localRef = useRef(null);
  const [readings, setReadings] = useState([]);
  const [sessionState, setSessionState] = useState({ status: 'checking', busy: true, remembered: null,
    devices: [], selectedDeviceId: '', inspectionResult: null, listenerResult: null });
  const sessionStateRef = useRef(sessionState); sessionStateRef.current = sessionState;
  const [listeningStartedAt, setListeningStartedAt] = useState(null);
  const [temperatureListenerMessage, setTemperatureListenerMessage] = useState('');
  const [clockDialogOpen, setClockDialogOpen] = useState(false);
  const [reviewReadingId, setReviewReadingId] = useState(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [pendingNoticeVersion, setPendingNoticeVersion] = useState(0);
  const reviewPresentation = useRef({});
  reviewPresentation.current = { visible: reviewVisibleOn === location.key, expanded: reviewExpanded };
  const [storageError, setStorageError] = useState('');
  const [clockHistory, setClockHistory] = useState(null);
  const [lifecycleStatus, setLifecycleStatus] = useState('registering');
  const [lifecycleError, setLifecycleError] = useState(null);
  const [automationCandidate, setAutomationCandidate] = useState(null);
  const [automationPromptDevice, setAutomationPromptDevice] = useState(null);
  const promptClaim = useRef(false);
  const dismissedPrompts = useRef(new Set());
  const automaticBusy = useRef(false);
  const automaticActiveId = useRef(null);
  // Ephemeral presentation only: never restored from durable eligibility flags.
  const needsReview = row => !row.automaticProcessing && !['incorporated', 'discarded'].includes(row.importStatus);
  const showPendingNotice = () => {
  if (
    reviewPresentation.current.visible &&
    reviewPresentation.current.expanded
  ) return;

  setReviewExpanded(false);
  setReviewVisibleOn(locationKey.current);
  setPendingNoticeVersion(version => version + 1);
};
  const updateReadings = (next, requireDurable = false, nativeDeliveryId = null) => {
    const previous = readingsRef.current;
    try {
      if (requireDurable && !localRef.current) throw new Error('Almacenamiento local no disponible.');
      localRef.current?.saveReadings(next, nativeDeliveryId);
    }
    catch (error) {
      setStorageError('No se han podido conservar los pendientes en este dispositivo. No cierres la aplicación.');
      if (requireDurable) throw error;
    }
    readingsRef.current = next;
setReadings(next);

const hasNewPending = next.some(row =>
  needsReview(row) &&
  !row.promotedVerification &&
  !previous.some(old =>
    old.uiId === row.uiId && needsReview(old)
  )
);

if (hasNewPending) {
  showPendingNotice();
}
  };

  useEffect(() => {
    let alive = true;
    let previousStatus;
    let sequence = 0;
    let lastClockObservation;
    let recovered = [];
    try {
      localRef.current = createFemometerLocalState(globalThis.localStorage, userId, { get: key => metadataRef.current.get(key), patch: (...args) => metadataRef.current.patch(...args) });
      recovered = localRef.current.recover().map(row => ({ ...row, automaticChecked: true, automaticProcessing: false }));
    } catch (error) { localRef.current = null; setStorageError('No se pueden recuperar los pendientes locales. No cierres la aplicación tras recibir lecturas nuevas.'); }
    readingsRef.current = recovered; setReadings(recovered);
    sequence = Math.max(0, ...recovered.map(row => row.uiId));
    let receivedOrder = Math.max(0, ...recovered.map(row => row.receivedOrder));
    const session = createFemometerPanelSession(userId, next => {
      if (!alive) return;
      sessionStateRef.current = next;
      setSessionState(next);
      for (const device of next.bindings ?? []) {
        try { metadataRef.current.patch(device.deviceKey, { ...device, commercialName: thermometerName(device), ...next.preferencesByDevice?.[device.deviceKey], ...(device.protocol === 'easyhome-ebt300' ? { temperatureUnit: 'C' } : {}) }, true); } catch { setStorageError("No se pudieron conservar los metadatos del termómetro."); }
      }
      try {
        if (next.remembered !== null) localRef.current?.activate(next.deviceKey ?? null);
        const observation = next.clockResult ?? next.clockError ?? (next.clockBusy ? next.clockAttempt : null);
        if (observation && observation !== lastClockObservation) {
          lastClockObservation = observation;
          if (observation.deviceKey && observation.deviceKey === next.listenerResult?.deviceKey) {
            localRef.current?.saveClock(observation.deviceKey, {
              deviceKey: observation.deviceKey, connectedAt: observation.connectedAt, snapshot: observation.snapshot === true,
              operation: observation.operation, checkedAt: observation.checkedAt, verified: observation.verified === true,
              writeAccepted: observation.writeAccepted === true, driftSeconds: observation.driftSeconds ?? null,
              deviceLocalTime: observation.deviceLocalTime ?? null, phoneTimeZone: observation.phoneTimeZone ?? null,
              requestedLocalTime: observation.requestedLocalTime ?? null,
              phoneUtcOffsetMinutes: observation.phoneUtcOffsetMinutes ?? null,
              phoneZoneChanged: observation.phoneZoneChanged === true,
              errorCode: next.clockError ? next.clockError.code || 'CLOCK_FAILED' : observation === next.clockAttempt ? 'CLOCK_PENDING' : null,
            });
          }
        }
        setClockHistory(localRef.current?.clock(next.deviceKey) ?? null);
      } catch (error) { setStorageError('No se pudo conservar el estado del reloj. La recepción sigue disponible.'); }
      if (next.status === 'listening' && previousStatus !== 'listening') {
        setListeningStartedAt(Date.now());
        setTemperatureListenerMessage('Escuchando el termómetro…');
      }
      previousStatus = next.status;
    }, event => {
      if (!alive || event?.experimental === true) return;
      if (event.nativeDeliveryId) {
        if (event.nativeUserId !== userId || !localRef.current) return;
        if (localRef.current.hasNativeDelivery(event.nativeDeliveryId)) return { conserved: true };
      }
      const normalized = normalizeBleMeasurement({ ...event, deviceCustomName: metadataRef.current.get(event.deviceKey).customName ?? null });
      if (normalized?.device_protocol && !authorizedBleMeasurement(normalized)) return;
      if (normalized) {
        // UI-only sequence, never passed as a device identity or measurement key.
        const preference = metadataRef.current.get(normalized.device_key);
        const automaticEligible = normalized.device_protocol === 'vinca2' && preference.incorporationMode === 'automatic' && preference.automaticConsent === 'v2';
        const row = { ...event, normalized, automaticEligible, automaticProcessing: automaticEligible,
          automaticDeadline: automaticEligible ? Date.now() + 30_000 : null, deviceKey: normalized.device_key,
          localId: globalThis.crypto.randomUUID(), receivedOrder: receivedOrder = Math.max(Date.now(), receivedOrder + 1),
          dateReview: decideVinca2Reading(normalized, { deviceKey: normalized.device_key,
              nowMs: Date.now(), timeZone: localRef.current?.clock(normalized.device_key)?.lastValidCheck?.phoneTimeZone,
              clockHistory: localRef.current?.clock(normalized.device_key) }),
            uiId: ++sequence, importStatus: 'pending' };
        try { updateReadings([...readingsRef.current, row], event.promotedVerification === true || Boolean(event.nativeDeliveryId), event.nativeDeliveryId); }
        catch (error) { if (event.nativeDeliveryId) throw error; readingsRef.current = [...readingsRef.current, row]; setReadings(readingsRef.current); setReviewVisibleOn(locationKey.current); throw error; }
        if (!reviewPresentation.current.visible || !reviewPresentation.current.expanded) {
          setReviewExpanded(false); setReviewReadingId(sequence);
        }
        setTemperatureListenerMessage(automaticEligible ? 'Procesando temperatura…' : normalized.device_key ? 'Lectura recibida y pendiente de revisión.' : 'Lectura de un termómetro sin vincular: solo se conserva durante esta sesión. Vincúlalo antes de nuevas tomas.');
        return row;
      } else if (event?.status === 'timeout') setTemperatureListenerMessage('Escucha finalizada. Las lecturas recibidas siguen disponibles.');
      else if (event?.message) setTemperatureListenerMessage(event.message);
    }, localRef.current);
    sessionRef.current = session;
    setLifecycleStatus('registering');
    setLifecycleError(null);
    // MainActivity emits this independently of the App plugin.
    // Query after registration covers resume before JS startup too.
    const lifecycle = Promise.resolve().then(() => addFemometerReceptionStateListener(({ visible }) => {
      if (!alive) return;
      if (!visible) void session.suspend();
      else void session.reconcileNative().catch(() => {});
    })).then(async handle => {
      if (alive) {
        setLifecycleStatus('registered');
        try { await session.reconcileNative(true); }
        catch (error) { if (alive) setStorageError('No se pudo recuperar el estado o las lecturas Android. Vuelve a abrir la app para reintentarlo.'); }
      }
      return handle;
    }).catch(error => {
      if (alive) {
        setLifecycleStatus('unavailable');
        session.recordDiagnosticLifecycleError?.(error);
        setLifecycleError({ code: String(error?.code ?? 'UNKNOWN'), message: String(error?.message ?? error) });
      }
      return null;
    });
    const reconcileVisible = () => {
      if (alive && document.visibilityState === 'visible') void session.reconcileNative().catch(() => {});
    };
    document.addEventListener('visibilitychange', reconcileVisible);
    return () => {
      alive = false;
      void clearVinca2Capture().catch(() => {});
      document.removeEventListener('visibilitychange', reconcileVisible);
      void lifecycle.then(handle => handle?.remove()).catch(() => {});
      sessionRef.current = null;
      automaticBusy.current = false; automaticActiveId.current = null;
      readingsRef.current = [];
      localRef.current = null;
      void session.dispose();
    };
  }, [userId]);

  // Only wraps an explicitly confirmed save supplied by the existing panel.
  // The shared status survives navigation while that save is in flight.
  const incorporateReading = async (uiId, save, { reviewedUncertain = false, reviewedAttemptId, attempt, combinedVerification = false } = {}) => {
    const owner = sessionRef.current;
    const row = readingsRef.current.find(item => item.uiId === uiId);
    if (!owner || !(row?.importStatus === 'pending' || (row?.importStatus === 'uncertain' && reviewedUncertain && row.attempt?.id && reviewedAttemptId === row.attempt.id)) || readingsRef.current.some(item => item.importStatus === 'saving')) throw new Error('Comprueba el resultado pendiente o espera a que termine la incorporación en curso.');
    if (attempt && (attempt.userId !== userId || !attempt.id || !attempt.cycleId || !attempt.isoDate || !attempt.time)) throw new Error('El destino del intento no es válido.');
    if (row.deviceKey && !localRef.current) throw new Error('No se puede asegurar la conservación local del intento.');
    const status = (importStatus, extra = {}) => {
      if (sessionRef.current === owner) updateReadings(readingsRef.current.map(item => item.uiId === uiId ? { ...item, importStatus, ...extra } : item));
    };
    // Persist the in-flight state BEFORE Firestore. A restart never retries it automatically.
    updateReadings(readingsRef.current.map(item => item.uiId === uiId ? { ...item, importStatus: 'saving', verificationCombinedSave: combinedVerification, attempt: attempt ?? item.attempt } : item), true);
    try {
      const result = await save();
      status('incorporated', { automaticProcessing: false, savedIsoDate: result?.isoDate,
        savedTime: result?.measurements?.at(-1)?.time });
      if (sessionRef.current === owner && row.normalized?.device_protocol === 'vinca2'
        && row.normalized.reception_validated === true && row.deviceKey) setAutomationCandidate(row.deviceKey);
      return result;
    } catch (error) {
      status(error?.code?.startsWith('ble-') ? row.importStatus : 'uncertain', { ...(error?.code?.startsWith('ble-') ? { attempt: row.attempt } : {}), reviewError: { code: error?.code,
        message: error?.title ? error.message : 'No se ha podido confirmar el guardado en el servidor. Comprueba el resultado antes de volver a incorporarla.' } });
      throw error;
    }
  };
  // Waiting for a cycle or another critical operation must not hide a row forever.
  useEffect(() => {
    const waiting = readings.filter(row => row.automaticProcessing);
    if (!waiting.length) return;
    const owner = sessionRef.current;
    const release = () => {
      if (sessionRef.current !== owner) return;
      updateReadings(readingsRef.current.map(row => row.automaticProcessing
        && (row.automaticDeadline <= Date.now() || (row.uiId !== automaticActiveId.current && (sessionStateRef.current.status !== 'listening'
          || (!cycleRef.current.isLoading && !cycleRef.current.currentCycle?.id))))
        ? { ...row, automaticProcessing: false, automaticChecked: true,
          reviewError: { code: 'ble-auto-review', message: row.importStatus === 'saving' ? 'El guardado sigue sin confirmar. La lectura se conserva y no se repetirá la escritura mientras siga en curso.' : 'No se pudo completar la incorporación automática. Revisa la temperatura conservada.' } } : row));
    };
    if (waiting.some(row => row.uiId !== automaticActiveId.current)
      && (sessionState.status !== 'listening' || (!cycle.isLoading && !cycle.currentCycle?.id))) { release(); return; }
    const timer = setTimeout(release, Math.max(0, Math.min(...waiting.map(row => row.automaticDeadline)) - Date.now()));
    return () => clearTimeout(timer);
  }, [readings, sessionState.status, cycle.isLoading, cycle.currentCycle?.id]);

  // Each newly received row gets one bounded automatic attempt. Recovered attempts
  // and repeated packets with an uncertain result always require human review.
  useEffect(() => {
    if (automaticBusy.current || sessionState.status !== 'listening' || sessionState.busy
      || sessionState.configurationBusy || sessionState.clockBusy || sessionState.deviceInfoBusy
      || sessionState.volumeBusy || sessionState.measurementModeBusy || cycle.isLoading
      || !cycle.currentCycle?.id || readings.some(row => row.importStatus === 'saving')) return;
    const row = readingsRef.current.find(item => item.automaticProcessing && item.automaticEligible && !item.automaticChecked && item.importStatus === 'pending');
    if (!row) return;
    const owner = sessionRef.current;
    automaticBusy.current = true; automaticActiveId.current = row.uiId;
    const valid = () => {
      const preference = metadataRef.current.get(row.deviceKey);
      if (sessionRef.current !== owner || !readingsRef.current.find(item => item.uiId === row.uiId)?.automaticProcessing || sessionStateRef.current.deviceKey !== row.deviceKey
        || sessionStateRef.current.status !== 'listening' || cycleRef.current.currentCycle?.id !== cycle.currentCycle.id
        || preference.incorporationMode !== 'automatic' || preference.automaticConsent !== 'v2') {
        throw Object.assign(new Error('La cuenta, el ciclo o el modo han cambiado.'), { code: 'ble-auto-review' });
      }
    };
    (async () => {
      updateReadings(readingsRef.current.map(item => item.uiId === row.uiId ? { ...item, automaticChecked: true, automaticDeadline: Date.now() + 120_000 } : item), true);
      valid();
      if (sessionState.deviceKey !== row.deviceKey ||
    (reviewPresentation.current.visible &&
     reviewPresentation.current.expanded)
        || readingsRef.current.some(item => item.uiId !== row.uiId && item.importStatus !== 'discarded'
          && isPossibleBleDuplicate(item.normalized, row.normalized))) {
        throw Object.assign(new Error('Posible temperatura duplicada. Comprueba esta lectura y los intentos anteriores.'), { code: 'ble-possible-duplicate' });
      }
      if (vinca2DateNeedsReview(row.normalized)) {
        throw Object.assign(new Error(recoveredVinca2DateMessage), { code: 'ble-auto-review' });
      }
      await (owner.checkAutomaticClock?.() ?? owner.readClock());
      valid();
      const latest = sessionStateRef.current;
      if (latest.clockBusy || latest.clockError || (!latest.clockResult?.snapshot && latest.clockResult?.checkedAt !== localRef.current?.clock(row.deviceKey)?.lastValidCheck?.checkedAt)) {
        throw Object.assign(new Error('No se pudo comprobar el reloj. La temperatura está conservada para revisar su fecha y hora.'), { code: 'ble-auto-review' });
      }
      const context = { userId, cycleId: cycle.currentCycle.id, deviceKey: row.deviceKey, connectedAt: latest.listenerResult?.connectedAt ?? null,
        incorporationMode: 'automatic', automaticConsent: 'v2', nowMs: Date.now(),
        get timeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone; },
        get phoneUtcOffsetMinutes() { return -new Date().getTimezoneOffset(); }, get clockHistory() { return localRef.current?.clock(row.deviceKey); },
        assertCurrent: () => {
          valid();
          if (sessionStateRef.current.listenerResult !== latest.listenerResult) throw Object.assign(new Error('La conexión ha cambiado.'), { code: 'ble-auto-review' });
          prepareAutomaticBleDraft(row.normalized, { ...context, nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, clockHistory: localRef.current?.clock(row.deviceKey) });
        } };
      const draft = prepareAutomaticBleDraft(row.normalized, context);
      const attempt = { id: crypto.randomUUID(), userId, cycleId: draft.cycleId, isoDate: draft.isoDate, time: draft.measurements[0].time };
      await incorporateReading(row.uiId, () => cycleRef.current.incorporateBleMeasurement(draft, { automaticContext: context }), { attempt });
    })().catch(error => {
      if (sessionRef.current !== owner) return;
      updateReadings(readingsRef.current.map(item => item.uiId === row.uiId ? { ...item, automaticChecked: true,
        reviewError: item.reviewError ?? { code: error.code, message: error.message } } : item));
    }).finally(() => {
      if (sessionRef.current !== owner) return;
      automaticBusy.current = false; automaticActiveId.current = null;
      updateReadings(readingsRef.current.map(item => item.uiId === row.uiId ? { ...item, automaticProcessing: false } : item));
    });
  }, [readings, sessionState, cycle.isLoading, cycle.currentCycle?.id]);

  // Recover an unanswered question after updates, navigation or a new session.
  useEffect(() => { dismissedPrompts.current.clear(); }, [location.key]);
  useEffect(() => {
    const key = sessionState.deviceKey;
    const preference = metadata.devices[key];
    const chosen = preference?.incorporationMode === 'manual'
      || (preference?.incorporationMode === 'automatic' && preference.automaticConsent === 'v2');
    void sessionRef.current?.setAutomaticMode?.(preference?.incorporationMode === 'automatic' && preference.automaticConsent === 'v2');
    if (chosen && automationPromptDevice === key) setAutomationPromptDevice(null);
    if (key && !chosen && !dismissedPrompts.current.has(key)
      && (['pending', 'shown'].includes(preference?.automationPrompt) || preference?.incorporationMode === 'automatic')) setAutomationCandidate(key);
  }, [sessionState.deviceKey, metadata.devices, location.key]);
  useEffect(() => {
    sessionRef.current?.setRecoveryBlocked?.(readings.some(row => row.importStatus === 'saving'));
  }, [readings]);

  // A local removal only: commit first, then publish. Never calls a save adapter.
  const discardReading = (uiId, expectedSession, reviewedAttemptId) => {
    const row = readingsRef.current.find(item => item.uiId === uiId);
    if (!expectedSession || sessionRef.current !== expectedSession || !localRef.current
      || !row || !['pending', 'uncertain'].includes(row.importStatus)
      || (row.importStatus === 'uncertain' && (!row.attempt?.id || reviewedAttemptId !== row.attempt.id))
      || readingsRef.current.some(item => item.importStatus === 'saving')) {
      throw new Error('No se puede retirar esta pendiente ahora. Espera al guardado o vuelve a abrir la revisión.');
    }
    updateReadings(readingsRef.current.filter(item => item.uiId !== uiId), true);
    setReviewReadingId(null);
  };
  const openReadingReview = id => {
    const pending = readingsRef.current.filter(needsReview);
    setReviewReadingId(pending.find(row => row.uiId === (id ?? reviewReadingId))?.uiId ?? pending[0]?.uiId ?? null);
    setReviewVisibleOn(location.key);
    setReviewExpanded(true);
  };
  const completeVerification = async ({ readingId, basalConfirmed, isoDate, time }) => {
    if (verificationBusy.current) throw new Error('Espera a que termine la incorporación.');
    const owner = sessionRef.current, route = locationKey.current, destination = cycleRef.current;
    const trial = sessionState.trial;
    const received = trial?.readings?.find(row => row.readingId === readingId);
    const valid = () => sessionRef.current === owner && locationKey.current === route && cycleRef.current.currentCycle?.id === destination.currentCycle?.id;
    if (!received || !owner || destination.isLoading || !destination.currentCycle?.id || !basalConfirmed) throw new Error('Comprueba la medición y espera a que se cargue el ciclo actual.');
    const draft = { isoDate, time, confirmed: true, userId, cycleId: destination.currentCycle.id, nowMs: Date.now() };
    prepareManualBleDraft(normalizeBleMeasurement({ ...received, deviceKey: 'verification-preview', deviceProtocol: 'health-thermometer', receptionValidated: true, experimental: false }), draft);
    if (isoDate < destination.currentCycle.startDate || (destination.currentCycle.endDate && isoDate > destination.currentCycle.endDate)) throw new Error('La fecha no pertenece al ciclo actual.');
    verificationBusy.current = true;
    let failure = null, incorporated = false;
    try {
      const bound = await owner.confirmTrial({ readingId, basalConfirmed, incorporate: async row => {
        try {
          if (!valid() || !row?.normalized) throw new Error('La operación ha cambiado. La temperatura queda pendiente.');
          updateReadingDraft(row.uiId, { isoDate, time });
          const payload = prepareManualBleDraft(row.normalized, draft);
          const attempt = { id: crypto.randomUUID(), userId, cycleId: draft.cycleId, isoDate, time };
          await incorporateReading(row.uiId, () => {
            if (!valid()) throw Object.assign(new Error('Operación cancelada'), { code: 'ble-cancelled' });
            return destination.incorporateBleMeasurement(payload, { allowPossibleDuplicate: false });
          }, { attempt, combinedVerification: true });
          incorporated = true;
        } catch (error) { failure = error; if (valid() && row?.uiId) openReadingReview(row.uiId); }
      } });
      if (!bound) throw new Error('No se pudo completar la vinculación. Comprueba los pendientes antes de reintentar.');
      if (failure || !incorporated) throw new Error('Termómetro vinculado. La temperatura sigue pendiente: continúa su revisión para incorporarla.');
      return true;
    } finally { verificationBusy.current = false; }
  };
  const pendingReadings = readings.filter(needsReview);
  const reviewReading = pendingReadings.find(row => row.uiId === reviewReadingId) ?? pendingReadings[0];
  const reviewInProgress = Boolean(reviewReading && reviewVisibleOn === location.key && reviewExpanded)
    || readings.some(row => row.importStatus === 'saving') || clockDialogOpen;
  useEffect(() => {
    if (!automationCandidate || automationPromptDevice || dismissedPrompts.current.has(automationCandidate) || reviewInProgress || promptClaim.current) return;
    const owner = sessionRef.current;
    promptClaim.current = true;
    // The server rechecks the decision. Shown/pending questions remain recoverable;
    // only an explicit mode choice completes them.
    Promise.resolve(metadataRef.current.claimAutomationPrompt?.(automationCandidate)).then(claimed => {
      if (sessionRef.current === owner && claimed) setAutomationPromptDevice(automationCandidate);
    }).catch(() => {}).finally(() => {
      promptClaim.current = false;
      if (sessionRef.current === owner) setAutomationCandidate(null);
    });
  }, [automationCandidate, reviewInProgress]);
  const updateReadingDraft = (id, draft) => updateReadings(readingsRef.current.map(row => row.uiId === id ? { ...row, reviewError: row.reviewError?.code === 'ble-possible-duplicate' ? null : row.reviewError, draft: { ...draft, confirmed: false } } : row));
  return <FemometerContext.Provider value={{ enabled: true, sessionRef, sessionState, readings,
    completeVerification, pendingCount: pendingReadings.length, processingCount: readings.filter(row => row.automaticProcessing).length, clockHistory, storageError, updateReadingDraft,
    listeningStartedAt, temperatureListenerMessage, incorporateReading, discardReading, lifecycleStatus, lifecycleError, openReadingReview,
    openClockDialog: () => setClockDialogOpen(true) }}>{children}
    <FemometerFeedback clockHistory={clockHistory} sessionState={sessionState} sessionRef={sessionRef} readings={readings} openReadingReview={openReadingReview}
      clockDialogOpen={clockDialogOpen} setClockDialogOpen={setClockDialogOpen} />
    {automationPromptDevice && <Vinca2AutomationPrompt key={automationPromptDevice} deviceKey={automationPromptDevice}
      open={!reviewInProgress} onClose={() => { dismissedPrompts.current.add(automationPromptDevice); setAutomationPromptDevice(null); setAutomationCandidate(null); }} />}
    <FemometerReviewCard visible={reviewVisibleOn === location.key} onDismiss={() => setReviewVisibleOn(null)} readings={pendingReadings} selected={reviewReading} expanded={reviewExpanded} noticeVersion={pendingNoticeVersion}
      onExpand={() => openReadingReview()} onMinimize={() => {
  setReviewExpanded(false);
  setReviewVisibleOn(null);
}} onSelect={openReadingReview}
      storageError={storageError} deviceKey={sessionState.deviceKey}>
      {reviewReading && <BleReadingReview active={reviewVisibleOn === location.key && reviewExpanded} key={reviewReading.uiId} userId={userId} reading={reviewReading}
        onClose={() => setReviewVisibleOn(null)} onSaved={() => setReviewReadingId(null)} />}
    </FemometerReviewCard>
  </FemometerContext.Provider>;
};
