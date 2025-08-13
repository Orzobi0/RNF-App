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
import { 
  Maximize, X, Eye, EyeOff, RotateCcw, Calendar, 
  TrendingUp, Heart, Plus, List, Egg, Timer 
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

// Estadísticas del ciclo rediseñadas
const CycleStats = ({ currentCycle, onShowRecords }) => {
  if (!currentCycle?.startDate) return null;
  
  const cycleDay = differenceInDays(new Date(), parseISO(currentCycle.startDate)) + 1;
  const totalRecords = currentCycle.data?.filter(d => d.id && !d.id.startsWith('placeholder-')).length || 0;
  
  const fertileWindow = calculateFertileWindow([], currentCycle.data);
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {/* Día del Ciclo */}
      <motion.div 
        className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-pink-100/50 shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-lg">
            <Calendar className="h-4 w-4 text-pink-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Día del Ciclo</p>
            <p className="text-lg font-bold text-pink-600 truncate">{cycleDay}</p>
          </div>
        </div>
      </motion.div>
      
      {/* Registros - Clickeable */}
      <motion.button
        onClick={onShowRecords}
        className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-emerald-100/50 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200 text-left group"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-lg group-hover:from-emerald-500/20 group-hover:to-teal-500/20 transition-colors">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Registros</p>
            <p className="text-lg font-bold text-emerald-600 truncate">{totalRecords}</p>
          </div>
        </div>
      </motion.button>
      
      {/* Ventana Fértil */}
      <motion.div 
        className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border border-purple-100/50 shadow-sm sm:col-span-2 lg:col-span-1"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <div className="flex items-center space-x-2 mb-2">
          <div className="p-1.5 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-lg">
            <Egg className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Ventana Fértil</p>
        </div>
        
        {fertileWindow.hasSufficientData ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-purple-50/50 rounded-lg p-2">
              <div className="flex items-center space-x-1 mb-1">
                <Timer className="h-3 w-3 text-purple-500" />
                <p className="text-xs text-purple-600 font-medium">Cálc. Preov.</p>
              </div>
              <p className="text-sm font-bold text-purple-700">
                {fertileWindow.preovulatory ? `Día ${fertileWindow.preovulatory}` : '—'}
              </p>
            </div>
            <div className="bg-indigo-50/50 rounded-lg p-2">
              <div className="flex items-center space-x-1 mb-1">
                <TrendingUp className="h-3 w-3 text-indigo-500" />
                <p className="text-xs text-indigo-600 font-medium">T-8</p>
              </div>
              <p className="text-sm font-bold text-indigo-700">
                {fertileWindow.t8 ? `Día ${fertileWindow.t8}` : '—'}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-gray-500">Datos insuficientes</p>
            <p className="text-xs text-gray-400 mt-1">Se requieren ≥6 ciclos</p>
          </div>
        )}
      </motion.div>
    </div>
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
      {/* Header simplificado y elegante */}
      {!isFullScreen && !showForm && !showRecords && (
        <motion.div 
          className="w-full max-w-6xl px-4 pt-6 pb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-6">
            <div className="inline-flex items-center space-x-2 mb-3">
              <div className="p-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl shadow-sm">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-semibold text-gray-800">
                  Ciclo Actual
                </h1>
                <p className="text-sm text-gray-500">
                  Seguimiento natural de fertilidad
                </p>
              </div>
            </div>
            
            {/* Badge de estado más discreto */}
            <Badge variant="secondary" className="bg-white/60 text-gray-700 border-gray-200 px-3 py-1 rounded-full text-sm">
              {currentCycle?.startDate 
                ? `Iniciado el ${format(parseISO(currentCycle.startDate), "dd/MM/yyyy")}`
                : "Sin datos de ciclo"
              }
            </Badge>
          </div>

          {/* Estadísticas rediseñadas */}
          <CycleStats currentCycle={currentCycle} onShowRecords={openRecordsList} />
        </motion.div>
      )}

      <main className={`w-full ${isFullScreen ? 'h-full flex items-center justify-center' : 'max-w-6xl flex-grow px-4'}`}>
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
                size="sm"
                className={`
                  absolute ${isFullScreen ? 'top-4 right-28' : 'top-3 right-14'} 
                  flex items-center text-xs font-medium py-1.5 px-3 rounded-lg 
                  transition-all duration-200 backdrop-blur-sm
                  ${showInterpretation 
                    ? 'bg-pink-500 text-white hover:bg-pink-600 shadow-sm' 
                    : 'bg-white/80 text-gray-600 hover:bg-white hover:text-gray-800 border border-gray-200'
                  }
                `}
              >
                {showInterpretation ? (
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                {showInterpretation ? 'Ocultar' : 'Interpretar'}
              </Button>
              
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
        
        {/* Botones de acción integrados mejor */}
        {!isFullScreen && !showForm && !showRecords && (
          <motion.div 
            className="w-full max-w-md mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={openFormForNewRecord}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-medium py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Nuevo Registro</span>
              </Button>
              
              <Button 
                onClick={openRecordsList}
                variant="outline"
                className="border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <List className="h-4 w-4" />
                <span>Mis Registros</span>
              </Button>
            </div>
            
            <Button 
              onClick={handleStartNewCycle}
              variant="ghost"
              className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm font-medium py-2"
            >
              Iniciar Nuevo Ciclo
            </Button>
          </motion.div>
        )}
        
        <AnimatePresence>
          {(showForm || editingRecord) && (
            <motion.div
              key="data-entry-form"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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