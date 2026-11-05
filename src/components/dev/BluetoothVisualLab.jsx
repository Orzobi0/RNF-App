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
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setNotice(null); }, [location.key]);
  const chooseScenario = value => {
    clearTimeout(timer.current);
    restartLock.current = false;
    resetReview();
    const next = createBleLabScenario(value);
    if (value === 'uncertain') next.readings = next.readings.map(row => ({ ...row,
      attempt: { id: `lab-${row.uiId}`, userId: 'visual-lab', cycleId: 'fictional-cycle', isoDate: row.draft.isoDate, time: row.draft.time } }));
    if (value === 'duplicate') next.readings = next.readings.map(row => ({ ...row, reviewError: { code: 'ble-possible-duplicate', message: 'Coincidencia ficticia.' } }));
    setScenario(value); setClockHistory(next.clockHistory); setReadings(next.readings); setSessionState(next.sessionState);
    setReviewVisibleOn(next.readings.length ? location.key : null);
    setExpanded(next.expanded); setSelectedId(null); setNotice(next.notice); setCheckedUncertain(false);

    setClockDialogOpen(false);
  };
  const selected = readings.find(row => row.uiId === selectedId) ?? readings[0];
  const draft = selected?.draft;
  const error = selected?.reviewError ?? null;
  const restartLock = useRef(false);
  const operationBlocked = () => restartLock.current || sessionState.busy || sessionState.clockBusy || ['checking', 'searching', 'connecting', 'inspecting', 'stopping', 'listening'].includes(sessionState.status);
  const search = () => {
    if (restartLock.current || ['checking', 'searching', 'connecting', 'inspecting', 'stopping', 'listening'].includes(sessionState.status)) return;
    if (!sessionState.remembered) return;
    setSessionState(previous => ({ ...previous, status: 'searching', busy: true, error: null }));
    timer.current = setTimeout(() => {
      setSessionState(previous => ({ ...previous, status: 'connecting' }));
      timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'listening', busy: false, listenerResult: { connectionReady: true, indicationsActive: true, timeoutSeconds: 360 } })), 500);
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
    scan: () => {
      if (operationBlocked()) return;
      setSessionState(previous => ({ ...previous, status: 'searching', busy: true, error: null, devices: [], selectedDeviceId: '', inspectionResult: null }));
      timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'idle', busy: false,
        devices: [{ id: 'lab-vinca', name: 'BM-Vinca2 (simulado)', rssi: -48 }, { id: 'lab-other', name: 'Dispositivo incompatible (simulado)', rssi: -72 }] })), 900);
    },
    restart: () => {
      if (restartLock.current || sessionState.busy || sessionState.clockBusy) return;
      restartLock.current = true;
      clearTimeout(timer.current);
      setSessionState(previous => ({ ...previous, status: 'stopping', restarting: true, busy: true }));
      timer.current = setTimeout(() => {
        setSessionState(previous => ({ ...previous, status: 'searching', error: null }));
        timer.current = setTimeout(() => {
          restartLock.current = false;
          setSessionState(previous => ({ ...previous, status: 'listening', restarting: false, busy: false }));
        }, 900);
      }, 400);
    },
    stop: async () => { clearTimeout(timer.current); restartLock.current = false; setSessionState(previous => ({ ...previous, status: 'stopped', restarting: false, busy: false })); },
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
      if (sessionState.status !== 'listening' || sessionState.clockBusy || !sessionState.capabilities.clockRead) return;
      setSessionState(previous => ({ ...previous, clockResult: { operation: 'read', significantDrift: false, driftSeconds: 0 }, clockError: null }));
      setClockHistory({ state: 'read_correct' });
    },
    syncClock: async () => {
      if (sessionState.status !== 'listening' || sessionState.clockBusy || !sessionState.capabilities.clockSync) return;
      setSessionState(previous => ({ ...previous, clockBusy: true, clockError: null, clockResult: null }));
      timer.current = setTimeout(() => {
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
        <label className="block">Modo<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Modo de previsualización" value={mode} onChange={event => { clearTimeout(timer.current); restartLock.current = false; setMode(event.target.value); setReviewVisibleOn(null); setSessionState(previous => ({ ...previous, restarting: false, busy: false, status: previous.restarting ? 'stopped' : previous.status })); setNotice(null); setClockDialogOpen(false); }}><option value="web">Web / PWA</option><option value="android">Android visual</option></select></label>
        {enabled && <label className="block">Escenario<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Escenario visual" value={scenario} onChange={event => chooseScenario(event.target.value)}>{Object.entries(bleLabScenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {enabled && scenario === 'uncertain' && <label className="flex items-center gap-2"><input type="checkbox" checked={queryFails} onChange={event => { setQueryFails(event.target.checked); resetReview(); }} />Simular fallo de consulta</label>}
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
