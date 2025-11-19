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
import { RotateCcw, Eye, EyeOff, ArrowLeft, Settings, X } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import DataEntryForm from '@/components/DataEntryForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useParams, Link, useLocation } from 'react-router-dom';
import Overlay from '@/components/ui/Overlay';

const CHART_SETTINGS_STORAGE_KEY = 'fertility-chart-settings';

const normalizeDay = (value) => {
  if (Number.isFinite(value)) {
    return Math.round(value);
  }
  return null;
};

const pickCandidateByDay = (candidates, selectedDay) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (selectedDay == null) {
    return candidates[0];
  }
  const normalizedDay = normalizeDay(selectedDay);
  const match = candidates.find((candidate) => normalizeDay(candidate?.day) === normalizedDay);
  return match || candidates[0];
};

const deriveRelativeReason = (aggregate) => {
  if (!aggregate) return 'por cambio en sensación/moco';
  const usedCandidates = Array.isArray(aggregate.usedCandidates) ? aggregate.usedCandidates : [];
  const selectedDay = normalizeDay(aggregate.selectedDay);

  const hasT8Candidate = usedCandidates.some((candidate) => {
    if (!candidate) return false;
    const candidateDay = normalizeDay(candidate.day);
    if (selectedDay != null && candidateDay !== selectedDay) return false;
    const source = String(candidate.source ?? '').toUpperCase();
    return candidate.kind === 'calculator' && (source === 'T8' || source === 'T-8');
  });

  if (hasT8Candidate) {
    return 'por T−8';
  }

  const hasCalculator = usedCandidates.some((candidate) => {
    if (!candidate) return false;
    const candidateDay = normalizeDay(candidate.day);
    if (selectedDay != null && candidateDay !== selectedDay) return false;
    return candidate.kind === 'calculator';
  });

  if (hasCalculator) {
    return 'por T−8';
  }

  return 'por cambio en sensación/moco';
};

const deriveFertileMotivo = (reasons = {}) => {
  const statusSummary = reasons.statusSummary ?? null;
  const reasonParts = statusSummary?.reasonParts ?? {};

  if (reasonParts.symbol === 'white') {
    return 'marcador white';
  }
  if (reasonParts.sensation) {
    return 'cambio en sensación';
  }
  if (reasonParts.appearance) {
    return 'cambio en moco';
  }

  const aggregate = reasons.aggregate ?? null;
  const usedCandidates = Array.isArray(aggregate?.usedCandidates) ? aggregate.usedCandidates : [];
  const selectedDay = normalizeDay(aggregate?.selectedDay);
  const details = reasons.details ?? {};
  const explicitStartDay = Number.isFinite(details?.explicitStartDay)
    ? details.explicitStartDay + 1
    : null;

  if (aggregate?.selectedMode === 'marcador' || (explicitStartDay != null && explicitStartDay === selectedDay)) {
    return 'marcador white';
  }

  const matchingCandidate = pickCandidateByDay(usedCandidates, selectedDay);

  const hasT8Candidate = usedCandidates.some((candidate) => {
    if (!candidate) return false;
    const source = String(candidate.source ?? '').toUpperCase();
    return candidate.kind === 'calculator' && (source === 'T8' || source === 'T-8');
  });

  if (matchingCandidate?.kind === 'calculator' || hasT8Candidate) {
    return 'T−8';
  }

  const candidateReason = String(matchingCandidate?.reason ?? '').toUpperCase();

  if (candidateReason.includes('WHITE')) {
    return 'marcador white';
  }
  if (candidateReason.includes('M')) {
    return 'cambio en moco';
  }
  if (candidateReason.includes('S') || candidateReason.includes('BIP')) {
    return 'cambio en sensación';
  }

  const hasMucusCandidate = usedCandidates.some((candidate) => {
    const reason = String(candidate?.reason ?? '').toUpperCase();
    return reason.includes('M');
  });
  if (hasMucusCandidate) {
    return 'cambio en moco';
  }

  const hasSensationCandidate = usedCandidates.some((candidate) => {
    const reason = String(candidate?.reason ?? '').toUpperCase();
    return reason.includes('S') || reason.includes('BIP');
  });
  if (hasSensationCandidate) {
    return 'cambio en sensación';
  }

  return null;
};

