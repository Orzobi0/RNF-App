import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
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
  const [showCycleActions, setShowCycleActions] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);

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

  const addOrUpdateDataPointForCycle = async (newData) => {
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
      setShowForm(false);
      setEditingRecord(null);
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

  const handleDeleteCycle = async () => {
    if (!cycleData || !user) return;
    if (!window.confirm('¿Eliminar este ciclo?')) {
      return;
    }
    setIsProcessing(true);
    try {
      await deleteCycle(cycleData.id);
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      navigate('/archived-cycles');
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

  const handleSaveDates = async (event) => {
    event.preventDefault();
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
    return <div className="text-center text-slate-300 p-8">Cargando detalles del ciclo...</div>;
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
            <div className="flex items-center justify-between gap-2 mb-2">
              <Button
                asChild
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
              >
                <Link to="/archived-cycles">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Mis Ciclos
                </Link>
              </Button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={handleToggleActions}
                className={`text-2xl sm:text-3xl font-bold px-4 py-3 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 ${showCycleActions ? 'bg-rose-200/80 text-rose-700 shadow-inner' : 'bg-rose-100/60 hover:bg-rose-200/70 text-rose-700'}`}
              >
                Detalle de ciclo ({format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} -{' '}
                {cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'})
              </button>
            </div>
          </div>

          {showCycleActions && (
            <div className="mb-6 mx-auto w-full max-w-xl rounded-2xl border border-rose-100 bg-white/90 p-5 shadow-lg">
              <form onSubmit={handleSaveDates} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-rose-700 mb-1">Editar fechas del ciclo</h2>
                  <p className="text-sm text-slate-600 mb-3">
                    Actualiza las fechas de inicio y fin del ciclo. Guarda los cambios cuando termines.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col text-sm text-slate-700">
                      Inicio del ciclo
                      <input
                        type="date"
                        value={draftStartDate}
                        onChange={(event) => setDraftStartDate(event.target.value)}
                        className="mt-1 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      />
                    </label>
                    <label className="flex flex-col text-sm text-slate-700">
                      Fin del ciclo
                      <input
                        type="date"
                        value={draftEndDate || ''}
                        onChange={(event) => setDraftEndDate(event.target.value)}
                        className="mt-1 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      />
                    </label>
                  </div>
                  {dateError && <p className="mt-2 text-sm text-red-500">{dateError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelEdit}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                      disabled={isProcessing}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
                      disabled={isProcessing}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              </form>
              <div className="mt-6 border-t border-rose-100 pt-4">
                <h3 className="text-lg font-semibold text-rose-700 mb-2">Eliminar ciclo</h3>
                <p className="text-sm text-slate-600 mb-3">
                  Esta acción no se puede deshacer. Se eliminarán todos los registros asociados.
                </p>
                <Button variant="destructive" onClick={handleDeleteCycle} disabled={isProcessing} className="w-full sm:w-auto">
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar ciclo
                </Button>
              </div>
            </div>
          )}

          <div className="mb-4 flex justify-center gap-4">
            <Button
              asChild
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
              disabled={isProcessing}
            >
              <Link to={`/chart/${cycleData.id}`}>
                <BarChart3 className="mr-2 h-4 w-4" /> Gráfica
              </Link>
            </Button>
            <Button
              onClick={handleAddRecord}
              className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
              style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
              disabled={isProcessing}
            >
              <Edit className="mr-2 h-4 w-4" /> Añadir registro en este ciclo
            </Button>
          </div>

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
            recordDate={recordToDelete ? format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy') : ''}
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