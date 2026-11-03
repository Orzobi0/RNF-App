import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createFemometerPanelSession, isFemometerBleAndroidNative, isFemometerBlePrototypeEnabled } from '@/lib/femometerBle';
import { normalizeBleMeasurement } from '@/lib/bleMeasurements';
import FemometerFeedback from '@/components/FemometerFeedback';
import { App as CapacitorApp } from '@capacitor/app';

const inactive = { enabled: false, readings: [], pendingCount: 0 };
const FemometerContext = createContext(inactive);
export const useFemometer = () => useContext(FemometerContext);

// Visual-only opt-in. Never constructs a native session or enables persistence.
export const localFemometerPreview = (env, location) => {
  if (!env?.DEV || env.MODE !== 'staging' || !['localhost', '127.0.0.1', '[::1]'].includes(location?.hostname)) return null;
  const mode = new URLSearchParams(location.search).get('blePreview');
  if (!['disconnected', 'listening', 'searching', 'attention'].includes(mode)) return null;
  return { ...inactive, enabled: true, preview: true, pendingCount: 2, sessionRef: { current: null },
    sessionState: { status: mode === 'attention' ? 'listening' : mode === 'disconnected' ? 'stopped' : mode,
      remembered: false, devices: [], capabilities: { clockSync: true }, clockResult: { significantDrift: mode === 'attention' } },
    openClockDialog: () => {}, lifecycleStatus: 'preview' };
};

// One owner per authenticated account, above the routes. Pages only consume it.
export const FemometerProvider = ({ children }) => {
  const { user } = useAuth();
  const preview = localFemometerPreview(import.meta.env, globalThis.location);
  if (user?.uid && preview) return <FemometerContext.Provider value={preview}>{children}</FemometerContext.Provider>;
  const enabled = Boolean(user?.uid) && isFemometerBlePrototypeEnabled() && isFemometerBleAndroidNative();
  return enabled ? <FemometerSessionOwner key={user.uid} userId={user.uid}>{children}</FemometerSessionOwner>
    : <FemometerContext.Provider value={inactive}>{children}</FemometerContext.Provider>;
};

export const FemometerSessionOwner = ({ userId, children }) => {
  const sessionRef = useRef(null);
  const readingsRef = useRef([]);
  const [readings, setReadings] = useState([]);
  const [sessionState, setSessionState] = useState({ status: 'checking', busy: true, remembered: null,
    devices: [], selectedDeviceId: '', inspectionResult: null, listenerResult: null });
  const [listeningStartedAt, setListeningStartedAt] = useState(null);
  const [temperatureListenerMessage, setTemperatureListenerMessage] = useState('');
  const [clockDialogOpen, setClockDialogOpen] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState('registering');
  const updateReadings = next => { readingsRef.current = next; setReadings(next); };

  useEffect(() => {
    let alive = true;
    let previousStatus;
    let sequence = 0;
    updateReadings([]);
    const session = createFemometerPanelSession(userId, next => {
      if (!alive) return;
      setSessionState(next);
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
        updateReadings([...readingsRef.current, { ...event, normalized, uiId: ++sequence, importStatus: 'pending' }]);
        setTemperatureListenerMessage('Lectura recibida y pendiente de revisión.');
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
      void session.dispose();
    };
  }, [userId]);

  // Only wraps an explicitly confirmed save supplied by the existing panel.
  // The shared status survives navigation while that save is in flight.
  const incorporateReading = async (uiId, save) => {
    const owner = sessionRef.current;
    const row = readingsRef.current.find(item => item.uiId === uiId);
    if (!owner || row?.importStatus !== 'pending') throw new Error('La lectura ya está incorporada o se está guardando.');
    const status = (importStatus, extra = {}) => {
      if (sessionRef.current === owner) updateReadings(readingsRef.current.map(item => item.uiId === uiId ? { ...item, importStatus, ...extra } : item));
    };
    status('saving');
    try {
      const result = await save();
      status('incorporated', { savedIsoDate: result?.isoDate });
      return result;
    } catch (error) {
      status('pending');
      throw error;
    }
  };
  return <FemometerContext.Provider value={{ enabled: true, sessionRef, sessionState, readings,
    pendingCount: readings.filter(item => item.importStatus !== 'incorporated').length,
    listeningStartedAt, temperatureListenerMessage, incorporateReading, lifecycleStatus,
    openClockDialog: () => setClockDialogOpen(true) }}>{children}
    <FemometerFeedback sessionState={sessionState} sessionRef={sessionRef} readings={readings}
      clockDialogOpen={clockDialogOpen} setClockDialogOpen={setClockDialogOpen} />
  </FemometerContext.Provider>;
};
