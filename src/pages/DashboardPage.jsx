import React, { useState, useEffect, useCallback } from 'react';
import FertilityChart from '@/components/FertilityChart';
import DataEntryForm from '@/components/DataEntryForm';
import RecordsList from '@/components/RecordsList';
import NoDataMessage from '@/components/NoDataMessage';
import DeletionDialog from '@/components/DeletionDialog';
import NewCycleDialog from '@/components/NewCycleDialog';
import EditCycleDatesDialog from '@/components/EditCycleDatesDialog';
import { useToast } from '@/components/ui/use-toast';
import { useCycleData } from '@/hooks/useCycleData';
import { useFullScreen } from '@/hooks/useFullScreen';
import useBackClose from '@/hooks/useBackClose';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Maximize, X, Eye, EyeOff, RotateCcw, Calendar,
  TrendingUp, Heart, Plus, Egg
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays, startOfDay, parseISO } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';

// Configuración de días
const CYCLE_DURATION_DAYS = 28;
const VISIBLE_DAYS_NORMAL_VIEW = 5;
const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;

// Componente para calcular ventana fértil
const calculateFertileWindow = (historicalCycles, currentCycleData) => {
  // Por ahora devolvemos valores mock ya que no tenemos acceso a los ciclos históricos
  // En la implementación real, aquí calcularíamos basándonos en los datos reales
  const totalCycles = 3; // Mock - debería venir de los datos históricos
  
  let preovulatoryCalculation = null;
  let t8Calculation = null;
  
  if (totalCycles >= 12) {
    // Cálculo preovulatorio modificado con 12+ ciclos
    const shortestCycle = 26; // Mock - debería calcularse del historial
    preovulatoryCalculation = shortestCycle - 20;
  } else if (totalCycles >= 6) {
    // Cálculo preovulatorio modificado con 6-11 ciclos
    const shortestCycle = 26; // Mock
    preovulatoryCalculation = shortestCycle - 21;
  }
  
  // T-8: Primer día de temperatura alta de los últimos 12 ciclos
  // Mock - en la implementación real sería calculado
  if (totalCycles >= 3) {
    t8Calculation = 14; // Mock
  }
  
  return {
    preovulatory: preovulatoryCalculation,
    t8: t8Calculation,
    hasSufficientData: totalCycles >= 6
  };
};

const DashboardHeader = ({ currentCycle, onShowRecords, onEditDates }) => {
  if (!currentCycle?.startDate) return null;
  
  const cycleDay = differenceInDays(new Date(), parseISO(currentCycle.startDate)) + 1;
  const totalRecords = currentCycle.data?.filter(d => d.id && !d.id.startsWith('placeholder-')).length || 0;
  
  const fertileWindow = calculateFertileWindow([], currentCycle.data);
  
  return (
    <motion.header
      className="w-full max-w-6xl flex items-center justify-between px-4 py-2 bg-white/60 backdrop-blur-sm border-b border-pink-100/50"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center space-x-2">
        <div className="p-1.5 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full shadow-sm">
          <Heart className="h-4 w-4 text-white" />
        </div>
        <Badge
          variant="secondary"
          onClick={onEditDates}
          className="bg-white/70 text-gray-700 border border-gray-200 px-2 py-1 rounded-full text-xs cursor-pointer hover:bg-white"
        >
          {format(parseISO(currentCycle.startDate), 'dd/MM/yyyy')}
        </Badge>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1">
          <Calendar className="h-4 w-4 text-pink-600" />
          <span className="text-sm font-medium text-gray-700">{cycleDay}</span>
        </div>
        <button
          onClick={onShowRecords}
          className="flex items-center space-x-1 hover:opacity-80"
        >
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-gray-700">{totalRecords}</span>
        </button>
        <div className="flex items-center space-x-1">
          <Egg className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium text-gray-700">
            {fertileWindow.preovulatory ? `D${fertileWindow.preovulatory}` : '—'}
          </span>
        </div>
        
      </div>
    </motion.header>
  );
};

