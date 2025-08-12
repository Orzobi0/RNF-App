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
import useBackClose from '@/hooks/useBackClose';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize, X, Eye, EyeOff, RotateCcw, Calendar, Thermometer, TrendingUp, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays, startOfDay, parseISO } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';

// Configuración de días
const CYCLE_DURATION_DAYS = 28;
const VISIBLE_DAYS_NORMAL_VIEW = 5;
const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;

// Estadísticas del ciclo
const CycleStats = ({ currentCycle }) => {
  if (!currentCycle?.startDate) return null;
  
  const cycleDay = differenceInDays(new Date(), parseISO(currentCycle.startDate)) + 1;
  const totalRecords = currentCycle.data?.filter(d => d.id && !d.id.startsWith('placeholder-')).length || 0;
  const avgTemp = currentCycle.data?.length > 0 
    ? (currentCycle.data.reduce((sum, d) => sum + (d.displayTemperature || 0), 0) / currentCycle.data.length).toFixed(1)
    : 0;

  return (
    <motion.div 
      className="grid grid-cols-3 gap-4 mb-6"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <div className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 backdrop-blur-sm rounded-2xl p-4 border border-pink-200/50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-pink-500/20 rounded-xl">
            <Calendar className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Día del Ciclo</p>
            <p className="text-2xl font-bold text-pink-600">{cycleDay}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 backdrop-blur-sm rounded-2xl p-4 border border-purple-200/50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-500/20 rounded-xl">
            <Thermometer className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Temp. Media</p>
            <p className="text-2xl font-bold text-purple-600">{avgTemp}°C</p>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-sm rounded-2xl p-4 border border-emerald-200/50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/20 rounded-xl">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Registros</p>
            <p className="text-2xl font-bold text-emerald-600">{totalRecords}</p>
          </div>
        </div>
      </div>
    </motion.div>
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
}) => {

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
          className="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <motion.p
          className="text-slate-600 font-medium"
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
      {/* Header mejorado */}
      {!isFullScreen && !showForm && !showRecords && (
        <motion.div 
          className="w-full max-w-6xl px-4 pt-6 pb-4"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-6">
            <motion.div
              className="inline-flex items-center space-x-3 mb-4"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="p-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl shadow-lg">
                <Heart className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                  Ciclo Actual
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Seguimiento natural de fertilidad
                </p>
              </div>
            </motion.div>
            
            {/* Badge de estado */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Badge variant="secondary" className="bg-gradient-to-r from-pink-100 to-purple-100 text-pink-700 border-pink-200 px-4 py-2 rounded-full">
                {currentCycle?.startDate 
                  ? `Iniciado el ${format(parseISO(currentCycle.startDate), "dd/MM/yyyy")}`
                  : "Sin datos de ciclo"
                }
              </Badge>
            </motion.div>
          </div>

          {/* Estadísticas */}
          <CycleStats currentCycle={currentCycle} />
        </motion.div>
      )}

      <main className={`w-full ${isFullScreen ? 'h-full flex items-center justify-center' : 'max-w-6xl flex-grow px-4'}`}>
        <AnimatePresence>
          {(!showForm && !showRecords) && (chartDisplayData.length > 0 || isFullScreen) && (
            <motion.div
              initial={{ opacity: 0, scale: isFullScreen ? 1 : 0.95, y: isFullScreen ? 0 : 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: isFullScreen ? 1 : 0.95, y: isFullScreen ? 0 : 20 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
              className={`
                ${isFullScreen 
                  ? 'w-full h-full p-0 fixed inset-0 z-50 bg-white' 
                  : 'p-6 sm:p-8 mb-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-white/50'
                }
                shadow-2xl shadow-purple-500/10
              `}
              style={{ 
                boxShadow: isFullScreen 
                  ? 'none' 
                  : '0 25px 50px -12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.5)' 
              }}
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
              
              {/* Botones del gráfico mejorados */}
              <Button
                onClick={() => setShowInterpretation(v => !v)}
                variant="ghost"
                size="sm"
                className={`
                  absolute ${isFullScreen ? 'top-6 right-32' : 'top-4 right-16'} 
                  flex items-center text-sm font-medium py-2 px-4 rounded-full 
                  transition-all duration-300 backdrop-blur-sm
                  ${showInterpretation 
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 shadow-lg' 
                    : 'bg-white/80 text-gray-700 hover:bg-white border border-gray-200 hover:border-pink-300'
                  }
                `}
              >
                {showInterpretation ? (
                  <EyeOff className="mr-2 h-4 w-4" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {showInterpretation ? 'Ocultar' : 'Interpretar'}
              </Button>
              
              {isFullScreen && (
                <Button
                  onClick={rotateScreen}
                  variant="ghost"
                  size="icon"
                  className="absolute top-6 right-20 text-white bg-gray-800/50 hover:bg-gray-700/70 backdrop-blur-sm rounded-full p-3"
                  title="Rotar Pantalla"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
              )}
              
              <Button
                onClick={toggleFullScreen}
                variant="ghost"
                size="icon"
                className={`
                  absolute ${isFullScreen ? 'top-6 right-6' : 'top-4 right-4'} 
                  rounded-full p-3 backdrop-blur-sm transition-all duration-300
                  ${isFullScreen 
                    ? 'text-white bg-gray-800/50 hover:bg-gray-700/70' 
                    : 'text-gray-600 hover:text-gray-800 bg-white/80 hover:bg-white border border-gray-200 hover:border-gray-300'
                  }
                `}
                title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
              >
                {isFullScreen ? <X className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
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
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 30, scale: 0.95 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 120 }}
                  className="w-full"
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
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -30, scale: 0.95 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 120 }}
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
                transition={{ delay: 0.5, duration: 0.6 }}
              >
                <NoDataMessage />
              </motion.div>
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
    />
  );
}

export default DashboardPage;
