import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Plus,
  FilePlus,
  CalendarPlus,
  Edit,
  Pencil,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Ban,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import { useToast } from '@/components/ui/use-toast';
import NewCycleDialog from '@/components/NewCycleDialog';
import PostpartumExitDialog from '@/components/PostpartumExitDialog';
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
import { Badge } from '@/components/ui/badge';
import { computeOvulationMetrics, useFertilityChart } from '@/hooks/useFertilityChart';
import { saveUserMetricsSnapshot } from '@/lib/userMetrics';
import { MANUAL_CPM_DEDUCTION, buildCpmMetric } from '@/lib/metrics/cpm';
import { buildT8Metric } from '@/lib/metrics/t8';
import { getSymbolColorPalette } from '@/config/fertilitySymbols';

const CycleOverviewCard = ({
  cycleData,
  onEdit,
  onTogglePeak,
  currentPeakIsoDate,
  onEditStartDate = () => {},
  handleOpenCpmDialog = () => {},
  handleOpenT8Dialog = () => {},
  cpmMetric = {},
  t8Metric = {},
}) => {
  const records = cycleData.records || [];
  const [activePoint, setActivePoint] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ clientX: 0, clientY: 0 });
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [recentlyChangedDays, setRecentlyChangedDays] = useState([]);
  const hasInitializedWheelRef = useRef(true);
  const touchStartXRef = useRef(null);
  const circleRef = useRef(null);
  const recentSignaturesRef = useRef(new Map());
  const splashTimeoutRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const cycleStartDate = cycleData.startDate ? parseISO(cycleData.startDate) : null;
  const today = startOfDay(new Date());
  const peakStatuses = useMemo(() => computePeakStatuses(records), [records]);

  useEffect(() => {
    const prevSignatures = recentSignaturesRef.current;
    const nextSignatures = new Map();
    const newDays = [];

    records.forEach((record) => {
      if (!record) return;

      let recordDay = record.cycleDay;
      if (!recordDay && cycleStartDate && record.isoDate) {
        try {
          recordDay = differenceInDays(parseISO(record.isoDate), cycleStartDate) + 1;
        } catch (error) {
          recordDay = null;
        }
      }

      if (!recordDay) return;

      const signature = JSON.stringify({
        temp: record.displayTemperature ?? record.temperature_chart ?? null,
        symbol: record.fertility_symbol ?? null,
        sensation: record.mucus_sensation ?? record.mucusSensation ?? '',
        appearance: record.mucus_appearance ?? record.mucusAppearance ?? '',
        observations: record.observations ?? '',
        relations: record.had_relations ?? record.hadRelations ?? false,
        updatedAt: record.updatedAt ?? record.timestamp ?? null,
      });

      nextSignatures.set(recordDay, signature);

      if (prevSignatures.size > 0) {
        const prevSignature = prevSignatures.get(recordDay);
        if (!prevSignature || prevSignature !== signature) {
          newDays.push(recordDay);
        }
      }
    });

    recentSignaturesRef.current = nextSignatures;

    if (!prefersReducedMotion && newDays.length) {
      setRecentlyChangedDays((current) => {
        const merged = new Set(current);
        newDays.forEach((day) => merged.add(day));
        return Array.from(merged);
      });
    }
  }, [cycleStartDate, prefersReducedMotion, records]);

  useEffect(() => {
    if (prefersReducedMotion || recentlyChangedDays.length === 0) return undefined;

    const timeout = setTimeout(() => {
      setRecentlyChangedDays([]);
    }, 1400);

    splashTimeoutRef.current = timeout;

    return () => {
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
      }
    };
  }, [prefersReducedMotion, recentlyChangedDays]);

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

  const desiredInitialWheelOffset = useMemo(() => {
    if (!hasOverflow) {
      return 0;
    }

    return Math.max(0, Math.min(Math.max(cycleData.currentDay - totalDots, 0), maxOffset));
  }, [cycleData.currentDay, hasOverflow, maxOffset, totalDots]);

  const [wheelOffset, setWheelOffset] = useState(desiredInitialWheelOffset);

  useEffect(() => {
    if (!hasInitializedWheelRef.current) {
      hasInitializedWheelRef.current = true;
    }
  }, [desiredInitialWheelOffset, wheelOffset]);

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

  const rafRef = useRef(0);
const pendingDeltaRef = useRef(0);

const changeOffsetRaf = useCallback((delta) => {
  if (!hasOverflow || delta === 0) return;
  pendingDeltaRef.current += delta;
  if (rafRef.current) return;
  rafRef.current = requestAnimationFrame(() => {
    const step = Math.sign(pendingDeltaRef.current);
    setWheelOffset(prev => clampOffset(prev + step));
    pendingDeltaRef.current = 0;
    rafRef.current = 0;
  });
}, [hasOverflow, clampOffset]);
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

      changeOffsetRaf(delta > 0 ? 1 : -1);
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

      changeOffsetRaf(deltaX < 0 ? 1 : -1);
      touchStartXRef.current = currentX;
    },
    [changeOffset, hasOverflow]
  );

  const handleTouchEnd = useCallback(() => {
    touchStartXRef.current = null;
  }, []);

  // Colores suaves con mejor contraste
  const getSymbolColor = useCallback(
    (symbolValue) => ({
      ...getSymbolColorPalette(symbolValue),
      ...(symbolValue === 'spot' ? { pattern: 'url(#spotting-pattern-dashboard)' } : {})
    }),
    []
  );

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

