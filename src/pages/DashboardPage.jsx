import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, FilePlus, CalendarPlus } from 'lucide-react';
import DataEntryForm from '@/components/DataEntryForm';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

const CycleOverviewCard = ({ cycleData }) => {
  const records = cycleData.records || [];

  // Colores más elegantes y distintivos
  const getSymbolColor = (symbolValue) => {
    switch(symbolValue) {
      case 'red': return {
        main: '#dc2626', // rojo más elegante para menstruación
        light: '#fecaca',
        glow: 'rgba(220, 38, 38, 0.3)'
      };
      case 'white': return {
        main: '#f8fafc', // blanco puro para días fértiles
        light: '#ffffff',
        glow: 'rgba(248, 250, 252, 0.6)',
        border: '#e2e8f0'
      };
      case 'green': return {
        main: '#059669', // verde esmeralda para días infértiles
        light: '#a7f3d0',
        glow: 'rgba(5, 150, 105, 0.3)'
      };
      case 'spot': return {
        main: '#ec4899', // rosa vibrante para spotting
        light: '#fbcfe8',
        glow: 'rgba(236, 72, 153, 0.3)'
      };
      default: return {
        main: '#f1f5f9', // gris suave por defecto
        light: '#f8fafc',
        glow: 'rgba(241, 245, 249, 0.2)'
      };
    }
  };

  // Crear puntos individuales en lugar de segmentos
  const createProgressDots = () => {
    const totalDays = Math.max(cycleData.currentDay, 28);
    const radius = 35; // Radio del círculo
    const dotRadius = 4; // Tamaño de cada punto

    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = records.find(r => r.cycleDay === day);
      const angle = (index / totalDays) * 2 * Math.PI - Math.PI/2; // Empezar desde arriba
      
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      
      const colors = day <= cycleData.currentDay && record 
        ? getSymbolColor(record.fertility_symbol) 
        : { main: '#e2e8f0', light: '#f8fafc', glow: 'rgba(226, 232, 240, 0.2)' };

      return {
        x,
        y,
        day,
        colors,
        isActive: day <= cycleData.currentDay,
        hasRecord: !!record,
        isToday: day === cycleData.currentDay
      };
    });
  };

  const dots = createProgressDots();

  return (
    <div className="relative">
      {/* Fecha actual - Parte superior */}
      <motion.div 
        className="text-center mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </h1>
        <p className="text-sm text-gray-500">
          Día {cycleData.currentDay} del ciclo
        </p>
      </motion.div>

      {/* Card principal */}
      <motion.div 
        className="bg-white rounded-3xl p-8 mb-6 shadow-xl shadow-pink-500/10 border border-pink-100/50"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso rediseñado */}
        <div className="text-center mb-8">
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
                  {/* Resplandor para el día actual */}
                  {dot.isToday && (
                    <motion.circle
                      cx={dot.x}
                      cy={dot.y}
                      r="4"
                      fill={dot.colors.glow}
                      initial={{ r: 0, opacity: 0 }}
                      animate={{ r: 8, opacity: 1 }}
                      transition={{
                        duration: 1.2,
                        delay: 0.8 + (index * 0.02),
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut"
                      }}
                    />
                  )}
                  
                  {/* Punto base */}
                  <motion.circle
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.isToday ? "5" : "3.5"}
                    fill={dot.isActive ? dot.colors.main : '#f1f5f9'}
                    stroke={dot.colors.border || 'rgba(255, 255, 255, 0.8)'}
                    strokeWidth={dot.isToday ? "2" : "1"}
                    opacity={dot.isActive ? 1 : 0.4}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: dot.isActive ? 1 : 0.4 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.8 + (index * 0.02),
                      type: 'spring',
                      stiffness: 400,
                      damping: 25
                    }}
                    filter={dot.isToday ? `url(#glow-${index})` : undefined}
                  />

                  {/* Punto interior para días con registros */}
                  {dot.hasRecord && dot.isActive && (
                    <motion.circle
                      cx={dot.x}
                      cy={dot.y}
                      r="1"
                      fill="rgba(255, 255, 255, 0.9)"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: 1.2 + (index * 0.02)
                      }}
                    />
                  )}

                  {/* Números de día para días clave */}
                  {(dot.day === 1 || dot.day % 7 === 0 || dot.day === cycleData.currentDay) && (
                    <motion.text
                      x={dot.x}
                      y={dot.y + (dot.y < 50 ? -8 : 12)}
                      textAnchor="middle"
                      className="text-xs font-medium"
                      fill={dot.isToday ? '#dc2626' : '#6b7280'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.8 }}
                      transition={{
                        duration: 0.3,
                        delay: 1.4 + (index * 0.02)
                      }}
                    >
                      {dot.day}
                    </motion.text>
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
                <span className="text-5xl font-bold bg-gradient-to-br from-pink-600 via-rose-600 to-purple-600 bg-clip-text text-transparent block">
                  {cycleData.currentDay}
                </span>
                <span className="text-sm text-gray-500 font-medium mt-1 block">
                  día del ciclo
                </span>
              </motion.div>

              {/* Indicador de fase del ciclo */}
              <motion.div
                className="mt-3 px-3 py-1 bg-gradient-to-r from-pink-100 to-rose-100 rounded-full"
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
            { color: '#dc2626', label: 'Menstrual', symbol: 'red' },
            { color: '#f8fafc', label: 'Fértil', symbol: 'white', border: '#e2e8f0' },
            { color: '#059669', label: 'Infértil', symbol: 'green' },
            { color: '#ec4899', label: 'Spotting', symbol: 'spot' }
          ].map(item => (
            <div key={item.symbol} className="flex items-center gap-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ 
                  backgroundColor: item.color,
                  border: item.border ? `1px solid ${item.border}` : 'none'
                }}
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
          <ul className="space-y-1">
            <li className="font-medium text-pink-800">CPM</li>
            <li className="ml-2 text-gray-600">Datos incompletos</li>
            <li className="font-medium pt-2 text-pink-800">T-8</li>
            <li className="ml-2 text-gray-600">Datos incompletos</li>
          </ul>
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
            className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg flex items-center justify-center"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FilePlus className="h-5 w-5" />
          </motion.button>
          <motion.button
            onClick={onAddCycle}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-500 text-white shadow-lg flex items-center justify-center"
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
        className="w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-full shadow-lg flex items-center justify-center"
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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-12">
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