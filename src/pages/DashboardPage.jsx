import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import DataEntryForm from '@/components/DataEntryForm';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

const CycleOverviewCard = ({ cycleData }) => {
  // Extrae los registros reales del ciclo
  const records = cycleData.records || [];

  // Devuelve el color asociado a cada símbolo de fertilidad

  const getSymbolColor = (symbolValue) => {
    switch(symbolValue) {
      case 'red': return '#ef4444'; // rojo menstruación
      case 'white': return '#ffffff'; // blanco fértil
      case 'green': return '#22c55e'; // verde infértil
      case 'spot': return '#f472b6'; // rosa spotting
      default: return '#e2e8f0'; // gris por defecto
    }
  };
  // Construye los segmentos del círculo en función de los registros
  const createProgressSegments = () => {
    const totalDays = Math.max(cycleData.currentDay, 28);
    const segmentAngle = (2 * Math.PI) / totalDays;
    const radius = 45;

    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = records.find(r => r.cycleDay === day);
      const startAngle = index * segmentAngle;
      const endAngle = (index + 1) * segmentAngle;
      
      const x1 = 50 + radius * Math.cos(startAngle - Math.PI/2);
      const y1 = 50 + radius * Math.sin(startAngle - Math.PI/2);
      const x2 = 50 + radius * Math.cos(endAngle - Math.PI/2);
      const y2 = 50 + radius * Math.sin(endAngle - Math.PI/2);
      
      const largeArc = endAngle - startAngle <= Math.PI ? '0' : '1';

      const pathData = [
        'M', x1, y1,
        'A', radius, radius, 0, largeArc, 1, x2, y2
      ].join(' ');

      return {
        path: pathData,
        color: day <= cycleData.currentDay && record ? getSymbolColor(record.fertility_symbol) : '#f1f5f9',
        opacity: day <= cycleData.currentDay ? 1 : 0.3
      };
    });
  };

  const segments = createProgressSegments();

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
        <p className="text-sm text-gray-500 capitalize">
          Día {cycleData.currentDay} del ciclo
        </p>
      </motion.div>

      {/* Card principal con fondo sólido */}
      <motion.div 
        className="bg-white rounded-3xl p-8 mb-6 shadow-xl shadow-pink-500/10 border border-pink-100/50"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso mejorado */}
        <div className="text-center mb-8">
          <motion.div
            className="relative inline-flex items-center justify-center w-40 h-40 mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          >
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Círculo base más sutil */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#f8fafc"
                strokeWidth="6"
              />
              
              {/* Segmentos de progreso con colores de fertilidad */}
              {segments.map((segment, index) => (
                <motion.path
                  key={index}
                  d={segment.path}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  opacity={segment.opacity}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ 
                    duration: 0.8, 
                    delay: 0.6 + (index * 0.02),
                    ease: "easeOut" 
                  }}
                />
              ))}
              
              {/* Círculo interior decorativo */}
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="rgba(236, 72, 153, 0.05)"
                strokeWidth="1"
              />
            </svg>
            
            {/* Contenido central mejorado */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="text-4xl font-bold bg-gradient-to-br from-pink-600 to-rose-600 bg-clip-text text-transparent"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, type: 'spring', stiffness: 200 }}
              >
                {cycleData.currentDay}
              </motion.span>
              <motion.span
                className="text-sm text-gray-500 font-medium mt-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
              >
                días
              </motion.span>
              
            </div>
          </motion.div>
        </div>

      </motion.div>
    </div>
  );
};



const FloatingActionButton = ({ onAddRecord }) => {
  return (
    <motion.button
      onClick={onAddRecord}
      className="fixed bottom-20 left-6 w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-full shadow-lg flex items-center justify-center z-40"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 1.6 }}
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  );
};

const ModernFertilityDashboard = () => {

  const { currentCycle, addOrUpdateDataPoint, isLoading } = useCycleData();
  const [showForm, setShowForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (isLoading) {
    return <p className="text-center text-gray-500">Cargando...</p>;
  }

  if (!currentCycle?.id) {
    return <p className="text-center text-gray-500">No hay ciclo activo.</p>;
  }

  // Calcula el día actual del ciclo
  const currentDay = differenceInDays(
    startOfDay(new Date()),
    parseISO(currentCycle.startDate)
  ) + 1;

  // Guarda el registro en la base de datos y cierra el formulario
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

      <FloatingActionButton onAddRecord={() => setShowForm(true)} />
    </div>
  );
};

export default ModernFertilityDashboard;