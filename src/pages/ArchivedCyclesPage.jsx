import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DeletionDialog from '@/components/DeletionDialog';
import { differenceInCalendarDays, format, parseISO, addDays, isValid, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, Baby, CalendarDays, EllipsisVertical, Plus } from 'lucide-react';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';
import ArchivedCycleDeleteDialog from '@/components/ArchivedCycleDeleteDialog';
import CycleOptionsSheet from '@/components/CycleOptionsSheet';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const CYCLE_OPTIONS_SHEET_EXIT_DELAY_MS = 220;

const formatArchivedDate = (date) => format(date, 'dd MMM yy', { locale: es });

const getCycleGroupingDate = (cycle) => {
  const dateValue = cycle?.endDate || cycle?.startDate;
  if (!dateValue) return null;

  try {
    return parseISO(dateValue);
  } catch {
    return null;
  }
};

const normalizeCycleRowData = (cycle) => {
  const start = cycle?.startDate ? parseISO(cycle.startDate) : null;
  const end = cycle?.endDate ? parseISO(cycle.endDate) : null;
  const hasEndDate = Boolean(end);
  const startToShow = start && end && end < start ? end : start;
  const endToShow = start && end && end < start ? start : end;
  const rangeLabel = `${startToShow ? formatArchivedDate(startToShow) : 'Sin fecha'} - ${
    hasEndDate && endToShow ? formatArchivedDate(endToShow) : 'En curso'
  }`;
  const recordCount = cycle?.data?.length ?? 0;
  const durationDays =
    startToShow && endToShow
      ? Math.max(1, differenceInCalendarDays(endToShow, startToShow) + 1)
      : null;

  return {
    rangeLabel,
    recordCount,
    durationDays,
  };
};

const formatCycleOptionsMeta = ({ durationDays, recordCount }) => {
  const recordText = `${recordCount} registro${recordCount !== 1 ? 's' : ''}`;

  if (!durationDays) {
    return recordText;
  }

  return `${durationDays} día${durationDays !== 1 ? 's' : ''} · ${recordText}`;
};

const getGapDaysBetweenCycles = (newerCycle, olderCycle) => {
  if (!newerCycle?.startDate || !olderCycle?.endDate) return 0;

  try {
    const newerStart = startOfDay(parseISO(newerCycle.startDate));
    const olderEnd = startOfDay(parseISO(olderCycle.endDate));

    if (!isValid(newerStart) || !isValid(olderEnd)) return 0;

    const gapDays = differenceInCalendarDays(newerStart, olderEnd) - 1;
    return gapDays > 0 ? gapDays : 0;
  } catch {
    return 0;
  }
};

