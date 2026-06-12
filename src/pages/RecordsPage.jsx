import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import DayDetail from '@/components/DayDetail';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Baby, ChevronLeft, ChevronRight, Edit, Plus, ClipboardList, Heart, Loader2 } from 'lucide-react';
import NewCycleDialog from '@/components/NewCycleDialog';
import {
  format,
  parseISO,
  isValid,
  max,
  isBefore,
  isAfter,
  startOfDay,
  startOfMonth,
  differenceInCalendarDays,
  addDays,
  addMonths,
} from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar } from '@/components/ui/calendar';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { formatCycleMeta, formatCycleTitle } from '@/lib/formatCycleTitle';
import { cn } from '@/lib/utils';
import DataIssuesBanner from '@/components/DataIssuesBanner';
import DataRepairDialog from '@/components/DataRepairDialog';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeStoredPreferences, PREFERENCE_DEFAULTS } from '@/lib/preferences';
import {
  getPeakDayToastMessage,
  getRecordUpdateToastMessage,
  getRelationsToastMessage,
} from '@/lib/recordToastMessages';

const getSymbolInfo = (symbolValue) =>
  FERTILITY_SYMBOL_OPTIONS.find((symbol) => symbol.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0];

const RecordsHeader = ({
  title,
  meta,
  isCurrentCycle,
  topAccessory,
  onEditDates,
  onAddRecord,
  isProcessing,
  isUpdatingDates,
  isDateEditorOpen,
  previousCycle,
  nextCycle,
  onNavigateCycle,
  postpartumMode,
}) => {
  const cycleLabel = isCurrentCycle ? 'CICLO ACTUAL' : 'CICLO ARCHIVADO';
  const editDatesLabel = isCurrentCycle ? 'Editar fechas del ciclo actual' : 'Editar fechas del ciclo archivado';

const renderCycleNavButton = (direction, targetCycle) => {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  const label = direction === 'previous' ? 'Ver ciclo anterior' : 'Ver ciclo siguiente';

  if (!targetCycle) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onNavigateCycle(targetCycle)}
      aria-label={label}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 transition [-webkit-tap-highlight-color:transparent]',
        'hover:bg-white/10 active:bg-white/15 active:brightness-95'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
};

  return (
  <div className="px-4 pt-2">
    <div className="relative overflow-hidden rounded-3xl bg-fertiliapp-fuerte px-4 pb-3 pt-2.5 text-white shadow-[0_8px_18px_rgba(216,92,112,0.14)]">
    <HeaderIconButtonPrimary
      type="button"
      onClick={onAddRecord}
      disabled={isProcessing}
      aria-label={isCurrentCycle ? 'Añadir registro' : 'Añadir registro al ciclo archivado'}
      className="absolute right-4 top-2.5 z-20 border-white/70 bg-white text-fertiliapp-fuerte shadow-none hover:bg-white"
    >
      <Plus className="h-4 w-4" />
      <span className="sr-only">Añadir registro</span>
    </HeaderIconButtonPrimary>

    <div className="mx-auto max-w-[calc(100%-3.5rem)] text-center">
      <div className="truncate text-[9px] font-semibold uppercase leading-4 tracking-[0.2em] text-white/72">
        {cycleLabel}
      </div>

      <button
        type="button"
        onClick={onEditDates}
        data-date-editor-toggle="true"
        disabled={isProcessing || isUpdatingDates}
        aria-label={editDatesLabel}
        aria-pressed={isDateEditorOpen}
        aria-expanded={isDateEditorOpen}
        className="date-editor-toggle mt-0.5 inline-flex max-w-full items-center justify-center rounded-full px-1.5 py-0.5 text-center text-[18px] font-semibold leading-tight text-white transition hover:bg-white/10 active:bg-white/15 disabled:opacity-60"
      >
        <span className="truncate">{title}</span>
      </button>
    </div>

    <div className="pointer-events-none absolute left-4 right-4 top-[3.05rem] z-10 flex items-center justify-between">
      <div className="pointer-events-auto">
        {renderCycleNavButton('previous', previousCycle)}
      </div>

      <div className="pointer-events-auto">
        {renderCycleNavButton('next', nextCycle)}
      </div>
    </div>

    {meta && (
      <div className="mt-1.5 flex min-h-5 items-center justify-center gap-2 text-center text-[12px] font-medium leading-5 text-white/78">
        <span className="min-w-0 truncate">{meta}</span>
        {postpartumMode && (
          <Badge
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 p-0 text-white hover:bg-white/15"
            aria-label="Modo postparto activado"
            title="Modo postparto activado"
          >
            <Baby className="h-3 w-3" aria-hidden="true" />
          </Badge>
        )}
      </div>
    )}
    </div>
  </div>
);
};
// Formatea la temperatura para la UI. Devuelve null si el valor no es numérico.
const formatTemperatureDisplay = (value) => {
  if (value === null || value === undefined || value === '') return null;
  // Acepta "36,6" y "36.6"
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(n)) return null;
  // Mostrar 1–2 decimales con separador español
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(n);
};
const resolveInitialSelectedIsoDate = ({ cycle, routeSelectedIso }) => {
  if (routeSelectedIso) {
    return routeSelectedIso;
  }

  if (!cycle?.startDate) {
    return null;
  }

  const start = parseISO(cycle.startDate);

  if (!isValid(start)) {
    return null;
  }

  if (cycle.endDate) {
    const end = parseISO(cycle.endDate);
    return isValid(end) ? format(startOfDay(end), 'yyyy-MM-dd') : cycle.endDate;
  }

  const today = startOfDay(new Date());

  if (!isBefore(today, startOfDay(start))) {
    return format(today, 'yyyy-MM-dd');
  }

  return format(startOfDay(start), 'yyyy-MM-dd');
};

