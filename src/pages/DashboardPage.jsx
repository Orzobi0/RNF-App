import React, { useState, useEffect, useCallback } from 'react';
    import FertilityChart from '@/components/FertilityChart';
    import DataEntryForm from '@/components/DataEntryForm';
    import RecordsList from '@/components/RecordsList';
    import ActionButtons from '@/components/ActionButtons';
    import NoDataMessage from '@/components/NoDataMessage';
    import DeletionDialog from '@/components/DeletionDialog';
    import NewCycleDialog from '@/components/NewCycleDialog';
    import { useToast } from '@/components/ui/use-toast';
    import { useCycleData } from '@/hooks/useCycleData';
    import { useFullScreen } from '@/hooks/useFullScreen';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Maximize, X } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { addDays, format, differenceInDays, startOfDay, parseISO } from 'date-fns';

    const CYCLE_DURATION_DAYS = 30;
    const VISIBLE_DAYS_NORMAL_VIEW = 5;

    const DashboardPageContent = ({
      currentCycle,
      addOrUpdateDataPoint,
      deleteCurrentRecord,
      toggleIgnoreRecord,
      startNewCycle,
      isLoading,
      isFullScreen,
      toggleFullScreen,
      chartDisplayData,
      scrollStart,
      showForm, setShowForm,
      showRecords, setShowRecords,
      editingRecord, setEditingRecord,
      recordToDelete, setRecordToDelete,
      confirmNewCycleDialog, setConfirmNewCycleDialog,
      toast
    }) => {

      const handleEdit = (record) => {
        setEditingRecord(record);
        setShowRecords(false);
        setShowForm(true);
      };

      const handleDeleteRequest = (recordId) => {
        const record = currentCycle.data.find(r => r.id === recordId);
        setRecordToDelete(record);
      };

      const confirmDelete = () => {
        if (recordToDelete) {
          deleteCurrentRecord(recordToDelete.id);
          toast({
            title: "Registro eliminado",
            description: `El registro del ${format(parseISO(recordToDelete.isoDate), "dd/MM/yyyy")} ha sido eliminado.`,
            variant: "destructive",
          });
          setRecordToDelete(null);
        }
      };
      
      const openFormForNewRecord = () => {
        setEditingRecord(null);
        setShowRecords(false);
        setShowForm(true);
      };

      const openRecordsList = () => {
        setShowForm(false);
        setEditingRecord(null);
        setShowRecords(true);
      };

  const handleStartNewCycle = () => {
    setConfirmNewCycleDialog(true);
  };

  const confirmStartNewCycleAction = (selectedDate) => {
    startNewCycle(selectedDate);
    toast({
      title: "Nuevo Ciclo Iniciado",
      description: "Los datos del ciclo anterior han sido archivados.",
    });
    setConfirmNewCycleDialog(false);
  };

      if (isLoading) {
        return <div className="text-center text-slate-300 p-8">Cargando datos del ciclo...</div>;
      }

      return (
        <div className={`flex flex-col items-center w-full ${isFullScreen ? 'overflow-hidden h-full' : ''}`}>
          <main className={`w-full ${isFullScreen ? 'h-full flex items-center justify-center' : 'max-w-4xl flex-grow'}`}>
            <AnimatePresence>
              {(!showForm && !showRecords) && (chartDisplayData.length > 0 || isFullScreen) && (
                <motion.div
                  initial={{ opacity: 0, scale: isFullScreen ? 1 : 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: isFullScreen ? 1 : 0.9 }}
                  transition={{ duration: 0.5 }}
                className={`backdrop-blur-md shadow-2xl rounded-xl ${isFullScreen ? 'w-full h-full p-0 fixed inset-0 z-50' : 'p-4 sm:p-6 mb-8'}`}
                style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.04)' }}
                >
                  <FertilityChart
                    data={chartDisplayData}
                    isFullScreen={isFullScreen}
                    onToggleIgnore={toggleIgnoreRecord}
                    cycleId={currentCycle.id}
                    initialScrollIndex={scrollStart}
                    visibleDays={VISIBLE_DAYS_NORMAL_VIEW}
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
                <ActionButtons
                  onAddRecord={openFormForNewRecord}
                  onShowRecords={openRecordsList}
                  onNewCycle={handleStartNewCycle}
                  disableAdd={showForm && !editingRecord}
                  disableRecords={showRecords}
                />
                
                <AnimatePresence>
                  {(showForm || editingRecord) && (
                    <motion.div
                      key="data-entry-form"
                      initial={{ opacity: 0, y: 20, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: 20, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <DataEntryForm 
                        onSubmit={addOrUpdateDataPoint} 
                        initialData={editingRecord} 
                        isEditing={Boolean(editingRecord)} 
                        cycleStartDate={currentCycle.startDate}
                        onCancel={() => { setShowForm(false); setEditingRecord(null); }}
                        
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showRecords && (
                    <motion.div
                      key="records-list"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <RecordsList 
                        records={currentCycle.data} 
                        onEdit={handleEdit} 
                        onDelete={handleDeleteRequest} 
                        onClose={() => setShowRecords(false)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {currentCycle.data.filter(d => d.id && !d.id.startsWith('placeholder-')).length === 0 && !showForm && !showRecords && !isFullScreen && (
                  <NoDataMessage />
                )}
              </>
            )}
          </main>
          
          <DeletionDialog
            isOpen={!!recordToDelete}
            onClose={() => setRecordToDelete(null)}
            onConfirm={confirmDelete}
            recordDate={recordToDelete ? format(parseISO(recordToDelete.isoDate), "dd/MM/yyyy") : ''}
          />

          <NewCycleDialog
            isOpen={confirmNewCycleDialog}
            onClose={() => setConfirmNewCycleDialog(false)}
            onConfirm={confirmStartNewCycleAction}
            currentCycleStartDate={currentCycle.startDate}
          />
        </div>
      );
    }


    function DashboardPage() {
      const { 
        currentCycle, 
        addOrUpdateDataPoint: originalAddOrUpdate, 
        deleteRecord, 
        startNewCycle,
        isLoading,
        refreshData,
        toggleIgnoreRecord
      } = useCycleData();
      
      const [showForm, setShowForm] = useState(false);
      const [showRecords, setShowRecords] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [confirmNewCycleDialog, setConfirmNewCycleDialog] = useState(false);
      
      const { isFullScreen, toggleFullScreen } = useFullScreen();
      const { toast } = useToast();

      useEffect(() => {
        refreshData();
      }, [refreshData]);

      const addOrUpdateDataPoint = (newData) => {
        originalAddOrUpdate(newData, editingRecord);
        toast({
          title: editingRecord ? "Registro actualizado" : "Nuevo registro añadido",
          description: editingRecord 
            ? `Datos del ${format(parseISO(newData.isoDate), "dd/MM/yyyy")} actualizados.`
            : `Registro para el ${format(parseISO(newData.isoDate), "dd/MM/yyyy")} añadido.`,
        });
        setShowForm(false);
        setEditingRecord(null);
      };
      
      const getChartDisplayData = useCallback(() => {
        if (isLoading || !currentCycle || !currentCycle.startDate) {
          return { data: [], scrollStart: 0 };
        }
        
        const cycleStartDate = parseISO(currentCycle.startDate);

        const lastRecordDate = currentCycle.data.reduce((maxDate, record) => {
          const recDate = parseISO(record.isoDate);
          return recDate > maxDate ? recDate : maxDate;
        }, cycleStartDate);

        const today = startOfDay(new Date());
        const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
        const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
        const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

        const fullCyclePlaceholders = [...Array(daysInCycle)].map((_, i) => {
          const date = addDays(cycleStartDate, i);
          const isoDate = format(date, "yyyy-MM-dd");
          const formattedDate = format(date, "dd/MM");
          const cycleDay = differenceInDays(startOfDay(date), startOfDay(cycleStartDate)) + 1;
          return {
            date: formattedDate, 
            isoDate, 
            cycleDay, 
            temperature: null, 
            mucusSensation: null,
            mucusAppearance: null,
            id: `placeholder-${isoDate}`,
            ignored: false
          };
        });

        const mergedData = fullCyclePlaceholders.map(placeholder => {
            const existingRecord = currentCycle.data.find(d => d.isoDate === placeholder.isoDate);
            return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
        });


        if (isFullScreen) {
          return { data: mergedData, scrollStart: 0 };
        }

          const daysSinceCycleStart = differenceInDays(new Date(), startOfDay(cycleStartDate));
          const currentDayIndex = Math.min(Math.max(daysSinceCycleStart, 0), daysInCycle - 1);
          let endIndex = Math.min(daysInCycle, currentDayIndex + 1);
        if (currentDayIndex < VISIBLE_DAYS_NORMAL_VIEW - 1) {
           endIndex = Math.min(daysInCycle, VISIBLE_DAYS_NORMAL_VIEW);
        }

        const startIndex = Math.max(0, endIndex - VISIBLE_DAYS_NORMAL_VIEW);
        
        return { data: mergedData, scrollStart: startIndex };
      }, [currentCycle, isFullScreen, isLoading]);
      
      const { data: chartDisplayData, scrollStart } = getChartDisplayData();

      return (
        <DashboardPageContent
          currentCycle={currentCycle}
          addOrUpdateDataPoint={addOrUpdateDataPoint}
          deleteCurrentRecord={deleteRecord}
          toggleIgnoreRecord={toggleIgnoreRecord}
          startNewCycle={startNewCycle}
          isLoading={isLoading}
          isFullScreen={isFullScreen}
          toggleFullScreen={toggleFullScreen}
          chartDisplayData={chartDisplayData}
          scrollStart={scrollStart}
          showForm={showForm} setShowForm={setShowForm}
          showRecords={showRecords} setShowRecords={setShowRecords}
          editingRecord={editingRecord} setEditingRecord={setEditingRecord}
          recordToDelete={recordToDelete} setRecordToDelete={setRecordToDelete}
          confirmNewCycleDialog={confirmNewCycleDialog} setConfirmNewCycleDialog={setConfirmNewCycleDialog}
          toast={toast}
        />
      );
    }

    export default DashboardPage;