import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
} from 'react';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import DayDetail from '@/components/DayDetail';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Plus, FileText } from 'lucide-react';
import NewCycleDialog from '@/components/NewCycleDialog';
import {
  format,
  parseISO,
  isValid,
  max,
  isBefore,
  isAfter,
  startOfDay,
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
import { cn } from '@/lib/utils';

const getSymbolInfo = (symbolValue) =>
  FERTILITY_SYMBOL_OPTIONS.find((symbol) => symbol.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0];
const CALENDAR_BOUNDARY_OFFSET = 10;
const CALENDAR_SWIPE_OFFSET = 60;
const CALENDAR_SWIPE_VELOCITY = 400;
const CALENDAR_EXIT_OFFSET = 120;
const CALENDAR_DRAG_LIMIT = 85;
const CALENDAR_DRAG_ACTIVATION_THRESHOLD = 5;
const CALENDAR_SNAP_DURATION = 160;
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

export const RecordsExperience = ({
  cycle: cycleProp,
  headerTitle,
  headerIcon: HeaderIcon = FileText,
  headerActions,
  topAccessory,
  includeEndDate = false,
  addOrUpdateDataPoint: addOrUpdateDataPointProp,
  deleteRecord: deleteRecordProp,
  isLoading: isLoadingProp,
  updateCycleDates: updateCycleDatesProp,
  checkCycleOverlap: checkCycleOverlapProp,
  forceShiftNextCycleStart: forceShiftNextCycleStartProp,
  forceUpdateCycleStart: forceUpdateCycleStartProp,
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
    addOrUpdateDataPoint: contextAddOrUpdateDataPoint,
    deleteRecord: contextDeleteRecord,
    isLoading: contextIsLoading,
    updateCycleDates: contextUpdateCycleDates,
    checkCycleOverlap: contextCheckCycleOverlap,
    forceUpdateCycleStart: contextForceUpdateCycleStart,
    forceShiftNextCycleStart: contextForceShiftNextCycleStart,
    startNewCycle: contextStartNewCycle,
    refreshData: contextRefreshData,
  } = useCycleData();
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
  const forceUpdateCycleStart = forceUpdateCycleStartProp
    ? forceUpdateCycleStartProp
    : async (cycleId, startDate) =>
        contextForceUpdateCycleStart(cycleId ?? cycle?.id, startDate);
  const forceShiftNextCycleStart = forceShiftNextCycleStartProp
    ? forceShiftNextCycleStartProp
    : async (cycleId, newEndDate, newStartDate) =>
        contextForceShiftNextCycleStart(cycleId ?? cycle?.id, newEndDate, newStartDate);
  const startNewCycle = startNewCycleProp ?? contextStartNewCycle;
  const refreshData = refreshDataProp ?? contextRefreshData;
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => cycle?.startDate || '');
  const [draftEndDate, setDraftEndDate] = useState(() => cycle?.endDate || '');
  const [startDateError, setStartDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [pendingIncludeEndDate, setPendingIncludeEndDate] = useState(false);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [defaultFormIsoDate, setDefaultFormIsoDate] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);
  const cycleRangeLabel = useMemo(() => {
    if (!cycle?.startDate) return null;

    const parsedStart = parseISO(cycle.startDate);
    if (!isValid(parsedStart)) return null;

    const startLabel = format(parsedStart, 'dd/MM/yyyy');
    let endLabel = 'En curso';

    if (cycle?.endDate) {
      const parsedEnd = parseISO(cycle.endDate);
      if (isValid(parsedEnd)) {
        endLabel = format(parsedEnd, 'dd/MM/yyyy');
      }
    }

    return `${startLabel} - ${endLabel}`;
  }, [cycle?.endDate, cycle?.startDate]);

  const resolvedHeaderTitle = useMemo(() => {
    if (headerTitle) return headerTitle;

    if (cycle?.type === 'current' || !cycle?.endDate) {
      return 'Ciclo actual';
    }

    return cycleRangeLabel ?? 'Mis registros';
  }, [cycle?.endDate, cycle?.type, cycleRangeLabel, headerTitle]);
  const isCalendarOpen = true;
  const calendarContainerRef = useRef(null);
  const recordsScrollRef = useRef(null);
  const calendarHeightRef = useRef(0);
  const [calendarHeight, setCalendarHeight] = useState(0);

  const updateCalendarMetrics = useCallback(() => {
    const element = calendarContainerRef.current;

    if (!element) {
      calendarHeightRef.current = 0;
      setCalendarHeight(0);
      return;
    }

    const rect = element.getBoundingClientRect();
    const measuredHeight = rect.height;

    calendarHeightRef.current = measuredHeight;
    setCalendarHeight((prev) => (Math.abs(prev - measuredHeight) > 0.5 ? measuredHeight : prev));
  }, []);

  useLayoutEffect(() => {
    let animationFrame = window.requestAnimationFrame(updateCalendarMetrics);

    const handleResize = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(updateCalendarMetrics);
    };

    window.addEventListener('resize', handleResize);

    let observer;

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        animationFrame = window.requestAnimationFrame(updateCalendarMetrics);
      });

      if (calendarContainerRef.current) {
        observer.observe(calendarContainerRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);

      if (observer) {
        observer.disconnect();
      }

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [updateCalendarMetrics]);

  const boundaryPx = useMemo(
    () => Math.max(Math.round(calendarHeight + CALENDAR_BOUNDARY_OFFSET), CALENDAR_BOUNDARY_OFFSET),
    [calendarHeight]
  );

  useEffect(() => {
    setDraftStartDate(cycle?.startDate || '');
    setDraftEndDate(cycle?.endDate || '');
  }, [cycle?.startDate, cycle?.endDate]);

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

  useEffect(() => {
    const container = recordsScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: 0, behavior: 'auto' });
  }, []);


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
        'relative flex !h-11 !w-11 rounded-2xl flex-col items-center justify-center !p-0 font-medium text-slate-700 aria-selected:opacity-100'
      ),
      day_selected:
        'rounded-2xl border border-rose-400 text-rose-600 focus:ring-2 focus:ring-rose-300 focus:ring-offset-2',
      day_today: 'rounded-2xl ring-1 ring-rose-300 text-rose-700 font-semibold bg-transparent',
    }),
    []
  );

  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(() => {
    if (selectedDate && isValid(parseISO(selectedDate))) {
      return parseISO(selectedDate);
    }
    if (cycleRange?.to) {
      return cycleRange.to;
    }
    return startOfDay(new Date());
  });

  const calendarAnimationRef = useRef(false);

   const calendarDragAnimationFrameRef = useRef(null);
  const calendarSwipeStateRef = useRef({
    active: false,
    startX: 0,
    pointerId: null,
    startTime: 0,
    dragging: false,
  });
  const calendarSwipeCleanupRef = useRef(null);
  const calendarSwipeContainerRef = useRef(null);
  const calendarDayGridRef = useRef(null);
  const calendarDragXRef = useRef(0);
  const [calendarDragX, setCalendarDragX] = useState(0);
  const [isCalendarDragging, setIsCalendarDragging] = useState(false);

  const updateCalendarDragX = useCallback((value) => {
    calendarDragXRef.current = value;
    setCalendarDragX(value);
  }, []);

  const waitForNextFrame = useCallback(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      }),
    []
  );

  const animateDragTo = useCallback(
    (target, { duration = CALENDAR_SNAP_DURATION } = {}) => {
      if (calendarDragAnimationFrameRef.current) {
        cancelAnimationFrame(calendarDragAnimationFrameRef.current);
        calendarDragAnimationFrameRef.current = null;
      }

      const start = calendarDragXRef.current;
      const diff = target - start;

      if (Math.abs(diff) < 0.5 || duration <= 0) {
        updateCalendarDragX(target);
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const startTime = performance.now();

        const step = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const nextValue = start + diff * easeOut(progress);
          updateCalendarDragX(nextValue);

          if (progress < 1) {
            calendarDragAnimationFrameRef.current = requestAnimationFrame(step);
            return;
          }

          calendarDragAnimationFrameRef.current = null;
          resolve();
        };

        calendarDragAnimationFrameRef.current = requestAnimationFrame(step);
      });
    },
    [updateCalendarDragX]
  );
  const calendarLabels = useMemo(
    () => ({
      labelDay: (day) => {
        const iso = format(day, 'yyyy-MM-dd');
        const details = recordDetailsByIso.get(iso);
        const baseLabel = format(day, 'd MMM', { locale: es });

        if (!details) {
          return baseLabel;
        }

        const infoParts = [];
        if (details.hasTemperature && details.hasMucus) {
          infoParts.push('temperatura y moco');
        } else if (details.hasTemperature) {
          infoParts.push('temperatura');
        } else if (details.hasMucus) {
          infoParts.push('moco');
        }

        if (details.hasRelations) {
          infoParts.push('RS');
        }

        if (details.peakStatus) {
          const peakLabel =
            details.peakStatus === 'P'
              ? 'pico ✖'
              : `pico +${details.peakStatus}`;
          infoParts.push(peakLabel);
        }

        if (!infoParts.length) {
          return baseLabel;
        }

        return `${baseLabel}: ${infoParts.join('; ')}`;
      },
    }),
    [recordDetailsByIso]
  );

  const renderCalendarDay = useCallback(
    ({ date, activeModifiers }) => {
      const iso = format(date, 'yyyy-MM-dd');
      const details = recordDetailsByIso.get(iso);

      const hasTemperature = details?.hasTemperature ?? false;
      const hasMucus = details?.hasMucus ?? false;
      const hasRelations = details?.hasRelations ?? false;
      const peakStatus = details?.peakStatus ?? null;
      const symbolInfo = details?.symbolInfo;
      const symbolValue = symbolInfo?.value;
      const isSelected = activeModifiers.selected;
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
        activeModifiers.outside || activeModifiers.outsideCycle
          ? 'text-slate-300'
          : isSelected
          ? shouldShowSymbolBackground
            ? 'text-white'
            : 'text-rose-600'
          : 'text-slate-700'
      );

      const peakBadgeContent =
        peakStatus === 'P' ? '✖' : peakStatus ? `+${peakStatus}` : null;

      const symbolBackgroundClass = shouldShowSymbolBackground
        ? cn(
            'pointer-events-none absolute inset-0 rounded-full transition-opacity',
            symbolInfo?.color ?? '',
            symbolInfo?.pattern === 'spotting-pattern' ? 'calendar-spotting-dot' : '',
            symbolValue === 'white' ? 'ring-1 ring-slate-300/70' : '',
            isSelected ? 'opacity-50' : 'opacity-25'
          )
        : null;

      return (
  <div className="relative flex h-full w-full flex-col items-center justify-center">
    {/* Número centrado con posible fondo de símbolo */}
    <span className="relative inline-flex h-8 w-8 items-center justify-center leading-none -mt-[1px]">
      {symbolBackgroundClass && <span className={symbolBackgroundClass} aria-hidden="true" />}
      <span className={numberClass}>{format(date, 'd')}</span>
    </span>


    {/* Dots inferiores: temperatura y moco (con halo solo si está seleccionado) */}
    <div className="mt-[0.22rem] flex h-[0.3rem] items-center justify-center gap-[0.18rem]" aria-hidden="true">
      <span className={temperatureDotClass} />
      <span className={mucusDotClass} />
    </div>

    {/* Badge pico (✖/+1..+3) en esquina superior derecha */}
    {peakBadgeContent && (
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-[1px] right-[1px] rounded-sm px-[2px] text-[0.55rem] font-semibold leading-none text-rose-500 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]',
          isSelected ? 'bg-rose-100/90 text-rose-700' : 'bg-white/90'
        )}
      >
        {peakBadgeContent}
      </span>
    )}
  </div>
);

    },
    [recordDetailsByIso]
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

  const defaultSelectedIso = useMemo(() => {
    const cycleEndIso = cycleRange?.to
      ? format(startOfDay(cycleRange.to), 'yyyy-MM-dd')
      : null;

    if (includeEndDate) {
      return cycleEndIso ?? sortedRecordDates[0] ?? null;
    }

    if (sortedRecordDates.length) {
      return sortedRecordDates[0];
    }

    return cycleEndIso;
  }, [includeEndDate, cycleRange, sortedRecordDates]);

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
      const iso = format(day, 'yyyy-MM-dd');

      if (cycleRange) {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return;
        }
      }

      setSelectedDate(iso);
    },
    [cycleRange]
  );

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const parsed = parseISO(selectedDate);
    if (!isValid(parsed)) {
      return;
    }

    setCurrentCalendarMonth((prev) => {
      if (
        prev &&
        prev.getFullYear() === parsed.getFullYear() &&
        prev.getMonth() === parsed.getMonth()
      ) {
        return prev;
      }
      return parsed;
    });
  }, [selectedDate]);

  const changeCalendarMonth = useCallback(
    (direction) => {
      setCurrentCalendarMonth((prev) => {
        const base = prev ?? (cycleRange?.to ?? startOfDay(new Date()));
        const offset = direction === 'next' ? 1 : -1;
        return addMonths(base, offset);
      });
    },
    [cycleRange]
  );

  useEffect(() => {
    if (!isCalendarOpen) {
      calendarDayGridRef.current = null;
      updateCalendarDragX(0);
      setIsCalendarDragging(false);
      return;
    }

    const container = calendarSwipeContainerRef.current;
    if (!container) {
      return;
    }

    const gridElement = container.querySelector('.records-calendar-day-grid');
    if (gridElement) {
      calendarDayGridRef.current = gridElement;
    }
  }, [currentCalendarMonth, isCalendarOpen, updateCalendarDragX]);

    const animateCalendarMonthChange = useCallback(
    async (direction) => {
      if (calendarAnimationRef.current) {
        return;
      }

      calendarAnimationRef.current = true;

const gridElement = calendarDayGridRef.current;
const measuredWidth = gridElement?.getBoundingClientRect()?.width ?? 0;
const fallback = direction === 'next' ? -CALENDAR_EXIT_OFFSET : CALENDAR_EXIT_OFFSET;
const exitTarget = measuredWidth
  ? direction === 'next'
    ? -measuredWidth
    : measuredWidth
  : fallback;
const enterStart = -exitTarget;



      try {
        await animateDragTo(exitTarget, { duration: CALENDAR_SNAP_DURATION });
        changeCalendarMonth(direction);

        updateCalendarDragX(enterStart);
        await waitForNextFrame();
        await animateDragTo(0, { duration: CALENDAR_SNAP_DURATION });
      } finally {
        calendarAnimationRef.current = false;
      }
    },
    [animateDragTo, changeCalendarMonth, updateCalendarDragX, waitForNextFrame]
  );


  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setPendingEndDate(null);
    setPendingIncludeEndDate(false);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
  }, []);

  useEffect(() => {
    return () => {
      if (calendarDragAnimationFrameRef.current) {
        cancelAnimationFrame(calendarDragAnimationFrameRef.current);
        calendarDragAnimationFrameRef.current = null;
      }
      if (calendarSwipeCleanupRef.current) {
        calendarSwipeCleanupRef.current();
        calendarSwipeCleanupRef.current = null;
      }
    };
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

  const handleDeleteCycleFromEditor = useCallback(() => {
    if (onRequestDeleteCycle) {
      closeStartDateEditor();
      onRequestDeleteCycle();
    }
  }, [closeStartDateEditor, onRequestDeleteCycle]);

  const handleCalendarPointerDown = useCallback(
    (event) => {
      if (!isCalendarOpen || calendarAnimationRef.current) {
        return;
      }

      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const gridTarget = event.target.closest('.records-calendar-day-grid');
      if (!gridTarget) {
        return;
      }

      const state = calendarSwipeStateRef.current;
      state.active = true;
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startTime = performance.now();
      state.dragging = false;

      const handlePointerMove = (moveEvent) => {
        if (!state.active || moveEvent.pointerId !== state.pointerId) {
          return;
        }

        const delta = moveEvent.clientX - state.startX;
        if (!state.dragging && Math.abs(delta) > CALENDAR_DRAG_ACTIVATION_THRESHOLD) {
          state.dragging = true;
          setIsCalendarDragging(true);
        }

        if (!state.dragging) {
          return;
        }

        const limited = Math.max(-CALENDAR_DRAG_LIMIT, Math.min(CALENDAR_DRAG_LIMIT, delta));
        moveEvent.preventDefault();
        updateCalendarDragX(limited);
      };

      const handlePointerUp = async (upEvent) => {
        if (!state.active || upEvent.pointerId !== state.pointerId) {
          return;
        }

        calendarSwipeCleanupRef.current?.();
        calendarSwipeCleanupRef.current = null;
        state.active = false;

        const totalDelta = upEvent.clientX - state.startX;
        const elapsed = performance.now() - state.startTime;
        const velocity = elapsed > 0 ? (totalDelta / elapsed) * 1000 : 0;
        const movedEnoughNext = totalDelta <= -CALENDAR_SWIPE_OFFSET || velocity <= -CALENDAR_SWIPE_VELOCITY;
        const movedEnoughPrev = totalDelta >= CALENDAR_SWIPE_OFFSET || velocity >= CALENDAR_SWIPE_VELOCITY;
        const wasDragging = state.dragging;
        state.dragging = false;
        setIsCalendarDragging(false);

        if (calendarAnimationRef.current) {
          await animateDragTo(0, { duration: CALENDAR_SNAP_DURATION });
          return;
        }

        if (wasDragging && movedEnoughNext) {
          await animateCalendarMonthChange('next');
          return;
        }

        if (wasDragging && movedEnoughPrev) {
          await animateCalendarMonthChange('prev');
          return;
        }

        await animateDragTo(0, { duration: CALENDAR_SNAP_DURATION });
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove, { capture: true });
        window.removeEventListener('pointerup', handlePointerUp, { capture: true });
        window.removeEventListener('pointercancel', handlePointerUp, { capture: true });
      };

      calendarSwipeCleanupRef.current?.();
      calendarSwipeCleanupRef.current = cleanup;

      window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
      window.addEventListener('pointerup', handlePointerUp, { capture: true });
      window.addEventListener('pointercancel', handlePointerUp, { capture: true });
    },
    [animateCalendarMonthChange, animateDragTo, isCalendarOpen, updateCalendarDragX]
  );

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
      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(
            cycle.id,
            draftStartDate,
            includeEndDate ? draftEndDate || undefined : undefined
          )
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        const resolvedEndDate = includeEndDate ? draftEndDate || undefined : undefined;
        setPendingEndDate(resolvedEndDate ?? null);
        setPendingIncludeEndDate(!!includeEndDate);
        setOverlapCycle(overlap);
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
      toast({
        title: 'Fechas actualizadas',
        description: 'El ciclo se ha ajustado a las nuevas fechas.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error updating start date from records page:', error);
      setStartDateError('No se pudieron actualizar las fechas');
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar las fechas.',
        variant: 'destructive',
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
      const startMovesEarlier =
        hasStartChange &&
        pendingStartDate &&
        currentStartDate &&
        isBefore(parseISO(pendingStartDate), parseISO(currentStartDate));

      const resolvedPendingEnd = pendingIncludeEndDate
        ? pendingEndDate ?? undefined
        : undefined;
      const hasEndChange =
        pendingIncludeEndDate &&
        pendingEndDate !== null &&
        resolvedPendingEnd !== currentEndDate;

      if (startMovesEarlier) {
        await forceUpdateCycleStart(cycle.id, pendingStartDate);
      }
      
      if (hasEndChange && resolvedPendingEnd && forceShiftNextCycleStart) {
        const effectiveStartDate = hasStartChange ? pendingStartDate : currentStartDate;
        await forceShiftNextCycleStart(cycle.id, resolvedPendingEnd, effectiveStartDate);
      }

      await updateCycleDates(
        cycle.id,
        hasStartChange ? pendingStartDate : undefined,
        resolvedPendingEnd
      );
      await refreshData({ silent: true });
      toast({
        title: 'Fechas actualizadas',
        description: 'El ciclo se ha ajustado a las nuevas fechas.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error adjusting cycle dates from records page:', error);
      setStartDateError('No se pudieron actualizar las fechas');
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar las fechas.',
        variant: 'destructive',
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
    forceUpdateCycleStart,
    forceShiftNextCycleStart,
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
  }, []);

  const openRecordForm = useCallback(
    (record, fieldName = null, sectionKey = null) => {
      if (!record) return;

      setEditingRecord(record);
      setDefaultFormIsoDate(record.isoDate ?? null);
      setFocusedField(fieldName);
      setInitialSectionKey(sectionKey ?? null);

      if (record.isoDate) {
        setSelectedDate(record.isoDate);
      }

      setShowForm(true);
    },
    []
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

    setEditingRecord(null);
    setDefaultFormIsoDate(targetIso);
    setFocusedField(null);
    setInitialSectionKey(null);

    if (targetIso) {
      setSelectedDate(targetIso);
    }

    setShowForm(true);
  }, [cycleDays, cycle?.startDate, selectedDate]);

  const buildRecordPayloadForDate = useCallback(
    (isoDate, overrides = {}) => {
      const existingRecord = cycle?.data?.find((record) => record.isoDate === isoDate) || null;
      const baseTime = existingRecord?.timestamp && isValid(parseISO(existingRecord.timestamp))
        ? format(parseISO(existingRecord.timestamp), 'HH:mm')
        : format(new Date(), 'HH:mm');

      const measurements = existingRecord?.measurements?.length
        ? existingRecord.measurements.map((measurement, idx) => {
            const measurementTime =
              measurement?.time ||
              (measurement?.timestamp && isValid(parseISO(measurement.timestamp))
                ? format(parseISO(measurement.timestamp), 'HH:mm')
                : baseTime);

            return {
              temperature: measurement?.temperature ?? measurement?.temperature_raw ?? '',
              temperature_corrected: measurement?.temperature_corrected ?? '',
              time: measurementTime,
              time_corrected: measurement?.time_corrected || measurementTime,
              use_corrected: Boolean(measurement?.use_corrected),
              selected: Boolean(measurement?.selected ?? idx === 0),
            };
          })
        : [
            {
              temperature: '',
              temperature_corrected: '',
              time: baseTime,
              time_corrected: baseTime,
              use_corrected: false,
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
  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setDefaultFormIsoDate(null);
        setFocusedField(null);
        setInitialSectionKey(null);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el registro', variant: 'destructive' });
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
      } catch (error) {
        toast({ title: 'Error', description: 'No se pudo actualizar RS', variant: 'destructive' });
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
    openDateEditor: openStartDateEditor,
    openAddRecord: handleOpenAddRecord,
    isProcessing,
    isUpdatingDates: isUpdatingStartDate,
    cycle,
  };

  const resolvedHeaderActions =
    typeof headerActions === 'function'
      ? headerActions(headerActionProps)
      : (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={openStartDateEditor}
              className="border-fertiliapp-suave rounded-full text-titulo hover:brightness-95"
              disabled={isProcessing || isUpdatingStartDate}
              aria-label={includeEndDate ? 'Editar fechas del ciclo' : 'Editar fecha de inicio'}
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only">{includeEndDate ? 'Editar fechas del ciclo' : 'Editar fecha de inicio'}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={handleOpenAddRecord}
              className="rounded-full bg-secundario hover:brightness-95 text-white shadow-md"
              disabled={isProcessing}
              style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
              aria-label="Añadir registro"
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Añadir registro</span>
            </Button>
          </>
        );

  const resolvedTopAccessory =
    typeof topAccessory === 'function'
      ? topAccessory({
          ...headerActionProps,
        })
      : topAccessory ?? null;

  if (isLoading && !cycle?.id) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-[#fff7fb]">
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `
          radial-gradient(120% 120% at 0% 0%, rgba(251,113,133,0.18) 0, transparent 55%),
          radial-gradient(110% 110% at 100% 0%, rgba(244,114,182,0.16) 0, transparent 55%),
          radial-gradient(130% 130% at 0% 100%, rgba(251,113,133,0.08) 0, transparent 60%),
          radial-gradient(140% 140% at 100% 100%, rgba(255,255,255,0.9) 0, rgba(255,247,250,0.3) 40%, transparent 70%)
        `,
        backgroundColor: '#fff7fb'
      }}
    />
        <p className="text-center text-titulo text-lg">Cargando...</p>
      </div>
    );
  }

  if (!cycle?.id) {
    return (
      <div className="relative min-h-screen overflow-hidden app-background">
        <div className="pointer-events-none absolute inset-0">
          <div className="wave wave--top" />
          <div className="wave wave--right" />
          <div className="wave wave--bottom" />
        </div>
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-4 relative z-10">
          <div className="bg-white/80 border border-rose-100/70 rounded-3xl shadow-sm w-full p-4 text-center space-y-4">
            <p className="text-[15px] font-semibold text-slate-800">No hay ciclo activo.</p>
            <button
              onClick={() => setShowNewCycleDialog(true)}
              className="h-11 w-full rounded-full bg-rose-400 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
            >
              Iniciar ciclo
            </button>
          </div>
        </div>
        <NewCycleDialog
          isOpen={showNewCycleDialog}
          onClose={() => setShowNewCycleDialog(false)}
          onConfirm={async (selectedStartDate) => {
            await startNewCycle(selectedStartDate);
            setShowNewCycleDialog(false);
            setInitialSectionKey(null);
            setShowForm(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#fff7fb]">
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `
          radial-gradient(120% 120% at 0% 0%, rgba(251,113,133,0.18) 0, transparent 55%),
          radial-gradient(110% 110% at 100% 0%, rgba(244,114,182,0.16) 0, transparent 55%),
          radial-gradient(130% 130% at 0% 100%, rgba(251,113,133,0.08) 0, transparent 60%),
          radial-gradient(140% 140% at 100% 100%, rgba(255,255,255,0.9) 0, rgba(255,247,250,0.3) 40%, transparent 70%)
        `,
        backgroundColor: '#fff7fb'
      }}
    />
      
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 relative z-10">
        <div
          ref={calendarContainerRef}
          className="sticky top-1 z-50 w-full max-w-lg mx-auto"
        >
          <div className="relative overflow-hidden rounded-2xl">
            <div className="space-y-1.5 p-2 sm:p-2.5 relative z-10">
              {/* Header */}
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex flex-wrap items-center gap-1 justify-between sm:justify-start">
                  <div className="flex items-center gap-2">
                    <HeaderIcon className="h-7 w-7 text-subtitulo" />
                    <span className="text-2xl sm:text-2xl font-bold text-subtitulo">{resolvedHeaderTitle}</span>
                  </div>
                  <div className="flex items-center gap-1">{resolvedHeaderActions}</div>
                </div>
              </motion.div>
            
            {showStartDateEditor && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <CycleDatesEditor
                  cycle={cycle}
                  startDate={draftStartDate}
                  endDate={includeEndDate ? draftEndDate : cycle?.endDate}
                  onStartDateChange={(value) => setDraftStartDate(value)}
                  onEndDateChange={includeEndDate ? (value) => setDraftEndDate(value) : undefined}
                  onSave={handleSaveStartDate}
                  onCancel={closeStartDateEditor}
                  isProcessing={isUpdatingStartDate}
                  dateError={startDateError}
                  includeEndDate={includeEndDate}
                  showOverlapDialog={showOverlapDialog}
                  overlapCycle={overlapCycle}
                  onConfirmOverlap={handleConfirmOverlapStart}
                  onCancelOverlap={handleCancelOverlapStart}
                  onClearError={() => setStartDateError('')}
                  saveLabel={includeEndDate ? 'Guardar fechas' : 'Guardar cambios'}
                  title={includeEndDate ? 'Editar fechas del ciclo' : 'Editar fecha de inicio'}
                  description={
                    includeEndDate
                      ? 'Actualiza las fechas del ciclo. Los registros se reorganizarán automáticamente.'
                      : 'Actualiza la fecha de inicio del ciclo actual. Los registros se reorganizarán automáticamente.'
                  }
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
                  <div
                    ref={calendarSwipeContainerRef}
                    onPointerDown={handleCalendarPointerDown}
                    data-calendar-dragging={isCalendarDragging ? 'true' : 'false'}
                    className={cn(
                      'w-full max-w-sm rounded-3xl bg-white/40 mx-auto backdrop-blur-sm overflow-hidden [&_.records-calendar-day-grid]:will-change-transform [&_.records-calendar-day-grid]:transition-transform [&_.records-calendar-day-grid]:duration-200 [&_.records-calendar-day-grid]:ease-out [&_.records-calendar-day-grid]:[transform:translateX(var(--calendar-drag-x,0px))] data-[calendar-dragging=true]:[&_.records-calendar-day-grid]:duration-0 data-[calendar-dragging=true]:[&_.records-calendar-day-grid]:ease-linear',
                      isCalendarDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                    )}
                    style={{ touchAction: 'pan-y', '--calendar-drag-x': `${calendarDragX}px` }}
                  >
                    <Calendar
                      mode="single"
                      locale={es}
                      month={currentCalendarMonth ?? undefined}
                      onMonthChange={setCurrentCalendarMonth}
                      selected={selectedDate && isValid(parseISO(selectedDate)) ? parseISO(selectedDate) : undefined}
                      onSelect={handleCalendarSelect}
                      onDayClick={handleCalendarSelect}
                      modifiers={calendarModifiers}
                      labels={calendarLabels}
                      components={{ DayContent: renderCalendarDay }}
                      className="w-full !p-2.5 [&_button]:text-slate-900 [&_button:hover]:bg-rose-200 [&_button[aria-selected=true]]:bg-rose-200 [&_button[aria-selected=true]]:rounded-2xl"

                      classNames={calendarClassNames}
                      modifiersClassNames={{
                        hasRecord: 'font-semibold text-slate-900',
                        outsideCycle: 'text-slate-300 opacity-50 hover:text-slate-300 hover:bg-transparent',
                        insideCycleNoRecord:
                          'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            
          </div>
        </div>


        {/* Records List */}
        <div
          ref={recordsScrollRef}
          className="sticky overflow-y-auto overscroll-contain w-full max-w-4xl mx-auto"
          style={{
            top: boundaryPx,
            maxHeight: `calc(100dvh - ${boundaryPx}px - var(--bottom-nav-safe, 0px))`,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative space-y-2 px-1.5 pt-2 pb-[calc(var(--bottom-nav-safe,0px))] sm:px-2 lg:px-4"
          >
         
          {cycleDays.length === 0 ? (
            <motion.div
              className="py-12 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="mx-auto max-w-md rounded-3xl border border-rose-100 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-500 shadow-inner">
                  <FileText className="h-8 w-8" />
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
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
              onAdd={handleAddRecordForDay}
              onToggleRelations={handleToggleRelations}
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
        <DialogContent hideClose className="bg-white border-pink-100 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DataEntryForm
            onSubmit={handleSave}
            onCancel={handleCloseForm}
            initialData={editingRecord}
            cycleStartDate={cycle?.startDate}
            cycleEndDate={cycle?.endDate}
            isProcessing={isProcessing}
            isEditing={!!editingRecord}
            cycleData={cycle?.data}
            onDateSelect={handleDateSelect}
            defaultIsoDate={defaultFormIsoDate}
            focusedField={focusedField}
            initialSectionKey={initialSectionKey}
          />
        </DialogContent>
      </Dialog>

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