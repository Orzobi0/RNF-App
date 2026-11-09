import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FemometerReviewCard from '../FemometerReviewCard';
import { BleReadingReviewView } from '../BleReadingReviewView';
import { BleSavedNotice } from '../BleSavedNotice';
import FemometerFeedback from '../FemometerFeedback';
import { bleLabScenarios, createBleLabScenario } from '@/lib/bleVisualLab';
import { Button } from '@/components/ui/button';

// Only the BLE context is simulated. children are the unchanged authenticated
// application, still under the real AuthProvider and CycleDataProvider.
export default function BluetoothVisualLab({ Provider, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('web');
  const [scenario, setScenario] = useState('disconnected');
  const [volumeScenario, setVolumeScenario] = useState('accepted');
  const volumeJob = useRef(null);
  const volumeTimer = useRef(null);
  const volumeBlocked = useRef(false);
  const labClockBusy = useRef(false);
  const cancelVolume = (report = false) => {
    const pending = volumeJob.current;
    clearTimeout(volumeTimer.current);
    volumeJob.current = null; volumeBlocked.current = false;
    pending?.();
    setSessionState(previous => ({ ...previous, volumeBusy: false, volumeResult: null, volumeReconnectRequired: false,
      volumeError: report && pending ? { code: 'VOLUME_CANCELLED', outcome: 'cancelled', message: 'Simulación: ajuste cancelado.' } : null }));
  };
  useEffect(() => () => { clearTimeout(volumeTimer.current); volumeJob.current?.(); volumeJob.current = null; }, []);
  const [measurementModeScenario, setMeasurementModeScenario] = useState('accepted');
  const measurementModeJob = useRef(null);
  const measurementModeTimer = useRef(null);
  const measurementModeBlocked = useRef(false);
  const cancelMeasurementMode = (report = false) => {
    const pending = measurementModeJob.current;
    clearTimeout(measurementModeTimer.current);
    measurementModeJob.current = null; measurementModeBlocked.current = false;
    pending?.();
    setSessionState(previous => ({ ...previous, measurementModeBusy: false, measurementModeResult: null, measurementModeReconnectRequired: false,
      measurementModeError: report && pending ? { code: 'MEASUREMENT_MODE_CANCELLED', outcome: 'cancelled', message: 'Simulación: ajuste cancelado.' } : null }));
  };
  useEffect(() => () => { clearTimeout(measurementModeTimer.current); measurementModeJob.current?.(); measurementModeJob.current = null; }, []);
  const [deviceInfoScenario, setDeviceInfoScenario] = useState('complete');
  const infoJob = useRef(null);
  const infoTimer = useRef(null);
  const cancelInfo = () => {
    clearTimeout(infoTimer.current);
    infoJob.current?.();
    infoJob.current = null;
    setSessionState(previous => ({ ...previous, deviceInfoBusy: false, deviceInfoStatus: 'idle', deviceInfoResult: null, deviceInfoError: null }));
  };
  useEffect(() => () => { clearTimeout(infoTimer.current); infoJob.current?.(); infoJob.current = null; }, []);
  const [panelOpen, setPanelOpen] = useState(false);
  const initial = createBleLabScenario('disconnected');
  const [readings, setReadings] = useState(initial.readings);
  const [clockHistory, setClockHistory] = useState(initial.clockHistory);
  const [sessionState, setSessionState] = useState(initial.sessionState);
  const [reviewVisibleOn, setReviewVisibleOn] = useState(null);
  useEffect(() => { setReviewVisibleOn(null); resetReview(); }, [location.key]);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [checkedUncertain, setCheckedUncertain] = useState(false);
  const [duplicateApproved, setDuplicateApproved] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [storedConfirm, setStoredConfirm] = useState(false);
  const [incorporationRequested, setIncorporationRequested] = useState(false);
  const [check, setCheck] = useState({ status: 'idle' });
  const [queryFails, setQueryFails] = useState(false);
  const queryVersion = useRef(0);
  const queryTimer = useRef(null);
  useEffect(() => () => { ++queryVersion.current; clearTimeout(queryTimer.current); }, []);
  const resetReview = (keepEditing = false) => {
    ++queryVersion.current; clearTimeout(queryTimer.current); queryTimer.current = null;
    setCheckedUncertain(false); setDuplicateApproved(false); setDiscardConfirm(false); setStoredConfirm(false);
    if (!keepEditing) setIncorporationRequested(false);
    setCheck({ status: 'idle' });
  };
  const [clockDialogOpen, setClockDialogOpen] = useState(false);
  const timer = useRef(null);
  const bindingJob = useRef(null);
  const cancelBinding = () => {
    if (!bindingJob.current) return;
    clearTimeout(timer.current);
    bindingJob.current(false);
    bindingJob.current = null;
  };
  useEffect(() => () => { cancelBinding(); clearTimeout(timer.current); }, []);
  useEffect(() => { setNotice(null); }, [location.key]);
  const chooseScenario = value => {
    cancelMeasurementMode(); cancelVolume(); labClockBusy.current = false;
    cancelInfo();
    cancelBinding();
    clearTimeout(timer.current);
    restartLock.current = false;
    resetReview();
    const next = createBleLabScenario(value);
    if (value === 'uncertain') next.readings = next.readings.map(row => ({ ...row,
      attempt: { id: `lab-${row.uiId}`, userId: 'visual-lab', cycleId: 'fictional-cycle', isoDate: row.draft.isoDate, time: row.draft.time } }));
    if (value === 'duplicate') next.readings = next.readings.map(row => ({ ...row, reviewError: { code: 'ble-possible-duplicate', message: 'Coincidencia ficticia.' } }));
    next.sessionState.capabilities.volumeWrite = true;
    next.sessionState.capabilities.modeConfiguration = true;
    next.sessionState.listenerResult = next.sessionState.status === 'listening' ? { connectionReady: true, indicationsActive: true } : null;
    setScenario(value); setClockHistory(next.clockHistory); setReadings(next.readings); setSessionState(next.sessionState);
    setReviewVisibleOn(next.readings.length ? location.key : null);
    setExpanded(next.expanded); setSelectedId(null); setNotice(next.notice); setCheckedUncertain(false);

    setClockDialogOpen(false);
  };
  const selected = readings.find(row => row.uiId === selectedId) ?? readings[0];
  const draft = selected?.draft;
  const error = selected?.reviewError ?? null;
  const restartLock = useRef(false);
  const operationBlocked = () => bindingJob.current || restartLock.current || sessionState.busy || infoJob.current || volumeJob.current || measurementModeJob.current || labClockBusy.current || sessionState.clockBusy || ['checking', 'searching', 'connecting', 'inspecting', 'stopping', 'listening'].includes(sessionState.status);
  const search = () => {
    if (operationBlocked()) return;
    if (!sessionState.remembered) return;
    setSessionState(previous => ({ ...previous, status: 'searching', busy: true, error: null }));
    timer.current = setTimeout(() => {
      setSessionState(previous => ({ ...previous, status: 'connecting' }));
      timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'listening', busy: false, capabilities: { ...previous.capabilities, volumeWrite: true, modeConfiguration: true }, listenerResult: { connectionReady: true, indicationsActive: true, timeoutSeconds: 360 } })), 500);
    }, 900);
  };
  const updateDraft = patch => setReadings(rows => rows.map(row => row.uiId === selected.uiId ? { ...row, reviewError: row.reviewError?.code === 'ble-possible-duplicate' ? null : row.reviewError, draft: { ...row.draft, ...patch } } : row));
  const receiveReading = () => {
    const row = createBleLabScenario('one').readings[0];
    const uiId = Math.max(0, ...readings.map(item => item.uiId)) + 1;
    setReadings(rows => [...rows, { ...row, uiId }]);
    if (reviewVisibleOn !== location.key || !expanded) { setExpanded(false); setSelectedId(uiId); resetReview(); }
    setReviewVisibleOn(location.key);
  };
  const discard = () => {
    if (!selected || selected.importStatus === 'saving' || (selected.importStatus === 'uncertain' && check.status !== 'complete') || (!discardConfirm && !storedConfirm)) return;
    setReadings(rows => rows.filter(row => row.uiId !== selected.uiId));
    setSelectedId(null); resetReview();
  };
  const checkDay = () => {
    if (queryTimer.current) return;
    const version = ++queryVersion.current;
    setCheckedUncertain(false); setStoredConfirm(false); setCheck({ status: 'loading' });
    queryTimer.current = setTimeout(() => {
      if (version !== queryVersion.current) return;
      queryTimer.current = null;
      setCheck(queryFails ? { status: 'error', message: 'Fallo de red ficticio. No se ha completado la consulta.' }
        : { status: 'complete', result: { exists: true, measurements: [
          { id: 'lab-a', temperature: 36.4, time: '07:10', source: 'manual', selected: true },
          { id: 'lab-b', temperature: 36.6, time: '08:10', source: 'bluetooth', device_model: 'BM-Vinca2', selected: false },
        ] } });
    }, 500);
  };
  const reviewActive = mode === 'android' && reviewVisibleOn === location.key && expanded;
  useEffect(() => {
    resetReview();
    if (reviewActive && selected?.importStatus === 'uncertain' && selected?.attempt) checkDay();
  }, [reviewActive, selected?.uiId, selected?.attempt?.id, queryFails]);
  const save = () => {
    if (
  !draft?.isoDate ||
  !draft?.time ||
  selected?.importStatus === 'saving' ||
  (selected?.importStatus === 'uncertain' && !checkedUncertain) ||
  (error?.code === 'ble-possible-duplicate' && !duplicateApproved) || discardConfirm || storedConfirm
) return;
    setNotice(previous => ({ count: (previous?.count || 0) + 1, temperature: selected.temperatureC, isoDate: draft.isoDate, time: draft.time }));
    setReadings(rows => rows.filter(row => row.uiId !== selected.uiId));
    setSelectedId(null); resetReview();
  };

  const enabled = mode === 'android';
  const sessionRef = useRef(null);
  // This object contains no transport or persistence adapter. Even an accidental
  // invocation from a real consumer cannot call native plugins or a save callback.
  sessionRef.current = {
    start: search, listen: search,
    setVolume: level => {
      if (measurementModeJob.current || volumeJob.current || infoJob.current || labClockBusy.current || sessionState.clockBusy || sessionState.busy || restartLock.current || bindingJob.current) return Promise.resolve();
      const fail = (code, message, outcome = 'error') => {
        setSessionState(previous => ({ ...previous, volumeResult: null, volumeError: { code, message, outcome } }));
        return Promise.resolve();
      };
      if (!['low', 'medium', 'high'].includes(level)) return fail('VOLUME_INVALID_LEVEL', 'Selecciona Bajo, Medio o Alto.');
      if (!enabled || sessionState.status !== 'listening' || !sessionState.listenerResult?.connectionReady || !sessionState.listenerResult?.indicationsActive) return fail('VOLUME_NOT_CONNECTED', 'Conecta el termómetro primero.');
      if (volumeBlocked.current || measurementModeBlocked.current) return fail('VOLUME_RECONNECT_REQUIRED', 'Detén y reconecta antes de reintentar.', 'unknown');
      if (!sessionState.capabilities?.volumeWrite) return fail('VOLUME_UNSUPPORTED', 'Escritura con respuesta no disponible.');
      setSessionState(previous => ({ ...previous, volumeBusy: true, volumeResult: null, volumeError: null }));
      return new Promise(resolve => {
        volumeJob.current = resolve;
        const finish = (code = null) => {
          if (volumeJob.current !== resolve) return;
          volumeBlocked.current = code !== null;
          setSessionState(previous => ({ ...previous, volumeBusy: false, volumeReconnectRequired: code !== null,
            volumeResult: code ? null : { level, outcome: 'accepted', commandsAccepted: true, verified: false },
            volumeError: code ? { code, outcome: code === 'VOLUME_TIMEOUT' ? 'unknown' : 'error',
              message: code === 'VOLUME_TIMEOUT' ? 'Simulación: resultado desconocido. Detén y reconecta.'
                : code === 'VOLUME_FIRST_WRITE_FAILED' ? 'Simulación: falló el primer comando. Detén y reconecta.' : 'Simulación: falló la confirmación 0xFD. Detén y reconecta.' } : null,
          }));
          volumeJob.current = null; resolve();
        };
        volumeTimer.current = setTimeout(() => {
          if (volumeJob.current !== resolve) return;
          if (volumeScenario === 'firstError') { finish('VOLUME_FIRST_WRITE_FAILED'); return; }
          volumeTimer.current = setTimeout(() => finish(volumeScenario === 'confirmError' ? 'VOLUME_CONFIRM_WRITE_FAILED'
            : volumeScenario === 'timeout' ? 'VOLUME_TIMEOUT' : null), volumeScenario === 'timeout' ? 1200 : 350);
        }, 350);
      });
    },
    setMeasurementMode: level => {
      if (volumeJob.current || measurementModeJob.current || infoJob.current || labClockBusy.current || sessionState.clockBusy || sessionState.busy || restartLock.current || bindingJob.current) return Promise.resolve();
      const fail = (code, message, outcome = 'error') => {
        setSessionState(previous => ({ ...previous, measurementModeResult: null, measurementModeError: { code, message, outcome } }));
        return Promise.resolve();
      };
      if (!['quick', 'normal', 'precise'].includes(level)) return fail('MEASUREMENT_MODE_INVALID_LEVEL', 'Selecciona Rápido, Normal o Preciso.');
      if (!enabled || sessionState.status !== 'listening' || !sessionState.listenerResult?.connectionReady || !sessionState.listenerResult?.indicationsActive) return fail('MEASUREMENT_MODE_NOT_CONNECTED', 'Conecta el termómetro primero.');
      if (volumeBlocked.current || measurementModeBlocked.current) return fail('MEASUREMENT_MODE_RECONNECT_REQUIRED', 'Detén y reconecta antes de reintentar.', 'unknown');
      if (!sessionState.capabilities?.modeConfiguration) return fail('MEASUREMENT_MODE_UNSUPPORTED', 'Escritura con respuesta no disponible.');
      setSessionState(previous => ({ ...previous, measurementModeBusy: true, measurementModeResult: null, measurementModeError: null }));
      return new Promise(resolve => {
        measurementModeJob.current = resolve;
        const finish = (code = null) => {
          if (measurementModeJob.current !== resolve) return;
          measurementModeBlocked.current = code !== null;
          setSessionState(previous => ({ ...previous, measurementModeBusy: false, measurementModeReconnectRequired: code !== null,
            measurementModeResult: code ? null : { level, outcome: 'accepted', commandsAccepted: true, verified: false },
            measurementModeError: code ? { code, outcome: code === 'MEASUREMENT_MODE_TIMEOUT' ? 'unknown' : 'error',
              message: code === 'MEASUREMENT_MODE_TIMEOUT' ? 'Simulación: resultado desconocido. Detén y reconecta.'
                : code === 'MEASUREMENT_MODE_FIRST_WRITE_FAILED' ? 'Simulación: falló el primer comando. Detén y reconecta.' : 'Simulación: falló la confirmación 0x1E. Detén y reconecta.' } : null,
          }));
          measurementModeJob.current = null; resolve();
        };
        measurementModeTimer.current = setTimeout(() => {
          if (measurementModeJob.current !== resolve) return;
          if (measurementModeScenario === 'firstError') { finish('MEASUREMENT_MODE_FIRST_WRITE_FAILED'); return; }
          measurementModeTimer.current = setTimeout(() => finish(measurementModeScenario === 'confirmError' ? 'MEASUREMENT_MODE_CONFIRM_WRITE_FAILED'
            : measurementModeScenario === 'timeout' ? 'MEASUREMENT_MODE_TIMEOUT' : null), measurementModeScenario === 'timeout' ? 1200 : 350);
        }, 350);
      });
    },
    readDeviceInfo: () => {
      if (!enabled || volumeBlocked.current || measurementModeBlocked.current || sessionState.status !== 'listening' || !sessionState.listenerResult?.connectionReady || !sessionState.listenerResult?.indicationsActive || infoJob.current || volumeJob.current || measurementModeJob.current || labClockBusy.current || sessionState.clockBusy) return Promise.resolve();
      setSessionState(previous => ({ ...previous, deviceInfoBusy: true, deviceInfoStatus: 'loading', deviceInfoResult: null, deviceInfoError: null }));
      return new Promise(resolve => {
        infoJob.current = resolve;
        infoTimer.current = setTimeout(() => {
          if (infoJob.current !== resolve) return;
          const failed = deviceInfoScenario === 'error';
          setSessionState(previous => ({ ...previous, deviceInfoBusy: false, deviceInfoStatus: failed ? 'error' : 'received',
            deviceInfoError: failed ? { message: 'Simulación: no se pudo consultar los datos. Vuelve a intentarlo.' } : null,
            deviceInfoResult: failed ? null : { battery: deviceInfoScenario === 'noBattery' ? null : 85,
              model: 'BM-Vinca2 (simulado)', manufacturer: 'Femometer (simulado)',
              firmware: deviceInfoScenario === 'noFirmware' ? null : 'FW-demo', software: 'SW-demo' },
          }));
          infoJob.current = null;
          resolve();
        }, 700);
      });
    },
    scan: () => {
      if (operationBlocked()) return;
      setSessionState(previous => ({ ...previous, status: 'searching', busy: true, error: null, devices: [], selectedDeviceId: '', inspectionResult: null }));
      timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'idle', busy: false,
        devices: [{ id: 'lab-vinca', name: 'BM-Vinca2 (simulado)', rssi: -48 }, { id: 'lab-other', name: 'BM-Vinca2 (incompatible simulado)', rssi: -72 }, { id: 'lab-inspection-error', name: 'BM-Vinca2 (fallo de inspección simulado)', rssi: -65 }, { id: 'lab-save-error', name: 'BM-Vinca2 (fallo de vinculación simulado)', rssi: -60 }] })), 900);
    },
    selectAndRemember: deviceId => {
      if (operationBlocked()) return Promise.resolve(false);
      if (!sessionState.devices.some(device => device.id === deviceId)) {
        setSessionState(previous => ({ ...previous, status: 'error', error: { code: 'DEVICE_NOT_FOUND', message: 'Este resultado ya no está disponible. Vuelve a buscar.' } }));
        return Promise.resolve(false);
      }
      setSessionState(previous => ({ ...previous, status: 'inspecting', busy: true, selectedDeviceId: deviceId, inspectionResult: null, error: null }));
      return new Promise(resolve => {
        bindingJob.current = resolve;
        timer.current = setTimeout(() => {
          const inspectionFailed = deviceId === 'lab-inspection-error';
          const compatible = !inspectionFailed && deviceId !== 'lab-other';
          const saveFailed = deviceId === 'lab-save-error';
          const confirmed = compatible && !saveFailed;
          setSessionState(previous => ({ ...previous, status: inspectionFailed || saveFailed ? 'error' : 'idle', busy: false,
            inspectionResult: inspectionFailed ? null : { compatible, healthThermometerFound: compatible, temperatureMeasurementFound: compatible,
              services: [{ uuid: '00001809-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a1c-0000-1000-8000-00805f9b34fb', properties: ['indicate'] }] }] },
            error: inspectionFailed ? { code: 'CONNECTION_TIMEOUT', message: 'Simulación: no se pudo completar la comprobación.' }
              : saveFailed ? { code: 'PERSISTENCE_FAILED', message: 'Simulación: no se pudo confirmar la vinculación.' } : null,
            ...(confirmed ? { remembered: true, deviceKey: 'fictional-device-new', clockResult: null, clockError: null,
              devices: previous.devices.map(device => ({ ...device, isRemembered: device.id === deviceId })) } : {}),
          }));
          bindingJob.current = null;
          resolve(confirmed);
        }, 600);
      });
    },
    restart: () => {
      if (bindingJob.current || restartLock.current || sessionState.busy || infoJob.current || volumeJob.current || measurementModeJob.current || labClockBusy.current || sessionState.clockBusy) return;
      restartLock.current = true;
      cancelMeasurementMode(); cancelVolume(); labClockBusy.current = false;
      cancelInfo();
      clearTimeout(timer.current);
      setSessionState(previous => ({ ...previous, status: 'stopping', restarting: true, busy: true }));
      timer.current = setTimeout(() => {
        setSessionState(previous => ({ ...previous, status: 'searching', error: null }));
        timer.current = setTimeout(() => {
          restartLock.current = false;
          setSessionState(previous => ({ ...previous, status: 'listening', restarting: false, busy: false, listenerResult: { connectionReady: true, indicationsActive: true } }));
        }, 900);
      }, 400);
    },
    stop: async () => { cancelMeasurementMode(true); cancelVolume(true); labClockBusy.current = false; cancelInfo(); cancelBinding(); clearTimeout(timer.current); restartLock.current = false; setSessionState(previous => ({ ...previous, status: 'stopped', restarting: false, busy: false, clockBusy: false })); },
    select: id => {
      if (operationBlocked() || !sessionState.devices.some(device => device.id === id)) return;
      setSessionState(previous => ({ ...previous, selectedDeviceId: id, inspectionResult: null }));
    },
    inspect: () => {
      if (operationBlocked() || !sessionState.selectedDeviceId) return;
      setSessionState(previous => ({ ...previous, status: 'inspecting', busy: true, inspectionResult: null }));
      timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'idle', busy: false,
        inspectionResult: { compatible: previous.selectedDeviceId === 'lab-vinca', healthThermometerFound: previous.selectedDeviceId === 'lab-vinca',
          temperatureMeasurementFound: previous.selectedDeviceId === 'lab-vinca', services: [{ uuid: '00001809-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a1c-0000-1000-8000-00805f9b34fb', properties: ['indicate'] }] }] } })), 600);
    },
    remember: async forget => {
      if (operationBlocked() || (!forget && !sessionState.inspectionResult?.compatible)) return;
      setSessionState(previous => ({ ...previous, remembered: !forget, status: 'idle', clockResult: null, clockError: null,
        devices: previous.devices.map(device => ({ ...device, isRemembered: !forget && device.id === previous.selectedDeviceId })) }));
      if (forget) setClockHistory(null);
    },
    readClock: async () => {
      if (volumeBlocked.current || measurementModeBlocked.current || sessionState.status !== 'listening' || infoJob.current || volumeJob.current || measurementModeJob.current || labClockBusy.current || sessionState.clockBusy || !sessionState.capabilities.clockRead) return;
      setSessionState(previous => ({ ...previous, clockResult: { operation: 'read', significantDrift: false, driftSeconds: 0 }, clockError: null }));
      setClockHistory({ state: 'read_correct' });
    },
    syncClock: async () => {
      if (volumeBlocked.current || measurementModeBlocked.current || sessionState.status !== 'listening' || infoJob.current || volumeJob.current || measurementModeJob.current || labClockBusy.current || sessionState.clockBusy || !sessionState.capabilities.clockSync) return;
      labClockBusy.current = true;
      setSessionState(previous => ({ ...previous, clockBusy: true, clockError: null, clockResult: null }));
      timer.current = setTimeout(() => {
        labClockBusy.current = false;
        const failed = scenario === 'clockFailure';
        const verified = !failed && scenario !== 'clockUnverified';
        setSessionState(previous => ({ ...previous, clockBusy: false,
          clockError: failed ? { message: 'Simulación: no se pudo verificar el reloj. Reinténtalo.' } : null,
          clockResult: failed ? null : { operation: 'sync', verified, significantDrift: false, driftSeconds: verified ? 0 : null },
        }));
        if (verified) setClockHistory({ state: 'synchronized_verified' });
      }, 1200);
    },
  };
  const ble = { enabled, visualLab: true, preview: true, sessionState, readings, pendingCount: enabled ? readings.length : 0,
    sessionRef, lifecycleStatus: 'preview', clockHistory, temperatureListenerMessage: 'Datos Bluetooth ficticios; no se guardan.',
    openReadingReview: id => { setReviewVisibleOn(location.key); setSelectedId(id ?? selectedId); setExpanded(true); }, openClockDialog: () => setClockDialogOpen(true),
    incorporateReading: async () => { throw new Error('El laboratorio no permite guardados reales.'); },
    updateReadingDraft: () => {},
  };
  return <Provider value={ble}>
    {children}
    <aside aria-label="Laboratorio Bluetooth" className={`fixed ${panelOpen ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-[80]' : 'bottom-[calc(env(safe-area-inset-bottom,0px)+8px)] z-40'} right-3 max-h-[50dvh] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-rose-200 bg-white p-2 text-sm text-slate-700 shadow-md`}>
      <Button variant="ghost" className="min-h-11" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}>{panelOpen ? 'Minimizar laboratorio' : 'Laboratorio BLE'}</Button>
      {panelOpen && <div className="w-56 space-y-3 p-2">
        <p className="text-xs">Solo Bluetooth es ficticio. El resto de la cuenta Staging es real.</p>
        <label className="block">Modo<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Modo de previsualización" value={mode} onChange={event => { cancelMeasurementMode(); cancelVolume(); labClockBusy.current = false; cancelInfo(); cancelBinding(); clearTimeout(timer.current); restartLock.current = false; setMode(event.target.value); setReviewVisibleOn(null); setSessionState(previous => ({ ...previous, restarting: false, busy: false, clockBusy: false, status: previous.restarting || previous.busy ? 'stopped' : previous.status })); setNotice(null); setClockDialogOpen(false); }}><option value="web">Web / PWA</option><option value="android">Android visual</option></select></label>
        {enabled && <label className="block">Escenario<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Escenario visual" value={scenario} onChange={event => chooseScenario(event.target.value)}>{Object.entries(bleLabScenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {enabled && scenario === 'uncertain' && <label className="flex items-center gap-2"><input type="checkbox" checked={queryFails} onChange={event => { setQueryFails(event.target.checked); resetReview(); }} />Simular fallo de consulta</label>}
        {enabled && <label className="block">Consulta de datos<select aria-label="Escenario de datos" className="mt-1 min-h-11 w-full rounded border bg-white" value={deviceInfoScenario} onChange={event => { cancelInfo(); setDeviceInfoScenario(event.target.value); }}>
          <option value="complete">Resultado completo</option><option value="noFirmware">Batería sin firmware</option><option value="noBattery">Sin servicio de batería</option><option value="error">Error de consulta</option>
        </select></label>}
        {enabled && <label className="block">Volumen<select aria-label="Escenario de volumen" className="mt-1 min-h-11 w-full rounded border bg-white" value={volumeScenario} disabled={Boolean(volumeJob.current)} onChange={event => setVolumeScenario(event.target.value)}>
          <option value="accepted">Escritura aceptada</option><option value="firstError">Error del primer comando</option><option value="confirmError">Error de confirmación 0xFD</option><option value="timeout">Timeout</option>
        </select></label>}
        {enabled && <label className="block">Modo de medición<select aria-label="Escenario de modo de medición" className="mt-1 min-h-11 w-full rounded border bg-white" value={measurementModeScenario} disabled={Boolean(measurementModeJob.current)} onChange={event => setMeasurementModeScenario(event.target.value)}>
          <option value="accepted">Escritura aceptada</option><option value="firstError">Error del primer comando</option><option value="confirmError">Error de confirmación 0x1E</option><option value="timeout">Timeout</option>
        </select></label>}
        {enabled && <Button variant="outline" onClick={receiveReading}>Simular nueva temperatura</Button>}
      </div>}
    </aside>
    {enabled && <>
      <FemometerReviewCard visible={reviewVisibleOn === location.key} onDismiss={() => { setReviewVisibleOn(null); resetReview(); }} readings={readings} selected={selected} expanded={expanded} onExpand={() => setExpanded(true)} onMinimize={() => setExpanded(false)} onSelect={id => { if (id !== selected?.uiId) { setSelectedId(id); resetReview(); } }} deviceKey="fictional-device">
        {selected && <BleReadingReviewView measurement={{ temperature: selected.temperatureC, device_timestamp: selected.deviceTimestamp }} reading={selected}
          draft={draft} busy={selected.importStatus === 'saving'} error={error} checkedUncertain={checkedUncertain}
          check={check} canCheck={Boolean(selected.attempt)} onCheck={checkDay}
          duplicateApproved={duplicateApproved} discardConfirm={discardConfirm} storedConfirm={storedConfirm} incorporationRequested={incorporationRequested}
          onDifferent={() => { setDiscardConfirm(false); setDuplicateApproved(true); }} onRepeated={() => { setDuplicateApproved(false); setDiscardConfirm(true); }}
          onCancelDiscard={() => { setDiscardConfirm(false); setDuplicateApproved(false); }} onDiscard={discard}
          onAlreadyStored={() => { if (check.status === 'complete') { setCheckedUncertain(false); setIncorporationRequested(false); setDiscardConfirm(false); setDuplicateApproved(false); setStoredConfirm(true); } }}
          onConfirmStored={discard} onBackStored={() => { setStoredConfirm(false); setCheckedUncertain(false); }}
          onMissing={() => { if (check.status === 'complete') { setStoredConfirm(false); setIncorporationRequested(true); setCheckedUncertain(true); } }}
          change={patch => { updateDraft({ ...patch, confirmed: false }); resetReview(true); }} confirm={save}
          onClose={() => { setReviewVisibleOn(null); resetReview(); }} navigate={navigate} />}
      </FemometerReviewCard>
      <BleSavedNotice notice={notice} onDismiss={() => setNotice(null)} onViewDay={isoDate => navigate('/records', { state: { selectedDate: isoDate, scrollToDayDetail: true } })} />
      <FemometerFeedback clockHistory={clockHistory} readings={[]} sessionState={sessionState} sessionRef={sessionRef} clockDialogOpen={clockDialogOpen} setClockDialogOpen={setClockDialogOpen} />
    </>}
  </Provider>;
}
