import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, FilePlus, CalendarPlus } from 'lucide-react';
import DataEntryForm from '@/components/DataEntryForm';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

const CycleOverviewCard = ({ cycleData }) => {
  const records = cycleData.records || [];

  // Colores suaves
  const getSymbolColor = (symbolValue) => {
    switch (symbolValue) {
      case 'red':
        return {
          main: '#f27c7c', // rojo suave para menstruación
          light: '#fee2e2',
          glow: 'rgba(252, 165, 165, 0.4)'
        };
      case 'white':
        return {
          main: '#fff7f7', // blanco rosado para días fértiles
          light: '#ffe4e6',
          glow: 'rgba(255, 228, 230, 0.5)'
        };
      case 'green':
        return {
          main: '#86efac', // verde pastel para días infértiles
          light: '#d1fae5',
          glow: 'rgba(134, 239, 172, 0.4)'
        };
      case 'spot':
        return {
          main: '#f9a8d4', // rosa pastel para spotting
          light: '#fce7f3',
          glow: 'rgba(249, 168, 212, 0.4)'
        };
      default:
        return {
          main: '#e5e7eb', // gris muy claro por defecto
          light: '#f8fafc',
          glow: 'rgba(229, 231, 235, 0.2)'
        };
    }
  };

  // Crear puntos individuales en lugar de segmentos
  const createProgressDots = () => {
    const totalDays = Math.max(cycleData.currentDay, 28);
    const radius = 45; // Radio del círculo


    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = records.find(r => r.cycleDay === day);
      const angle = (index / totalDays) * 2 * Math.PI - Math.PI/2; // Empezar desde arriba
      
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      
      //Resaltar el día actual
      let colors = day <= cycleData.currentDay && record
        ? getSymbolColor(record.fertility_symbol)
        : { main: '#e2e8f0', light: '#f1f5f9', glow: 'rgba(226, 232, 240, 0.2)' };

      const isToday = day === cycleData.currentDay;
      if (isToday && !record) {
        colors = {
          main: '#93c5fd',
          light: '#bfdbfe',
          glow: 'rgba(147, 197, 253, 0.5)'
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
    <div className="relative">
      {/* Fecha actual - Parte superior */}
      <motion.div
        className="backdrop-blur-sm border-b  px-4 py-4 text-center mb-4 sticky top-0 z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl font-semibold text-gray-700 mb-1">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </h1>
        <p className="text-sm text-pink-600">
          Día {cycleData.currentDay} del ciclo
        </p>
      </motion.div>

      {/* Contenedor principal sin fondo blanco */}
      <motion.div
        className="p-6 mb-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso rediseñado */}
        <div className="text-center mb-6">
          <motion.div
            className="relative inline-flex items-center justify-center w-64 h-64 mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          >
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {/* Círculo base sutil */}
              <circle
                cx="50"
                cy="50"
                r="20"
                fill="none"
                stroke="rgba(255, 192, 203, 0.1)"
                strokeWidth="0.5"
              />
              
              {/* Líneas de referencia sutiles cada 7 días */}
              {[7, 14, 21, 28].map(day => {
                const angle = (day / 28) * 2 * Math.PI - Math.PI/2;
                const x1 = 50 + 45 * Math.cos(angle);
                const y1 = 50 + 45 * Math.sin(angle);
                const x2 = 50 + 55 * Math.cos(angle);
                const y2 = 50 + 55 * Math.sin(angle);
                
                return (
                  <line
                    key={day}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(156, 163, 175, 0.3)"
                    strokeWidth="0.5"
                  />
                );
              })}

              {/* Puntos de progreso */}
              <defs>
                {dots.map((dot, index) => (
                  <filter key={`glow-${index}`} id={`glow-${index}`}>
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                ))}
              </defs>

              {dots.map((dot, index) => (
                <g key={index}>
                  {/* Resplandor y aura del punto */}
                  {dot.isActive && (
                    <motion.circle
                      cx={dot.x}
                      cy={dot.y}
                      r={dot.isToday ? 8 : 2}
                      fill={dot.colors.glow}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.8 }}
                      transition={{
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                        duration: 0.8,
                        delay: 0.1 + (index * 0.02)
                      }}
                    />
                  )}
                  
                  {/* Punto principal */}
                  <motion.circle
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.isToday ? 5 : 3.5}
                    fill={dot.isActive ? (dot.isToday ? dot.colors.light : dot.colors.main) : '#e2e8f0'}
                    stroke="none"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.8 + (index * 0.02),
                      type: 'spring',
                      stiffness: 400,
                      damping: 25
                    }}

                  />

                  {/* Punto interior */}
                  {dot.isActive && (
                    <motion.circle
                      cx={dot.x}
                      cy={dot.y}
                      r="1.5"
                      fill="#ffffff"
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
            
            {/* Contenido central mejorado */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, type: 'spring', stiffness: 200 }}
              >
                <span className="text-5xl font-bold bg-gradient-to-br from-pink-500 via-rose-400 to-purple-400 bg-clip-text text-transparent block">
                  {cycleData.currentDay}
                </span>
                <span className="text-sm text-gray-500 font-medium mt-1 block">
                  día del ciclo
                </span>
              </motion.div>

              {/* Indicador de fase del ciclo */}
              <motion.div
                className="mt-3 px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-50 rounded-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
              >
                <span className="text-xs font-medium text-pink-700">
                  {cycleData.currentDay <= 7 ? 'Menstrual' : 
                   cycleData.currentDay <= 14 ? 'Folicular' :
                   cycleData.currentDay <= 21 ? 'Ovulatoria' : 'Lútea'}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Leyenda de colores */}
        <motion.div
          className="flex justify-center gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {[
            { color: '#fca5a5', label: 'Menstrual', symbol: 'red' },
            { color: '#fff7f7', label: 'Fértil', symbol: 'white' },
            { color: '#86efac', label: 'Infértil', symbol: 'green' },
            { color: '#f9a8d4', label: 'Spotting', symbol: 'spot' }
          ].map(item => (
            <div key={item.symbol} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-gray-600">{item.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Información relevante del ciclo */}
        <motion.div
          className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-4 text-sm text-gray-700 border border-pink-100/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <h3 className="font-semibold mb-2 text-gray-800 flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
            Información del ciclo
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-pink-800">CPM:</span>
              <span className="text-gray-600">Datos incompletos</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-pink-800">T-8</span>
              <span className="text-gray-600">Datos incompletos</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

const FloatingActionButton = ({ onAddRecord, onAddCycle }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-6 flex flex-col items-end space-y-3 z-40">
      {open && (
        <>
          <motion.button
            onClick={onAddRecord}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FilePlus className="h-5 w-5" />
          </motion.button>
          <motion.button
            onClick={onAddCycle}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-400 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <CalendarPlus className="h-5 w-5" />
          </motion.button>
        </>
      )}
      <motion.button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 bg-gradient-to-br from-pink-400 to-rose-400 text-white rounded-full shadow-lg flex items-center justify-center"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
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

  if (isLoading) {
    return <p className="text-center text-gray-500">Cargando...</p>;
  }

  if (!currentCycle?.id) {
    return <p className="text-center text-gray-500">No hay ciclo activo.</p>;
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-300 via-pink-300 to-purple-200 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <CycleOverviewCard cycleData={{ ...currentCycle, currentDay, records: currentCycle.data }} />
        </motion.div>
      </div>

      {showForm && (
        <DataEntryForm
          onSubmit={handleSave}
          onCancel={() => setShowForm(false)}
          cycleStartDate={currentCycle.startDate}
          cycleEndDate={currentCycle.endDate}
          isProcessing={isProcessing}
        />
      )}

      <FloatingActionButton
        onAddRecord={() => setShowForm(true)}
        onAddCycle={() => startNewCycle()}
      />
    </div>
  );
};

export default ModernFertilityDashboard;