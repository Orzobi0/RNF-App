import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Edit, Trash2, BarChart3 } from 'lucide-react';
import { differenceInDays, startOfDay, parseISO, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

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
    forceUpdateCycleStart
  } = useCycleData();
  const { toast } = useToast();

  const [cycleData, setCycleData] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCycleDeleteDialog, setShowCycleDeleteDialog] = useState(false);
  const [showCycleActions, setShowCycleActions] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
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
        setCycleData(fetchedCycle);
      } else {
        toast({ title: 'Error', description: 'No se pudo cargar el ciclo.', variant: 'destructive' });
        navigate('/archived-cycles');
      }
    };

    loadCycle();
  }, [cycleId, user, getCycleById, toast, navigate]);

  useEffect(() => {
    if (cycleData) {
      setDraftStartDate(cycleData.startDate || '');
      setDraftEndDate(cycleData.endDate || '');
    }
  }, [cycleData]);

  const addOrUpdateDataPointForCycle = async (newData, { keepFormOpen = false } = {}) => {
    if (!cycleData || !user) return;
    const wasEditing = Boolean(editingRecord);
    setIsProcessing(true);

    try {
      await addOrUpdateDataPoint(newData, editingRecord, cycleData.id);
      const updatedCycle = await getCycleById(cycleData.id);
      if (updatedCycle) {
        saveCycleDataToLocalStorage(updatedCycle);
        setCycleData(updatedCycle);
      }

      toast({
        title: wasEditing ? 'Registro actualizado' : 'Nuevo registro añadido',
        description: 'Datos para el ciclo actualizados.'
      });
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
      }
    } catch (error) {
      console.error('Error adding/updating data point:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el registro.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteRecordForCycle = async (recordId) => {
    if (!cycleData || !user) return;
    setIsProcessing(true);

    try {
      await deleteRecord(recordId, cycleData.id);
      const updatedCycle = await getCycleById(cycleData.id);
      if (updatedCycle) {
        saveCycleDataToLocalStorage(updatedCycle);
        setCycleData(updatedCycle);
      }
      toast({ title: 'Registro eliminado', description: 'El registro ha sido eliminado.' });
    } catch (error) {
      console.error('Error deleting record:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el registro.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateCycleDatesForCycle = async ({ startDate, endDate, force }) => {
    if (!cycleData || !user) return false;
    setIsProcessing(true);

    try {
      if (force) {
        await forceUpdateCycleStart(cycleData.id, startDate);
        if (endDate !== undefined) {
          await updateCycleDates(cycleData.id, undefined, endDate);
        }
      } else {
        await updateCycleDates(cycleData.id, startDate, endDate);
      }
      const updated = await getCycleById(cycleData.id);
      if (updated) {
        saveCycleDataToLocalStorage(updated);
        setCycleData(updated);
      }
      toast({ title: 'Fechas actualizadas', description: 'Las fechas del ciclo han sido modificadas.' });
      return true;
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudieron actualizar las fechas.', variant: 'destructive' });
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCycleRequest = () => {
    if (!cycleData) return;
    setShowCycleDeleteDialog(true);
  };

  const handleConfirmDeleteCycle = async () => {
    if (!cycleData || !user) return;
    setIsProcessing(true);
    try {
      await deleteCycle(cycleData.id);
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      navigate('/archived-cycles');
      setShowCycleDeleteDialog(false);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudo eliminar el ciclo.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleActions = () => {
    if (!showCycleActions && cycleData) {
      setDraftStartDate(cycleData.startDate || '');
      setDraftEndDate(cycleData.endDate || '');
      setDateError('');
    }
    setShowCycleActions((prev) => !prev);
  };

  const handleCancelEdit = () => {
    if (cycleData) {
      setDraftStartDate(cycleData.startDate || '');
      setDraftEndDate(cycleData.endDate || '');
    }
    setDateError('');
    setShowCycleActions(false);
  };

  const performUpdate = async (payload) => {
    const success = await updateCycleDatesForCycle(payload);
    if (success) {
      setShowCycleActions(false);
      setDateError('');
    }
  };

  const handleSaveDates = async () => {
    if (!draftStartDate) {
      setDateError('La fecha de inicio es obligatoria');
      return;
    }
    if (draftEndDate && draftEndDate < draftStartDate) {
      setDateError('La fecha de fin no puede ser anterior al inicio');
      return;
    }
    setDateError('');

    const payload = {
      startDate: draftStartDate,
      endDate: draftEndDate || undefined
    };

    if (checkCycleOverlap && cycleData?.id && draftStartDate) {
      const overlap = await checkCycleOverlap(cycleData.id, draftStartDate);
      if (overlap) {
        setPendingPayload(payload);
        setOverlapCycle(overlap);
        setShowOverlapDialog(true);
        return;
      }
    }

    await performUpdate(payload);
  };

  const handleConfirmOverlap = async () => {
    if (pendingPayload) {
      await performUpdate({ ...pendingPayload, force: true });
    }
    setShowOverlapDialog(false);
    setPendingPayload(null);
    setOverlapCycle(null);
  };

  const handleCancelOverlap = () => {
    setShowOverlapDialog(false);
    setPendingPayload(null);
    setOverlapCycle(null);
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleAddRecord = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const handleDeleteRequest = (recordId) => {
    if (!cycleData) return;
    const record = (cycleData.data || []).find((entry) => entry.id === recordId);
    setRecordToDelete(record || null);
  };

  const confirmDeleteRecord = () => {
    if (recordToDelete) {
      deleteRecordForCycle(recordToDelete.id);
    }
  };

  if ((cycleDataHookIsLoading && !cycleData) || !cycleData) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 px-4 py-8 text-center text-pink-600">
        <p>Cargando detalles del ciclo...</p>
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
      <div className="relative z-10 px-4 py-6">
        <div className="w-full max-w-4xl mx-auto">
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Button
                asChild
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
              >
                <Link to="/archived-cycles">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Mis Ciclos
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="icon"
                className="border-pink-300 text-pink-600 hover:bg-pink-50 hover:border-pink-400"
              >
                <Link to={`/chart/${cycleData.id}`} aria-label="Ver gráfica del ciclo">
                  <BarChart3 className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                onClick={handleAddRecord}
                size="icon"
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow"
                aria-label="Añadir registro al ciclo"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={handleToggleActions}
                className={`text-2xl sm:text-3xl font-bold text-rose-700 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 ${showCycleActions ? 'text-rose-700 underline underline-offset-4 decoration-rose-400' : 'hover:text-rose-600 hover:underline hover:underline-offset-4'}`}
              >
                Detalle de ciclo ({format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} -{' '}
                {cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'})
              </button>
            </div>
          </div>

          {showCycleActions && (
            <div className="mb-6 mx-auto w-full max-w-xl">
              <CycleDatesEditor
                cycle={cycleData}
                startDate={draftStartDate}
                endDate={draftEndDate}
                onStartDateChange={(value) => setDraftStartDate(value)}
                onEndDateChange={(value) => setDraftEndDate(value)}
                onSave={handleSaveDates}
                onCancel={handleCancelEdit}
                isProcessing={isProcessing}
                dateError={dateError}
                includeEndDate
                showOverlapDialog={showOverlapDialog}
                overlapCycle={overlapCycle}
                onConfirmOverlap={handleConfirmOverlap}
                onCancelOverlap={handleCancelOverlap}
                onClearError={() => setDateError('')}
                className="w-full mb-4"
              />
              <div className="rounded-2xl border border-rose-100 bg-white/90 p-5 shadow-lg">
                <h3 className="text-lg font-semibold text-rose-700 mb-2">Eliminar ciclo</h3>
                <p className="text-sm text-slate-600 mb-3">
                  Esta acción no se puede deshacer. Se eliminarán todos los registros asociados.
                </p>
                <Button
                  onClick={handleDeleteCycleRequest}
                  disabled={isProcessing}
                  className="w-full sm:w-auto bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar ciclo
                </Button>
              </div>
            </div>
          )}


          <RecordsList
            records={cycleData.data}
            onEdit={handleEditRecord}
            onDelete={handleDeleteRequest}
            isProcessing={isProcessing}
          />

          <Dialog
            open={showForm}
            onOpenChange={(open) => {
              if (!open) {
                setShowForm(false);
                setEditingRecord(null);
              }
                          }}
          >
            <DialogContent
              hideClose
              className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
            >
               <DataEntryForm
                onSubmit={addOrUpdateDataPointForCycle}
                initialData={editingRecord}
                onCancel={() => {
                  setShowForm(false);
                  setEditingRecord(null);
                }}
                cycleStartDate={cycleData.startDate}
                cycleEndDate={cycleData.endDate}
                isProcessing={isProcessing}
                isEditing={Boolean(editingRecord)}
                cycleData={cycleData.data}
              />
              </DialogContent>
          </Dialog>

          <DeletionDialog
            isOpen={!!recordToDelete}
            onClose={() => setRecordToDelete(null)}
            onConfirm={confirmDeleteRecord}
            title="Eliminar registro"
            confirmLabel="Eliminar registro"
            description={
              recordToDelete
                ? `¿Estás seguro de que quieres eliminar el registro del ${format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy')}? Esta acción no se puede deshacer.`
                : ''
            }
            isProcessing={isProcessing}
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
            isProcessing={isProcessing}
          />
          <OverlapWarningDialog
            isOpen={showOverlapDialog}
            conflictCycle={overlapCycle}
            onCancel={handleCancelOverlap}
            onConfirm={handleConfirmOverlap}
          />
        </div>
      </div>
    </div>
  );
};

export default CycleDetailPage;