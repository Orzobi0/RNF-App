import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Heart, Egg, Droplets, Activity, ChevronRight } from 'lucide-react';

// Mock data - en la implementación real vendría de tus hooks
const mockCurrentCycle = {
  startDate: '2025-08-01',
  currentDay: 17,
  fertileWindow: { preovulatory: 13, t8: 14 },
  phase: 'Fase folicular'
};

const mockTodayData = {
  temperature: null,
  cervicalMucus: null,
  bleeding: null,
  symptoms: []
};


const CycleOverviewCard = ({ cycleData, cycleData: { records = [] } = {} }) => {
  // Simular algunos registros para mostrar el efecto visual
  const mockRecords = [
    { day: 1, symbol: 'red' },
    { day: 2, symbol: 'red' },
    { day: 3, symbol: 'red' },
    { day: 4, symbol: 'spot' },
    { day: 8, symbol: 'green' },
    { day: 10, symbol: 'white' },
    { day: 12, symbol: 'white' },
    { day: 14, symbol: 'white' },
    { day: 16, symbol: 'green' }
  ];

  const getSymbolColor = (symbolValue) => {
    switch(symbolValue) {
      case 'red': return '#ef4444'; // rojo menstruación
      case 'white': return '#ffffff'; // blanco fértil
      case 'green': return '#22c55e'; // verde infértil
      case 'spot': return '#f472b6'; // rosa spotting
      default: return '#e2e8f0'; // gris por defecto
    }
  };

  const createProgressSegments = () => {
    const totalDays = 28;
    const segmentAngle = (2 * Math.PI) / totalDays;
    const radius = 45;
    const strokeWidth = 6;
    
    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = mockRecords.find(r => r.day === day);
      const startAngle = index * segmentAngle;
      const endAngle = (index + 1) * segmentAngle;
      
      const x1 = 50 + radius * Math.cos(startAngle - Math.PI/2);
      const y1 = 50 + radius * Math.sin(startAngle - Math.PI/2);
      const x2 = 50 + radius * Math.cos(endAngle - Math.PI/2);
      const y2 = 50 + radius * Math.sin(endAngle - Math.PI/2);
      
      const largeArc = endAngle - startAngle <= Math.PI ? "0" : "1";
      
      const pathData = [
        "M", x1, y1,
        "A", radius, radius, 0, largeArc, 1, x2, y2
      ].join(" ");
      
      return {
        path: pathData,
        color: day <= cycleData.currentDay && record ? getSymbolColor(record.symbol) : '#f1f5f9',
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
          Día {cycleData.currentDay} del ciclo • {cycleData.phase}
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
              
              {/* Indicador de fase con color */}
              <motion.div
                className="mt-2 px-3 py-1 rounded-full bg-gradient-to-r from-pink-100 to-rose-100 border border-pink-200"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2 }}
              >
                <span className="text-xs font-medium text-pink-700">
                  {cycleData.phase}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Información de ventana fértil mejorada */}
        {cycleData.fertileWindow.preovulatory && (
          <motion.div 
            className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center mr-4">
                  <Egg className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Ventana de fertilidad
                  </p>
                  <p className="text-xs text-gray-600">
                    Tasa de concepción alta
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-purple-600">
                  D{cycleData.fertileWindow.preovulatory}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 mx-auto mt-1" />
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

const TodaySection = ({ todayData, onAddRecord }) => {
  const hasData = todayData.temperature || todayData.cervicalMucus || todayData.bleeding || todayData.symptoms.length > 0;

  return (
    <motion.div 
      className="mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.6 }}
    >
      {!hasData ? (
        <motion.button
          onClick={onAddRecord}
          className="w-full bg-white border border-pink-100 rounded-3xl p-8 hover:bg-pink-50 transition-all duration-300 group shadow-lg shadow-pink-500/10"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-pink-500/25">
              <Plus className="h-10 w-10 text-white" />
            </div>
            <h4 className="text-xl font-bold text-gray-800 mb-2">
              Añadir registro
            </h4>
            <p className="text-sm text-gray-600 text-center max-w-xs">
              Registra tu temperatura, flujo cervical y síntomas de hoy
            </p>
          </div>
        </motion.button>
      ) : (
        <div className="bg-white rounded-3xl p-6 border border-pink-100 shadow-lg shadow-pink-500/10">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-gray-800">
              Registro de hoy
            </h4>
            <button 
              onClick={onAddRecord}
              className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-medium rounded-full hover:from-pink-600 hover:to-rose-600 transition-all duration-200"
            >
              Editar
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {todayData.temperature && (
              <div className="flex items-center p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center mr-3">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Temperatura</p>
                  <p className="text-lg font-bold text-red-600">
                    {todayData.temperature}°C
                  </p>
                </div>
              </div>
            )}
            
            {todayData.cervicalMucus && (
              <div className="flex items-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                  <Droplets className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Flujo cervical</p>
                  <p className="text-sm font-semibold text-blue-600">
                    {todayData.cervicalMucus}
                  </p>
                </div>
              </div>
            )}
            
            {todayData.bleeding && (
              <div className="flex items-center p-3 bg-pink-50 rounded-xl border border-pink-100">
                <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center mr-3">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Sangrado</p>
                  <p className="text-sm font-semibold text-pink-600">
                    {todayData.bleeding}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const FloatingActionButton = ({ onAddRecord }) => {
  return (
    <motion.button
      onClick={onAddRecord}
      className="fixed bottom-20 right-6 w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-full shadow-lg flex items-center justify-center z-40"
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

  const handleAddRecord = () => {

    // Aquí iría la lógica para mostrar el formulario de registro
    console.log('Abrir formulario de registro');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pb-20">
      {/* Contenido principal */}
      <div className="max-w-md mx-auto px-4 pt-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <CycleOverviewCard cycleData={mockCurrentCycle} />
          <TodaySection todayData={mockTodayData} onAddRecord={handleAddRecord} />
        </motion.div>
      </div>

      <FloatingActionButton onAddRecord={handleAddRecord} />
    </div>
  );
};

export default ModernFertilityDashboard;