const EMPTY_DAY_COLORS = {
  main: '#b4a9b0',                          // muy claro, liloso
  light: '#c1b6bd',
  glow: 'rgba(212, 194, 206, 0.16)',
  border: '#c1b6bd',
};




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
        : EMPTY_DAY_COLORS;


      // Distinguish between past empty days and future days
      if (!recordWithCycleDay && day < cycleData.currentDay) {
        // Past days without record: transparent with gray border
        colors = {
          main: 'transparent',
          light: 'transparent',
          glow: 'rgba(180, 169, 176, 0.1)',
          border: 'rgba(180, 169, 176, 0.4)',
        };
      } else if (isFutureDay || day > cycleData.currentDay) {
        // Future days: transparent with pale pink border
        colors = {
          main: 'transparent',
          light: 'transparent',
          glow: 'rgba(251, 192, 203, 0.1)',
          border: 'rgba(252, 170, 185, 0.35)',
        };
      }
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
  const changedDaySet = useMemo(() => new Set(recentlyChangedDays), [recentlyChangedDays]);
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

  const renderMetricCard = (metric, onClick) => {
    if (!metric) {
      return null;
    }

    const {
      title = '',
      baseText = '—',
      finalText = '—',
      microCopy = 'Sin datos disponibles',
      microCopyMuted = false,
      modeLabel = 'Auto',
      microCopyId,
    } = metric;

    const resolvedTitle = title || 'Métrica';

    return (
      <button
        type="button"
        onClick={onClick}
        className="group w-full rounded-2xl border border-rose-100/60 bg-white/80 p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
        aria-describedby={microCopyId}
        aria-label={`Editar ${resolvedTitle}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
              {resolvedTitle}
            </p>
            <p className="text-xl sm:text-2xl font-bold leading-tight text-gray-800 break-words">
              {baseText}
            </p>
          </div>
          <div className="flex sm:flex-col flex-row items-center gap-2 sm:items-end">
            <Badge
              className={`rounded-full border border-rose-100/70 px-2 py-0.5 text-[11px] font-semibold ${
                modeLabel === 'Manual'
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-white/85 text-rose-500'
              }`}
            >
              {modeLabel}
            </Badge>
            <div className="sm:text-right text-left">
              <p className="text-base sm:text-lg font-semibold text-rose-600 whitespace-nowrap">
                {finalText}
              </p>
            </div>
          </div>
        </div>
        <p
          id={microCopyId}
          className={`mt-3 text-[11px] sm:text-xs ${microCopyMuted ? 'text-gray-400' : 'text-rose-500'} transition-colors`}
        >
          {microCopy}
        </p>
      </button>
    );
  };

  return (
    <div className="relative flex flex-col space-y-4">
      {/* Fecha actual - Parte superior con padding reducido */}
      <motion.div
        className="relative overflow-hidden px-4 pt-4 pb-3 text-center flex-shrink-0"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl font-bold text-titulo mb-1">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </h1>
        <button
          type="button"
          onClick={onEditStartDate}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-sm font-semibold text-subtitulo shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 focus:ring-offset-transparent hover:bg-white"
          title="Editar fecha de inicio del ciclo"
        >
          <Edit className="w-4 h-4" />
          {`Ciclo actual`}
        </button>

      </motion.div>

      {/* Contenedor principal con flex-grow para usar todo el espacio disponible */}
        <motion.div
        className="px-4 flex-grow flex flex-col justify-start mt-2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        {/* Tarjeta SOLO para el círculo + navegación */}
        
        <div className="relative overflow-hidden rounded-[75px]   p-4  mb-4">
        <div className="pointer-events-none absolute inset-0">
        {/* halo desde arriba como antes */}
        <div className="absolute inset-0 " />
        {/* degradado sutil desde abajo para que no quede plano-blanco */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 " />
        </div>
        <div className="relative text-center flex-shrink-0">
          {/* Círculo de progreso redimensionado */}
          <div className="mb-3">
          <motion.div
            ref={circleRef}
            className="relative inline-flex items-center justify-center mb-4 drop-shadow-[0_15px_35px_rgba(221,86,101,0.22)]"
            style={{ width: viewBoxSize, height: viewBoxSize }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onWheel={handleWheelScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <svg
              className="w-full h-full wheel-no-tap"
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              onClick={() => setActivePoint(null)}
            >
              <defs>
                <pattern id="spotting-pattern-dashboard" patternUnits="userSpaceOnUse" width="6" height="6">
                  <rect width="6" height="6" fill="#ef4444" />
                  <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
                </pattern>
                <radialGradient id="ringGlow" cx="50%" cy="50%" r="78%" fx="30%" fy="20%">
                  <stop offset="0%" stopColor="#FFE7E8" stopOpacity="0.98" />
                  <stop offset="60%" stopColor="#FFC0C1" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#FFB5B3" stopOpacity="0.95" />
                </radialGradient>
                <filter id="circleDepthShadow">
                  <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="rgba(221,86,101,0.22)" floodOpacity="1" />
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(221,86,101,0.18)" floodOpacity="1" />
                </filter>
                <filter id="dotShadow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
                <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodColor="#000" floodOpacity="0.22" />
              </filter>
              <filter id="whiteSymbolShadow">
  <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="rgba(189,16,44,0.3)" />
</filter>

  <filter id="activePointHighlight">
    <feDropShadow dx="0" dy="-1" stdDeviation="0.5" floodColor="rgba(255,255,255,0.7)" floodOpacity="1" />
  </filter>
  

  <filter id="bevel">
    <feFlood floodColor="rgba(255,255,255,0.4)" result="top"/>
    <feFlood floodColor="rgba(0,0,0,0.2)" result="bottom"/>
    <feMerge>
      <feMergeNode in="top"/>
      <feMergeNode in="bottom"/>
      <feMergeNode/>
    </feMerge>
  </filter>
                  </defs>

              {/* Círculo base sutil */}
              <circle cx={center} cy={center} r={radius - 28} fill="url(#ringGlow)" stroke="rgba(255,225,228,0.8)" strokeWidth={1.2}
              filter="url(#circleDepthShadow)"
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
  transition={{ type: 'tween', duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
  initial={false}
  animate={hasInitializedWheelRef.current ? { rotate: -wheelRotationDegrees } : false}
  style={{
    transformOrigin: 'center',
    transformBox: 'view-box',
    willChange: 'transform' // hint a la GPU
  }}
>
                {dots.map((dot, index) => (
                  <g key={index}>
{/* Punto principal con sombra real */}
<g filter={dot.isActive ? 'url(#activePointHighlight)' : dot.isToday ? "url(#bevel)" : undefined}>
  <motion.circle
  cx={dot.x}
  cy={dot.y}
  r={dot.isToday ? 12 : 11}
  fill={
    dot.colors.pattern
      || (dot.isActive ? dot.colors.main : 'rgba(255,255,255,0.001)')
  }
  stroke={dot.colors.border && dot.colors.border !== 'none' ? dot.colors.border : "rgba(255,255,255,0.3)"}
  strokeWidth={dot.colors.border && dot.colors.border !== 'none' ? (dot.isToday ? 2.2 : 1.2) : 0}
  filter={dot.fertilitysymbol === 'white' 
    ? "url(#whiteSymbolShadow)" 
    : dot.isActive 
      ? "url(#dotShadow)" 
      : undefined}

  strokeLinecap="round"
  onClick={(e) => handleDotClick(dot, e)}
  initial={false}
  whileTap={
    prefersReducedMotion || !hasInitializedWheelRef.current
      ? undefined
      : {
          y: 2,              // se hunde un pelín
          scale: 0.75,       // se comprime un poco
          opacity: 0.95,
          transition: { duration: 0.08, ease: 'easeOut' },
        }
  }
  style={{ cursor: 'pointer' }}
/>

</g>

{!prefersReducedMotion && changedDaySet.has(dot.day) && (
  <motion.g
    key={`dot-splash-${dot.day}`}
    pointerEvents="none"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
  >
    {/* Gota que cae con squash/stretch al impactar */}
    <motion.circle
      cx={dot.x}
      cy={dot.y - 12}
      r={4}
      fill={dot.colors.main}
      initial={{ y: -18, scale: 0.5, opacity: 0 }}
      animate={{
        y: [-18, 0, 2],
        scale: [0.5, 1.05, 0.8],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 0.6,
        ease: 'easeOut',
        times: [0, 0.6, 1],
      }}
    />

    {/* Onda rápida */}
    <motion.circle
      cx={dot.x}
      cy={dot.y}
      r={dot.isToday ? 12 : 10}
      stroke={
        dot.colors.border === 'none'
          ? dot.colors.main
          : dot.colors.border || dot.colors.main
      }
      strokeWidth={2}
      fill="none"
      initial={{ scale: 0.5, opacity: 0.9 }}
      animate={{ scale: 1.4, opacity: 0 }}
      transition={{
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1], // un poco más elástica
        delay: 0.05,
      }}
    />

    {/* Onda más grande y suave (segunda onda) */}
    <motion.circle
      cx={dot.x}
      cy={dot.y}
      r={dot.isToday ? 14 : 12}
      stroke={
        dot.colors.border === 'none'
          ? dot.colors.main
          : dot.colors.border || dot.colors.main
      }
      strokeWidth={1.5}
      fill="none"
      initial={{ scale: 0.6, opacity: 0.6 }}
      animate={{ scale: 1.9, opacity: 0 }}
      transition={{
        duration: 0.9,
        ease: 'easeOut',
        delay: 0.1,
      }}
    />
  </motion.g>
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

                </g>
                ))}
              </motion.g>

              {dots.map((dot, index) => {
                if (!dot.peakStatus) {
                  return null;
                }

                const { x: labelX, y: labelY } = rotatePoint(dot.x, dot.y);

                if (dot.peakStatus === 'P') {
                  return (
                    <text
                      x={labelX}
                      y={labelY + 4}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="900"
                      fill="#ec4899"
                      style={{ pointerEvents: 'none' }}
                    >
                      ✖
                    </text>
                  );
                }

                return (
                  <text x={labelX} 
                  y={labelY + 4} 
                  textAnchor="middle" 
                  fontSize="12" 
                  fontWeight="800" 
                  fill="#7f1d1d" 
                  style={{ pointerEvents: 'none' }}>
                  {dot.peakStatus}
                </text>
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
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1, delay: 0.1, ease: 'easeOut' }}
              >
                <div className="flex items-center justify-center ">
                  <p className="text-6xl font-semibold text-fertiliapp-fuerte leading-none">
                    {cycleData.currentDay}
                  </p>
                </div>
                <p className="mt-1 text-[15px] font-medium uppercase tracking-wide text-fertiliapp-fuerte">
                  DÍA DEL CICLO
                </p>
              </motion.div>
            </div>

          </motion.div>
          

          {hasOverflow && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="p-2 rounded-full text-fertiliapp-fuerte shadow-xs transition hover:border hover:bg-fertiliapp-fuerte/20"
                onClick={() => changeOffset(-1)}
                disabled={wheelOffset === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-1">
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-fertiliapp-fuerte">
                    Día {wheelOffset + 1}
                  </span>
                  <span className="text-xs text-fertiliapp-fuerte">•</span>
                  <span className="text-xs font-medium text-fertiliapp-fuerte">
                    Día {Math.min(wheelOffset + totalDots, totalCycleDays)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxOffset}
                  value={wheelOffset}
                  onChange={(event) => setWheelOffset(clampOffset(Number(event.target.value)))}
                  className="w-40 range-fertiliapp"
                />
              </div>
              <button
                type="button"
                className="p-2 rounded-full text-fertiliapp-fuerte shadow-xs transition hover:border hover:bg-fertiliapp-fuerte/20"
                onClick={() => changeOffsetRaf(1)}
                disabled={wheelOffset === maxOffset}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
        </div>
      )}
    </div>
  </div>
</div>

        {/* Leyenda e información del ciclo con diseño mejorado */}
        <div className="grid grid-cols-2 gap-4 mx-2 mb-6 mt-2 flex-shrink-0 items-start">
          
          {/* Leyenda de colores */}
          <motion.div
            className={`relative overflow-hidden rounded-3xl bg-white/60 border border-secundario-suave shadow-[0_14px_35px_rgba(148,163,184,0.18)] backdrop-blur-md p-1 transition-[width] duration-300 ease-in-out mx-auto ${
              isSymbolsOpen ? 'w-full' : 'w-[80%]'
            }`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >

            <button
              type="button"
              onClick={() => setIsSymbolsOpen((previous) => !previous)}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition"
            >
              <span className="text-sm font-semibold text-slate-700 tracking-tight uppercase">SÍMBOLOS</span>
             <div className="absolute top-4.5 right-4 w-1.5 h-1.5 bg-secundario rounded-full" />
            </button>

            <AnimatePresence initial={false}>
               {isSymbolsOpen && (
                <motion.div
                  key="symbols"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="grid grid-cols-2 gap-2.5 rounded-3xl bg-white/40 p-2 overflow-hidden"
                >
                  {[
                    { label: 'Menstrual', color: '#fb7185' },
                    { label: 'Moco (Fértil)', color: '#fdf5f8', stroke: '#fb7185' },
                    { label: 'Seco', color: '#67C5A4' },
                    { label: 'Moco (No fértil)', color: '#F7B944' },
                    { label: 'Spotting', color: '#fb7185', stroke: '#fee2e2', pattern: true },
                    { label: 'Hoy', isToday: true }
                  ].map(item => (
                    <div key={item.label} className="flex flex-col items-center gap-1.5">
                      {item.isToday ? (
                        <div className="relative flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full border border-rose-400/80 bg-transparent" />
                          <div className="absolute inset-0 -m-1 rounded-full border-[3px] border-rose-500/80 animate-pulse" />

                        </div>
                      ) : (
                        <div
                          className={`w-5 h-5 rounded-full border ${item.pattern ? 'pattern-bg' : ''}`}
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
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>

          {/* Información del ciclo con diseño tipo card premium */}
          <motion.div
            className={`relative overflow-hidden rounded-3xl bg-white/60 border border-secundario-suave shadow-[0_14px_35px_rgba(148,163,184,0.18)] backdrop-blur-md p-1 transition-[width] duration-300 ease-in-out mx-auto ${
              isCalcOpen ? 'w-full' : 'w-[80%]'
            }`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <button
              type="button"
              onClick={() => setIsCalcOpen((previous) => !previous)}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition"
            >
              <span className="text-sm font-semibold text-slate-800 tracking-tight uppercase">CÁLCULO</span>
              <div className="absolute top-4.5 right-4 w-1.5 h-1.5 bg-secundario rounded-full" />
            </button>

            <AnimatePresence initial={false}>
              {isCalcOpen && (
                <motion.div
                  key="calc-card"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="grid grid-cols-2 gap-2.5 rounded-3xl bg-white/40 p-2 overflow-hidden"
                >
                  {/* Fila 1 - Ciclo más corto / CPM */}
                  <button
                    type="button"
                    onClick={handleOpenCpmDialog}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Editar CPM (Ciclo más corto)"
                  >
                    <span className="flex items-center justify-center text-[10px] font-medium text-gray-700 leading-tight text-center h-8">Ciclo más corto</span>
                    <div className="h-10 flex items-end">
                      <div className="flex items-center justify-center rounded-full border border-rose-200/70 bg-white/70 shadow-sm w-10 h-10 text-base font-bold text-rose-700">
                        {cpmMetric?.baseFormatted ?? '—'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCpmDialog}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Editar CPM (resultado)"
                  >
                    <span className="flex items-center justify-center text-[10px] font-medium text-gray-700 leading-tight text-center h-8">CPM</span>
                    <div className="h-10 flex items-end">
                      <div className="flex items-center justify-center rounded-full border border-rose-200/70 bg-white/80 shadow-sm w-10 h-10 text-sm font-semibold text-rose-700">
                        {cpmMetric?.finalFormatted ?? '—'}
                      </div>
                    </div>
                    <span className="text-[9px] font-semibold text-rose-600 mt-0.5">
                      {cpmMetric?.modeLabel ?? 'Auto'}
                    </span>
                  </button>

                  {/* Fila 2 - Día de subida / T-8 */}
                  <button
                    type="button"
                    onClick={handleOpenT8Dialog}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Editar T-8 (Día de subida)"
                  >
                    <span className="flex items-center justify-center text-[10px] font-medium text-gray-700 leading-tight text-center h-8">Día de subida</span>
                    <div className="h-10 flex items-end">
                      <div className="flex items-center justify-center rounded-full border border-rose-200/70 bg-white/70 shadow-sm w-10 h-10 text-base font-bold text-rose-700">
                        {t8Metric?.baseFormatted ?? '—'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenT8Dialog}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Editar T-8 (resultado)"
                  >
                    <span className="flex items-center justify-center text-[10px] font-medium text-gray-700 leading-tight text-center h-8">T-8</span>
                    <div className="h-10 flex items-end">
                      <div className="flex items-center justify-center rounded-full border border-rose-200/70 bg-white/80 shadow-sm w-10 h-10 text-sm font-semibold text-rose-700">
                        {t8Metric?.finalFormatted ?? '—'}
                      </div>
                    </div>
                    <span className="text-[9px] font-semibold text-rose-600 mt-0.5">
                      {t8Metric?.modeLabel ?? 'Auto'}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

const FloatingActionButton = ({ onAddRecord, onAddCycle }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-4 top-12 md:top-6 flex flex-col-reverse items-end space-y-2 z-50">
      {open && (
  <div className="flex flex-col space-y-2 mt-1">
    <motion.button
      onClick={onAddRecord}
      className="flex items-center gap-1 px-4 h-10 rounded-full bg-fertiliapp-fuerte hover:brightness-50 text-white/90 shadow-sm shadow-[#DD5665]"
      whileTap={{ scale: 0.80 }}
      whileHover={{ scale: 1.05 }}
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      style={{ filter: 'drop-shadow(0 6px 12px rgba(244, 114, 182, 0.28))' }}
    >
      <FilePlus className="h-5 w-5" />
      <span className="text-sm font-medium tracking-tight">Añadir registro</span>
    </motion.button>
    <motion.button
      onClick={onAddCycle}
      className="flex items-center gap-3 px-4 h-10 rounded-full bg-white/80 hover:brightness-50 text-fertiliapp-fuerte shadow-sm shadow-[#DD5665]"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      style={{ filter: 'drop-shadow(0 6px 12px rgba(244, 114, 182, 0.2))' }}
    >
      <CalendarPlus className="h-5 w-5" />
      <span className="text-sm font-medium tracking-tight">Nuevo ciclo</span>
    </motion.button>

    
  </div>
)}

      <motion.button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center rounded-full bg-white/80 border border-fertiliapp-fuerte text-fertiliapp-fuerte hover:brightness-95 shadow-sm shadow-[#5BA9B8] w-12 h-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(221, 86, 101, 0.35))' }}
      >
        <motion.span animate={{ rotate: open ? 135 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
          <Plus className="h-5 w-5" />
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
    setCycleIgnoreForAutoCalculations,
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
  const [manualCpmBaseInput, setManualCpmBaseInput] = useState('');
  const [manualCpmFinalInput, setManualCpmFinalInput] = useState('');
  const [manualCpmBaseError, setManualCpmBaseError] = useState('');
  const [manualCpmFinalError, setManualCpmFinalError] = useState('');
  const [manualCpmEditedSide, setManualCpmEditedSide] = useState(null);
  const [manualCpmBaseValue, setManualCpmBaseValue] = useState(null);
  const [manualCpmValue, setManualCpmValue] = useState(null);
  const [isManualCpm, setIsManualCpm] = useState(false);
  const [cpmSelection, setCpmSelection] = useState('auto');
  const [cpmSelectionDraft, setCpmSelectionDraft] = useState('auto');
  const [showCpmDetails, setShowCpmDetails] = useState(false);
  const [showCpmDeleteDialog, setShowCpmDeleteDialog] = useState(false);
  const [isDeletingManualCpm, setIsDeletingManualCpm] = useState(false);
  const [isT8DialogOpen, setIsT8DialogOpen] = useState(false);
  const [manualT8BaseInput, setManualT8BaseInput] = useState('');
  const [manualT8FinalInput, setManualT8FinalInput] = useState('');
  const [manualT8BaseError, setManualT8BaseError] = useState('');
  const [manualT8FinalError, setManualT8FinalError] = useState('');
  const [manualT8EditedSide, setManualT8EditedSide] = useState(null);
  const [manualT8BaseValue, setManualT8BaseValue] = useState(null);
  const [manualT8Value, setManualT8Value] = useState(null);
  const [isManualT8, setIsManualT8] = useState(false);
  const [t8Selection, setT8Selection] = useState('auto');
  const [t8SelectionDraft, setT8SelectionDraft] = useState('auto');
  const [showT8Details, setShowT8Details] = useState(false);
  const [showT8DeleteDialog, setShowT8DeleteDialog] = useState(false);
  const [isDeletingManualT8, setIsDeletingManualT8] = useState(false);
  const [pendingIgnoredCycleIds, setPendingIgnoredCycleIds] = useState([]);

  const manualCpmRestoreAttemptedRef = useRef(false);
  const manualT8RestoreAttemptedRef = useRef(false);
  const automaticMetricsSnapshotRef = useRef(null);
  const cpmSelectionInitializedRef = useRef(false);
  const t8SelectionInitializedRef = useRef(false);

  const manualCpmStorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_cpm_${user.uid}` : null),
    [user?.uid]
  );
  const manualCpmBaseStorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_cpm_base_${user.uid}` : null),
    [user?.uid]
  );
  const manualT8StorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_t8_${user.uid}` : null),
    [user?.uid]
  );
  const manualT8BaseStorageKey = useMemo(
    () => (user?.uid ? `rnf_manual_t8_base_${user.uid}` : null),
    [user?.uid]
  );

  const persistCpmMode = useCallback(
    async (mode) => {
      if (!user?.uid || !savePreferences) return;
      if (!['auto', 'manual', 'none'].includes(mode)) return;
      try {
        await savePreferences({ cpmMode: mode });
      } catch (error) {
        console.error('Failed to persist CPM mode', error);
      }
    },
    [savePreferences, user?.uid]
  );

  const persistT8Mode = useCallback(
    async (mode) => {
      if (!user?.uid || !savePreferences) return;
      if (!['auto', 'manual', 'none'].includes(mode)) return;
      try {
        await savePreferences({ t8Mode: mode });
      } catch (error) {
        console.error('Failed to persist T-8 mode', error);
      }
    },
    [savePreferences, user?.uid]
  );

  useEffect(() => {
    manualCpmRestoreAttemptedRef.current = false;
  }, [manualCpmStorageKey]);
  useEffect(() => {
    manualT8RestoreAttemptedRef.current = false;
  }, [manualT8StorageKey]);

  useEffect(() => {
    if (!manualCpmBaseStorageKey) {
      setManualCpmBaseValue(null);
      return;
    }

    const baseFromProfile = preferences?.manualCpmBase;
    if (baseFromProfile !== undefined) {
      if (typeof baseFromProfile === 'number' && Number.isFinite(baseFromProfile)) {
        setManualCpmBaseValue(baseFromProfile);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              manualCpmBaseStorageKey,
              JSON.stringify({ value: baseFromProfile })
            );
          } catch (error) {
            console.error('Failed to sync manual CPM base value to local storage', error);
          }
        }
      } else {
        setManualCpmBaseValue(null);
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(manualCpmBaseStorageKey);
          } catch (error) {
            console.error('Failed to clear manual CPM base value from local storage', error);
          }
        }
      }
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(manualCpmBaseStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.value === 'number' && Number.isFinite(parsed.value)) {
          setManualCpmBaseValue(parsed.value);
        } else {
          setManualCpmBaseValue(null);
        }
      } else {
        setManualCpmBaseValue(null);
      }
    } catch (error) {
      console.error('Failed to restore manual CPM base value from local storage', error);
    }
  }, [manualCpmBaseStorageKey, preferences?.manualCpmBase]);

  useEffect(() => {
    if (!manualT8BaseStorageKey) {
      setManualT8BaseValue(null);
      return;
    }

    const baseFromProfile = preferences?.manualT8Base;
    if (baseFromProfile !== undefined) {
      if (typeof baseFromProfile === 'number' && Number.isFinite(baseFromProfile)) {
        setManualT8BaseValue(baseFromProfile);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              manualT8BaseStorageKey,
              JSON.stringify({ value: baseFromProfile })
            );
          } catch (error) {
            console.error('Failed to sync manual T-8 base value to local storage', error);
          }
        }
      } else {
        setManualT8BaseValue(null);
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(manualT8BaseStorageKey);
          } catch (error) {
            console.error('Failed to clear manual T-8 base value from local storage', error);
          }
        }
      }
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(manualT8BaseStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.value === 'number' && Number.isFinite(parsed.value)) {
          setManualT8BaseValue(parsed.value);
        } else {
          setManualT8BaseValue(null);
        }
      } else {
        setManualT8BaseValue(null);
      }
    } catch (error) {
      console.error('Failed to restore manual T-8 base value from local storage', error);
    }
  }, [manualT8BaseStorageKey, preferences?.manualT8Base]);


  const persistManualCpm = useCallback(
    async ({ finalValue, baseValue }) => {
      if (!user?.uid || !savePreferences) {
        return;
      }

      const normalizedFinal =
        finalValue === null || finalValue === undefined
          ? null
          : Number(finalValue);
      const normalizedBase =
        baseValue === undefined
          ? undefined
          : baseValue === null || baseValue === undefined
            ? null
            : Number(baseValue);

      const payload = { manualCpm: normalizedFinal };
      if (normalizedBase !== undefined) {
        payload.manualCpmBase = normalizedBase;
      }

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
        if (
          normalizedBase !== undefined &&
          manualCpmBaseStorageKey &&
          typeof window !== 'undefined'
        ) {
          if (normalizedBase === null) {
            localStorage.removeItem(manualCpmBaseStorageKey);
          } else {
            localStorage.setItem(
              manualCpmBaseStorageKey,
              JSON.stringify({ value: normalizedBase })
            );
          }
        }

        await saveUserMetricsSnapshot(user.uid, {
          manual: {
            cpm: {
              value: normalizedFinal,
              base: normalizedBase === undefined ? manualCpmBaseValue : normalizedBase,
            },
          },
          manualUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to persist manual CPM value in profile', error);
        throw error;
      }
    },
    [
      manualCpmBaseStorageKey,
      manualCpmBaseValue,
      manualCpmStorageKey,
      savePreferences,
      user?.uid,
    ]
  );

  const persistManualT8 = useCallback(
    async ({ finalValue, baseValue }) => {
      if (!user?.uid || !savePreferences) {
        return;
      }

      const normalizedFinal =
        finalValue === null || finalValue === undefined
          ? null
          : Number(finalValue);
      const normalizedBase =
        baseValue === undefined
          ? undefined
          : baseValue === null || baseValue === undefined
            ? null
            : Number(baseValue);

      const payload = { manualT8: normalizedFinal };
      if (normalizedBase !== undefined) {
        payload.manualT8Base = normalizedBase;
      }

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
        if (
          normalizedBase !== undefined &&
          manualT8BaseStorageKey &&
          typeof window !== 'undefined'
        ) {
          if (normalizedBase === null) {
            localStorage.removeItem(manualT8BaseStorageKey);
          } else {
            localStorage.setItem(
              manualT8BaseStorageKey,
              JSON.stringify({ value: normalizedBase })
            );
          }
        }

        await saveUserMetricsSnapshot(user.uid, {
          manual: {
            t8: {
              value: normalizedFinal,
              riseDay:
                normalizedBase === undefined ? manualT8BaseValue : normalizedBase,
            },
          },
          manualUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to persist manual T-8 value in profile', error);
        throw error;
      }
    },
    [
      manualT8BaseStorageKey,
      manualT8BaseValue,
      manualT8StorageKey,
      savePreferences,
      user?.uid,
    ]
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
      
          let baseValueFromStorage = manualCpmBaseValue;
          try {
            if (manualCpmBaseStorageKey) {
              const baseStored = localStorage.getItem(manualCpmBaseStorageKey);
              if (baseStored) {
                const baseParsed = JSON.parse(baseStored);
                if (
                  baseParsed &&
                  typeof baseParsed.value === 'number' &&
                  Number.isFinite(baseParsed.value)
                ) {
                  baseValueFromStorage = baseParsed.value;
                } else {
                  baseValueFromStorage = null;
                }
              }
            }
          } catch (baseError) {
            console.error('Failed to read manual CPM base value from local storage', baseError);
          }

          setManualCpmBaseValue(
            typeof baseValueFromStorage === 'number' &&
              Number.isFinite(baseValueFromStorage)
              ? baseValueFromStorage
              : null
          );

          persistManualCpm({
            finalValue: parsed.value,
            baseValue: baseValueFromStorage,
          }).catch((error) =>
            console.error('Failed to migrate manual CPM value to profile storage', error)
          );
        }
      }
    } catch (error) {
      console.error('Failed to restore manual CPM value from local storage', error);
    } finally {
      manualCpmRestoreAttemptedRef.current = true;
    }

    }, [
      manualCpmBaseStorageKey,
      manualCpmBaseValue,
      manualCpmStorageKey,
      persistManualCpm,
      preferences?.manualCpm,
      user?.uid,
    ]);

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
          let baseValueFromStorage = manualT8BaseValue;
          try {
            if (manualT8BaseStorageKey) {
              const baseStored = localStorage.getItem(manualT8BaseStorageKey);
              if (baseStored) {
                const baseParsed = JSON.parse(baseStored);
                if (
                  baseParsed &&
                  typeof baseParsed.value === 'number' &&
                  Number.isFinite(baseParsed.value)
                ) {
                  baseValueFromStorage = baseParsed.value;
                } else {
                  baseValueFromStorage = null;
                }
              }
            }
          } catch (baseError) {
            console.error('Failed to read manual T-8 base value from local storage', baseError);
          }

          setManualT8BaseValue(
            typeof baseValueFromStorage === 'number' &&
              Number.isFinite(baseValueFromStorage)
              ? baseValueFromStorage
              : null
          );

          persistManualT8({
            finalValue: parsed.value,
            baseValue: baseValueFromStorage,
          }).catch((error) =>
            console.error('Failed to migrate manual T-8 value to profile storage', error)
          );
        }
      }
    } catch (error) {
      console.error('Failed to restore manual T-8 value from local storage', error);
    } finally {
      manualT8RestoreAttemptedRef.current = true;
    }
  }, [
    manualT8BaseStorageKey,
    manualT8BaseValue,
    manualT8StorageKey,
    persistManualT8,
    preferences?.manualT8,
    user?.uid,
  ]);

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
          ignoredForAutoCalculations: Boolean(cycle.ignoredForAutoCalculations),
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
        ignoredForAutoCalculations: Boolean(currentCycle.ignoredForAutoCalculations),
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
            ignoredForAutoCalculations: Boolean(cycle.ignoredForAutoCalculations),
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

    const annotatedCycles = sortedByDuration.map((cycle) => {
      const isIgnored = Boolean(cycle.ignoredForAutoCalculations);
      return {
        ...cycle,
        isIgnored,
        isIncluded: !isIgnored,
      };
    });

    const includedCycles = annotatedCycles.filter((cycle) => cycle.isIncluded);
    const ignoredCount = annotatedCycles.length - includedCycles.length;
    const includedCount = includedCycles.length;

    if (includedCount < 6) {
      return {
        value: null,
        cycleCount: includedCount,
        shortestCycle: null,
        deduction: null,
        canCompute: false,
        cyclesConsidered: annotatedCycles,
        ignoredCount,
      };
    }

    const shortestCycle = includedCycles[0] ?? null;
    const deduction = includedCount >= 12 ? 20 : 21;
    const computedValue =
      typeof shortestCycle?.duration === 'number' && Number.isFinite(shortestCycle.duration)
        ? Math.max(1, shortestCycle.duration - deduction)
        : null;

    return {
      value: computedValue,
      cycleCount: includedCount,
      shortestCycle,
      deduction,
      canCompute: computedValue !== null,
      cyclesConsidered: annotatedCycles,
      ignoredCount,
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

    const consideredCycles = [];
    const includedCycles = [];

    for (const cycle of sortedCycles) {

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
      const isIgnored = Boolean(cycle.ignoredForAutoCalculations);

      const cycleInfo = {
        cycleId: cycle.id,
        riseDay,
        t8Day,
        displayName: cycle.displayName || cycle.name || 'Ciclo sin nombre',
        dateRangeLabel: cycle.dateRangeLabel,
        isIgnored,
        isIncluded: !isIgnored,
        ignoredForAutoCalculations: isIgnored,
      };

      consideredCycles.push(cycleInfo);

      if (!isIgnored && includedCycles.length < 12) {
        includedCycles.push(cycleInfo);
      }
    }

    const cycleCount = includedCycles.length;
    const ignoredCount = consideredCycles.reduce(
      (total, cycle) => total + (cycle.isIgnored ? 1 : 0),
      0
    );

    if (cycleCount === 0) {
      return {
        value: null,
        cycleCount,
        earliestCycle: null,
        cyclesConsidered: consideredCycles,
        canCompute: false,
        rawValue: null,
        ignoredCount,
      };
    }

    const earliestCycle = includedCycles.reduce((earliest, current) =>
      current.t8Day < earliest.t8Day ? current : earliest
    );

    const computedValue = earliestCycle.t8Day;
    const canCompute = cycleCount >= 6;

    return {
      value: canCompute ? computedValue : null,
      cycleCount,
      earliestCycle,
      cyclesConsidered: consideredCycles,
      canCompute,
      rawValue: computedValue,
      ignoredCount,
    };
  }, [combinedCycles]);
  
  useEffect(() => {
    if (cpmSelectionInitializedRef.current) return;
    if (!preferences) return;

    let resolvedMode = preferences?.cpmMode;
    if (!['auto', 'manual', 'none'].includes(resolvedMode)) {
      resolvedMode = isManualCpm
        ? 'manual'
        : computedCpmData.canCompute
          ? 'auto'
          : 'none';
    }

    setCpmSelection(resolvedMode);
    setCpmSelectionDraft(resolvedMode);
    cpmSelectionInitializedRef.current = true;
  }, [computedCpmData.canCompute, isManualCpm, preferences]);

  useEffect(() => {
    if (t8SelectionInitializedRef.current) return;
    if (!preferences) return;

    let resolvedMode = preferences?.t8Mode;
    if (!['auto', 'manual', 'none'].includes(resolvedMode)) {
      resolvedMode = isManualT8
        ? 'manual'
        : computedT8Data.canCompute
          ? 'auto'
          : 'none';
    }

    setT8Selection(resolvedMode);
    setT8SelectionDraft(resolvedMode);
    t8SelectionInitializedRef.current = true;
  }, [computedT8Data.canCompute, isManualT8, preferences]);
  useEffect(() => {
    if (!user?.uid) {
      automaticMetricsSnapshotRef.current = null;
      return;
    }

    const safeNumber = (value) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    const sanitizeCpmCycle = (cycle) => {
      if (!cycle) {
        return null;
      }

      return {
        id: cycle.id ?? null,
        name: cycle.name ?? null,
        displayName: cycle.displayName ?? null,
        startDate: cycle.startDate ?? null,
        endDate: cycle.endDate ?? null,
        duration: safeNumber(cycle.duration),
        source: cycle.source ?? null,
        dateRangeLabel: cycle.dateRangeLabel ?? null,
      };
    };

    const sanitizeT8Cycle = (cycle) => {
      if (!cycle) {
        return null;
      }

      return {
        id: cycle.id ?? null,
        name: cycle.name ?? null,
        displayName: cycle.displayName ?? null,
        startDate: cycle.startDate ?? null,
        endDate: cycle.endDate ?? null,
        riseDay: safeNumber(cycle.riseDay),
        t8Day: safeNumber(cycle.t8Day),
        source: cycle.source ?? null,
        dateRangeLabel: cycle.dateRangeLabel ?? null,
      };
    };

    const metricsPayload = {
      automatic: {
        cpm: {
          value: safeNumber(computedCpmData?.value),
          cycleCount: safeNumber(computedCpmData?.cycleCount) ?? 0,
          ignoredCount: safeNumber(computedCpmData?.ignoredCount) ?? 0,
          deduction: safeNumber(computedCpmData?.deduction),
          canCompute: Boolean(computedCpmData?.canCompute),
          shortestCycle: sanitizeCpmCycle(computedCpmData?.shortestCycle),
        },
        t8: {
          value: safeNumber(computedT8Data?.value),
          cycleCount: safeNumber(computedT8Data?.cycleCount) ?? 0,
          ignoredCount: safeNumber(computedT8Data?.ignoredCount) ?? 0,
          canCompute: Boolean(computedT8Data?.canCompute),
          riseDay: safeNumber(computedT8Data?.earliestCycle?.riseDay),
          earliestCycle: sanitizeT8Cycle(computedT8Data?.earliestCycle),
        },
      },
    };

    const serialized = JSON.stringify(metricsPayload);
    if (automaticMetricsSnapshotRef.current === serialized) {
      return;
    }

    automaticMetricsSnapshotRef.current = serialized;

    saveUserMetricsSnapshot(user.uid, {
      ...metricsPayload,
      automaticUpdatedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error('Failed to persist automatic metrics snapshot', error);
    });
  }, [computedCpmData, computedT8Data, user?.uid]);

  const cpmInfo = useMemo(() => {
    const cycleCount = computedCpmData.cycleCount ?? 0;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const resolvedMode = ['auto', 'manual', 'none'].includes(cpmSelection)
      ? cpmSelection
      : 'auto';
    const sourceLabel =
      resolvedMode === 'manual' && isManualCpm
        ? 'Manual'
        : resolvedMode === 'auto' && computedCpmData.canCompute
          ? 'Automático'
          : resolvedMode === 'none'
            ? 'Sin usar'
            : 'Automático';
    const cycles = computedCpmData.cyclesConsidered ?? [];
    const canCompute = Boolean(computedCpmData.canCompute);
    const ignoredCount = computedCpmData.ignoredCount ?? 0;
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
      summary = ignoredCount > 0
        ? 'Todos los ciclos disponibles están ignorados para el cálculo automático.'
        : 'Aún no hay ciclos finalizados con fecha de finalización.';
    } else if (!canCompute) {
      summary = `Hay ${cyclesLabel} finalizado${cycleCount === 1 ? '' : 's'}. Se necesitan ${requiredCycles} para calcular el CPM automáticamente.`;
      if (ignoredCount > 0) {
        summary += ` (${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}).`;
      }
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
      if (ignoredCount > 0) {
        parts.push(
          `${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}.`
        );
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
      ignoredCount,
    };
  }, [computedCpmData, cpmSelection, isManualCpm]);

  const t8Info = useMemo(() => {
    const cycleCount = computedT8Data.cycleCount;
    const cyclesLabel = `${cycleCount} ciclo${cycleCount === 1 ? '' : 's'}`;
    const requiredCycles = 6;
    const resolvedMode = ['auto', 'manual', 'none'].includes(t8Selection)
      ? t8Selection
      : 'auto';
    const sourceLabel =
      resolvedMode === 'manual' && isManualT8
        ? 'Manual'
        : resolvedMode === 'auto' && computedT8Data.canCompute
          ? 'Automático'
          : resolvedMode === 'none'
            ? 'Sin usar'
            : 'Automático';
    const ignoredCount = computedT8Data.ignoredCount ?? 0;

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
      summary = ignoredCount > 0
        ? 'Los ciclos disponibles están ignorados para el cálculo automático.'
        : 'Aún no hay ciclos con ovulación confirmada por temperatura.';
    } else if (!computedT8Data.canCompute) {
      summary = `Hay ${cyclesLabel} con ovulación confirmada por temperatura (se necesitan ${requiredCycles}).`;
      if (ignoredCount > 0) {
        summary += ` ${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}.`;
      }
    } else {
      const parts = [`${cycleName} (${dayText}${t8Text ? ` → ${t8Text}` : ''}).`];
      if (ignoredCount > 0) {
        parts.push(`${ignoredCount} ciclo${ignoredCount === 1 ? '' : 's'} ignorado${ignoredCount === 1 ? '' : 's'}.`);
      }
      summary = parts.join(' ');
    }

    return {
      sourceLabel,
      summary,
      highlightLabel: cyclesLabel,
      cycleCount,
      requiredCycles,
      ignoredCount,
    };
  }, [computedT8Data, isManualT8, t8Selection]);

  const formatNumber = useCallback((value, options) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return value.toLocaleString('es-ES', options);
  }, []);

    const cpmMetric = useMemo(
    () =>
      buildCpmMetric({
        computedCpmData,
        cpmSelection,
        isManualCpm,
        manualCpmBaseValue,
        manualCpmValue,
        formatNumber,
      }),
    [computedCpmData, cpmSelection, formatNumber, isManualCpm, manualCpmBaseValue, manualCpmValue]
  );

  const t8Metric = useMemo(
    () =>
      buildT8Metric({
        computedT8Data,
        t8Selection,
        isManualT8,
        manualT8BaseValue,
        manualT8Value,
        formatNumber,
      }),
    [computedT8Data, formatNumber, isManualT8, manualT8BaseValue, manualT8Value, t8Selection]
  );

  const cpmAutomaticValueLabel =
    formatNumber(cpmInfo.value, { maximumFractionDigits: 1 }) ??
    (typeof cpmInfo.value === 'number' && Number.isFinite(cpmInfo.value)
      ? `${cpmInfo.value}`
      : '—');
  const cpmManualValueLabel =
    formatNumber(manualCpmValue, { maximumFractionDigits: 1 }) ??
    (typeof manualCpmValue === 'number' && Number.isFinite(manualCpmValue)
      ? `${manualCpmValue}`
      : '—');
  const resolvedCpmMode = ['auto', 'manual', 'none'].includes(cpmSelection)
    ? cpmSelection
    : 'auto';
  const cpmStatusMode =
    resolvedCpmMode === 'manual'
      ? isManualCpm
        ? 'manual'
        : 'none'
      : resolvedCpmMode === 'auto'
        ? 'auto'
        : 'none';
  const cpmStatusValueLabel =
    cpmStatusMode === 'manual'
      ? `CPM manual: ${cpmManualValueLabel}`
      : cpmStatusMode === 'auto'
        ? `CPM automático: ${cpmAutomaticValueLabel}`
        : '—';
  const cpmStatusHelperText =
    cpmStatusMode === 'manual'
      ? 'Se usa el valor que has introducido manualmente.'
      : cpmStatusMode === 'auto'
        ? computedCpmData.canCompute
          ? 'Se usa el valor calculado con tus ciclos.'
          : 'Faltan ciclos para calcular el CPM automáticamente.'
        : 'Este dato no se tendrá en cuenta en la interpretación.';
  const cpmStatusChipLabel =
    cpmStatusMode === 'manual' ? 'Manual' : cpmStatusMode === 'auto' ? 'Automático' : 'Sin usar';

  const t8AutomaticValueLabel =
    formatNumber(computedT8Data.value, { maximumFractionDigits: 0 }) ??
    (typeof computedT8Data.value === 'number' && Number.isFinite(computedT8Data.value)
      ? `${computedT8Data.value}`
      : '—');
  const t8ManualValueLabel =
    formatNumber(manualT8Value, { maximumFractionDigits: 0 }) ??
    (typeof manualT8Value === 'number' && Number.isFinite(manualT8Value)
      ? `${manualT8Value}`
      : '—');
  const resolvedT8Mode = ['auto', 'manual', 'none'].includes(t8Selection)
    ? t8Selection
    : 'auto';
  const t8StatusMode =
    resolvedT8Mode === 'manual'
      ? isManualT8
        ? 'manual'
        : 'none'
      : resolvedT8Mode === 'auto'
        ? 'auto'
        : 'none';
  const t8StatusValueLabel =
    t8StatusMode === 'manual'
      ? `T-8 manual: Día ${t8ManualValueLabel}`
      : t8StatusMode === 'auto'
        ? `T-8 automático: Día ${t8AutomaticValueLabel}`
        : '—';
  const t8StatusHelperText =
    t8StatusMode === 'manual'
      ? 'Se usa el valor que has introducido manualmente.'
      : t8StatusMode === 'auto'
        ? computedT8Data.canCompute
          ? 'Se usa el valor calculado con tus ciclos.'
          : 'Faltan ciclos para calcular el T-8 automáticamente.'
        : 'Este dato no se tendrá en cuenta en la interpretación.';
  const t8StatusChipLabel =
    t8StatusMode === 'manual' ? 'Manual' : t8StatusMode === 'auto' ? 'Automático' : 'Sin usar';

  const resolvedManualCpmSide = useMemo(() => {
    if (manualCpmEditedSide) {
      return manualCpmEditedSide;
    }

    if (manualCpmFinalInput.trim()) {
      return 'final';
    }

    if (manualCpmBaseInput.trim()) {
      return 'base';
    }

    return null;
  }, [manualCpmBaseInput, manualCpmEditedSide, manualCpmFinalInput]);

  const isCpmSaveDisabled = useMemo(() => {
    if (cpmSelectionDraft === 'manual') {
      if (manualCpmBaseError || manualCpmFinalError) {
        return true;
      }

      const hasValidBase = manualCpmBaseInput.trim() !== '' && !manualCpmBaseError;
      const hasValidFinal = manualCpmFinalInput.trim() !== '' && !manualCpmFinalError;

      return !hasValidBase && !hasValidFinal;
    }

    return false;
  }, [
    cpmSelectionDraft,
    manualCpmBaseError,
    manualCpmBaseInput,
    manualCpmFinalError,
    manualCpmFinalInput,
  ]);

  const canDeleteManualCpm = useMemo(() => {
    return Boolean(isManualCpm || manualCpmBaseInput.trim() || manualCpmFinalInput.trim());
  }, [isManualCpm, manualCpmBaseInput, manualCpmFinalInput]);

  const resolvedManualT8Side = useMemo(() => {
    if (manualT8EditedSide) {
      return manualT8EditedSide;
    }

    if (manualT8FinalInput.trim()) {
      return 'final';
    }

    if (manualT8BaseInput.trim()) {
      return 'base';
    }

    return null;
  }, [manualT8BaseInput, manualT8EditedSide, manualT8FinalInput]);

  const isT8SaveDisabled = useMemo(() => {
    if (t8SelectionDraft === 'manual') {
      if (manualT8BaseError || manualT8FinalError) {
        return true;
      }

      const hasValidBase = manualT8BaseInput.trim() !== '' && !manualT8BaseError;
      const hasValidFinal = manualT8FinalInput.trim() !== '' && !manualT8FinalError;

       return !hasValidBase && !hasValidFinal;
    }

    return false;
  }, [
    manualT8BaseError,
    manualT8BaseInput,
    manualT8FinalError,
    manualT8FinalInput,
    t8SelectionDraft,
  ]);

  const canDeleteManualT8 = useMemo(() => {
    return Boolean(isManualT8 || manualT8BaseInput.trim() || manualT8FinalInput.trim());
  }, [isManualT8, manualT8BaseInput, manualT8FinalInput]);

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

  const handleToggleCycleIgnore = useCallback(
    async (cycleId, shouldIgnore) => {
      if (!cycleId) {
        return;
      }

      setPendingIgnoredCycleIds((previous) =>
        previous.includes(cycleId) ? previous : [...previous, cycleId]
      );

      try {
        await setCycleIgnoreForAutoCalculations(cycleId, shouldIgnore);
        toast({
          title: shouldIgnore ? 'Ciclo ignorado' : 'Ciclo incluido',
          description: shouldIgnore
            ? 'El ciclo se excluyó del cálculo automático.'
            : 'El ciclo se volvió a incluir en el cálculo automático.',
        });
      } catch (error) {
        // El contexto ya maneja el mensaje de error.
      } finally {
        setPendingIgnoredCycleIds((previous) => previous.filter((id) => id !== cycleId));
      }
    },
    [setCycleIgnoreForAutoCalculations, toast]
  );

  const handleCardKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }, []);

  const handleOpenCpmDialog = useCallback(() => {
    const automaticBase =
      typeof computedCpmData.shortestCycle?.duration === 'number' &&
      Number.isFinite(computedCpmData.shortestCycle.duration)
        ? computedCpmData.shortestCycle.duration
        : null;
    const automaticFinal =
      typeof computedCpmData.value === 'number' && Number.isFinite(computedCpmData.value)
        ? computedCpmData.value
        : null;

    const hasManualBase =
      typeof manualCpmBaseValue === 'number' && Number.isFinite(manualCpmBaseValue);
    const hasManualFinal = typeof manualCpmValue === 'number' && Number.isFinite(manualCpmValue);

    const initialBase = isManualCpm && hasManualBase ? manualCpmBaseValue : automaticBase;
    const initialFinal = isManualCpm && hasManualFinal ? manualCpmValue : automaticFinal;

    setManualCpmBaseInput(
      typeof initialBase === 'number' && Number.isFinite(initialBase) ? String(initialBase) : ''
    );
    setManualCpmFinalInput(
      typeof initialFinal === 'number' && Number.isFinite(initialFinal) ? String(initialFinal) : ''
    );
    setManualCpmBaseError('');
    setManualCpmFinalError('');
    setManualCpmEditedSide(null);
    setCpmSelectionDraft(cpmSelection);
    setShowCpmDetails(false);
    setIsCpmDialogOpen(true);
  }, [computedCpmData, cpmSelection, isManualCpm, manualCpmBaseValue, manualCpmValue]);

  const handleCloseCpmDialog = useCallback(() => {
    setShowCpmDetails(false);
    setShowCpmDeleteDialog(false);
    setIsDeletingManualCpm(false);
    setIsCpmDialogOpen(false);
  }, []);

  const handleManualCpmBaseInputChange = useCallback(
    (event) => {
      const { value } = event.target;
      setManualCpmBaseInput(value);
      setManualCpmEditedSide('base');
      setManualCpmBaseError('');
      setManualCpmFinalError('');

      if (!value.trim()) {
        setManualCpmFinalInput('');
        return;
      }

      const parsedBase = Number.parseInt(value, 10);

      if (!Number.isFinite(parsedBase)) {
        setManualCpmBaseError('El ciclo más corto debe ser ≥ 1');
        setManualCpmFinalInput('');
        return;
      }

      if (parsedBase < 1) {
        setManualCpmBaseError('El día de subida debe ser ≥ 1');
        setManualCpmFinalInput('');
        return;
      }

      const result = Math.max(1, parsedBase - MANUAL_CPM_DEDUCTION);
      setManualCpmFinalInput(String(result));
    },
    []
  );

  const handleManualCpmFinalInputChange = useCallback(
    (event) => {
      const { value } = event.target;

      setManualCpmFinalInput(value);
      setManualCpmEditedSide('final');
      setManualCpmFinalError('');
      setManualCpmBaseError('');

      if (!value.trim()) {
        return;
      }

      // permitimos coma o punto
      const normalized = value.replace(',', '.');
      const parsed = Number.parseFloat(normalized);

      if (!Number.isFinite(parsed)) {
        setManualCpmFinalError('Introduce un número válido.');
        return;
      }

      if (parsed < 1) {
        setManualCpmFinalError('El CPM debe ser ≥ 1');
        return;
      }

    },
    []
  );


  const handleSaveManualCpm = useCallback(async () => {
    if (manualCpmBaseError || manualCpmFinalError) {
      return false;
    }

    const trimmedBase = manualCpmBaseInput.trim();
    const trimmedFinal = manualCpmFinalInput.trim();
    const activeSide =
      manualCpmEditedSide ?? (trimmedFinal ? 'final' : trimmedBase ? 'base' : null);

    if (!activeSide) {
      setManualCpmFinalError('Introduce un valor.');
      return false;
    }

    let baseValueToPersist = manualCpmBaseValue;
    let finalValueToPersist;

    if (activeSide === 'base') {
      if (!trimmedBase) {
        setManualCpmBaseError('Introduce un número entero válido.');
        return false;
      }

      const parsedBase = Number.parseInt(trimmedBase, 10);

      if (!Number.isFinite(parsedBase)) {
        setManualCpmBaseError('Introduce un número entero válido.');
        return false;
      }

      const computedFinal = Math.max(1, parsedBase - MANUAL_CPM_DEDUCTION);

      baseValueToPersist = parsedBase;
      finalValueToPersist = computedFinal;
      setManualCpmFinalInput(String(computedFinal));
      setManualCpmFinalError('');
    } else {
      if (!trimmedFinal) {
        setManualCpmFinalError('Introduce un valor.');
        return false;
      }

      const normalized = trimmedFinal.replace(',', '.');
      const parsedFinal = Number.parseFloat(normalized);

      if (!Number.isFinite(parsedFinal) || parsedFinal < 1) {
        setManualCpmFinalError('El CPM debe ser ≥ 1 día');
        return false;
      }

      finalValueToPersist = parsedFinal;

      if (!trimmedBase) {
        baseValueToPersist = null;
        } else {
        const parsedBase = Number.parseInt(trimmedBase, 10);
        if (!Number.isFinite(parsedBase) || parsedBase < 1) {
          setManualCpmBaseError('Introduce un número entero válido.');
          return false;
        }
        baseValueToPersist = parsedBase;
      }
    }
    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;
    const previousBaseValue = manualCpmBaseValue;

    setManualCpmValue(finalValueToPersist);
    setIsManualCpm(true);
    setManualCpmBaseValue(
      typeof baseValueToPersist === 'number' && Number.isFinite(baseValueToPersist)
        ? baseValueToPersist
        : null
    );

    try {
      await persistManualCpm({
        finalValue: finalValueToPersist,
        baseValue: baseValueToPersist,
      });

      setIsCpmDialogOpen(false);
      toast({ title: 'CPM actualizado', description: 'El CPM manual se guardó en tu perfil.' });
      return true;
    } catch (error) {
      console.error('Failed to save manual CPM value', error);
      setManualCpmValue(previousValue);
      setManualCpmBaseValue(previousBaseValue);
      setIsManualCpm(previousIsManual);
      setManualCpmFinalError('No se pudo guardar el CPM. Inténtalo de nuevo.');
      return false;
    }
  }, [
    isManualCpm,
    manualCpmBaseError,
    manualCpmBaseInput,
    manualCpmBaseValue,
    manualCpmEditedSide,
    manualCpmFinalError,
    manualCpmFinalInput,
    manualCpmValue,
    persistManualCpm,
    toast,
  ]);

  const handleDeleteManualCpm = useCallback(async () => {
    const previousValue = manualCpmValue;
    const previousIsManual = isManualCpm;
    const previousBaseValue = manualCpmBaseValue;

    setManualCpmValue(null);
    setManualCpmBaseValue(null);
    setIsManualCpm(false);
    setManualCpmBaseInput('');
    setManualCpmFinalInput('');
    setManualCpmBaseError('');
    setManualCpmFinalError('');
    setManualCpmEditedSide(null);

    try {
      await persistManualCpm({ finalValue: null, baseValue: null });
      toast({
        title: 'CPM borrado',
        description:
          'El valor manual se eliminó. Puedes guardar un nuevo valor o continuar con el cálculo automático.',
      });
    } catch (error) {
      console.error('Failed to delete manual CPM value', error);
      setManualCpmValue(previousValue);
      setManualCpmBaseValue(previousBaseValue);
      setIsManualCpm(previousIsManual);
      setManualCpmFinalError('No se pudo borrar el CPM. Inténtalo de nuevo.');
    }
  }, [isManualCpm, manualCpmBaseValue, manualCpmValue, persistManualCpm, toast]);

  const handleConfirmCpmDelete = useCallback(
    async () => {
      setIsDeletingManualCpm(true);


      try {
        await handleDeleteManualCpm();
        setShowCpmDeleteDialog(false);
        const nextMode = cpmInfo.canCompute ? 'auto' : 'none';
        setCpmSelection(nextMode);
        setCpmSelectionDraft(nextMode);
        await persistCpmMode(nextMode);
      } finally {
        setIsDeletingManualCpm(false);
      }
    },
    [cpmInfo.canCompute, handleDeleteManualCpm, persistCpmMode]
  );

  const handleSelectCpmMode = useCallback(
    (mode) => {
      setCpmSelectionDraft(mode);
    },
    []
  );

  const handleSaveCpm = useCallback(async () => {
    const selectedMode = cpmSelectionDraft;

    if (selectedMode === 'manual') {
      const saved = await handleSaveManualCpm();
      if (!saved) {
        return;
      }

      setCpmSelection('manual');
      setCpmSelectionDraft('manual');
      await persistCpmMode('manual');
      return;
    }

    const nextMode = ['auto', 'none'].includes(selectedMode) ? selectedMode : 'auto';
    setCpmSelection(nextMode);
    setCpmSelectionDraft(nextMode);
    await persistCpmMode(nextMode);
    handleCloseCpmDialog();
  }, [cpmSelectionDraft, handleCloseCpmDialog, handleSaveManualCpm, persistCpmMode]);

  const handleOpenT8Dialog = useCallback(() => {
  const hasManualBase =
      typeof manualT8BaseValue === 'number' && Number.isFinite(manualT8BaseValue);
    const hasManualFinal =
      typeof manualT8Value === 'number' && Number.isFinite(manualT8Value);

    // En el modo manual solo rellenamos los inputs con valores realmente manuales.
    // Si no hay T-8 manual guardado, los campos empiezan vacíos.
    const initialBase = isManualT8 && hasManualBase ? manualT8BaseValue : null;
    const initialFinal = isManualT8 && hasManualFinal ? manualT8Value : null;
    setManualT8BaseInput(
      typeof initialBase === 'number' && Number.isFinite(initialBase) ? String(initialBase) : ''
    );
    setManualT8FinalInput(
      typeof initialFinal === 'number' && Number.isFinite(initialFinal) ? String(initialFinal) : ''
    );
    setManualT8BaseError('');
    setManualT8FinalError('');
    setManualT8EditedSide(null);
    setT8SelectionDraft(t8Selection);
    setShowT8Details(false);
    setIsT8DialogOpen(true);
  }, [isManualT8, manualT8BaseValue, manualT8Value, t8Selection]);

  const handleCloseT8Dialog = useCallback(() => {
    setIsT8DialogOpen(false);
    setShowT8Details(false);
    setShowT8DeleteDialog(false);
    setIsDeletingManualT8(false);
  }, []);

  const handleManualT8BaseInputChange = useCallback((event) => {
    const { value } = event.target;
    setManualT8BaseInput(value);
    setManualT8EditedSide('base');
    setManualT8BaseError('');
    setManualT8FinalError('');

    if (!value.trim()) {
      setManualT8FinalInput('');
      return;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
      setManualT8BaseError('Introduce un número entero válido.');
      setManualT8FinalInput('');
      return;
    }

    if (parsed < 1) {
      setManualT8BaseError('Introduce un número entero válido.');
      setManualT8FinalInput('');
      return;
    }

    const computedFinal = Math.max(1, parsed - 8);
    setManualT8FinalInput(String(computedFinal));
  }, []);

  const handleManualT8FinalInputChange = useCallback((event) => {
    const { value } = event.target;
    setManualT8FinalInput(value);
    setManualT8EditedSide('final');
    setManualT8FinalError('');
    setManualT8BaseError('');

    if (!value.trim()) {
      return;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      setManualT8FinalError('El T-8 debe ser ≥ 1');
    }
  }, []);

  const handleSaveManualT8 = useCallback(async () => {
    if (manualT8BaseError || manualT8FinalError) {
      return false;
    }

    const trimmedBase = manualT8BaseInput.trim();
    const trimmedFinal = manualT8FinalInput.trim();
    const activeSide =
      manualT8EditedSide ?? (trimmedFinal ? 'final' : trimmedBase ? 'base' : null);

    if (!activeSide) {
      setManualT8FinalError('Introduce un valor.');
      return false;
    }

    let baseValueToPersist = manualT8BaseValue;
    let finalValueToPersist;

    if (activeSide === 'base') {
      if (!trimmedBase) {
        setManualT8BaseError('Introduce un número entero válido.');
        return false;
      }

      const parsedBase = Number.parseInt(trimmedBase, 10);

      if (!Number.isFinite(parsedBase) || parsedBase < 1) {
      setManualT8BaseError('Introduce un número entero válido.');
      return false;
    }

      const computedFinal = Math.max(1, parsedBase - 8);
      baseValueToPersist = parsedBase;
      finalValueToPersist = computedFinal;
      setManualT8FinalInput(String(computedFinal));
      setManualT8FinalError('');
    } else {
      if (!trimmedFinal) {
        setManualT8FinalError('Introduce un valor.');
        return false;
      }

      const parsedFinal = Number.parseInt(trimmedFinal, 10);

      if (!Number.isFinite(parsedFinal) || parsedFinal < 1) {
        setManualT8FinalError('El T-8 debe ser ≥ 1');
        return false;
      }

      finalValueToPersist = parsedFinal;

      if (!trimmedBase) {
        baseValueToPersist = null;
        } else {
        const parsedBase = Number.parseInt(trimmedBase, 10);
        if (!Number.isFinite(parsedBase) || parsedBase < 1) {
          setManualT8BaseError('Introduce un número entero válido.');
          return false;
        }
        baseValueToPersist = parsedBase;
      }
    }

    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;
    const previousBaseValue = manualT8BaseValue;

    setManualT8Value(finalValueToPersist);
    setIsManualT8(true);
    setManualT8BaseValue(
      typeof baseValueToPersist === 'number' && Number.isFinite(baseValueToPersist)
        ? baseValueToPersist
        : null
    );

    try {
      await persistManualT8({
        finalValue: finalValueToPersist,
        baseValue: baseValueToPersist,
      });

      setIsT8DialogOpen(false);
      toast({ title: 'T-8 actualizado', description: 'El T-8 manual se guardó en tu perfil.' });
      return true;
    } catch (error) {
      console.error('Failed to save manual T-8 value', error);
      setManualT8Value(previousValue);
      setManualT8BaseValue(previousBaseValue);
      setIsManualT8(previousIsManual);
      setManualT8FinalError('No se pudo guardar el T-8. Inténtalo de nuevo.');
      return false;
    }
  }, [
    isManualT8,
    manualT8BaseError,
    manualT8BaseInput,
    manualT8BaseValue,
    manualT8EditedSide,
    manualT8FinalError,
    manualT8FinalInput,
    manualT8Value,
    persistManualT8,
    toast,
  ]);

  const handleDeleteManualT8 = useCallback(async () => {
    const previousValue = manualT8Value;
    const previousIsManual = isManualT8;
    const previousBaseValue = manualT8BaseValue;

    setManualT8Value(null);
    setManualT8BaseValue(null);
    setIsManualT8(false);
    setManualT8BaseInput('');
    setManualT8FinalInput('');
    setManualT8BaseError('');
    setManualT8FinalError('');
    setManualT8EditedSide(null);

    try {
      await persistManualT8({ finalValue: null, baseValue: null });
      toast({
        title: 'T-8 borrado',
        description:
          'El valor manual se eliminó. Puedes guardar un nuevo valor o continuar con el cálculo automático.',
      });
    } catch (error) {
      console.error('Failed to delete manual T-8 value', error);
      setManualT8Value(previousValue);
      setManualT8BaseValue(previousBaseValue);
      setIsManualT8(previousIsManual);
      setManualT8BaseError('No se pudo borrar el T-8. Inténtalo de nuevo.');
    }
  }, [isManualT8, manualT8BaseValue, manualT8Value, persistManualT8, toast]);

  const handleConfirmT8Delete = useCallback(
    async () => {
      setIsDeletingManualT8(true);

      try {
        await handleDeleteManualT8();
        setShowT8DeleteDialog(false);
        const nextMode = computedT8Data.canCompute ? 'auto' : 'none';
        setT8Selection(nextMode);
        setT8SelectionDraft(nextMode);
        await persistT8Mode(nextMode);
      } finally {
        setIsDeletingManualT8(false);
      }
    },
    [computedT8Data.canCompute, handleDeleteManualT8, persistT8Mode]
  );

  const handleSelectT8Mode = useCallback(
    (mode) => {
      setT8SelectionDraft(mode);
    },
    []
  );

  const handleSaveT8 = useCallback(async () => {
    const selectedMode = t8SelectionDraft;

    if (selectedMode === 'manual') {
      const saved = await handleSaveManualT8();
      if (!saved) {
        return;
      }

      setT8Selection('manual');
      setT8SelectionDraft('manual');
      await persistT8Mode('manual');
      return;
    }

    const nextMode = ['auto', 'none'].includes(selectedMode) ? selectedMode : 'auto';
    setT8Selection(nextMode);
    setT8SelectionDraft(nextMode);
    await persistT8Mode(nextMode);
    handleCloseT8Dialog();
  }, [handleCloseT8Dialog, handleSaveManualT8, persistT8Mode, t8SelectionDraft]);

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
  const [showPostpartumExitDialog, setShowPostpartumExitDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
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
    setInitialSectionKey(null);
  }, []);

  const handleConfirmPostpartumExit = useCallback(async () => {
    setShowPostpartumExitDialog(false);
    if (typeof savePreferences !== 'function') return;
    await savePreferences({
      fertilityStartConfig: {
        postpartum: false,
        calculators: { cpm: true, t8: true },
      },
    });
  }, [savePreferences]);

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleEdit = useCallback((record, sectionKey = null) => {
    setEditingRecord(record);
    setInitialSectionKey(sectionKey ?? null);
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

  const currentDay = useMemo(() => {
    if (!currentCycle?.startDate) return null;

  try {
      return (
        differenceInDays(startOfDay(new Date()), parseISO(currentCycle.startDate)) + 1
      );
    } catch (error) {
      console.error('Error calculating current day:', error);
      return null;
    }
  }, [currentCycle?.startDate]);

  const externalCalculatorCandidates = useMemo(() => {
    const candidates = [];
    const resolveMode = (value) =>
      ['auto', 'manual', 'none'].includes(value) ? value : 'auto';

    const addManualCandidate = (source, finalValue, baseValue) => {
      const numericDay = Number(finalValue);
      if (!Number.isFinite(numericDay) || numericDay < 0) {
        return;
      }

      const numericBase = Number(baseValue);
      const hasBase = Number.isFinite(numericBase) && numericBase > 0;
      const baseLabel = hasBase
        ? source === 'CPM'
          ? `ciclo base: ${numericBase}`
          : `base ${source}: ${numericBase}`
        : null;

      candidates.push({
        source,
        day: Math.max(1, numericDay),
        reason: baseLabel
          ? `Manual desde dashboard (${baseLabel})`
          : 'Manual desde dashboard',
        kind: 'calculator',
        isManual: true,
        manualBase: hasBase ? numericBase : null,
      });
    };

    const addAutoCandidate = (source, value, canUse) => {
      if (!canUse) return;
      const numericDay = Number(value);
      if (!Number.isFinite(numericDay)) return;

      candidates.push({
        source,
        day: Math.max(1, numericDay),
        reason: 'Automático desde dashboard',
        kind: 'calculator',
      });
    };

    const resolvedCpmMode = resolveMode(cpmSelection);
    if (resolvedCpmMode === 'manual') {
      addManualCandidate('CPM', manualCpmValue, manualCpmBaseValue);
    } else if (resolvedCpmMode === 'auto') {
      addAutoCandidate('CPM', computedCpmData?.value, computedCpmData?.canCompute);
    }

    const resolvedT8Mode = resolveMode(t8Selection);
    if (resolvedT8Mode === 'manual') {
      addManualCandidate('T8', manualT8Value, manualT8BaseValue);
    } else if (resolvedT8Mode === 'auto') {
      addAutoCandidate('T8', computedT8Data?.value, computedT8Data?.canCompute);
    }

    return candidates;
  }, [
    computedCpmData?.canCompute,
    computedCpmData?.value,
    computedT8Data?.canCompute,
    computedT8Data?.value,
    cpmSelection,
    manualCpmBaseValue,
    manualCpmValue,
    manualT8BaseValue,
    manualT8Value,
    t8Selection,
  ]);

  const fertilityStartConfig = useMemo(
    () => ({
      calculators: {
        cpm: cpmSelection !== 'none',
        t8: t8Selection !== 'none',
      },
    }),
    [cpmSelection, t8Selection]
  );
  const fertilityCalculatorCycles = useMemo(() => {
    const cycles = [];
    if (Array.isArray(archivedCycles) && archivedCycles.length > 0) {
      cycles.push(...archivedCycles);
    }
    if (currentCycle) {
      cycles.push(currentCycle);
    }
    return cycles;
  }, [archivedCycles, currentCycle]);

  const { processedData: fertilityChartData, todayIndex: fertilityTodayIndex } = useFertilityChart(
    currentCycle?.data ?? [],
    false,
    'portrait',
    undefined,
    currentCycle?.id,
    5,
    false,
    fertilityStartConfig,
    fertilityCalculatorCycles,
    externalCalculatorCandidates,
    false
  );

  if (isLoading && !currentCycle?.id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-4">
        <div className="w-full rounded-3xl  p-4 text-center shadow-sm">
          <p className="text-sm font-semibold text-fertiliapp-fuerte">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-4">
        <div className="w-full space-y-4 rounded-3xl border border-rose-100/70 bg-white/80 p-4 text-center shadow-sm">
          <p className="text-[15px] font-semibold text-slate-800">No hay ciclo activo.</p>
          <button
            onClick={() => setShowNewCycleDialog(true)}
            className="h-11 w-full rounded-full bg-fertiliapp-fuerte px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
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
            setInitialSectionKey(null);
            setShowForm(true);
            if (preferences?.fertilityStartConfig?.postpartum === true) {
              setShowPostpartumExitDialog(true);
            }
          }}
        />
        <PostpartumExitDialog
          isOpen={showPostpartumExitDialog}
          onClose={() => setShowPostpartumExitDialog(false)}
          onConfirm={handleConfirmPostpartumExit}
        />
      </div>
    );
  }

  if (!currentCycle?.startDate) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-4">
        <div className="w-full rounded-3xl border border-rose-100/70 bg-white/80 p-4 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Cargando...</p>
        </div>
      </div>
    );
  }

 

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setInitialSectionKey(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmNewCycle = async (selectedStartDate) => {
    await startNewCycle(selectedStartDate);
    setShowNewCycleDialog(false);
    setInitialSectionKey(null);
    setShowForm(true);
    if (preferences?.fertilityStartConfig?.postpartum === true) {
      setShowPostpartumExitDialog(true);
    }
  };

  return (
    <>
      <div className="mx-auto flex h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))] w-full flex-col space-y-4 px-4 pb-10 pt-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-1 flex-col gap-3"
        >
          <CycleOverviewCard
            cycleData={{ ...currentCycle, currentDay, records: currentCycle.data }}
            onEdit={handleEdit}
            onTogglePeak={handleTogglePeak}
            currentPeakIsoDate={currentPeakIsoDate}
            onEditStartDate={handleOpenStartDateEditor}
            handleOpenCpmDialog={handleOpenCpmDialog}
            handleOpenT8Dialog={handleOpenT8Dialog}
            cpmMetric={cpmMetric}
            t8Metric={t8Metric}
          />
          <Dialog
            open={isCpmDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseCpmDialog();
              }
            }}
          >
            <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-0 text-gray-800 shadow-xl">
              <DialogHeader className="space-y-2 px-4 pt-4 text-left">
                <DialogTitle>Editar CPM</DialogTitle>
                <DialogDescription>
                  <div className="text-xs">
                    Puedes usar el valor calculado automáticamente o fijar un valor manual.
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Estado actual</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        cpmStatusMode === 'manual'
                          ? 'bg-rose-100 text-rose-700'
                          : cpmStatusMode === 'auto'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {cpmStatusChipLabel}
                    </span>
                  </div>
                </div>

                <div
                  role="radio"
                  tabIndex={0}
                  onClick={() => handleSelectCpmMode('auto')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectCpmMode('auto'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    cpmSelectionDraft === 'auto'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-rose-100 bg-white/80 hover:border-fertiliapp-suave'
                  } ${!cpmInfo.canCompute ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">Cálculo automático</p>
                      <span className="text-[11px] font-semibold text-rose-600">
                        {cpmInfo.canCompute && cpmInfo.value !== null
                          ? `CPM automático: ${cpmAutomaticValueLabel} días`
                          : 'No disponible todavía'}
                      </span>
                      <p className="text-[10px] text-rose-600">Basado en tus ciclos completados.</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        cpmSelectionDraft === 'auto' ? 'border-emerald-400 bg-emerald-400' : 'border-fertiliapp-suave bg-white'
                      }`}
                    >
                      {cpmSelectionDraft === 'auto' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>

                    <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                      <span>Datos disponibles</span>
                      <button
                        type="button"
                        onClick={() => setShowCpmDetails((previous) => !previous)}
                        className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                        aria-expanded={showCpmDetails}
                      >
                      {cpmInfo.highlightLabel}
                      </button>
                    </div>

                    {cpmInfo.summary && (
                      <p className="mt-1 text-[11px] text-rose-500">{cpmInfo.summary}</p>
                    )}
                    {!cpmInfo.detailsAvailable && (
                      <p className="mt-1 text-[11px] text-rose-500">
                        Aún no hay ciclos finalizados con fecha de finalización.
                      </p>
                    )}
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

                              const cycleId = cycle.cycleId || cycle.id;
                              const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations);
                              const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false;

                              const cardClasses = `rounded-2xl border px-3 py-2 shadow-sm transition hover:border-rose-200 hover:bg-white ${
                                isIgnored ? 'border-rose-200 bg-rose-50/80 opacity-80' : 'border-rose-100 bg-white/50'
                              }`;

                              return (
                                <li key={key}>
                                  <div className="flex items-stretch gap-2">
                                    <div className={`${cardClasses} flex-1`}>
                                      <button
                                        type="button"
                                        onClick={() => handleNavigateToCycleDetails(cycle)}
                                        className="block w-full rounded-2xl px-1 py-0.5 text-left transition hover:bg-white/60 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-rose-700">
                                            {cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}
                                          </p>
                                          <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                        </div>
                                      </button>
                                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-500">
                                        <span>Duración: {durationText}</span>
                                        {isShortest && (
                                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-600">
                                            Ciclo más corto
                                          </span>
                                        )}
                                      </div>
                                      {isIgnored && (
                                        <p className="mt-1 text-[11px] text-rose-400">
                                          Ignorado para el cálculo automático.
                                        </p>
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      disabled={!cycleId || isPending}
                                      onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)}
                                      className="shrink-0 self-center h-8 w-8 p-0 bg-transparent border-transparent"
                                      title={
                                        isIgnored
                                          ? 'Incluir ciclo en el cálculo automático'
                                          : 'Ignorar ciclo para el cálculo automático'
                                      }
                                      aria-label={
                                        isIgnored
                                          ? 'Incluir ciclo en el cálculo automático'
                                          : 'Ignorar ciclo para el cálculo automático'
                                      }
                                      aria-pressed={isIgnored}
                                    >
                                      {isPending ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin text-rose-500" aria-hidden="true" />
                                          <span className="sr-only">Guardando…</span>
                                        </>
                                      ) : isIgnored ? (
                                        <Ban className="h-4 w-4 text-rose-500" aria-hidden="true" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4 text-green-800/70" aria-hidden="true" />
                                      )}
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-rose-500">Aún no hay ciclos finalizados con fecha de finalización.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={cpmSelectionDraft === 'manual'}
                  onClick={() => handleSelectCpmMode('manual')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectCpmMode('manual'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    cpmSelectionDraft === 'manual'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-rose-100 bg-white/80 hover:border-rose-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">Valor manual</p>
                    </div>                  
                      <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        cpmSelectionDraft === 'manual' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'
                      }`}
                    >
                      {cpmSelectionDraft === 'manual' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-cpm-base" className="text-xs text-gray-600">
                        Ciclo más corto
                      </Label>
                      <Input
                        id="manual-cpm-base"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="1"
                        value={manualCpmBaseInput}
                        onChange={handleManualCpmBaseInputChange}
                        placeholder="Introduce un entero"
                        aria-describedby={manualCpmEditedSide ? 'manual-cpm-helper' : undefined}
                      />
                      {manualCpmBaseError && <p className="text-xs text-red-500">{manualCpmBaseError}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-cpm-final" className="text-xs text-gray-600">
                        CPM obtenido
                      </Label>
                      <Input
                        id="manual-cpm-final"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="1"
                        value={manualCpmFinalInput}
                        onChange={handleManualCpmFinalInputChange}
                        placeholder="Introduce el valor"
                        aria-describedby={manualCpmEditedSide ? 'manual-cpm-helper' : undefined}
                      />
                      {manualCpmFinalError && <p className="text-xs text-red-500">{manualCpmFinalError}</p>}
                    </div>
                  </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                  {manualCpmEditedSide && (
                    <div className="mt-2 flex justify-center">
                      <span
                        id="manual-cpm-helper"
                        className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600"
                      >
                      {manualCpmEditedSide === 'base'
                          ? 'Usando Ciclo más corto como base'
                          : 'Usando CPM (final)'}
                      </span>
                    </div>
                  
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCpmDeleteDialog(true)}
                      disabled={!canDeleteManualCpm}
                      className="h-8 shrink-0 rounded-full border border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Borrar
                    </Button>
                  </div>



                  {isCpmSaveDisabled && cpmSelectionDraft === 'manual' && !isManualCpm && (
                    <p className="mt-2 text-[11px] text-rose-500">Introduce un valor válido antes de seleccionar.</p>
                  )}
                </div>
                <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={cpmSelectionDraft === 'none'}
                  onClick={() => handleSelectCpmMode('none')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectCpmMode('none'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-2 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    cpmSelectionDraft === 'none'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-dashed border-rose-200 bg-white/70 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">No usar ningún valor</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        cpmSelectionDraft === 'none' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'
                      }`}
                    >
                      {cpmSelectionDraft === 'none' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>
                </div>
              </div>
                <DialogFooter className="mt-0 flex flex-col gap-3 px-4 pb-4">
                  <div className="flex w-full items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCloseCpmDialog}
                      className="h-8 rounded-full px-4 text-xs"
                    >
                    Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveCpm}
                      disabled={isCpmSaveDisabled}
                      className="h-8 rounded-full px-4 text-xs"
                    >
                      Guardar
                    </Button>
                  </div>
                </DialogFooter>
              
            </DialogContent>
          </Dialog>
          <Dialog open={showCpmDeleteDialog} onOpenChange={setShowCpmDeleteDialog}>
            <DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100">
              <DialogHeader>
                <DialogTitle>¿Estás segura de que quieres borrar el valor manual de CPM?</DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCpmDeleteDialog(false)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleConfirmCpmDelete}
                  disabled={isDeletingManualCpm}
                  className="w-full sm:w-auto"
                >
                  {isDeletingManualCpm ? 'Borrando…' : 'Borrar'}
                </Button>
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
            <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col rounded-3xl border border-rose-100 bg-white/95 text-gray-800 shadow-xl overflow-hidden p-0">
                <DialogHeader className="space-y-2 px-4 pt-4 text-left">
                  <DialogTitle>Editar T-8</DialogTitle>
                  <DialogDescription>
                    <div className="text-xs">
                    Puedes usar el valor calculado automáticamente o fijar un valor manual.
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Estado actual</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        t8StatusMode === 'manual'
                          ? 'bg-rose-100 text-rose-700'
                          : t8StatusMode === 'auto'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t8StatusChipLabel}
                    </span>
                  </div>
                </div>

                <div
                  role="radio"
                  tabIndex={0}
                  onClick={() => handleSelectT8Mode('auto')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectT8Mode('auto'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    t8SelectionDraft === 'auto'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-rose-100 bg-white/80 hover:border-rose-200'
                  } ${!computedT8Data.canCompute ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">Cálculo automático</p>
                      <span className="text-[11px] font-semibold text-rose-600">
                        {computedT8Data.canCompute && computedT8Data.value !== null
                          ? `T-8 automático: Día ${t8AutomaticValueLabel}`
                          : 'No disponible todavía'}
                      </span>
                      <p className="text-[10px] text-rose-600">Basado en tus ciclos completados.</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        t8SelectionDraft === 'auto' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'
                      }`}
                    >
                      {t8SelectionDraft === 'auto' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>

                  <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                      <span>Datos disponibles</span>
                      <button
                        type="button"
                        onClick={() => setShowT8Details((previous) => !previous)}
                        className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                        aria-expanded={showT8Details}
                      >
                      {t8Info.highlightLabel}
                      </button>
                    </div>
                    {t8Info.summary && <p className="mt-1 text-[11px] text-rose-500">{t8Info.summary}</p>}
                    {computedT8Data.cycleCount === 0 && (
                      <p className="mt-1 text-[11px] text-rose-500">Aún no hay ciclos con ovulación confirmada por temperatura.</p>
                    )}
                    {showT8Details && computedT8Data.cycleCount > 0 && (
                      <div className="mt-2 space-y-2">
                        {computedT8Data.cyclesConsidered.length > 0 ? (
                          <ul className="space-y-1">
                            {computedT8Data.cyclesConsidered.map((cycle, index) => {
                              const key = cycle.cycleId || `${cycle.displayName}-${cycle.riseDay}-${index}`;
                              const riseDayText =
                                typeof cycle.riseDay === 'number' && Number.isFinite(cycle.riseDay)
                                  ? cycle.riseDay
                                  : '—';
                              const cycleId = cycle.cycleId || cycle.id;
                              const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations);
                              const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false;

                              const cardClasses = `rounded-2xl border px-3 py-2 shadow-sm transition hover:border-rose-200 hover:bg-white ${
                                isIgnored ? 'border-rose-200 bg-rose-50/80 opacity-80' : 'border-rose-100 bg-white/40'
                              }`;

                              return (
                                <li key={key}>
                                  <div className="flex items-stretch gap-2">
                                    <div className={`${cardClasses} flex-1`}>
                                      <button
                                        type="button"
                                        onClick={() => handleNavigateToCycleDetails(cycle)}
                                        className="block w-full rounded-2xl px-1 py-0.5 text-left transition hover:bg-white/60 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-rose-700">
                                            {cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}
                                          </p>
                                          <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                        </div>
                                      </button>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-rose-500">
                                        <span>Día de subida: {riseDayText}</span>
                                        {Number.isFinite(cycle.t8Day) && <span>T-8: Día {cycle.t8Day}</span>}
                                      </div>
                                      {isIgnored && (
                                        <p className="mt-1 text-[11px] text-rose-400">
                                          Ignorado para el cálculo automático.
                                        </p>
                                      )}
                                    </div>
                                  <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      disabled={!cycleId || isPending}
                                      onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)}
                                      className="shrink-0 self-center h-8 w-8 p-0 bg-transparent border-transparent"
                                      title={
                                        isIgnored
                                          ? 'Incluir ciclo en el cálculo automático'
                                          : 'Ignorar ciclo para el cálculo automático'
                                      }
                                      aria-label={
                                        isIgnored
                                          ? 'Incluir ciclo en el cálculo automático'
                                          : 'Ignorar ciclo para el cálculo automático'
                                      }
                                      aria-pressed={isIgnored}
                                    >
                                      {isPending ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin text-rose-500" aria-hidden="true" />
                                          <span className="sr-only">Guardando…</span>
                                        </>
                                      ) : isIgnored ? (
                                        <Ban className="h-4 w-4 text-rose-500" aria-hidden="true" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4 text-green-800/70" aria-hidden="true" />
                                      )}
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-rose-500">Aún no hay ciclos con ovulación confirmada por temperatura.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={t8SelectionDraft === 'manual'}
                  onClick={() => handleSelectT8Mode('manual')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectT8Mode('manual'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    t8SelectionDraft === 'manual'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-rose-100 bg-white/80 hover:border-rose-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">Valor manual</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        t8SelectionDraft === 'manual' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'
                      }`}
                    >
                      {t8SelectionDraft === 'manual' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-t8-base" className="text-xs text-gray-600">
                        Ciclo con subida (día)
                      </Label>
                      <Input
                        id="manual-t8-base"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="1"
                        value={manualT8BaseInput}
                        onChange={handleManualT8BaseInputChange}
                        placeholder="Día de subida"
                        aria-describedby={manualT8EditedSide ? 'manual-t8-helper' : undefined}
                      />
                      {manualT8BaseError && <p className="text-xs text-red-500">{manualT8BaseError}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-t8-final" className="text-xs text-gray-600">
                        T-8 manual (día)
                      </Label>
                      <Input
                        id="manual-t8-final"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="1"
                        value={manualT8FinalInput}
                        onChange={handleManualT8FinalInputChange}
                        placeholder="Día del T-8"
                        aria-describedby={manualT8EditedSide ? 'manual-t8-helper' : undefined}
                      />
                      {manualT8FinalError && <p className="text-xs text-red-500">{manualT8FinalError}</p>}
                    </div>
                  
                      </div>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                {manualT8EditedSide && (
                    <div className="mt-2 flex justify-center">
                      <span
                        id="manual-t8-helper"
                        className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600"
                      >
                        {manualT8EditedSide === 'base'
                          ? 'Usando día de subida como base'
                          : 'Usando T-8 manual'}
                      </span>
                    </div>
                  )}

                  </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowT8DeleteDialog(true)}
                      disabled={!canDeleteManualT8}
                      className="h-8 shrink-0 rounded-full border border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Borrar
                    </Button>
                    {isT8SaveDisabled && t8SelectionDraft === 'manual' && !isManualT8 && (
                    <p className="mt-2 text-[11px] text-rose-500">Introduce un valor válido antes de seleccionar.</p>
                  )}
                  </div>



                  <div
                  role="radio"
                  tabIndex={0}
                  aria-checked={t8SelectionDraft === 'none'}
                  onClick={() => handleSelectT8Mode('none')}
                  onKeyDown={(event) => handleCardKeyDown(event, () => handleSelectT8Mode('none'))}
                  className={`cursor-pointer rounded-2xl border px-3 py-2 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${
                    t8SelectionDraft === 'none'
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-dashed border-rose-200 bg-white/70 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-900">No usar ningún valor</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        t8SelectionDraft === 'none' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'
                      }`}
                    >
                      {t8SelectionDraft === 'none' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  
                </div>

                </div>
                
              <DialogFooter className="mt-0 flex flex-col gap-3 px-4 pb-4">
                  <div className="flex w-full items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCloseT8Dialog}
                      className="h-8 rounded-full px-4 text-xs"
                    >
                     Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveT8}
                      disabled={isT8SaveDisabled}
                      className="h-8 rounded-full px-4 text-xs"
                    >
                      Guardar
                    </Button>
                  </div>
                </DialogFooter>

            </DialogContent>
          </Dialog>
          
          <Dialog open={showT8DeleteDialog} onOpenChange={setShowT8DeleteDialog}>
            <DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100">
              <DialogHeader>
                <DialogTitle>¿Estás segura de que quieres borrar el valor manual de T-8?</DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowT8DeleteDialog(false)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleConfirmT8Delete}
                  disabled={isDeletingManualT8}
                  className="w-full sm:w-auto"
                >
                  {isDeletingManualT8 ? 'Borrando…' : 'Borrar'}
                </Button>
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
            initialSectionKey={initialSectionKey}
          />
        </DialogContent>
      </Dialog>

      <FloatingActionButton
        onAddRecord={() => {
          setEditingRecord(null);
          setInitialSectionKey(null);
          setShowForm(true);
        }}
        onAddCycle={() => setShowNewCycleDialog(true)}
      />

      <NewCycleDialog
        isOpen={showNewCycleDialog}
        onClose={() => setShowNewCycleDialog(false)}
        onConfirm={handleConfirmNewCycle}
        currentCycleStartDate={currentCycle.startDate}
      />
      <PostpartumExitDialog
        isOpen={showPostpartumExitDialog}
        onClose={() => setShowPostpartumExitDialog(false)}
        onConfirm={handleConfirmPostpartumExit}
      />
    </>
  );
};

export default ModernFertilityDashboard;
