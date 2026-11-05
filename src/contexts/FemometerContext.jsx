import React, { createContext, useContext, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createFemometerPanelSession, isFemometerBleAndroidNative, isFemometerBlePrototypeEnabled } from '@/lib/femometerBle';
import { normalizeBleMeasurement, decideVinca2Reading } from '@/lib/bleMeasurements';
import FemometerFeedback from '@/components/FemometerFeedback';
import BleReadingReview from '@/components/BleReadingReview';
import { createFemometerLocalState } from '@/lib/femometerLocalState';
import FemometerReviewCard from '@/components/FemometerReviewCard';
import { isBleVisualLabEnabled } from '@/lib/bleVisualLab';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

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
  const sessionRef = useRef(null);
  const readingsRef = useRef([]);
  const localRef = useRef(null);
  const [readings, setReadings] = useState([]);
  const [sessionState, setSessionState] = useState({ status: 'checking', busy: true, remembered: null,
    devices: [], selectedDeviceId: '', inspectionResult: null, listenerResult: null });
  const [listeningStartedAt, setListeningStartedAt] = useState(null);
  const [temperatureListenerMessage, setTemperatureListenerMessage] = useState('');
  const [clockDialogOpen, setClockDialogOpen] = useState(false);
  const [reviewReadingId, setReviewReadingId] = useState(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [clockHistory, setClockHistory] = useState(null);
  const [lifecycleStatus, setLifecycleStatus] = useState('registering');
  const updateReadings = (next, requireDurable = false) => {
    try { localRef.current?.saveReadings(next); }
    catch (error) {
      setStorageError('No se han podido conservar los pendientes en este dispositivo. No cierres la aplicación.');
      if (requireDurable) throw error;
    }
    readingsRef.current = next; setReadings(next);
  };

  useEffect(() => {
    let alive = true;
    let previousStatus;
    let sequence = 0;
    let lastClockObservation;
    let recovered = [];
    try {
      localRef.current = createFemometerLocalState(globalThis.localStorage, userId);
      recovered = localRef.current.recover();
    } catch (error) { localRef.current = null; setStorageError('No se pueden recuperar los pendientes locales. No cierres la aplicación tras recibir lecturas nuevas.'); }
    readingsRef.current = recovered; setReadings(recovered);
    sequence = Math.max(0, ...recovered.map(row => row.uiId));
    let receivedOrder = Math.max(0, ...recovered.map(row => row.receivedOrder));
    const session = createFemometerPanelSession(userId, next => {
      if (!alive) return;
      setSessionState(next);
      try {
        if (next.remembered !== null) localRef.current?.activate(next.deviceKey ?? null);
        const observation = next.clockResult ?? next.clockError ?? (next.clockBusy ? next.clockAttempt : null);
        if (observation && observation !== lastClockObservation) {
          lastClockObservation = observation;
          if (observation.deviceKey && observation.deviceKey === next.listenerResult?.deviceKey) {
            localRef.current?.saveClock(observation.deviceKey, {
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
      if (!alive) return;
      const normalized = normalizeBleMeasurement(event, 'BM-Vinca2');
      if (normalized) {
        // UI-only sequence, never passed as a device identity or measurement key.
        updateReadings([...readingsRef.current, { ...event, normalized, deviceKey: normalized.device_key,
          localId: globalThis.crypto.randomUUID(), receivedOrder: receivedOrder = Math.max(Date.now(), receivedOrder + 1),
          dateReview: decideVinca2Reading(normalized, { deviceKey: normalized.device_key,
              nowMs: Date.now(), timeZone: localRef.current?.clock(normalized.device_key)?.lastValidCheck?.phoneTimeZone,
              clockHistory: localRef.current?.clock(normalized.device_key) }),
            uiId: ++sequence, importStatus: 'pending' }]);
        setTemperatureListenerMessage(normalized.device_key ? 'Lectura recibida y pendiente de revisión.' : 'Lectura de un termómetro sin vincular: solo se conserva durante esta sesión. Vincúlalo antes de nuevas tomas.');
      } else if (event?.status === 'timeout') setTemperatureListenerMessage('Escucha finalizada. Las lecturas recibidas siguen disponibles.');
      else if (event?.message) setTemperatureListenerMessage(event.message);
    });
    sessionRef.current = session;
    void session.start();
    let foregroundTimer;
    // One deferred check lets queued native terminal events run first. This is
    // not a polling timer; the manager also checks the native listening deadline.
    const lifecycle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      clearTimeout(foregroundTimer);
      if (alive && isActive) foregroundTimer = setTimeout(() => {
        if (alive) void session.resume();
      }, 250);
    }).then(handle => {
      if (alive) setLifecycleStatus('registered');
      return handle;
    }).catch(() => { if (alive) setLifecycleStatus('unavailable'); return null; });
    return () => {
      alive = false;
      clearTimeout(foregroundTimer);
      void lifecycle.then(handle => handle?.remove()).catch(() => {});
      sessionRef.current = null;
      readingsRef.current = [];
      localRef.current = null;
      void session.dispose();
    };
  }, [userId]);

  // Only wraps an explicitly confirmed save supplied by the existing panel.
  // The shared status survives navigation while that save is in flight.
  const incorporateReading = async (uiId, save, { reviewedUncertain = false } = {}) => {
    const owner = sessionRef.current;
    const row = readingsRef.current.find(item => item.uiId === uiId);
    if (!owner || !(row?.importStatus === 'pending' || (row?.importStatus === 'uncertain' && reviewedUncertain)) || readingsRef.current.some(item => item.importStatus === 'saving')) throw new Error('Comprueba el resultado pendiente o espera a que termine la incorporación en curso.');
    if (row.deviceKey && !localRef.current) throw new Error('No se puede asegurar la conservación local del intento.');
    const status = (importStatus, extra = {}) => {
      if (sessionRef.current === owner) updateReadings(readingsRef.current.map(item => item.uiId === uiId ? { ...item, importStatus, ...extra } : item));
    };
    // Persist the in-flight state BEFORE Firestore. A restart never retries it automatically.
    updateReadings(readingsRef.current.map(item => item.uiId === uiId ? { ...item, importStatus: 'saving' } : item), true);
    try {
      const result = await save();
      status('incorporated', { savedIsoDate: result?.isoDate,
        savedTime: result?.measurements?.at(-1)?.time });
      return result;
    } catch (error) {
      status(error?.code?.startsWith('ble-') ? 'pending' : 'uncertain', { reviewError: { code: error?.code,
        message: error?.title ? error.message : 'No se pudo confirmar la incorporación. Revisa la fecha y la conexión.' } });
      throw error;
    }
  };
  const openReadingReview = id => {
    const pending = readingsRef.current.filter(row => row.importStatus !== 'incorporated' && row.importStatus !== 'discarded');
    setReviewReadingId(pending.find(row => row.uiId === id)?.uiId ?? pending[0]?.uiId ?? null);
    setReviewExpanded(true);
  };
  const pendingReadings = readings.filter(row => row.importStatus !== 'incorporated' && row.importStatus !== 'discarded');
  const reviewReading = pendingReadings.find(row => row.uiId === reviewReadingId) ?? pendingReadings[0];
  const updateReadingDraft = (id, draft) => updateReadings(readingsRef.current.map(row => row.uiId === id ? { ...row, draft: { ...draft, confirmed: false } } : row));
  return <FemometerContext.Provider value={{ enabled: true, sessionRef, sessionState, readings,
    pendingCount: pendingReadings.length, clockHistory, storageError, updateReadingDraft,
    listeningStartedAt, temperatureListenerMessage, incorporateReading, lifecycleStatus, openReadingReview,
    openClockDialog: () => setClockDialogOpen(true) }}>{children}
    <FemometerFeedback clockHistory={clockHistory} sessionState={sessionState} sessionRef={sessionRef} readings={readings} openReadingReview={openReadingReview}
      clockDialogOpen={clockDialogOpen} setClockDialogOpen={setClockDialogOpen} />
    <FemometerReviewCard readings={pendingReadings} selected={reviewReading} expanded={reviewExpanded}
      onExpand={() => openReadingReview()} onMinimize={() => setReviewExpanded(false)} onSelect={openReadingReview}
      storageError={storageError} deviceKey={sessionState.deviceKey}>
      {reviewReading && <BleReadingReview key={reviewReading.uiId} userId={userId} reading={reviewReading}
        onClose={() => setReviewExpanded(false)} onSaved={() => setReviewReadingId(null)} />}
    </FemometerReviewCard>
  </FemometerContext.Provider>;
};
