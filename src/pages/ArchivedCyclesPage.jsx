import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { HeaderIconButton, HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, Plus, Calendar, BarChart3, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';
import DeletionDialog from '@/components/DeletionDialog';
import { useToast } from '@/components/ui/use-toast';

const ArchivedCyclesPage = () => {
  const {
    currentCycle,
    archivedCycles,
    isLoading,
    addArchivedCycle,
    updateCycleDates,
    deleteCycle,
    checkCycleOverlap,
  } = useCycleData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);
  const [cycleToDelete, setCycleToDelete] = useState(null);
  const [isDeletingCycle, setIsDeletingCycle] = useState(false);
  const [addCycleError, setAddCycleError] = useState(null);
  const [editCycleError, setEditCycleError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const longPressTimeoutRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const isTouchMovingRef = useRef(false); // NUEVO

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

  const handleAddCycle = async ({ startDate, endDate }) => {
    if (startDate && endDate && parseISO(endDate) < parseISO(startDate)) {
      setAddCycleError({
        message: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
        conflictCycle: null,
      });
      return;
    }
    try {
      await addArchivedCycle(startDate, endDate);
      closeAddDialog();
    } catch (error) {
      const message = error.code === 'cycle-overlap'
        ? formatConflictMessage(error.conflictCycle)
        : 'No se pudo crear el ciclo.';
      setAddCycleError({ message, conflictCycle: error.conflictCycle || null });
    }
  };

  const handleEditCycle = (cycle) => {
    setEditCycleError(null);
    setEditingCycle(cycle);
  };

  const handleUpdateCycle = async ({ startDate, endDate, force }) => {
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
      const message = error.code === 'cycle-overlap'
        ? formatConflictMessage(error.conflictCycle)
        : 'No se pudieron actualizar las fechas.';
      setEditCycleError({ message, conflictCycle: error.conflictCycle || null });
    }
  };

  const handleDeleteCycleRequest = (cycle) => {
    setCycleToDelete(cycle);
  };

  const handleConfirmDeleteCycle = async () => {
    if (!cycleToDelete) return;
    setIsDeletingCycle(true);
    try {
      await deleteCycle(cycleToDelete.id);
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      setCycleToDelete(null);
    } catch (error) {
      console.error('Error deleting archived cycle:', error);
    } finally {
      setIsDeletingCycle(false);
    }
  };

  const navigateToCycle = (cycle) => {
    navigate(cycle.isCurrent ? '/' : `/cycle/${cycle.id}`);
  };

  const startLongPressDetection = (cycle) => {
    longPressTriggeredRef.current = false;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    longPressTimeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      handleDeleteCycleRequest(cycle);
    }, 1500);
  };

  const cancelLongPressDetection = (cycle, shouldNavigate = true) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (!longPressTriggeredRef.current && shouldNavigate) {
      navigateToCycle(cycle);
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  const allCycles = currentCycle.id
    ? [{ ...currentCycle, isCurrent: true, needsCompletion: !currentCycle.endDate }, ...archivedCycles]
    : archivedCycles;

  const hasCachedCycles = allCycles && allCycles.length > 0;

  if (isLoading && !hasCachedCycles) {
    return (
      <div className="relative flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col items-center justify-center overflow-hidden">
        <div className="text-center text-slate-600 p-8">Cargando ciclos archivados...</div>
      </div>
    );
  }

  if (!allCycles || allCycles.length === 0) {
    return (
      <div className="relative flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            className="text-center text-slate-600 flex flex-col items-center max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white/70 mt-6 backdrop-blur-md rounded-3xl p-8 border border-pink-200/50 shadow-sm">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full flex items-center justify-center">
                <Archive className="w-10 h-10 text-subtitulo" />
              </div>
              <h2 className="text-2xl font-semibold text-subtitulo mb-4">No hay ciclos archivados</h2>
              <p className="text-subtitulo mb-8">Cuando inicies un nuevo ciclo, el anterior aparecerá aquí.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild className="bg-fertiliapp-fuerte rounded-3xl hover:brightness-95 text-white shadow-sm">
                  <Link to="/">Volver al Ciclo Actual</Link>
                </Button>
                <Button
                  onClick={openAddDialog}
                  className="bg-fertiliapp-fuerte hover:brightness-95 rounded-3xl text-white shadow-sm"
                >
                  <Plus className="mr-2 h-4 w-4" /> Crear Ciclo
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
        <EditCycleDatesDialog
          isOpen={showAddDialog}
          onClose={closeAddDialog}
          onConfirm={handleAddCycle}
          title="Añadir Ciclo Anterior"
          description="Ingresa las fechas de un ciclo previo para añadir registros."
          errorMessage={addCycleError?.message}
          conflictCycle={addCycleError?.conflictCycle}
          onResetError={() => setAddCycleError(null)}
        />
      </div>
    );
  }

  const sortedCycles = [...allCycles].sort(
    (a, b) => parseISO(b.startDate) - parseISO(a.startDate)
  );

  const availableYears = Array.from(
    new Set(
      sortedCycles
        .map((cycle) => {
          try {
            return parseISO(cycle.startDate).getFullYear();
          } catch (error) {
            console.error('Error parsing startDate for year filter', error);
            return null;
          }
        })
        .filter(Boolean)
    )
  ).sort((a, b) => b - a);

  const filteredCycles = selectedYear === 'all'
    ? sortedCycles
    : sortedCycles.filter((cycle) => {
      try {
        return parseISO(cycle.startDate).getFullYear() === Number(selectedYear);
      } catch (error) {
        console.error('Error filtering cycle by year', error);
        return false;
      }
    });
  return (
    <div className="relative flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col overflow-hidden">
      <div className="relative z-10 flex flex-1">
        <div className="w-full max-w-4xl mx-auto px-4 py-6 flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col">
          {/* Header */}
          <motion.div
  className="mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-3xl border border-fertiliapp-suave bg-white/80 p-3 shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[21px] font-semibold leading-tight text-titulo">
                      Mis ciclos
                    </span>
                  </div>
                  <div className="truncate text-[13px] text-base">Historial de ciclos</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <HeaderIconButtonPrimary type="button" onClick={openAddDialog} aria-label="Añadir ciclo">
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Añadir ciclo</span>
                  </HeaderIconButtonPrimary>

                  <HeaderIconButton
                    type="button"
                    onClick={() => setIsFilterOpen((prev) => !prev)}
                    aria-label="Filtrar por año"
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                  </HeaderIconButton>
                </div>
              </div>
            </div>
          </motion.div>

{isFilterOpen && (
  <div className="mb-4 flex w-full justify-center">
    <div className="flex w-full max-w-md items-center gap-2 rounded-3xl border border-fertiliapp-suave bg-white/90 px-3 py-2 shadow-sm">
      <span className="text-xs font-medium text-slate-700">Año</span>
      <select
        id="year-filter"
        value={selectedYear}
        onChange={(event) => setSelectedYear(event.target.value)}
        className="flex-1 rounded-3xl border border-pink-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-fertiliapp"
      >
        <option value="all">Todos</option>
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  </div>
)}


          {/* Cycles List */}
          <div className="flex-1 overflow-y-auto pr-1 sm:pr-0 pb-6">
          <motion.div
            className="space-y-3 px-1"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1
                  }
                }
              }}
              initial="hidden"
              animate="show"
            >
              {filteredCycles.map((cycle) => {
                const formatArchivedDate = (date) => format(date, 'dd MMM yy', { locale: es });
                const start = cycle.startDate ? parseISO(cycle.startDate) : null;
                const end = cycle.endDate ? parseISO(cycle.endDate) : null;
                const hasEndDate = Boolean(end);
                const startToShow = start && end && end < start ? end : start;
                const endToShow = start && end && end < start ? start : end;
                const endDate = hasEndDate && endToShow ? formatArchivedDate(endToShow) : 'En curso';
                const recordCount = cycle.data ? cycle.data.length : 0;
                const durationDays =
                  startToShow && endToShow
                    ? Math.max(1, differenceInCalendarDays(endToShow, startToShow) + 1)
                    : null;

                return (
                  <motion.button
                    key={cycle.id}
                    type="button"
                    className="w-full max-w-[480px] mx-auto bg-white/80 backdrop-blur-md border border-fertiliapp-suave shadow-md hover:shadow-sm transition-all duration-300 hover:bg-white/90 rounded-3xl active:scale-[0.98] cursor-pointer select-none"
                    variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                    onMouseDown={() => startLongPressDetection(cycle)}
                    onMouseUp={() => cancelLongPressDetection(cycle)}
                    onMouseLeave={() => cancelLongPressDetection(cycle, false)}
                    onTouchStart={() => {
                      isTouchMovingRef.current = false;
                      startLongPressDetection(cycle);
                    }}
                    onTouchMove={() => {
                      isTouchMovingRef.current = true;      // se está desplazando
                      cancelLongPressDetection(cycle, false); // cancelamos long press pero NO navegamos
                    }}
                    onTouchEnd={() => {
                      if (isTouchMovingRef.current) {
                        // Ha sido un scroll, no un tap
                        isTouchMovingRef.current = false;
                        cancelLongPressDetection(cycle, false); // solo limpiar timeout
                      } else {
                        // Tap real: navegamos si no fue long press
                        cancelLongPressDetection(cycle, true);
                      }
                    }}
                  >
                    <div className="p-2.5">
                      {/* Información del ciclo */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Icono del ciclo */}
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 bg-fertiliapp-fuerte rounded-full flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-5 h-5 text-white" />
                          </div>
                        </div>

                          {/* Detalles del ciclo */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="truncate text-[15px] font-semibold text-slate-700">
                              {startToShow ? formatArchivedDate(startToShow) : ''} - {endDate}
                            </h2>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
                            <div className="flex items-center space-x-1">
                              <BarChart3 className="w-4 h-4 text-slate-500" />
                              <span>{recordCount} registro{recordCount !== 1 ? 's' : ''}</span>

                            </div>

                            {cycle.endDate && durationDays && (
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <span>
                                  {durationDays} días
                                </span>
                              </div>
                        )}
                            {cycle.isCurrent && (
                              <Badge className="rounded-full bg-fertiliapp-fuerte px-2 py-0.5 text-[11px] text-white">
                                Ciclo actual
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                      </motion.button>
                );
              })}
              {filteredCycles.length === 0 && (
                <div className="mt-6 rounded-3xl border border-dashed border-fertiliapp-suave bg-white/70 p-6 text-center text-slate-600 shadow-inner">
                  No hay ciclos para el año seleccionado.
 
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <EditCycleDatesDialog
        isOpen={showAddDialog}
        onClose={closeAddDialog}
        onConfirm={handleAddCycle}
        title="Añadir Ciclo Anterior"
        description="Ingresa las fechas de un ciclo previo para añadir registros."
        errorMessage={addCycleError?.message}
        conflictCycle={addCycleError?.conflictCycle}
        onResetError={() => setAddCycleError(null)}
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
        title="Editar Fechas del Ciclo"
        description="Actualiza las fechas del ciclo."
        errorMessage={editCycleError?.message}
        conflictCycle={editCycleError?.conflictCycle}
        onResetError={() => setEditCycleError(null)}
      />
      <DeletionDialog
        isOpen={!!cycleToDelete}
        onClose={() => setCycleToDelete(null)}
        onConfirm={handleConfirmDeleteCycle}
        title="Eliminar ciclo"
        confirmLabel="Eliminar ciclo"
        description={
          cycleToDelete
            ? `¿Estás seguro de que quieres eliminar el ciclo ${format(parseISO(cycleToDelete.startDate), 'dd/MM/yyyy')} - ${
                cycleToDelete.endDate
                  ? format(parseISO(cycleToDelete.endDate), 'dd/MM/yyyy')
                  : 'En curso'
              }? Esta acción no se puede deshacer.`
            : ''
        }
        isProcessing={isDeletingCycle}
      />
    </div>
  );
};

export default ArchivedCyclesPage;