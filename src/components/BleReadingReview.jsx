import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { useFemometer } from '@/contexts/FemometerContext';
import { normalizeBleMeasurement, prepareManualBleDraft } from '@/lib/bleMeasurements';
import { BleReadingReviewView } from '@/components/BleReadingReviewView';

// The same explicit-confirmation flow for the global notice and Devices.
// Mounted with a reading key so editing one reading never edits another draft.
export function BleReadingReview({ userId, reading, onClose, onSaved }) {
  const { sessionRef, incorporateReading, updateReadingDraft } = useFemometer();
  const { currentCycle, isLoading, incorporateBleMeasurement } = useCycleData();
  const navigate = useNavigate();
  const measurement = reading.normalized ?? normalizeBleMeasurement(reading, 'BM-Vinca2');
  const [draft, setDraft] = useState(() => ({ isoDate: measurement?.time ? measurement.device_timestamp.slice(0, 10) : '',
    time: measurement?.time || '', ...reading.draft, confirmed: false }));
  const [checkedUncertain, setCheckedUncertain] = useState(false);
  const [error, setError] = useState(reading.reviewError ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const cycleRef = useRef(currentCycle);
  cycleRef.current = currentCycle;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = patch => {
    const next = { ...draft, ...patch, confirmed: false };
    setError(null); setDraft(next); updateReadingDraft?.(reading.uiId, next);
  };
  const confirm = async () => {
    if (busyRef.current) return;
    if (reading.importStatus === 'uncertain' && !checkedUncertain) return;
    busyRef.current = true; setBusy(true);
    const session = sessionRef.current;
    const cycleId = currentCycle?.id;
    const allowPossibleDuplicate = error?.code === 'ble-possible-duplicate';
    setError(null);
    try {
      if (isLoading || !cycleId || !session) throw new Error('Espera a que se cargue el ciclo actual.');
      const payload = prepareManualBleDraft(measurement, {
  ...draft,
  confirmed: true,
  userId,
  cycleId,
  nowMs: Date.now(),
});
      await incorporateReading(reading.uiId, () => incorporateBleMeasurement(payload, { allowPossibleDuplicate }), { reviewedUncertain: checkedUncertain });
      if (mounted.current && sessionRef.current === session && cycleRef.current?.id === cycleId) (onSaved ?? onClose)();
    } catch (failure) {
      if (mounted.current && sessionRef.current === session) setError({ code: failure?.code,
        message: failure?.title ? failure.message : 'No se pudo incorporar. Comprueba la fecha, el ciclo y la conexión antes de reintentar.' });
    } finally {
      busyRef.current = false;
      if (mounted.current && sessionRef.current === session) setBusy(false);
    }
  };
  return (
  <BleReadingReviewView
    {...{
      measurement,
      reading,
      draft,
      busy,
      error,
      checkedUncertain,
      setCheckedUncertain,
      change,
      confirm,
      onClose,
      navigate,
    }}
  />
);
}

export default BleReadingReview;
