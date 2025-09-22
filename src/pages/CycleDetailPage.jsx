import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import FertilityChart from '@/components/FertilityChart';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';
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
      onEditCycleDates,
      onDeleteCycle
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
                <div className="flex gap-2">
                  <Button onClick={onEditCycleDates} className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600">
                    <Edit className="mr-2 h-4 w-4" /> Editar Fechas
                  </Button>
                  <Button variant="destructive" onClick={onDeleteCycle}>
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar Ciclo
                  </Button>
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-center">
                Detalle de ciclo ({format(parseISO(cycleData.startDate), 'dd/MM/yyyy')} - {cycleData.endDate ? format(parseISO(cycleData.endDate), 'dd/MM/yyyy') : 'En curso'})
              </h1>
            </div>
          )}

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
      const [showEditDialog, setShowEditDialog] = useState(false);
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
        if (!cycleData || !user) return;
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
          setShowEditDialog(false);
        } catch (e) {
          console.error(e);
        }
        setIsProcessing(false);
      };
      const handleDeleteCycle = async () => {
        if (!cycleData || !user) return;
        if (window.confirm('¿Eliminar este ciclo?')) {
          setIsProcessing(true);
          try {
            await deleteCycle(cycleData.id);
            toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
            navigate('/archived-cycles');
          } catch (e) {
            console.error(e);
          }
          setIsProcessing(false);
        }
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
              onEditCycleDates={() => setShowEditDialog(true)}
              onDeleteCycle={handleDeleteCycle}
            />
            <EditCycleDatesDialog
              isOpen={showEditDialog}
              onClose={() => setShowEditDialog(false)}
              onConfirm={updateCycleDatesForCycle}
              initialStartDate={cycleData.startDate}
              initialEndDate={cycleData.endDate}
              cycleId={cycleData.id}
              checkOverlap={checkCycleOverlap}
            />
          </div>
        </div>    
      );
    };

    export default CycleDetailPage;