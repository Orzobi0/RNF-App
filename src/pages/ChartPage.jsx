import React, {
  useState,
  useLayoutEffect,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { RotateCcw, Eye, EyeOff, ArrowLeft, Settings, X, PencilLine } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import DataEntryForm from '@/components/DataEntryForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  computeCpmCandidateFromCycles,
  computeT8CandidateFromCycles,
} from '@/lib/fertilityStart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useParams, Link, useLocation } from 'react-router-dom';
import Overlay from '@/components/ui/Overlay';
import { useAuth } from '@/contexts/AuthContext';
import { computeOvulationMetrics } from '@/hooks/useFertilityChart';

const CHART_SETTINGS_STORAGE_KEY = 'fertility-chart-settings';

const normalizeCalculatorSource = (source) => {
  if (!source) return '';
  return String(source).toUpperCase().replace(/-/g, '');
};

const formatCalculatorSourceLabel = (source) => {
  const normalized = normalizeCalculatorSource(source);
  if (normalized === 'T8') {
    return 'T-8';
  }
  if (normalized === 'CPM') {
    return 'CPM';
  }
  return source ?? '';
};

const createDefaultFertilityStartConfig = () => ({
  calculators: { cpm: true, t8: true },
  postpartum: false,
  combineMode: 'estandar',
});

const DEFAULT_CHART_SETTINGS = {
  showRelationsRow: true,
  fertilityStartConfig: createDefaultFertilityStartConfig(),
};

const FERTILITY_CALCULATOR_OPTIONS = [
  { key: 'cpm', label: 'CPM' },
  { key: 't8', label: 'T-8' },
];

const COMBINE_MODE_LABELS = {
  conservador: 'Conservador',
  estandar: 'Estándar',
};

const mergeFertilityStartConfig = (incoming) => {
  const base = createDefaultFertilityStartConfig();
  const merged = {
    calculators: { ...base.calculators },
    postpartum: base.postpartum,
    combineMode: base.combineMode,
  };

  if (incoming && typeof incoming === 'object') {
    Object.keys(merged.calculators).forEach((key) => {
      if (typeof incoming?.calculators?.[key] === 'boolean') {
        merged.calculators[key] = incoming.calculators[key];
      }
    });

    if (Object.prototype.hasOwnProperty.call(COMBINE_MODE_LABELS, incoming.combineMode)) {
      merged.combineMode = incoming.combineMode;
    }

    if (typeof incoming.postpartum === 'boolean') {
      merged.postpartum = incoming.postpartum;
    } else if (incoming.postpartum != null) {
      merged.postpartum = Boolean(incoming.postpartum);
    }    
  }

  return merged;
};

const INTERPRETATION_MODE_LABELS = {
  estandar: 'Estándar',
  conservador: 'Conservador',
};

const INTERPRETATION_SECTIONS = [
  {
    key: 'relativeInfertile',
    title: 'Fase Relativamente infértil',
    fields: [
      { key: 'start', label: 'Inicio' },
      { key: 'end', label: 'Fin' },
    ],
  },
  {
    key: 'fertile',
    title: 'Fase Fértil',
    fields: [
      { key: 'start', label: 'Inicio' },
      { key: 'end', label: 'Fin' },
    ],
  },
  {
    key: 'infertile',
    title: 'Fase Infértil',
    fields: [
      { key: 'peak', label: 'Infertilidad por moco' },
      { key: 'thermalShift', label: 'Infertilidad por temperatura' },
      { key: 'start', label: 'Infertilidad absoluta' },
    ],
  },
];

const normalizeInterpretationOverrides = (overrides = {}) => ({
  relativeInfertile: { ...(overrides?.relativeInfertile ?? {}) },
  fertile: { ...(overrides?.fertile ?? {}) },
  infertile: { ...(overrides?.infertile ?? {}) },
});

const resolveInterpretationValues = (suggestions = {}, overrides = {}) => {
  const resolved = {
    relativeInfertile: {
      start: Number.isInteger(overrides?.relativeInfertile?.start)
        ? overrides.relativeInfertile.start
        : Number.isInteger(suggestions?.relativeInfertile?.start)
          ? suggestions.relativeInfertile.start
          : null,
      end: Number.isInteger(overrides?.relativeInfertile?.end)
        ? overrides.relativeInfertile.end
        : Number.isInteger(suggestions?.relativeInfertile?.end)
          ? suggestions.relativeInfertile.end
          : null,
    },
    fertile: {
      start: Number.isInteger(overrides?.fertile?.start)
        ? overrides.fertile.start
        : Number.isInteger(suggestions?.fertile?.start)
          ? suggestions.fertile.start
          : null,
      end: Number.isInteger(overrides?.fertile?.end)
        ? overrides.fertile.end
        : Number.isInteger(suggestions?.fertile?.end)
          ? suggestions.fertile.end
          : null,
    },
    infertile: {
      peak: Number.isInteger(overrides?.infertile?.peak)
        ? overrides.infertile.peak
        : Number.isInteger(suggestions?.infertile?.peak)
          ? suggestions.infertile.peak
          : null,
      thermalShift: Number.isInteger(overrides?.infertile?.thermalShift)
        ? overrides.infertile.thermalShift
        : Number.isInteger(suggestions?.infertile?.thermalShift)
          ? suggestions.infertile.thermalShift
          : null,
      start: Number.isInteger(overrides?.infertile?.start)
        ? overrides.infertile.start
        : Number.isInteger(suggestions?.infertile?.start)
          ? suggestions.infertile.start
          : null,
    },
  };

  const hasManual = (sectionKey, fieldKey) =>
    Number.isInteger(overrides?.[sectionKey]?.[fieldKey]);

  const clampDay = (value) => (Number.isInteger(value) && value > 0 ? value : null);

  if (hasManual('relativeInfertile', 'end') && !hasManual('fertile', 'start')) {
    resolved.fertile.start = clampDay(resolved.relativeInfertile.end + 1);
  }

  if (hasManual('fertile', 'start') && !hasManual('relativeInfertile', 'end')) {
    resolved.relativeInfertile.end = clampDay(resolved.fertile.start - 1);
  }

  if (hasManual('fertile', 'end') && !hasManual('infertile', 'start')) {
    resolved.infertile.start = clampDay(resolved.fertile.end + 1);
  }

  if (hasManual('infertile', 'start') && !hasManual('fertile', 'end')) {
    resolved.fertile.end = clampDay(resolved.infertile.start - 1);
  }

  return resolved;
};

