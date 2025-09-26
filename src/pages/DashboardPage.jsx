import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, FilePlus, CalendarPlus } from 'lucide-react';
import DataEntryForm from '@/components/DataEntryForm';
import NewCycleDialog from '@/components/NewCycleDialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCycleData } from '@/hooks/useCycleData';
import { addDays, differenceInDays, format, isAfter, parseISO, startOfDay } from 'date-fns';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import computePeakStatuses from '@/lib/computePeakStatuses';

const CycleOverviewCard = ({ cycleData, onEdit, onTogglePeak, currentPeakIsoDate }) => {
  const records = cycleData.records || [];
  const [activePoint, setActivePoint] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ clientX: 0, clientY: 0 });
  const circleRef = useRef(null);
  const cycleStartDate = cycleData.startDate ? parseISO(cycleData.startDate) : null;
  const today = startOfDay(new Date());
  const peakStatuses = useMemo(() => computePeakStatuses(records), [records]);

    // Ajustes del círculo de progreso
  const radius = 140; // radio del círculo
  const padding = 15; // margen alrededor del círculo
  const center = radius + padding;
  const viewBoxSize = center * 2;

  // Colores suaves con mejor contraste
  const getSymbolColor = (symbolValue) => {
    switch (symbolValue) {
      case 'red':
        return {
          main: '#ef4444',
          light: '#fee2e2',
          glow: 'rgba(239, 68, 68, 0.3)',
          border: 'none'
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
          light: '#22c55e',
          glow: 'rgba(34, 197, 94, 0.3)',
          border: 'none'
        };
        case 'yellow':
        return {
          main: '#facc15',
          light: '#fef08a',
          glow: 'rgba(250, 204, 21, 0.3)',
          border: 'none'
        };
      case 'spot':
        return {
          main: '#ef4444',
          light: '#ef4444',
          glow: 'rgba(239, 68, 68, 0.3)',
          border: '#fee2e2',
          pattern: 'url(#spotting-pattern-dashboard)'
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

    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      const record = records.find((r) => r.cycleDay === day);
      const placeholderDate = cycleStartDate ? addDays(cycleStartDate, index) : null;
      const isoDate = placeholderDate ? format(placeholderDate, 'yyyy-MM-dd') : null;
      const isFutureDay = placeholderDate ? isAfter(startOfDay(placeholderDate), today) : false;
      const recordWithCycleDay = record ? { ...record, cycleDay: record.cycleDay ?? day } : null;
      const angle = (index / totalDays) * 2 * Math.PI - Math.PI / 2;

      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      
      let colors = day <= cycleData.currentDay && recordWithCycleDay
        ? getSymbolColor(recordWithCycleDay.fertility_symbol)
        : { main: '#b5b6ba', light: '#c8cacf', glow: 'rgba(229, 231, 235, 0.3)' };

      const isToday = day === cycleData.currentDay;
      if (isToday) {
        if (recordWithCycleDay) {
          colors = {
            ...getSymbolColor(recordWithCycleDay.fertility_symbol),
            border: 'rgba(251, 113, 133, 0.8)'
          };
        } else {
          colors = {
            main: 'transparent',
            light: 'transparent',
            glow: 'rgba(251, 113, 133, 0.4)',
            border: 'rgba(251, 113, 133, 0.8)'
          };
        }
      }
      const peakStatus = isoDate ? peakStatuses[isoDate] || null : null;
      return {
        x,
        y,
        day,
        colors,
        isActive: day <= cycleData.currentDay,
        isToday,
        hasRecord: !!recordWithCycleDay,
        record: recordWithCycleDay,
        isoDate,
        canShowPlaceholder: Boolean(!recordWithCycleDay && isoDate && !isFutureDay),
        peakStatus,
      };
    });
  };

  const dots = createProgressDots();

  const handleDotClick = (dot, event) => {
    event.stopPropagation();
    if (!circleRef.current) {
      setActivePoint(null);
      return;
    }
    const rect = circleRef.current.getBoundingClientRect();
    let clientX, clientY;
    if (event.touches && event.touches[0]) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    const placeholderRecord = dot.canShowPlaceholder && dot.isoDate
      ? {
          id: `placeholder-${dot.isoDate}`,
          isoDate: dot.isoDate,
          cycleDay: dot.day,
          fertility_symbol: null,
          mucus_sensation: '',
          mucusSensation: '',
          mucus_appearance: '',
          mucusAppearance: '',
          observations: '',
          temperature_chart: null,
          displayTemperature: null,
          ignored: false,
          peakStatus: dot.peakStatus,
          peak_marker: dot.peakStatus === 'P' ? 'peak' : null,
        }
      : null;

    const targetRecord = dot.record
      ? {
          ...dot.record,
          cycleDay: dot.record.cycleDay ?? dot.day,
          peakStatus: dot.peakStatus,
          peak_marker:
            dot.record.peak_marker ?? (dot.peakStatus === 'P' ? 'peak' : null),
        }
      : placeholderRecord;
    if (targetRecord && currentPeakIsoDate && targetRecord.isoDate === currentPeakIsoDate) {
      targetRecord.peak_marker = 'peak';
      targetRecord.peakStatus = targetRecord.peakStatus || 'P';
    }
  

    if (!targetRecord) {
      setActivePoint(null);
      return;
    }

    setTooltipPosition({
      clientX: clientX - rect.left,
      clientY: clientY - rect.top
    });
    setActivePoint(targetRecord);
  };

  useEffect(() => {
    if (!activePoint) return;
    const handleOutside = (e) => {
      if (circleRef.current && !circleRef.current.contains(e.target)) {
        setActivePoint(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [activePoint]);

  return (
    <div className="relative flex flex-col flex-1 min-h-full overflow-y-hidden">
      {/* Fecha actual - Parte superior con padding reducido */}
      <motion.div
        className="px-4 pt-5 pb-4 text-center flex-shrink-0"
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
          Ciclo actual
        </p>
      </motion.div>

      {/* Contenedor principal con flex-grow para usar todo el espacio disponible */}
        <motion.div
          className="px-4 flex-grow flex flex-col justify-start mt-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso redimensionado */}
        <div className="text-center mb-4 flex-shrink-0">
          <motion.div
            ref={circleRef}
            className="relative inline-flex items-center justify-center mb-4"
            style={{ width: viewBoxSize, height: viewBoxSize }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          >
            <svg
              className="w-full h-full"
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              onClick={() => setActivePoint(null)}
            >
              <defs>
                <pattern id="spotting-pattern-dashboard" patternUnits="userSpaceOnUse" width="6" height="6">
                  <rect width="6" height="6" fill="#ef4444" />
                  <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
                </pattern>
                <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.0)" />
                <stop offset="60%" stopColor="rgba(244,114,182,0.12)" />
                <stop offset="100%" stopColor="rgba(190,24,93,0.10)" />
                </radialGradient>
              </defs>
              {/* Círculo base sutil */}
              <circle
                cx={center}
                cy={center}
                r={radius - 30}
                fill="url(#ringGlow)"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.5"
              />
              
              

              {/* Puntos de progreso */}
              {dots.map((dot, index) => (
                <g key={index}>
                  {/* Sombra del punto */}
                  {!(dot.isToday && !dot.hasRecord) && dot.isActive && (
                    <circle
                      cx={dot.x + 0.3}
                      cy={dot.y + 0.3}
                      r={dot.isToday ? 11 : 10}
                      fill="rgba(0, 0, 0, 0.2)"
                      opacity={0.5}
                    />
                  )}
                  {/* Anillo pulsante para el día actual */}
                  {dot.isToday && (
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={8.5}
                      fill="none"
                      stroke="rgba(244,63,94,0.8)"
                      strokeWidth={3}
                      className="animate-pulse"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Punto principal */}
                  <motion.circle
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.isToday ? 11 : 10}
                    fill={
                      dot.colors.pattern
                        || (dot.isActive && dot.hasRecord
                          ? dot.colors.main
                          : 'rgba(255,255,255,0.001)')
                    }
                    stroke={dot.colors.border === 'none' ? 'none' : dot.colors.border || 'rgba(158,158,158,0.4)'}
                    strokeWidth={dot.colors.border === 'none'
                      ? 0
                      : (dot.isToday
                        ? 1.8
                        : (dot.colors.border ? 0.6 : 0.8))}
                    onClick={(e) => handleDotClick(dot, e)}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.8 + index * 0.02,
                      type: 'spring',
                      stiffness: 400,
                      damping: 25
                    }}
                    style={{
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                      cursor: 'pointer'
                    }}
                  />
                {dot.peakStatus && (
                    dot.peakStatus === 'P' ? (
                      <g pointerEvents="none">
                        <line
                          x1={dot.x - 6}
                          y1={dot.y - 6}
                          x2={dot.x + 6}
                          y2={dot.y + 6}
                          stroke="#7f1d1d"
                          strokeWidth={2}
                        />
                        <line
                          x1={dot.x + 6}
                          y1={dot.y - 6}
                          x2={dot.x - 6}
                          y2={dot.y + 6}
                          stroke="#7f1d1d"
                          strokeWidth={2}
                        />
                      </g>
                    ) : (
                      <text
                        x={dot.x}
                        y={dot.y + 4}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="800"
                        fill="#7f1d1d"
                        style={{ pointerEvents: 'none' }}
                      >
                        {dot.peakStatus}
                      </text>
                    )
                  )}

                </g>
              ))}
            </svg>
                        {activePoint && (
              <div onClick={(e) => e.stopPropagation()}>
                <ChartTooltip
                  point={activePoint}
                  position={tooltipPosition}
                  chartWidth={circleRef.current?.clientWidth || 0}
                  chartHeight={circleRef.current?.clientHeight || 0}
                  onEdit={onEdit}
                  onClose={() => setActivePoint(null)}
                  onTogglePeak={onTogglePeak}
                  currentPeakIsoDate={currentPeakIsoDate}
                />
              </div>
            )}

            
            {/* Contenido central */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <motion.div
                className="text-center  backdrop-blur-md rounded-full p-4"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, type: 'spring', stiffness: 200 }}
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
              >
                <span className="text-5xl font-bold text-pink-700 block">
                  {cycleData.currentDay}
                </span>
                <span className="text-800 text-pink-700 font-medium mt-0.5 block">
                  día del ciclo
                </span>
              </motion.div>

              {/* Indicador de fase del ciclo */}
              <motion.div
                className="mt-2 px-2.5 py-1  backdrop-blur-sm rounded-full border border-pink-200"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
              >
                <span className="text-md font-medium text-pink-900">
                  {cycleData.currentDay <= 7 ? 'Menstrual' : 
                   cycleData.currentDay <= 14 ? 'Folicular' :
                   cycleData.currentDay <= 21 ? 'Ovulatoria' : 'Lútea'}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Leyenda e información del ciclo con diseño mejorado */}
        <div className="grid grid-cols-2 gap-4 mx-2 mb-10 mt-2 flex-shrink-0">
          
          {/* Leyenda de colores */}
          <motion.div
            className="relative bg-gradient-to-br from-pink-50/90 to-rose-50/90 backdrop-blur-md rounded-3xl p-4 border border-pink-200/30"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            style={{
              filter: 'drop-shadow(0 8px 25px rgba(236,72,153,0.08))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)'
            }}
          >
            
            <h3 className="font-bold mb-6 text-gray-800 flex items-center gap-2 justify-center text-xs tracking-wide uppercase">
            Símbolos
            </h3>
            
            {/* Grid de símbolos refinado */}
            <div className="grid grid-cols-2 gap-2.5">              
              {[
                { label: 'Menstrual', color: '#ef4444' },
                { label: 'Moco (Fértil)', color: '#f8fafc', stroke: '#c2c6cc' },
                { label: 'Seco (Rel. Infértil)', color: '#22c55e' },
                { label: 'Moco (No fértil)', color: '#facc15', stroke: '#fef08a' },
                { label: 'Spotting', color: '#ef4444', stroke: '#fee2e2', pattern: true },
                { label: 'Hoy', isToday: true }
              ].map(item => (
                <div key={item.label} className="flex flex-col items-center gap-1.5">
                  {item.isToday ? (
                    <div className="relative flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border border-rose-400/80 bg-transparent" />
                      <div className="absolute inset-0 -m-1 rounded-full border-[3px] border-rose-500/80 animate-pulse" />
                      
                    </div>
                  ) : (
                    <div
                      className={`w-4 h-4 rounded-full border ${item.pattern ? 'pattern-bg' : ''}`}
                      style={{
                        backgroundColor: item.color,
                        borderColor: item.stroke || 'transparent'
                      }}
                    />
                  )}
                  <span
                    className={`text-xs font-medium text-center leading-none ${
                      item.isToday ? 'text-gray-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>       
              ))}
            </div>
            <div className="absolute top-3 right-4 w-2 h-2 bg-gradient-to-br from-pink-300/40 to-rose-400/40 rounded-full" />
          </motion.div>

          {/* Información del ciclo con diseño tipo card premium */}
          <motion.div
            className="relative bg-gradient-to-br from-pink-50/70 to-rose-50/50 backdrop-blur-md rounded-3xl p-4 border border-pink-200/40"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            style={{
              filter: 'drop-shadow(0 8px 25px rgba(236,72,153,0.1))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)'
            }}
          >
            <h3 className="font-bold mb-3 text-gray-800 flex items-center gap-2 justify-center text-xs tracking-wide uppercase">
              
              Cálculo
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
                  <span className="text-xs text-gray-600 font-medium">Sin datos</span>
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
                  <span className="text-xs text-gray-600 font-medium">Sin datos</span>
                </div>
              </div>
            </div>
            
            {/* Decoración sutil en la esquina */}
            <div className="absolute top-3 right-4 w-2 h-2 bg-gradient-to-br from-pink-500/40 to-rose-400/40 rounded-full"/>
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
  const [editingRecord, setEditingRecord] = useState(null);
  const isPlaceholderRecord = Boolean(
    editingRecord && String(editingRecord.id || '').startsWith('placeholder-')
  );
  const currentPeakIsoDate = useMemo(() => {
    const peakRecord = currentCycle?.data?.find((record) => record?.peak_marker === 'peak');
    return peakRecord?.isoDate || null;
  }, [currentCycle?.data]);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
  }, []);

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleEdit = useCallback((record) => {
    setEditingRecord(record);
    setShowForm(true);
  }, []);

    const handleTogglePeak = useCallback(
    async (record, shouldMarkAsPeak = true) => {
      if (!currentCycle?.id || !record?.isoDate) {
        return;
      }

      const normalizeMeasurementValue = (value) => {
        if (value === null || value === undefined || value === '') {
          return null;
        }
        const parsed = parseFloat(String(value).replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const markAsPeak = shouldMarkAsPeak ?? !(
        record.peak_marker === 'peak' || record.peakStatus === 'P'
      );

      try {
        const fallbackTime = record.timestamp
          ? format(parseISO(record.timestamp), 'HH:mm')
          : format(new Date(), 'HH:mm');

        let measurementsSource = Array.isArray(record.measurements) && record.measurements.length > 0
          ? record.measurements
          : [
              {
                temperature: record.temperature_chart ?? record.temperature_raw ?? null,
                temperature_corrected: record.temperature_corrected ?? null,
                time: record.time ?? fallbackTime,
                time_corrected: record.time_corrected ?? fallbackTime,
                selected: true,
                use_corrected: record.use_corrected ?? false,
              },
            ];

        if (measurementsSource.length === 0) {
          measurementsSource = [
            {
              temperature: null,
              temperature_corrected: null,
              time: fallbackTime,
              time_corrected: fallbackTime,
              selected: true,
              use_corrected: false,
            },
          ];
        }

        const normalizedMeasurements = measurementsSource.map((measurement, index) => {
          const timeValue = measurement.time || fallbackTime;
          const correctedTime = measurement.time_corrected || timeValue;

          return {
            temperature: normalizeMeasurementValue(
              measurement.temperature ?? measurement.temperature_raw
            ),
            time: timeValue,
            selected: index === 0 ? true : !!measurement.selected,
            temperature_corrected: normalizeMeasurementValue(
              measurement.temperature_corrected
            ),
            time_corrected: correctedTime,
            use_corrected: !!measurement.use_corrected,
          };
        });

        if (!normalizedMeasurements.some((measurement) => measurement.selected)) {
          normalizedMeasurements[0].selected = true;
        }

        const payload = {
          isoDate: record.isoDate,
          measurements: normalizedMeasurements,
          mucusSensation: record.mucus_sensation ?? record.mucusSensation ?? '',
          mucusAppearance: record.mucus_appearance ?? record.mucusAppearance ?? '',
          fertility_symbol: record.fertility_symbol ?? 'none',
          observations: record.observations ?? '',
          ignored: record.ignored ?? false,
          peak_marker: markAsPeak ? 'peak' : null,
        };

        const existingRecord =
          record?.id && !String(record.id).startsWith('placeholder-') ? record : null;

        await addOrUpdateDataPoint(payload, existingRecord);
      } catch (error) {
        console.error('Error toggling peak marker from dashboard:', error);
      }
    },
    [addOrUpdateDataPoint, currentCycle?.id]
  );

  if (isLoading && !currentCycle?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <p className="text-center text-gray-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-br ffrom-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
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
      await addOrUpdateDataPoint(data, editingRecord);
      setShowForm(false);
      setEditingRecord(null);
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
    <div className="min-h-[calc(100dvh-var(--bottom-nav-safe))] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative overflow-hidden flex flex-col">
      <div
  className="pointer-events-none absolute inset-0"
  style={{
    background:
      'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
  }}
/>
      <div className="max-w-md mx-auto flex-1 w-full flex flex-col">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col"
        >
          <CycleOverviewCard
            cycleData={{ ...currentCycle, currentDay, records: currentCycle.data }}
            onEdit={handleEdit}
            onTogglePeak={handleTogglePeak}
            currentPeakIsoDate={currentPeakIsoDate}
          />
        </motion.div>
      </div>

      <Dialog
        open={showForm}
                onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          } else {
            handleCloseForm();
          }
        }}
      >
          <DialogContent
          hideClose
          className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
        >
          <DataEntryForm
            onSubmit={handleSave}
            onCancel={handleCloseForm}
            initialData={editingRecord}
            cycleStartDate={currentCycle.startDate}
            cycleEndDate={currentCycle.endDate}
            isProcessing={isProcessing}
            isEditing={!!editingRecord && !isPlaceholderRecord}
            cycleData={currentCycle.data}
            onDateSelect={handleDateSelect}
          />
        </DialogContent>
      </Dialog>

      <FloatingActionButton
        onAddRecord={() => { setEditingRecord(null); setShowForm(true); }}
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