const GapRow = ({ days }) => (
  <div className="px-4 py-1.5">
    <div className="flex items-center gap-2.5">
      <div className="h-px flex-1 bg-rose-100/70" />
<span className="text-[10px] font-medium text-rose-400">
        Hueco de {days} día{days !== 1 ? 's' : ''}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  </div>
);
const ArchivedCyclesPage = () => {
    const {
    currentCycle,
    archivedCycles,
    isLoading,
    addArchivedCycle,
    updateCycleDates,
    deleteCycle,
    deleteArchivedCycleWithStrategy,
    previewDeleteCycle,
    getPublicError,
    checkCycleOverlap,
    previewUpdateCycleDates,
    previewInsertCycleRange,
    insertCycleRange,
    undoCurrentCycle,
    updateCyclePostpartumMode,
  } = useCycleData();

  const { toast } = useToast();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);
  const [cycleForActions, setCycleForActions] = useState(null);
  const [cycleToDelete, setCycleToDelete] = useState(null);
  const [showUndoCycleDialog, setShowUndoCycleDialog] = useState(false);
  const [isUndoingCycle, setIsUndoingCycle] = useState(false);
  const [isUpdatingPostpartum, setIsUpdatingPostpartum] = useState(false);
  const [addCycleError, setAddCycleError] = useState(null);
  const [editCycleError, setEditCycleError] = useState(null);
  const actionSheetTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (actionSheetTimeoutRef.current) {
        window.clearTimeout(actionSheetTimeoutRef.current);
        actionSheetTimeoutRef.current = null;
      }
    };
  }, []);
  
  const allCycles = currentCycle?.id
  ? [{ ...currentCycle, isCurrent: true, needsCompletion: !currentCycle.endDate }, ...(archivedCycles || [])]
  : (archivedCycles || []);

  const hasCachedCycles = allCycles?.length > 0;
    const currentCycleWithFlag = currentCycle?.id
    ? { ...currentCycle, isCurrent: true, needsCompletion: !currentCycle.endDate }
    : null;

  const undoCandidate = useMemo(() => {
    if (!currentCycleWithFlag?.id || currentCycleWithFlag?.endDate) return null;
    if (!currentCycleWithFlag?.startDate) return null;

    const parsedStart = parseISO(currentCycleWithFlag.startDate);
    if (!isValid(parsedStart)) return null;

    const dayBefore = format(addDays(parsedStart, -1), 'yyyy-MM-dd');

    const candidates = (archivedCycles || []).filter(
      (archived) => archived?.endDate === dayBefore
    );

    if (!candidates.length) return null;

    return candidates.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0];
  }, [archivedCycles, currentCycleWithFlag]);

  const undoRangeText = useMemo(() => {
    if (!undoCandidate?.startDate || !undoCandidate?.endDate) return '';

    const start = parseISO(undoCandidate.startDate);
    const end = parseISO(undoCandidate.endDate);

    if (!isValid(start) || !isValid(end)) return '';

    const formatRangeDate = (date) =>
      format(date, 'dd MMM yy', { locale: es }).replace('.', '');

    return `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
  }, [undoCandidate]);

  const undoCycleDescription = useMemo(() => {
    const rangeSuffix = undoRangeText ? ` (${undoRangeText})` : '';
    return `¿Quieres unir el ciclo actual al ciclo anterior${rangeSuffix}? Esta acción no se puede deshacer.`;
  }, [undoRangeText]);

  const archivedByYear = useMemo(() => {
    const sorted = [...(archivedCycles || [])].sort((a, b) => {
      const dateA = getCycleGroupingDate(a);
      const dateB = getCycleGroupingDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB - dateA;
    });

    return sorted.reduce((acc, cycle) => {
      const groupingDate = getCycleGroupingDate(cycle);
      const yearKey = groupingDate ? String(groupingDate.getFullYear()) : 'Sin año';
      if (!acc[yearKey]) {
        acc[yearKey] = [];
      }
      acc[yearKey].push(cycle);
      return acc;
    }, {});
  }, [archivedCycles]);

  const archivedYears = useMemo(() => {
    return Object.keys(archivedByYear).sort((a, b) => {
      if (a === 'Sin año') return 1;
      if (b === 'Sin año') return -1;
      return Number(b) - Number(a);
    });
  }, [archivedByYear]);
  const currentYearLabel = String(new Date().getFullYear());
  const firstArchivedCycle = useMemo(() => {
  if (!archivedYears.length) return null;
  const firstYear = archivedYears[0];
  return archivedByYear[firstYear]?.[0] || null;
}, [archivedByYear, archivedYears]);

const gapAfterCurrentCycle = useMemo(() => {
  if (!currentCycleWithFlag || !firstArchivedCycle) return 0;
  return getGapDaysBetweenCycles(currentCycleWithFlag, firstArchivedCycle);
}, [currentCycleWithFlag, firstArchivedCycle]);

  const formatConflictMessage = (conflictCycle) => {
    if (!conflictCycle) {
      return 'Las fechas ingresadas se superponen con otro ciclo.';
    }

    const formatDate = (date) => {
      if (!date) return null;
      try {
        return format(parseISO(date), 'dd/MM/yyyy');
      } catch (error) {
        console.error('Error parsing conflict date', error);
        return date;
      }
    };

    const start = formatDate(conflictCycle.startDate) ?? 'sin fecha de inicio';
    const end = conflictCycle.endDate ? formatDate(conflictCycle.endDate) : 'en curso';
    return `Las fechas ingresadas se superponen con el ciclo del ${start} al ${end}.`;
  };

  const openAddDialog = () => {
    setAddCycleError(null);
    setShowAddDialog(true);
  };

  const closeAddDialog = () => {
    setShowAddDialog(false);
    setAddCycleError(null);
  };

  const handleAddCycle = async ({ startDate, endDate, force, insertMode }) => {
    if (startDate && endDate && parseISO(endDate) < parseISO(startDate)) {
      setAddCycleError({
        message: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
        conflictCycle: null,
      });
      return;
    }
    try {
      if (insertMode && force) {
        await insertCycleRange(startDate, endDate);
      } else {
        await addArchivedCycle(startDate, endDate);
      }
      closeAddDialog();
    } catch (error) {
      const message =
        error.code === 'cycle-overlap'
          ? formatConflictMessage(error.conflictCycle)
          : 'No se pudo crear el ciclo.';
      setAddCycleError({ message, conflictCycle: error.conflictCycle || null });
    }
  };

  const handleUpdateCycle = async ({ startDate, endDate }) => {
    if (!editingCycle) return;

    try {
      const currentStartDate = editingCycle.startDate;
      const currentEndDate = editingCycle.endDate;
      const hasStartChange = startDate !== undefined && startDate !== currentStartDate;
      const hasEndChange = endDate !== undefined && endDate !== currentEndDate;

      const effectiveStartDate = hasStartChange ? startDate : currentStartDate;
      const effectiveEndDate = hasEndChange ? endDate : currentEndDate;
      if (
        effectiveStartDate &&
        effectiveEndDate &&
        parseISO(effectiveEndDate) < parseISO(effectiveStartDate)
      ) {
        setEditCycleError({
          message: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
          conflictCycle: null,
        });
        return;
      }

      await updateCycleDates(editingCycle.id, startDate, endDate);
      setEditingCycle(null);
      setEditCycleError(null);
    } catch (error) {
      const message =
        error.code === 'cycle-overlap'
          ? formatConflictMessage(error.conflictCycle)
          : 'No se pudieron actualizar las fechas.';
      setEditCycleError({ message, conflictCycle: error.conflictCycle || null });
    }
  };


  const navigateToCycle = (cycle) => {
    navigate(cycle.isCurrent ? '/records' : `/cycle/${cycle.id}`);
  };
    const handleConfirmUndoCycle = useCallback(async () => {
    if (!currentCycleWithFlag?.id) return;

    setIsUndoingCycle(true);

    try {
      await undoCurrentCycle(currentCycleWithFlag.id);
      setShowUndoCycleDialog(false);
      setCycleForActions(null);
      toast({
        title: 'Ciclo deshecho',
        description: 'El ciclo actual se ha unido al anterior.',
      });
    } catch (error) {
      const publicError = getPublicError?.(error);
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudo deshacer el ciclo.',
        variant: 'destructive',
      });
    } finally {
      setIsUndoingCycle(false);
    }
  }, [currentCycleWithFlag?.id, getPublicError, toast, undoCurrentCycle]);

  const runAfterActionSheetClose = useCallback((callback) => {
    if (actionSheetTimeoutRef.current) {
      window.clearTimeout(actionSheetTimeoutRef.current);
    }

    setCycleForActions(null);
    actionSheetTimeoutRef.current = window.setTimeout(() => {
      actionSheetTimeoutRef.current = null;
      callback();
    }, CYCLE_OPTIONS_SHEET_EXIT_DELAY_MS);
  }, []);

  const handleEditCycleFromSheet = useCallback(() => {
    if (!cycleForActions) return;
    const targetCycle = cycleForActions;

    runAfterActionSheetClose(() => {
      setEditingCycle(targetCycle);
      setEditCycleError(null);
    });
  }, [cycleForActions, runAfterActionSheetClose]);

  const handleUndoCycleFromSheet = useCallback(() => {
    if (!cycleForActions?.isCurrent || !undoCandidate) return;

    runAfterActionSheetClose(() => {
      setShowUndoCycleDialog(true);
    });
  }, [cycleForActions?.isCurrent, runAfterActionSheetClose, undoCandidate]);

  const handleDeleteCycleFromSheet = useCallback(() => {
    if (!cycleForActions || cycleForActions.isCurrent) return;
    const targetCycle = cycleForActions;

    runAfterActionSheetClose(() => {
      setCycleToDelete(targetCycle);
    });
  }, [cycleForActions, runAfterActionSheetClose]);

  const handlePostpartumChange = useCallback(
    async (checked) => {
      if (!cycleForActions?.id || typeof updateCyclePostpartumMode !== 'function' || isUpdatingPostpartum) {
        return;
      }

      const nextValue = checked === true;
      const targetCycleId = cycleForActions.id;

      setIsUpdatingPostpartum(true);
      try {
        await updateCyclePostpartumMode(targetCycleId, nextValue);
        setCycleForActions((current) =>
          current?.id === targetCycleId ? { ...current, postpartumMode: nextValue } : current
        );
        toast({
          title: nextValue ? 'Modo postparto activado' : 'Modo postparto desactivado',
        });
      } catch (error) {
        console.error('Failed to persist postpartum mode from archived cycles page', error);
        toast({
          title: 'No se pudo actualizar el modo postparto',
          description: 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      } finally {
        setIsUpdatingPostpartum(false);
      }
    },
    [cycleForActions?.id, isUpdatingPostpartum, toast, updateCyclePostpartumMode]
  );

  const openActions = (event, cycle) => {
    event.stopPropagation();
    setCycleForActions(cycle);
  };

  const YearSeparator = ({ year }) => (
  <div className="flex items-center gap-3 px-1 pt-1">
    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fertiliapp-fuerte">{year}</span>
<div className="h-px flex-1 bg-rose-100/70" />
  </div>
);

const CycleRow = ({ cycle, isFirst, isLast }) => {
  const { rangeLabel, recordCount, durationDays } = normalizeCycleRowData(cycle);
  const isSelected = Boolean(cycleForActions?.id && cycleForActions.id === cycle.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigateToCycle(cycle)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigateToCycle(cycle);
        }
      }}
      className={cn(
        'group relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-rose-50/35 active:bg-rose-50/60',
        isSelected && 'bg-rose-50/60 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.28)]'
      )}
    >
      {cycle.isCurrent ? (
        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-fertiliapp-fuerte" />
      ) : null}

      <span
        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
          cycle.isCurrent
            ? 'border-rose-100 bg-rose-50 text-fertiliapp-fuerte'
            : 'border-rose-100/70 bg-rose-50/55 text-slate-400'
        }`}
      >
        <CalendarDays className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="truncate pr-2 text-[15px] font-semibold leading-5 text-slate-800">
            {rangeLabel}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            {cycle.isCurrent ? (
              <Badge className="rounded-full bg-fertiliapp-fuerte px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-none">
                Actual
              </Badge>
            ) : null}

            {cycle.postpartumMode ? (
              <Badge
                variant="outline"
                className="rounded-full border-rose-100 bg-rose-50 px-2.5 py-0.5 text-[10px] font-medium text-fertiliapp-fuerte"
              >
                <Baby className="mr-1 h-3 w-3" />
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-slate-500">
          {durationDays ? <span>{durationDays} días</span> : null}
          {durationDays ? <span className="text-slate-300">·</span> : null}
          <span className="font-medium text-slate-500">
            {recordCount} registro{recordCount !== 1 ? 's' : ''}
          </span>          
        </div>
      </div>

      <button
        type="button"
        aria-label="Abrir acciones del ciclo"
        className="-mr-1 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-100 hover:bg-rose-50/70 hover:text-fertiliapp-fuerte"
        onClick={(event) => openActions(event, cycle)}
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
    </div>
  );
};

  if (isLoading && !hasCachedCycles) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center bg-[#fff7f9] py-10">
        <div className="p-8 text-center text-slate-600">Cargando ciclos archivados...</div>
      </div>
    );
  }

  if (!allCycles || allCycles.length === 0) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center bg-[#fff7f9] py-10">
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-600">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-fertiliapp-fuerte">
              <Archive className="h-8 w-8" />
            </div>
          <h2 className="mb-3 text-xl font-semibold text-titulo">No hay ciclos archivados</h2>
            <p className="mb-7 text-sm leading-relaxed text-subtitulo">Cuando inicies un nuevo ciclo, el anterior aparecerá aquí.</p>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild className="min-h-11 bg-fertiliapp-fuerte text-white hover:brightness-95">
                <Link to="/">Volver al Ciclo Actual</Link>
              </Button>
              <Button
                onClick={openAddDialog}
                className="min-h-11 bg-fertiliapp-fuerte text-white hover:brightness-95"
              >
                <Plus className="mr-2 h-4 w-4" /> Crear Ciclo
              </Button>
            </div>
          </div>
        </div>

        <EditCycleDatesDialog
          isOpen={showAddDialog}
          onClose={closeAddDialog}
          onConfirm={handleAddCycle}
          title="Añadir Ciclo Anterior"
          description="Ingresa las fechas de un ciclo previo para añadir registros."
          otherCycles={allCycles}
          errorMessage={addCycleError?.message}
          conflictCycle={addCycleError?.conflictCycle}
          onResetError={() => setAddCycleError(null)}
        />
      </div>
    );
  }

  const totalCycleCount = allCycles.length;

