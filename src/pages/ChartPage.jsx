import React, {
  useState,
  useLayoutEffect,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import FertilityChart from '@/components/FertilityChart';
import InterpretationSettingsDialog from '@/components/InterpretationSettingsDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { Baby, CalendarDays, Check, CheckCircle2, Heart, X } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import DataEntryForm from '@/components/DataEntryForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NewCycleDialog from '@/components/NewCycleDialog';
import { useToast } from '@/components/ui/use-toast';
import {
  computeCpmCandidateFromCycles,
  computeT8CandidateFromCycles,
} from '@/lib/fertilityStart';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { computeOvulationMetrics } from '@/hooks/useFertilityChart';
import ChartControls from '@/components/ChartControls';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { prepareChartData } from '@/chart/core/prepareChartData';
import {
  createAutoTemperatureRiseOverride,
  createManualTemperatureRiseOverride,
  evaluateTemperatureRiseOverride,
  normalizeTemperatureRiseOverride,
} from '@/lib/temperatureRiseOverride';
import {
  PREFERENCE_DEFAULTS,
  mergeFertilityStartConfig,
  normalizeStoredPreferences,
} from '@/lib/preferences';

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

const DEFAULT_CHART_SETTINGS = normalizeStoredPreferences(PREFERENCE_DEFAULTS);

const FERTILITY_CALCULATOR_OPTIONS = [
  { key: 'cpm', label: 'CPM' },
  { key: 't8', label: 'T-8' },
];

const Label = ({ htmlFor, className = '', children }) => (
  <label htmlFor={htmlFor} className={className}>
    {htmlFor === 'toggle-relations-row' ? (
      <span className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-rose-400" aria-hidden="true" />
        <span>{children}</span>
      </span>
    ) : (
      children
    )}
  </label>
);

const Checkbox = ({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  className = '',
  variant = 'check',
}) => {
  const handleToggle = () => {
    if (disabled) return;
    onCheckedChange?.(!checked);
  };

  if (variant === 'switch') {
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={`relative inline-flex h-5 w-9 min-w-9 shrink-0 flex-none items-center rounded-full transition ${
          checked ? 'bg-rose-400' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    );
  }

  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleToggle}
      className={`inline-flex h-5 w-5 min-w-5 shrink-0 items-center justify-center rounded-full border transition ${
        checked
          ? 'border-rose-400 bg-rose-400 text-white'
          : 'border-rose-200 bg-white text-transparent'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${className}`}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
};

const PhaseInfoFloatingCard = ({
  phaseOverlay,
  onClose,
  cardRef,
  isRotated = false,
  viewport = null,
}) => {
  if (!phaseOverlay) return null;

  const shellStyle = isRotated && viewport?.w && viewport?.h
    ? {
        left: '50%',
        top: '50%',
        width: `${viewport.h}px`,
        height: `${viewport.w}px`,
        transform: 'translate(-50%, -50%) rotate(90deg)',
        transformOrigin: 'center center',
      }
    : undefined;

  return (
    <div
      className={`pointer-events-none fixed z-[260] flex items-start justify-center px-3 ${
        isRotated ? '' : 'inset-x-0 top-0'
      }`}
      style={shellStyle}
    >
      <section
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="Detalle de interpretación del ciclo"
        className={`pointer-events-auto overflow-y-auto rounded-2xl border border-rose-200/90 bg-white/95 p-2.5 text-left shadow-lg shadow-rose-200/45 ${
          isRotated
            ? 'w-[min(calc(100vw-3rem),24rem)] max-w-[24rem]'
            : 'w-[calc(100vw-7rem)] min-w-[12.5rem] max-w-[18rem]'
        }`}
        style={{
          marginTop: isRotated
            ? 'calc(env(safe-area-inset-left, 0px) + 0.75rem)'
            : 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          maxHeight: isRotated
            ? 'min(calc(100dvh - env(safe-area-inset-left, 0px) - 1.5rem), 10rem)'
            : 'min(calc(100dvh - env(safe-area-inset-top, 0px) - 1.5rem), 14rem)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-snug text-fertiliapp-fuerte">
              <span>{phaseOverlay.title}</span>
              {phaseOverlay.postpartumActive && (
                <span
                  className="ml-1.5 inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600"
                  aria-label="Modo postparto"
                  title="Modo postparto"
                >
                  <Baby className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
            aria-label="Cerrar detalle de interpretación"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 space-y-1.5">
          {phaseOverlay.message && (
            <p className="flex gap-1.5 text-[13px] leading-relaxed text-slate-700">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                aria-hidden="true"
              />
              <span>{phaseOverlay.message}</span>
            </p>
          )}

          {phaseOverlay.description && (
            <p className="flex gap-1.5 text-[13px] leading-relaxed text-slate-600">
              <CalendarDays
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"
                aria-hidden="true"
              />
              <span>{phaseOverlay.description}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
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
    previewStartNewCycle,
    startNewCycle,
    updateCyclePostpartumMode,
    updateCycleInterpretationOverrides,
  } = useCycleData();

  const [fetchedCycle, setFetchedCycle] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isViewingCurrentCycle = !cycleId || cycleId === currentCycle.id;
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
  const { toast } = useToast();
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
    
  const chartCycleLabel = useMemo(() => {
    if (isViewingCurrentCycle) {
      return 'Ciclo actual';
    }

    if (!targetCycle?.startDate) {
      return '';
    }

    const formatDate = (date) => {
      if (!date) return null;
      try {
        return format(parseISO(date), 'dd-MM-yyyy');
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
  }, [isViewingCurrentCycle, targetCycle?.startDate, targetCycle?.endDate]);
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
  const isIPhoneOrIPod = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPhone|iPod/i.test(ua);
  }, []);
  const autoFullscreenRef = useRef(false);
  const suppressAutoFullscreenUntilPortraitRef = useRef(false);
  const isFullScreenRef = useRef(isFullScreen);
  const forceLandscapeRef = useRef(forceLandscape);
  const readViewport = () => {
  if (typeof window === 'undefined') return { w: 0, h: 0 };
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth ?? 0;
  const h = vv?.height ?? window.innerHeight ?? 0;
  return { w: Math.round(w), h: Math.round(h) };
};

const [viewport, setViewport] = useState(readViewport);

const setViewportIfChanged = useCallback((nextViewport) => {
  setViewport((prev) =>
    prev.w === nextViewport.w && prev.h === nextViewport.h ? prev : nextViewport
  );
}, []);

useEffect(() => {
  if (typeof window === 'undefined') return undefined;

  let raf = 0;
  const vv = window.visualViewport;

  const onResize = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setViewportIfChanged(readViewport()));
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', onResize);

  onResize();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    vv?.removeEventListener('resize', onResize);
    vv?.removeEventListener('scroll', onResize);
  };
}, [setViewportIfChanged]);

const applyRotation = isFullScreen && forceLandscape && viewport.w < viewport.h;
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);
  const [newCyclePrefillDate, setNewCyclePrefillDate] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [showManualBaseline, setShowManualBaseline] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interpretationSettingsOpen, setInterpretationSettingsOpen] = useState(false);
  const [temperatureRiseEditing, setTemperatureRiseEditing] = useState(false);
  const [temperatureRiseDraft, setTemperatureRiseDraft] = useState({
    baselineTemp: null,
    firstHighIsoDate: null,
  });
  const DRAWER_ANIM_MS = 320; // >= 300ms (tu transition del drawer normal)
const [drawerMounted, setDrawerMounted] = useState(false);

useEffect(() => {
  if (settingsOpen) setDrawerMounted(true);
}, [settingsOpen]);

const openSettings = useCallback(() => {
  setDrawerMounted(true);
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => setSettingsOpen(true));
  } else {
    setSettingsOpen(true);
  }
}, []);

const closeSettings = useCallback(() => {
  setSettingsOpen(false);
}, []);

const toggleSettings = useCallback(() => {
  if (settingsOpen) closeSettings();
  else openSettings();
}, [settingsOpen, openSettings, closeSettings]);

useEffect(() => {
  if (settingsOpen) return;
  if (!drawerMounted) return;
  if (typeof window === 'undefined') {
    setDrawerMounted(false);
    return;
  }
  const t = window.setTimeout(() => setDrawerMounted(false), DRAWER_ANIM_MS);
  return () => window.clearTimeout(t);
}, [settingsOpen, drawerMounted]);
  const [phaseOverlay, setPhaseOverlay] = useState(null);
  const [chartSettings, setChartSettings] = useState(() => {
    const defaults = normalizeStoredPreferences(PREFERENCE_DEFAULTS);
    return {
      showRelationsRow: defaults.showRelationsRow,
      fertilityStartConfig: mergeFertilityStartConfig({
        current: defaults.fertilityStartConfig,
      }),
    };
  });
  
useEffect(() => {
  const normalizedPreferences = normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS);
  const preferenceConfig = mergeFertilityStartConfig({
    current: normalizedPreferences.fertilityStartConfig,
  });
  setChartSettings((prev) => {
    const sameRelations = prev.showRelationsRow === normalizedPreferences.showRelationsRow;
    const sameConfig = JSON.stringify(prev.fertilityStartConfig) === JSON.stringify(preferenceConfig);
    if (sameRelations && sameConfig) return prev;
    return {
      ...prev,
      showRelationsRow: normalizedPreferences.showRelationsRow,
      fertilityStartConfig: preferenceConfig,
    };
  });
}, [preferences]);

  const fertilityConfig = useMemo(
    () => mergeFertilityStartConfig({ incoming: chartSettings.fertilityStartConfig }),
    [chartSettings.fertilityStartConfig]
  );
  const cyclePostpartumMode = Boolean(targetCycle?.postpartumMode);

  const fertilityStartConfig = useMemo(
    () => ({
      ...fertilityConfig,
      postpartum: cyclePostpartumMode,
      calculators: {
        ...fertilityConfig.calculators,
        cpm: !cyclePostpartumMode && fertilityConfig.calculators.cpm && cpmSelection !== 'none',
        t8: !cyclePostpartumMode && fertilityConfig.calculators.t8 && t8Selection !== 'none',
      },
    }),
    [fertilityConfig, cpmSelection, t8Selection, cyclePostpartumMode]
  );

  const ignoreNextClickRef = useRef(false);
  const keepFormOpenUntilRef = useRef(0);
  const phaseOverlayCardRef = useRef(null);
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
  }, [isFullScreen]);;

  useLayoutEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [orientation, isFullScreen]);
  
  useEffect(() => {
    isFullScreenRef.current = isFullScreen;
  }, [isFullScreen]);

  useEffect(() => {
    forceLandscapeRef.current = forceLandscape;
  }, [forceLandscape]);
  useEffect(() => {
  if (typeof window === 'undefined') return undefined;

  let raf = 0;

  const handleOrientationChange = () => {
    if (raf) cancelAnimationFrame(raf);

    raf = requestAnimationFrame(() => {
      const nextOrientation =
        window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

      setOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));

      if (!isIPhoneOrIPod) return;

      if (nextOrientation === 'landscape') {
        if (suppressAutoFullscreenUntilPortraitRef.current) {
          return;
        }

        const shouldEnableAutoFullscreen =
          !isFullScreenRef.current && !forceLandscapeRef.current;

        if (shouldEnableAutoFullscreen) {
          autoFullscreenRef.current = true;
          setIsFullScreen((prev) => (prev ? prev : true));
          setForceLandscape((prev) => (prev ? prev : true));
          isFullScreenRef.current = true;
          forceLandscapeRef.current = true;
        }
        return;
      }

      suppressAutoFullscreenUntilPortraitRef.current = false;

      if (autoFullscreenRef.current) {
        autoFullscreenRef.current = false;
        setForceLandscape((prev) => (prev ? false : prev));
        setIsFullScreen((prev) => (prev ? false : prev));
        forceLandscapeRef.current = false;
        isFullScreenRef.current = false;
      }
    });
  };

  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);

  handleOrientationChange();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', handleOrientationChange);
    window.removeEventListener('orientationchange', handleOrientationChange);
  };
}, [isIPhoneOrIPod]);
  if (showLoading) {
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 bg-[#FFF8FA] px-4 py-8 text-center text-fertiliapp-fuerte">
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

  const CYCLE_DURATION_DAYS = 28;
  const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 8;
  const VISIBLE_DAYS_FULLSCREEN_LANDSCAPE = 20;

  const cycleStartDate = parseISO(targetCycle.startDate);
  const cycleEntries = targetCycle.data || [];
  const currentPeakIsoDate = useMemo(() => {
    const peakRecord = Array.isArray(cycleEntries)
      ? cycleEntries.find((record) => record?.peak_marker === 'peak')
      : null;
    return peakRecord?.isoDate || null;
  }, [cycleEntries]);

  const lastRecordDate = cycleEntries.reduce((maxDate, record) => {
    const recDate = parseISO(record.isoDate);
    return recDate > maxDate ? recDate : maxDate;
  }, cycleStartDate);

  const today = startOfDay(new Date());
  const isArchivedCycle = !isViewingCurrentCycle;
  const archivedEndDate = isArchivedCycle && targetCycle?.endDate
    ? startOfDay(parseISO(targetCycle.endDate))
    : null;
  const lastRelevantDate = isArchivedCycle
    ? (archivedEndDate ?? lastRecordDate)
    : (lastRecordDate > today ? lastRecordDate : today);
  const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
  const computedDaysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);
  const maxArchivedDays = archivedEndDate
    ? differenceInDays(archivedEndDate, cycleStartDate) + 1
    : null;
  const daysInCycle = maxArchivedDays ? Math.min(computedDaysInCycle, maxArchivedDays) : computedDaysInCycle;

  const fullCyclePlaceholders = useMemo(
    () => generatePlaceholders(cycleStartDate, daysInCycle),
    [cycleStartDate, daysInCycle]
  );
  const cycleEntriesByIsoDate = useMemo(
    () => new Map(cycleEntries.map((entry) => [entry.isoDate, entry])),
    [cycleEntries]
  );
  const mergedData = useMemo(
    () => fullCyclePlaceholders.map((placeholder) => {
      const existingRecord = cycleEntriesByIsoDate.get(placeholder.isoDate);
      return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
    }),
    [cycleEntriesByIsoDate, fullCyclePlaceholders]
  );
  const temperatureRiseOverride = useMemo(
    () => normalizeTemperatureRiseOverride(targetCycle?.interpretationOverrides?.temperatureRise),
    [targetCycle?.interpretationOverrides?.temperatureRise]
  );
  const hasManualTemperatureRiseOverride = temperatureRiseOverride.mode === 'manual';
  const interpretationProcessedData = useMemo(() => {
    const peakStatuses = computePeakStatuses(mergedData);
    return prepareChartData(mergedData, peakStatuses);
  }, [mergedData]);
  const automaticTemperatureRiseMetrics = useMemo(
    () => computeOvulationMetrics(interpretationProcessedData, { postpartum: cyclePostpartumMode }),
    [interpretationProcessedData, cyclePostpartumMode]
  );
  const manualTemperatureRiseEvaluation = useMemo(
    () =>
      evaluateTemperatureRiseOverride(interpretationProcessedData, temperatureRiseOverride, {
        postpartum: cyclePostpartumMode,
      }),
    [interpretationProcessedData, temperatureRiseOverride, cyclePostpartumMode]
  );
  const buildTemperatureRiseSummary = useCallback(
    ({ baselineTemp, firstHighIndex, ovulationDetails, status }) => {
      const confirmationIndex = Number.isInteger(ovulationDetails?.confirmationIndex)
        ? ovulationDetails.confirmationIndex
        : null;
      return {
        baselineTemp: Number.isFinite(Number(baselineTemp)) ? Number(baselineTemp) : null,
        firstHighIsoDate: Number.isInteger(firstHighIndex)
          ? interpretationProcessedData[firstHighIndex]?.isoDate ?? null
          : null,
        confirmationIsoDate: Number.isInteger(confirmationIndex)
          ? interpretationProcessedData[confirmationIndex]?.isoDate ?? null
          : null,
        rule: ovulationDetails?.rule ?? null,
        status:
          status ??
          (ovulationDetails?.confirmed
            ? 'confirmed'
            : ovulationDetails?.requireRebaseline
              ? 'invalid'
              : 'pending'),
      };
    },
    [interpretationProcessedData]
  );
  const automaticTemperatureRiseSummary = useMemo(
    () =>
      buildTemperatureRiseSummary({
        baselineTemp: automaticTemperatureRiseMetrics?.baselineTemp,
        firstHighIndex: automaticTemperatureRiseMetrics?.firstHighIndex,
        ovulationDetails: automaticTemperatureRiseMetrics?.ovulationDetails,
        status: automaticTemperatureRiseMetrics?.ovulationDetails?.confirmed ? 'confirmed' : 'pending',
      }),
    [automaticTemperatureRiseMetrics, buildTemperatureRiseSummary]
  );
  const manualTemperatureRiseSummary = useMemo(
    () => {
      const summary = buildTemperatureRiseSummary({
        baselineTemp: manualTemperatureRiseEvaluation?.baselineTemp ?? temperatureRiseOverride.baselineTemp,
        firstHighIndex: manualTemperatureRiseEvaluation?.firstHighIndex,
        ovulationDetails: manualTemperatureRiseEvaluation?.ovulationDetails,
        status: manualTemperatureRiseEvaluation?.status,
      });
      return {
        ...summary,
        firstHighIsoDate: summary.firstHighIsoDate ?? temperatureRiseOverride.firstHighIsoDate,
      };
    },
    [
      buildTemperatureRiseSummary,
      manualTemperatureRiseEvaluation,
      temperatureRiseOverride.baselineTemp,
      temperatureRiseOverride.firstHighIsoDate,
    ]
  );

  const visualOrientation = forceLandscape ? 'landscape' : orientation;
  const isLandscapeFullscreen = isFullScreen && visualOrientation === 'landscape';
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
    } else {
    const endIndex = daysInCycle;
    scrollStart = Math.max(0, endIndex - visibleDays);
  }
  const baseStyle = {
    backgroundColor: '#FFF8FA',
  };
  const containerStyle = isFullScreen
  ? {
      ...baseStyle,
      boxSizing: 'border-box',
    }
  : {
      ...baseStyle,
      height: '100%',
      maxHeight: '100%',
      boxSizing: 'border-box',
    };

      const isRotatedFullScreen = isFullScreen && applyRotation;
      

      const normalDrawerClassName =
  `fixed top-0 right-0 z-[320] h-app w-72 sm:w-80 transform transition-transform duration-300 ease-in-out ${
    settingsOpen ? 'translate-x-0' : 'translate-x-full'
  }`;

const rotatedStageStyle = applyRotation
  ? {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: `${viewport.h}px`,
      height: `${viewport.w}px`,
      transform: 'translate(-50%, -50%) rotate(90deg)',
      transformOrigin: 'center center',
      zIndex: 320,
      pointerEvents: settingsOpen ? 'auto' : 'none',
      boxSizing: 'border-box',

      // padding “mapeando” safe-area al escenario rotado
      paddingTop: 'calc(env(safe-area-inset-left) + 8px)',
      paddingRight: 'calc(env(safe-area-inset-top) + 8px)',
      paddingBottom: 'calc(env(safe-area-inset-right) + 8px)',
      paddingLeft: 'calc(env(safe-area-inset-bottom) + 8px)',
    }
  : undefined;

const rotatedDrawerStyle = applyRotation
  ? {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,

      // “mitad derecha” del área visible (con límites)
      width: 'clamp(280px, 50%, 420px)',

      opacity: settingsOpen ? 1 : 0,
      transform: settingsOpen ? 'translateX(0)' : 'translateX(16px)',
      transition: 'opacity 180ms ease, transform 220ms ease',
    }
  : undefined;

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
  const handleRelationsSettingChange = async (checked) => {
    const nextValue = checked === true;
    setChartSettings((prev) => ({
      ...prev,
      showRelationsRow: nextValue,
    }));
    
    if (typeof savePreferences === 'function') {
      try {
        await savePreferences({ showRelationsRow: nextValue });
        toast({
          title: nextValue ? 'Fila de relaciones activada' : 'Fila de relaciones oculta',
        });
      } catch (error) {
        console.error('Failed to persist relations row preference', error);
        toast({
          title: 'No se pudo actualizar la preferencia',
          description: 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      }
    }
  };
  const handleFertilityCalculatorChange = async (calculatorKey, checked) => {
    let nextConfig = null;
    setChartSettings((prev) => {
      const currentConfig = mergeFertilityStartConfig({ incoming: prev.fertilityStartConfig });
      const nextValue = checked === true;
      if (currentConfig.calculators?.[calculatorKey] === nextValue) {
        return prev;
      }
      nextConfig = {
        ...currentConfig,
        calculators: {
          ...currentConfig.calculators,
          [calculatorKey]: nextValue,
        },
      };
      return {
        ...prev,
        fertilityStartConfig: nextConfig,
      };
    });
    
    if (nextConfig && typeof savePreferences === 'function') {
      try {
        await savePreferences({ fertilityStartConfig: nextConfig });
        const calculatorLabel = calculatorKey === 'cpm' ? 'CPM' : 'T-8';
        toast({
          title: checked === true
            ? `${calculatorLabel} activado para inicio de fertilidad`
            : `${calculatorLabel} desactivado para inicio de fertilidad`,
        });
      } catch (error) {
        console.error('Failed to persist calculator preference', error);
        toast({
          title: 'No se pudo actualizar la preferencia',
          description: 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      }
    }
  };
  
  const handlePostpartumChange = async (checked) => {
    if (!targetCycle?.id || typeof updateCyclePostpartumMode !== 'function') return;
    try {
      await updateCyclePostpartumMode(targetCycle.id, checked === true);
      toast({
        title: checked === true ? 'Modo postparto activado' : 'Modo postparto desactivado',
      });
    } catch (error) {
      console.error('Failed to persist postpartum mode for cycle', error);
      toast({
        title: 'No se pudo actualizar el modo postparto',
        description: 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const refreshFallbackCycle = useCallback(async () => {
    if (!isUsingFallbackCycle || !targetCycle?.id) return;
    const refreshed = await getCycleById(targetCycle.id);
    if (refreshed) {
      setFetchedCycle(refreshed);
    }
  }, [getCycleById, isUsingFallbackCycle, targetCycle?.id]);

  const openInterpretationSettings = useCallback(() => {
    setInterpretationSettingsOpen(true);
    setSettingsOpen(false);
  }, []);

  const handleStartTemperatureRiseEdit = useCallback(() => {
    const existingManual = hasManualTemperatureRiseOverride ? temperatureRiseOverride : null;
    setTemperatureRiseDraft({
      baselineTemp:
        existingManual?.baselineTemp ??
        automaticTemperatureRiseSummary?.baselineTemp ??
        null,
      firstHighIsoDate:
        existingManual?.firstHighIsoDate ??
        automaticTemperatureRiseSummary?.firstHighIsoDate ??
        null,
    });
    setShowInterpretation(true);
    setShowManualBaseline(false);
    setTemperatureRiseEditing(true);
  }, [
    automaticTemperatureRiseSummary?.baselineTemp,
    automaticTemperatureRiseSummary?.firstHighIsoDate,
    hasManualTemperatureRiseOverride,
    temperatureRiseOverride,
  ]);

  const handleCancelTemperatureRiseEdit = useCallback(() => {
    setTemperatureRiseEditing(false);
    setTemperatureRiseDraft({ baselineTemp: null, firstHighIsoDate: null });
  }, []);

  const handleSaveTemperatureRiseEdit = useCallback(async () => {
    if (!targetCycle?.id || typeof updateCycleInterpretationOverrides !== 'function') return;
    const nextOverride = createManualTemperatureRiseOverride(temperatureRiseDraft);
    if (nextOverride.baselineTemp == null || !nextOverride.firstHighIsoDate) return;

    try {
      await updateCycleInterpretationOverrides(targetCycle.id, {
        temperatureRise: nextOverride,
      });
      await refreshFallbackCycle();
      setTemperatureRiseEditing(false);
      setInterpretationSettingsOpen(true);
      toast({ title: 'Subida termica manual guardada' });
    } catch (error) {
      console.error('Failed to persist temperature rise override', error);
      toast({
        title: 'No se pudo guardar la subida termica',
        description: 'Intentalo de nuevo.',
        variant: 'destructive',
      });
    }
  }, [
    refreshFallbackCycle,
    targetCycle?.id,
    temperatureRiseDraft,
    toast,
    updateCycleInterpretationOverrides,
  ]);

  const handleResetTemperatureRiseAuto = useCallback(async () => {
    if (!targetCycle?.id || typeof updateCycleInterpretationOverrides !== 'function') return;
    try {
      await updateCycleInterpretationOverrides(targetCycle.id, {
        temperatureRise: createAutoTemperatureRiseOverride(),
      });
      await refreshFallbackCycle();
      setTemperatureRiseEditing(false);
      toast({ title: 'Subida termica automatica activada' });
    } catch (error) {
      console.error('Failed to reset temperature rise override', error);
      toast({
        title: 'No se pudo volver a automatico',
        description: 'Intentalo de nuevo.',
        variant: 'destructive',
      });
    }
  }, [refreshFallbackCycle, targetCycle?.id, toast, updateCycleInterpretationOverrides]);

  const handleTemperatureRiseDraftBaselineChange = useCallback((baselineTemp) => {
    setTemperatureRiseDraft((prev) => (
      Number(prev.baselineTemp) === Number(baselineTemp)
        ? prev
        : { ...prev, baselineTemp }
    ));
  }, []);

  const handleTemperatureRiseFirstHighSelect = useCallback((firstHighIsoDate) => {
    setTemperatureRiseDraft((prev) => (
      prev.firstHighIsoDate === firstHighIsoDate
        ? prev
        : { ...prev, firstHighIsoDate }
    ));
  }, []);

  const settingsDrawerInner = (
        <div className="flex h-full min-h-0 flex-col gap-6 rounded-l-2xl border border-rose-100/60 bg-white p-6 pt-[calc(env(safe-area-inset-top)+24px)] shadow-xl">
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
            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-pink-100/70 bg-pink-50/40 p-4">
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
    <Label htmlFor="toggle-relations-row" className="text-sm font-semibold text-slate-700">
      Mostrar relaciones
    </Label>

    <Checkbox
      id="toggle-relations-row"
      variant="switch"
      checked={chartSettings.showRelationsRow}
      onCheckedChange={handleRelationsSettingChange}
      className="mt-0.5"
    />

    <p className="col-span-2 text-xs leading-relaxed text-slate-500">
      Añade una fila para visualizar las relaciones sexuales.
    </p>
  </div>
</div>
              
              <div className="rounded-2xl border border-red-100/70 bg-red-50/40 p-4">
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
    <div className="flex items-center gap-2 min-w-0">
      <span className="inline-flex items-center justify-center rounded-full  bg-rose-50/90 p-1 text-rose-600">
        <Baby className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-slate-700">Modo postparto</p>
    </div>

    <Checkbox
      variant="switch"
      checked={cyclePostpartumMode}
      onCheckedChange={handlePostpartumChange}
      className="mt-0.5"
    />

    <p className="col-span-2 text-xs leading-relaxed text-slate-500">
      Si está activo, se aplicarán sus reglas correspondientes.
    </p>
  </div>
</div> 

              <div className="rounded-2xl border border-orange-100/70 bg-orange-50/40 p-4">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">
                      Ajustes de interpretacion
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-500">
                      Configura como se interpreta este ciclo.
                    </p>
                  </div>
                  <p className="rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-red-700">
                    Subida termica: {hasManualTemperatureRiseOverride ? 'Manual' : 'Automatica'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center border-orange-200 bg-white text-red-700 hover:bg-orange-50"
                    onClick={openInterpretationSettings}
                  >
                    Abrir ajustes de interpretacion
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100/70 bg-amber-50/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Cálculo</h3>
                  <p className="text-xs text-slate-500">
                    Indica el método que se utilizará para el cálculo de inicio de la ventana fértil.
                  </p>
                </div>
                {cyclePostpartumMode && (
                  <p className="text-xs font-medium text-rose-500">
                    El modo posparto está activo: CPM y T-8 se omiten del cálculo final.
                  </p>
                )}
                <div className="space-y-2">
                  {FERTILITY_CALCULATOR_OPTIONS.map((option) => (
                    <div key={option.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-700">{option.label}</span>
                      <Checkbox
  variant="check"
  checked={Boolean(fertilityConfig.calculators?.[option.key])}
  disabled={cyclePostpartumMode}
  onCheckedChange={(checked) => handleFertilityCalculatorChange(option.key, checked)}
/>
                    </div>
                  ))}
                </div>
              </div>              
            </div> 
          </div>
      );
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

  const handleOpenNewCycleDialog = useCallback((initialIsoDate = null) => {
    setNewCyclePrefillDate(initialIsoDate || editingRecord?.isoDate || null);
    setShowNewCycleDialog(true);
  }, [editingRecord?.isoDate]);

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
  const closePhaseOverlay = useCallback(() => {
    setPhaseOverlay(null);
  }, []);
  const toggleInterpretation = () => {
    setShowInterpretation((current) => {
      const next = !current;
      if (!next) {
        setPhaseOverlay(null);
      }
      return next;
    });
  };
  useEffect(() => {
    if (!showInterpretation && phaseOverlay) {
      setPhaseOverlay(null);
    }
  }, [phaseOverlay, showInterpretation]);
  useEffect(() => {
    if (!phaseOverlay) return undefined;

    const handlePointerDown = (event) => {
      if (phaseOverlayCardRef.current?.contains(event.target)) {
        return;
      }
      closePhaseOverlay();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePhaseOverlay();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePhaseOverlay, phaseOverlay]);
  const handleInterpretationClick = (event) => {
    event.preventDefault();
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    toggleInterpretation();
  };

  const handleInterpretationPointerUp = (event) => {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      ignoreNextClickRef.current = true;
      toggleInterpretation();
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

  const handleShowPhaseInfo = useCallback(
    (info = {}) => {
      if (!info) return;
      const phase = info.phase ?? null;
      const reasons = info.reasons ?? {};
      const aggregate = reasons?.aggregate ?? null;
      const usedCandidates = Array.isArray(aggregate?.usedCandidates) ? aggregate.usedCandidates : [];
      const fertileWindow = reasons?.window ?? reasons?.fertileWindow ?? null;
      const fertileStartIndex = Number.isInteger(reasons?.startIndex)
        ? reasons.startIndex
        : Number.isInteger(reasons?.fertileStartFinalIndex)
          ? reasons.fertileStartFinalIndex
          : null;

      const postpartumActive = cyclePostpartumMode;

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

      const getValidPhaseDate = (index) => {
        const formattedDate = formatDateFromIndex(index);
        return typeof formattedDate === 'string' && /^\d{2}\/\d{2}$/.test(formattedDate)
          ? formattedDate
          : null;
      };

      const formatFertileStartConsequence = (date) =>
        date ? `Ventana fértil desde el ${date}.` : 'Ventana fértil abierta.';

      const formatInfertileStartConsequence = (date) =>
        date ? `Inicio fase postovulatoria confirmada desde el ${date}.` : 'Inicio fase postovulatoria calculada.';

      const getStartCauseKind = () => {
        const { candidate } = findCandidateForStart();
        const source = normalizeSource(candidate);
        if (source === 'CPM') return 'cpm';
        if (source === 'T8' || source === 'T-8') return 't8';

        const reasonText = (candidate?.reason ?? '').toUpperCase();
        if (reasonText === 'P' || reasonText.includes('PEAK') || reasonText.includes('PICO')) {
          return 'peak';
        }
        if (
          reasonText.includes('M+') ||
          reasonText === 'F' ||
          reasonText.includes('WHITE') ||
          reasonText.includes('CLARA')
        ) {
          return 'highMucus';
        }
        if (reasonText === 'M' || reasonText.includes('MOCO')) {
          return 'mucus';
        }
        if (reasonText.includes('S') || reasonText.includes('BIP')) {
          return 'sign';
        }
        if (reasons?.source === 'marker' || reasons?.details?.explicitStartDay != null) {
          return 'sign';
        }
        if (!reasonText && !source) return null;
        return 'sign';
      };

      const getFertileStartExplanation = () => {
        switch (getStartCauseKind()) {
          case 'mucus':
            return 'Termina porque se ha registrado moco.';
          case 'highMucus':
            return 'Termina porque se ha registrado moco de mayor fertilidad.';
          case 'peak':
            return 'Termina porque se ha registrado día pico.';
          case 'cpm':
            return 'Termina por cálculo CPM.';
          case 't8':
            return 'Termina por cálculo T-8.';
          case 'sign':
            return 'Termina porque se ha registrado un signo fértil.';
          default:
            return 'Termina porque se ha registrado un signo fértil.';
        }
      };

      const incomingTitle =
        typeof info?.label === 'string' && info.label.trim()
          ? info.label
          : typeof info?.message === 'string' && info.message.trim()
            ? info.message
            : '';

      let title = '';
      let message = '';
      let description = null;

      if (phase === 'relativeInfertile') {
        title = incomingTitle || 'Relativamente infértil';
        const currentLimitIndex = Number.isInteger(info?.limitIndex)
          ? info.limitIndex
          : Number.isInteger(info?.endIndex)
            ? info.endIndex
            : Number.isInteger(info?.todayIndex)
              ? info.todayIndex
              : null;
        const fertileStarted = Number.isInteger(fertileStartIndex)
          && Number.isInteger(currentLimitIndex)
          && fertileStartIndex <= currentLimitIndex;
        const startDate = getValidPhaseDate(fertileStartIndex);

        if (!fertileStarted) {
          message = 'Todavía no hay inicio fértil calculado.';
          description = 'Faltan datos para abrir la ventana fértil.';
        } else {
          message = getFertileStartExplanation();
          description = formatFertileStartConsequence(startDate);
        }

        } else if (phase === 'fertile') {
        title = incomingTitle || 'Fértil';
        const hasMucusClosure = Number.isInteger(fertileWindow?.mucusInfertileStartIndex);
        const hasTemperatureClosure = Number.isInteger(fertileWindow?.temperatureInfertileStartIndex);
        const infertileStartDate = getValidPhaseDate(
          Number.isInteger(reasons?.details?.absoluteStartIndex)
            ? reasons.details.absoluteStartIndex
            : Number.isInteger(fertileWindow?.postOvulatoryStartIndex)
              ? fertileWindow.postOvulatoryStartIndex
              : info?.endIndex + 1
        );

        if (!hasMucusClosure && !hasTemperatureClosure) {
          message = 'La ventana fértil está abierta.';
          description = 'Aún no hay cierre por moco ni por temperatura.';
        } else if (hasMucusClosure && hasTemperatureClosure) {
          message = postpartumActive
            ? 'Cierre por moco posparto registrado y temperatura confirmada.'
            : 'Termina al cumplirse el cierre por moco y temperatura.';
          description = formatInfertileStartConsequence(infertileStartDate);
        } else if (hasMucusClosure) {
          message = 'Hay cierre por moco registrado.';
          description = 'Falta confirmación por temperatura.';
        } else if (hasTemperatureClosure) {
          message = 'La subida de temperatura está confirmada.';
          description = 'Falta cierre por moco.';
        }

      } else if (phase === 'postOvulatory') {
  const displayLabel = (info?.displayLabel ?? info?.label ?? '').toLowerCase();
  const status = info?.status ?? reasons?.status ?? null;
  const segmentStartDate = getValidPhaseDate(info?.startIndex);

  if (status === 'absolute' || info?.displayLabel === 'Infertilidad postovulatoria confirmada') {
  title = incomingTitle || 'Infertilidad postovulatoria confirmada';
  message = postpartumActive
    ? 'Cierre por moco posparto registrado y temperatura confirmada.'
    : 'Cierre por moco registrado y subida de temperatura confirmada.';
  description = formatInfertileStartConsequence(segmentStartDate);
} else if (displayLabel.includes('moco')) {
    title = incomingTitle || 'Infertilidad estimada por moco';
    message = 'Hay cierre por moco registrado.';
    description = 'Falta confirmación por temperatura.';
  } else if (displayLabel.includes('temperatura')) {
    title = incomingTitle || 'Infertilidad estimada por temperatura';
    message = 'La subida de temperatura está confirmada.';
    description = 'Falta cierre por moco.';
  } else {
    title = incomingTitle || 'Fase postovulatoria';
    message = status === 'pending'
      ? 'La ventana fértil está abierta.'
      : 'No hay datos suficientes para explicar esta fase.';
    description = status === 'pending'
      ? 'Aún no hay cierre por moco ni por temperatura.'
      : 'Revisa los registros del ciclo.';
  }
      } else if (phase === 'nodata') {
        const status = reasons?.status ?? info?.status ?? null;
        if (status === 'no-fertile-window') {
          title = incomingTitle || 'Sin ventana fértil identificable';
          message = 'Todavía no hay inicio fértil calculado.';
          description = 'Faltan datos para abrir la ventana fértil.';
        } else {
          title = incomingTitle || 'Sin datos suficientes';
          message = 'No hay datos suficientes para explicar esta fase.';
          description = 'Revisa los registros del ciclo.';
        }
      } else if (info?.message) {
        title = incomingTitle;
        message = 'No hay datos suficientes para explicar esta fase.';
        description = 'Revisa los registros del ciclo.';
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
        postpartumActive,
      });
    },
    [cyclePostpartumMode, formatDateFromIndex]
  );

  const handleToggleFullScreen = () => {
  const isCurrentlyLandscape =
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight;

  if (!isFullScreen) {
    autoFullscreenRef.current = false;
    suppressAutoFullscreenUntilPortraitRef.current = false;

    isFullScreenRef.current = true;
    forceLandscapeRef.current = true;

    setIsFullScreen(true);
    setForceLandscape(true);

    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
      });
    }
    return;
  }

  // Si venimos de auto-fullscreen por giro de iPhone,
  // el primer toque convierte el modo en manual fijo
  // en vez de sacarnos del fullscreen.
  if (autoFullscreenRef.current) {
    autoFullscreenRef.current = false;
    suppressAutoFullscreenUntilPortraitRef.current = true;

    isFullScreenRef.current = true;
    forceLandscapeRef.current = true;

    setIsFullScreen(true);
    setForceLandscape(true);

    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
      });
    }
    return;
  }

  // Salida real de fullscreen manual
  autoFullscreenRef.current = false;
  suppressAutoFullscreenUntilPortraitRef.current = isCurrentlyLandscape;

  forceLandscapeRef.current = false;
  isFullScreenRef.current = false;

  setForceLandscape(false);

  const nextOrientation =
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight
      ? 'landscape'
      : 'portrait';

  setOrientation(nextOrientation);
  setIsFullScreen(false);
};

  return (
    <MainLayout hideBottomNav={isFullScreen}>
      <div
  className={
    isFullScreen
      ? 'fixed inset-0 z-50 overflow-hidden'
      : 'relative w-full h-full overflow-hidden'
  }
  style={containerStyle}
>
        {chartCycleLabel && (
  <div className="pointer-events-none absolute z-[120]" style={{ inset: 0 }}>
    {isRotatedFullScreen ? (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: 'calc(env(safe-area-inset-right) + 8px)',
          transform: 'translateY(-50%)',
        }}
      >
        <div
          style={{
            transform: 'rotate(90deg)',
            transformOrigin: 'right center',
          }}
        >
          <div className="flex items-center justify-center gap-2 pt-3">
  <div className="whitespace-nowrap text-center text-[11px] font-medium leading-tight text-slate-500">
    {chartCycleLabel}
  </div>

  {cyclePostpartumMode && (
    <span
      className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50/90 p-1.5 text-rose-600 backdrop-blur-sm"
      aria-label="Modo postparto activado"
      title="Modo postparto activado"
    >
      <Baby className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )}
</div>
        </div>
      </div>
    ) : (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: isFullScreen ? 'calc(env(safe-area-inset-top) + 12px)' : '12px',
          transform: 'translateX(-50%)',
        }}
      >
        <div className="flex items-center justify-center gap-1.5">
  <div className="whitespace-nowrap text-center text-[11px] font-medium leading-tight text-slate-500">
    {chartCycleLabel}
  </div>

  {cyclePostpartumMode && (
    <span
      className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50/90 p-1.5 text-rose-600 backdrop-blur-sm"
      aria-label="Modo postparto activado"
      title="Modo postparto activado"
    >
      <Baby className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )}
</div>
      </div>
    )}
  </div>
)}
        <ChartControls
          isFullScreen={isFullScreen}
          isLandscapeFullscreen={isLandscapeFullscreen}
          showBackToCycleRecords={showBackToCycleRecords}
          targetCycleId={targetCycle.id}
          showInterpretation={showInterpretation}
          showManualBaseline={showManualBaseline}
          onToggleInterpretation={handleInterpretationClick}
          onToggleManualBaseline={() => setShowManualBaseline((prev) => !prev)}
          onInterpretationPointerUp={handleInterpretationPointerUp}
          onToggleFullScreen={handleToggleFullScreen}
          onToggleSettings={toggleSettings}
        />
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
          showInterpretation={showInterpretation}
          showManualBaseline={showManualBaseline}
          reduceMotion={true}
          forceLandscape={forceLandscape}
          currentPeakIsoDate={currentPeakIsoDate}
          showRelationsRow={chartSettings.showRelationsRow}
          fertilityStartConfig={fertilityStartConfig}
          fertilityCalculatorCycles={fertilityCalculatorCycles}
          fertilityCalculatorCandidates={combinedFertilityCalculatorCandidates}
          onShowPhaseInfo={handleShowPhaseInfo}
          isArchivedCycle={!isViewingCurrentCycle}
          cycleEndDate={targetCycle?.endDate ?? null}
          measuredViewport={viewport}
          temperatureRiseOverride={temperatureRiseOverride}
          temperatureRiseEditMode={temperatureRiseEditing}
          temperatureRiseDraftBaselineTemp={temperatureRiseDraft.baselineTemp}
          temperatureRiseDraftFirstHighIsoDate={temperatureRiseDraft.firstHighIsoDate}
          onTemperatureRiseDraftBaselineChange={handleTemperatureRiseDraftBaselineChange}
          onTemperatureRiseFirstHighSelect={handleTemperatureRiseFirstHighSelect}
        />
        
        {drawerMounted && (
  <>
    {/* Backdrop */}
    {settingsOpen && (
      <div
        className={`fixed inset-0 ${applyRotation ? 'z-[300]' : 'z-[300]'} bg-black/30`}
        onClick={closeSettings}
        aria-hidden="true"
      />
    )}

    {/* Drawer */}
    {applyRotation ? (
      <div
        style={rotatedStageStyle}
        onClick={closeSettings}
        aria-hidden={!settingsOpen}
      >
        <div
          style={rotatedDrawerStyle}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {settingsDrawerInner}
        </div>
      </div>
    ) : (
      <div className={normalDrawerClassName} role="dialog" aria-modal="true">
        {settingsDrawerInner}
      </div>
    )}
  </>
)}
        <PhaseInfoFloatingCard
          phaseOverlay={phaseOverlay}
          onClose={closePhaseOverlay}
          cardRef={phaseOverlayCardRef}
          isRotated={applyRotation}
          viewport={viewport}
        />

        <InterpretationSettingsDialog
          open={interpretationSettingsOpen || temperatureRiseEditing}
          editing={temperatureRiseEditing}
          manualActive={hasManualTemperatureRiseOverride}
          automaticSummary={automaticTemperatureRiseSummary}
          manualSummary={manualTemperatureRiseSummary}
          draft={temperatureRiseDraft}
          canSave={
            Number.isFinite(Number(temperatureRiseDraft.baselineTemp)) &&
            Boolean(temperatureRiseDraft.firstHighIsoDate)
          }
          onClose={() => setInterpretationSettingsOpen(false)}
          onStartEdit={handleStartTemperatureRiseEdit}
          onCancelEdit={handleCancelTemperatureRiseEdit}
          onSaveEdit={handleSaveTemperatureRiseEdit}
          onResetAuto={handleResetTemperatureRiseAuto}
          isRotated={applyRotation}
          viewport={viewport}
          isFullScreen={isFullScreen}
        />

        <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
          <DialogContent
            unstyled
            hideClose
            className="bg-transparent border-none p-0 text-gray-800 w-[96vw] max-w-2xl h-[92dvh] max-h-[92dvh] overflow-hidden shadow-none"
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
              onOpenNewCycle={handleOpenNewCycleDialog}
            />
          </DialogContent>
        </Dialog>
        
        <NewCycleDialog
          isOpen={showNewCycleDialog}
          onClose={() => {
            setShowNewCycleDialog(false);
            setNewCyclePrefillDate(null);
          }}
          onPreview={(selectedStartDate) => previewStartNewCycle?.(selectedStartDate, targetCycle?.id)}
          onConfirm={async (selectedStartDate) => {
            await startNewCycle(selectedStartDate);
            setShowNewCycleDialog(false);
            setNewCyclePrefillDate(null);
          }}
          currentCycleStartDate={targetCycle?.startDate}
          currentCycleRecords={targetCycle?.data ?? []}
          initialStartDate={newCyclePrefillDate}
        />
      </div>
    </MainLayout>
  );
};

export default ChartPage;
