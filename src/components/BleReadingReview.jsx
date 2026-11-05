import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { useFemometer } from '@/contexts/FemometerContext';
import { normalizeBleMeasurement, prepareManualBleDraft } from '@/lib/bleMeasurements';
import { fetchBleAttemptDayDB } from '@/lib/cycleDataHandler';
import { BleReadingReviewView } from '@/components/BleReadingReviewView';

export function BleReadingReview({ userId, reading, onClose, onSaved, active = true }) {
  const { sessionRef, incorporateReading, discardReading, updateReadingDraft, visualLab } = useFemometer();
  const { currentCycle, isLoading, incorporateBleMeasurement } = useCycleData();
  const navigate = useNavigate();
  const measurement = reading.normalized ?? normalizeBleMeasurement(reading, 'BM-Vinca2');
  const [draft, setDraft] = useState(() => ({ isoDate: measurement?.time ? measurement.device_timestamp.slice(0, 10) : '',
    time: measurement?.time || '', ...reading.draft, confirmed: false }));
  const [error, setError] = useState(reading.reviewError ?? null);
  const [busy, setBusy] = useState(false);
  const [duplicateApproval, setDuplicateApproval] = useState(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [storedConfirm, setStoredConfirm] = useState(false);
  const [incorporationRequested, setIncorporationRequested] = useState(false);
  const [check, setCheck] = useState({ status: 'idle' });
  const [missingApproval, setMissingApproval] = useState(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const queryActive = useRef(false);
  const key = JSON.stringify([userId, reading.uiId, reading.attempt, currentCycle?.id, draft.isoDate, draft.time]);
  const latest = useRef(key); latest.current = key;
  const cycleRef = useRef(currentCycle?.id); cycleRef.current = currentCycle?.id;
  const session = sessionRef.current;
  useEffect(() => {
    ++generation.current; queryActive.current = false; setCheck({ status: 'idle' }); setMissingApproval(null);
    setDuplicateApproval(null); setDiscardConfirm(false); setStoredConfirm(false);
  }, [key, session, active]);
  useEffect(() => { setIncorporationRequested(false); }, [active, reading.uiId, session, reading.attempt?.id, currentCycle?.id]);
  const valid = () => mounted.current && sessionRef.current === session && latest.current === key;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++generation.current; }; }, []);
  const complete = active && check.key === key && check.session === session && check.status === 'complete';
  const checkedUncertain = complete && missingApproval === key;
  const duplicateApproved = duplicateApproval?.key === key && duplicateApproval.session === session;
  const attempt = reading.attempt;
  const canCheck = !visualLab && active && attempt?.userId === userId && Boolean(attempt?.cycleId && attempt?.isoDate && attempt?.time && attempt?.id);
  const change = patch => {
    if (busyRef.current) return;
    ++generation.current; queryActive.current = false;
    const next = { ...draft, ...patch, confirmed: false };
    setCheck({ status: 'idle' }); setMissingApproval(null); setDuplicateApproval(null); setDiscardConfirm(false); setStoredConfirm(false);
    setError(null); setDraft(next); updateReadingDraft?.(reading.uiId, next);
  };
  const checkDay = async () => {
    if (!canCheck || busyRef.current || queryActive.current) return;
    queryActive.current = true;
    const request = ++generation.current;
    setMissingApproval(null); setStoredConfirm(false); setCheck({ key, session, status: 'loading' });
    try {
      const result = await fetchBleAttemptDayDB(attempt);
      if (!result?.complete || result.userId !== userId || result.cycleId !== attempt.cycleId || result.isoDate !== attempt.isoDate
        || !Array.isArray(result.measurements)) throw new Error('La consulta no está completa.');
      if (valid() && request === generation.current) setCheck({ key, session, status: 'complete', result });
    } catch (failure) {
      if (valid() && request === generation.current) setCheck({ key, session, status: 'error', message: failure.message || 'No se pudo consultar el servidor.' });
    } finally { if (request === generation.current) queryActive.current = false; }
  };
  useEffect(() => {
    // Defer once so StrictMode's effect replay cannot start two server reads.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled && active && reading.importStatus === 'uncertain' && canCheck) void checkDay();
    });
    return () => { cancelled = true; };
  }, [active, reading.uiId, reading.attempt?.id, reading.importStatus, session]);
  const discard = async reason => {
    if (!active || busyRef.current || !valid() || (reading.importStatus === 'uncertain' && !complete) || (reason === 'stored' ? (!complete || !storedConfirm) : !discardConfirm)) return;
    busyRef.current = true; setBusy(true);
    try {
      await discardReading(reading.uiId, session, complete ? attempt?.id : undefined);
      if (valid()) (onSaved ?? onClose)();
    } catch (failure) { if (valid()) setError({ code: 'local-discard-failed', message: failure.message }); }
    finally { busyRef.current = false; if (valid()) setBusy(false); }
  };
  const confirm = async () => {
    if (!active || busyRef.current || discardConfirm || storedConfirm || !valid() || (reading.importStatus === 'uncertain' && !checkedUncertain)
      || (error?.code === 'ble-possible-duplicate' && !duplicateApproved)) return;
    busyRef.current = true; setBusy(true);
    const cycleId = currentCycle?.id;
    setError(null);
    try {
      if (isLoading || !cycleId || !session) throw new Error('Espera a que se cargue el ciclo actual.');
      const payload = prepareManualBleDraft(measurement, { ...draft, confirmed: true, userId, cycleId, nowMs: Date.now() });
      const attempt = { id: globalThis.crypto.randomUUID(), userId, cycleId, isoDate: payload.isoDate, time: payload.measurements[0].time };
      await incorporateReading(reading.uiId, () => incorporateBleMeasurement(payload, { allowPossibleDuplicate: duplicateApproved }),
        { reviewedUncertain: checkedUncertain, reviewedAttemptId: reading.attempt?.id, attempt });
      if (mounted.current && sessionRef.current === session && cycleRef.current === cycleId) (onSaved ?? onClose)();
    } catch (failure) {
      // The attempt changes on an uncertain failure; still show the error for this session.
      if (mounted.current && sessionRef.current === session) setError({ code: failure?.code,
        message: failure?.title ? failure.message : 'No se pudo incorporar. Comprueba la fecha, el ciclo y la conexión antes de reintentar.' });
    } finally {
      ++generation.current;
      if (mounted.current && sessionRef.current === session) {
        setMissingApproval(null); setCheck({ status: 'idle' }); setDuplicateApproval(null);
      }
      busyRef.current = false;
      if (mounted.current && sessionRef.current === session) setBusy(false);
    }
  };
  return <BleReadingReviewView {...{ measurement, reading, draft, busy, error, checkedUncertain, change, confirm, onClose, navigate,
    duplicateApproved, discardConfirm, storedConfirm, incorporationRequested, canCheck }}
    check={check.key === key && check.session === session ? check : { status: 'idle' }} onCheck={checkDay}
    onDifferent={() => { if (!busyRef.current) { setDiscardConfirm(false); setDuplicateApproval({ key, session }); } }}
    onRepeated={() => { setDuplicateApproval(null); setDiscardConfirm(true); }} onCancelDiscard={() => { setDiscardConfirm(false); setDuplicateApproval(null); }} onDiscard={() => discard('duplicate')}
    onAlreadyStored={() => { if (complete) { setMissingApproval(null); setIncorporationRequested(false); setDiscardConfirm(false); setDuplicateApproval(null); setStoredConfirm(true); } }}
    onConfirmStored={() => discard('stored')} onBackStored={() => { setStoredConfirm(false); setMissingApproval(null); }}
    onMissing={() => { if (complete) { setStoredConfirm(false); setIncorporationRequested(true); setMissingApproval(key); } }} />;
}

export default BleReadingReview;