const formatClosureDetail = (reasons = {}) => {
  const mucus = reasons.mucus ?? {};
  const temperature = reasons.temperature ?? {};
  const hasMucus = Number.isInteger(mucus.startIndex);
  const hasTemperature = Number.isInteger(temperature.startIndex);
  const mucusLabel = mucus.thirdDayIndex != null ? 'P+3' : 'P+4';
  const rule = typeof temperature.rule === 'string' ? temperature.rule : '';
  const normalizedRule = rule.toLowerCase();

  if (hasMucus && hasTemperature) {
    if (normalizedRule.includes('oms')) {
      return `${mucusLabel} y T+3 (OMS)`;
    }
    if (normalizedRule.includes('aleman')) {
      return `${mucusLabel} y T+3 (Alemanas)`;
    }
    const ruleSuffix = rule ? ` (${rule})` : '';
    return `${mucusLabel} y T+3${ruleSuffix}`;
  }

  if (hasTemperature) {
    if (normalizedRule.includes('oms') || normalizedRule.includes('aleman')) {
      return `T+3 (${rule})`;
    }
    return `T+3 (${rule || 'temperatura'})`;
  }

  if (hasMucus) {
    return `${mucusLabel} (moco)`;
  }

  return 'criterio indeterminado';
};
const createDefaultFertilityStartConfig = () => ({
  methods: { alemanas: true, oms: true, creighton: true },
  calculators: { cpm: true, t8: true },
  postpartum: false,
  combineMode: 'conservador',
});

const DEFAULT_CHART_SETTINGS = {
  showRelationsRow: false,
  fertilityStartConfig: createDefaultFertilityStartConfig(),
};

const FERTILITY_METHOD_OPTIONS = [
  { key: 'alemanas', label: 'Alemanas' },
  { key: 'oms', label: 'OMS' },
  { key: 'creighton', label: 'Creighton' },
];

const FERTILITY_CALCULATOR_OPTIONS = [
  { key: 'cpm', label: 'CPM' },
  { key: 't8', label: 'T-8' },
];

const COMBINE_MODE_LABELS = {
  conservador: 'Conservador',
  consenso: 'Consenso',
  permisivo: 'Permisivo',
};