const totalRecordCount = allCycles.reduce(
  (total, cycle) => total + (cycle?.data?.length ?? 0),
  0
);
  
  return (
  <div className="relative flex min-h-full flex-col bg-[#fff7f9] pb-6">
      <div className="sticky top-0 z-30 border-b border-rose-100/60 bg-[#fff7f9]/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-fertiliapp-fuerte/60">
              ARCHIVO
            </div>

            <h1 className="truncate text-[24px] font-semibold leading-tight text-titulo">
              Mis ciclos
            </h1>

            <p className="mt-1 truncate text-sm font-medium text-subtitulo">
              {totalCycleCount} ciclo{totalCycleCount !== 1 ? 's' : ''} · {totalRecordCount} registro{totalRecordCount !== 1 ? 's' : ''}
            </p>
          </div>

          <HeaderIconButtonPrimary
            type="button"
            onClick={openAddDialog}
            aria-label="Añadir ciclo"
            className="border-rose-200 bg-white text-fertiliapp-fuerte shadow-[0_6px_16px_rgba(216,92,112,0.10)] hover:bg-rose-50"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Añadir ciclo</span>
          </HeaderIconButtonPrimary>
        </div>
      </div>

        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-1 pt-4">
          {currentCycle?.id ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fertiliapp-fuerte">
                Ciclo actual
              </h2>
              <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white shadow-[0_10px_24px_-22px_rgba(216,92,112,0.45)]">
                <CycleRow cycle={{ ...currentCycle, isCurrent: true }} isFirst isLast />
              </div>
            </section>
          ) : null}

          {gapAfterCurrentCycle > 0 ? <GapRow days={gapAfterCurrentCycle} /> : null}

          {archivedYears.map((year, yearIndex) => {
  const cyclesForYear = archivedByYear[year] || [];
  if (!cyclesForYear.length) return null;

  const previousYear = yearIndex > 0 ? archivedYears[yearIndex - 1] : null;
  const previousYearCycles = previousYear ? archivedByYear[previousYear] || [] : [];
  const previousYearLastCycle =
    previousYearCycles.length > 0 ? previousYearCycles[previousYearCycles.length - 1] : null;
  const firstCycleOfThisYear = cyclesForYear[0];
  const gapBeforeYear =
    yearIndex > 0 ? getGapDaysBetweenCycles(previousYearLastCycle, firstCycleOfThisYear) : 0;

  return (
    <section
      key={year}
      className="space-y-2"
    >
      {year !== currentYearLabel ? <YearSeparator year={year} /> : null}
      {yearIndex > 0 && gapBeforeYear > 0 ? <GapRow days={gapBeforeYear} /> : null}

      <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white shadow-[0_10px_24px_-22px_rgba(216,92,112,0.45)]">
                {cyclesForYear.map((cycle, index) => {
  const nextCycle = index < cyclesForYear.length - 1 ? cyclesForYear[index + 1] : null;
  const gapDays = nextCycle ? getGapDaysBetweenCycles(cycle, nextCycle) : 0;

  return (
    <div key={cycle.id}>
      <CycleRow
        cycle={cycle}
        isFirst={index === 0}
        isLast={index === cyclesForYear.length - 1}
      />

      {nextCycle ? (
        gapDays > 0 ? (
          <GapRow days={gapDays} />
        ) : (
          <div className="mx-4 h-px bg-rose-100/60" />
        )
      ) : null}
    </div>
  );
})}
              </div>
            </section>
          );
        })}
      </div>

      <CycleOptionsSheet
        open={Boolean(cycleForActions)}
        onOpenChange={(open) => {
          if (!open) {
            setCycleForActions(null);
          }
        }}
        cycleLabel={cycleForActions ? normalizeCycleRowData(cycleForActions).rangeLabel : ''}
        cycleMeta={cycleForActions ? formatCycleOptionsMeta(normalizeCycleRowData(cycleForActions)) : ''}
        isCurrentCycle={Boolean(cycleForActions?.isCurrent)}
        postpartumMode={Boolean(cycleForActions?.postpartumMode)}
        isUpdatingPostpartum={isUpdatingPostpartum}
        editDatesLabel={cycleForActions?.isCurrent ? 'Editar fecha de inicio' : 'Editar fechas'}
        onEditStartDate={handleEditCycleFromSheet}
        onPostpartumChange={handlePostpartumChange}
        showUndoCycle={Boolean(cycleForActions?.isCurrent && undoCandidate)}
        onUndoCycle={handleUndoCycleFromSheet}
        showDeleteCycle={Boolean(cycleForActions && !cycleForActions.isCurrent)}
        onDeleteCycle={handleDeleteCycleFromSheet}
        deleteDescription="Podrás elegir cómo gestionar sus registros antes de confirmar."
        isProcessing={isUpdatingPostpartum || isUndoingCycle}
      />

      <EditCycleDatesDialog
        isOpen={showAddDialog}
        onClose={closeAddDialog}
        onConfirm={handleAddCycle}
        title="Añadir Ciclo Anterior"
        description="Ingresa las fechas de un ciclo previo para añadir registros."
        otherCycles={allCycles}
        errorMessage={addCycleError?.message}
        conflictCycle={addCycleError?.conflictCycle}
        onResetError={() => setAddCycleError(null)}
        checkOverlapForNewRange={previewInsertCycleRange}
      />

      <EditCycleDatesDialog
        isOpen={!!editingCycle}
        onClose={() => {
          setEditingCycle(null);
          setEditCycleError(null);
        }}
        onConfirm={handleUpdateCycle}
        initialStartDate={editingCycle?.startDate}
        initialEndDate={editingCycle?.endDate}
        includeEndDate={!editingCycle?.isCurrent}
        cycleId={editingCycle?.id}
        checkOverlap={checkCycleOverlap}
        previewUpdateCycleDates={previewUpdateCycleDates}
        title={editingCycle?.isCurrent ? 'Editar fecha de inicio' : 'Editar fechas del ciclo'}
        description={editingCycle?.isCurrent ? 'Actualiza la fecha de inicio del ciclo actual.' : 'Actualiza las fechas del ciclo.'}
        cycleData={editingCycle?.data ?? []}
        otherCycles={allCycles}
        errorMessage={editCycleError?.message}
        conflictCycle={editCycleError?.conflictCycle}
        onResetError={() => setEditCycleError(null)}
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

      <ArchivedCycleDeleteDialog
        isOpen={Boolean(cycleToDelete)}
        cycle={cycleToDelete}
        onClose={() => setCycleToDelete(null)}
        onDeleteSimple={deleteCycle}
        onDeleteWithStrategy={deleteArchivedCycleWithStrategy}
        previewDeleteCycle={previewDeleteCycle}
        getPublicError={getPublicError}
        onDeleted={() => setCycleToDelete(null)}
      />
    </div>
  );
};

export default ArchivedCyclesPage;
