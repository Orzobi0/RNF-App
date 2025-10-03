import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Edit,
  Plus,
  FileText,
  Edit2,
  Trash2,
  Thermometer,
  Droplets,
  Edit3,
  Clock,
  CalendarDays,
  ChevronDown,
  Circle,
} from 'lucide-react';
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
} from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar } from '@/components/ui/calendar';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import computePeakStatuses from '@/lib/computePeakStatuses';

const PEAK_LABEL_MAP = {
  P: 'Día pico',
  1: 'Post pico 1',
  2: 'Post pico 2',
  3: 'Post pico 3',
};

const getSymbolInfo = (symbolValue) =>
  FERTILITY_SYMBOL_OPTIONS.find((symbol) => symbol.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0];

const formatTemperatureDisplay = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(String(value).replace(',', '.'));
  if (Number.isNaN(numeric)) {
    return null;
  }

  return numeric.toFixed(2);
};

const FieldBadges = ({ hasTemperature, hasMucus, hasObservations, isPeakDay }) => {
  const badgeBase =
    'flex items-center justify-center w-7 h-7 rounded-full text-white shadow-sm shadow-rose-200/50 transition-transform duration-200';

  return (
    <div className="flex items-center gap-1.5">
      {hasTemperature && (
        <span className={`${badgeBase} bg-orange-400/90`}> 
          <Thermometer className="h-3.5 w-3.5" />
        </span>
      )}
      {hasMucus && (
        <span className={`${badgeBase} bg-sky-500/90`}>
          <Droplets className="h-3.5 w-3.5" />
        </span>
      )}
      {hasObservations && (
        <span className={`${badgeBase} bg-violet-500/90`}>
          <Edit3 className="h-3.5 w-3.5" />
        </span>
      )}
      {isPeakDay && (
        <span className={`${badgeBase} bg-rose-500/90 text-xs font-semibold`}>✖</span>
      )}
    </div>
  );
};