const mergeFertilityStartConfig = (incoming) => {
  const base = createDefaultFertilityStartConfig();
  const merged = {
    methods: { ...base.methods },
    calculators: { ...base.calculators },
    postpartum: base.postpartum,
    combineMode: base.combineMode,
  };

  if (incoming && typeof incoming === 'object') {
    Object.keys(merged.methods).forEach((key) => {
      if (typeof incoming?.methods?.[key] === 'boolean') {
        merged.methods[key] = incoming.methods[key];
      }
    });

    let hasExplicitCalculatorValues = false;
    Object.keys(merged.calculators).forEach((key) => {
      if (typeof incoming?.calculators?.[key] === 'boolean') {
        merged.calculators[key] = incoming.calculators[key];
        hasExplicitCalculatorValues = true;
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
    
    if (!hasExplicitCalculatorValues) {
      const { alemanas, oms, creighton } = merged.methods;
      if (alemanas) {
        merged.calculators.cpm = true;
        merged.calculators.t8 = true;
      } else if (oms || creighton) {
        merged.calculators.cpm = false;
        merged.calculators.t8 = false;
      }
    }
  } else {
    const { alemanas, oms, creighton } = merged.methods;
    if (alemanas) {
      merged.calculators.cpm = true;
      merged.calculators.t8 = true;
    } else if (oms || creighton) {
      merged.calculators.cpm = false;
      merged.calculators.t8 = false;
    }
  }

  return merged;
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
    getCycleById
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
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
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
  const fertilityConfig = useMemo(
    () => mergeFertilityStartConfig(chartSettings.fertilityStartConfig),
    [chartSettings.fertilityStartConfig]
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

  const ignoreNextClickRef = useRef(false);
  const isPlaceholderRecord = Boolean(
    editingRecord && String(editingRecord.id || '').startsWith('placeholder-')
  );
  
  useEffect(() => {
    const handleFullScreenChange = async () => {
      const isCurrentlyFullScreen = Boolean(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
      );

      setIsFullScreen(isCurrentlyFullScreen);

      if (!isCurrentlyFullScreen) {
        try {
          const screenOrientation =
            typeof window !== 'undefined' ? window.screen?.orientation : null;
          await screenOrientation?.unlock?.();
        } catch (error) {
          // ignored
        }
        setOrientation('portrait');
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
    };
  }, []);

  useLayoutEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [orientation, isFullScreen]);
  if (showLoading) {
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 px-4 py-8 text-center text-pink-600">
          <p>Cargando…</p>
        </div>
      </MainLayout>
    );
  }

  if (!targetCycle?.id) {
    if (cycleId && notFound) {
      return (
        <MainLayout>
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-pink-600">
            <p>No se encontró el ciclo solicitado.</p>
            <Button asChild className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow">
              <Link to="/archived-cycles">Volver a Mis Ciclos</Link>
            </Button>
          </div>
        </MainLayout>
      );
    }
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-pink-600">
          <p>No hay ciclo activo.</p>
          <Button asChild className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow">
            <Link to="/records">Ir a Mis Registros</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const CYCLE_DURATION_DAYS = 28;
  const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;
  const VISIBLE_DAYS_FULLSCREEN_LANDSCAPE = 25;

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
  const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
  const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
  const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

  const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);
  const mergedData = fullCyclePlaceholders.map((placeholder) => {
    const existingRecord = cycleEntries.find((d) => d.isoDate === placeholder.isoDate);
    return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
  });

  const visibleDays = isFullScreen
    ? (orientation === 'portrait'
        ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
        : VISIBLE_DAYS_FULLSCREEN_LANDSCAPE)
    : (orientation === 'portrait'
      ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
      : CYCLE_DURATION_DAYS);
  let scrollStart = 0;

  if (orientation !== 'landscape') {
    const daysSinceCycleStart = differenceInDays(new Date(), startOfDay(cycleStartDate));
    const currentDayIndex = Math.min(Math.max(daysSinceCycleStart, 0), daysInCycle - 1);
    let endIndex = Math.min(daysInCycle, currentDayIndex + 1);
    if (currentDayIndex < visibleDays - 1) {
      endIndex = Math.min(daysInCycle, visibleDays);
    }
    scrollStart = Math.max(0, endIndex - visibleDays);
  }
  const baseStyle = {
    background: 'linear-gradient(to br, #fff1f2 0%, #fce7f3 50%, #ffe4e6 100%)'
  };
  const NAVBAR_SAFE_VAR = 'var(--bottom-nav-safe)';
  const containerStyle = isFullScreen
    ? {
        ...baseStyle,
        height: '100dvh',
        maxHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
        }
    : {
        ...baseStyle,
        height: `calc(100dvh - ${NAVBAR_SAFE_VAR})`,
        maxHeight: `calc(100dvh - ${NAVBAR_SAFE_VAR})`,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      };

  const handleEdit = (record) => {
    setEditingRecord(record);
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
    setChartSettings((prev) => ({
      ...prev,
      showRelationsRow: checked === true,
    }));
  };
  const handleFertilityMethodChange = (methodKey, checked) => {
    setChartSettings((prev) => {
      const currentConfig = prev.fertilityStartConfig ?? createDefaultFertilityStartConfig();
      const nextValue = checked === true;
      if (currentConfig.methods?.[methodKey] === nextValue) {
        return prev;
      }
      const updatedConfig = {
        ...currentConfig,
        methods: {
          ...currentConfig.methods,
          [methodKey]: nextValue,
        },
      };

      if (methodKey === 'alemanas' && nextValue) {
        updatedConfig.calculators = {
          ...currentConfig.calculators,
          cpm: true,
          t8: true,
        };
      }

      return {
        ...prev,
        fertilityStartConfig: updatedConfig,
      };
    });
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
  const externalFertilityCalculatorCandidates = useMemo(() => {
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

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    if (!targetCycle?.id) return;
    setIsProcessing(true);
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
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleDateSelect = (record) => {
    setEditingRecord(record);
  };
  const toggleInterpretation = () => {
    setShowInterpretation((v) => !v);
  };
    const closePhaseOverlay = useCallback(() => {
    setPhaseOverlay(null);
  }, []);
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

  const handleShowPhaseInfo = useCallback(
    (info = {}) => {
      if (!info) return;
      const phase = info.phase ?? null;
      const reasons = info.reasons ?? {};

      let header = null;
      let title = '';
      let body = '';
      let reasonsList = [];
      let note = null;

      if (phase === 'relativeInfertile') {
        title = 'Inicio de fase relativamente infértil';
        body = 'Inicio de ciclo; a la espera de cambio en sensación, moco o cálculo.';
        const aggregate = reasons?.aggregate ?? null;
        const reasonText = deriveRelativeReason(aggregate);
        if (reasonText) {
          reasonsList = [reasonText];
        }

        } else if (phase === 'fertile') {
        title = 'Inicio de fase fértil';
        const motive = deriveFertileMotivo(reasons);
        body = motive ? `Inicio de fase fértil por ${motive}.` : 'Inicio de fase fértil.';
        const statusSummary = reasons?.statusSummary ?? null;
        if (Array.isArray(statusSummary?.reasonsList) && statusSummary.reasonsList.length > 0) {
          reasonsList = statusSummary.reasonsList;
        } else if (motive) {
          reasonsList = [`Motivo principal: ${motive}.`];
        }

        if (statusSummary?.note) {
          note = statusSummary.note;
        }

        if (typeof statusSummary?.header === 'string' && statusSummary.header.trim().length > 0) {
          header = statusSummary.header;
        }
      } else if (phase === 'postOvulatory') {
        const hasTemperature = Number.isInteger(reasons?.temperature?.startIndex);
        const hasMucus = Number.isInteger(reasons?.mucus?.startIndex);
        title = hasTemperature && hasMucus ? 'Infertilidad absoluta' : 'Infertilidad';
        const detail = formatClosureDetail(reasons);
        body = `Alcanzada la fase de infertilidad por ${detail}.`;
        if (info?.message) {
          reasonsList = [info.message];
        }
        if (reasons?.status === 'pending') {
          note = 'Pendiente completar el segundo criterio.';
        }
        } else if (phase === 'nodata') {
        title = 'Sin datos suficientes';
        body = 'Añade registros de sensación, moco o temperatura para interpretar el ciclo.';
      } else if (info?.message) {
        title = info.message;
      } else {
        return;
      }

      if (!title) {
        return;
      }
      
      if (!header && typeof info?.message === 'string' && info.message.trim().length > 0) {
        header = info.message;
      }

      setPhaseOverlay({
        header,
        title,
        body,
        reasons: reasonsList,
        note,
      });
    },
    [setPhaseOverlay]
  );

  const handleToggleFullScreen = async () => {
    const rootElement = document.documentElement;
    const screenOrientation =
      typeof window !== 'undefined' ? window.screen?.orientation : null;

    if (!isFullScreen) {
      let enteredFullScreen = false;
      let hasRequestFullScreen = false;

      try {
        const requestFullScreen =
          rootElement.requestFullscreen ||
          rootElement.webkitRequestFullscreen ||
          rootElement.mozRequestFullScreen ||
          rootElement.msRequestFullscreen;

        hasRequestFullScreen = Boolean(requestFullScreen);

        if (requestFullScreen) {
          await requestFullScreen.call(rootElement);
          enteredFullScreen = true;
        }
      } catch (err) {
        console.error(err);
      }
      if (screenOrientation?.lock) {
        try {
          await screenOrientation.lock('landscape');
        } catch (err) {
          console.error(err);
        }
      }

      setOrientation('landscape');
      setIsFullScreen(enteredFullScreen || !hasRequestFullScreen);
      
    } else {
      if (screenOrientation?.unlock) {
        try {
          await screenOrientation.unlock();
        } catch (err) {
          console.error(err);
        }
      }
      try {
        const exitFullScreen =
          document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.mozCancelFullScreen ||
          document.msExitFullscreen;

        const isAnyElementFullScreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        if (exitFullScreen && isAnyElementFullScreen) {
          await exitFullScreen.call(document);
        }
      } catch (err) {
        console.error(err);
      }
      setOrientation('portrait');
      setIsFullScreen(false);
    }
  };

  return (
    <MainLayout hideBottomNav={isFullScreen}>
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-y-auto overflow-x-hidden'
            : 'relative w-full h-full overflow-y-auto overflow-x-hidden'}
        style={containerStyle}
      >
        {showBackToCycleRecords && !isFullScreen && (
          <Button
            asChild
            variant="ghost"
            className="absolute top-4 left-4 z-10 bg-white/80 text-slate-700 hover:bg-[#E27DBF]/20"
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
          className="absolute top-16 right-4 z-10 p-2 rounded-full bg-white/80 shadow-lg shadow-slate-300/50 text-slate-700 hover:bg-[#E27DBF]/20"
          aria-label="Ajustes del gráfico"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleInterpretationClick}
          onPointerUp={handleInterpretationPointerUp}
          variant="ghost"
          size="icon"
          className={`absolute top-4 right-20 z-10 p-2 rounded-full transition-colors ${showInterpretation 
            ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-300/50 border-pink-400' 
            : 'bg-white/80 text-slate-600 hover:bg-pink-50/80 shadow-md border-pink-200/50'}`}
        >
          {showInterpretation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          onClick={handleToggleFullScreen}
          className="absolute top-4 right-4 z-10 bg-white/80 rounded-full text-slate-600 hover:bg-pink-50/80 shadow-md border border-pink-200/50 backdrop-blur-sm"
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
          showInterpretation={showInterpretation}
          reduceMotion={true}
          forceLandscape={orientation === 'landscape'}
          currentPeakIsoDate={currentPeakIsoDate}
          showRelationsRow={chartSettings.showRelationsRow}
          fertilityStartConfig={fertilityConfig}
          fertilityCalculatorCycles={fertilityCalculatorCycles}
          fertilityCalculatorCandidates={externalFertilityCalculatorCandidates}
          onShowPhaseInfo={handleShowPhaseInfo}
          isArchivedCycle={!isViewingCurrentCycle}
          cycleEndDate={targetCycle?.endDate ?? null}
        />
        
        {/* Backdrop */}
        {settingsOpen && (
            <div className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
            />
            )}
            {/* Drawer fijo */}
            <div className={`fixed top-0 right-0 z-50 h-dvh w-72 sm:w-80 transform transition-transform duration-300 ease-in-out ${
              settingsOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-modal="true"
            >
            <div className="flex h-full flex-col gap-6 border-l border-rose-100/60 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-700">Ajustes del gráfico</h2>
                <p className="text-sm text-slate-500">
                  Personaliza la visualización de filas adicionales en la gráfica.
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
              <div className="rounded-xl border border-rose-100/70 bg-rose-50/40 p-4 flex items-start justify-between gap-3">
                <div className="max-w-xs">
                  <Label htmlFor="toggle-relations-row" className="text-sm font-semibold text-slate-700">
                    Mostrar fila de Relaciones (RS)
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
            
              <div className="rounded-xl border border-purple-100/70 bg-purple-50/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Perfiles sintotérmicos</h3>
                  <p className="text-xs text-slate-500">
                    Activa los métodos que quieras considerar para detectar el inicio fértil.
                  </p>
                </div>
                <div className="space-y-2">
                  {FERTILITY_METHOD_OPTIONS.map((option) => (
                    <div key={option.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-700">{option.label}</span>
                      <Checkbox
                        checked={Boolean(fertilityConfig.methods?.[option.key])}
                        onCheckedChange={(checked) => handleFertilityMethodChange(option.key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-100/70 bg-amber-50/40 p-4 space-y-3">
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

              <div className="rounded-xl border border-sky-100/70 bg-sky-50/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Modo de combinación</h3>
                  <p className="text-xs text-slate-500">
                    Determina cómo se elige el inicio fértil a partir de los candidatos disponibles.
                  </p>
                </div>
                <Select value={fertilityConfig.combineMode} onValueChange={handleCombineModeChange}>
                  <SelectTrigger className="w-full bg-white/80 border-slate-200 text-sm text-slate-700">
                    <SelectValue placeholder="Selecciona un modo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700">
                    {Object.entries(COMBINE_MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-sm">
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
            <div className="space-y-4 text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  {phaseOverlay.header && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">
                      {phaseOverlay.header}
                    </p>
                  )}
                  <h2 className="text-lg font-semibold text-slate-800">
                    {phaseOverlay.title}
                  </h2>
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
              {phaseOverlay.body && (
                <p className="text-sm leading-relaxed text-slate-600">{phaseOverlay.body}</p>
              )}
              {Array.isArray(phaseOverlay.reasons) && phaseOverlay.reasons.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {phaseOverlay.reasons.map((reason, index) => (
                    <li key={`${reason}-${index}`}>{reason}</li>
                  ))}
                </ul>
              )}
              {phaseOverlay.note && (
                <p className="text-xs text-slate-500">{phaseOverlay.note}</p>
              )}
            </div>
          )}
        </Overlay>

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) handleCloseForm(); }}>
          <DialogContent
            hideClose
            className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
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
            />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default ChartPage;