export const RecordsExperience = ({
  cycle: cycleProp,
  headerTitle,
  topAccessory,
  includeEndDate = false,
  addOrUpdateDataPoint: addOrUpdateDataPointProp,
  deleteRecord: deleteRecordProp,
  isLoading: isLoadingProp,
  updateCycleDates: updateCycleDatesProp,
  checkCycleOverlap: checkCycleOverlapProp,
  startNewCycle: startNewCycleProp,
  refreshData: refreshDataProp,
  afterRecordsContent = null,
  onRequestDeleteCycle = null,
  dateEditorDeleteTitle = 'Eliminar ciclo',
  dateEditorDeleteDescription = 'Esta acción no se puede deshacer. Se eliminarán todos los registros asociados.',
  dateEditorDeleteLabel = 'Eliminar ciclo',
  isDeletingCycle = false,
} = {}) => {
  const {
    currentCycle: contextCurrentCycle,
    archivedCycles,
    addOrUpdateDataPoint: contextAddOrUpdateDataPoint,
    deleteRecord: contextDeleteRecord,
    isLoading: contextIsLoading,
    updateCycleDates: contextUpdateCycleDates,
    checkCycleOverlap: contextCheckCycleOverlap,
    previewUpdateCycleDates: contextPreviewUpdateCycleDates,
    previewStartNewCycle: contextPreviewStartNewCycle,
    startNewCycle: contextStartNewCycle,
    refreshData: contextRefreshData,
    getMeasurementsForEntry: contextGetMeasurementsForEntry,
    undoCurrentCycle: contextUndoCurrentCycle,
    repairDialogState,
    openDataRepairDialog,
    closeDataRepairDialog,
    resolveDuplicateIssue,
    moveOutOfRangeEntry,
    deleteIssueEntry,
    getPublicError,
  } = useCycleData();
  const { preferences } = useAuth();
  const showRelationsRow = useMemo(
    () => normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS).showRelationsRow,
    [preferences]
  );
  const cycle = cycleProp ?? contextCurrentCycle;
  const isLoading = isLoadingProp ?? contextIsLoading;
  const addOrUpdateDataPoint = addOrUpdateDataPointProp
    ? addOrUpdateDataPointProp
    : async (data, editingRecord) => {
        if (!cycle?.id) return;
        return contextAddOrUpdateDataPoint(data, editingRecord, cycle.id);
      };
  const deleteRecord = deleteRecordProp
    ? deleteRecordProp
    : async (recordId) => {
        if (!cycle?.id) return;
        return contextDeleteRecord(recordId, cycle.id);
      };
  const updateCycleDates = updateCycleDatesProp
    ? updateCycleDatesProp
    : async (cycleId, startDate, endDate) =>
        contextUpdateCycleDates(cycleId ?? cycle?.id, startDate, endDate);
  const checkCycleOverlap = checkCycleOverlapProp ?? contextCheckCycleOverlap;
  const previewUpdateCycleDates = contextPreviewUpdateCycleDates;
  const previewStartNewCycle = contextPreviewStartNewCycle;
  const startNewCycle = startNewCycleProp ?? contextStartNewCycle;
  const refreshData = refreshDataProp ?? contextRefreshData;
  const getMeasurementsForEntry = contextGetMeasurementsForEntry;
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
    const routeSelectedIso = useMemo(() => {
    const value = location.state?.selectedDate;
    if (typeof value !== 'string') return null;

    const parsed = parseISO(value);
    if (!isValid(parsed)) return null;

    return format(parsed, 'yyyy-MM-dd');
  }, [location.state]);

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [showUndoCycleDialog, setShowUndoCycleDialog] = useState(false);
  const [isUndoingCycle, setIsUndoingCycle] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => cycle?.startDate || '');
  const [draftEndDate, setDraftEndDate] = useState(() => cycle?.endDate || '');
  const [startDateError, setStartDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [pendingIncludeEndDate, setPendingIncludeEndDate] = useState(false);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [overlapImpactPreview, setOverlapImpactPreview] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() =>
  resolveInitialSelectedIsoDate({ cycle, routeSelectedIso })
);
  const [visibleCalendarMonthIndex, setVisibleCalendarMonthIndex] = useState(0);
  const [cycleNavigationTransition, setCycleNavigationTransition] = useState(null);
  const [defaultFormIsoDate, setDefaultFormIsoDate] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);
  const [newCyclePrefillDate, setNewCyclePrefillDate] = useState(null);
  const recordCount = cycle?.data?.length ?? 0;
  const isCurrentCycle = Boolean(
    (contextCurrentCycle?.id && cycle?.id === contextCurrentCycle.id) || (!cycleProp && !cycle?.endDate)
  );

  const undoCandidate = useMemo(() => {
    if (!contextCurrentCycle?.id || contextCurrentCycle?.endDate) return null;
    if (!cycle?.id || cycle.id !== contextCurrentCycle.id) return null;
    if (!contextCurrentCycle?.startDate) return null;
    const parsedStart = parseISO(contextCurrentCycle.startDate);
    if (!isValid(parsedStart)) return null;
    const dayBefore = format(addDays(parsedStart, -1), 'yyyy-MM-dd');
    const candidates = archivedCycles.filter((archived) => archived?.endDate === dayBefore);
    if (!candidates.length) return null;
    return candidates.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0];
  }, [archivedCycles, contextCurrentCycle, cycle?.id]);

  const undoRangeText = useMemo(() => {
    if (!undoCandidate?.startDate || !undoCandidate?.endDate) return '';
    const start = parseISO(undoCandidate.startDate);
    const end = parseISO(undoCandidate.endDate);
    if (!isValid(start) || !isValid(end)) return '';
    const formatRangeDate = (date) => format(date, 'dd MMM yy', { locale: es }).replace('.', '');
    return `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
  }, [undoCandidate]);

  const undoCycleDescription = useMemo(() => {
    const rangeSuffix = undoRangeText ? ` (${undoRangeText})` : '';
    return `¿Quieres unir el ciclo actual al ciclo anterior${rangeSuffix}? Esta acción no se puede deshacer.`;
  }, [undoRangeText]);

  const refreshCycleIssues = useCallback(async () => {
    if (!cycleProp?.id || !refreshData) return;
    await refreshData({ silent: true });
  }, [cycleProp?.id, refreshData]);

  const handleResolveDuplicateIssue = useCallback(
    async (payload) => {
      await resolveDuplicateIssue(payload);
      await refreshCycleIssues();
    },
    [refreshCycleIssues, resolveDuplicateIssue]
  );

  const handleMoveOutOfRangeIssue = useCallback(
    async (payload) => {
      await moveOutOfRangeEntry(payload);
      await refreshCycleIssues();
    },
    [moveOutOfRangeEntry, refreshCycleIssues]
  );

  const handleDeleteIssueEntry = useCallback(
    async (payload) => {
      await deleteIssueEntry(payload);
      await refreshCycleIssues();
    },
    [deleteIssueEntry, refreshCycleIssues]
  );
  const resolvedHeaderTitle = useMemo(() => {
    if (headerTitle) return headerTitle;

    return formatCycleTitle({ startDate: cycle?.startDate, endDate: cycle?.endDate });
  }, [cycle?.endDate, cycle?.startDate, headerTitle]);

  const resolvedHeaderMeta = useMemo(
    () => formatCycleMeta({ startDate: cycle?.startDate, endDate: cycle?.endDate, recordCount }),
    [cycle?.endDate, cycle?.startDate, recordCount]
  );
  const orderedCycles = useMemo(() => {
    const cyclesById = new Map();

    [...(archivedCycles ?? []), contextCurrentCycle, cycle].filter(Boolean).forEach((availableCycle) => {
      if (!availableCycle?.id || !availableCycle?.startDate) return;
      cyclesById.set(availableCycle.id, availableCycle);
    });

    return [...cyclesById.values()].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [archivedCycles, contextCurrentCycle, cycle]);

  const currentCycleIndex = useMemo(
    () => orderedCycles.findIndex((availableCycle) => availableCycle.id === cycle?.id),
    [cycle?.id, orderedCycles]
  );

  const previousCycle = currentCycleIndex > 0 ? orderedCycles[currentCycleIndex - 1] : null;
  const nextCycle =
    currentCycleIndex >= 0 && currentCycleIndex < orderedCycles.length - 1
      ? orderedCycles[currentCycleIndex + 1]
      : null;

  const navigateToCycle = useCallback(
    (targetCycle, options = {}) => {
      if (!targetCycle?.id) return;
      const isTargetCurrentCycle = contextCurrentCycle?.id && targetCycle.id === contextCurrentCycle.id;
      const path = isTargetCurrentCycle ? '/records' : `/cycle/${targetCycle.id}`;
      navigate(
        path,
        options.selectedDate ? { state: { selectedDate: options.selectedDate } } : undefined
      );
    },
    [contextCurrentCycle?.id, navigate]
  );

  const findCycleForDate = useCallback(
    (date) => {
      if (!date || !orderedCycles.length) return null;
      const day = startOfDay(date);

      return orderedCycles.find((availableCycle) => {
        if (!availableCycle?.id || availableCycle.id === cycle?.id || !availableCycle?.startDate) {
          return false;
        }

        const from = startOfDay(parseISO(availableCycle.startDate));
        if (!isValid(from)) return false;

        let to = null;
        if (availableCycle.endDate) {
          to = startOfDay(parseISO(availableCycle.endDate));
        } else if (availableCycle.id === contextCurrentCycle?.id) {
          const today = startOfDay(new Date());
          const recordDates = (availableCycle.data ?? [])
            .map((record) => (record?.isoDate ? parseISO(record.isoDate) : null))
            .filter((recordDate) => recordDate && isValid(recordDate));
          to = max([from, today, ...recordDates]);
        }

        if (!to || !isValid(to)) return false;

        return !isBefore(day, from) && !isAfter(day, to);
      }) ?? null;
    },
    [contextCurrentCycle?.id, cycle?.id, orderedCycles]
  );
  const isCalendarOpen = true;
  const activeRecordLoadRef = useRef(null);
  const cycleDatesEditorRef = useRef(null);
  const cycleNavigationTimeoutRef = useRef(null);

  useEffect(() => {
    setDraftStartDate(cycle?.startDate || '');
    setDraftEndDate(cycle?.endDate || '');
  }, [cycle?.startDate, cycle?.endDate]);

  useLayoutEffect(() => {
  const nextSelectedIso = resolveInitialSelectedIsoDate({ cycle, routeSelectedIso });

  setSelectedDate((prev) => {
    if (prev === nextSelectedIso) {
      return prev;
    }

    return nextSelectedIso;
  });

  positionedCalendarMonthKeyRef.current = null;
}, [cycle?.id, cycle?.startDate, cycle?.endDate, routeSelectedIso]);

  useEffect(() => {
    setCycleNavigationTransition(null);
    return () => {
      if (cycleNavigationTimeoutRef.current) {
        clearTimeout(cycleNavigationTimeoutRef.current);
        cycleNavigationTimeoutRef.current = null;
      }
    };
  }, [cycle?.id]);

  const navigateToCycleWithTransition = useCallback(
    (targetCycle, direction = 'next', selectedIso = null) => {
      if (!targetCycle?.id) return;

      if (cycleNavigationTimeoutRef.current) {
        clearTimeout(cycleNavigationTimeoutRef.current);
      }

      setCycleNavigationTransition(direction);
      cycleNavigationTimeoutRef.current = setTimeout(() => {
        navigateToCycle(targetCycle, { selectedDate: selectedIso });
      }, 140);
    },
    [navigateToCycle]
  );

  const sortedRecordDates = useMemo(() => {
    if (!cycle?.data?.length) return [];

    return [...cycle.data]
      .filter((record) => record?.isoDate)
      .sort((a, b) => {
        const dateA = parseISO(a.isoDate);
        const dateB = parseISO(b.isoDate);
        return dateB - dateA;
      })
      .map((record) => record.isoDate);
  }, [cycle?.data]);

  const recordDateObjects = useMemo(() => {
    if (!cycle?.data?.length) return [];

    return cycle.data
      .map((record) => {
        if (!record?.isoDate) return null;
        const parsed = parseISO(record.isoDate);
        return isValid(parsed) ? parsed : null;
      })
      .filter(Boolean);
  }, [cycle?.data]);

  const recordDateSet = useMemo(() => new Set(sortedRecordDates), [sortedRecordDates]);

  const peakStatuses = useMemo(() => computePeakStatuses(cycle?.data ?? []), [cycle?.data]);

  const recordDetailsByIso = useMemo(() => {
    const details = new Map();
    if (!cycle?.data?.length) {
      return details;
    }

    cycle.data.forEach((record) => {
      if (!record?.isoDate) return;

      const selectedMeasurement =
        record.measurements?.find((measurement) => measurement?.selected) ||
        (record.temperature_chart || record.temperature_raw
          ? {
              temperature: record.temperature_chart ?? record.temperature_raw,
              temperature_corrected: record.temperature_corrected ?? null,
              time: record.timestamp ? format(parseISO(record.timestamp), 'HH:mm') : null,
              use_corrected: record.use_corrected ?? false,
            }
          : null);

      const usesCorrected = selectedMeasurement?.use_corrected ?? record.use_corrected ?? false;
      const correctedTemp =
        selectedMeasurement?.temperature_corrected ?? record.temperature_corrected ?? null;
      const rawTemp =
        selectedMeasurement?.temperature ?? record.temperature_chart ?? record.temperature_raw ?? null;
      const resolvedTemp =
        usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== ''
          ? correctedTemp
          : rawTemp ?? correctedTemp;

      const displayTemp = formatTemperatureDisplay(resolvedTemp);
      const hasTemperature = displayTemp !== null;
      const showCorrectedIndicator =
        usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== '';

      let timeValue = null;
      if (selectedMeasurement?.time) {
        timeValue = selectedMeasurement.time;
      } else if (record.timestamp && isValid(parseISO(record.timestamp))) {
        timeValue = format(parseISO(record.timestamp), 'HH:mm');
      }

      const mucusSensation = record.mucusSensation ?? record.mucus_sensation ?? '';
      const mucusAppearance = record.mucusAppearance ?? record.mucus_appearance ?? '';
      const hasMucusSensation = Boolean(mucusSensation);
      const hasMucusAppearance = Boolean(mucusAppearance);
      const hasMucus = hasMucusSensation || hasMucusAppearance;
      const observationsText = record.observations || '';
      const hasObservations = Boolean(observationsText);

      const hasRelations = Boolean(record.had_relations ?? record.hadRelations ?? false);

      const peakStatus = peakStatuses[record.isoDate] || null;
      const isPeakDay = record.peak_marker === 'peak' || peakStatus === 'P';

      const symbolInfo = getSymbolInfo(record.fertility_symbol);

      details.set(record.isoDate, {
        record,
        symbolInfo,
        hasTemperature,
        displayTemp,
        showCorrectedIndicator,
        timeValue,
        hasMucus,
        hasMucusSensation,
        hasMucusAppearance,
        mucusSensation,
        mucusAppearance,
        hasObservations,
        observationsText,
        hasRelations,
        peakStatus,
        isPeakDay,
      });
    });

    return details;
  }, [cycle?.data, peakStatuses]);


  const cycleRange = useMemo(() => {
    if (!cycle?.startDate) return null;
    const start = parseISO(cycle.startDate);
    if (!isValid(start)) return null;

    let end;

    if (cycle?.endDate) {
      end = parseISO(cycle.endDate);
    } else {
      const today = startOfDay(new Date());
      const candidates = [start, today];

      if (recordDateObjects.length) {
        candidates.push(max(recordDateObjects));
      }

      end = max(candidates);
    }

    if (!isValid(end)) {
      return { from: start, to: start };
    }

    return { from: start, to: end };
  }, [cycle?.startDate, cycle?.endDate, recordDateObjects]);

  const calendarMonths = useMemo(() => {
    if (!cycleRange?.from || !cycleRange?.to) {
      return [startOfMonth(new Date())];
    }

    const fromMonth = startOfMonth(cycleRange.from);
    const toMonth = startOfMonth(cycleRange.to);
    const months = [];

    let cursor = fromMonth;

    while (!isAfter(cursor, toMonth)) {
      months.push(cursor);
      cursor = addMonths(cursor, 1);
    }

    return months;
  }, [cycleRange]);

  const calendarModifiers = useMemo(() => {
    const modifiers = {};
    if (cycleRange) {
      modifiers.outsideCycle = (day) =>
        isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to);
      modifiers.insideCycleNoRecord = (day) => {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return false;
        }

        const iso = format(day, 'yyyy-MM-dd');
        return !recordDateSet.has(iso);
      };
    }
    if (recordDateObjects.length) {
      modifiers.hasRecord = recordDateObjects;
    }
    return modifiers;
  }, [cycleRange, recordDateObjects, recordDateSet]);

  const calendarClassNames = useMemo(
    () => ({
      months:
        'flex flex-col items-center sm:flex-row sm:items-center sm:justify-center space-y-3 sm:space-x-4 sm:space-y-0',
      month: 'space-y-3',
      table: 'records-calendar-day-grid w-full border-collapse space-y-0.5',
      row: 'flex w-full mt-1.5',
      head_cell: 'text-muted-foreground rounded-md w-11 font-medium text-[0.8rem]',
      cell:
        'relative h-11 w-11 text-center text-sm p-0 focus-within:relative focus-within:z-20',
      day: cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'relative flex !h-11 !w-11 rounded-3xl flex-col items-center justify-center !p-0 font-medium text-slate-700 aria-selected:opacity-100'
      ),
      day_selected: '',
      day_today: '',
      day_outside: 'opacity-100',
      nav: 'hidden',
    }),
    []
  );

  const calendarScrollContainerRef = useRef(null);
  const positionedCalendarMonthKeyRef = useRef(null);
  const calendarScrollFrameRef = useRef(null);

  const calendarLabels = useMemo(
    () => ({
      labelDay: (day) => {
        const iso = format(day, 'yyyy-MM-dd');
        const details = recordDetailsByIso.get(iso);
        const baseLabel = format(day, 'd MMM', { locale: es });

       const peakStatus = details?.peakStatus ?? peakStatuses[iso] ?? null;

        const infoParts = [];
        if (details?.hasTemperature && details?.hasMucus) {
          infoParts.push('temperatura y moco');
        } else if (details?.hasTemperature) {
          infoParts.push('temperatura');
        } else if (details?.hasMucus) {
          infoParts.push('moco');
        }

        if (showRelationsRow && details?.hasRelations) {
          infoParts.push('RS');
        }

        if (peakStatus) {
          const peakLabel = peakStatus === 'P' ? 'pico ✖' : `pico +${peakStatus}`;
          infoParts.push(peakLabel);
        }

        if (!infoParts.length) {
          return baseLabel;
        }

        return `${baseLabel}: ${infoParts.join('; ')}`;
      },
    }),
    [peakStatuses, recordDetailsByIso, showRelationsRow]
  );

  const cycleDays = useMemo(() => {
    if (!cycle?.startDate) return [];

    const startDate = parseISO(cycle.startDate);
    if (!isValid(startDate)) {
      return [];
    }

    const cycleStartDay = startOfDay(startDate);
    const today = startOfDay(new Date());

    let rangeEnd = cycleRange?.to ? startOfDay(cycleRange.to) : today;
    if (isAfter(rangeEnd, today)) {
      rangeEnd = today;
    }
    if (isBefore(rangeEnd, cycleStartDay)) {
      rangeEnd = cycleStartDay;
    }

    const totalDays = differenceInCalendarDays(rangeEnd, cycleStartDay) + 1;
    if (totalDays <= 0) {
      return [];
    }

    const days = [];
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
      const currentDate = addDays(cycleStartDay, offset);
      const isoDate = format(currentDate, 'yyyy-MM-dd');
      const cycleDay = differenceInCalendarDays(currentDate, cycleStartDay) + 1;
      const details = recordDetailsByIso.get(isoDate) || null;

      days.push({
        isoDate,
        date: currentDate,
        cycleDay,
        details,
      });
    }

    return days;
  }, [cycle?.startDate, cycleRange, recordDetailsByIso]);

  const cycleDayIsoSet = useMemo(
    () => new Set(cycleDays.map((day) => day.isoDate)),
    [cycleDays]
  );

  const archivedCycleIntervals = useMemo(() => {
  if (!cycle?.id) {
    return [];
  }

  const otherCycles = [...(archivedCycles ?? []), contextCurrentCycle].filter(Boolean);

  return otherCycles
    .filter(
      (availableCycle) =>
        availableCycle?.id &&
        availableCycle.id !== cycle.id &&
        availableCycle?.startDate
    )
    .map((availableCycle) => {
      const fromDate = startOfDay(parseISO(availableCycle.startDate));

      let toDate = null;

      if (availableCycle.endDate) {
        toDate = startOfDay(parseISO(availableCycle.endDate));
      } else if (availableCycle.id === contextCurrentCycle?.id) {
        const today = startOfDay(new Date());
        toDate = isBefore(today, fromDate) ? fromDate : today;
      }

      if (!toDate || !isValid(fromDate) || !isValid(toDate)) {
        return null;
      }

      const isOpenCycle = !availableCycle.endDate;

return {
  cycleId: availableCycle.id,
  from: fromDate,
  to: toDate,
  startIso: availableCycle.startDate,
  endIso: isOpenCycle ? null : availableCycle.endDate,
  isOpenCycle,
};
    })
    .filter(Boolean);
}, [archivedCycles, contextCurrentCycle, cycle?.id]);

  const renderCalendarDay = useCallback(
    ({ date, activeModifiers }) => {
      const iso = format(date, 'yyyy-MM-dd');
      const details = recordDetailsByIso.get(iso);
      const inCurrentShownCycle = cycleDayIsoSet.has(iso);
      const archivedInterval =
        !inCurrentShownCycle &&
        archivedCycleIntervals.find(
          (interval) => !isBefore(date, interval.from) && !isAfter(date, interval.to)
        );
      const showArchivedCycleRange = Boolean(archivedInterval);
      const showLeftBorder = showArchivedCycleRange && iso === archivedInterval.startIso;
      const showRightBorder =
      showArchivedCycleRange &&
      !archivedInterval.isOpenCycle &&
      iso === archivedInterval.endIso;

      const hasTemperature = details?.hasTemperature ?? false;
      const hasMucus = details?.hasMucus ?? false;
      const hasRelations = details?.hasRelations ?? false;
      const peakStatus = details?.peakStatus ?? peakStatuses[iso] ?? null;
      const symbolInfo = details?.symbolInfo;
      const symbolValue = symbolInfo?.value;
      const isWhiteSymbol = symbolValue === 'white';
      const isSelected = activeModifiers.selected;
      const isToday = activeModifiers.today;
      {/* Punto de temperatura */}
      const temperatureDotClass = cn(
        'h-[0.5rem] w-[0.5rem] rounded-full transition-shadow',
        hasTemperature ? 'bg-amber-500' : 'bg-transparent',
        hasTemperature && isSelected
          ? 'shadow-[0_0_0_0.75px_rgba(255,255,255,0.95)]'
          : ''
      );
      {/* Punto del moco */}
      const mucusDotClass = cn(
        'h-[0.5rem] w-[0.5rem] rounded-full transition-shadow',
        hasMucus ? 'bg-teal-500' : 'bg-transparent',
        hasMucus && isSelected
          ? 'shadow-[0_0_0_0.75px_rgba(255,255,255,0.95)]'
          : ''
      );
      {/* Tamaño número */}
      const shouldShowSymbolBackground = Boolean(symbolValue && symbolValue !== 'none');
      const numberClass = cn(
        'relative z-10 text-[1.15rem] leading-none',
        activeModifiers.outsideCycle
          ? 'text-slate-300'
          : isSelected
          ? shouldShowSymbolBackground
            ? isWhiteSymbol
              ? 'text-fertiliapp-fuerte'
              : 'text-white'
            : 'text-fertiliapp-fuerte'
          : isToday
          ? 'text-subtitulo font-semibold'
          : activeModifiers.outside
          ? inCurrentShownCycle
            ? 'text-slate-600'
            : 'text-slate-700'
          : 'text-slate-700'
      );

      const peakBadgeContent =
        peakStatus === 'P' ? '✖' : peakStatus ? `+${peakStatus}` : null;

      const symbolBackgroundClass = shouldShowSymbolBackground
        ? cn(
            'pointer-events-none absolute inset-0 rounded-full transition-opacity',
            symbolInfo?.color ?? '',
            symbolInfo?.pattern === 'spotting-pattern' ? 'calendar-spotting-dot' : '',
            symbolValue === 'white' ? 'bg-rose-50 ring-1 ring-rose-300/90 shadow-sm' : '',
 symbolValue === 'white'
   ? isSelected ? 'opacity-90' : 'opacity-100'
   : isSelected ? 'opacity-50' : 'opacity-25'
          )
        : null;

      return (
  <div className="relative flex h-full w-full flex-col items-center justify-center">
    {showArchivedCycleRange && (
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-[2px] border-slate-300/70 border-t border-b',
          showLeftBorder ? 'border-l rounded-l-2xl' : '',
          showRightBorder ? 'border-r rounded-r-2xl' : ''
        )}
      />
    )}
    {/* Número centrado con posible fondo de símbolo */}
    <span className="relative inline-flex h-8 w-8 items-center justify-center leading-none -mt-[1px]">
      {isToday && !isSelected && !(activeModifiers.outside || activeModifiers.outsideCycle) && (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-[4px] rounded-full border border-fertiliapp-fuerte"
    />
  )}
      {isSelected && (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-[2px] rounded-full bg-tarjeta border-2 border-fertiliapp-fuerte"
    />
  )}
      {symbolBackgroundClass && <span className={symbolBackgroundClass} aria-hidden="true" />}
      <span className={numberClass}>{format(date, 'd')}</span>
      {showRelationsRow && hasRelations && (
        <Heart
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[0.2px] -right-[0.2px] h-2 w-2 text-rose-500 fill-current"
        />
      )}
    </span>


    {/* Dots inferiores: temperatura y moco (con halo solo si está seleccionado) */}
    <div className="mt-[0.2rem] flex h-[0.3rem] items-center justify-center gap-[0.18rem]" aria-hidden="true">
      <span className={temperatureDotClass} />
      <span className={mucusDotClass} />
    </div>

    {/* Badge pico (✖/+1..+3) en esquina superior derecha */}
    {peakBadgeContent && (
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-[1px] right-[0.5px] rounded-sm px-[2px] text-[0.75rem] font-semibold leading-none text-fertiliapp-fuerte shadow-[0_0_0_1px_rgba(255,255,255,0.9)]',
          isSelected ? 'bg-rose-100/90 text-fertiliapp-fuerte' : 'bg-white/90'
        )}
      >
        {peakBadgeContent}
      </span>
    )}
  </div>
);

    },
    [archivedCycleIntervals, cycleDayIsoSet, peakStatuses, recordDetailsByIso, showRelationsRow]
  );

  const cycleDayMap = useMemo(() => {
    const map = new Map();
    cycleDays.forEach((day) => {
      map.set(day.isoDate, day);
    });
    return map;
  }, [cycleDays]);

  const selectedDayData = selectedDate ? cycleDayMap.get(selectedDate) || null : null;
  const selectedDayDetails = selectedDayData?.details ?? null;
  const selectedPeakStatus = selectedDayDetails?.peakStatus ?? (selectedDate ? peakStatuses[selectedDate] ?? null : null);
  const selectedIsPeakDay = selectedDayDetails?.isPeakDay ?? selectedPeakStatus === 'P';
  const currentPeakIsoDate = useMemo(() => {
    const peakRecord = cycle?.data?.find((record) => record?.peak_marker === 'peak');
    return peakRecord?.isoDate || null;
  }, [cycle?.data]);



  const defaultSelectedIso = useMemo(() => {
    if (!cycleRange) return null;

    const cycleEndIso = cycleRange?.to
      ? format(startOfDay(cycleRange.to), 'yyyy-MM-dd')
      : null;
    const cycleStartIso = cycleRange?.from
      ? format(startOfDay(cycleRange.from), 'yyyy-MM-dd')
      : null;

    if (routeSelectedIso && cycleDayIsoSet.has(routeSelectedIso)) {
      return routeSelectedIso;
    }

    // Ciclo actual (sin endDate): por defecto, hoy (si cae dentro del ciclo mostrado)
    if (!cycle?.endDate) {
      const todayIso = format(startOfDay(new Date()), 'yyyy-MM-dd');
      if (cycleDayIsoSet.has(todayIso)) return todayIso;
    }

    // Si no, prioriza fin de ciclo; si no existe, inicio; si no, último día con registro
   if (cycleEndIso && cycleDayIsoSet.has(cycleEndIso)) return cycleEndIso;
    if (cycleStartIso && cycleDayIsoSet.has(cycleStartIso)) return cycleStartIso;
    return sortedRecordDates[0] ?? null;
  }, [cycle?.endDate, cycleRange, cycleDayIsoSet, routeSelectedIso, sortedRecordDates]);

  useEffect(() => {
    if (selectedDate && cycleDayIsoSet.has(selectedDate)) {
      return;
    }

    if (!defaultSelectedIso) {
      if (selectedDate !== null) {
        setSelectedDate(null);
      }
      return;
    }

    if (selectedDate !== defaultSelectedIso) {
      setSelectedDate(defaultSelectedIso);

    }
}, [selectedDate, cycleDayIsoSet, defaultSelectedIso]);

  const handleCalendarSelect = useCallback(
  (day) => {
    if (!day) return;

    const selectedDay = startOfDay(day);
    const today = startOfDay(new Date());

    if (isAfter(selectedDay, today)) {
      return;
    }

    const iso = format(selectedDay, 'yyyy-MM-dd');

    if (cycleRange) {
      if (isBefore(selectedDay, cycleRange.from) || isAfter(selectedDay, cycleRange.to)) {
        const targetCycle = findCycleForDate(selectedDay);
        if (targetCycle) {
          const targetIndex = orderedCycles.findIndex((availableCycle) => availableCycle.id === targetCycle.id);
          const direction =
            currentCycleIndex >= 0 && targetIndex >= 0 && targetIndex < currentCycleIndex
              ? 'previous'
              : 'next';
          navigateToCycleWithTransition(targetCycle, direction, iso);
        }
        return;
      }
    }

    setSelectedDate(iso);
  },
  [currentCycleIndex, cycleRange, findCycleForDate, navigateToCycleWithTransition, orderedCycles]
);

  useLayoutEffect(() => {
  if (!isCalendarOpen) {
    positionedCalendarMonthKeyRef.current = null;
    return;
  }

  if (!selectedDate) {
    return;
  }

  const parsed = parseISO(selectedDate);
  if (!isValid(parsed)) {
    return;
  }

  const monthKey = format(startOfMonth(parsed), 'yyyy-MM');
  const positionedKey = `${cycle?.id ?? 'cycle'}:${monthKey}`;

  if (positionedCalendarMonthKeyRef.current === positionedKey) {
    return;
  }

  const targetIndex = calendarMonths.findIndex(
    (calendarMonth) => format(calendarMonth, 'yyyy-MM') === monthKey
  );

  if (targetIndex < 0) {
    return;
  }

  const container = calendarScrollContainerRef.current;

  if (!container) {
    return;
  }

  container.scrollLeft = targetIndex * container.clientWidth;
  setVisibleCalendarMonthIndex(targetIndex);
  positionedCalendarMonthKeyRef.current = positionedKey;
}, [calendarMonths, cycle?.id, isCalendarOpen, selectedDate]);

  const scrollToCalendarMonthIndex = useCallback(
    (nextIndex) => {
      const container = calendarScrollContainerRef.current;
      if (!container || !calendarMonths.length) return;

      const clampedIndex = Math.max(0, Math.min(calendarMonths.length - 1, nextIndex));
      container.scrollTo({
        left: clampedIndex * container.clientWidth,
        behavior: 'smooth',
      });
      setVisibleCalendarMonthIndex(clampedIndex);
    },
    [calendarMonths.length]
  );

  const handleCalendarMonthScroll = useCallback(() => {
    const container = calendarScrollContainerRef.current;
    if (!container) return;

    if (calendarScrollFrameRef.current) {
      cancelAnimationFrame(calendarScrollFrameRef.current);
    }

    calendarScrollFrameRef.current = requestAnimationFrame(() => {
      const width = container.clientWidth || 1;
      const nextIndex = Math.max(
        0,
        Math.min(calendarMonths.length - 1, Math.round(container.scrollLeft / width))
      );
      setVisibleCalendarMonthIndex(nextIndex);
      calendarScrollFrameRef.current = null;
    });
  }, [calendarMonths.length]);

  useEffect(() => {
    return () => {
      if (calendarScrollFrameRef.current) {
        cancelAnimationFrame(calendarScrollFrameRef.current);
        calendarScrollFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setVisibleCalendarMonthIndex((prev) =>
      Math.max(0, Math.min(calendarMonths.length - 1, prev))
    );
  }, [calendarMonths.length]);

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setPendingEndDate(null);
    setPendingIncludeEndDate(false);
    setOverlapCycle(null);
    setOverlapImpactPreview(null);
    setShowOverlapDialog(false);
  }, []);

  const openStartDateEditor = useCallback(() => {
    setDraftStartDate(cycle?.startDate || '');
    setDraftEndDate(cycle?.endDate || '');
    setStartDateError('');
    resetStartDateFlow();
    setShowStartDateEditor(true);
  }, [cycle?.startDate, cycle?.endDate, resetStartDateFlow]);

  const closeStartDateEditor = useCallback(() => {
    setShowStartDateEditor(false);
    setStartDateError('');
    resetStartDateFlow();
    setDraftStartDate(cycle?.startDate || '');
    setDraftEndDate(cycle?.endDate || '');
  }, [cycle?.startDate, cycle?.endDate, resetStartDateFlow]);

  const toggleStartDateEditor = useCallback(() => {
    if (showStartDateEditor) {
      closeStartDateEditor();
      return;
    }
    openStartDateEditor();
  }, [closeStartDateEditor, openStartDateEditor, showStartDateEditor]);


  const handleConfirmUndoCycle = useCallback(async () => {
    if (!contextCurrentCycle?.id) return;
    setIsUndoingCycle(true);
    try {
      await contextUndoCurrentCycle(contextCurrentCycle.id);
      setShowUndoCycleDialog(false);
      closeStartDateEditor();
    } catch (error) {
      console.error('Failed to undo cycle', error);
    } finally {
      setIsUndoingCycle(false);
    }
  }, [closeStartDateEditor, contextCurrentCycle?.id, contextUndoCurrentCycle]);

  const handleDeleteCycleFromEditor = useCallback(() => {
    if (onRequestDeleteCycle) {
      closeStartDateEditor();
      onRequestDeleteCycle();
    }
  }, [closeStartDateEditor, onRequestDeleteCycle]);

  const handleCancelOverlapStart = useCallback(() => {
    resetStartDateFlow();
  }, [resetStartDateFlow]);

  const handleSaveStartDate = useCallback(async () => {
    if (!draftStartDate) {
      setStartDateError('La fecha de inicio es obligatoria');
      return;
    }

    if (includeEndDate && draftEndDate && draftEndDate < draftStartDate) {
      setStartDateError('La fecha de fin no puede ser anterior al inicio');
      return;
    }

    if (!cycle?.id) {
      return;
    }

    setStartDateError('');
    setIsUpdatingStartDate(true);

    try {
      const resolvedEndDate = includeEndDate ? draftEndDate || undefined : undefined;
      const impactPreview = previewUpdateCycleDates
        ? await previewUpdateCycleDates(cycle.id, draftStartDate, resolvedEndDate)
        : null;

      if (impactPreview) {
        setPendingStartDate(draftStartDate);
        setPendingEndDate(resolvedEndDate ?? null);
        setPendingIncludeEndDate(!!includeEndDate);
        setOverlapCycle(null);
        setOverlapImpactPreview(impactPreview);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(
            cycle.id,
            draftStartDate,
            resolvedEndDate
          )
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        setPendingEndDate(resolvedEndDate ?? null);
        setPendingIncludeEndDate(!!includeEndDate);
        setOverlapCycle(overlap);
        setOverlapImpactPreview(null);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(
        cycle.id,
        draftStartDate,
        includeEndDate ? draftEndDate || undefined : undefined
      );
      await refreshData({ silent: true });
      closeStartDateEditor();
    } catch (error) {
      const publicError = getPublicError ? getPublicError(error) : null;
      console.error('Error updating start date from records page:', error);
      setStartDateError(publicError?.message || 'No se pudieron actualizar las fechas');
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudieron actualizar las fechas.',
        variant: 'destructive',
        action: publicError?.action?.label === 'Revisar' ? (
          <ToastAction altText="Revisar" onClick={() => openDataRepairDialog?.(cycle?.id)}>
            Revisar
          </ToastAction>
        ) : undefined,
      });
    } finally {
      setIsUpdatingStartDate(false);
    }
  }, [
    draftStartDate,
    draftEndDate,
    includeEndDate,
    cycle?.id,
    checkCycleOverlap,
    previewUpdateCycleDates,
    updateCycleDates,
    refreshData,
    toast,
    closeStartDateEditor,
  ]);

  const handleConfirmOverlapStart = useCallback(async () => {
    if (!cycle?.id || !pendingStartDate) {
      resetStartDateFlow();
      return;
    }

    setIsUpdatingStartDate(true);
    setShowOverlapDialog(false);

    try {
      const currentStartDate = cycle.startDate;
      const currentEndDate = cycle.endDate ?? undefined;
      const hasStartChange = pendingStartDate !== currentStartDate;
      const resolvedPendingEnd = pendingIncludeEndDate
        ? pendingEndDate ?? undefined
        : undefined;
      const hasEndChange =
        pendingIncludeEndDate &&
        pendingEndDate !== null &&
        resolvedPendingEnd !== currentEndDate;

      await updateCycleDates(
        cycle.id,
        hasStartChange ? pendingStartDate : undefined,
        resolvedPendingEnd
      );
      await refreshData({ silent: true });
      closeStartDateEditor();
    } catch (error) {
      const publicError = getPublicError ? getPublicError(error) : null;
      console.error('Error adjusting cycle dates from records page:', error);
      setStartDateError(publicError?.message || 'No se pudieron actualizar las fechas');
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudieron actualizar las fechas.',
        variant: 'destructive',
        action: publicError?.action?.label === 'Revisar' ? (
          <ToastAction altText="Revisar" onClick={() => openDataRepairDialog?.(cycle?.id)}>
            Revisar
          </ToastAction>
        ) : undefined,
      });
    } finally {
      setIsUpdatingStartDate(false);
      resetStartDateFlow();
    }
  }, [
    cycle?.id,
    cycle?.startDate,
    cycle?.endDate,
    pendingStartDate,
    pendingIncludeEndDate,
    pendingEndDate,
    updateCycleDates,
    refreshData,
    toast,
    closeStartDateEditor,
    resetStartDateFlow,
  ]);



  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
    setDefaultFormIsoDate(null);
    setFocusedField(null);
    setInitialSectionKey(null);
    setIsDetailLoading(false);
    activeRecordLoadRef.current = null;
  }, []);

  const openRecordForm = useCallback(
    async (record, fieldName = null, sectionKey = null) => {
      if (!record) return;

      activeRecordLoadRef.current = record.id ?? null;
      setEditingRecord(record);
      setDefaultFormIsoDate(record.isoDate ?? null);
      setFocusedField(fieldName);
      setInitialSectionKey(sectionKey ?? null);

      if (record.isoDate) {
        setSelectedDate(record.isoDate);
      }

      setShowForm(true);

      const hasLoadedMeasurements =
        record?.measurementsLoaded ||
        (Array.isArray(record?.measurements) && record.measurements.length > 0);
      if (getMeasurementsForEntry && record?.id && cycle?.id && !hasLoadedMeasurements) {
        setIsDetailLoading(true);
        try {
          const measurements = await getMeasurementsForEntry(cycle.id, record.id);
          if (activeRecordLoadRef.current === record.id) {
            setEditingRecord((prev) =>
              prev?.id === record.id
                ? { ...prev, measurements, measurementsLoaded: true }
                : prev
            );
          }
        } finally {
          setIsDetailLoading(false);
        }
      }
    },
    [cycle?.id, getMeasurementsForEntry]
  );

  const handleEdit = useCallback(
    (record, sectionKey = null, fieldName = null) => openRecordForm(record, fieldName, sectionKey),
    [openRecordForm]
  );

  const handleDeleteRequest = (recordId) => {
    const record = cycle?.data?.find((r) => r.id === recordId);
    setRecordToDelete(record || null);
  };

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleAddRecordForDay = useCallback((isoDate, sectionKey = null, fieldName = null) => {
    if (!isoDate) {
      return;
    }

    activeRecordLoadRef.current = null;
    setSelectedDate(isoDate);
    setEditingRecord(null);
    setDefaultFormIsoDate(isoDate);
    setFocusedField(fieldName);
    setInitialSectionKey(sectionKey);
    setShowForm(true);
  }, []);

  const handleOpenAddRecord = useCallback(() => {
    const fallbackIso = cycleDays.length ? cycleDays[0].isoDate : cycle?.startDate || null;
    const targetIso = selectedDate || fallbackIso || null;

    activeRecordLoadRef.current = null;
    setEditingRecord(null);
    setDefaultFormIsoDate(targetIso);
    setFocusedField(null);
    setInitialSectionKey(null);

    if (targetIso) {
      setSelectedDate(targetIso);
    }

    setShowForm(true);
  }, [cycleDays, cycle?.startDate, selectedDate]);

  const handleOpenNewCycleDialog = useCallback((initialIsoDate = null) => {
    setNewCyclePrefillDate(initialIsoDate || selectedDate || null);
    setShowNewCycleDialog(true);
  }, [selectedDate]);

  const buildRecordPayloadForDate = useCallback(
    (isoDate, overrides = {}) => {
      const existingRecord = cycle?.data?.find((record) => record.isoDate === isoDate) || null;
      const baseTime = existingRecord?.timestamp && isValid(parseISO(existingRecord.timestamp))
        ? format(parseISO(existingRecord.timestamp), 'HH:mm')
        : format(new Date(), 'HH:mm');

      const fallbackTemperatureRaw = existingRecord?.temperature_raw ?? existingRecord?.temperature ?? '';
      const fallbackTemperatureCorrected = existingRecord?.temperature_corrected ?? '';
      const fallbackUseCorrected = Boolean(existingRecord?.use_corrected);
      const measurements = existingRecord?.measurements?.length
        ? existingRecord.measurements.map((measurement, idx) => {
            const measurementTime =
              measurement?.time ||
              (measurement?.timestamp && isValid(parseISO(measurement.timestamp))
                ? format(parseISO(measurement.timestamp), 'HH:mm')
                : baseTime);

            return {
              temperature:
                measurement?.temperature ??
                measurement?.temperature_raw ??
                fallbackTemperatureRaw,
              temperature_corrected:
                measurement?.temperature_corrected ?? fallbackTemperatureCorrected,
              time: measurementTime,
              time_corrected: measurement?.time_corrected || measurementTime,
              use_corrected:
                measurement?.use_corrected !== undefined
                  ? Boolean(measurement?.use_corrected)
                  : fallbackUseCorrected,
              selected: Boolean(measurement?.selected ?? idx === 0),
            };
          })
        : [
            {
              temperature: fallbackTemperatureRaw,
              temperature_corrected: fallbackTemperatureCorrected,
              time: baseTime,
              time_corrected: baseTime,
              use_corrected: fallbackUseCorrected,
              selected: true,
            },
          ];

      return {
        isoDate,
        measurements,
        mucusSensation: existingRecord?.mucusSensation ?? existingRecord?.mucus_sensation ?? '',
        mucusAppearance: existingRecord?.mucusAppearance ?? existingRecord?.mucus_appearance ?? '',
        fertility_symbol: existingRecord?.fertility_symbol ?? existingRecord?.fertilitySymbol ?? 'none',
        observations: existingRecord?.observations ?? '',
        peak_marker: existingRecord?.peak_marker ?? null,
        ignored: existingRecord?.ignored ?? false,
        ...overrides,
      };
    },
    [cycle?.data]
  );
  const handleSave = async (data, { keepFormOpen = false, submitAction = null } = {}) => {
  setIsProcessing(true);

  const toastMessage =
    submitAction === 'relations'
      ? getRelationsToastMessage(Boolean(data?.had_relations ?? data?.hadRelations))
      : getRecordUpdateToastMessage(editingRecord, data);
    toast({
  title: toastMessage,
  duration: submitAction === 'relations' ? 1400 : 2000,
});
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      toast({
        title: toastMessage,
        duration: 2000,
      });
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setDefaultFormIsoDate(null);
        setFocusedField(null);
        setInitialSectionKey(null);
      }
    } catch (error) {
      const publicError = getPublicError ? getPublicError(error) : null;
      const canReview = ['duplicate-iso-date', 'entry-out-of-range'].includes(publicError?.code);
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudo guardar el registro',
        variant: 'destructive',
        action: canReview ? (
          <ToastAction altText="Revisar" onClick={() => openDataRepairDialog?.(cycle?.id)}>
            Revisar
          </ToastAction>
        ) : undefined,
      });
    } finally {
      setIsProcessing(false);
      if (keepFormOpen) {
        setDefaultFormIsoDate(data?.isoDate ?? null);
      }
    }
  };


   const handleToggleRelations = useCallback(
    async (isoDate) => {
      if (!isoDate) {
        return;
      }

      const existingRecord = cycle?.data?.find((record) => record.isoDate === isoDate) || null;
      const hasRelations = Boolean(existingRecord?.had_relations ?? existingRecord?.hadRelations ?? false);
      const payload = buildRecordPayloadForDate(isoDate, {
        had_relations: !hasRelations,
        hadRelations: !hasRelations,
      });

      setIsProcessing(true);
      try {
        await addOrUpdateDataPoint(payload, existingRecord);
        toast({
          title: getRelationsToastMessage(!hasRelations),
          duration: 1400,
        });
      } catch (error) {
        toast({ title: 'Error', description: 'No se pudo actualizar RS', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    },
    [addOrUpdateDataPoint, buildRecordPayloadForDate, cycle?.data, toast]
  );

  const handleTogglePeak = useCallback(
    async ({ isoDate, peakMode }) => {
      if (!isoDate) {
        return;
      }

      const existingRecord = cycle?.data?.find((record) => record.isoDate === isoDate) || null;
      const payload = buildRecordPayloadForDate(isoDate, {
        peak_marker: peakMode === 'remove' ? null : 'peak',
      });

      setIsProcessing(true);
      try {
        await addOrUpdateDataPoint(payload, existingRecord);
        toast({
          title: getPeakDayToastMessage(peakMode),
          duration: 1400,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'No se pudo actualizar el día pico',
          variant: 'destructive',
        });
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [addOrUpdateDataPoint, buildRecordPayloadForDate, cycle?.data, toast]
  );

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsProcessing(true);
    try {
      const deletedIso = recordToDelete.isoDate;
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
      setDefaultFormIsoDate(null);
      if (deletedIso && selectedDate === deletedIso) {
        setSelectedDate(deletedIso);
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const headerActionProps = {
    openDateEditor: toggleStartDateEditor,
    openAddRecord: handleOpenAddRecord,
    isProcessing,
    isUpdatingDates: isUpdatingStartDate,
    cycle,
    isDateEditorOpen: showStartDateEditor,
  };


  const resolvedTopAccessory =
    typeof topAccessory === 'function'
      ? topAccessory({
          ...headerActionProps,
        })
      : topAccessory ?? null;

  if (isLoading && !cycle?.id) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-[#fff7f9]">
        <p className="text-center text-titulo text-lg">Cargando...</p>
      </div>
    );
  }

  if (!cycle?.id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#fff7f9] px-4 py-4">
        <div className="w-full space-y-4 rounded-3xl border border-rose-100/70 bg-white p-4 text-center shadow-sm">
          <p className="text-[15px] font-semibold text-slate-800">No hay ciclo activo.</p>
          <button
            onClick={() => handleOpenNewCycleDialog()}
            className="h-11 w-full rounded-full bg-fertiliapp-fuerte px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Iniciar ciclo
          </button>
        </div>
        <NewCycleDialog
          isOpen={showNewCycleDialog}
          onClose={() => {
            setShowNewCycleDialog(false);
            setNewCyclePrefillDate(null);
          }}
          onPreview={(selectedStartDate) => previewStartNewCycle?.(selectedStartDate, cycle?.id)}
          onConfirm={async (selectedStartDate) => {
            await startNewCycle(selectedStartDate);
            setShowNewCycleDialog(false);
            setNewCyclePrefillDate(null);
            setInitialSectionKey(null);
            setShowForm(true);
          }}
          currentCycleRecords={cycle?.data ?? []}
          initialStartDate={newCyclePrefillDate}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col bg-[#fff7f9]">
    {isUpdatingStartDate && (
  <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/25 backdrop-blur-sm">
    <div className="rounded-3xl border border-fertiliapp-suave bg-white/90 px-5 py-4 shadow-lg">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-fertiliapp-fuerte" />
        <div className="min-w-0">
          <div className="font-semibold text-titulo">Aplicando cambios…</div>
          <div className="text-sm">Puede tardar unos segundos.</div>
        </div>
      </div>
    </div>
  </div>
)}  
    <AnimatePresence>
      {cycleNavigationTransition && (
        <motion.div
          key="cycle-navigation-transition"
          className="pointer-events-none fixed inset-0 z-[998] flex items-center justify-center bg-fertiliapp-fuerte/10 backdrop-blur-[1px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-fertiliapp-fuerte shadow-lg"
            initial={{
              opacity: 0,
              x: cycleNavigationTransition === 'previous' ? 18 : -18,
              scale: 0.94,
            }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: cycleNavigationTransition === 'previous' ? -18 : 18,
              scale: 0.98,
            }}
            transition={{ duration: 0.16 }}
          >
            {cycleNavigationTransition === 'previous' ? (
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 px-4 pb-24">
        <div className="relative z-30 -mx-4">
  <div className="w-full">
    <RecordsHeader
      title={resolvedHeaderTitle}
      meta={resolvedHeaderMeta}
      isCurrentCycle={isCurrentCycle}
      topAccessory={resolvedTopAccessory}
      onEditDates={toggleStartDateEditor}
      onAddRecord={handleOpenAddRecord}
      isProcessing={isProcessing}
      isUpdatingDates={isUpdatingStartDate}
      isDateEditorOpen={showStartDateEditor}
      previousCycle={previousCycle}
      nextCycle={nextCycle}
      onNavigateCycle={navigateToCycle}
      postpartumMode={cycle?.postpartumMode}
    />
  </div>
</div>

        <div className="relative mx-auto w-full max-w-lg overflow-visible rounded-2xl p-1.5 sm:p-2">
          <div className="space-y-1.5 relative z-10">
            <DataIssuesBanner issues={cycle?.issues} onReview={() => openDataRepairDialog?.(cycle?.id)} />

            {showStartDateEditor && (
              <motion.div
                ref={cycleDatesEditorRef}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <CycleDatesEditor
                  cycle={cycle}
                  startDate={draftStartDate}
                  endDate={includeEndDate ? draftEndDate : cycle?.endDate}
                  otherCycles={[...(archivedCycles ?? []), contextCurrentCycle].filter(Boolean)}
                  onStartDateChange={(value) => setDraftStartDate(value)}
                  onEndDateChange={includeEndDate ? (value) => setDraftEndDate(value) : undefined}
                  onSave={handleSaveStartDate}
                  onCancel={closeStartDateEditor}
                  isProcessing={isUpdatingStartDate || isLoading || isUndoingCycle}
                  dateError={startDateError}
                  includeEndDate={includeEndDate}
                  showOverlapDialog={showOverlapDialog}
                  overlapCycle={overlapCycle}
                  overlapImpactPreview={overlapImpactPreview}
                  onConfirmOverlap={handleConfirmOverlapStart}
                  onCancelOverlap={handleCancelOverlapStart}
                  onClearError={() => setStartDateError('')}
                  saveLabel={includeEndDate ? 'Guardar fechas' : 'Guardar cambios'}
                  title={includeEndDate ? 'Editar fechas del ciclo' : 'Editar fecha de inicio'}
                  onUndoCycle={undoCandidate ? () => setShowUndoCycleDialog(true) : undefined}
                  isUndoingCycle={isUndoingCycle}
                  onDeleteCycle={onRequestDeleteCycle ? handleDeleteCycleFromEditor : undefined}
                  deleteTitle={dateEditorDeleteTitle}
                  deleteDescription={dateEditorDeleteDescription}
                  deleteLabel={dateEditorDeleteLabel}
                  isDeletingCycle={isDeletingCycle}
                />
              </motion.div>
            )}
            <AnimatePresence initial={false}>
              {isCalendarOpen && (
                <motion.div
                  key="records-calendar"
                  id="records-calendar"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-center"
                >
                  <div className="relative mx-auto w-full max-w-sm">
                    <div
                      ref={calendarScrollContainerRef}
                      onScroll={handleCalendarMonthScroll}
                      className="flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-3xl border border-rose-200/70 bg-white/95 shadow-sm [scrollbar-width:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
                    >
                      {calendarMonths.map((calendarMonth) => (
                        <div
                          key={format(calendarMonth, 'yyyy-MM')}
                          data-calendar-month={format(calendarMonth, 'yyyy-MM')}
                          className="w-full flex-none snap-start"
                        >
                          <Calendar
                            mode="single"
                            locale={es}
                            month={calendarMonth}
                            disableNavigation
                            disabled={(day) => isAfter(startOfDay(day), startOfDay(new Date()))}
                            selected={selectedDate && isValid(parseISO(selectedDate)) ? parseISO(selectedDate) : undefined}
                            onSelect={handleCalendarSelect}
                            onDayClick={handleCalendarSelect}
                            modifiers={calendarModifiers}
                            labels={calendarLabels}
                            components={{ DayContent: renderCalendarDay }}
                            className="w-full !p-2.5 [&_button]:text-slate-900 [&_button:hover]:bg-tarjeta [&_button[aria-selected=true]]:bg-transparent"
                            classNames={calendarClassNames}
                            modifiersClassNames={{
                              hasRecord: 'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
                              outsideCycle: 'text-slate-300 hover:text-slate-300 hover:bg-transparent',
                              insideCycleNoRecord:
                                'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {calendarMonths.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => scrollToCalendarMonthIndex(visibleCalendarMonthIndex - 1)}
                          disabled={visibleCalendarMonthIndex <= 0}
                          aria-label="Mes anterior"
                          className="absolute left-4 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-rose-100 bg-white text-fertiliapp-fuerte shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollToCalendarMonthIndex(visibleCalendarMonthIndex + 1)}
                          disabled={visibleCalendarMonthIndex >= calendarMonths.length - 1}
                          aria-label="Mes siguiente"
                          className="absolute right-4 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-rose-100 bg-white text-fertiliapp-fuerte shadow-sm transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>       
          </div>
        </div>


        {/* Records List */}
        <div className="w-full max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative space-y-2 px-1.5 pt-0 sm:px-2 lg:px-4"
          >
         
          {cycleDays.length === 0 ? (
            <motion.div
              className="py-12 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="mx-auto max-w-md rounded-3xl border border-rose-100/70 bg-white p-8 shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-fertiliapp-fuerte">
                  <ClipboardList className="h-9 w-9" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">Aún no hay días para mostrar</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Actualiza la fecha de inicio del ciclo o añade tu primer registro para comenzar a ver el historial.
                </p>
              </div>
            </motion.div>
          ) : (
            <DayDetail
              isoDate={selectedDate}
              cycleDay={selectedDayData?.cycleDay ?? null}
              details={selectedDayDetails}
              peakStatus={selectedPeakStatus}
              isPeakDay={selectedIsPeakDay}
              existingPeakIsoDate={currentPeakIsoDate}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
              onAdd={handleAddRecordForDay}
              onToggleRelations={handleToggleRelations}
              onTogglePeak={handleTogglePeak}
              isProcessing={isProcessing}
            />
          )}
        </motion.div>
        {afterRecordsContent && <div className="pt-4 space-y-4">{afterRecordsContent}</div>}
        </div>
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          } else {
            handleCloseForm();
          }
        }}
      >
        <DialogContent
  unstyled
  hideClose
  className="w-[96vw] max-w-2xl border-0 bg-transparent p-0 text-gray-800 shadow-none overflow-visible"
>
      <DataEntryForm
        onSubmit={handleSave}
        onCancel={handleCloseForm}
        initialData={editingRecord}
        cycleStartDate={cycle?.startDate}
        cycleEndDate={cycle?.endDate}
        isProcessing={isProcessing || isDetailLoading}
        isEditing={!!editingRecord}
        cycleData={cycle?.data}
        onDateSelect={handleDateSelect}
        defaultIsoDate={defaultFormIsoDate}
        focusedField={focusedField}
        initialSectionKey={initialSectionKey}
        onOpenNewCycle={handleOpenNewCycleDialog}
        onJumpToDayDetail={(iso) => {
          if (!iso) return;
          setSelectedDate(iso);
          handleCloseForm();
          requestAnimationFrame(() => {
            document.getElementById('day-detail-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }}
      />
</DialogContent>
      </Dialog>

<NewCycleDialog
        isOpen={showNewCycleDialog}
        onClose={() => {
          setShowNewCycleDialog(false);
          setNewCyclePrefillDate(null);
        }}
        onPreview={(selectedStartDate) => previewStartNewCycle?.(selectedStartDate, cycle?.id)}
        onConfirm={async (selectedStartDate) => {
          await startNewCycle(selectedStartDate);
          setShowNewCycleDialog(false);
          setNewCyclePrefillDate(null);
          setInitialSectionKey(null);
          setShowForm(true);
        }}
        currentCycleStartDate={cycle?.startDate}
        currentCycleRecords={cycle?.data ?? []}
        initialStartDate={newCyclePrefillDate}
      />

<DeletionDialog
        isOpen={showUndoCycleDialog}
        onClose={() => setShowUndoCycleDialog(false)}
        onConfirm={handleConfirmUndoCycle}
        title="Deshacer ciclo"
        confirmLabel="Deshacer ciclo"
        cancelLabel="Cancelar"
        description={undoCycleDescription}
        isProcessing={isUndoingCycle}
      />

      <DataRepairDialog
        open={repairDialogState?.open && repairDialogState?.cycleId === cycle?.id}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openDataRepairDialog?.(cycle?.id);
          } else {
            closeDataRepairDialog?.();
          }
        }}
        cycle={cycle}
        cycles={[...(archivedCycles || []), contextCurrentCycle].filter(Boolean)}
        onResolveDuplicate={handleResolveDuplicateIssue}
        onMoveOutOfRange={handleMoveOutOfRangeIssue}
        onDeleteEntry={handleDeleteIssueEntry}
      />

      <DeletionDialog
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar registro"
        confirmLabel="Eliminar registro"
        description={
          recordToDelete
            ? `¿Estás seguro de que quieres eliminar el registro del ${format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy')}? Esta acción no se puede deshacer.`
            : ''
        }
        isProcessing={isProcessing}
      />
    </div>
  );
};
const RecordsPage = () => <RecordsExperience />;

export default RecordsPage;
