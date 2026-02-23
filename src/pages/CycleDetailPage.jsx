import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { HeaderIconButton, HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { ArrowLeft, BarChart3, Pencil, Plus } from 'lucide-react';
import { differenceInDays, startOfDay, parseISO, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { RecordsExperience } from '@/pages/RecordsPage.jsx';
import {
  ARCHIVED_CYCLE_DELETE_STRATEGY,
} from '@/lib/cycleDataHandler';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const formatCyclePreviewDate = (isoDate) => {
  if (!isoDate) return 'en curso';

  try {
    return format(parseISO(isoDate), 'dd-MM-yyyy');
  } catch {
    return isoDate;
  }
};

const generateCycleDaysForRecord = (recordIsoDate, cycleStartIsoDate) => {
  const recordDate = startOfDay(parseISO(recordIsoDate));
  const startDate = startOfDay(parseISO(cycleStartIsoDate));
  return differenceInDays(recordDate, startDate) + 1;
};

const processDataWithCycleDays = (data, cycleStartIsoDate) => {
  if (!data || !Array.isArray(data) || !cycleStartIsoDate) return [];
  const sortedData = [...data].sort((a, b) => parseISO(a.isoDate) - parseISO(b.isoDate));
  return sortedData.map((entry) => ({
    ...entry,
    ignored: entry.ignored || false,
    cycleDay: generateCycleDaysForRecord(entry.isoDate, cycleStartIsoDate)
  }));
};

const strategyLabels = {
  [ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE]: 'Eliminar ciclo y registros (dejar hueco)',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV]: 'Fusionar con el ciclo anterior',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT]: 'Fusionar con el ciclo siguiente',
};