const RecordsPage = () => {
  const {
    currentCycle,
    addOrUpdateDataPoint,
    deleteRecord,
    isLoading,
    updateCycleDates,
    checkCycleOverlap,
    forceUpdateCycleStart,
    refreshData,
  } = useCycleData();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => currentCycle?.startDate || '');
  const [startDateError, setStartDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [expandedIsoDate, setExpandedIsoDate] = useState(null);
  const [defaultFormIsoDate, setDefaultFormIsoDate] = useState(null);
  const dayRefs = useRef({});
  const hasUserSelectedDateRef = useRef(false);

  const registerDayRef = useCallback(
    (isoDate) => (node) => {
      if (!isoDate) return;
      if (node) {
        dayRefs.current[isoDate] = node;
      } else {
        delete dayRefs.current[isoDate];
      }
    },
    []
  );

  useEffect(() => {
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate]);

  const sortedRecordDates = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return [...currentCycle.data]
      .filter((record) => record?.isoDate)
      .sort((a, b) => {
        const dateA = parseISO(a.isoDate);
        const dateB = parseISO(b.isoDate);
        return dateB - dateA;
      })
      .map((record) => record.isoDate);
  }, [currentCycle?.data]);

  useEffect(() => {
    if (!sortedRecordDates.length) {
      setSelectedDate(null);
      setExpandedIsoDate(null);
      return;
    }

    if (!selectedDate || !sortedRecordDates.includes(selectedDate)) {
      hasUserSelectedDateRef.current = false;
      setSelectedDate(sortedRecordDates[0]);
    }
  }, [sortedRecordDates, selectedDate]);

  useEffect(() => {
    if (!selectedDate || !hasUserSelectedDateRef.current) {
      return;
    }

    const targetNode = dayRefs.current[selectedDate];
    if (targetNode && 'scrollIntoView' in targetNode) {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    hasUserSelectedDateRef.current = false;
  }, [selectedDate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);


  const recordDateObjects = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return currentCycle.data
      .map((record) => {
        if (!record?.isoDate) return null;
        const parsed = parseISO(record.isoDate);
        return isValid(parsed) ? parsed : null;
      })
      .filter(Boolean);
  }, [currentCycle?.data]);

  const recordDateSet = useMemo(() => new Set(sortedRecordDates), [sortedRecordDates]);

  const peakStatuses = useMemo(() => computePeakStatuses(currentCycle?.data ?? []), [currentCycle?.data]);

  const recordDetailsByIso = useMemo(() => {
    const details = new Map();
    if (!currentCycle?.data?.length) {
      return details;
    }

    currentCycle.data.forEach((record) => {
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
      const hasMucus = Boolean(mucusSensation || mucusAppearance);
      const observationsText = record.observations || '';
      const hasObservations = Boolean(observationsText);

      const peakStatus = peakStatuses[record.isoDate];
      const peakLabel = peakStatus ? PEAK_LABEL_MAP[peakStatus] || null : null;
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
        mucusSensation,
        mucusAppearance,
        hasObservations,
        observationsText,
        peakStatus,
        peakLabel,
        isPeakDay,
      });
    });

    return details;
  }, [currentCycle?.data, peakStatuses]);


  const cycleRange = useMemo(() => {
    if (!currentCycle?.startDate) return null;
    const start = parseISO(currentCycle.startDate);
    if (!isValid(start)) return null;

    let end;

    if (currentCycle?.endDate) {
      end = parseISO(currentCycle.endDate);
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
  }, [currentCycle?.startDate, currentCycle?.endDate, recordDateObjects]);

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

  const cycleDays = useMemo(() => {
    if (!currentCycle?.startDate) return [];

    const startDate = parseISO(currentCycle.startDate);
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
  }, [currentCycle?.startDate, cycleRange, recordDetailsByIso]);

  const handleCalendarSelect = useCallback(
    (day) => {
      if (!day) return;
      const iso = format(day, 'yyyy-MM-dd');

      if (cycleRange) {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return;
        }
      }

      hasUserSelectedDateRef.current = true;
      setSelectedDate(iso);

      if (!recordDetailsByIso.has(iso)) {
        setExpandedIsoDate(null);
      }
    },
    [cycleRange, recordDetailsByIso]
  );

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
  }, []);

  const openStartDateEditor = useCallback(() => {
    setDraftStartDate(currentCycle?.startDate || '');
    setStartDateError('');
    resetStartDateFlow();
    setShowStartDateEditor(true);
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const closeStartDateEditor = useCallback(() => {
    setShowStartDateEditor(false);
    setStartDateError('');
    resetStartDateFlow();
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const handleCancelOverlapStart = useCallback(() => {
    resetStartDateFlow();
  }, [resetStartDateFlow]);

  const handleSaveStartDate = useCallback(async () => {
    if (!draftStartDate) {
      setStartDateError('La fecha de inicio es obligatoria');
      return;
    }

    if (!currentCycle?.id) {
      return;
    }

    setStartDateError('');
    setIsUpdatingStartDate(true);

    try {
      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(currentCycle.id, draftStartDate)
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        setOverlapCycle(overlap);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(currentCycle.id, draftStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error updating start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
    }
  }, [
    draftStartDate,
    currentCycle?.id,
    checkCycleOverlap,
    updateCycleDates,
    refreshData,
    toast,
    closeStartDateEditor,
  ]);

  const handleConfirmOverlapStart = useCallback(async () => {
    if (!currentCycle?.id || !pendingStartDate) {
      resetStartDateFlow();
      return;
    }

    setIsUpdatingStartDate(true);
    setShowOverlapDialog(false);

    try {
      await forceUpdateCycleStart(currentCycle.id, pendingStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error forcing start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
      resetStartDateFlow();
    }
  }, [
    currentCycle?.id,
    pendingStartDate,
    forceUpdateCycleStart,
    refreshData,
    toast,
    closeStartDateEditor,
    resetStartDateFlow,
  ]);



  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
    setDefaultFormIsoDate(null);
  }, []);

  const handleEdit = (record) => {
    if (!record) return;
    setEditingRecord(record);
    setDefaultFormIsoDate(record.isoDate ?? null);
    if (record.isoDate) {
      hasUserSelectedDateRef.current = false;
      setSelectedDate(record.isoDate);
      setExpandedIsoDate(record.isoDate);
    }
    setShowForm(true);
  };

  const handleDeleteRequest = (recordId) => {
    const record = currentCycle.data.find(r => r.id === recordId);
    setRecordToDelete(record);
  };

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleToggleRecord = useCallback((isoDate, hasRecord) => {
    if (!isoDate) {
      return;
    }

    hasUserSelectedDateRef.current = false;
    setSelectedDate(isoDate);

    if (!hasRecord) {
      return;
    }

    setExpandedIsoDate((prev) => (prev === isoDate ? null : isoDate));
  }, []);

  const handleAddRecordForDay = useCallback((isoDate) => {
    if (!isoDate) {
      return;
    }

    hasUserSelectedDateRef.current = false;
    setSelectedDate(isoDate);
    setExpandedIsoDate(null);
    setEditingRecord(null);
    setDefaultFormIsoDate(isoDate);
    setShowForm(true);
  }, []);

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setDefaultFormIsoDate(null);
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

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsProcessing(true);
    try {
      const deletedIso = recordToDelete.isoDate;
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
      setDefaultFormIsoDate(null);
      if (deletedIso) {
        setExpandedIsoDate((prev) => (prev === deletedIso ? null : prev));
        if (selectedDate === deletedIso) {
          setSelectedDate(deletedIso);
        }
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading && !currentCycle?.id) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">No hay ciclo activo.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      
      <div className="max-w-4xl mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <motion.div
          className="flex flex-col gap-4 mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-start">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-pink-500" />
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-700">Mis Registros</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={openStartDateEditor}
                className="border-pink-200 rounded-full text-pink-600 hover:bg-pink-50"
                disabled={isProcessing || isUpdatingStartDate}
                aria-label="Editar fecha de inicio"
              >
                <Edit className="h-4 w-4" />
                <span className="sr-only">Editar fecha de inicio</span>
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => {
                  const fallbackIso = cycleDays.length ? cycleDays[0].isoDate : currentCycle.startDate;
                  const targetIso = selectedDate || fallbackIso || null;
                  setEditingRecord(null);
                  setDefaultFormIsoDate(targetIso);
                  hasUserSelectedDateRef.current = false;
                  if (targetIso) {
                    setSelectedDate(targetIso);
                    setExpandedIsoDate(null);
                  }
                  setShowForm(true);
                }}
                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
                disabled={isProcessing}
                style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
                aria-label="Añadir registro"
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Añadir registro</span>
              </Button>
            </div>
          </div>
        </motion.div>
        {showStartDateEditor && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <CycleDatesEditor
              cycle={currentCycle}
              startDate={draftStartDate}
              endDate={currentCycle.endDate}
              onStartDateChange={(value) => setDraftStartDate(value)}
              onSave={handleSaveStartDate}
              onCancel={closeStartDateEditor}
              isProcessing={isUpdatingStartDate}
              dateError={startDateError}
              includeEndDate={false}
              showOverlapDialog={showOverlapDialog}
              overlapCycle={overlapCycle}
              onConfirmOverlap={handleConfirmOverlapStart}
              onCancelOverlap={handleCancelOverlapStart}
              onClearError={() => setStartDateError('')}
              saveLabel="Guardar cambios"
              title="Editar fecha de inicio"
              description="Actualiza la fecha de inicio del ciclo actual. Los registros se reorganizarán automáticamente."
            />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-5 flex justify-center"
        >
          <Calendar
            mode="single"
            locale={es}
            defaultMonth={
              selectedDate && isValid(parseISO(selectedDate))
                ? parseISO(selectedDate)
                : cycleRange?.to
            }
            selected={selectedDate && isValid(parseISO(selectedDate)) ? parseISO(selectedDate) : undefined}
            onDayClick={handleCalendarSelect}
            modifiers={calendarModifiers}
            className="w-full max-w-md sm:max-w-lg rounded-2xl border border-pink-100 shadow-sm bg-white/60 backdrop-blur-sm p-3 mx-auto [&_button]:text-slate-900 [&_button:hover]:bg-rose-100 [&_button[aria-selected=true]]:bg-rose-500"
            classNames={{
              day_selected:
                'border border-rose-500 text-white hover:bg-rose-500 hover:text-white focus:bg-rose-500 focus:text-white',
              day_today: 'bg-rose-200 text-rose-700 font-semibold',
            }}
            modifiersClassNames={{
              hasRecord:
                "relative font-semibold after:absolute after:bottom-1.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-rose-500 after:content-['']",
              outsideCycle: 'text-slate-300 opacity-50 hover:text-slate-300 hover:bg-transparent',
              insideCycleNoRecord:
                'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
            }}
          />
        </motion.div>


        {/* Records List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-2"
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
            cycleDays.map(({ isoDate, date, cycleDay, details }) => {
              const hasRecord = Boolean(details);
              const isSelected = selectedDate === isoDate;
              const isExpanded = hasRecord && expandedIsoDate === isoDate;
              const displayDate = format(date, 'dd/MM/yyyy', { locale: es });
              const symbolLabel = details?.symbolInfo?.label || '';
              const symbolInitial = symbolLabel ? symbolLabel.charAt(0) : '—';

              if (!hasRecord) {
                return (
                  <motion.button
                    key={isoDate}
                    type="button"
                    ref={registerDayRef(isoDate)}
                    onClick={() => handleAddRecordForDay(isoDate)}
                    className={`flex w-full items-center justify-between rounded-full border border-dashed border-rose-200/70 bg-white/40 px-4 py-3 text-sm font-medium text-slate-500 backdrop-blur-sm transition-all duration-200 hover:border-rose-300 hover:bg-white/70 ${isSelected ? 'ring-2 ring-rose-300 text-rose-500 shadow-rose-200/70' : ''}`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-rose-300" />
                      <span>{`Día ${cycleDay} - Sin registro`}</span>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-rose-400">Añadir</span>
                  </motion.button>
                );
              }

              return (
                <motion.div
                  key={isoDate}
                  layout
                  ref={registerDayRef(isoDate)}
                  onClick={() => handleToggleRecord(isoDate, true)}
                  className={`group relative flex w-full cursor-pointer flex-col rounded-3xl border border-rose-100 bg-white/75 px-4 py-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-lg sm:px-6 ${isSelected ? 'bg-white/90 ring-2 ring-rose-400 shadow-rose-200/70' : ''}`}
                  whileHover={{ translateY: -2 }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <CalendarDays className="h-4 w-4 text-rose-400" />
                      {displayDate}
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm">
                      Día {cycleDay}
                    </span>
                    <FieldBadges
                      hasTemperature={details.hasTemperature}
                      hasMucus={details.hasMucus}
                      hasObservations={details.hasObservations}
                      isPeakDay={details.isPeakDay}
                    />
                    {details.peakLabel && (
                      <Badge className="rounded-full border border-rose-200 bg-rose-100 text-rose-600">
                        {details.peakLabel}
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border border-rose-100 shadow-inner ${details.symbolInfo.color} ${details.symbolInfo.pattern ? 'pattern-bg' : ''}`}
                        title={symbolLabel}
                      >
                        <span
                          className="text-xs font-semibold uppercase"
                          style={{ color: details.symbolInfo.textColor || '#1f2937' }}
                        >
                          {symbolInitial}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                          disabled={isProcessing}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(details.record);
                          }}
                          aria-label="Editar registro"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                          disabled={isProcessing}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteRequest(details.record.id);
                          }}
                          aria-label="Eliminar registro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <motion.span
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="rounded-full bg-rose-50 p-1 text-rose-400 shadow-inner"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="mt-3 overflow-hidden"
                      >
                        <div className="flex flex-col gap-3 rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-inner sm:p-5">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-500">
                            <span className="rounded-full bg-rose-50 px-3 py-1 text-[0.65rem]">
                              Símbolo: {symbolLabel || 'Sin símbolo'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <div className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-orange-600">
                              <Thermometer className="h-4 w-4" />
                              <span className="font-semibold">
                                {details.hasTemperature ? `${details.displayTemp}°C` : 'Sin temperatura'}
                              </span>
                              {details.showCorrectedIndicator && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide">
                                  Corregida
                                </span>
                              )}
                            </div>
                            {details.timeValue && (
                              <div className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-600">
                                <Clock className="h-4 w-4" />
                                <span>{details.timeValue}</span>
                              </div>
                            )}
                            {details.record.ignored && (
                              <Badge className="rounded-full border border-orange-200 bg-orange-100 text-orange-600">
                                Ignorada
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <div className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-600">
                              <Droplets className="h-4 w-4" />
                              <span className="font-medium">
                                {details.mucusSensation || 'Sin sensación'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-600">
                              <Circle className="h-4 w-4" />
                              <span className="font-medium">
                                {details.mucusAppearance || 'Sin apariencia'}
                              </span>
                            </div>
                            {details.peakLabel && (
                              <Badge className="rounded-full border border-rose-200 bg-rose-50 text-rose-500">
                                {details.peakLabel}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 rounded-3xl border border-violet-200 bg-violet-50/80 p-4 text-sm text-violet-700">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-400 text-white shadow-md">
                                <Edit3 className="h-4 w-4" />
                              </div>
                              <span className="font-semibold">Observaciones</span>
                            </div>
                            <p className="whitespace-pre-line text-violet-600">
                              {details.observationsText || 'Sin observaciones registradas.'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </motion.div>
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
            cycleStartDate={currentCycle.startDate}
            cycleEndDate={currentCycle.endDate}
            isProcessing={isProcessing}
            isEditing={!!editingRecord}
            cycleData={currentCycle.data}
            onDateSelect={handleDateSelect}
            defaultIsoDate={defaultFormIsoDate}
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

export default RecordsPage;