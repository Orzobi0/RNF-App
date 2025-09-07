import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, FilePlus, CalendarPlus } from 'lucide-react';
import DataEntryForm from '@/components/DataEntryForm';
import NewCycleDialog from '@/components/NewCycleDialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import useBackClose from '@/hooks/useBackClose';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

const CycleOverviewCard = ({ cycleData }) => {
  const records = cycleData.records || [];

  // Colores suaves con mejor contraste
  const getSymbolColor = (symbolValue) => {
    switch (symbolValue) {
      case 'red':
        return {
          main: '#ef4444',
          light: '#fee2e2',
          glow: 'rgba(239, 68, 68, 0.3)'
        };
      case 'white':
        return {
          main: '#f8fafc',
          light: '#ffe4e6',
          glow: 'rgba(248, 250, 252, 0.3)',
        };
      case 'green':
        return {
          main: '#22c55e',
          light: '#d1fae5',
          glow: 'rgba(34, 197, 94, 0.3)'
        };
      case 'spot':
        return {
          main: '#ec4899',
          light: '#fce7f3',
          glow: 'rgba(236, 72, 153, 0.3)'
        };
      default:
        return {
          main: '#d1d5db',
          light: '#f8fafc',
          glow: 'rgba(209, 213, 219, 0.3)'
        };
    }
  };

  // Crear puntos individuales en lugar de segmentos
  const createProgressDots = () => {
    const totalDays = Math.max(cycleData.currentDay, 28);
    const radius = 45; 

    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = records.find(r => r.cycleDay === day);
      const angle = (index / totalDays) * 2 * Math.PI - Math.PI/2;
      
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      
      let colors = day <= cycleData.currentDay && record
        ? getSymbolColor(record.fertility_symbol)
        : { main: '#e5e7eb', light: '#f1f5f9', glow: 'rgba(229, 231, 235, 0.3)' };

      const isToday = day === cycleData.currentDay;
      if (isToday && !record) {
        colors = {
          main: '#3b82f6',
          light: '#bfdbfe',
          glow: 'rgba(59, 130, 246, 0.4)'
        };
      }

      return {
        x,
        y,
        day,
        colors,
        isActive: day <= cycleData.currentDay,
        isToday
      };
    });
  };

  const dots = createProgressDots();

  return (
    <div className="relative min-h-[100dvh] flex flex-col">
      {/* Fecha actual - Parte superior con padding reducido */}
      <motion.div
        className="px-4 pt-12 pb-4 text-center flex-shrink-0"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl font-bold text-gray-800 mb-1">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </h1>
        <p className="text-sm font-medium text-pink-700 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 inline-block">
          Día {cycleData.currentDay} del ciclo
        </p>
      </motion.div>

      {/* Contenedor principal con flex-grow para usar todo el espacio disponible */}
      <motion.div
        className="px-4 flex-grow flex flex-col justify-start"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso redimensionado */}
        <div className="text-center mb-4 flex-shrink-0">
          <motion.div
            className="relative inline-flex items-center justify-center w-64 h-64 mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          >
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {/* Círculo base sutil */}
              <circle
                cx="50"
                cy="50"
                r="16"
                fill="none"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="0.5"
              />
              
              {/* Líneas de referencia sutiles cada 7 días */}
              {[7, 14, 21, 28].map(day => {
                const angle = (day / 28) * 2 * Math.PI - Math.PI/2;
                const x1 = 50 + 37 * Math.cos(angle);
                const y1 = 50 + 37 * Math.sin(angle);
                const x2 = 50 + 43 * Math.cos(angle);
                const y2 = 50 + 43 * Math.sin(angle);
                
                return (
                  <line
                    key={day}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth="0.5"
                  />
                );
              })}

              {/* Puntos de progreso */}
              {dots.map((dot, index) => (
                <g key={index}>
                  {/* Sombra del punto */}
                  <circle
                    cx={dot.x + 0.3}
                    cy={dot.y + 0.3}
                    r={dot.isToday ? 3.5 : 2.5}
                    fill="rgba(0, 0, 0, 0.2)"
                    opacity={dot.isActive ? 1 : 0.5}
                  />
                  
                  {/* Punto principal */}
                  <motion.circle
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.isToday ? 3.5 : 2.5}
                    fill={dot.isActive ? (dot.isToday ? dot.colors.light : dot.colors.main) : '#e5e7eb'}
                    stroke={dot.colors.border || (dot.isActive ? 'rgba(255,255,255,0.4)' : '#cbd5e1')}
                    strokeWidth={dot.colors.border ? 0.6 : (dot.isActive ? 0.8 : 0.8)}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.8 + (index * 0.02),
                      type: 'spring',
                      stiffness: 400,
                      damping: 25
                    }}
                    style={{ 
                      filter: dot.isActive 
                        ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' 
                        : 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))'
                    }}
                  />

                  {/* Punto interior */}
                  {dot.isActive && (
                    <motion.circle
                      cx={dot.x}
                      cy={dot.y}
                      r="0.6"
                      fill={dot.colors.main === '#ffffff' ? '#e5e7eb' : '#e5e7eb'}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: 1.2 + (index * 0.02)
                      }}
                    />
                  )}
                </g>
              ))}
            </svg>
            
            {/* Contenido central */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                className="text-center bg-white/10 backdrop-blur-md rounded-full p-4"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, type: 'spring', stiffness: 200 }}
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
              >
                <span className="text-3xl font-bold text-pink-700 block">
                  {cycleData.currentDay}
                </span>
                <span className="text-xs text-pink-700 font-medium mt-0.5 block">
                  día del ciclo
                </span>
              </motion.div>

              {/* Indicador de fase del ciclo */}
              <motion.div
                className="mt-2 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full border border-white/30"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
              >
                <span className="text-xs font-medium text-gray-800">
                  {cycleData.currentDay <= 7 ? 'Menstrual' : 
                   cycleData.currentDay <= 14 ? 'Folicular' :
                   cycleData.currentDay <= 21 ? 'Ovulatoria' : 'Lútea'}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Leyenda e información del ciclo con diseño mejorado */}
        <div className="grid grid-cols-2 gap-4 mx-2 mb-20 flex-shrink-0">
          {/* Leyenda de colores con forma hexagonal sutil */}
          <motion.div
            className="bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-md rounded-3xl p-4 border border-white/40"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            style={{
              filter: 'drop-shadow(0 8px 25px rgba(0,0,0,0.08))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)'
            }}
          >
            <h3 className="text-xs font-bold text-gray-800 mb-3 text-center tracking-wide uppercase">
              Símbolos
            </h3>

            {/* Grid de símbolos refinado */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { color: '#ef4444', label: 'Menstrual', symbol: 'red' },
                { color: '#f8fafc', label: 'Fértil', symbol: 'white', stroke: '#e2e8f0' },
                { color: '#22c55e', label: 'Infértil', symbol: 'green' },
                { color: '#ec4899', label: 'Spotting', symbol: 'spot' }
              ].map(item => (
                <div key={item.symbol} className="flex flex-col items-center gap-1.5">
                  <div className="relative">
                    {/* Círculo exterior decorativo */}
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${item.color}dd, ${item.color})`
                      }}
                    >
                      {/* Punto interior con mejor contraste */}
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: item.color === '#f8fafc' ? '#64748b' : 'rgba(255,255,255,0.9)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center leading-none">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Día actual con estilo diferenciado */}
            <div className="flex items-center justify-center gap-2 pt-3 mt-3 border-t border-gradient-to-r from-transparent via-gray-200 to-transparent">
              <div className="relative">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm"/>
                </div>
                {/* Anillo decorativo */}
                <div className="absolute inset-0 rounded-full border-2 border-blue-300/50 animate-pulse"/>
              </div>
              <span className="text-xs font-semibold text-gray-700">Hoy</span>
            </div>
          </motion.div>

          {/* Información del ciclo con diseño tipo card premium */}
          <motion.div
            className="relative bg-gradient-to-br from-pink-50/80 to-rose-50/60 backdrop-blur-md rounded-3xl p-4 border border-pink-200/40"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            style={{
              filter: 'drop-shadow(0 8px 25px rgba(236,72,153,0.1))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)'
            }}
          >
            <h3 className="font-bold mb-3 text-gray-800 flex items-center gap-2 justify-center text-xs tracking-wide uppercase">
              <div className="w-2.5 h-2.5 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full shadow-sm"/>
              Informacion del ciclo
            </h3>
            
            <div className="space-y-3">
              {/* CPM con diseño mejorado */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <div className="w-1 h-1 bg-pink-400 rounded-full"/>
                  <div className="font-bold text-pink-800 text-xs">CPM</div>
                  <div className="w-1 h-1 bg-pink-400 rounded-full"/>
                </div>
                <div className="bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-200/50 shadow-sm">
                  <span className="text-xs text-gray-600 font-medium">Pendiente</span>
                </div>
              </div>
              {/* T-8 con diseño mejorado */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <div className="w-1 h-1 bg-pink-400 rounded-full"/>
                  <div className="font-bold text-pink-800 text-xs">T-8</div>
                  <div className="w-1 h-1 bg-pink-400 rounded-full"/>
                </div>
                <div className="bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-200/50 shadow-sm">
                  <span className="text-xs text-gray-600 font-medium">Pendiente</span>
                </div>
              </div>
            </div>
            
            {/* Decoración sutil en la esquina */}
            <div className="absolute top-2 right-2 w-2 h-2 bg-gradient-to-br from-pink-300/40 to-rose-400/40 rounded-full"/>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

const FloatingActionButton = ({ onAddRecord, onAddCycle }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[calc(var(--bottom-nav-height)+1rem)] right-6 flex flex-col items-end space-y-3 z-50">
      {open && (
        <>
          <motion.button
            onClick={onAddRecord}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
          >
            <FilePlus className="h-5 w-5" />
          </motion.button>
          <motion.button
            onClick={onAddCycle}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(147, 51, 234, 0.3))' }}
          >
            <CalendarPlus className="h-5 w-5" />
          </motion.button>
        </>
      )}
      <motion.button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-full shadow-lg flex items-center justify-center"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        style={{ filter: 'drop-shadow(0 6px 16px rgba(236, 72, 153, 0.4))' }}
      >
        <Plus className="h-6 w-6" />
      </motion.button>
    </div>
  );
};

const ModernFertilityDashboard = () => {
  const { currentCycle, addOrUpdateDataPoint, startNewCycle, isLoading } = useCycleData();
  const [showForm, setShowForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);

  // Cerrar modal con gesto/botón atrás en móvil
  useBackClose(showForm, () => setShowForm(false));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100 flex items-center justify-center">
        <p className="text-center text-gray-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-600 text-lg">No hay ciclo activo.</p>
          <button
            onClick={() => setShowNewCycleDialog(true)}
            className="px-6 py-3 rounded-lg bg-pink-600 hover:bg-pink-700 text-white shadow"
          >
            Iniciar ciclo
          </button>
        </div>
        <NewCycleDialog
          isOpen={showNewCycleDialog}
          onClose={() => setShowNewCycleDialog(false)}
          onConfirm={async (selectedStartDate) => {
            await startNewCycle(selectedStartDate);
            setShowNewCycleDialog(false);
            setShowForm(true);
          }}
        />
      </div>
    );
  }

  const currentDay = differenceInDays(
    startOfDay(new Date()),
    parseISO(currentCycle.startDate)
  ) + 1;

  const handleSave = async (data) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data);
      setShowForm(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmNewCycle = async (selectedStartDate) => {
    await startNewCycle(selectedStartDate);
    setShowNewCycleDialog(false);
    setShowForm(true);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100 relative overflow-x-hidden">
      <div className="max-w-md mx-auto h-[100dvh]">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <CycleOverviewCard cycleData={{ ...currentCycle, currentDay, records: currentCycle.data }} />
        </motion.div>
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => setShowForm(open)}
      >
        <DialogContent hideClose className="bg-white border-pink-100 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DataEntryForm
            onSubmit={handleSave}
            onCancel={() => setShowForm(false)}
            cycleStartDate={currentCycle.startDate}
            cycleEndDate={currentCycle.endDate}
            isProcessing={isProcessing}
          />
        </DialogContent>
      </Dialog>

      <FloatingActionButton
        onAddRecord={() => setShowForm(true)}
        onAddCycle={() => setShowNewCycleDialog(true)}
      />

      <NewCycleDialog
        isOpen={showNewCycleDialog}
        onClose={() => setShowNewCycleDialog(false)}
        onConfirm={handleConfirmNewCycle}
        currentCycleStartDate={currentCycle.startDate}
      />
    </div>
  );
};

export default ModernFertilityDashboard;