const CycleDetailPage = () => {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    getCycleById,
    isLoading: cycleDataHookIsLoading,
    addOrUpdateDataPoint,
    deleteRecord,
    updateCycleDates,
    deleteCycle,
    previewDeleteCycle,
    deleteArchivedCycleWithStrategy,
    checkCycleOverlap,
    refreshData,
    getPublicError,
  } = useCycleData();
  const { toast } = useToast();

  const [cycleData, setCycleData] = useState(null);
  const [showCycleDeleteDialog, setShowCycleDeleteDialog] = useState(false);
  const [isDeletingCycle, setIsDeletingCycle] = useState(false);
  const [selectedDeleteStrategy, setSelectedDeleteStrategy] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
  const cycleRangeLabel = cycleData
    ? `${format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} - ${
        cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'
      }`
    : '';

    const deleteStrategyOptions = useMemo(
    () => [
      {
        value: ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV,
        title: strategyLabels[ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV],
        description: 'Mueve todos los registros al ciclo anterior y extiende su fecha de fin.',
      },
      {
        value: ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE,
        title: strategyLabels[ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE],
        description: 'Borra el ciclo completo y todos sus registros asociados.',
      },
      {
        value: ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT,
        title: strategyLabels[ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT],
        description: 'Mueve todos los registros al ciclo siguiente y adelanta su fecha de inicio.',
      },
    ],
    []
  );

  const resetDeleteDialogs = useCallback(() => {
    setShowCycleDeleteDialog(false);
    setSelectedDeleteStrategy(null);
    setDeletePreview(null);
    setIsLoadingDeletePreview(false);
  }, []);

  const saveCycleDataToLocalStorage = useCallback(
    (updatedCycle) => {
      if (!user || !updatedCycle?.id) return;
      const cycleToStore = {
        ...updatedCycle,
        data: (updatedCycle.data || []).map(({ cycleDay, ...rest }) => rest)
      };
      localStorage.setItem(`fertilityData_cycle_${user.uid}_${updatedCycle.id}`, JSON.stringify(cycleToStore));
    },
    [user]
  );

  const refreshCycleData = useCallback(async () => {
    if (!user || !cycleId) return null;

    const updatedCycle = await getCycleById(cycleId);
    if (updatedCycle) {
      saveCycleDataToLocalStorage(updatedCycle);
      setCycleData(updatedCycle);
    }
    return updatedCycle;
  }, [cycleId, getCycleById, saveCycleDataToLocalStorage, user]);

  useEffect(() => {
    const loadCycle = async () => {
      if (!user) return;

      let fetchedCycle = await getCycleById(cycleId);

      if (!fetchedCycle) {
        const localData = localStorage.getItem(`fertilityData_cycle_${user.uid}_${cycleId}`);
        if (localData) {
          const parsed = JSON.parse(localData);
          fetchedCycle = {
            ...parsed,
            data: processDataWithCycleDays(parsed.data || [], parsed.startDate)
          };
        }
      }

      if (fetchedCycle) {
        saveCycleDataToLocalStorage(fetchedCycle);
        setCycleData(fetchedCycle);
      } else {
        toast({ title: 'Error', description: 'No se pudo cargar el ciclo.', variant: 'destructive' });
        navigate('/archived-cycles');
      }
    };

    loadCycle();
  }, [cycleId, user, getCycleById, toast, navigate, saveCycleDataToLocalStorage]);

  const handleAddOrUpdateRecord = useCallback(
    async (newData, editingRecord) => {
      if (!cycleData?.id || !user) return;

      const wasEditing = Boolean(editingRecord);
      await addOrUpdateDataPoint(newData, editingRecord, cycleData.id);
      const updatedCycle = await refreshCycleData();

      if (updatedCycle) {
        toast({
          title: wasEditing ? 'Registro actualizado' : 'Nuevo registro añadido',
          description: 'Datos del ciclo actualizados.'
        });
      }
    },
    [cycleData?.id, user, addOrUpdateDataPoint, refreshCycleData, toast]
  );

  const handleDeleteRecordForCycle = useCallback(
    async (recordId) => {
      if (!cycleData?.id || !user) return;

      await deleteRecord(recordId, cycleData.id);
      await refreshCycleData();
      toast({ title: 'Registro eliminado', description: 'El registro ha sido eliminado.' });
    },
    [cycleData?.id, user, deleteRecord, refreshCycleData, toast]
  );

  const handleUpdateCycleDatesForCycle = useCallback(
    async (targetCycleId, startDate, endDate) => {
      const idToUse = targetCycleId ?? cycleData?.id;
      if (!user || !idToUse) return;

      await updateCycleDates(idToUse, startDate, endDate);
    },
    [cycleData?.id, user, updateCycleDates]
  );

  const handleRefreshData = useCallback(
    async (options) => {
      await refreshData(options);
      await refreshCycleData();
    },
    [refreshData, refreshCycleData]
  );

  const handleDeleteCycleRequest = useCallback(() => {
    if (!cycleData?.endDate) {
      setShowCycleDeleteDialog(true);
      return;
    }
    resetDeleteDialogs();
    setShowCycleDeleteDialog(true);
  }, [cycleData?.endDate, resetDeleteDialogs]);

  const handleSelectDeleteStrategy = useCallback(async (strategy) => {
    if (!cycleData?.id) return;
    setSelectedDeleteStrategy(strategy);
    setIsLoadingDeletePreview(true);
    try {
      const preview = await previewDeleteCycle(cycleData.id, strategy);
      setDeletePreview(preview);
    } catch (error) {
      const publicError = getPublicError(error);
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudo preparar la vista previa.',
        variant: 'destructive',
      });
      setSelectedDeleteStrategy(null);
      setDeletePreview(null);
    } finally {
      setIsLoadingDeletePreview(false);
    }
  }, [cycleData?.id, getPublicError, previewDeleteCycle, toast]);

  const handleConfirmDeleteCycle = useCallback(async () => {
    if (!cycleData?.id || !user) return;

    setIsDeletingCycle(true);
    try {
      if (selectedDeleteStrategy && cycleData?.endDate) {
        await deleteArchivedCycleWithStrategy(cycleData.id, selectedDeleteStrategy);
      } else {
        await deleteCycle(cycleData.id);
      }
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      navigate('/archived-cycles');
    } catch (error) {
      const publicError = getPublicError(error);
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudo eliminar el ciclo.',
        variant: 'destructive'
      });
    } finally {
      setIsDeletingCycle(false);
      resetDeleteDialogs();
    }
    }, [
    cycleData?.id,
    cycleData?.endDate,
    deleteArchivedCycleWithStrategy,
    deleteCycle,
    getPublicError,
    navigate,
    resetDeleteDialogs,
    selectedDeleteStrategy,
    toast,
    user,
  ]);

  const topAccessory = useCallback(() => (
    <HeaderIconButton asChild className="shrink-0 text-fertiliapp-fuerte">
      <Link to="/archived-cycles" aria-label="Volver a mis ciclos">
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Mis ciclos</span>
      </Link>
    </HeaderIconButton>
  ), []);

  const headerActions = useCallback(
    ({ openDateEditor, openAddRecord, isProcessing, isUpdatingDates }) => (
      <div className="flex items-center gap-2">
        <HeaderIconButton
          type="button"
          onClick={openDateEditor}
          aria-pressed={isUpdatingDates}
          disabled={isUpdatingDates}
          aria-label="Editar fechas del ciclo"
        >
          <Pencil className="h-4 w-4" />
        </HeaderIconButton>
        <HeaderIconButton asChild>
          <Link to={`/chart/${cycleId}`} aria-label="Ver gráfica del ciclo">
            <BarChart3 className="h-4 w-4" />
          </Link>
        </HeaderIconButton>
        <HeaderIconButtonPrimary
          type="button"
          onClick={openAddRecord}
          disabled={isProcessing}
          aria-label="Añadir registro al ciclo"
        >
          <Plus className="h-4 w-4" />
        </HeaderIconButtonPrimary>
      </div>
    ),
    [cycleId]
  );

  if ((cycleDataHookIsLoading && !cycleData) || !cycleData) {
    return (
      <div className="flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col items-center justify-center overflow-hidden">
        <p>Cargando detalles del ciclo...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] flex-col overflow-hidden">
      <RecordsExperience
        cycle={cycleData}
        isLoading={cycleDataHookIsLoading}
        addOrUpdateDataPoint={handleAddOrUpdateRecord}
        deleteRecord={handleDeleteRecordForCycle}
        updateCycleDates={handleUpdateCycleDatesForCycle}
        checkCycleOverlap={checkCycleOverlap}
        refreshData={handleRefreshData}
        includeEndDate
        headerActions={headerActions}
        topAccessory={topAccessory}
        onRequestDeleteCycle={handleDeleteCycleRequest}
        isDeletingCycle={isDeletingCycle}
        dateEditorDeleteDescription={
          cycleRangeLabel
            ? `Se eliminará el ciclo ${cycleRangeLabel} y todos sus registros asociados.`
            : 'Se eliminará este ciclo y todos sus registros asociados.'
        }
      />
      <DeletionDialog
        isOpen={showCycleDeleteDialog && !cycleData?.endDate}
        onClose={() => setShowCycleDeleteDialog(false)}
        onConfirm={handleConfirmDeleteCycle}
        title="Eliminar ciclo"
        confirmLabel="Eliminar ciclo"
        description={
          cycleRangeLabel
            ? `¿Estás seguro de que quieres eliminar el ciclo ${cycleRangeLabel}? Esta acción no se puede deshacer.`
            : '¿Estás seguro de que quieres eliminar este ciclo? Esta acción no se puede deshacer.'
        }
        isProcessing={isDeletingCycle}
      />
      
      <Dialog open={showCycleDeleteDialog && Boolean(cycleData?.endDate) && !selectedDeleteStrategy} onOpenChange={(open) => !open && resetDeleteDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar ciclo archivado</DialogTitle>
            <DialogDescription>
              Elige cómo quieres eliminar el ciclo. Puedes borrar todo o fusionar sus registros con un ciclo vecino.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {deleteStrategyOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className={`h-auto w-full flex-col items-start gap-1 text-left ${
                  option.value === ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE
                    ? 'border-red-200 bg-red-100/20 hover:bg-red-200/80'
                    : 'border-gray-300 bg-slate-50 hover:bg-slate-100'
                }`}
                disabled={isLoadingDeletePreview || isDeletingCycle}
                onClick={() => handleSelectDeleteStrategy(option.value)}
              >
                <span
                  className={`font-semibold ${
                    option.value === ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE ? 'text-red-700' : 'text-slate-800'
                  }`}
                >
                  {option.title}
                </span>
                <span className="text-xs text-slate-600">{option.description}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetDeleteDialogs} disabled={isLoadingDeletePreview || isDeletingCycle}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCycleDeleteDialog && Boolean(selectedDeleteStrategy) && Boolean(deletePreview)} onOpenChange={(open) => !open && resetDeleteDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>
              Revisa el impacto antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p><strong>Estrategia:</strong> {strategyLabels[selectedDeleteStrategy]}</p>
            <p>
              <strong>Impacto:</strong> {deletePreview?.impactSummary?.trimmedCycles ?? 0} ciclos ajustados,{' '}
              {deletePreview?.impactSummary?.deletedCycles ?? 0} eliminados,{' '}
              {deletePreview?.impactSummary?.movedEntries ?? 0} registros movidos.
            </p>
            <div>
              <p className="font-semibold text-slate-800">Ciclos afectados</p>
              <ul className="mt-1 list-disc pl-5">
                {(deletePreview?.affectedCycles ?? []).map((affected) => (
                  <li key={affected.cycleId}>
                    {affected.startDate} → {affected.endDate ?? 'en curso'}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Cómo quedarán</p>
              <ul className="mt-1 list-disc pl-5">
                {(deletePreview?.adjustedCyclesPreview ?? []).map((adjusted) => (
                  <li key={`${adjusted.cycleId}-${adjusted.type}`}>
                    {adjusted.type === 'delete' ? 'Eliminar' : 'Ajustar'} ciclo: {adjusted.startDate} → {adjusted.endDate ?? 'en curso'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedDeleteStrategy(null);
                setDeletePreview(null);
              }}
              disabled={isDeletingCycle}
            >
              Atrás
            </Button>
            <Button type="button" onClick={handleConfirmDeleteCycle} disabled={isDeletingCycle}>
              {isDeletingCycle ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CycleDetailPage;