const ChartPage = () => {
  const { cycleId } = useParams();
  const location = useLocation();
  const {
    currentCycle,
    archivedCycles,
    isLoading,
    addOrUpdateDataPoint,
    toggleIgnoreRecord,
    getCycleById,
    updateCycleInterpretation
  } = useCycleData();

  const [fetchedCycle, setFetchedCycle] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isViewingCurrentCycle = !cycleId || cycleId === currentCycle?.id;
  const archivedMatch = !isViewingCurrentCycle
    ? archivedCycles.find((cycle) => cycle.id === cycleId)
    : null;

  useEffect(() => {
    if (isViewingCurrentCycle) {
      setFetchedCycle(null);
      setExternalLoading(false);
      setNotFound(false);
      return;
    }

    if (archivedMatch) {
      setFetchedCycle(null);
      setExternalLoading(false);
      setNotFound(false);
      return;
    }

    let isMounted = true;
    setExternalLoading(true);
    getCycleById(cycleId)
      .then((cycle) => {
        if (!isMounted) return;
        if (cycle) {
          setFetchedCycle(cycle);
          setNotFound(false);
        } else {
          setFetchedCycle(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setFetchedCycle(null);
        setNotFound(true);
      })
      .finally(() => {
        if (isMounted) {
          setExternalLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isViewingCurrentCycle, archivedMatch, getCycleById, cycleId]);

  const targetCycle = isViewingCurrentCycle ? currentCycle : archivedMatch || fetchedCycle;
  const isUsingFallbackCycle = !isViewingCurrentCycle && !archivedMatch;
  const showBackToCycleRecords = !isViewingCurrentCycle && targetCycle?.id;
  const showLoading = isViewingCurrentCycle
    ? isLoading && !currentCycle?.id
    : externalLoading || (isLoading && !archivedMatch && !fetchedCycle);

  const { preferences, savePreferences } = useAuth();
  const manualCpmPreference = preferences?.manualCpm;
  const manualCpmBasePreference = preferences?.manualCpmBase;
  const manualT8Preference = preferences?.manualT8;
  const manualT8BasePreference = preferences?.manualT8Base;
  const cpmSelection = ['auto', 'manual', 'none'].includes(preferences?.cpmMode)
    ? preferences.cpmMode
    : 'auto';
  const t8Selection = ['auto', 'manual', 'none'].includes(preferences?.t8Mode)
    ? preferences.t8Mode
    : 'auto';
    
  const archivedCycleTitle = useMemo(() => {
    if (!showBackToCycleRecords || !targetCycle?.startDate) {
      return '';
    }

    const formatDate = (date) => {
      if (!date) return null;
      try {
        return format(parseISO(date), 'dd/MM/yyyy');
      } catch (error) {
        console.error('Error formatting cycle date', error);
        return date;
      }
    };

    const start = formatDate(targetCycle.startDate);
    const end = formatDate(targetCycle.endDate) ?? 'Sin fecha de fin';

    if (!start) {
      return '';
    }

    return `Ciclo ${start} - ${end}`;
  }, [showBackToCycleRecords, targetCycle?.startDate, targetCycle?.endDate]);
  const fertilityCalculatorCycles = useMemo(() => {
    const cycles = [];
    if (Array.isArray(archivedCycles) && archivedCycles.length > 0) {
      cycles.push(...archivedCycles);
    }
    if (currentCycle?.id) {
      cycles.push(currentCycle);
    }
    if (targetCycle?.id && !cycles.some((cycle) => cycle?.id === targetCycle.id)) {
      cycles.push(targetCycle);
    }
    return cycles;
  }, [archivedCycles, currentCycle, targetCycle]);
  // Orientación controlada por UI, independiente del dispositivo
  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [forceLandscape, setForceLandscape] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [interpretationModalOpen, setInterpretationModalOpen] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState(null);
  const [interpretationOverrides, setInterpretationOverrides] = useState(
    () => normalizeInterpretationOverrides()
  );
  const [currentInterpretationMode, setCurrentInterpretationMode] = useState('estandar');
  const [interpretationSource, setInterpretationSource] = useState({
    fertilityStart: null,
    ovulationDetails: null,
  });
  const [isSavingInterpretation, setIsSavingInterpretation] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phaseOverlay, setPhaseOverlay] = useState(null);
  const [chartSettings, setChartSettings] = useState(() => {
    const defaults = {
      showRelationsRow: DEFAULT_CHART_SETTINGS.showRelationsRow,
      fertilityStartConfig: mergeFertilityStartConfig(DEFAULT_CHART_SETTINGS.fertilityStartConfig),
    };

    if (typeof window === 'undefined') {
      return defaults;
    }
    try {
      const stored = window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = {
          ...defaults,
          ...parsed,
        };
        if (typeof parsed?.showRelationsRow === 'boolean') {
          merged.showRelationsRow = parsed.showRelationsRow;
        } else if (parsed?.showRelationsRow != null) {
          merged.showRelationsRow = Boolean(parsed.showRelationsRow);
        }
        merged.fertilityStartConfig = mergeFertilityStartConfig(parsed?.fertilityStartConfig);
        return merged;
      }
    } catch (error) {
      console.warn('No se pudieron cargar los ajustes del gráfico.', error);
    }
    
    return defaults;
  });
  
  useEffect(() => {
    if (!preferences) return;

    setChartSettings((prev) => {
      const currentConfig = prev.fertilityStartConfig ?? createDefaultFertilityStartConfig();
      const nextConfig = { ...currentConfig };
      let changed = false;

      if (typeof preferences.showRelationsRow === 'boolean' && prev.showRelationsRow !== preferences.showRelationsRow) {
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(COMBINE_MODE_LABELS, preferences.combineMode)) {
        if (currentConfig.combineMode !== preferences.combineMode) {
          nextConfig.combineMode = preferences.combineMode;
          changed = true;
        }
      }

      if (!changed) return prev;

      return {
        ...prev,
        showRelationsRow: typeof preferences.showRelationsRow === 'boolean'
          ? preferences.showRelationsRow
          : prev.showRelationsRow,
        fertilityStartConfig: nextConfig,
      };
    });
  }, [preferences]);
  const fertilityConfig = useMemo(
    () => mergeFertilityStartConfig(chartSettings.fertilityStartConfig),
    [chartSettings.fertilityStartConfig]
  );

  const fertilityStartConfig = useMemo(
    () => ({
      ...fertilityConfig,
      calculators: {
        ...fertilityConfig.calculators,
        cpm: fertilityConfig.calculators.cpm && cpmSelection !== 'none',
        t8: fertilityConfig.calculators.t8 && t8Selection !== 'none',
      },
    }),
    [fertilityConfig, cpmSelection, t8Selection]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const payload = { ...chartSettings, fertilityStartConfig: fertilityConfig };
      window.localStorage.setItem(
        CHART_SETTINGS_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch (error) {
      console.warn('No se pudieron guardar los ajustes del gráfico.', error);
    }
  }, [chartSettings, fertilityConfig]);



  const handleInterpretationData = useCallback((data) => {
    setInterpretationSource(data);
  }, []);

  const ignoreNextClickRef = useRef(false);
  const keepFormOpenUntilRef = useRef(0);
  const bodyOverflowRef = useRef(null);
  const htmlOverflowRef = useRef(null);
  const isPlaceholderRecord = Boolean(
    editingRecord && String(editingRecord.id || '').startsWith('placeholder-')
  );
  
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const body = document.body;
    const html = document.documentElement;

    if (isFullScreen) {
      if (bodyOverflowRef.current === null) {
        bodyOverflowRef.current = body.style.overflow;
      }
      if (htmlOverflowRef.current === null) {
        htmlOverflowRef.current = html.style.overflow;
      }
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
      return undefined;
    }

    if (bodyOverflowRef.current !== null) {
      body.style.overflow = bodyOverflowRef.current;
      bodyOverflowRef.current = null;
    }
    if (htmlOverflowRef.current !== null) {
      html.style.overflow = htmlOverflowRef.current;
      htmlOverflowRef.current = null;
    }
    return () => {
      if (bodyOverflowRef.current !== null) {
        body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
      if (htmlOverflowRef.current !== null) {
        html.style.overflow = htmlOverflowRef.current;
        htmlOverflowRef.current = null;
      }
    };
  }, [isFullScreen]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('resize'));
  }, [orientation, isFullScreen]);
  
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOrientationChange = () => {
      if (forceLandscape) return;
      const nextOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      setOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    handleOrientationChange();

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [forceLandscape]);
  
  const CYCLE_DURATION_DAYS = 28;
  const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;
  const VISIBLE_DAYS_FULLSCREEN_LANDSCAPE = 25;

  const cycleEntries = Array.isArray(targetCycle?.data) ? targetCycle.data : [];
  let cycleStartDate = startOfDay(new Date());
  try {
    if (targetCycle?.startDate) {
      cycleStartDate = parseISO(targetCycle.startDate);
    }
  } catch (error) {
    console.warn('startDate inválida en targetCycle', targetCycle?.startDate, error);
  }
  const confirmedInterpretation = targetCycle?.interpretation ?? null;
  const cycleDataVersion = useMemo(() => {
    const payload = (cycleEntries ?? []).map((entry) => ({
      id: entry?.id ?? null,
      isoDate: entry?.isoDate ?? entry?.iso_date ?? null,
      temperature_chart: entry?.temperature_chart ?? null,
      temperature_raw: entry?.temperature_raw ?? null,
      temperature_corrected: entry?.temperature_corrected ?? null,
      use_corrected: entry?.use_corrected ?? null,
      mucusSensation: entry?.mucusSensation ?? entry?.mucus_sensation ?? null,
      mucusAppearance: entry?.mucusAppearance ?? entry?.mucus_appearance ?? null,
      fertility_symbol: entry?.fertility_symbol ?? null,
      observations: entry?.observations ?? null,
      ignored: entry?.ignored ?? null,
      peak_marker: entry?.peak_marker ?? null,
      had_relations: entry?.had_relations ?? entry?.hadRelations ?? null,
      measurements: entry?.measurements ?? null,
    }));
    return JSON.stringify(payload);
  }, [cycleEntries]);
  const interpretationSuggestions = useMemo(() => {
    const fertilityStart = interpretationSource?.fertilityStart ?? null;
    const ovulationDetails = interpretationSource?.ovulationDetails ?? null;
    const toCycleDay = (index) => (Number.isInteger(index) ? index + 1 : null);
    const fertileStartIndex = Number.isInteger(fertilityStart?.autoFertilityStart)
      ? fertilityStart.autoFertilityStart
      : Number.isInteger(fertilityStart?.fertileStartFinalIndex)
        ? fertilityStart.fertileStartFinalIndex
        : null;
    const relativeEndIndex =
      Number.isInteger(fertileStartIndex) && fertileStartIndex > 0
        ? fertileStartIndex - 1
        : null;
    const postOvulatoryStartIndex = Number.isInteger(fertilityStart?.debug?.postOvulatoryStartIndex)
      ? fertilityStart.debug.postOvulatoryStartIndex
      : null;
    const fertileEndIndex = Number.isInteger(fertilityStart?.autoFertilityEnd)
      ? fertilityStart.autoFertilityEnd
      : Number.isInteger(fertilityStart?.fertileWindow?.endIndex)
        ? fertilityStart.fertileWindow.endIndex
        : Number.isInteger(postOvulatoryStartIndex)
          ? postOvulatoryStartIndex - 1
          : null;
    const peakDayIndex = Number.isInteger(ovulationDetails?.peakDayIndex)
      ? ovulationDetails.peakDayIndex
      : null;
    const thermalShiftIndex = Number.isInteger(fertilityStart?.debug?.temperatureConfirmationIndex)
      ? fertilityStart.debug.temperatureConfirmationIndex
      : Number.isInteger(ovulationDetails?.confirmationIndex)
        ? ovulationDetails.confirmationIndex
        : null;

    return {
      relativeInfertile: {
        start: 1,
        end: toCycleDay(relativeEndIndex),
      },
      fertile: {
        start: toCycleDay(fertileStartIndex),
        end: toCycleDay(fertileEndIndex),
      },
      infertile: {
        peak: toCycleDay(peakDayIndex),
        thermalShift: toCycleDay(thermalShiftIndex),
        start: toCycleDay(postOvulatoryStartIndex),
      },
    };
  }, [interpretationSource]);
  const resolvedInterpretation = useMemo(
    () => resolveInterpretationValues(interpretationSuggestions, interpretationOverrides),
    [interpretationSuggestions, interpretationOverrides]
  );
  const hasValidConfirmation = useMemo(() => {
    if (!confirmedInterpretation?.confirmed) return false;
    return (
      confirmedInterpretation.confirmedDataVersion === cycleDataVersion &&
      confirmedInterpretation.confirmedMode === currentInterpretationMode
    );
  }, [confirmedInterpretation, cycleDataVersion, currentInterpretationMode]);

  useEffect(() => {
    if (!targetCycle?.id || interpretationModalOpen) {
      return;
    }
    setInterpretationOverrides(
      normalizeInterpretationOverrides(confirmedInterpretation?.overrides)
    );
    setCurrentInterpretationMode(
      confirmedInterpretation?.confirmedMode ?? 'estandar'
    );
  }, [
    targetCycle?.id,
    interpretationModalOpen,
    confirmedInterpretation?.confirmedMode,
    confirmedInterpretation?.overrides,
  ]);
    useEffect(() => {
    if (showInterpretation && !hasValidConfirmation) {
      setShowInterpretation(false);
    }
  }, [showInterpretation, hasValidConfirmation]);


  const peakRecord = Array.isArray(cycleEntries)
    ? cycleEntries.find((record) => record?.peak_marker === 'peak')
    : null;
  const currentPeakIsoDate = peakRecord?.isoDate || null;

  const lastRecordDate = cycleEntries.reduce((maxDate, record) => {
    const recDate = parseISO(record.isoDate);
    return recDate > maxDate ? recDate : maxDate;
  }, cycleStartDate);

  const today = startOfDay(new Date());
  const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
  const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
  const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

  const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);
  const mergedData = fullCyclePlaceholders.map((placeholder) => {
    const existingRecord = cycleEntries.find((d) => d.isoDate === placeholder.isoDate);
    return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
  });

  const visualOrientation = forceLandscape ? 'landscape' : orientation;
  const visibleDays = isFullScreen
    ? (visualOrientation === 'portrait'
        ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
        : VISIBLE_DAYS_FULLSCREEN_LANDSCAPE)
    : (visualOrientation === 'portrait'
      ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
      : CYCLE_DURATION_DAYS);
  let scrollStart = 0;

  if (visualOrientation !== 'landscape') {
    const daysSinceCycleStart = differenceInDays(new Date(), startOfDay(cycleStartDate));
    const currentDayIndex = Math.min(Math.max(daysSinceCycleStart, 0), daysInCycle - 1);
    let endIndex = Math.min(daysInCycle, currentDayIndex + 1);
    if (currentDayIndex < visibleDays - 1) {
      endIndex = Math.min(daysInCycle, visibleDays);
    }
    scrollStart = Math.max(0, endIndex - visibleDays);
  }
  const baseStyle = {
    backgroundColor: '#fff7fb',
    backgroundImage: `
      radial-gradient(120% 120% at 0% 0%, rgba(251,113,133,0.18) 0, transparent 55%),
      radial-gradient(110% 110% at 100% 0%, rgba(244,114,182,0.16) 0, transparent 55%),
      radial-gradient(130% 130% at 0% 100%, rgba(251,113,133,0.08) 0, transparent 60%),
      radial-gradient(140% 140% at 100% 100%, rgba(255,255,255,0.9) 0, rgba(255,247,250,0.3) 40%, transparent 70%)
    `
  };
  const APP_H = 'calc(var(--app-vh, 1vh) * 100)';
  const NAVBAR_SAFE_VAR = 'var(--bottom-nav-safe)';
  const containerStyle = isFullScreen
    ? {
        ...baseStyle,
        height: APP_H,
        maxHeight: APP_H,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
        }
    : {
        ...baseStyle,
        height: `calc(${APP_H} - ${NAVBAR_SAFE_VAR})`,
        maxHeight: `calc(${APP_H} - ${NAVBAR_SAFE_VAR})`,
        paddingTop: 'env(safe-area-inset-top)',
      };
  const isInterpretationVisible = showInterpretation && hasValidConfirmation;
  const interpretationDialogClassName = selectionTarget
    ? 'top-auto bottom-6 translate-y-0 w-[90vw] max-w-xl rounded-full px-4 py-3'
    : 'w-[90vw] sm:w-full max-w-2xl max-h-[80vh] overflow-y-auto';

  const handleEdit = (record, sectionKey = null) => {
    setEditingRecord(record);
    setInitialSectionKey(sectionKey ?? null);
    setShowForm(true);
  };

  const handleToggleIgnore = async (cId, recordId) => {
    try {
      await toggleIgnoreRecord(cId, recordId);
      if (isUsingFallbackCycle) {
        const refreshed = await getCycleById(cId);
        if (refreshed) {
          setFetchedCycle(refreshed);
        }
      }
    } catch (error) {
      console.error('Error toggling ignore state:', error);
    }
  };
  const handleRelationsSettingChange = (checked) => {
    const nextValue = checked === true;
    setChartSettings((prev) => ({
      ...prev,
      showRelationsRow: nextValue,
    }));
    
    if (typeof savePreferences === 'function') {
      savePreferences({ showRelationsRow: nextValue }).catch((error) => {
        console.error('Failed to persist relations row preference', error);
      });
    }
  };
  const handleFertilityCalculatorChange = (calculatorKey, checked) => {
    setChartSettings((prev) => {
      const currentConfig = prev.fertilityStartConfig ?? createDefaultFertilityStartConfig();
      const nextValue = checked === true;
      if (currentConfig.calculators?.[calculatorKey] === nextValue) {
        return prev;
      }
      return {
        ...prev,
        fertilityStartConfig: {
          ...currentConfig,
          calculators: {
            ...currentConfig.calculators,
            [calculatorKey]: nextValue,
          },
        },
      };
    });
  };
  const handleCombineModeChange = (value) => {
    if (!Object.prototype.hasOwnProperty.call(COMBINE_MODE_LABELS, value)) {
      return;
    }
    setChartSettings((prev) => {
      const currentConfig = prev.fertilityStartConfig ?? createDefaultFertilityStartConfig();
      if (currentConfig.combineMode === value) {
        return prev;
      }
      return {
        ...prev,
        fertilityStartConfig: {
          ...currentConfig,
          combineMode: value,
        },
      };
    });
    
    if (typeof savePreferences === 'function') {
      savePreferences({ combineMode: value }).catch((error) => {
        console.error('Failed to persist combine mode preference', error);
      });
    }
  };
  const handlePostpartumChange = (checked) => {
    setChartSettings((prev) => {
      const currentConfig = prev.fertilityStartConfig ?? createDefaultFertilityStartConfig();
      const nextValue = checked === true;
      if (currentConfig.postpartum === nextValue) {
        return prev;
      }
      return {
        ...prev,
        fertilityStartConfig: {
          ...currentConfig,
          postpartum: nextValue,
        },
      };
    });
  };
  
  const locationStateCandidates = location?.state?.fertilityCalculatorCandidates;
  const cycleCandidates = targetCycle?.fertilityCalculatorCandidates;
  const storedFertilityCalculatorCandidates = useMemo(() => {
    const sourceArray = [
      Array.isArray(locationStateCandidates) ? locationStateCandidates : null,
      Array.isArray(cycleCandidates) ? cycleCandidates : null,
    ].find((candidates) => Array.isArray(candidates) && candidates.length > 0);

    if (!sourceArray) {
      return null;
    }

    return sourceArray
      .map((candidate) => {
        if (!candidate) return null;
        const { source, day, reason } = candidate;
        if (source !== 'CPM' && source !== 'T8') {
          return null;
        }
        const numericDay = Number(day);
        if (!Number.isFinite(numericDay)) {
          return null;
        }
        return {
          source,
          day: numericDay,
          reason: typeof reason === 'string' ? reason : '',
        };
      })
      .filter(Boolean);
  }, [locationStateCandidates, cycleCandidates]);
  
  const automaticCalculatorCandidates = useMemo(() => {
    const cpmCandidate = computeCpmCandidateFromCycles(fertilityCalculatorCycles);
    const t8Candidate = computeT8CandidateFromCycles(
      fertilityCalculatorCycles,
      computeOvulationMetrics
    );

    const candidates = [];

    if (cpmSelection === 'auto' && cpmCandidate) {
      candidates.push(cpmCandidate);
    }

    if (t8Selection === 'auto' && t8Candidate) {
      candidates.push(t8Candidate);
    }

    return candidates;
  }, [fertilityCalculatorCycles, cpmSelection, t8Selection]);

  const manualCalculatorCandidates = useMemo(() => {
    const candidates = [];
    const addManualCandidate = (selection, source, finalValue, baseValue) => {
      if (selection !== 'manual') {
        return;
      }
      const numericDay = Number(finalValue);
      if (!Number.isFinite(numericDay) || numericDay <= 0) {
        return;
      }

      const numericBase = Number(baseValue);
      const hasBase = Number.isFinite(numericBase) && numericBase > 0;
      const formattedBase = hasBase
        ? Number.isInteger(numericBase)
          ? `${numericBase}`
          : `${Number(numericBase.toFixed(2))}`
        : null;
      const baseLabel = hasBase
        ? source === 'CPM'
          ? `ciclo base: ${formattedBase} días`
          : `base ${formatCalculatorSourceLabel(source)}: ${formattedBase}`
        : null;
      const reason = baseLabel
        ? `Manual desde dashboard (${baseLabel})`
        : 'Manual desde dashboard';

      candidates.push({
        source,
        day: Math.max(1, numericDay),
        reason,
        kind: 'calculator',
        isManual: true,
        manualBase: hasBase ? numericBase : null,
      });
    };

    addManualCandidate(cpmSelection, 'CPM', manualCpmPreference, manualCpmBasePreference);
    addManualCandidate(t8Selection, 'T8', manualT8Preference, manualT8BasePreference);

    return candidates;
  }, [
    cpmSelection,
    manualCpmPreference,
    manualCpmBasePreference,
    manualT8Preference,
    manualT8BasePreference,
    t8Selection,
  ]);

  const combinedFertilityCalculatorCandidates = useMemo(() => {
    const storedMap = new Map();
    (Array.isArray(storedFertilityCalculatorCandidates)
      ? storedFertilityCalculatorCandidates
      : []
    ).forEach((candidate) => {
      const key = normalizeCalculatorSource(candidate?.source);
      if (!key) return;
      storedMap.set(key, candidate);
    });

    const manualMap = new Map();
    manualCalculatorCandidates.forEach((candidate) => {
      const key = normalizeCalculatorSource(candidate?.source);
      if (!key) return;
      manualMap.set(key, candidate);
    });

    const selectedCpmCandidate =
      cpmSelection === 'manual'
        ? manualMap.get('CPM') ?? storedMap.get('CPM') ?? null
        : cpmSelection === 'auto'
          ? automaticCalculatorCandidates.find(
              (candidate) => normalizeCalculatorSource(candidate?.source) === 'CPM'
            ) ?? null
          : null;

    const selectedT8Candidate =
      t8Selection === 'manual'
        ? manualMap.get('T8') ?? storedMap.get('T8') ?? null
        : t8Selection === 'auto'
          ? automaticCalculatorCandidates.find(
              (candidate) => normalizeCalculatorSource(candidate?.source) === 'T8'
            ) ?? null
          : null;

    return [selectedCpmCandidate, selectedT8Candidate].filter(Boolean);
  }, [
    automaticCalculatorCandidates,
    cpmSelection,
    manualCalculatorCandidates,
    storedFertilityCalculatorCandidates,
    t8Selection,
  ]);
  const handleTogglePeak = async (record, shouldMarkAsPeak = true) => {
    if (!targetCycle?.id || !record?.isoDate) {
      return;
    }

    const normalizeMeasurementValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const markAsPeak = shouldMarkAsPeak ?? !(
      record.peak_marker === 'peak' || record.peakStatus === 'P'
    );

    setIsProcessing(true);
    try {
      const fallbackTime = record.timestamp
        ? format(parseISO(record.timestamp), 'HH:mm')
        : format(new Date(), 'HH:mm');

      let measurementsSource = Array.isArray(record.measurements) && record.measurements.length > 0
        ? record.measurements
        : [
            {
              temperature: record.temperature_chart ?? record.temperature_raw ?? null,
              temperature_corrected: record.temperature_corrected ?? null,
              time: fallbackTime,
              time_corrected: record.time_corrected ?? fallbackTime,
              selected: true,
              use_corrected: record.use_corrected ?? false,
            },
          ];

      if (measurementsSource.length === 0) {
        measurementsSource = [
          {
            temperature: null,
            temperature_corrected: null,
            time: fallbackTime,
            time_corrected: fallbackTime,
            selected: true,
            use_corrected: false,
          },
        ];
      }

      const normalizedMeasurements = measurementsSource.map((measurement, index) => {
        const timeValue = measurement.time || fallbackTime;
        const correctedTime = measurement.time_corrected || timeValue;

        return {
          temperature: normalizeMeasurementValue(
            measurement.temperature ?? measurement.temperature_raw
          ),
          time: timeValue,
          selected: index === 0 ? true : !!measurement.selected,
          temperature_corrected: normalizeMeasurementValue(
            measurement.temperature_corrected
          ),
          time_corrected: correctedTime,
          use_corrected: !!measurement.use_corrected,
        };
      });

      if (!normalizedMeasurements.some((measurement) => measurement.selected)) {
        normalizedMeasurements[0].selected = true;
      }

      const payload = {
        isoDate: record.isoDate,
        measurements: normalizedMeasurements,
        mucusSensation: record.mucus_sensation ?? record.mucusSensation ?? '',
        mucusAppearance: record.mucus_appearance ?? record.mucusAppearance ?? '',
        fertility_symbol: record.fertility_symbol ?? 'none',
        observations: record.observations ?? '',
        had_relations: record.had_relations ?? record.hadRelations ?? false,
        ignored: record.ignored ?? false,
        peak_marker: markAsPeak ? 'peak' : null,
      };

      const existingRecord =
        record?.id && !String(record.id).startsWith('placeholder-') ? record : null;

      await addOrUpdateDataPoint(payload, existingRecord, targetCycle.id);
    } catch (error) {
      console.error('Error toggling peak marker:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
    setInitialSectionKey(null);
  }, []);

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    if (!targetCycle?.id) return;
    setIsProcessing(true);
    if (keepFormOpen) {
      keepFormOpenUntilRef.current = Date.now() + 500;
    }
    try {
      await addOrUpdateDataPoint(data, editingRecord, targetCycle.id);
      if (isUsingFallbackCycle) {
        const refreshed = await getCycleById(targetCycle.id);
        if (refreshed) {
          setFetchedCycle(refreshed);
        }
      }
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setInitialSectionKey(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDateSelect = (record) => {
    setEditingRecord(record);
  };
  const openInterpretationModal = useCallback(() => {
    setSelectionTarget(null);
    setInterpretationOverrides(
      normalizeInterpretationOverrides(confirmedInterpretation?.overrides)
    );
    setInterpretationModalOpen(true);
  }, [confirmedInterpretation?.overrides]);

  const handleInterpretationAction = useCallback(() => {
    if (hasValidConfirmation) {
      setShowInterpretation((v) => !v);
      return;
    }
    openInterpretationModal();
  }, [hasValidConfirmation, openInterpretationModal]);
  const closePhaseOverlay = useCallback(() => {
    setPhaseOverlay(null);
  }, []);
  const handleInterpretationClick = (event) => {
    event.preventDefault();
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    handleInterpretationAction();
  };

  const handleInterpretationPointerUp = (event) => {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      ignoreNextClickRef.current = true;
      handleInterpretationAction();
    }
  };

  const handleFormOpenChange = useCallback((open) => {
    if (open) {
      setShowForm(true);
      return;
    }

    if (Date.now() < keepFormOpenUntilRef.current) {
      return;
    }

    handleCloseForm();
  }, [handleCloseForm]);

  const formatDateFromIndex = useCallback(
    (index) => {
      if (!Number.isInteger(index) || index < 0 || index >= mergedData.length) return '—';
      const entry = mergedData[index];
      const dateValue = entry?.isoDate ?? entry?.date;
      if (!dateValue) return '—';
      try {
        const parsedDate = typeof dateValue === 'string' ? parseISO(dateValue) : dateValue;
        return format(parsedDate, 'dd/MM');
      } catch (error) {
        console.error('Error formatting date from index', error);
        return '—';
      }
    },
    [mergedData]
  );

  const cycleDayDateMap = useMemo(() => {
    const map = new Map();
    mergedData.forEach((entry) => {
      if (!Number.isInteger(entry?.cycleDay)) return;
      const dateValue = entry?.isoDate ?? entry?.date;
      if (!dateValue) return;
      map.set(entry.cycleDay, dateValue);
    });
    return map;
  }, [mergedData]);

  const formatCycleDayLabel = useCallback(
    (value) => {
      if (!Number.isInteger(value) || value <= 0) return '—';
      const dateValue = cycleDayDateMap.get(value);
      if (!dateValue) return `Día ${value}`;
      try {
        const parsedDate = typeof dateValue === 'string' ? parseISO(dateValue) : dateValue;
        const dateLabel = format(parsedDate, 'dd/MM');
        return `${dateLabel} - Día ${value}`;
      } catch (error) {
        console.error('Error formatting cycle day label', error);
        return `Día ${value}`;
      }
    },
    [cycleDayDateMap]
  );

  const interpretationStatusLabel = useMemo(() => {
    if (confirmedInterpretation?.confirmed && !hasValidConfirmation) {
      return 'Revisión por cambios';
    }
    if (hasValidConfirmation) {
      return 'Confirmado';
    }
    return 'Pendiente';
  }, [confirmedInterpretation?.confirmed, hasValidConfirmation]);

  const interpretationStatusClassName = useMemo(() => {
    if (interpretationStatusLabel === 'Confirmado') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (interpretationStatusLabel === 'Revisión por cambios') {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600';
  }, [interpretationStatusLabel]);

  const handleInterpretationModalChange = useCallback(
    (open) => {
      if (!open) {
        if (selectionTarget) {
          return;
        }
        setInterpretationModalOpen(false);
        setSelectionTarget(null);
        return;
      }
      setInterpretationModalOpen(true);
    },
    [selectionTarget]
  );

  const handleInterpretationDialogInteractOutside = useCallback(
    (event) => {
      if (selectionTarget) {
        event.preventDefault();
      }
    },
    [selectionTarget]
  );

  const handleInterpretationDialogEscapeKeyDown = useCallback(
    (event) => {
      if (selectionTarget) {
        event.preventDefault();
      }
    },
    [selectionTarget]
  );

  const isFieldManual = useCallback(
    (sectionKey, fieldKey) =>
      Number.isInteger(interpretationOverrides?.[sectionKey]?.[fieldKey]),
    [interpretationOverrides]
  );

  const handleSelectField = useCallback((sectionKey, fieldKey, label) => {
    setSelectionTarget({ sectionKey, fieldKey, label });
  }, []);

  const handleDaySelection = useCallback(
    (cycleDay) => {
      if (!selectionTarget || !Number.isInteger(cycleDay)) {
        return;
      }
      const { sectionKey, fieldKey } = selectionTarget;
      setInterpretationOverrides((prev) => {
        const next = normalizeInterpretationOverrides(prev);
        next[sectionKey] = { ...(next[sectionKey] ?? {}) };
        next[sectionKey][fieldKey] = cycleDay;
        return next;
      });
      setSelectionTarget(null);
    },
    [selectionTarget]
  );

  const handleResetField = useCallback((sectionKey, fieldKey) => {
    setInterpretationOverrides((prev) => {
      const next = normalizeInterpretationOverrides(prev);
      if (next?.[sectionKey]) {
        const { [fieldKey]: _, ...rest } = next[sectionKey];
        next[sectionKey] = rest;
      }
      return next;
    });
  }, []);

  const buildOverridesPayload = useCallback(() => {
    const previousOverrides = normalizeInterpretationOverrides(
      confirmedInterpretation?.overrides
    );
    const selectedOverrides = normalizeInterpretationOverrides(interpretationOverrides);
    const nextOverrides = {};

    INTERPRETATION_SECTIONS.forEach((section) => {
      const sectionKey = section.key;
      const nextFields = {};

      section.fields.forEach((field) => {
        const fieldKey = field.key;
        const selectedValue = selectedOverrides?.[sectionKey]?.[fieldKey];
        const suggestedValue = interpretationSuggestions?.[sectionKey]?.[fieldKey];
        const previousValue = previousOverrides?.[sectionKey]?.[fieldKey];

        if (Number.isInteger(selectedValue)) {
          if (
            Number.isInteger(suggestedValue) &&
            selectedValue === suggestedValue
          ) {
            if (Number.isInteger(previousValue)) {
              nextFields[fieldKey] = null;
            }
          } else {
            nextFields[fieldKey] = selectedValue;
          }
        } else if (Number.isInteger(previousValue)) {
          nextFields[fieldKey] = null;
        }
      });

      if (Object.keys(nextFields).length > 0) {
        nextOverrides[sectionKey] = nextFields;
      }
    });

    return Object.keys(nextOverrides).length > 0 ? nextOverrides : null;
  }, [
    confirmedInterpretation?.overrides,
    interpretationOverrides,
    interpretationSuggestions,
  ]);

  const handleConfirmInterpretation = useCallback(async () => {
    if (!targetCycle?.id || isSavingInterpretation) {
      return;
    }
    setIsSavingInterpretation(true);
    try {
      const cleanedOverrides = buildOverridesPayload();
      const payload = {
        confirmed: true,
        confirmedDataVersion: cycleDataVersion,
        confirmedMode: currentInterpretationMode,
        overrides: cleanedOverrides,
      };
      await updateCycleInterpretation(targetCycle.id, payload);
      setShowInterpretation(true);
      setSelectionTarget(null);
      setInterpretationModalOpen(false);
    } catch (error) {
      console.error('Error confirming interpretation:', error);
    } finally {
      setIsSavingInterpretation(false);
    }
  }, [
    targetCycle?.id,
    isSavingInterpretation,
    interpretationOverrides,
    cycleDataVersion,
    currentInterpretationMode,
    updateCycleInterpretation,
    buildOverridesPayload,
  ]);

  const handleShowPhaseInfo = useCallback(
    (info = {}) => {
      if (!info) return;
      const phase = info.phase ?? null;
      const reasons = info.reasons ?? {};
      const aggregate = reasons?.aggregate ?? null;
      const usedCandidates = Array.isArray(aggregate?.usedCandidates) ? aggregate.usedCandidates : [];
      const referenceCandidates = Array.isArray(aggregate?.ignoredCalculatorCandidates)
        ? aggregate.ignoredCalculatorCandidates
        : [];
      const fertileWindow = reasons?.window ?? reasons?.fertileWindow ?? null;
      const fertileStartIndex = Number.isInteger(reasons?.startIndex)
        ? reasons.startIndex
        : Number.isInteger(reasons?.fertileStartFinalIndex)
          ? reasons.fertileStartFinalIndex
          : null;

      const selectedMode = aggregate?.selectedMode ?? fertilityConfig?.combineMode ?? null;
      const modeLabel = (() => {
        if (reasons?.source === 'marker' || reasons?.details?.explicitStartDay != null) {
          return 'Ajustado por marcadores';
        }
        const labels = {
          conservador: 'Conservador',
          estandar: 'Estándar',
        };
        return labels[selectedMode] ?? null;
      })();

      const normalizeSource = (candidate) =>
        (candidate?.source ?? candidate?.originalSource ?? '').toString().toUpperCase();

      const findCandidateForStart = () => {
        const dayNumber = Number.isInteger(fertileStartIndex) ? fertileStartIndex + 1 : null;
        if (!dayNumber) return { candidate: null, dayNumber: null };
        const match = usedCandidates.find(
          (candidate) => Number.isFinite(candidate?.day) && Math.round(candidate.day) === dayNumber
        );
        return { candidate: match ?? usedCandidates[0] ?? null, dayNumber };
      };

      const getStartCauseLabel = () => {
        const { candidate } = findCandidateForStart();
        const source = normalizeSource(candidate);
        if (source === 'CPM') return 'alcanzar valor CPM';
        if (source === 'T8' || source === 'T-8') return 'alcanzar valor T-8';
        if (reasons?.source === 'marker' || reasons?.details?.explicitStartDay != null) return 'marcador';

        const reasonText = (candidate?.reason ?? '').toUpperCase();
        const isSensation = reasonText.includes('S') || reasonText.includes('BIP');
        if (!reasonText && !source) return null;
        return isSensation ? 'cambio en la sensación' : 'presencia de moco';
      };

      let title = '';
      let message = '';
      let description = null;

      if (phase === 'relativeInfertile') {
        title = 'Relativamente infértil';
        const fertileStarted = Number.isInteger(fertileStartIndex);
        const hasReference =
          selectedMode === 'estandar' && Array.isArray(referenceCandidates) && referenceCandidates.length > 0;
        const startCause = getStartCauseLabel();
        const startDate = formatDateFromIndex(fertileStartIndex);

        if (!fertileStarted) {
          if (selectedMode === 'conservador') {
            message = 'A la espera de cálculo (CPM/T-8) o signos de moco/sensación.';
          } else if (hasReference) {
            message = 'Referencia alcanzada (CPM/T-8). A la espera de signos de moco/sensación.';
          } else {
            message = 'A la espera de signos de moco/sensación.';
          }
        } else {
          const triggerLabel = startCause ?? '—';
          message = `Fin de fase por ${triggerLabel}.`;
          description = startDate !== '—' ? `Inicio fértil: ${startDate}.` : null;
        }

        } else if (phase === 'fertile') {
        title = 'Fase fértil';
        const startCause = getStartCauseLabel() ?? '—';
        const startDate = formatDateFromIndex(fertileStartIndex);
        const startLabel = startDate ?? '—';
        const hasPostPhase = Number.isFinite(fertileWindow?.endIndex);
        const hasMucusClosure = Number.isInteger(fertileWindow?.mucusInfertileStartIndex);
        const hasTemperatureClosure = Number.isInteger(fertileWindow?.temperatureInfertileStartIndex);

        message = `Iniciada el ${startLabel} por ${startCause}.`;

        if (!hasPostPhase) {
          description = 'A la espera de cierre por día pico y/o confirmación de temperatura.';
        } else if (hasMucusClosure && hasTemperatureClosure) {
          description = 'Finalizada por doble criterio.';
        } else if (hasMucusClosure) {
          description = 'Finalizada por día pico.';
        } else if (hasTemperatureClosure) {
          description = 'Finalizada por temperatura.';
        }

      } else if (phase === 'postOvulatory') {
        const displayLabel = (info?.displayLabel ?? info?.label ?? '').toLowerCase();
        const status = info?.status ?? reasons?.status ?? null;
        const tempConfirmationDate = formatDateFromIndex(
          Number.isInteger(reasons?.temperature?.confirmationIndex)
            ? reasons.temperature.confirmationIndex
            : Number.isInteger(reasons?.temperature?.startIndex)
              ? reasons.temperature.startIndex
              : fertileWindow?.temperatureInfertileStartIndex
        );
        const peakDate = formatDateFromIndex(reasons?.mucus?.peakDayIndex);
        const mucusInfertileDate = formatDateFromIndex(
          Number.isInteger(reasons?.mucus?.infertileStartIndex)
            ? reasons.mucus.infertileStartIndex
            : info?.startIndex
        );
        const segmentStartDate = formatDateFromIndex(info?.startIndex);

        if (status === 'absolute' || info?.displayLabel === 'Infertilidad absoluta') {
          title = 'Infertilidad postovulatoria confirmada';
          message = `Comienza el ${segmentStartDate}.`;
          description = `Confirmada por temperatura (${tempConfirmationDate}) y 3.º/4.º día postpico (${mucusInfertileDate}).`;
        } else if (displayLabel.includes('moco')) {
          title = 'Infertilidad post-pico';
          // Índice real donde empieza la infertilidad por moco (lo que se está dibujando)
          const mucusInfertileIndex =
            Number.isInteger(reasons?.mucus?.infertileStartIndex)
              ? reasons.mucus.infertileStartIndex
              : Number.isInteger(info?.startIndex)
                ? info.startIndex
                : null;

          const peakIndex = Number.isInteger(reasons?.mucus?.peakDayIndex)
            ? reasons.mucus.peakDayIndex
            : null;

          let postPicoLabel = 'día postpico';
          if (Number.isInteger(mucusInfertileIndex) && Number.isInteger(peakIndex)) {
            const delta = mucusInfertileIndex - peakIndex;
            if (delta === 3) postPicoLabel = '3.º día postpico';
            else if (delta === 4) postPicoLabel = '4.º día postpico';
          }
          message = `Alcanzada el ${segmentStartDate} por ${postPicoLabel}. Día pico: ${peakDate}.`;
          description = 'A la espera de confirmación por temperatura.';
        } else if (displayLabel.includes('temperatura')) {
          title = 'Infertilidad postovulatoria por temperatura';
          message = `Temperatura confirmada el ${tempConfirmationDate}.`;
          description = 'A la espera de determinación del día pico.';
        } else {
          title = 'Fase postovulatoria';
          message = 'Interpretación postovulatoria disponible.';
          description = status === 'pending' ? 'Pendiente completar el segundo criterio.' : null;
        }
      } else if (phase === 'nodata') {
        const status = reasons?.status ?? info?.status ?? null;
        if (status === 'no-fertile-window') {
          title = 'Sin ventana fértil identificable';
          message =
            'No se ha identificado un inicio fértil claro en este ciclo (ni por moco, ni por calculadora, ni por marcador explícito).';
        } else {
          title = 'Sin datos suficientes';
          message = 'Añade registros de sensación, moco o temperatura para interpretar el ciclo.';
        }
      } else if (info?.message) {
        title = info.message;
      } else {
        return;
      }

      if (!title) {
        return;
      }


      setPhaseOverlay({
        title,
        message,
        description,
        modeLabel,
      });
    },
    [fertilityConfig, formatDateFromIndex, mergedData.length, setPhaseOverlay]
  );

  const handleToggleFullScreen = () => {
    if (!isFullScreen) {
      setIsFullScreen(true);
      setForceLandscape(true);
    return;
    }
    
    setForceLandscape(false);
    const nextOrientation =
      typeof window !== 'undefined' && window.innerWidth > window.innerHeight
        ? 'landscape'
        : 'portrait';
    setOrientation(nextOrientation);
    setIsFullScreen(false);
  };
if (showLoading) {
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 px-4 py-8 text-center text-fertiliapp-fuerte">
          <p>Cargando…</p>
        </div>
      </MainLayout>
    );
  }

  if (!targetCycle?.id) {
    if (cycleId && notFound) {
      return (
        <MainLayout>
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-fertiliapp-fuerte">
            <p>No se encontró el ciclo solicitado.</p>
            <Button asChild className="bg-fertiliapp-fuerte rounded-3xl text-white shadow">
              <Link to="/archived-cycles">Volver a Mis Ciclos</Link>
            </Button>
          </div>
        </MainLayout>
      );
    }
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-fertiliapp-fuerte">
          <p>No hay ciclo activo.</p>
          <Button asChild className="bg-fertiliapp-fuerte rounded-3xl text-white shadow">
            <Link to="/records">Ir a Mis Registros</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout hideBottomNav={isFullScreen}>
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-50 h-app w-[100vw] overflow-y-auto overflow-x-hidden'
            : 'relative w-full h-full overflow-y-auto overflow-x-hidden'}
        style={containerStyle}
      >
        {showBackToCycleRecords && !isFullScreen && (
          <Button
            asChild
            variant="ghost"
            className="absolute top-4 left-4 z-10 bg-white/20 text-slate-700 hover:brightness-95"
          >
            <Link to={`/cycle/${targetCycle.id}`} className="flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              {archivedCycleTitle && (
                <span className="ml-1 text-xs font-semibold text-slate-700 sm:text-sm">
                  {archivedCycleTitle}
                </span>
              )}
            </Link>
          </Button>
          
        )}
        <Button
          onClick={() => setSettingsOpen((prev) => !prev)}
          variant="ghost"
          size="icon"
          className="absolute top-16 right-4 z-10 p-2 rounded-full bg-white/20 shadow-lg shadow-secundario text-secundario border hover:brightness-95"
          aria-label="Ajustes"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleInterpretationClick}
          onPointerUp={handleInterpretationPointerUp}
          variant="ghost"
          size="icon"
          className={`absolute top-4 right-20 z-10 p-2 rounded-full transition-colors ${isInterpretationVisible 
            ? 'bg-fertiliapp-fuerte text-white shadow-lg shadow-fertiliapp-fuerte/50 border-fertiliapp-fuerte/70' 
            : 'bg-white/20 text-fertiliapp-fuerte border border-fertiliapp-fuerte hover:brightness-95 shadow-md'}`}
        >
          {isInterpretationVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          onClick={handleToggleFullScreen}
          className="absolute top-4 right-4 z-10 bg-white/20 rounded-full text-slate-600 hover:bg-pink-50/80 shadow-md border border-slate-400/50 backdrop-blur-sm"
          aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <FertilityChart
          data={mergedData}
          isFullScreen={isFullScreen}
          orientation={orientation}
          onToggleIgnore={handleToggleIgnore}
          onEdit={handleEdit}
          onTogglePeak={handleTogglePeak}
          cycleId={targetCycle.id}
          initialScrollIndex={scrollStart}
          visibleDays={visibleDays}
          showInterpretation={isInterpretationVisible}
          reduceMotion={true}
          forceLandscape={forceLandscape || orientation === 'landscape'}
          currentPeakIsoDate={currentPeakIsoDate}
          showRelationsRow={chartSettings.showRelationsRow}
          fertilityStartConfig={fertilityStartConfig}
          fertilityCalculatorCycles={fertilityCalculatorCycles}
          fertilityCalculatorCandidates={combinedFertilityCalculatorCandidates}
          onShowPhaseInfo={handleShowPhaseInfo}
          isArchivedCycle={!isViewingCurrentCycle}
          cycleEndDate={targetCycle?.endDate ?? null}
          selectionMode={Boolean(selectionTarget)}
          onDaySelect={handleDaySelection}
          interpretation={hasValidConfirmation ? confirmedInterpretation : null}
          confirmedInterpretation={hasValidConfirmation ? resolvedInterpretation : null}
          onInterpretationData={handleInterpretationData}
        />
        
        {/* Backdrop */}
        {settingsOpen && (
            <div className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
            />
            )}
            {/* Drawer fijo */}
            <div className={`fixed top-0 right-0 z-50 h-app w-72 sm:w-80 transform transition-transform duration-300 ease-in-out ${
              settingsOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-modal="true"
            >
            <div className="flex h-full flex-col gap-6 border-xl rounded-xl border-rose-100/60 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-titulo">Ajustes del gráfico</h2>
                <p className="text-sm text-slate-500">
                  Personaliza la visualización del gráfico
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar ajustes del gráfico"
              >
                ×
              </Button>
            </div>
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-rose-100/70 bg-rose-50/40 p-4 flex items-start justify-between gap-3">
                <div className="max-w-xs">
                  <Label htmlFor="toggle-relations-row" className="text-sm font-semibold text-slate-700">
                    Mostrar fila RS
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Añade una fila dedicada a las relaciones sexuales debajo de la gráfica.
                  </p>                 
                </div>
                <Checkbox
                  id="toggle-relations-row"
                  checked={chartSettings.showRelationsRow}
                  onCheckedChange={handleRelationsSettingChange}
                  className="mt-1"
                />
              </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={openInterpretationModal}
                  className="w-15 flex items-center justify-start gap-2 rounded-3xl border-rose-200/80 bg-white/80 text-sm font-semibold text-slate-700 hover:bg-white"
                  aria-label="Abrir sugerencias de interpretación"
                >
                  <Settings className="h-4 w-4 text-slate-500" />
                  Interpretación
                </Button>


              <div className="rounded-2xl border border-amber-100/70 bg-amber-50/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Calculadoras complementarias</h3>
                  <p className="text-xs text-slate-500">
                    CPM y T-8 se combinan con los perfiles activos, salvo que actives el modo posparto.
                  </p>
                </div>
                {fertilityConfig.postpartum && (
                  <p className="text-xs font-medium text-rose-500">
                    El modo posparto está activo: CPM y T-8 se omiten del cálculo final.
                  </p>
                )}
                <div className="space-y-2">
                  {FERTILITY_CALCULATOR_OPTIONS.map((option) => (
                    <div key={option.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-700">{option.label}</span>
                      <Checkbox
                        checked={Boolean(fertilityConfig.calculators?.[option.key])}
                        onCheckedChange={(checked) => handleFertilityCalculatorChange(option.key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-sky-100/70 bg-sky-50/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Modo de combinación</h3>
                  <p className="text-xs text-slate-500">
                    Determina cómo se elige el inicio fértil a partir de los datos disponibles.
                  </p>
                </div>
                <Select value={fertilityConfig.combineMode} onValueChange={handleCombineModeChange}>
                  <SelectTrigger className="w-full bg-white/80 border-slate-200 text-sm rounded-3xl text-slate-700">
                    <SelectValue placeholder="Selecciona un modo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700 rounded-3xl">
                    {Object.entries(COMBINE_MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-sm rounded-3xl">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="max-w-[65%]">
                    <p className="text-sm font-semibold text-slate-700">Modo posparto</p>
                    <p className="text-xs text-slate-500">Ignora automáticamente CPM y T-8.</p>
                  </div>
                  <Checkbox
                    checked={Boolean(fertilityConfig.postpartum)}
                    onCheckedChange={handlePostpartumChange}
                    className="mt-1"
                  />
                </div>
              </div>
            </div> 
            </div>
        </div>
        <Overlay
          isOpen={Boolean(phaseOverlay)}
          onClose={closePhaseOverlay}
          ariaLabel="Detalle de interpretación del ciclo"
          containerClassName="p-6"
        >
          {phaseOverlay && (
            <div className="space-y-3 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-fertiliapp-fuerte">
                    {phaseOverlay.title}
                  </h2>
                  {phaseOverlay.modeLabel && (
                    <span className="rounded-full border border-secundario bg-secundario-suave px-3 py-1 text-[11px] font-semibold text-secundario-fuerte">
                      {phaseOverlay.modeLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePhaseOverlay}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
                  aria-label="Cerrar detalle de interpretación"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {phaseOverlay.message && (
                <p className="text-sm leading-relaxed text-slate-700">{phaseOverlay.message}</p>
              )}
              
              {phaseOverlay.description && (
                <p className="text-sm leading-relaxed text-slate-500">{phaseOverlay.description}</p>
              )}
            </div>
          )}
        </Overlay>

        <Dialog
          open={interpretationModalOpen}
          onOpenChange={handleInterpretationModalChange}
          modal={!selectionTarget}
        >
          <DialogContent
            hideClose={Boolean(selectionTarget)}
            hideOverlay={Boolean(selectionTarget)}
            className={`bg-white border-rose-100/70 text-slate-700 ${interpretationDialogClassName}`}
            onInteractOutside={handleInterpretationDialogInteractOutside}
            onEscapeKeyDown={handleInterpretationDialogEscapeKeyDown}
          >
            {selectionTarget ? (
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-semibold text-slate-700">
                  Selecciona un día en la gráfica:{' '}
                  <span className="text-fertiliapp-fuerte">{selectionTarget.label}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full px-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  onClick={() => setSelectionTarget(null)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-titulo">Interpretación</h2>
                    <p className="text-sm text-slate-500">
                      Confirma la interpretación
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${interpretationStatusClassName}`}>
                      {interpretationStatusLabel}
                    </span>
                    <Select
                      value={currentInterpretationMode}
                      onValueChange={setCurrentInterpretationMode}
                    >
                      <SelectTrigger className="h-8 rounded-full border border-rose-200 bg-white/80 px-3 text-[11px] font-semibold text-rose-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-rose-100 rounded-2xl text-rose-700">
                        {Object.entries(INTERPRETATION_MODE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="text-xs rounded-2xl">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  {INTERPRETATION_SECTIONS.map((section) => (
                    <div
                      key={section.key}
                      className="rounded-2xl border border-rose-100/70 bg-rose-50/40 p-4 space-y-2"
                    >
                      <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
                      <div className="space-y-2">
                        {section.fields.map((field) => {
                          const value = resolvedInterpretation?.[section.key]?.[field.key];
                          const manual = isFieldManual(section.key, field.key);
                          return (
                            <div
                              key={`${section.key}-${field.key}`}
                              className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"
                            >
                              <div>
                                <p className="text-xs font-semibold text-slate-600">
                                  {field.label}
                                </p>
                                <p className="text-sm font-semibold text-slate-800">
                                  {formatCycleDayLabel(value)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                    manual
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                  }`}
                                >
                                  {manual ? 'Manual' : 'Sugerido'}
                                </span>
                                {manual && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetField(section.key, field.key)}
                                    className="rounded-full border border-slate-200 bg-white p-1 text-slate-400 hover:text-slate-600"
                                    aria-label={`Restablecer ${field.label}`}
                                  >
                                    ↺
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectField(
                                      section.key,
                                      field.key,
                                      `${section.title} · ${field.label}`
                                    )
                                  }
                                  className="rounded-full border border-rose-200 bg-white p-1 text-rose-500 hover:text-rose-600"
                                  aria-label={`Editar ${field.label}`}
                                >
                                  <PencilLine className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sticky bottom-0 bg-white/90 pt-2">
                  <Button
                    type="button"
                    onClick={handleConfirmInterpretation}
                    disabled={isSavingInterpretation}
                    className="w-full rounded-full bg-fertiliapp-fuerte text-white shadow-md hover:brightness-95"
                  >
                    {isSavingInterpretation ? 'Guardando…' : 'Confirmar y ver'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
          <DialogContent
            hideClose
            className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
            onInteractOutside={(event) => {
              if (Date.now() < keepFormOpenUntilRef.current) {
                event.preventDefault();
              }
            }}
            onPointerDownOutside={(event) => {
              if (Date.now() < keepFormOpenUntilRef.current) {
                event.preventDefault();
              }
            }}
          >
            <DataEntryForm
              onSubmit={handleSave}
              onCancel={handleCloseForm}
              initialData={editingRecord}
              cycleStartDate={targetCycle.startDate}
              cycleEndDate={targetCycle.endDate}
              isProcessing={isProcessing}
              isEditing={!!editingRecord && !isPlaceholderRecord}
              cycleData={targetCycle.data}
              onDateSelect={handleDateSelect}
              initialSectionKey={initialSectionKey}
            />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default ChartPage;
