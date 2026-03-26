import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, format, isAfter, isValid, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { computeOvulationMetrics } from '@/hooks/useFertilityChart';
import { useAuth } from '@/contexts/AuthContext';
import { saveUserMetricsSnapshot } from '@/lib/userMetrics';
import { MANUAL_CPM_DEDUCTION, buildCpmMetric } from '@/lib/metrics/cpm';
import { buildT8Metric } from '@/lib/metrics/t8';
import { normalizePreferenceValue } from '@/lib/preferences';

export const useFertilityCalculatorsEditor = ({
  currentCycle,
  archivedCycles,
  setCycleIgnoreForAutoCalculations,
  toast,
}) => {
  const { user, preferences, savePreferences } = useAuth();
  const [isCpmDialogOpen, setIsCpmDialogOpen] = useState(false);
  const [manualCpmBaseInput, setManualCpmBaseInput] = useState('');
  const [manualCpmFinalInput, setManualCpmFinalInput] = useState('');
  const [manualCpmBaseError, setManualCpmBaseError] = useState('');
  const [manualCpmFinalError, setManualCpmFinalError] = useState('');
  const [manualCpmEditedSide, setManualCpmEditedSide] = useState(null);
  const [manualCpmBaseValue, setManualCpmBaseValue] = useState(null);
  const [manualCpmValue, setManualCpmValue] = useState(null);
  const [isManualCpm, setIsManualCpm] = useState(false);
  const [cpmSelection, setCpmSelection] = useState('auto');
  const [cpmSelectionDraft, setCpmSelectionDraft] = useState('auto');
  const [showCpmDetails, setShowCpmDetails] = useState(false);
  const [showCpmDeleteDialog, setShowCpmDeleteDialog] = useState(false);
  const [isDeletingManualCpm, setIsDeletingManualCpm] = useState(false);

  const [isT8DialogOpen, setIsT8DialogOpen] = useState(false);
  const [manualT8BaseInput, setManualT8BaseInput] = useState('');
  const [manualT8FinalInput, setManualT8FinalInput] = useState('');
  const [manualT8BaseError, setManualT8BaseError] = useState('');
  const [manualT8FinalError, setManualT8FinalError] = useState('');
  const [manualT8EditedSide, setManualT8EditedSide] = useState(null);
  const [manualT8BaseValue, setManualT8BaseValue] = useState(null);
  const [manualT8Value, setManualT8Value] = useState(null);
  const [isManualT8, setIsManualT8] = useState(false);
  const [t8Selection, setT8Selection] = useState('auto');
  const [t8SelectionDraft, setT8SelectionDraft] = useState('auto');
  const [showT8Details, setShowT8Details] = useState(false);
  const [showT8DeleteDialog, setShowT8DeleteDialog] = useState(false);
  const [isDeletingManualT8, setIsDeletingManualT8] = useState(false);
  const [pendingIgnoredCycleIds, setPendingIgnoredCycleIds] = useState([]);

  const manualCpmRestoreAttemptedRef = useRef(false);
  const manualT8RestoreAttemptedRef = useRef(false);
  const automaticMetricsSnapshotRef = useRef(null);
  const cpmSelectionInitializedRef = useRef(false);
  const t8SelectionInitializedRef = useRef(false);

  const manualCpmStorageKey = useMemo(() => (user?.uid ? `rnf_manual_cpm_${user.uid}` : null), [user?.uid]);
  const manualCpmBaseStorageKey = useMemo(() => (user?.uid ? `rnf_manual_cpm_base_${user.uid}` : null), [user?.uid]);
  const manualT8StorageKey = useMemo(() => (user?.uid ? `rnf_manual_t8_${user.uid}` : null), [user?.uid]);
  const manualT8BaseStorageKey = useMemo(() => (user?.uid ? `rnf_manual_t8_base_${user.uid}` : null), [user?.uid]);

  const persistCpmMode = useCallback(async (mode) => {
    if (!user?.uid || !savePreferences) return;
    if (!['auto', 'manual', 'none'].includes(mode)) return;
    try { await savePreferences({ cpmMode: mode }); } catch (error) { console.error('Failed to persist CPM mode', error); }
  }, [savePreferences, user?.uid]);

  const persistT8Mode = useCallback(async (mode) => {
    if (!user?.uid || !savePreferences) return;
    if (!['auto', 'manual', 'none'].includes(mode)) return;
    try { await savePreferences({ t8Mode: mode }); } catch (error) { console.error('Failed to persist T-8 mode', error); }
  }, [savePreferences, user?.uid]);

  const formatCycleDateRange = useCallback((cycle) => {
    if (!cycle?.startDate) return null;
    try {
      const start = parseISO(cycle.startDate);
      if (!isValid(start)) return null;
      const startLabel = format(start, 'dd/MM/yyyy', { locale: es });
      if (!cycle.endDate) return `${startLabel} - En curso`;
      const end = parseISO(cycle.endDate);
      if (!isValid(end)) return startLabel;
      return `${startLabel} - ${format(end, 'dd/MM/yyyy', { locale: es })}`;
    } catch {
      return null;
    }
  }, []);

  const combinedCycles = useMemo(() => {
    const cycles = [];
    (archivedCycles || []).forEach((cycle, index) => {
      const dateRangeLabel = formatCycleDateRange(cycle);
      cycles.push({ ...cycle, displayName: cycle.name || dateRangeLabel || `Ciclo archivado ${index + 1}`, dateRangeLabel, source: 'archived', ignoredForAutoCalculations: Boolean(cycle.ignoredForAutoCalculations) });
    });
    if (currentCycle?.id) {
      const dateRangeLabel = formatCycleDateRange(currentCycle);
      cycles.push({ ...currentCycle, displayName: currentCycle.name || dateRangeLabel || 'Ciclo actual', dateRangeLabel, source: 'current', ignoredForAutoCalculations: Boolean(currentCycle.ignoredForAutoCalculations) });
    }
    return cycles;
  }, [archivedCycles, currentCycle, formatCycleDateRange]);

  const computedCpmData = useMemo(() => {
    const completedCycles = combinedCycles.map((cycle) => {
      if (!cycle.startDate || !cycle.endDate) return null;
      try {
        const start = parseISO(cycle.startDate); const end = parseISO(cycle.endDate);
        if (!isValid(start) || !isValid(end) || isAfter(start, end)) return null;
        const duration = differenceInDays(startOfDay(end), startOfDay(start)) + 1;
        if (!Number.isFinite(duration) || duration <= 0) return null;
        return { ...cycle, duration, ignoredForAutoCalculations: Boolean(cycle.ignoredForAutoCalculations) };
      } catch { return null; }
    }).filter(Boolean);

    const annotatedCycles = [...completedCycles].sort((a,b)=>(a.duration??Infinity)-(b.duration??Infinity)).map((cycle) => ({ ...cycle, isIgnored: Boolean(cycle.ignoredForAutoCalculations), isIncluded: !cycle.ignoredForAutoCalculations }));
    const includedCycles = annotatedCycles.filter((c) => c.isIncluded);
    const ignoredCount = annotatedCycles.length - includedCycles.length;
    const includedCount = includedCycles.length;
    if (includedCount < 6) return { value: null, cycleCount: includedCount, shortestCycle: null, deduction: null, canCompute: false, cyclesConsidered: annotatedCycles, ignoredCount };
    const shortestCycle = includedCycles[0] ?? null;
    const deduction = includedCount >= 12 ? 20 : 21;
    const computedValue = typeof shortestCycle?.duration === 'number' ? Math.max(1, shortestCycle.duration - deduction) : null;
    return { value: computedValue, cycleCount: includedCount, shortestCycle, deduction, canCompute: computedValue !== null, cyclesConsidered: annotatedCycles, ignoredCount };
  }, [combinedCycles]);

  const computedT8Data = useMemo(() => {
    const normalizeTempValue = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number.parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const getMeasurementTemp = (measurement) => {
      if (!measurement) return null;
      const raw = normalizeTempValue(measurement.temperature);
      const corrected = normalizeTempValue(measurement.temperature_corrected);
      if (measurement.use_corrected && corrected !== null) return corrected;
      return raw ?? corrected;
    };
    const getDisplayTemperature = (entry) => {
      for (const candidate of [entry?.temperature_chart, entry?.temperature_raw, entry?.temperature_corrected]) {
        const normalized = normalizeTempValue(candidate);
        if (normalized !== null) return normalized;
      }
      if (Array.isArray(entry?.measurements)) {
        const selected = entry.measurements.find((m) => m?.selected && getMeasurementTemp(m) !== null) || entry.measurements.find((m) => getMeasurementTemp(m) !== null);
        if (selected) return getMeasurementTemp(selected);
      }
      return null;
    };
    const sortedCycles = combinedCycles.filter((c) => c?.startDate && Array.isArray(c?.data) && c.data.length > 0).sort((a,b)=>parseISO(b.startDate)-parseISO(a.startDate));
    const consideredCycles = []; const includedCycles = [];
    for (const cycle of sortedCycles) {
      const processedEntries = cycle.data.filter((e) => e?.isoDate).map((entry)=>({ ...entry, displayTemperature: getDisplayTemperature(entry) }));
      if (!processedEntries.length) continue;
      const { ovulationDetails } = computeOvulationMetrics(processedEntries);
      if (!ovulationDetails?.confirmed) continue;
      const ovulationIndex = Number.isInteger(ovulationDetails?.ovulationIndex) ? ovulationDetails.ovulationIndex : Number.isInteger(ovulationDetails?.confirmationIndex) ? ovulationDetails.confirmationIndex : null;
      if (ovulationIndex == null || ovulationIndex < 0 || ovulationIndex >= processedEntries.length) continue;
      const riseDay = Number(processedEntries[ovulationIndex]?.cycleDay);
      if (!Number.isFinite(riseDay) || riseDay <= 0) continue;
      const cycleInfo = { cycleId: cycle.id, riseDay, t8Day: Math.max(1, riseDay - 8), displayName: cycle.displayName || cycle.name || 'Ciclo sin nombre', dateRangeLabel: cycle.dateRangeLabel, isIgnored: Boolean(cycle.ignoredForAutoCalculations), isIncluded: !cycle.ignoredForAutoCalculations, ignoredForAutoCalculations: Boolean(cycle.ignoredForAutoCalculations) };
      consideredCycles.push(cycleInfo);
      if (!cycleInfo.isIgnored && includedCycles.length < 12) includedCycles.push(cycleInfo);
    }
    const cycleCount = includedCycles.length;
    const ignoredCount = consideredCycles.reduce((total, cycle) => total + (cycle.isIgnored ? 1 : 0), 0);
    if (!cycleCount) return { value: null, cycleCount, earliestCycle: null, cyclesConsidered: consideredCycles, canCompute: false, rawValue: null, ignoredCount };
    const earliestCycle = includedCycles.reduce((earliest, current) => current.t8Day < earliest.t8Day ? current : earliest);
    const canCompute = cycleCount >= 6;
    return { value: canCompute ? earliestCycle.t8Day : null, cycleCount, earliestCycle, cyclesConsidered: consideredCycles, canCompute, rawValue: earliestCycle.t8Day, ignoredCount };
  }, [combinedCycles]);

  // Persistence effects omitted in comment, kept as-is behavior
  useEffect(() => { manualCpmRestoreAttemptedRef.current = false; }, [manualCpmStorageKey]);
  useEffect(() => { manualT8RestoreAttemptedRef.current = false; }, [manualT8StorageKey]);

  useEffect(() => {
    if (!manualCpmBaseStorageKey) return void setManualCpmBaseValue(null);
    const value = preferences?.manualCpmBase;
    if (value !== undefined) {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setManualCpmBaseValue(numeric);
      try { if (typeof window !== 'undefined') numeric === null ? localStorage.removeItem(manualCpmBaseStorageKey) : localStorage.setItem(manualCpmBaseStorageKey, JSON.stringify({ value: numeric })); } catch {}
      return;
    }
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(manualCpmBaseStorageKey) : null;
      const parsed = stored ? JSON.parse(stored) : null;
      setManualCpmBaseValue(typeof parsed?.value === 'number' ? parsed.value : null);
    } catch {}
  }, [manualCpmBaseStorageKey, preferences?.manualCpmBase]);

  useEffect(() => {
    if (!manualT8BaseStorageKey) return void setManualT8BaseValue(null);
    const value = preferences?.manualT8Base;
    if (value !== undefined) {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setManualT8BaseValue(numeric);
      try { if (typeof window !== 'undefined') numeric === null ? localStorage.removeItem(manualT8BaseStorageKey) : localStorage.setItem(manualT8BaseStorageKey, JSON.stringify({ value: numeric })); } catch {}
      return;
    }
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(manualT8BaseStorageKey) : null;
      const parsed = stored ? JSON.parse(stored) : null;
      setManualT8BaseValue(typeof parsed?.value === 'number' ? parsed.value : null);
    } catch {}
  }, [manualT8BaseStorageKey, preferences?.manualT8Base]);

  const persistManualCpm = useCallback(async ({ finalValue, baseValue }) => {
    if (!user?.uid || !savePreferences) return;
    const normalizedFinal = finalValue == null ? null : Number(finalValue);
    const normalizedBase = baseValue === undefined ? undefined : baseValue == null ? null : Number(baseValue);
    const payload = { manualCpm: normalizedFinal }; if (normalizedBase !== undefined) payload.manualCpmBase = normalizedBase;
    await savePreferences(payload);

    if (manualCpmStorageKey && typeof window !== 'undefined') {
      if (payload.manualCpm === null) {
        localStorage.removeItem(manualCpmStorageKey);
      } else {
        localStorage.setItem(manualCpmStorageKey, JSON.stringify({ value: payload.manualCpm }));
      }
    }

    if (normalizedBase !== undefined && manualCpmBaseStorageKey && typeof window !== 'undefined') {
      if (normalizedBase === null) {
        localStorage.removeItem(manualCpmBaseStorageKey);
      } else {
        localStorage.setItem(manualCpmBaseStorageKey, JSON.stringify({ value: normalizedBase }));
      }
    }

    await saveUserMetricsSnapshot(user.uid, { manual: { cpm: { value: normalizedFinal, base: normalizedBase === undefined ? manualCpmBaseValue : normalizedBase } }, manualUpdatedAt: new Date().toISOString() });
  }, [manualCpmBaseStorageKey, manualCpmBaseValue, manualCpmStorageKey, savePreferences, user?.uid]);

  const persistManualT8 = useCallback(async ({ finalValue, baseValue }) => {
    if (!user?.uid || !savePreferences) return;
    const normalizedFinal = finalValue == null ? null : Number(finalValue);
    const normalizedBase = baseValue === undefined ? undefined : baseValue == null ? null : Number(baseValue);
    const payload = { manualT8: normalizedFinal }; if (normalizedBase !== undefined) payload.manualT8Base = normalizedBase;
    await savePreferences(payload);

    if (manualT8StorageKey && typeof window !== 'undefined') {
      if (payload.manualT8 === null) {
        localStorage.removeItem(manualT8StorageKey);
      } else {
        localStorage.setItem(manualT8StorageKey, JSON.stringify({ value: payload.manualT8 }));
      }
    }

    if (normalizedBase !== undefined && manualT8BaseStorageKey && typeof window !== 'undefined') {
      if (normalizedBase === null) {
        localStorage.removeItem(manualT8BaseStorageKey);
      } else {
        localStorage.setItem(manualT8BaseStorageKey, JSON.stringify({ value: normalizedBase }));
      }
    }

    await saveUserMetricsSnapshot(user.uid, { manual: { t8: { value: normalizedFinal, riseDay: normalizedBase === undefined ? manualT8BaseValue : normalizedBase } }, manualUpdatedAt: new Date().toISOString() });
  }, [manualT8BaseStorageKey, manualT8BaseValue, manualT8StorageKey, savePreferences, user?.uid]);

  useEffect(() => {
    if (!manualCpmStorageKey) {
      setManualCpmValue(null);
      setIsManualCpm(false);
      return;
    }

    const value = preferences?.manualCpm;
    if (value !== undefined) {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setManualCpmValue(numeric);
      setIsManualCpm(numeric !== null);
      manualCpmRestoreAttemptedRef.current = true;
      try {
        if (typeof window !== 'undefined') {
          if (numeric === null) {
            localStorage.removeItem(manualCpmStorageKey);
          } else {
            localStorage.setItem(manualCpmStorageKey, JSON.stringify({ value: numeric }));
          }
        }
      } catch {}
      return;
    }

    if (manualCpmRestoreAttemptedRef.current) return;
    manualCpmRestoreAttemptedRef.current = true;
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(manualCpmStorageKey) : null;
      const parsed = stored ? JSON.parse(stored) : null;
      const numeric = typeof parsed?.value === 'number' && Number.isFinite(parsed.value) ? parsed.value : null;
      setManualCpmValue(numeric);
      setIsManualCpm(numeric !== null);
    } catch {
      setManualCpmValue(null);
      setIsManualCpm(false);
    }
  }, [manualCpmStorageKey, preferences?.manualCpm]);

  useEffect(() => {
    if (!manualT8StorageKey) {
      setManualT8Value(null);
      setIsManualT8(false);
      return;
    }

  const value = preferences?.manualT8;
    if (value !== undefined) {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setManualT8Value(numeric);
      setIsManualT8(numeric !== null);
      manualT8RestoreAttemptedRef.current = true;
      try {
        if (typeof window !== 'undefined') {
          if (numeric === null) {
            localStorage.removeItem(manualT8StorageKey);
          } else {
            localStorage.setItem(manualT8StorageKey, JSON.stringify({ value: numeric }));
          }
        }
      } catch {}
      return;
    }

    if (manualT8RestoreAttemptedRef.current) return;
    manualT8RestoreAttemptedRef.current = true;
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(manualT8StorageKey) : null;
      const parsed = stored ? JSON.parse(stored) : null;
      const numeric = typeof parsed?.value === 'number' && Number.isFinite(parsed.value) ? parsed.value : null;
      setManualT8Value(numeric);
      setIsManualT8(numeric !== null);
    } catch {
      setManualT8Value(null);
      setIsManualT8(false);
    }
  }, [manualT8StorageKey, preferences?.manualT8]);

  useEffect(() => {
    if (cpmSelectionInitializedRef.current || !preferences) return;
    let resolvedMode = normalizePreferenceValue('cpmMode', preferences?.cpmMode);
    if (!['auto', 'manual', 'none'].includes(resolvedMode)) resolvedMode = isManualCpm ? 'manual' : computedCpmData.canCompute ? 'auto' : 'none';
    setCpmSelection(resolvedMode); setCpmSelectionDraft(resolvedMode); cpmSelectionInitializedRef.current = true;
  }, [computedCpmData.canCompute, isManualCpm, preferences]);

  useEffect(() => {
    if (t8SelectionInitializedRef.current || !preferences) return;
    let resolvedMode = normalizePreferenceValue('t8Mode', preferences?.t8Mode);
    if (!['auto', 'manual', 'none'].includes(resolvedMode)) resolvedMode = isManualT8 ? 'manual' : computedT8Data.canCompute ? 'auto' : 'none';
    setT8Selection(resolvedMode); setT8SelectionDraft(resolvedMode); t8SelectionInitializedRef.current = true;
  }, [computedT8Data.canCompute, isManualT8, preferences]);

  useEffect(() => {
    if (!user?.uid) return;
    const metricsPayload = { automatic: { cpm: { value: computedCpmData?.value ?? null, cycleCount: computedCpmData?.cycleCount ?? 0, ignoredCount: computedCpmData?.ignoredCount ?? 0, deduction: computedCpmData?.deduction ?? null, canCompute: Boolean(computedCpmData?.canCompute), shortestCycle: computedCpmData?.shortestCycle ?? null }, t8: { value: computedT8Data?.value ?? null, cycleCount: computedT8Data?.cycleCount ?? 0, ignoredCount: computedT8Data?.ignoredCount ?? 0, canCompute: Boolean(computedT8Data?.canCompute), riseDay: computedT8Data?.earliestCycle?.riseDay ?? null, earliestCycle: computedT8Data?.earliestCycle ?? null } } };
    const serialized = JSON.stringify(metricsPayload);
    if (automaticMetricsSnapshotRef.current === serialized) return;
    automaticMetricsSnapshotRef.current = serialized;
    saveUserMetricsSnapshot(user.uid, { ...metricsPayload, automaticUpdatedAt: new Date().toISOString() }).catch(() => {});
  }, [computedCpmData, computedT8Data, user?.uid]);

  const formatNumber = useCallback((value, options) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-ES', options) : null), []);
  const cpmMetric = useMemo(() => buildCpmMetric({ computedCpmData, cpmSelection, isManualCpm, manualCpmBaseValue, manualCpmValue, formatNumber }), [computedCpmData, cpmSelection, formatNumber, isManualCpm, manualCpmBaseValue, manualCpmValue]);
  const t8Metric = useMemo(() => buildT8Metric({ computedT8Data, t8Selection, isManualT8, manualT8BaseValue, manualT8Value, formatNumber }), [computedT8Data, formatNumber, isManualT8, manualT8BaseValue, manualT8Value, t8Selection]);

  const cpmInfo = useMemo(() => {
    const cycleCount = computedCpmData.cycleCount ?? 0;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const resolvedMode = ['auto', 'manual', 'none'].includes(cpmSelection) ? cpmSelection : 'auto';
    const sourceLabel =
      resolvedMode === 'manual' && isManualCpm
        ? 'Manual'
        : resolvedMode === 'auto' && computedCpmData.canCompute
          ? 'Automático'
          : resolvedMode === 'none'
            ? 'Sin usar'
            : 'Automático';

    const cycles = computedCpmData.cyclesConsidered ?? [];
    const displayCycles = [...cycles].sort((a, b) => {
      const parseSafe = (value) => {
        if (!value) return null;
        try {
          const parsed = parseISO(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
          return null;
        }
      };

      const startA = parseSafe(a.startDate);
      const startB = parseSafe(b.startDate);

      if (!startA && !startB) return 0;
      if (!startA) return 1;
      if (!startB) return -1;
      return startB - startA;
    });

    const canCompute = Boolean(computedCpmData.canCompute);
    const ignoredCount = computedCpmData.ignoredCount ?? 0;
    const deduction =
      typeof computedCpmData.deduction === 'number' && Number.isFinite(computedCpmData.deduction)
        ? computedCpmData.deduction
        : null;
    const shortestCycle = computedCpmData.shortestCycle ?? null;
    const automaticValue =
      typeof computedCpmData.value === 'number' && Number.isFinite(computedCpmData.value)
        ? computedCpmData.value
        : null;

    let summary;
    if (cycleCount === 0) {
      summary = ignoredCount > 0
        ? 'Todos los ciclos disponibles están ignorados para el cálculo automático.'
        : 'Aún no hay ciclos finalizados con fecha de finalización.';
    } else if (!canCompute) {
      summary = `Hay ${cyclesLabel} finalizado${cycleCount === 1 ? '' : 's'}. Se necesitan ${requiredCycles} para calcular el CPM automáticamente.`;
      if (ignoredCount > 0) {
        summary += ` (${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}).`;
      }
    } else {
      const cycleName =
        shortestCycle?.dateRangeLabel || shortestCycle?.displayName || shortestCycle?.name || 'Ciclo sin nombre';
      const durationText =
        typeof shortestCycle?.duration === 'number' && Number.isFinite(shortestCycle.duration)
          ? `${shortestCycle.duration} días`
          : 'duración desconocida';

      const parts = [
        `Calculado con ${cyclesLabel}.`,
        `Ciclo más corto: ${cycleName} (${durationText}).`,
      ];

      if (deduction !== null) {
        parts.push(`Deducción aplicada: ${deduction} días.`);
      }
      if (automaticValue !== null) {
        parts.push(`Resultado: ${automaticValue} días.`);
      }
      if (ignoredCount > 0) {
        parts.push(`${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}.`);
      }
      summary = parts.join(' ');
    }

    return {
      sourceLabel,
      summary,
      highlightLabel: cyclesLabel,
      cycleCount,
      requiredCycles,
      canCompute,
      detailsAvailable: displayCycles.length > 0,
      cycles: displayCycles,
      deduction,
      shortestCycle,
      value: automaticValue,
      ignoredCount,
    };
  }, [computedCpmData, cpmSelection, isManualCpm]);

  const t8Info = useMemo(() => {
    const cycleCount = computedT8Data.cycleCount;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const resolvedMode = ['auto', 'manual', 'none'].includes(t8Selection) ? t8Selection : 'auto';
    const sourceLabel =
      resolvedMode === 'manual' && isManualT8
        ? 'Manual'
        : resolvedMode === 'auto' && computedT8Data.canCompute
          ? 'Automático'
          : resolvedMode === 'none'
            ? 'Sin usar'
            : 'Automático';
    const ignoredCount = computedT8Data.ignoredCount ?? 0;

    let summary;
    if (cycleCount === 0) {
      summary = ignoredCount > 0
        ? 'Los ciclos disponibles están ignorados para el cálculo automático.'
        : 'Aún no hay ciclos con ovulación confirmada por temperatura.';
    } else if (!computedT8Data.canCompute) {
      summary = `Hay ${cyclesLabel} con ovulación confirmada por temperatura (se necesitan ${requiredCycles}).`;
      if (ignoredCount > 0) {
        summary += ` (${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}).`;
      }
    } else {
      const cycleName =
        computedT8Data.earliestCycle?.displayName || computedT8Data.earliestCycle?.name || 'Ciclo sin nombre';
      const riseDay = computedT8Data.earliestCycle?.riseDay;
      const dayText = typeof riseDay === 'number' && Number.isFinite(riseDay) ? `Día ${riseDay}` : 'día desconocido';
      const t8Day = computedT8Data.earliestCycle?.t8Day;
      const t8Text = typeof t8Day === 'number' && Number.isFinite(t8Day) ? `T-8 Día ${t8Day}` : null;

      summary = `Calculado con ${cyclesLabel}. Subida más temprana: ${cycleName} (${dayText})${t8Text ? `. ${t8Text}.` : '.'}`;
      if (ignoredCount > 0) {
        summary += ` ${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}.`;
      }
    }

    return {
      sourceLabel,
      summary,
      highlightLabel: cyclesLabel,
      cycleCount,
      requiredCycles,
      canCompute: Boolean(computedT8Data.canCompute),
      value: typeof computedT8Data.value === 'number' && Number.isFinite(computedT8Data.value) ? computedT8Data.value : null,
      ignoredCount,
    };
  }, [computedT8Data, isManualT8, t8Selection]);

  const handleToggleCycleIgnore = useCallback(async (cycleId, shouldIgnore) => {
    if (!cycleId) return;
    setPendingIgnoredCycleIds((p) => (p.includes(cycleId) ? p : [...p, cycleId]));
    try {
      await setCycleIgnoreForAutoCalculations(cycleId, shouldIgnore);
      toast?.({ title: shouldIgnore ? 'Ciclo ignorado' : 'Ciclo incluido', description: shouldIgnore ? 'El ciclo se excluyó del cálculo automático.' : 'El ciclo se volvió a incluir en el cálculo automático.' });
    } finally {
      setPendingIgnoredCycleIds((p) => p.filter((id) => id !== cycleId));
    }
  }, [setCycleIgnoreForAutoCalculations, toast]);

  const handleOpenCpmDialog = useCallback(() => {
    const automaticBase = typeof computedCpmData.shortestCycle?.duration === 'number' ? computedCpmData.shortestCycle.duration : null;
    const automaticFinal = typeof computedCpmData.value === 'number' ? computedCpmData.value : null;
    const initialBase = isManualCpm && typeof manualCpmBaseValue === 'number' ? manualCpmBaseValue : automaticBase;
    const initialFinal = isManualCpm && typeof manualCpmValue === 'number' ? manualCpmValue : automaticFinal;
    setManualCpmBaseInput(initialBase != null ? String(initialBase) : '');
    setManualCpmFinalInput(initialFinal != null ? String(initialFinal) : '');
    setManualCpmBaseError(''); setManualCpmFinalError(''); setManualCpmEditedSide(null); setCpmSelectionDraft(cpmSelection); setShowCpmDetails(false); setIsCpmDialogOpen(true);
  }, [computedCpmData, cpmSelection, isManualCpm, manualCpmBaseValue, manualCpmValue]);

  const handleCloseCpmDialog = useCallback(() => { setShowCpmDetails(false); setShowCpmDeleteDialog(false); setIsDeletingManualCpm(false); setIsCpmDialogOpen(false); }, []);
  const handleManualCpmBaseInputChange = useCallback((event) => {
    const value = event.target.value; setManualCpmBaseInput(value); setManualCpmEditedSide('base'); setManualCpmBaseError(''); setManualCpmFinalError('');
    if (!value.trim()) return void setManualCpmFinalInput('');
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return void setManualCpmBaseError('El ciclo más corto debe ser ≥ 1');
    setManualCpmFinalInput(String(Math.max(1, parsed - MANUAL_CPM_DEDUCTION)));
  }, []);
  const handleManualCpmFinalInputChange = useCallback((event) => {
    const value = event.target.value; setManualCpmFinalInput(value); setManualCpmEditedSide('final'); setManualCpmFinalError(''); setManualCpmBaseError('');
    if (!value.trim()) return;
    const parsed = Number.parseFloat(value.replace(',', '.')); if (!Number.isFinite(parsed) || parsed < 1) setManualCpmFinalError('El CPM debe ser ≥ 1');
  }, []);

  const handleSaveManualCpm = useCallback(async () => {
    if (manualCpmBaseError || manualCpmFinalError) return false;
    const trimmedBase = manualCpmBaseInput.trim(); const trimmedFinal = manualCpmFinalInput.trim(); const side = manualCpmEditedSide ?? (trimmedFinal ? 'final' : trimmedBase ? 'base' : null);
    if (!side) {
      setManualCpmFinalError('Introduce un valor.');
      return false;
    }
    let baseValueToPersist = manualCpmBaseValue; let finalValueToPersist;
    if (side === 'base') { const parsedBase = Number.parseInt(trimmedBase, 10); if (!Number.isFinite(parsedBase) || parsedBase < 1) return false; baseValueToPersist = parsedBase; finalValueToPersist = Math.max(1, parsedBase - MANUAL_CPM_DEDUCTION); }
    else { const parsedFinal = Number.parseFloat(trimmedFinal.replace(',', '.')); if (!Number.isFinite(parsedFinal) || parsedFinal < 1) return false; finalValueToPersist = parsedFinal; baseValueToPersist = trimmedBase ? Number.parseInt(trimmedBase, 10) : null; }
    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;
    const previousBaseValue = manualCpmBaseValue;

    setManualCpmValue(finalValueToPersist);
    setIsManualCpm(true);
    setManualCpmBaseValue(Number.isFinite(baseValueToPersist) ? baseValueToPersist : null);

    try {
      await persistManualCpm({ finalValue: finalValueToPersist, baseValue: baseValueToPersist });
      setIsCpmDialogOpen(false);
      toast?.({ title: 'CPM actualizado', description: 'El CPM manual se guardó en tu perfil.' });
      return true;
    } catch (error) {
      console.error('Failed to save manual CPM value', error);
      setManualCpmValue(previousValue);
      setManualCpmBaseValue(previousBaseValue);
      setIsManualCpm(previousIsManual);
      setManualCpmFinalError('No se pudo guardar el CPM. Inténtalo de nuevo.');
      return false;
    }
  }, [isManualCpm, manualCpmBaseError, manualCpmBaseInput, manualCpmBaseValue, manualCpmEditedSide, manualCpmFinalError, manualCpmFinalInput, manualCpmValue, persistManualCpm, toast]);

  const handleSaveCpm = useCallback(async () => {
    if (cpmSelectionDraft === 'manual') { if (!(await handleSaveManualCpm())) return; setCpmSelection('manual'); setCpmSelectionDraft('manual'); await persistCpmMode('manual'); return; }
    const nextMode = ['auto', 'none'].includes(cpmSelectionDraft) ? cpmSelectionDraft : 'auto';
    setCpmSelection(nextMode);
    setCpmSelectionDraft(nextMode);
    await persistCpmMode(nextMode);
    handleCloseCpmDialog();

    toast?.({
      title: 'CPM actualizado',
      description: nextMode === 'auto' ? 'Ahora se usa el cálculo automático del CPM.' : 'El CPM ya no se tendrá en cuenta.',
    });
  }, [cpmSelectionDraft, handleCloseCpmDialog, handleSaveManualCpm, persistCpmMode, toast]);

  const handleDeleteManualCpm = useCallback(async () => {
    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;
    const previousBaseValue = manualCpmBaseValue;

    setManualCpmValue(null);
    setManualCpmBaseValue(null);
    setIsManualCpm(false);
    setManualCpmBaseInput('');
    setManualCpmFinalInput('');
    setManualCpmBaseError('');
    setManualCpmFinalError('');
    setManualCpmEditedSide(null);

    try {
      await persistManualCpm({ finalValue: null, baseValue: null });
      toast?.({
        title: 'CPM borrado',
        description: 'El valor manual se eliminó. Puedes guardar un nuevo valor o continuar con el cálculo automático.',
      });
    } catch (error) {
      console.error('Failed to delete manual CPM value', error);
      setManualCpmValue(previousValue);
      setManualCpmBaseValue(previousBaseValue);
      setIsManualCpm(previousIsManual);
      setManualCpmFinalError('No se pudo borrar el CPM. Inténtalo de nuevo.');
    }
  }, [isManualCpm, manualCpmBaseValue, manualCpmValue, persistManualCpm, toast]);

  const handleConfirmCpmDelete = useCallback(async () => {
    setIsDeletingManualCpm(true);
    try { await handleDeleteManualCpm(); setShowCpmDeleteDialog(false); const nextMode = cpmInfo.canCompute ? 'auto' : 'none'; setCpmSelection(nextMode); setCpmSelectionDraft(nextMode); await persistCpmMode(nextMode); } finally { setIsDeletingManualCpm(false); }
  }, [cpmInfo.canCompute, handleDeleteManualCpm, persistCpmMode]);

  const handleOpenT8Dialog = useCallback(() => {
    const initialBase = isManualT8 && typeof manualT8BaseValue === 'number' ? manualT8BaseValue : null;
    const initialFinal = isManualT8 && typeof manualT8Value === 'number' ? manualT8Value : null;
    setManualT8BaseInput(initialBase != null ? String(initialBase) : ''); setManualT8FinalInput(initialFinal != null ? String(initialFinal) : '');
    setManualT8BaseError(''); setManualT8FinalError(''); setManualT8EditedSide(null); setT8SelectionDraft(t8Selection); setShowT8Details(false); setIsT8DialogOpen(true);
  }, [isManualT8, manualT8BaseValue, manualT8Value, t8Selection]);

  const handleCloseT8Dialog = useCallback(() => { setIsT8DialogOpen(false); setShowT8Details(false); setShowT8DeleteDialog(false); setIsDeletingManualT8(false); }, []);
  const handleManualT8BaseInputChange = useCallback((event) => {
    const value = event.target.value; setManualT8BaseInput(value); setManualT8EditedSide('base'); setManualT8BaseError(''); setManualT8FinalError('');
    if (!value.trim()) return void setManualT8FinalInput('');
    const parsed = Number.parseInt(value, 10); if (!Number.isFinite(parsed) || parsed < 1) return void setManualT8BaseError('Introduce un número entero válido.');
    setManualT8FinalInput(String(Math.max(1, parsed - 8)));
  }, []);
  const handleManualT8FinalInputChange = useCallback((event) => { const value = event.target.value; setManualT8FinalInput(value); setManualT8EditedSide('final'); setManualT8FinalError(''); setManualT8BaseError(''); if (value.trim() && (!Number.isFinite(Number.parseInt(value, 10)) || Number.parseInt(value, 10) < 1)) setManualT8FinalError('El T-8 debe ser ≥ 1'); }, []);

  const handleSaveManualT8 = useCallback(async () => {
    if (manualT8BaseError || manualT8FinalError) return false;
    const trimmedBase = manualT8BaseInput.trim(); const trimmedFinal = manualT8FinalInput.trim(); const side = manualT8EditedSide ?? (trimmedFinal ? 'final' : trimmedBase ? 'base' : null);
    if (!side) {
      setManualT8FinalError('Introduce un valor.');
      return false;
    }
    let baseValueToPersist = manualT8BaseValue; let finalValueToPersist;
    if (side === 'base') { const parsedBase = Number.parseInt(trimmedBase, 10); if (!Number.isFinite(parsedBase) || parsedBase < 1) return false; baseValueToPersist = parsedBase; finalValueToPersist = Math.max(1, parsedBase - 8); }
    else { const parsedFinal = Number.parseInt(trimmedFinal, 10); if (!Number.isFinite(parsedFinal) || parsedFinal < 1) return false; finalValueToPersist = parsedFinal; baseValueToPersist = trimmedBase ? Number.parseInt(trimmedBase, 10) : null; }
    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;
    const previousBaseValue = manualT8BaseValue;

    setManualT8Value(finalValueToPersist);
    setIsManualT8(true);
    setManualT8BaseValue(Number.isFinite(baseValueToPersist) ? baseValueToPersist : null);

    try {
      await persistManualT8({ finalValue: finalValueToPersist, baseValue: baseValueToPersist });
      setIsT8DialogOpen(false);
      toast?.({ title: 'T-8 actualizado', description: 'El T-8 manual se guardó en tu perfil.' });
      return true;
    } catch (error) {
      console.error('Failed to save manual T-8 value', error);
      setManualT8Value(previousValue);
      setManualT8BaseValue(previousBaseValue);
      setIsManualT8(previousIsManual);
      setManualT8FinalError('No se pudo guardar el T-8. Inténtalo de nuevo.');
      return false;
    }
  }, [isManualT8, manualT8BaseError, manualT8BaseInput, manualT8BaseValue, manualT8EditedSide, manualT8FinalError, manualT8FinalInput, manualT8Value, persistManualT8, toast]);

  const handleSaveT8 = useCallback(async () => {
    if (t8SelectionDraft === 'manual') { if (!(await handleSaveManualT8())) return; setT8Selection('manual'); setT8SelectionDraft('manual'); await persistT8Mode('manual'); return; }
    const nextMode = ['auto', 'none'].includes(t8SelectionDraft) ? t8SelectionDraft : 'auto';
    setT8Selection(nextMode);
    setT8SelectionDraft(nextMode);
    await persistT8Mode(nextMode);
    handleCloseT8Dialog();

    toast?.({
      title: 'T-8 actualizado',
      description: nextMode === 'auto' ? 'Ahora se usa el cálculo automático del T-8.' : 'El T-8 ya no se tendrá en cuenta.',
    });
  }, [handleCloseT8Dialog, handleSaveManualT8, persistT8Mode, t8SelectionDraft, toast]);

  const handleDeleteManualT8 = useCallback(async () => {
    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;
    const previousBaseValue = manualT8BaseValue;

    setManualT8Value(null);
    setManualT8BaseValue(null);
    setIsManualT8(false);
    setManualT8BaseInput('');
    setManualT8FinalInput('');
    setManualT8BaseError('');
    setManualT8FinalError('');
    setManualT8EditedSide(null);

    try {
      await persistManualT8({ finalValue: null, baseValue: null });
      toast?.({
        title: 'T-8 borrado',
        description: 'El valor manual se eliminó. Puedes guardar un nuevo valor o continuar con el cálculo automático.',
      });
    } catch (error) {
      console.error('Failed to delete manual T-8 value', error);
      setManualT8Value(previousValue);
      setManualT8BaseValue(previousBaseValue);
      setIsManualT8(previousIsManual);
      setManualT8BaseError('No se pudo borrar el T-8. Inténtalo de nuevo.');
    }
  }, [isManualT8, manualT8BaseValue, manualT8Value, persistManualT8, toast]);

  const handleConfirmT8Delete = useCallback(async () => {
    setIsDeletingManualT8(true);
    try { await handleDeleteManualT8(); setShowT8DeleteDialog(false); const nextMode = computedT8Data.canCompute ? 'auto' : 'none'; setT8Selection(nextMode); setT8SelectionDraft(nextMode); await persistT8Mode(nextMode); } finally { setIsDeletingManualT8(false); }
  }, [computedT8Data.canCompute, handleDeleteManualT8, persistT8Mode]);

  const isCpmSaveDisabled = cpmSelectionDraft === 'manual' && (!!manualCpmBaseError || !!manualCpmFinalError || (!manualCpmBaseInput.trim() && !manualCpmFinalInput.trim()));
  const isT8SaveDisabled = t8SelectionDraft === 'manual' && (!!manualT8BaseError || !!manualT8FinalError || (!manualT8BaseInput.trim() && !manualT8FinalInput.trim()));

  return {
    cpmMetric,
    t8Metric,
    computedCpmData,
    computedT8Data,
    cpmInfo,
    t8Info,
    cpmSelection,
    t8Selection,
    manualCpmValue,
    manualCpmBaseValue,
    manualT8Value,
    manualT8BaseValue,
    handleOpenCpmDialog,
    handleOpenT8Dialog,
    handleToggleCycleIgnore,
    pendingIgnoredCycleIds,
    dialogs: {
      isCpmDialogOpen,
      isT8DialogOpen,
      showCpmDeleteDialog,
      showT8DeleteDialog,
      setShowCpmDeleteDialog,
      setShowT8DeleteDialog,
      showCpmDetails,
      showT8Details,
      setShowCpmDetails,
      setShowT8Details,
      cpmSelectionDraft,
      t8SelectionDraft,
      setCpmSelectionDraft,
      setT8SelectionDraft,
      manualCpmBaseInput,
      manualCpmFinalInput,
      manualCpmBaseError,
      manualCpmFinalError,
      manualCpmEditedSide,
      manualT8BaseInput,
      manualT8FinalInput,
      manualT8BaseError,
      manualT8FinalError,
      manualT8EditedSide,
      isManualCpm,
      isManualT8,
      isDeletingManualCpm,
      isDeletingManualT8,
      isCpmSaveDisabled,
      isT8SaveDisabled,
      canDeleteManualCpm: Boolean(isManualCpm || manualCpmBaseInput.trim() || manualCpmFinalInput.trim()),
      canDeleteManualT8: Boolean(isManualT8 || manualT8BaseInput.trim() || manualT8FinalInput.trim()),
      cpmStatusMode: cpmSelection === 'manual' && isManualCpm ? 'manual' : cpmSelection === 'none' ? 'none' : 'auto',
      cpmStatusChipLabel: cpmSelection === 'manual' && isManualCpm ? 'Manual' : cpmSelection === 'none' ? 'Sin usar' : 'Automático',
      t8StatusMode: t8Selection === 'manual' && isManualT8 ? 'manual' : t8Selection === 'none' ? 'none' : 'auto',
      t8StatusChipLabel: t8Selection === 'manual' && isManualT8 ? 'Manual' : t8Selection === 'none' ? 'Sin usar' : 'Automático',
      cpmAutomaticValueLabel: typeof cpmInfo.value === 'number' && Number.isFinite(cpmInfo.value) ? cpmInfo.value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—',
      t8AutomaticValueLabel: typeof t8Info.value === 'number' && Number.isFinite(t8Info.value) ? t8Info.value : '—',
      handleCloseCpmDialog,
      handleCloseT8Dialog,
      handleManualCpmBaseInputChange,
      handleManualCpmFinalInputChange,
      handleManualT8BaseInputChange,
      handleManualT8FinalInputChange,
      handleSaveCpm,
      handleSaveT8,
      handleConfirmCpmDelete,
      handleConfirmT8Delete,
    },
  };
};