const DashboardPageContent = ({
  currentCycle,
  addOrUpdateDataPoint,
  deleteCurrentRecord,
  toggleIgnoreRecord,
  startNewCycle,
  isLoading,
  isFullScreen,
  toggleFullScreen,
  orientation,
  rotateScreen,
  chartDisplayData,
  scrollStart,
  showForm, setShowForm,
  showRecords, setShowRecords,
  editingRecord, setEditingRecord,
  recordToDelete, setRecordToDelete,
  confirmNewCycleDialog, setConfirmNewCycleDialog,
  toast,
  showInterpretation, setShowInterpretation,
  updateCycleDates,
}) => {
  const [showEditCycleDialog, setShowEditCycleDialog] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  useBackClose(showRecords, () => setShowRecords(false));
  useBackClose(showForm || editingRecord, () => {
    setShowForm(false);
    setEditingRecord(null);
  });

  const chartVisibleDays = isFullScreen
    ? orientation === 'portrait'
      ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
      : CYCLE_DURATION_DAYS
    : VISIBLE_DAYS_NORMAL_VIEW;

  const handleEdit = (record) => {
    const openForm = () => {
      setEditingRecord(record);
      setShowRecords(false);
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
    const record = currentCycle.data.find(r => r.id === recordId);
    setRecordToDelete(record);
  };
    const handleCycleDatesUpdate = async ({ startDate }) => {
    try {
      await updateCycleDates(currentCycle.id, startDate);
      toast({
        title: 'Fechas actualizadas',
        description: 'Las fechas del ciclo han sido modificadas.'
      });
      setShowEditCycleDialog(false);
    } catch (e) {
      // error handled via toast
    }
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <motion.div
          className="w-8 h-8 rounded-full bg-pink-500/80"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <motion.p
          className="text-pink-600 font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Cargando datos del ciclo...
        </motion.p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center w-full min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 ${isFullScreen ? 'overflow-hidden h-full' : ''}`}>

      {!isFullScreen && !showForm && !showRecords && (
        <DashboardHeader
          currentCycle={currentCycle}
          onShowRecords={openRecordsList}
          onEditDates={() => currentCycle?.startDate && setShowEditCycleDialog(true)}
        />
      )}

      <main className={`w-full ${isFullScreen ? 'h-full flex items-center justify-center' : 'max-w-6xl flex-1 px-4'}`}>
        <AnimatePresence>
          {(!showForm && !showRecords) && (chartDisplayData.length > 0 || isFullScreen) && (
            <motion.div
              initial={{ opacity: 0, scale: isFullScreen ? 1 : 0.98, y: isFullScreen ? 0 : 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: isFullScreen ? 1 : 0.98, y: isFullScreen ? 0 : 10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`
                ${isFullScreen 
                  ? 'w-full h-full p-0 fixed inset-0 z-50 bg-white' 
                  : 'p-4 sm:p-6 mb-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50'
                }
                shadow-xl shadow-purple-500/5
              `}
            >
              <FertilityChart
                data={chartDisplayData}
                isFullScreen={isFullScreen}
                orientation={orientation}
                onEdit={handleEdit}
                onToggleIgnore={toggleIgnoreRecord}
                cycleId={currentCycle.id}
                initialScrollIndex={scrollStart}
                visibleDays={chartVisibleDays}
                showInterpretation={showInterpretation}
              />
              
              {/* Botones del gráfico más discretos */}
              <Button
                onClick={() => setShowInterpretation(v => !v)}
                variant="ghost"
                size="icon"
                title={showInterpretation ? 'Ocultar interpretación' : 'Interpretar'}
                className={`absolute ${isFullScreen ? 'top-4 right-28' : 'top-3 right-14'} rounded-lg p-2 backdrop-blur-sm transition-all duration-200 ${
                  showInterpretation
                    ? 'bg-pink-500 text-white hover:bg-pink-600 shadow-sm'
                    : 'bg-white/80 text-gray-600 hover:bg-white hover:text-gray-800 border border-gray-200'
                }`}
              >
                {showInterpretation ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                
              </Button>
                            {!showInterpretation && !isFullScreen && (
                <span className="absolute top-3 right-8 text-xs text-gray-600"></span>
              )}
              {isFullScreen && (
                <Button
                  onClick={rotateScreen}
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-16 text-gray-600 bg-white/80 hover:bg-white backdrop-blur-sm rounded-lg p-2 border border-gray-200"
                  title="Rotar Pantalla"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              
              <Button
                onClick={toggleFullScreen}
                variant="ghost"
                size="icon"
                className={`
                  absolute ${isFullScreen ? 'top-4 right-4' : 'top-3 right-3'} 
                  rounded-lg p-2 backdrop-blur-sm transition-all duration-200
                  ${isFullScreen 
                    ? 'text-gray-600 bg-white/80 hover:bg-white border border-gray-200' 
                    : 'text-gray-500 hover:text-gray-700 bg-white/80 hover:bg-white border border-gray-200'
                  }
                `}
                title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
              >
                {isFullScreen ? <X className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        

        
        <AnimatePresence>
          {(showForm || editingRecord) && (
            <motion.div
              key="data-entry-form"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="w-full"
            >
              <DataEntryForm
                onSubmit={addOrUpdateDataPoint}
                initialData={editingRecord}
                isEditing={Boolean(editingRecord)}
                cycleStartDate={currentCycle.startDate}
                cycleEndDate={currentCycle.endDate}
                onCancel={() => { setShowForm(false); setEditingRecord(null); }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showRecords && (
            <motion.div
              key="records-list"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="w-full"
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <NoDataMessage />
          </motion.div>
        )}
      </main>
      
      {!isFullScreen && (
        <div className="fixed bottom-6 right-6 z-50">
          <AnimatePresence>
            {fabOpen && !showForm && !showRecords && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex flex-col items-end mb-3 space-y-2"
              >
                <button
                  onClick={() => { setFabOpen(false); openFormForNewRecord(); }}
                  className="px-4 py-2 rounded-lg bg-white text-pink-600 shadow-md hover:shadow-lg border border-pink-200"
                >
                  Nuevo Registro
                </button>
                <button
                  onClick={() => { setFabOpen(false); handleStartNewCycle(); }}
                  className="px-4 py-2 rounded-lg bg-white text-pink-600 shadow-md hover:shadow-lg border border-pink-200"
                >
                  Nuevo Ciclo
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => setFabOpen(!fabOpen)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
          >
            <motion.span animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
              <Plus className="h-6 w-6" />
            </motion.span>
          </motion.button>
        </div>
      )}

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
      
      <EditCycleDatesDialog
        isOpen={showEditCycleDialog}
        onClose={() => setShowEditCycleDialog(false)}
        onConfirm={handleCycleDatesUpdate}
        initialStartDate={currentCycle.startDate}
        includeEndDate={false}
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
    toggleIgnoreRecord,
    updateCycleDates
  } = useCycleData();
  
  const [showForm, setShowForm] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [confirmNewCycleDialog, setConfirmNewCycleDialog] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
  
  const { isFullScreen, orientation, toggleFullScreen, rotateScreen } = useFullScreen();
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

    const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);

    const mergedData = fullCyclePlaceholders.map(placeholder => {
        const existingRecord = currentCycle.data.find(d => d.isoDate === placeholder.isoDate);
        return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
    });

    if (isFullScreen && orientation === 'landscape') {
      return { data: mergedData, scrollStart: 0 };
    }

    const daysSinceCycleStart = differenceInDays(new Date(), startOfDay(cycleStartDate));
    const currentDayIndex = Math.min(Math.max(daysSinceCycleStart, 0), daysInCycle - 1);
    let endIndex = Math.min(daysInCycle, currentDayIndex + 1);
    const visibleWindow = isFullScreen
      ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
      : VISIBLE_DAYS_NORMAL_VIEW;
    if (currentDayIndex < visibleWindow - 1) {
       endIndex = Math.min(daysInCycle, visibleWindow);
    }

    const startIndex = Math.max(0, endIndex - visibleWindow);
    
    return { data: mergedData, scrollStart: startIndex };
  }, [currentCycle, isFullScreen, isLoading, orientation]);
  
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
      orientation={orientation}
      rotateScreen={rotateScreen}
      chartDisplayData={chartDisplayData}
      scrollStart={scrollStart}
      showForm={showForm} setShowForm={setShowForm}
      showRecords={showRecords} setShowRecords={setShowRecords}
      editingRecord={editingRecord} setEditingRecord={setEditingRecord}
      recordToDelete={recordToDelete} setRecordToDelete={setRecordToDelete}
      confirmNewCycleDialog={confirmNewCycleDialog} setConfirmNewCycleDialog={setConfirmNewCycleDialog}
      toast={toast}
      showInterpretation={showInterpretation} setShowInterpretation={setShowInterpretation}
      updateCycleDates={updateCycleDates}
    />
  );
}

export default DashboardPage;