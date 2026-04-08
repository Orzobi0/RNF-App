import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { HeaderIconButton, HeaderIconButtonPrimary } from '@/components/HeaderIconButton';
import { ArrowLeft, ChartSpline, Pencil, Plus } from 'lucide-react';
import { differenceInDays, startOfDay, parseISO, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { RecordsExperience } from '@/pages/RecordsPage.jsx';
import ArchivedCycleDeleteDialog from '@/components/ArchivedCycleDeleteDialog';

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
    getCycleFromState,
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
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [slowConnection, setSlowConnection] = useState(false);
  const [showCycleDeleteDialog, setShowCycleDeleteDialog] = useState(false);
  const cycleRangeLabel = cycleData
    ? `${format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} - ${
        cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'
      }`
    : '';


  const resetDeleteDialogs = useCallback(() => {
    setShowCycleDeleteDialog(false);
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
    let cancelled = false;
    let slowConnectionTimeout;
    let hasVisibleLocalData = false;

    const loadCycle = async () => {
      if (!user || !cycleId) {
        if (!cancelled) {
          setCycleData(null);
          setIsInitialLoading(false);
          setSlowConnection(false);
        }
        return;
      }

      setIsInitialLoading(true);
      setSlowConnection(false);

      let localCycle = null;

      const stateCycle = getCycleFromState(cycleId);
      if (stateCycle) {
        localCycle = stateCycle;
      } else {
        const localData = localStorage.getItem(`fertilityData_cycle_${user.uid}_${cycleId}`);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            localCycle = {
              ...parsed,
              data: processDataWithCycleDays(parsed.data || [], parsed.startDate)
            };
          } catch (error) {
            console.error('Error parsing cycle from localStorage:', error);
          }
        }
      }
      if (localCycle && !cancelled) {
        hasVisibleLocalData = true;
        setCycleData(localCycle);
        saveCycleDataToLocalStorage(localCycle);
      }

      if (!localCycle) {
        slowConnectionTimeout = setTimeout(() => {
          if (!cancelled) {
            setSlowConnection(true);
          }
        }, 9000);
      }

      const fetchedCycle = await getCycleById(cycleId);
      if (cancelled) return;

      if (slowConnectionTimeout) {
        clearTimeout(slowConnectionTimeout);
      }
      setSlowConnection(false);

      if (fetchedCycle) {
        saveCycleDataToLocalStorage(fetchedCycle);
        setCycleData(fetchedCycle);
        setIsInitialLoading(false);
        return;
      }

      if (localCycle) {
        setIsInitialLoading(false);
        return;
      }

      toast({ title: 'Error', description: 'No se pudo cargar el ciclo.', variant: 'destructive' });
      navigate('/archived-cycles');
      setIsInitialLoading(false);
    };

    loadCycle().catch((error) => {
      console.error('Error loading cycle detail:', error);
      if (cancelled) return;

      if (slowConnectionTimeout) {
        clearTimeout(slowConnectionTimeout);
      }
      setSlowConnection(false);
      setIsInitialLoading(false);

      if (hasVisibleLocalData) {
        return;
      }

      toast({ title: 'Error', description: 'No se pudo cargar el ciclo.', variant: 'destructive' });
      navigate('/archived-cycles');
    });

    return () => {
      cancelled = true;
      if (slowConnectionTimeout) {
        clearTimeout(slowConnectionTimeout);
      }
    };
   }, [
    cycleId,
    getCycleById,
    getCycleFromState,
    navigate,
    saveCycleDataToLocalStorage,
    toast,
    user,
  ]);
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
    setShowCycleDeleteDialog(true);
  }, []);

  const topAccessory = useCallback(() => (
    <HeaderIconButton asChild className="shrink-0 text-fertiliapp-fuerte">
      <Link to="/archived-cycles" aria-label="Volver a mis ciclos">
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Mis ciclos</span>
      </Link>
    </HeaderIconButton>
  ), []);

  const headerActions = useCallback(
   ({ openDateEditor, openAddRecord, isProcessing, isDateEditorOpen }) => (
      <div className="flex items-center gap-2">
        <HeaderIconButton
          type="button"
          onClick={openDateEditor}
          data-date-editor-toggle="true"
          aria-pressed={isDateEditorOpen}
          aria-expanded={isDateEditorOpen}
          className="date-editor-toggle"
          aria-label="Editar fechas del ciclo"
        >
          <Pencil className="h-4 w-4" />
        </HeaderIconButton>
        <HeaderIconButton asChild>
          <Link to={`/chart/${cycleId}`} aria-label="Ver gráfica del ciclo">
            <ChartSpline className="h-4 w-4" />
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
  if (isInitialLoading && !cycleData) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-10">
        <p>Cargando detalles del ciclo...</p>
        {slowConnection ? (
          <p className="mt-2 text-sm text-muted-foreground">La carga está tardando más de lo normal.</p>
        ) : null}
      </div>
    );
  }
  if (!cycleData) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-10">
        <p>Cargando detalles del ciclo...</p>
      </div>
    );
  }


  return (
    <div className="relative flex flex-col">
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
        isDeletingCycle={false}
        dateEditorDeleteDescription={
          cycleRangeLabel
            ? `Se eliminará este ciclo y todos sus registros.`
            : 'Se eliminará este ciclo y todos sus registros.'
        }
      />
      <ArchivedCycleDeleteDialog
        isOpen={showCycleDeleteDialog}
        cycle={cycleData}
        onClose={resetDeleteDialogs}
        onDeleteSimple={deleteCycle}
        onDeleteWithStrategy={deleteArchivedCycleWithStrategy}
        previewDeleteCycle={previewDeleteCycle}
        getPublicError={getPublicError}
        onDeleted={() => navigate('/archived-cycles')}
      />
      
    </div>
  );
};

export default CycleDetailPage;