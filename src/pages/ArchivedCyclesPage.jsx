import React, { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import DeletionDialog from '@/components/DeletionDialog';
import { differenceInCalendarDays, format, parseISO, addDays, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, Baby, CalendarDays, EllipsisVertical, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';
import ArchivedCycleDeleteDialog from '@/components/ArchivedCycleDeleteDialog';
import { useToast } from '@/components/ui/use-toast';

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
  } = useCycleData();

  const { toast } = useToast();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);
  const [cycleForActions, setCycleForActions] = useState(null);
  const [cycleToDelete, setCycleToDelete] = useState(null);
  const [showUndoCycleDialog, setShowUndoCycleDialog] = useState(false);
  const [isUndoingCycle, setIsUndoingCycle] = useState(false);
  const [addCycleError, setAddCycleError] = useState(null);
  const [editCycleError, setEditCycleError] = useState(null);
  
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

  const openActions = (event, cycle) => {
    event.stopPropagation();
    setCycleForActions(cycle);
  };

  const YearSeparator = ({ year }) => (
  <div className="my-1 flex items-center gap-3 px-2">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-200 to-transparent" />
    <span className="text-[11px] font-semibold tracking-[0.14em] text-fertiliapp-fuerte">{year}</span>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-200 to-transparent" />
  </div>
);

const CycleRow = ({ cycle, isFirst, isLast }) => {
  const { rangeLabel, recordCount, durationDays } = normalizeCycleRowData(cycle);

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
      className={`group relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-rose-50/40 active:bg-rose-100/40 ${
        isFirst ? 'rounded-t-[28px]' : ''
      } ${isLast ? 'rounded-b-[28px]' : ''}`}
    >
      {cycle.isCurrent ? (
        <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-fertiliapp-fuerte" />
      ) : null}

      <span
        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
          cycle.isCurrent
            ? 'border-rose-200 bg-rose-100/90 text-fertiliapp-fuerte'
            : 'border-rose-100 bg-rose-50/80 text-rose-400'
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
              <Badge className="rounded-full bg-fertiliapp-fuerte px-2.5 py-0.5 text-[10px] font-semibold text-white">
                Actual
              </Badge>
            ) : null}

            {cycle.postpartumMode ? (
              <Badge
                variant="outline"
                className="rounded-full border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-medium text-rose-700"
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
        className="-mr-1 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-100 hover:bg-rose-50/70 hover:text-slate-700"
        onClick={(event) => openActions(event, cycle)}
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
    </div>
  );
};

  if (isLoading && !hasCachedCycles) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center py-10">
        <div className="p-8 text-center text-slate-600">Cargando ciclos archivados...</div>
      </div>
    );
  }

  if (!allCycles || allCycles.length === 0) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_32%,rgba(244,114,182,0.18)_0%,rgba(244,114,182,0.12)_35%,rgba(244,114,182,0.06)_60%,rgba(244,114,182,0)_100%)]" />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center rounded-3xl border border-pink-200/50 bg-white/70 p-8 text-center text-slate-600 shadow-sm backdrop-blur-md">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100">
              <Archive className="h-10 w-10 text-subtitulo" />
            </div>
          <h2 className="mb-4 text-2xl font-semibold text-subtitulo">No hay ciclos archivados</h2>
            <p className="mb-8 text-subtitulo">Cuando inicies un nuevo ciclo, el anterior aparecerá aquí.</p>
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
              <Button asChild className="rounded-3xl bg-fertiliapp-fuerte text-white shadow-sm hover:brightness-95">
                <Link to="/">Volver al Ciclo Actual</Link>
              </Button>
              <Button
                onClick={openAddDialog}
                className="rounded-3xl bg-fertiliapp-fuerte text-white shadow-sm hover:brightness-95"
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

  
  return (
  <div className="relative flex flex-col pb-6">
      <div className="sticky top-0 z-30 px-4 pb-3 pt-1">
  <div className="mx-auto w-full max-w-2xl rounded-[30px] border border-rose-200/60 bg-white/95 via-white/90 to-rose-50/80 p-3 shadow-[0_10px_30px_-18px_rgba(216,92,112,0.45)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="truncate text-[21px] font-semibold leading-tight text-titulo">Mis ciclos</span>
              <p className="truncate text-[13px] text-app-base">Historial de ciclos</p>
            </div>
          <HeaderIconButtonPrimary type="button" onClick={openAddDialog} aria-label="Añadir ciclo">
              <Plus className="h-4 w-4" />
              <span className="sr-only">Añadir ciclo</span>
            </HeaderIconButtonPrimary>
          </div>
        </div>
      </div>

        <div className="mx-auto w-full max-w-2xl space-y-3.5 px-4 pt-1.5 pb-1">
          {currentCycle?.id ? (
  <section className="overflow-hidden rounded-[28px] border border-rose-200/80 bg-white shadow-[0_14px_28px_-22px_rgba(216,92,112,0.35)]">
    <CycleRow cycle={{ ...currentCycle, isCurrent: true }} isFirst isLast />
  </section>
) : null}

                {archivedYears.map((year, yearIndex) => {
          const cyclesForYear = archivedByYear[year] || [];
          if (!cyclesForYear.length) return null;

          return (
            <section
              key={year}
              className={yearIndex === 0 ? 'space-y-1 pt-0.5' : 'space-y-1 pt-0.5'}
            >
              {yearIndex > 0 ? <YearSeparator year={year} /> : null}
              <div className="overflow-hidden rounded-[28px] border border-rose-200/75 bg-white shadow-[0_12px_24px_-20px_rgba(15,23,42,0.14)]">
                {cyclesForYear.map((cycle, index) => (
                  <div key={cycle.id}>
                    <CycleRow
                      cycle={cycle}
                      isFirst={index === 0}
                      isLast={index === cyclesForYear.length - 1}
                    />
                    {index < cyclesForYear.length - 1 ? (
                    <div className="mx-4 h-px bg-gradient-to-r from-transparent via-rose-200/80 to-transparent" />
                  ) : null}
                  </div>
                 ))}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={Boolean(cycleForActions)} onOpenChange={(open) => !open && setCycleForActions(null)}>
        <DialogContent className="sm:max-w-sm rounded-[28px] border border-rose-100 bg-white">
          <DialogHeader>
            <DialogTitle>Acciones del ciclo</DialogTitle>
            <DialogDescription className="text-left text-sm text-slate-500">
              {cycleForActions ? normalizeCycleRowData(cycleForActions).rangeLabel : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              onClick={() => {
                setEditingCycle(cycleForActions);
                setEditCycleError(null);
                setCycleForActions(null);
              }}
            >
              <Pencil className="h-4 w-4" />
              Editar fechas
            </button>

            {cycleForActions?.isCurrent ? (
              undoCandidate ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-3 text-left text-sm font-medium text-amber-800 transition hover:from-amber-100 hover:to-orange-100"
                  onClick={() => {
                    setShowUndoCycleDialog(true);
                    setCycleForActions(null);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Deshacer ciclo
                </button>
              ) : null
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-2xl border border-red-200/80 bg-gradient-to-r from-red-50 to-rose-50 px-3 py-3 text-left text-sm font-medium text-red-700 transition hover:from-red-100 hover:to-rose-100"
                onClick={() => {
                  setCycleToDelete(cycleForActions);
                  setCycleForActions(null);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar ciclo
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
        cycleId={editingCycle?.id}
        checkOverlap={checkCycleOverlap}
        previewUpdateCycleDates={previewUpdateCycleDates}
        title="Editar fechas del ciclo"
        description="Actualiza las fechas del ciclo."
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
