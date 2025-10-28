import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  FilePlus,
  CalendarPlus,
  Edit,
  Pencil,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import { useToast } from '@/components/ui/use-toast';
import NewCycleDialog from '@/components/NewCycleDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useCycleData } from '@/hooks/useCycleData';
import { addDays, differenceInDays, format, isAfter, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { computeOvulationMetrics } from '@/hooks/useFertilityChart';

const CycleOverviewCard = ({ cycleData,
  onEdit,
  onTogglePeak,
  currentPeakIsoDate,
  onEditStartDate = () => {},
  formattedCpmValue = '-',
  cpmInfoText = 'Sin datos',
  handleOpenCpmDialog = () => {},
  formattedT8Value = '-',
  handleOpenT8Dialog = () => {},
}) => {
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
          border: 'none'
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
          glow: 'rgba(209, 213, 219, 0.3)',
          border: 'none'
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
    <div className="relative flex flex-1 flex-col overflow-y-hidden">
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
                      opacity={1}
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
                  <div className="w-1 h-1 bg-pink-400 rounded-full" />
                  <div className="font-bold text-pink-800 text-xs">CPM</div>
                  <div className="w-1 h-1 bg-pink-400 rounded-full" />
                </div>
                <div className="flex w-full items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleOpenCpmDialog}
                    className="group relative flex h-16 w-16 flex-col items-center justify-center rounded-full bg-gradient-to-br from-white via-pink-50/30 to-rose-50/40 text-pink-700 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-transparent border border-pink-200/40"
                  >
                    {/* Anillo pulsante sutil */}
                    <div className="absolute inset-0 rounded-full border-2 border-pink-300/0 group-hover:border-pink-300/30 transition-all duration-300 animate-pulse" />
                    
                    {/* Icono de edición pequeño */}
                    <Pencil className="absolute top-1 right-1 w-2 h-2 text-pink-400/60 group-hover:text-pink-500/80 transition-colors" />
                    
                    {/* Valor del CPM */}
                    <span className="text-lg font-bold group-hover:scale-110 transition-transform duration-200">{formattedCpmValue}</span>
                  </button>
                </div>
              </div>
              {/* T-8 con diseño mejorado */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <div className="w-1 h-1 bg-pink-400 rounded-full" />
                  <div className="font-bold text-pink-800 text-xs">T-8</div>
                  <div className="w-1 h-1 bg-pink-400 rounded-full" />
                </div>
                <div className="flex w-full items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleOpenT8Dialog}
                    className="group relative flex h-16 w-16 flex-col items-center justify-center rounded-full bg-gradient-to-br from-white via-pink-50/30 to-rose-50/40 text-pink-700 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-transparent border border-pink-200/40"
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-pink-300/0 group-hover:border-pink-300/30 transition-all duration-300 animate-pulse" />
                    <Pencil className="absolute top-1 right-1 w-2 h-2 text-pink-400/60 group-hover:text-pink-500/80 transition-colors" />
                    <span className="text-lg font-bold group-hover:scale-110 transition-transform duration-200">{formattedT8Value}</span>
                  </button>
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
  const navigate = useNavigate();
  const {
    currentCycle,
    archivedCycles,
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
  const { user, preferences, savePreferences } = useAuth();
  const [isCpmDialogOpen, setIsCpmDialogOpen] = useState(false);
  const [manualCpmInput, setManualCpmInput] = useState('');
  const [manualCpmError, setManualCpmError] = useState('');
  const [manualCpmValue, setManualCpmValue] = useState(null);
  const [isManualCpm, setIsManualCpm] = useState(false);
  const [showCpmDetails, setShowCpmDetails] = useState(false);
  const [isT8DialogOpen, setIsT8DialogOpen] = useState(false);
  const [manualT8Input, setManualT8Input] = useState('');
  const [manualT8Error, setManualT8Error] = useState('');
  const [manualT8Value, setManualT8Value] = useState(null);
  const [isManualT8, setIsManualT8] = useState(false);
  const [showT8Details, setShowT8Details] = useState(false);

  const manualCpmRestoreAttemptedRef = useRef(false);
  const manualT8RestoreAttemptedRef = useRef(false);

  const manualCpmStorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_cpm_${user.uid}` : null),
    [user?.uid]
  );
  const manualT8StorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_t8_${user.uid}` : null),
    [user?.uid]
  );

  useEffect(() => {
    manualCpmRestoreAttemptedRef.current = false;
  }, [manualCpmStorageKey]);
  useEffect(() => {
    manualT8RestoreAttemptedRef.current = false;
  }, [manualT8StorageKey]);


  const persistManualCpm = useCallback(
    async (value) => {
      if (!user?.uid || !savePreferences) {
        return;
      }

      const payload =
        value === null || value === undefined
          ? { manualCpm: null }
          : { manualCpm: Number(value) };

      try {
        await savePreferences(payload);

        if (manualCpmStorageKey && typeof window !== 'undefined') {
          if (payload.manualCpm === null) {
            localStorage.removeItem(manualCpmStorageKey);
          } else {
            localStorage.setItem(
              manualCpmStorageKey,
              JSON.stringify({ value: payload.manualCpm })
            );
          }
        }
      } catch (error) {
        console.error('Failed to persist manual CPM value in profile', error);
        throw error;
      }
    },
    [manualCpmStorageKey, savePreferences, user?.uid]
  );

  const persistManualT8 = useCallback(
    async (value) => {
      if (!user?.uid || !savePreferences) {
        return;
      }

      const payload =
        value === null || value === undefined
          ? { manualT8: null }
          : { manualT8: Number(value) };

      try {
        await savePreferences(payload);

        if (manualT8StorageKey && typeof window !== 'undefined') {
          if (payload.manualT8 === null) {
            localStorage.removeItem(manualT8StorageKey);
          } else {
            localStorage.setItem(
              manualT8StorageKey,
              JSON.stringify({ value: payload.manualT8 })
            );
          }
        }
      } catch (error) {
        console.error('Failed to persist manual T-8 value in profile', error);
        throw error;
      }
    },
    [manualT8StorageKey, savePreferences, user?.uid]
  );
  useEffect(() => {
    if (!manualCpmStorageKey) {
      setManualCpmValue(null);
      setIsManualCpm(false);
      manualCpmRestoreAttemptedRef.current = false;
      return;
    }

    const manualFromProfile = preferences?.manualCpm;

    if (typeof manualFromProfile === 'number' && Number.isFinite(manualFromProfile)) {
      setManualCpmValue(manualFromProfile);
      setIsManualCpm(true);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(manualCpmStorageKey, JSON.stringify({ value: manualFromProfile }));
        } catch (error) {
          console.error('Failed to sync manual CPM value to local storage', error);
        }
      }
      return;
    }

    if (manualFromProfile === null) {
      setManualCpmValue(null);
      setIsManualCpm(false);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(manualCpmStorageKey);
        } catch (error) {
          console.error('Failed to clear manual CPM value from local storage', error);
        }
      }
    }
  }, [manualCpmStorageKey, preferences?.manualCpm]);

  useEffect(() => {
    if (!manualT8StorageKey) {
      setManualT8Value(null);
      setIsManualT8(false);
      manualT8RestoreAttemptedRef.current = false;
      return;
    }

    const manualFromProfile = preferences?.manualT8;

    if (typeof manualFromProfile === 'number' && Number.isFinite(manualFromProfile)) {
      setManualT8Value(manualFromProfile);
      setIsManualT8(true);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(manualT8StorageKey, JSON.stringify({ value: manualFromProfile }));
        } catch (error) {
          console.error('Failed to sync manual T-8 value to local storage', error);
        }
      }
      return;
    }

    if (manualFromProfile === null) {
      setManualT8Value(null);
      setIsManualT8(false);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(manualT8StorageKey);
        } catch (error) {
          console.error('Failed to clear manual T-8 value from local storage', error);
        }
      }
    }
  }, [manualT8StorageKey, preferences?.manualT8]);
  useEffect(() => {
    if (!manualCpmStorageKey || manualCpmRestoreAttemptedRef.current) {
      return;
    }

    if (!user?.uid) {
      return;
    }

    const manualFromProfile = preferences?.manualCpm;
    if (manualFromProfile !== undefined) {
      manualCpmRestoreAttemptedRef.current = true;
      return;
    }

    if (typeof window === 'undefined') {
      manualCpmRestoreAttemptedRef.current = true;
      return;
    }

    try {
      const stored = localStorage.getItem(manualCpmStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.value === 'number' && Number.isFinite(parsed.value)) {
          setManualCpmValue(parsed.value);
          setIsManualCpm(true);
          persistManualCpm(parsed.value).catch((error) =>
            console.error('Failed to migrate manual CPM value to profile storage', error)
          );
        }
      }
    } catch (error) {
      console.error('Failed to restore manual CPM value from local storage', error);
    } finally {
      manualCpmRestoreAttemptedRef.current = true;
    }

    }, [manualCpmStorageKey, persistManualCpm, preferences?.manualCpm, user?.uid]);

  useEffect(() => {
    if (!manualT8StorageKey || manualT8RestoreAttemptedRef.current) {
      return;
    }

    if (!user?.uid) {
      return;
    }

    const manualFromProfile = preferences?.manualT8;
    if (manualFromProfile !== undefined) {
      manualT8RestoreAttemptedRef.current = true;
      return;
    }

    if (typeof window === 'undefined') {
      manualT8RestoreAttemptedRef.current = true;
      return;
    }

    try {
      const stored = localStorage.getItem(manualT8StorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.value === 'number' && Number.isFinite(parsed.value)) {
          setManualT8Value(parsed.value);
          setIsManualT8(true);
          persistManualT8(parsed.value).catch((error) =>
            console.error('Failed to migrate manual T-8 value to profile storage', error)
          );
        }
      }
    } catch (error) {
      console.error('Failed to restore manual T-8 value from local storage', error);
    } finally {
      manualT8RestoreAttemptedRef.current = true;
    }
  }, [manualT8StorageKey, persistManualT8, preferences?.manualT8, user?.uid]);

  useEffect(() => {
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate]);

  const formatCycleDateRange = useCallback((cycle) => {
    if (!cycle?.startDate) {
      return null;
    }

    try {
      const start = parseISO(cycle.startDate);
      if (Number.isNaN(start.getTime())) {
        return null;
      }

      const startLabel = format(start, 'dd/MM/yyyy', { locale: es });
      if (!cycle.endDate) {
        return `${startLabel} - En curso`;
      }

      const end = parseISO(cycle.endDate);
      if (Number.isNaN(end.getTime())) {
        return startLabel;
      }

      const endLabel = format(end, 'dd/MM/yyyy', { locale: es });
      return `${startLabel} - ${endLabel}`;
    } catch (error) {
      return null;
    }
  }, []);

  const combinedCycles = useMemo(() => {
    const cycles = [];

    if (Array.isArray(archivedCycles) && archivedCycles.length > 0) {
      archivedCycles.forEach((cycle, index) => {
        const dateRangeLabel = formatCycleDateRange(cycle);
        cycles.push({
          ...cycle,
          displayName: cycle.name || dateRangeLabel || `Ciclo archivado ${index + 1}`,
          dateRangeLabel,
          source: 'archived',
        });
      });
    }

    if (currentCycle?.id) {
      const dateRangeLabel = formatCycleDateRange(currentCycle);
      cycles.push({
        ...currentCycle,
        displayName: currentCycle.name || dateRangeLabel || 'Ciclo actual',
        dateRangeLabel,
        source: 'current',
      });
    }
    
    return cycles;
  }, [archivedCycles, currentCycle, formatCycleDateRange]);

  const computedCpmData = useMemo(() => {
    const completedCycles = combinedCycles
      .map((cycle) => {
        if (!cycle.startDate || !cycle.endDate) {
          return null;
        }

        try {
          const start = parseISO(cycle.startDate);
          const end = parseISO(cycle.endDate);

          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return null;
          }

          if (isAfter(start, end)) {
            return null;
          }

          const duration = differenceInDays(startOfDay(end), startOfDay(start)) + 1;

          if (!Number.isFinite(duration) || duration <= 0) {
            return null;
          }

          return {
            ...cycle,
            duration,
          };
        } catch (error) {
          console.error('Failed to compute cycle duration for CPM calculation', error);
          return null;
        }
      })
      .filter(Boolean);

    const sortedByDuration = [...completedCycles].sort((a, b) => {
      const aDuration = typeof a.duration === 'number' && Number.isFinite(a.duration)
        ? a.duration
        : Number.POSITIVE_INFINITY;
      const bDuration = typeof b.duration === 'number' && Number.isFinite(b.duration)
        ? b.duration
        : Number.POSITIVE_INFINITY;

      return aDuration - bDuration;
    });

    const totalCycles = sortedByDuration.length;

    if (totalCycles < 6) {
      return {
        value: null,
        cycleCount: totalCycles,
        shortestCycle: null,
        deduction: null,
        canCompute: false,
        cyclesConsidered: sortedByDuration,
      };
    }

    const shortestCycle = sortedByDuration[0];
    const deduction = totalCycles >= 12 ? 20 : 21;
    const value = shortestCycle.duration - deduction;

    return {
      value,
      cycleCount: totalCycles,
      shortestCycle,
      deduction,
      canCompute: true,
      cyclesConsidered: sortedByDuration,
    };
  }, [combinedCycles]);

  const computedT8Data = useMemo(() => {
    const normalizeTempValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }

      const parsed = Number.parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const getMeasurementTemp = (measurement) => {
      if (!measurement) {
        return null;
      }

      const raw = normalizeTempValue(measurement.temperature);
      const corrected = normalizeTempValue(measurement.temperature_corrected);

      if (measurement.use_corrected && corrected !== null) {
        return corrected;
      }

      if (raw !== null) {
        return raw;
      }

      if (corrected !== null) {
        return corrected;
      }

      return null;
    };

    const getDisplayTemperature = (entry) => {
      const directSources = [
        entry?.temperature_chart,
        entry?.temperature_raw,
        entry?.temperature_corrected,
      ];

      for (const candidate of directSources) {
        const normalized = normalizeTempValue(candidate);
        if (normalized !== null) {
          return normalized;
        }
      }

      if (Array.isArray(entry?.measurements)) {
        const selectedMeasurement = entry.measurements.find(
          (measurement) => measurement && measurement.selected && getMeasurementTemp(measurement) !== null
        );
        const fallbackMeasurement =
          selectedMeasurement || entry.measurements.find((measurement) => getMeasurementTemp(measurement) !== null);

        if (fallbackMeasurement) {
          const measurementTemp = getMeasurementTemp(fallbackMeasurement);
          if (measurementTemp !== null) {
            return measurementTemp;
          }
        }
      }

      return null;
    };

    const parseStartDate = (isoDate) => {
      if (!isoDate) {
        return null;
      }

      try {
        const parsed = parseISO(isoDate);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      } catch (error) {
        return null;
      }
    };

    const sortedCycles = combinedCycles
      .filter((cycle) => cycle && cycle.startDate && Array.isArray(cycle.data) && cycle.data.length > 0)
      .sort((a, b) => {
        const startA = parseStartDate(a.startDate);
        const startB = parseStartDate(b.startDate);

        if (!startA && !startB) {
          return 0;
        }

        if (!startA) {
          return 1;
        }

        if (!startB) {
          return -1;
        }

        return startB - startA;
      });

    const validCycles = [];

    for (const cycle of sortedCycles) {
      if (validCycles.length >= 12) {
        break;
      }

      const processedEntries = cycle.data
        .filter((entry) => entry && entry.isoDate)
        .map((entry) => ({
          ...entry,
          displayTemperature: getDisplayTemperature(entry),
        }));

      if (processedEntries.length === 0) {
        continue;
      }

      const { ovulationDetails } = computeOvulationMetrics(processedEntries);

      if (!ovulationDetails?.confirmed) {
        continue;
      }

      const ovulationIndex = Number.isInteger(ovulationDetails?.ovulationIndex)
        ? ovulationDetails.ovulationIndex
        : Number.isInteger(ovulationDetails?.confirmationIndex)
          ? ovulationDetails.confirmationIndex
          : null;

      if (
        ovulationIndex == null ||
        ovulationIndex < 0 ||
        ovulationIndex >= processedEntries.length
      ) {
        continue;
      }

      const ovulationEntry = processedEntries[ovulationIndex];
      const riseDay = Number(ovulationEntry?.cycleDay);

      if (!Number.isFinite(riseDay) || riseDay <= 0) {
        continue;
      }

      const t8Day = Math.max(1, riseDay - 8);

      validCycles.push({
        cycleId: cycle.id,
        riseDay,
        t8Day,
        displayName: cycle.displayName || cycle.name || 'Ciclo sin nombre',
        dateRangeLabel: cycle.dateRangeLabel,
      });
    }

    const cycleCount = validCycles.length;

    if (cycleCount === 0) {
      return {
        value: null,
        cycleCount,
        earliestCycle: null,
        cyclesConsidered: [],
        canCompute: false,
        rawValue: null,
      };
    }

    const earliestCycle = validCycles.reduce((earliest, current) =>
      current.t8Day < earliest.t8Day ? current : earliest
    );

    const computedValue = earliestCycle.t8Day;
    const canCompute = cycleCount >= 6;

    return {
      value: canCompute ? computedValue : null,
      cycleCount,
      earliestCycle,
      cyclesConsidered: validCycles,
      canCompute,
      rawValue: computedValue,
    };
  }, [combinedCycles]);

  const formattedCpmValue = useMemo(() => {
    const valueToFormat = isManualCpm ? manualCpmValue : computedCpmData.value;

    if (typeof valueToFormat !== 'number' || !Number.isFinite(valueToFormat)) {
      return '-';
    }

    return valueToFormat.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }, [computedCpmData.value, isManualCpm, manualCpmValue]);

  const formattedT8Value = useMemo(() => {
    const valueToFormat = isManualT8 ? manualT8Value : computedT8Data.value;

    if (typeof valueToFormat !== 'number' || !Number.isFinite(valueToFormat)) {
      return '-';
    }

    const rounded = Math.round(valueToFormat);
    return rounded.toLocaleString('es-ES', { maximumFractionDigits: 0 });
  }, [computedT8Data.value, isManualT8, manualT8Value]);

  const cpmInfo = useMemo(() => {
    const cycleCount = computedCpmData.cycleCount ?? 0;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const sourceLabel = isManualCpm ? 'Manual' : 'Automático';
    const cycles = computedCpmData.cyclesConsidered ?? [];
    const canCompute = Boolean(computedCpmData.canCompute);
    const deduction =
      typeof computedCpmData.deduction === 'number' && Number.isFinite(computedCpmData.deduction)
        ? computedCpmData.deduction
        : null;
    const shortestCycle = computedCpmData.shortestCycle ?? null;
    const automaticValue =
      typeof computedCpmData.value === 'number' && Number.isFinite(computedCpmData.value)
        ? computedCpmData.value
        : null;

    let summary;

    if (cycleCount === 0) {
      summary = 'Aún no hay ciclos finalizados con fecha de finalización.';
    } else if (!canCompute) {
      summary = `Hay ${cyclesLabel} finalizado${cycleCount === 1 ? '' : 's'}. Se necesitan ${requiredCycles} para calcular el CPM automáticamente.`;
    } else {
      const cycleName =
        shortestCycle?.dateRangeLabel ||
        shortestCycle?.displayName ||
        shortestCycle?.name ||
        'Ciclo sin nombre';
      const durationText =
        typeof shortestCycle?.duration === 'number' && Number.isFinite(shortestCycle.duration)
          ? `${shortestCycle.duration} días`
          : 'duración desconocida';

      const parts = [
        `Calculado con ${cyclesLabel}.`,
        `Ciclo más corto: ${cycleName} (${durationText}).`,
      ];

    if (deduction !== null) {
        parts.push(`Deducción aplicada: ${deduction} días.`);
      }

    if (automaticValue !== null) {
        parts.push(`Resultado: ${automaticValue} días.`);
      }

      summary = parts.join(' ');
    }

    return {
      sourceLabel,
      summary,
      highlightLabel: cyclesLabel,
      cycleCount,
      requiredCycles,
      canCompute,
      detailsAvailable: cycles.length > 0,
      cycles,
      deduction,
      shortestCycle,
      value: automaticValue,
    };
  }, [computedCpmData, isManualCpm]);

  const cpmInfoText = cpmInfo.summary;

  const t8Info = useMemo(() => {
    const cycleCount = computedT8Data.cycleCount;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const sourceLabel = isManualT8 ? 'Manual' : 'Automático';

    const cycleName =
      computedT8Data.earliestCycle?.displayName ||
      computedT8Data.earliestCycle?.name ||
      'Ciclo sin nombre';

    const riseDay = computedT8Data.earliestCycle?.riseDay;
    const dayText =
      typeof riseDay === 'number' && Number.isFinite(riseDay)
        ? `Día ${riseDay}`
        : 'día desconocido';

    const t8Day = computedT8Data.earliestCycle?.t8Day;
    const t8Text =
      typeof t8Day === 'number' && Number.isFinite(t8Day)
        ? `T-8 Día ${t8Day}`
        : null;

    let summary;

    if (cycleCount === 0) {
      summary = 'Aún no hay ciclos con ovulación confirmada por temperatura.';
    } else if (!computedT8Data.canCompute) {
      summary = `Hay ${cyclesLabel} con ovulación confirmada por temperatura (se necesitan ${requiredCycles}).`;
    } else {
      summary = `${cycleName} (${dayText}${t8Text ? ` → ${t8Text}` : ''}).`;
    }

    return {
      sourceLabel,
      summary,
      highlightLabel: cyclesLabel,
      cycleCount,
      requiredCycles,
    };
  }, [computedT8Data, isManualT8]);

  const handleNavigateToCycleDetails = useCallback((cycle) => {
    if (!cycle) {
      return;
    }

    const cycleId = cycle.cycleId || cycle.id;

    if (cycleId) {
      if (currentCycle?.id && cycleId === currentCycle.id) {
        navigate('/');
        return;
      }

      navigate(`/cycle/${cycleId}`);
    }
  }, [currentCycle?.id, navigate]);

  const handleOpenCpmDialog = useCallback(() => {
    const baseValue = isManualCpm
      ? manualCpmValue
      : typeof computedCpmData.value === 'number' && Number.isFinite(computedCpmData.value)
        ? computedCpmData.value
        : '';

    setManualCpmInput(baseValue === '' ? '' : String(baseValue));
    setManualCpmError('');
    setShowCpmDetails(false);
    setIsCpmDialogOpen(true);
  }, [computedCpmData.value, isManualCpm, manualCpmValue]);

  const handleCloseCpmDialog = useCallback(() => {
    setShowCpmDetails(false);
    setIsCpmDialogOpen(false);
  }, []);

  const handleManualCpmInputChange = useCallback((event) => {
    setManualCpmInput(event.target.value);
    setManualCpmError('');
  }, []);

  const handleSaveManualCpm = useCallback(async () => {
    const trimmed = manualCpmInput.trim();

    if (!trimmed) {
      setManualCpmError('Introduce un valor numérico válido.');
      return;
    }

    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalized);

    if (!Number.isFinite(parsed) || parsed < 0) {
      setManualCpmError('Introduce un valor numérico válido mayor o igual a 0.');
      return;
    }

    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;

    setManualCpmValue(parsed);
    setIsManualCpm(true);
    
  try {
      await persistManualCpm(parsed);
      setIsCpmDialogOpen(false);
      toast({ title: 'CPM actualizado', description: 'El CPM manual se guardó en tu perfil.' });
    } catch (error) {
      console.error('Failed to save manual CPM value', error);
      setManualCpmValue(previousValue);
      setIsManualCpm(previousIsManual);
      setManualCpmError('No se pudo guardar el CPM. Inténtalo de nuevo.');
    }
  }, [isManualCpm, manualCpmInput, manualCpmValue, persistManualCpm, toast]);

  const handleResetManualCpm = useCallback(async () => {
    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;

    setManualCpmValue(null);
    setIsManualCpm(false);
    setManualCpmInput('');
    setManualCpmError('');
    
    try {
      await persistManualCpm(null);
      setIsCpmDialogOpen(false);
      toast({ title: 'CPM restablecido', description: 'El cálculo automático volverá a mostrarse.' });
    } catch (error) {
      console.error('Failed to reset manual CPM value', error);
      setManualCpmValue(previousValue);
      setIsManualCpm(previousIsManual);
      setManualCpmError('No se pudo restablecer el CPM. Inténtalo de nuevo.');
    }
  }, [isManualCpm, manualCpmValue, persistManualCpm, toast]);

  const handleOpenT8Dialog = useCallback(() => {
    const baseValue = isManualT8
      ? manualT8Value
      : typeof computedT8Data.value === 'number' && Number.isFinite(computedT8Data.value)
        ? computedT8Data.value
        : '';

    setManualT8Input(baseValue === '' ? '' : String(baseValue));
    setManualT8Error('');
    setShowT8Details(false);
    setIsT8DialogOpen(true);
  }, [computedT8Data.value, isManualT8, manualT8Value]);

  const handleCloseT8Dialog = useCallback(() => {
    setIsT8DialogOpen(false);
    setShowT8Details(false);
  }, []);

  const handleManualT8InputChange = useCallback((event) => {
    setManualT8Input(event.target.value);
    setManualT8Error('');
  }, []);

  const handleSaveManualT8 = useCallback(async () => {
    const trimmed = manualT8Input.trim();

    if (!trimmed) {
      setManualT8Error('Introduce un número entero válido.');
      return;
    }

    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseInt(normalized, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      setManualT8Error('Introduce un número entero mayor o igual a 1.');
      return;
    }

    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;

    setManualT8Value(parsed);
    setIsManualT8(true);

    try {
      await persistManualT8(parsed);
      setIsT8DialogOpen(false);
      toast({ title: 'T-8 actualizado', description: 'El T-8 manual se guardó en tu perfil.' });
    } catch (error) {
      console.error('Failed to save manual T-8 value', error);
      setManualT8Value(previousValue);
      setIsManualT8(previousIsManual);
      setManualT8Error('No se pudo guardar el T-8. Inténtalo de nuevo.');
    }
  }, [isManualT8, manualT8Input, manualT8Value, persistManualT8, toast]);

  const handleResetManualT8 = useCallback(async () => {
    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;

    setManualT8Value(null);
    setIsManualT8(false);
    setManualT8Input('');
    setManualT8Error('');

    try {
      await persistManualT8(null);
      setIsT8DialogOpen(false);
      toast({ title: 'T-8 restablecido', description: 'El cálculo automático volverá a mostrarse.' });
    } catch (error) {
      console.error('Failed to reset manual T-8 value', error);
      setManualT8Value(previousValue);
      setIsManualT8(previousIsManual);
      setManualT8Error('No se pudo restablecer el T-8. Inténtalo de nuevo.');
    }
  }, [isManualT8, manualT8Value, persistManualT8, toast]);

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
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
        <p className="text-center text-gray-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br ffrom-rose-100 via-pink-100 to-rose-100">
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
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
      <div
  className="pointer-events-none absolute inset-0"
  style={{
    background:
      'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
  }}
