import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import FertilityChart from '@/components/FertilityChart';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Edit, Trash2, Maximize, X, Eye, EyeOff, RotateCcw, BarChart3 } from 'lucide-react';
import { format, differenceInDays, startOfDay, parseISO } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { useFullScreen } from '@/hooks/useFullScreen';
import { useAuth } from '@/contexts/AuthContext';

    // Mantener un ancho manejable en horizontal para ciclos largos
    const CYCLE_DURATION_DAYS = 28;
    const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;

    const CycleDetailContent = ({
      cycleData,
      addOrUpdateDataPointForCycle,
      deleteRecordForCycle,
      toggleIgnoreRecordForCycle,
      isFullScreen,
      toggleFullScreen,
      orientation,
      rotateScreen,
      showInterpretation,
      setShowInterpretation,
      onToggleInterpretation,
      chartDisplayData,
      showForm, setShowForm,
      editingRecord, setEditingRecord,
      recordToDelete, setRecordToDelete,
      isProcessing,
      toast,
      onUpdateCycleDates,
      onDeleteCycle,
      checkOverlap,
      cycleId
}) => {


      const visibleDays = orientation === 'portrait'
        ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
        : CYCLE_DURATION_DAYS;

      const handleEdit = (record) => {
        const openForm = () => {
          setEditingRecord(record);
          setShowForm(true);
        };

        if (isFullScreen) {
          toggleFullScreen();
          setTimeout(openForm, 300);
        } else {
          openForm();
        }

      };

      const handleDeleteRequest = (recordId) => {
        const record = cycleData.data.find(r => r.id === recordId);
        setRecordToDelete(record);
      };

      const confirmDelete = () => {
        if (recordToDelete) {
          deleteRecordForCycle(recordToDelete.id);
        }
      };
      const [showChart, setShowChart] = useState(false);
      useEffect(() => {
        if (!isFullScreen && showChart) {
          setShowChart(false);
        }
      }, [isFullScreen, showChart]);
      const [showCycleActions, setShowCycleActions] = useState(false);
      const [draftStartDate, setDraftStartDate] = useState(cycleData.startDate || '');
      const [draftEndDate, setDraftEndDate] = useState(cycleData.endDate || '');
      const [dateError, setDateError] = useState('');
      const [showOverlapDialog, setShowOverlapDialog] = useState(false);
      const [pendingPayload, setPendingPayload] = useState(null);
      const [overlapCycle, setOverlapCycle] = useState(null);

      useEffect(() => {
        setDraftStartDate(cycleData.startDate || '');
        setDraftEndDate(cycleData.endDate || '');
      }, [cycleData.startDate, cycleData.endDate]);

      const handleToggleActions = () => {
        if (!showCycleActions) {
          setDraftStartDate(cycleData.startDate || '');
          setDraftEndDate(cycleData.endDate || '');
          setDateError('');
        }
        setShowCycleActions((prev) => !prev);
      };

      const handleCancelEdit = () => {
        setDraftStartDate(cycleData.startDate || '');
        setDraftEndDate(cycleData.endDate || '');
        setDateError('');
        setShowCycleActions(false);
      };

      const performUpdate = async (payload) => {
        const success = await onUpdateCycleDates(payload);
        if (success) {
          setShowCycleActions(false);
          setDateError('');
        }
      };

      const handleSaveDates = async (e) => {
        e.preventDefault();
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
          endDate: draftEndDate || undefined,
        };

        if (checkOverlap && cycleId && draftStartDate) {
          const overlap = await checkOverlap(cycleId, draftStartDate);
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

      const handleDelete = () => {
        if (window.confirm('¿Eliminar este ciclo?')) {
          onDeleteCycle();
          setShowCycleActions(false);
        }
      };

      return (
        <div className={`w-full ${isFullScreen ? 'h-full overflow-hidden' : 'max-w-4xl mx-auto'}`}>
          {!isFullScreen && (
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
                  Detalle de ciclo ({format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} - {cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'})
                </button>
              </div>
            </div>
          )}

          {showCycleActions && !isFullScreen && (
            <div className="mb-6 mx-auto w-full max-w-xl rounded-2xl border border-rose-100 bg-white/90 p-5 shadow-lg">
              <form onSubmit={handleSaveDates} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-rose-700 mb-1">Editar fechas del ciclo</h2>
                  <p className="text-sm text-slate-600 mb-3">Actualiza las fechas de inicio y fin del ciclo. Guarda los cambios cuando termines.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col text-sm text-slate-700">
                      Inicio del ciclo
                      <input
                        type="date"
                        value={draftStartDate}
                        onChange={(e) => setDraftStartDate(e.target.value)}
                        className="mt-1 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      />
                    </label>
                    <label className="flex flex-col text-sm text-slate-700">
                      Fin del ciclo
                      <input
                        type="date"
                        value={draftEndDate || ''}
                        onChange={(e) => setDraftEndDate(e.target.value)}
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
                <p className="text-sm text-slate-600 mb-3">Esta acción no se puede deshacer. Se eliminarán todos los registros asociados.</p>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isProcessing}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar ciclo
                </Button>
              </div>
             </div>
          )}
          <OverlapWarningDialog
            isOpen={showOverlapDialog}
            conflictCycle={overlapCycle}
            onCancel={handleCancelOverlap}
            onConfirm={handleConfirmOverlap}
          />

          {!showForm && !showChart && !isFullScreen && (
            <div className="mb-4 flex justify-center gap-4">
              <Button
                onClick={() => { setShowChart(true); toggleFullScreen(); }}
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
              >
                <BarChart3 className="mr-2 h-4 w-4" /> Gráfica
              </Button>
              <Button
                onClick={() => { setEditingRecord(null); setShowForm(true); }}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
                style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
                disabled={isProcessing}
              >
                <Edit className="mr-2 h-4 w-4" /> Añadir registro en este ciclo
              </Button>
            </div>
          )}

          {!showForm && (showChart || isFullScreen) && (
            <div
              className={
                isFullScreen
                  ? 'fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-x-auto overflow-y-auto'
                  : 'p-4 sm:p-6 mb-4 bg-white/70 backdrop-blur-md ring-1 ring-[#FFB1DD]/50 shadow-2xl rounded-xl relative'
              }
              style={
                isFullScreen
                  ? { background: 'linear-gradient(135deg, #FFFAFC 0%, #f7eaef 100%)' }
                  : { boxShadow: '0 4px 8px rgba(0,0,0,0.04)' }
              }
            >
              {!isFullScreen && (
                <h2 className="text-xl font-medium text-slate-700 mb-4 bg-white bg-opacity-90 px-4 py-2 rounded-md">
                  Gráfica
                </h2>
              )}
              <FertilityChart
                data={chartDisplayData}
                isFullScreen={isFullScreen}
                orientation={orientation}
                onToggleIgnore={toggleIgnoreRecordForCycle}
                onEdit={handleEdit}
                cycleId={cycleData.id}
                showInterpretation={showInterpretation}
                visibleDays={visibleDays}
                reduceMotion={true}
                forceLandscape={orientation === 'landscape'}
              />
              <Button
                  onClick={onToggleInterpretation}
                  onTouchEnd={onToggleInterpretation}
                  variant="ghost"
                  size="sm"
                  className={`absolute ${isFullScreen ? 'top-4 right-20' : 'top-2 right-20'} flex items-center font-semibold py-1 px-2 rounded-lg transition-colors ${showInterpretation ? 'bg-[#E27DBF] text-white hover:bg-[#d46ab3]' : 'bg-transparent text-slate-700 hover:bg-[#E27DBF]/20'}`}
                >
                {showInterpretation ? (
                  <EyeOff className="mr-2 h-4 w-4" />
                ) : (
                <Eye className="mr-2 h-4 w-4" />
                )}
                {showInterpretation ? 'Ocultar' : 'Interpretar'}
              </Button>
              <Button
                onClick={rotateScreen}
                variant="ghost"
                size="icon"
                className={`absolute ${isFullScreen ? 'top-4 right-12 text-white bg-slate-700/50 hover:bg-slate-600/70' : 'top-2 right-12 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                title="Cambiar orientación"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
              <Button
                onClick={() => {
                  if (isFullScreen) {
                    toggleFullScreen();
                    setShowChart(false);
                  } else {
                    toggleFullScreen();
                  }
                }}
                variant="ghost"
                size="icon"
                className={`absolute ${isFullScreen ? 'top-4 right-4 text-white bg-slate-700/50 hover:bg-slate-600/70' : 'top-2 right-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                title={isFullScreen ? 'Salir de Pantalla Completa' : 'Ver en Pantalla Completa'}
              >
                {isFullScreen ? <X className="h-6 w-6" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          )}

          {!isFullScreen && (
            <>
 
              <RecordsList
                records={cycleData.data}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
                isArchiveView={true}
                isProcessing={isProcessing}
              />
              <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingRecord(null); } }}>
                <DialogContent
                  hideClose
                  className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
                >
                  <DataEntryForm
                    onSubmit={addOrUpdateDataPointForCycle}
                    initialData={editingRecord}
                    onCancel={() => { setShowForm(false); setEditingRecord(null); }}
                    cycleStartDate={cycleData.startDate}
                    cycleEndDate={cycleData.endDate}
                    isProcessing={isProcessing}
                    isEditing={Boolean(editingRecord)}
                    cycleData={cycleData.data}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}

          <DeletionDialog
            isOpen={!!recordToDelete}
            onClose={() => setRecordToDelete(null)}
            onConfirm={confirmDelete}
            recordDate={recordToDelete ? format(parseISO(recordToDelete.isoDate), "dd/MM/yyyy") : ''}
            isProcessing={isProcessing}
          />
        </div>
      );
    }


    const CycleDetailPage = () => {
      const { cycleId } = useParams();
      const navigate = useNavigate();
      const { user } = useAuth();
  const {
    getCycleById,
    isLoading: cycleDataHookIsLoading,
    addOrUpdateDataPoint,
    deleteRecord,
    toggleIgnoreRecord,
    updateCycleDates,
    deleteCycle,
    checkCycleOverlap,
    forceUpdateCycleStart
  } = useCycleData();
      const [cycleData, setCycleData] = useState(null);
      const { toast } = useToast();
      const [editingRecord, setEditingRecord] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [recordToDelete, setRecordToDelete] = useState(null);
      const { isFullScreen, toggleFullScreen, orientation, rotateScreen } = useFullScreen();
      const [isProcessing, setIsProcessing] = useState(false);
      const [showInterpretation, setShowInterpretation] = useState(false);
      const handleToggleInterpretation = (e) => {
        e.preventDefault();
        setShowInterpretation((v) => !v);
      };

  useEffect(() => {
    const loadCycle = async () => {
      if (user) {
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
          toast({ title: "Error", description: "No se pudo cargar el ciclo.", variant: "destructive" });
          navigate('/archived-cycles');
        }
      }
    };

    loadCycle();
  }, [cycleId, user, getCycleById, toast, navigate]);

  const generateCycleDaysForRecord = (recordIsoDate, cycleStartIsoDate) => {
    const rDate = startOfDay(parseISO(recordIsoDate));
    const sDate = startOfDay(parseISO(cycleStartIsoDate));
    return differenceInDays(rDate, sDate) + 1;
  };

      const processDataWithCycleDays = (data, cycleStartIsoDate) => {
        if (!data || !Array.isArray(data) || !cycleStartIsoDate) return [];
        const sortedData = [...data].sort((a, b) => parseISO(a.isoDate) - parseISO(b.isoDate));
        return sortedData.map(d => ({
          ...d,
          ignored: d.ignored || false,
          cycleDay: generateCycleDaysForRecord(d.isoDate, cycleStartIsoDate)
        }));
      };
      
      const saveCycleDataToLocalStorage = (updatedCycle) => {
        if (!user || !updatedCycle || !updatedCycle.id) return;
        const cycleToStore = {
          ...updatedCycle,
          data: updatedCycle.data.map(({cycleDay, ...rest}) => rest)
        };
        localStorage.setItem(`fertilityData_cycle_${user.uid}_${updatedCycle.id}`, JSON.stringify(cycleToStore));
      };


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
            title: wasEditing ? "Registro actualizado" : "Nuevo registro añadido",
            description: `Datos para el ciclo actualizados.`,
          });
          setShowForm(false);
          setEditingRecord(null);
        } catch (error) {
          console.error('Error adding/updating data point:', error);
          toast({
            title: 'Error',
            description: 'No se pudo guardar el registro.',
            variant: 'destructive',
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

          toast({
            title: "Registro eliminado",
            description: `El registro ha sido eliminado del ciclo.`,
            variant: "destructive",
          });
        } catch (error) {
          console.error('Error deleting record:', error);
          toast({
            title: 'Error',
            description: 'No se pudo eliminar el registro.',
            variant: 'destructive',
          });
        } finally {
          setRecordToDelete(null);
          setIsProcessing(false);
        }
      };

      const toggleIgnoreRecordForCycle = (cId, recordId) => {
        if (!cycleData || !user || cycleData.id !== cId) return;
        setIsProcessing(true);
        toggleIgnoreRecord(cId, recordId);
        
        setCycleData(prev => {
          if (!prev) return null;
          const updatedRecords = prev.data.map(record => {
            if (record.id === recordId) {
              return { ...record, ignored: !record.ignored };
            }
            return record;
          });
          const processedData = processDataWithCycleDays(updatedRecords, prev.startDate);
          const updatedCycle = { ...prev, data: processedData };
          saveCycleDataToLocalStorage(updatedCycle);
          return updatedCycle;
        });

        const record = cycleData.data.find(r => r.id === recordId);
        toast({
            title: `Registro ${record && !record.ignored ? "despreciado" : "restaurado"}`,
            description: `El registro del ${record ? format(parseISO(record.isoDate), "dd/MM/yyyy") : ""} ha sido ${record && !record.ignored ? "marcado como despreciado" : "restaurado"}.`,
        });
        setIsProcessing(false);
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
        } catch (e) {
          console.error(e);
          return false;
        } finally {
          setIsProcessing(false);
        }
      };
      const handleDeleteCycle = async () => {
        if (!cycleData || !user) return;
        setIsProcessing(true);
        try {
          await deleteCycle(cycleData.id);
          toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
          navigate('/archived-cycles');
        } catch (e) {
          console.error(e);
        }
        setIsProcessing(false);
      };

      const getChartDisplayData = useCallback(() => {
        if (!cycleData || !cycleData.startDate) return [];
        
        const cycleStartDate = parseISO(cycleData.startDate);
        const lastRecordDate = cycleData.data.reduce((maxDate, record) => {
          const recDate = parseISO(record.isoDate);
          return recDate > maxDate ? recDate : maxDate;
        }, cycleStartDate);

        const cycleEndDate = cycleData.endDate ? parseISO(cycleData.endDate) : null;
        let daysInCycle;
        if (cycleEndDate) {
          daysInCycle = differenceInDays(startOfDay(cycleEndDate), cycleStartDate) + 1;
        } else {
          const today = startOfDay(new Date());
          const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
          const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
          daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);
        }


        const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);

        const mergedData = fullCyclePlaceholders.map(placeholder => {
            const existingRecord = cycleData.data.find(d => d.isoDate === placeholder.isoDate);
            return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
        });
        return mergedData;

      }, [cycleData]);

      if ((cycleDataHookIsLoading && !cycleData) || !cycleData) {
        return <div className="text-center text-slate-300 p-8">Cargando detalles del ciclo...</div>;
      }

      const chartDisplayData = getChartDisplayData();

      return (
        <div className={`min-h-[100dvh] ${isFullScreen ? '' : 'bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative'}`}>
          {!isFullScreen && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
              }}
            />
          )}
          <div className={`${isFullScreen ? '' : 'relative z-10 px-4 py-6'}`}>
            <CycleDetailContent
              cycleData={cycleData}
              addOrUpdateDataPointForCycle={addOrUpdateDataPointForCycle}
              deleteRecordForCycle={deleteRecordForCycle}
              toggleIgnoreRecordForCycle={toggleIgnoreRecordForCycle}
              isFullScreen={isFullScreen}
              toggleFullScreen={toggleFullScreen}
              orientation={orientation}
              rotateScreen={rotateScreen}
              showInterpretation={showInterpretation}
              setShowInterpretation={setShowInterpretation}
              onToggleInterpretation={handleToggleInterpretation}
              chartDisplayData={chartDisplayData}
              showForm={showForm} setShowForm={setShowForm}
              editingRecord={editingRecord} setEditingRecord={setEditingRecord}
              recordToDelete={recordToDelete} setRecordToDelete={setRecordToDelete}
              isProcessing={isProcessing}
              toast={toast}
              onUpdateCycleDates={updateCycleDatesForCycle}
              onDeleteCycle={handleDeleteCycle}
              checkOverlap={checkCycleOverlap}
              cycleId={cycleData.id}
            />
          </div>
        </div>
      );
    };

    export default CycleDetailPage;