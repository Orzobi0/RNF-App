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
  useEffect(() => { setReviewVisibleOn(null); }, [location.key]);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [checkedUncertain, setCheckedUncertain] = useState(false);
  const [clockDialogOpen, setClockDialogOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setNotice(null); }, [location.key]);
  const chooseScenario = value => {
    clearTimeout(timer.current);
    restartLock.current = false;
    const next = createBleLabScenario(value);
    setScenario(value); setClockHistory(next.clockHistory); setReadings(next.readings); setSessionState(next.sessionState);
    setReviewVisibleOn(next.readings.length ? location.key : null);
    setExpanded(next.expanded); setSelectedId(null); setNotice(next.notice); setCheckedUncertain(false);
    setError(value === 'duplicate' ? { code: 'ble-possible-duplicate', message: 'Coincidencia ficticia de modelo, minuto y temperatura.' } : null);
    setClockDialogOpen(false);
  };
  const selected = readings.find(row => row.uiId === selectedId) ?? readings[0];
  const draft = selected?.draft;
  const restartLock = useRef(false);
  const search = () => {
    if (restartLock.current || ['checking', 'searching', 'connecting', 'inspecting', 'stopping', 'listening'].includes(sessionState.status)) return;
    setSessionState(previous => ({ ...previous, status: 'searching', error: null }));
    timer.current = setTimeout(() => setSessionState(previous => ({ ...previous, status: 'listening' })), 900);
  };
  const updateDraft = patch => setReadings(rows => rows.map(row => row.uiId === selected.uiId ? { ...row, draft: { ...row.draft, ...patch } } : row));
  const receiveReading = () => {
    const row = createBleLabScenario('one').readings[0];
    setReadings(rows => [...rows, { ...row, uiId: Math.max(0, ...rows.map(item => item.uiId)) + 1 }]);
    setExpanded(false); setReviewVisibleOn(location.key);
  };
  const save = () => {
    if (!draft.confirmed || selected.importStatus === 'saving') return;
    setNotice(previous => ({ count: (previous?.count || 0) + 1, temperature: selected.temperatureC, isoDate: draft.isoDate, time: draft.time }));
    setReadings(rows => rows.filter(row => row.uiId !== selected.uiId));
    setSelectedId(null); setError(null); setCheckedUncertain(false);
  };

  const enabled = mode === 'android';
  const sessionRef = useRef(null);
  // This object contains no transport or persistence adapter. Even an accidental
  // invocation from a real consumer cannot call native plugins or a save callback.
  sessionRef.current = {
    start: search, scan: search, listen: search,
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
    select: id => setSessionState(previous => ({ ...previous, selectedDeviceId: id })),
    inspect: async () => setSessionState(previous => ({ ...previous, inspectionResult: { compatible: true } })),
    remember: async forget => setSessionState(previous => ({ ...previous, remembered: !forget })),
    readClock: async () => setClockDialogOpen(true),
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
    <aside aria-label="Laboratorio Bluetooth" className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] right-3 z-[80] max-h-[50dvh] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-rose-200 bg-white p-2 text-sm text-slate-700 shadow-md">
      <Button variant="ghost" className="min-h-11" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}>{panelOpen ? 'Minimizar laboratorio' : 'Laboratorio BLE'}</Button>
      {panelOpen && <div className="w-56 space-y-3 p-2">
        <p className="text-xs">Solo Bluetooth es ficticio. El resto de la cuenta Staging es real.</p>
        <label className="block">Modo<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Modo de previsualización" value={mode} onChange={event => { clearTimeout(timer.current); restartLock.current = false; setMode(event.target.value); setReviewVisibleOn(null); setSessionState(previous => ({ ...previous, restarting: false, busy: false, status: previous.restarting ? 'stopped' : previous.status })); setNotice(null); setClockDialogOpen(false); }}><option value="web">Web / PWA</option><option value="android">Android visual</option></select></label>
        {enabled && <label className="block">Escenario<select className="mt-1 min-h-11 w-full rounded border bg-white" aria-label="Escenario visual" value={scenario} onChange={event => chooseScenario(event.target.value)}>{Object.entries(bleLabScenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {enabled && <Button variant="outline" onClick={receiveReading}>Simular nueva temperatura</Button>}
      </div>}
    </aside>
    {enabled && <>
      <FemometerReviewCard visible={reviewVisibleOn === location.key} onDismiss={() => setReviewVisibleOn(null)} readings={readings} selected={selected} expanded={expanded} onExpand={() => setExpanded(true)} onMinimize={() => setExpanded(false)} onSelect={id => { setSelectedId(id); setCheckedUncertain(false); }} deviceKey="fictional-device">
        {selected && <BleReadingReviewView measurement={{ temperature: selected.temperatureC, device_timestamp: selected.deviceTimestamp }} reading={selected}
          draft={draft} busy={selected.importStatus === 'saving'} error={error} checkedUncertain={checkedUncertain} setCheckedUncertain={setCheckedUncertain}
          change={patch => updateDraft({ ...patch, confirmed: false })} onConfirmation={confirmed => updateDraft({ confirmed })} confirm={save}
          onClose={() => { updateDraft({ confirmed: false }); setExpanded(false); }} navigate={navigate} />}
      </FemometerReviewCard>
      <BleSavedNotice notice={notice} onDismiss={() => setNotice(null)} onViewDay={isoDate => navigate('/records', { state: { selectedDate: isoDate, scrollToDayDetail: true } })} />
      <FemometerFeedback clockHistory={clockHistory} readings={[]} sessionState={sessionState} sessionRef={sessionRef} clockDialogOpen={clockDialogOpen} setClockDialogOpen={setClockDialogOpen} />
    </>}
  </Provider>;
}