/>
      <div className="max-w-md mx-auto flex w-full flex-1 flex-col">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-1 flex-col"
        >
          <CycleOverviewCard
            cycleData={{ ...currentCycle, currentDay, records: currentCycle.data }}
            onEdit={handleEdit}
            onTogglePeak={handleTogglePeak}
            currentPeakIsoDate={currentPeakIsoDate}
            onEditStartDate={handleOpenStartDateEditor}
            formattedCpmValue={formattedCpmValue}
            cpmInfoText={cpmInfoText}
            handleOpenCpmDialog={handleOpenCpmDialog}
            formattedT8Value={formattedT8Value}
            handleOpenT8Dialog={handleOpenT8Dialog}
          />
          <Dialog
            open={isCpmDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseCpmDialog();
              }
            }}
          >
            <DialogContent className="w-[90vw] max-w-sm rounded-3xl border border-pink-100 bg-white/95 text-gray-800 shadow-xl">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle>Editar CPM</DialogTitle>
                <DialogDescription>
                  Personaliza el CPM introduciendo un valor manual. Si no se establece, se calculará automáticamente
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="mt-0.5 h-4 w-4 text-rose-500" />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                        <span>Origen del dato</span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                          {cpmInfo.sourceLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-rose-600">
                        <span className="font-semibold">Datos disponibles:</span>
                        {cpmInfo.detailsAvailable ? (
                          <button
                            type="button"
                            onClick={() => setShowCpmDetails((previous) => !previous)}
                            className="inline-flex items-center font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 transition hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 rounded-sm"
                            aria-expanded={showCpmDetails}
                          >
                            {cpmInfo.highlightLabel}
                          </button>
                        ) : (
                          <span className="text-rose-500">{cpmInfo.highlightLabel}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-rose-500">{cpmInfo.summary}</p>
                      {cpmInfo.canCompute && cpmInfo.deduction !== null && (
                        <p className="text-[11px] text-rose-500">
                          Deducción aplicada: {cpmInfo.deduction} días.
                        </p>
                      )}
                    </div>
                  </div>
                  {showCpmDetails && cpmInfo.detailsAvailable && (
                    <div className="mt-2 space-y-2">
                      {cpmInfo.cycles.length > 0 ? (
                        <ul className="space-y-1">
                          {cpmInfo.cycles.map((cycle, index) => {
                            const key =
                              cycle.cycleId ||
                              cycle.id ||
                              `${cycle.displayName || cycle.name || cycle.startDate || 'cycle'}-${index}`;
                            const durationText =
                              typeof cycle.duration === 'number' && Number.isFinite(cycle.duration)
                                ? `${cycle.duration} días`
                                : 'duración desconocida';
                            const isShortest = Boolean(cpmInfo.shortestCycle && cpmInfo.shortestCycle === cycle);

                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  onClick={() => handleNavigateToCycleDetails(cycle)}
                                  className="w-full rounded-xl border border-rose-100 bg-white/70 px-3 py-2 text-left shadow-sm transition hover:border-rose-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-rose-700">
                                      {cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}
                                    </p>
                                    <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-500">
                                    <span>Duración: {durationText}</span>
                                    {isShortest && (
                                      <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-600">
                                        Ciclo más corto
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-rose-500">
                          Aún no hay ciclos finalizados con fecha de finalización.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-cpm-input" className="text-xs text-gray-600">
                    CPM manual
                  </Label>
                  <Input
                    id="manual-cpm-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={manualCpmInput}
                    onChange={handleManualCpmInputChange}
                    placeholder="Introduce un valor"
                  />
                  {manualCpmError && (
                    <p className="text-xs text-red-500">{manualCpmError}</p>
                  )}
                </div>
              </div>
              <DialogFooter className="sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetManualCpm}
                  disabled={!isManualCpm}
                  className="text-pink-600 hover:text-pink-700 disabled:text-gray-400"
                >
                  Restablecer automático
                </Button>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Button type="button" variant="secondary" onClick={handleCloseCpmDialog}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSaveManualCpm}>
                    Guardar
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isT8DialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseT8Dialog();
              }
            }}
          >
            <DialogContent className="w-[90vw] max-w-sm rounded-3xl border border-pink-100 bg-white/95 text-gray-800 shadow-xl">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle>Editar T-8</DialogTitle>
                <DialogDescription>
                  Personaliza el T-8 introduciendo un valor manual. Si no se establece, se calculará automáticamente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="mt-0.5 h-4 w-4 text-rose-500" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                        <span>Origen del dato</span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                          {t8Info.sourceLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-rose-600">
                        <span className="font-semibold">Datos disponibles:</span>
                        <button
                          type="button"
                          onClick={() => setShowT8Details((previous) => !previous)}
                          className="inline-flex items-center font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 transition hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 rounded-sm"
                          aria-expanded={showT8Details}
                        >
                          {t8Info.highlightLabel}
                        </button>
                        </div>
                      <p className="text-[11px] text-rose-500">{t8Info.summary}</p>
                      {showT8Details && (
                        <div className="mt-2 space-y-2">
                          {computedT8Data.cyclesConsidered.length > 0 ? (
                            <ul className="space-y-1">
                              {computedT8Data.cyclesConsidered.map((cycle, index) => {
                                const key = cycle.cycleId || `${cycle.displayName}-${cycle.riseDay}-${index}`;
                                const riseDayText =
                                  typeof cycle.riseDay === 'number' && Number.isFinite(cycle.riseDay)
                                    ? cycle.riseDay
                                    : '—';
                                return (
                                  <li key={key}>
                                    <button
                                      type="button"
                                      onClick={() => handleNavigateToCycleDetails(cycle)}
                                      className="w-full rounded-xl border border-rose-100 bg-white/70 px-3 py-2 text-left shadow-sm transition hover:border-rose-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold text-rose-700">
                                          {cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}
                                        </p>
                                        <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                      </div>
                                      <p className="text-[11px] text-rose-500">Día de subida: {riseDayText}</p>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-rose-500">
                              Aún no hay ciclos con ovulación confirmada por temperatura.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-t8-input" className="text-xs text-gray-600">
                    T-8 manual
                  </Label>
                  <Input
                    id="manual-t8-input"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={manualT8Input}
                    onChange={handleManualT8InputChange}
                    placeholder="Introduce un valor"
                  />
                  {manualT8Error && (
                    <p className="text-xs text-red-500">{manualT8Error}</p>
                  )}
                </div>
              </div>
              <DialogFooter className="sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetManualT8}
                  disabled={!isManualT8}
                  className="text-pink-600 hover:text-pink-700 disabled:text-gray-400"
                >
                  Restablecer automático
                </Button>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Button type="button" variant="secondary" onClick={handleCloseT8Dialog}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSaveManualT8}>
                    Guardar
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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