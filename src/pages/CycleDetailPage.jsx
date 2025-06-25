import React, { useState, useEffect, useCallback } from 'react';
    import { useParams, Link, useNavigate } from 'react-router-dom';
    import FertilityChart from '@/components/FertilityChart';
    import RecordsList from '@/components/RecordsList';
    import DataEntryForm from '@/components/DataEntryForm';
    import DeletionDialog from '@/components/DeletionDialog';
    import { useCycleData } from '@/hooks/useCycleData';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { ArrowLeft, Edit, Trash2, Maximize, X } from 'lucide-react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { format, differenceInDays, startOfDay, parseISO } from 'date-fns';
    import generatePlaceholders from '@/lib/generatePlaceholders';
    import { useFullScreen } from '@/hooks/useFullScreen';
    import { useAuth } from '@/contexts/AuthContext';

    const CYCLE_DURATION_DAYS = 30;

    const CycleDetailContent = ({
      cycleData,
      addOrUpdateDataPointForCycle,
      deleteRecordForCycle,
      toggleIgnoreRecordForCycle,
      isFullScreen,
      toggleFullScreen,
      chartDisplayData,
      showForm, setShowForm,
      editingRecord, setEditingRecord,
      recordToDelete, setRecordToDelete,
      isProcessing,
      toast
    }) => {

      const handleEdit = (record) => {
        setEditingRecord(record);
        setShowForm(true);
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

      return (
        <div className={`w-full ${isFullScreen ? 'h-full overflow-hidden' : 'max-w-4xl mx-auto'}`}>
          <motion.div 
            className="flex items-center justify-between mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {!isFullScreen && (
              <Button variant="outline" asChild className="border-slate-600 hover:bg-slate-700 text-slate-300">
                <Link to="/archived-cycles">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Mis Ciclos
                </Link>
              </Button>
            )}
            {!isFullScreen && (
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 text-center">
                Detalle del Ciclo ({format(parseISO(cycleData.startDate), "dd/MM/yyyy")})
              </h1>
            )}
             <div className={isFullScreen ? 'hidden' : ''}></div>
          </motion.div>

          <AnimatePresence>
            {(!showForm) && (chartDisplayData.length > 0 || isFullScreen) && (
              <motion.div
                initial={{ opacity: 0, scale: isFullScreen ? 1 : 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: isFullScreen ? 1 : 0.9 }}
                transition={{ duration: 0.5 }}
                className={`backdrop-blur-lg shadow-2xl rounded-xl ${isFullScreen ? 'w-full h-full p-0 fixed inset-0 z-50' : 'p-4 sm:p-6 mb-8 bg-[#FFF5F9]'}`}
                style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.04)' }}
              >
                {!isFullScreen && (
                  <h2 className="text-xl font-medium text-[#393C65] mb-4 bg-white bg-opacity-90 px-4 py-2 rounded-md">
                    Gráfica
                  </h2>
                )}
                <FertilityChart
                  data={chartDisplayData}
                  isFullScreen={isFullScreen}
                  onToggleIgnore={toggleIgnoreRecordForCycle}
                  cycleId={cycleData.id}
                />
                <Button
                  onClick={toggleFullScreen}
                  variant="ghost"
                  size="icon"
                  className={`absolute ${isFullScreen ? 'top-4 right-4 text-white bg-slate-700/50 hover:bg-slate-600/70' : 'top-2 right-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                >
                  {isFullScreen ? <X className="h-6 w-6" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {!isFullScreen && (
            <>
              <AnimatePresence>
                {showForm && (
                  <motion.div
                    key="data-entry-form-detail"
                    initial={{ opacity: 0, y: 20, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: 20, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden mb-8"
                  >
                    <DataEntryForm 
                      onSubmit={addOrUpdateDataPointForCycle} 
                      initialData={editingRecord} 
                      onCancel={() => { setShowForm(false); setEditingRecord(null); }}
                      cycleStartDate={cycleData.startDate}
                      isProcessing={isProcessing}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {!showForm && (
                <div className="my-8">
                  <Button
                    onClick={() => { setEditingRecord(null); setShowForm(true); }}
                    className="w-full sm:w-auto bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center text-lg"
                    disabled={isProcessing}
                  >
                    <Edit className="mr-2 h-5 w-5" /> Añadir/Editar Registro en este Ciclo
                  </Button>
                </div>
              )}
              
              <RecordsList 
                records={cycleData.data} 
                onEdit={handleEdit} 
                onDelete={handleDeleteRequest}
                isArchiveView={true}
                isProcessing={isProcessing}
              />
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
      const { getCycleById, isLoading: cycleDataHookIsLoading, refreshData, toggleIgnoreRecord } = useCycleData(cycleId);
      const [cycleData, setCycleData] = useState(null);
      const { toast } = useToast();
      const [editingRecord, setEditingRecord] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [recordToDelete, setRecordToDelete] = useState(null);
      const { isFullScreen, toggleFullScreen } = useFullScreen();
      const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadCycle = async () => {
      if (user) {
        let fetchedCycle = await getCycleById(cycleId);

        if (!fetchedCycle) {
          const localData = localStorage.getItem(`fertilityData_cycle_${user.id}_${cycleId}`);
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
        localStorage.setItem(`fertilityData_cycle_${user.id}_${updatedCycle.id}`, JSON.stringify(cycleToStore));
      };


      const addOrUpdateDataPointForCycle = (newData) => {
        if (!cycleData || !user) return;
        setIsProcessing(true);
        
        let updatedDataArray;
        const recordWithCycleDay = {
          ...newData,
          isoDate: format(startOfDay(parseISO(newData.isoDate)), "yyyy-MM-dd"),
          cycleDay: generateCycleDaysForRecord(newData.isoDate, cycleData.startDate),
          ignored: editingRecord ? editingRecord.ignored : (newData.ignored || false)
        };

        if (editingRecord) {
          updatedDataArray = cycleData.data.map(item => item.id === editingRecord.id ? { ...item, ...recordWithCycleDay, id: editingRecord.id } : item);
        } else {
          const newEntry = { ...recordWithCycleDay, id: crypto.randomUUID() };
          updatedDataArray = [...cycleData.data, newEntry];
        }
        
        const processedData = processDataWithCycleDays(updatedDataArray, cycleData.startDate);
        const updatedCycle = { ...cycleData, data: processedData };
        
        saveCycleDataToLocalStorage(updatedCycle);
        setCycleData(updatedCycle);

        toast({
          title: editingRecord ? "Registro actualizado" : "Nuevo registro añadido",
          description: `Datos para el ciclo actualizados.`,
        });
        setShowForm(false);
        setEditingRecord(null);
        setIsProcessing(false);
        refreshData(); 
      };

      const deleteRecordForCycle = (recordId) => {
        if (!cycleData || !user) return;
        setIsProcessing(true);
        const updatedDataArray = cycleData.data.filter(item => item.id !== recordId);
        const processedData = processDataWithCycleDays(updatedDataArray, cycleData.startDate);
        
        const updatedCycle = { ...cycleData, data: processedData };
        saveCycleDataToLocalStorage(updatedCycle);
        setCycleData(updatedCycle);
        
        toast({
          title: "Registro eliminado",
          description: `El registro ha sido eliminado del ciclo.`,
          variant: "destructive",
        });
        setRecordToDelete(null);
        setIsProcessing(false);
        refreshData();
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

      const getChartDisplayData = useCallback(() => {
        if (!cycleData || !cycleData.startDate) return [];
        
        const cycleStartDate = parseISO(cycleData.startDate);
        const lastRecordDate = cycleData.data.reduce((maxDate, record) => {
          const recDate = parseISO(record.isoDate);
          return recDate > maxDate ? recDate : maxDate;
        }, cycleStartDate);

        const today = startOfDay(new Date());
        const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
        const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
        const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

        const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);

        const mergedData = fullCyclePlaceholders.map(placeholder => {
            const existingRecord = cycleData.data.find(d => d.isoDate === placeholder.isoDate);
            return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
        });
        return mergedData;

      }, [cycleData]);

      if (cycleDataHookIsLoading || !cycleData) {
        return <div className="text-center text-slate-300 p-8">Cargando detalles del ciclo...</div>;
      }

      const chartDisplayData = getChartDisplayData();

      return (
        <CycleDetailContent
          cycleData={cycleData}
          addOrUpdateDataPointForCycle={addOrUpdateDataPointForCycle}
          deleteRecordForCycle={deleteRecordForCycle}
          toggleIgnoreRecordForCycle={toggleIgnoreRecordForCycle}
          isFullScreen={isFullScreen}
          toggleFullScreen={toggleFullScreen}
          chartDisplayData={chartDisplayData}
          showForm={showForm} setShowForm={setShowForm}
          editingRecord={editingRecord} setEditingRecord={setEditingRecord}
          recordToDelete={recordToDelete} setRecordToDelete={setRecordToDelete}
          isProcessing={isProcessing}
          toast={toast}
        />
      );
    };

    export default CycleDetailPage;