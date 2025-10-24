import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3, Pencil, Plus } from 'lucide-react';
import { differenceInDays, startOfDay, parseISO, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { RecordsExperience } from '@/pages/RecordsPage.jsx';

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
    checkCycleOverlap,
    forceUpdateCycleStart,
    refreshData
  } = useCycleData();
  const { toast } = useToast();

  const [cycleData, setCycleData] = useState(null);
  const [showCycleDeleteDialog, setShowCycleDeleteDialog] = useState(false);
  const [isDeletingCycle, setIsDeletingCycle] = useState(false);
  const cycleRangeLabel = cycleData
    ? `${format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} - ${
        cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'
      }`
    : '';

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
  }, [cycleId, user, getCycleById, toast, navigate]);

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

  const handleForceUpdateCycleStartForCycle = useCallback(
    async (targetCycleId, startDate) => {
      const idToUse = targetCycleId ?? cycleData?.id;
      if (!user || !idToUse) return;

      await forceUpdateCycleStart(idToUse, startDate);
    },
    [cycleData?.id, user, forceUpdateCycleStart]
  );

  const handleRefreshData = useCallback(
    async (options) => {
      await refreshData(options);
      await refreshCycleData();
    },
    [refreshData, refreshCycleData]
  );

  const handleDeleteCycleRequest = () => {
    setShowCycleDeleteDialog(true);
  };

  const handleConfirmDeleteCycle = useCallback(async () => {
    if (!cycleData?.id || !user) return;

    setIsDeletingCycle(true);
    try {
      await deleteCycle(cycleData.id);
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      navigate('/archived-cycles');
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudo eliminar el ciclo.', variant: 'destructive' });
    } finally {
      setIsDeletingCycle(false);
      setShowCycleDeleteDialog(false);
    }
    }, [cycleData?.id, deleteCycle, navigate, toast, user]);

  const topAccessory = useCallback(() => (
    <div className="flex items-center gap-3">
      <Button
        asChild
        variant="outline"
        size="icon"
        className="shrink-0 rounded-full border-pink-300 text-pink-600 hover:bg-pink-50 hover:border-pink-400"
      >
        <Link to="/archived-cycles" aria-label="Volver a mis ciclos">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Mis ciclos</span>
        </Link>
      </Button>
      <div className="items-center justify-center px-4 py-3">
        <h2 className="text-2xl font-semibold text-rose-700 truncate">
          {cycleData?.name ? `${cycleData.name} · ` : ''}{cycleRangeLabel}
        </h2>
      </div>
    </div>
    ), [cycleData?.name, cycleRangeLabel]);

  const headerActions = useCallback(
    ({ openDateEditor, openAddRecord, isProcessing, isUpdatingDates }) => (
      <div className="flex items-center gap-1">
        <Button
          asChild
          variant="outline"
          size="icon"
          className="border-pink-300 text-pink-600 rounded-full hover:bg-pink-50 hover:border-pink-400"
        >
          <Link to={`/chart/${cycleId}`} aria-label="Ver gráfica del ciclo">
            <BarChart3 className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={openDateEditor}
          aria-pressed={isUpdatingDates}
          className="border-pink-300 text-pink-600 rounded-full hover:bg-pink-50 hover:border-pink-400"
          disabled={isUpdatingDates}
          aria-label="Editar fechas del ciclo"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={openAddRecord}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow"
          disabled={isProcessing}
          aria-label="Añadir registro al ciclo"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    ),
    [cycleId]
  );

  if ((cycleDataHookIsLoading && !cycleData) || !cycleData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 px-4 py-8 text-center text-pink-600">
        <p>Cargando detalles del ciclo...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      <RecordsExperience
        cycle={cycleData}
        isLoading={cycleDataHookIsLoading}
        addOrUpdateDataPoint={handleAddOrUpdateRecord}
        deleteRecord={handleDeleteRecordForCycle}
        updateCycleDates={handleUpdateCycleDatesForCycle}
        checkCycleOverlap={checkCycleOverlap}
        forceUpdateCycleStart={handleForceUpdateCycleStartForCycle}
        refreshData={handleRefreshData}
        includeEndDate
        headerActions={headerActions}
        topAccessory={topAccessory}
        headerTitle="Mis registros"
        onRequestDeleteCycle={handleDeleteCycleRequest}
        isDeletingCycle={isDeletingCycle}
        dateEditorDeleteDescription={
          cycleRangeLabel
            ? `Se eliminará el ciclo ${cycleRangeLabel} y todos sus registros asociados.`
            : 'Se eliminará este ciclo y todos sus registros asociados.'
        }
      />
      <DeletionDialog
        isOpen={showCycleDeleteDialog}
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
    </div>
  );
};

export default CycleDetailPage;