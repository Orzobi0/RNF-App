import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  FilePlus,
  CalendarPlus,
  Edit,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import { useToast } from '@/components/ui/use-toast';
import NewCycleDialog from '@/components/NewCycleDialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCycleData } from '@/hooks/useCycleData';
import { addDays, differenceInDays, format, isAfter, parseISO, startOfDay } from 'date-fns';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import computePeakStatuses from '@/lib/computePeakStatuses';

const CycleOverviewCard = ({ cycleData, onEdit, onTogglePeak, currentPeakIsoDate, onEditStartDate = () => {} }) => {
  const records = cycleData.records || [];
  const [activePoint, setActivePoint] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ clientX: 0, clientY: 0 });
  const [wheelOffset, setWheelOffset] = useState(0);
  const hasInitializedWheelRef = useRef(false);
  const touchStartXRef = useRef(null);
  const circleRef = useRef(null);
  const cycleStartDate = cycleData.startDate ? parseISO(cycleData.startDate) : null;
  const today = startOfDay(new Date());
  const peakStatuses = useMemo(() => computePeakStatuses(records), [records]);

    // Ajustes del círculo de progreso
  const totalDots = 28;
  const radius = 140;
  const padding = 15;
  const center = radius + padding;
  const viewBoxSize = center * 2;

  const totalCycleDays = useMemo(() => {
    const maxRecordDay = records.reduce((maxValue, record) => {
      const recordDay = record?.cycleDay ?? null;

      if (recordDay) {
        return Math.max(maxValue, recordDay);
      }

      if (!cycleStartDate || !record?.isoDate) {
        return maxValue;
      }

      try {
        const parsedIso = parseISO(record.isoDate);
        const calculatedDay = differenceInDays(parsedIso, cycleStartDate) + 1;

        return Number.isFinite(calculatedDay)
          ? Math.max(maxValue, calculatedDay)
          : maxValue;
      } catch (error) {
        console.error('Error calculating record day for wheel:', error);
        return maxValue;
      }
    }, 0);

    return Math.max(cycleData.currentDay, maxRecordDay, totalDots);
  }, [cycleData.currentDay, records, cycleStartDate, totalDots]);

  const maxOffset = Math.max(totalCycleDays - totalDots, 0);
  const hasOverflow = maxOffset > 0;

  useEffect(() => {
    if (!hasOverflow) {
      hasInitializedWheelRef.current = true;
      setWheelOffset(0);
      return;
    }

    setWheelOffset((previous) => {
      const clampedPrevious = Math.min(previous, maxOffset);
      const desiredOffset = Math.max(
        0,
        Math.min(Math.max(cycleData.currentDay - totalDots, 0), maxOffset)
      );
      const isCurrentDayVisible =
        cycleData.currentDay >= clampedPrevious + 1 &&
        cycleData.currentDay <= clampedPrevious + totalDots;

      if (!hasInitializedWheelRef.current) {
        hasInitializedWheelRef.current = true;
        return desiredOffset;
      }

      if (!isCurrentDayVisible) {
        return desiredOffset;
      }

      if (clampedPrevious !== previous) {
        return clampedPrevious;
      }

      return previous;
    });
  }, [hasOverflow, maxOffset, cycleData.currentDay, totalDots]);

  const clampOffset = useCallback(
    (value) => Math.max(0, Math.min(value, maxOffset)),
    [maxOffset]
  );

  const changeOffset = useCallback(
    (delta) => {
      if (!hasOverflow || delta === 0) {
        return;
      }

      setWheelOffset((previous) => clampOffset(previous + delta));
    },
    [clampOffset, hasOverflow]
  );

  const handleWheelScroll = useCallback(
    (event) => {
      if (!hasOverflow) {
        return;
      }

      event.preventDefault();
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;

      if (delta === 0) {
        return;
      }

      changeOffset(delta > 0 ? 1 : -1);
    },
    [changeOffset, hasOverflow]
  );

  const handleTouchStart = useCallback((event) => {
    if (!hasOverflow) {
      return;
    }

    touchStartXRef.current = event.touches?.[0]?.clientX ?? null;
  }, [hasOverflow]);

  const handleTouchMove = useCallback(
    (event) => {
      if (!hasOverflow || touchStartXRef.current === null) {
        return;
      }

      const currentX = event.touches?.[0]?.clientX ?? null;

      if (currentX === null) {
        return;
      }

      const deltaX = currentX - touchStartXRef.current;

      if (Math.abs(deltaX) < 24) {
        return;
      }

      changeOffset(deltaX < 0 ? 1 : -1);
      touchStartXRef.current = currentX;
    },
    [changeOffset, hasOverflow]
  );

  const handleTouchEnd = useCallback(() => {
    touchStartXRef.current = null;
  }, []);

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
  const recordsByDay = useMemo(() => {
    return records.reduce((map, record) => {
      if (!record) {
        return map;
      }

      const numericDay = Number(record.cycleDay);

      if (Number.isFinite(numericDay) && numericDay > 0) {
        if (!map.has(numericDay)) {
          map.set(numericDay, record);
        }
        return map;
      }

      if (!cycleStartDate || !record.isoDate) {
        return map;
      }

      try {
        const parsedIso = parseISO(record.isoDate);
        const calculatedDay = differenceInDays(parsedIso, cycleStartDate) + 1;

        if (Number.isFinite(calculatedDay) && calculatedDay > 0 && !map.has(calculatedDay)) {
          map.set(calculatedDay, { ...record, cycleDay: calculatedDay });
        }
      } catch (error) {
        console.error('Error mapping record by day for wheel:', error);
      }

    return map;
    }, new Map());
  }, [records, cycleStartDate]);

  const createProgressDots = () => {
    return Array.from({ length: totalDots }, (_, index) => {
      const day = wheelOffset + index + 1;
      const record = recordsByDay.get(day) ?? null;
      const placeholderDate = cycleStartDate ? addDays(cycleStartDate, day - 1) : null;
      const isoDate = placeholderDate ? format(placeholderDate, 'yyyy-MM-dd') : null;
      const isFutureDay = placeholderDate ? isAfter(startOfDay(placeholderDate), today) : false;
      const recordWithCycleDay = record ? { ...record, cycleDay: record.cycleDay ?? day } : null;
      const angle = ((index + wheelOffset) / totalDots) * 2 * Math.PI - Math.PI / 2;
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
  const wheelRotationDegrees = (wheelOffset * 360) / totalDots;

  const rotationRadians = (-wheelRotationDegrees * Math.PI) / 180;
  const cosRotation = Math.cos(rotationRadians);
  const sinRotation = Math.sin(rotationRadians);

  const rotatePoint = useCallback(
    (x, y) => {
      const dx = x - center;
      const dy = y - center;

      return {
        x: center + dx * cosRotation - dy * sinRotation,
        y: center + dx * sinRotation + dy * cosRotation,
      };
    },
    [center, cosRotation, sinRotation]
  );


  const stepAngleRadians = (2 * Math.PI) / totalDots;
  const seamAngle = -Math.PI / 2 - stepAngleRadians / 2;
  const seamInnerRadius = radius - 18;
  const seamOuterRadius = radius + 10;
  const seamStartX = center + seamInnerRadius * Math.cos(seamAngle);
  const seamStartY = center + seamInnerRadius * Math.sin(seamAngle);
  const seamEndX = center + seamOuterRadius * Math.cos(seamAngle);
  const seamEndY = center + seamOuterRadius * Math.sin(seamAngle);
  

  useEffect(() => {
    if (!hasOverflow) {
      return;
    }

    setActivePoint(null);
  }, [wheelOffset, hasOverflow]);

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
        className="px-4 pt-4 pb-3 text-center flex-shrink-0"
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
                <button
          type="button"
          onClick={onEditStartDate}
          className="text-sm font-medium text-pink-700 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 focus:ring-offset-transparent hover:bg-white/40"
          title="Editar fecha de inicio del ciclo"
        >
          <Edit className="w-4 h-4" />
          Ciclo actual
        </button>
      </motion.div>

      {/* Contenedor principal con flex-grow para usar todo el espacio disponible */}
        <motion.div
          className="px-4 flex-grow flex flex-col justify-start mt-2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Círculo de progreso redimensionado */}
        <div className="text-center mb-3 flex-shrink-0">
          <motion.div
            ref={circleRef}
            className="relative inline-flex items-center justify-center mb-4"
            style={{ width: viewBoxSize, height: viewBoxSize }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
            onWheel={handleWheelScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
              {hasOverflow && (
                <line
                  x1={seamStartX}
                  y1={seamStartY}
                  x2={seamEndX}
                  y2={seamEndY}
                  stroke="rgba(244,63,94,0.55)"
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              )}

              {/* Puntos de progreso */}
              <motion.g
                transition={{ type: 'spring', stiffness: 100, damping: 22 }}
                initial={false}
                animate={{
                  rotate: -wheelRotationDegrees
                }}
                style={{ transformOrigin: 'center', transformBox: 'view-box' }}
              >
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
                      duration: 0.2,
                      delay: 0.1,
                      type: 'tween',
                      stiffness: 400,
                      damping: 25
                    }}
                    style={{
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                      cursor: 'pointer'
                    }}
                  />
                </g>
                ))}
              </motion.g>

              {dots.map((dot, index) => {
                if (!dot.peakStatus) {
                  return null;
                }

                const { x: labelX, y: labelY } = rotatePoint(dot.x, dot.y);
                const baseProps = {
                  key: `peak-${index}`,
                  x: labelX,
                  y: labelY + 4,
                  textAnchor: 'middle',
                  initial: { scale: 0.2, opacity: 0 },
                  animate: { scale: 1, opacity: 1 },
                  transition: {
                    delay: 0.95 + index * 0.02,
                    type: 'spring',
                    stiffness: 320,
                    damping: 22,
                  },
                };

                if (dot.peakStatus === 'P') {
                  return (
                    <motion.text
                      {...baseProps}
                      fontSize="14"
                      fontWeight="900"
                      fill="#ec4899"
                      style={{
                        pointerEvents: 'none',
                        filter: 'drop-shadow(0 2px 4px rgba(244, 114, 182, 0.35))',
                      }}
                    >
                      ✖
                    </motion.text>
                  );
                }

                return (
                  <motion.text
                    {...baseProps}
                    fontSize="12"
                    fontWeight="800"
                    fill="#7f1d1d"
                    style={{ pointerEvents: 'none' }}
                  >
                    {dot.peakStatus}
                  </motion.text>
                );
              })}
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
          {hasOverflow && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="p-2 rounded-full bg-white/60 text-rose-500 shadow-sm border border-rose-200/60 transition hover:bg-white"
                onClick={() => changeOffset(-1)}
                disabled={wheelOffset === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-1">
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-rose-500">
                    Día {wheelOffset + 1}
                  </span>
                  <span className="text-xs text-rose-400">•</span>
                  <span className="text-xs font-medium text-rose-500">
                    Día {Math.min(wheelOffset + totalDots, totalCycleDays)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxOffset}
                  value={wheelOffset}
                  onChange={(event) => setWheelOffset(clampOffset(Number(event.target.value)))}
                  className="w-44 accent-rose-500"
                />
              </div>
              <button
                type="button"
                className="p-2 rounded-full bg-white/60 text-rose-500 shadow-sm border border-rose-200/60 transition hover:bg-white"
                onClick={() => changeOffset(1)}
                disabled={wheelOffset === maxOffset}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Leyenda e información del ciclo con diseño mejorado */}
        <div className="grid grid-cols-2 gap-4 mx-2 mb-6 mt-2 flex-shrink-0">
          
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

            <h3 className="font-bold mb-4 text-gray-800 flex items-center gap-2 justify-center text-xs tracking-wide uppercase">
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
            onClick={onAddCycle}
            className="flex items-center gap-3 px-4 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(147, 51, 234, 0.3))' }}
          >
            <CalendarPlus className="h-5 w-5" />
            <span className="text-sm font-medium tracking-tight">Nuevo ciclo</span>
          </motion.button>
          <motion.button
            onClick={onAddRecord}
            className="flex items-center gap-3 px-4 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg"
            whileTap={{ scale: 0.80 }}
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
          >
            <FilePlus className="h-5 w-5" />
            <span className="text-sm font-medium tracking-tight">Añadir registro</span>
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
        <motion.span animate={{ rotate: open ? 135 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
          <Plus className="h-6 w-6" />
        </motion.span>
      </motion.button>
    </div>
  );
};

const ModernFertilityDashboard = () => {
  const {
    currentCycle,
    addOrUpdateDataPoint,
    startNewCycle,
    isLoading,
    updateCycleDates,
    checkCycleOverlap,
    forceUpdateCycleStart,
    refreshData,
  } = useCycleData();
  const { toast } = useToast();
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => currentCycle?.startDate || '');
  const [dateError, setDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);

  useEffect(() => {
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate]);

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
  }, []);

  const handleOpenStartDateEditor = useCallback(() => {
    setDraftStartDate(currentCycle?.startDate || '');
    setDateError('');
    resetStartDateFlow();
    setShowStartDateEditor(true);
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const handleCloseStartDateEditor = useCallback(() => {
    setShowStartDateEditor(false);
    setDateError('');
    resetStartDateFlow();
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const handleCancelOverlapStart = useCallback(() => {
    resetStartDateFlow();
  }, [resetStartDateFlow]);

  const handleSaveStartDate = useCallback(async () => {
    if (!draftStartDate) {
      setDateError('La fecha de inicio es obligatoria');
      return;
    }

    if (!currentCycle?.id) {
      return;
    }

    setDateError('');
    setIsUpdatingStartDate(true);

    try {
      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(currentCycle.id, draftStartDate)
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        setOverlapCycle(overlap);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(currentCycle.id, draftStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      handleCloseStartDateEditor();
    } catch (error) {
      console.error('Error updating start date from dashboard:', error);
      setDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
    }
  }, [
    draftStartDate,
    currentCycle?.id,
    checkCycleOverlap,
    updateCycleDates,
    refreshData,
    toast,
    handleCloseStartDateEditor,
  ]);

  const handleConfirmOverlapStart = useCallback(async () => {
    if (!currentCycle?.id || !pendingStartDate) {
      resetStartDateFlow();
      return;
    }

    setIsUpdatingStartDate(true);
    setShowOverlapDialog(false);

    try {
      await forceUpdateCycleStart(currentCycle.id, pendingStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      handleCloseStartDateEditor();
    } catch (error) {
      console.error('Error forcing start date from dashboard:', error);
      setDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
      resetStartDateFlow();
    }
  }, [
    currentCycle?.id,
    pendingStartDate,
    forceUpdateCycleStart,
    refreshData,
    toast,
    handleCloseStartDateEditor,
    resetStartDateFlow,
  ]);

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

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
      }
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
            onEditStartDate={handleOpenStartDateEditor}
          />
          <Dialog
            open={showStartDateEditor}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseStartDateEditor();
              }
            }}
          >
            <DialogContent
              hideClose
              className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
            >
              <CycleDatesEditor
                cycle={currentCycle}
                startDate={draftStartDate}
                endDate={currentCycle.endDate}
                onStartDateChange={(value) => setDraftStartDate(value)}
                onSave={handleSaveStartDate}
                onCancel={handleCloseStartDateEditor}
                isProcessing={isUpdatingStartDate}
                dateError={dateError}
                includeEndDate={false}
                showOverlapDialog={showOverlapDialog}
                overlapCycle={overlapCycle}
                onConfirmOverlap={handleConfirmOverlapStart}
                onCancelOverlap={handleCancelOverlapStart}
                onClearError={() => setDateError('')}
                saveLabel="Guardar cambios"
                title="Editar fecha de inicio"
                description="Selecciona una nueva fecha de inicio para el ciclo actual. Los registros se reorganizarán automáticamente."
                className="w-full"
              />
            </DialogContent>
          </Dialog>
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