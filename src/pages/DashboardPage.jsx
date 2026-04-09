import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Plus,
  FilePlus,
  CalendarPlus,
  Edit,
  X,
  ChevronLeft,
  ChevronRight,
  Baby,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';
import { useToast } from '@/components/ui/use-toast';
import NewCycleDialog from '@/components/NewCycleDialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCycleData } from '@/hooks/useCycleData';
import { addDays, differenceInDays, format, isAfter, isValid, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import DayDetail from '@/components/DayDetail';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useFertilityChart } from '@/hooks/useFertilityChart';
import { useFertilityCalculatorsEditor } from '@/hooks/useFertilityCalculatorsEditor';
import FertilityCalculatorsEditorDialogs from '@/components/FertilityCalculatorsEditorDialogs';
import { FERTILITY_SYMBOL_OPTIONS, getSymbolColorPalette } from '@/config/fertilitySymbols';
import { mergeFertilityStartConfig } from '@/lib/preferences';

const DATA_ENTRY_FORM_DRAFT_KEY = 'dashboard:data-entry-form-draft';

const normalizeTextValue = (value) => String(value ?? '').trim();

const normalizeNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
};

const getSelectedMeasurementForToast = (source) =>
  source?.measurements?.find((measurement) => measurement?.selected) ||
  source?.measurements?.[0] ||
  null;

const getComparableDashboardState = (source) => {
  if (!source) return null;

  const selectedMeasurement = getSelectedMeasurementForToast(source);
  const useCorrected = Boolean(
    selectedMeasurement?.use_corrected ?? source?.use_corrected
  );

  const temperature = normalizeNumericValue(
    useCorrected
      ? (
          selectedMeasurement?.temperature_corrected ??
          source?.temperature_corrected ??
          selectedMeasurement?.temperature ??
          source?.temperature_chart ??
          source?.temperature_raw ??
          source?.temperature
        )
      : (
          selectedMeasurement?.temperature ??
          source?.temperature_chart ??
          source?.temperature_raw ??
          source?.temperature ??
          selectedMeasurement?.temperature_corrected ??
          source?.temperature_corrected
        )
  );

  const time = normalizeTextValue(
    selectedMeasurement?.time ??
      source?.time ??
      source?.time_corrected ??
      ''
  );

  return {
    temperature,
    time,
    sensation: normalizeTextValue(source?.mucusSensation ?? source?.mucus_sensation),
    appearance: normalizeTextValue(source?.mucusAppearance ?? source?.mucus_appearance),
    observations: normalizeTextValue(source?.observations),
    symbol: source?.fertility_symbol ?? source?.fertilitySymbol ?? 'none',
    relations: Boolean(source?.had_relations ?? source?.hadRelations),
  };
};

const joinLabelsEs = (labels) => {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};

const getDashboardUpdateToastMessage = (previousRecord, nextData) => {
  const previous = getComparableDashboardState(previousRecord);
  const next = getComparableDashboardState(nextData);

  if (!next) return 'Registro actualizado';

  const changed = [];

  if (!previous) {
    if (next.temperature !== null || next.time) changed.push('la temperatura');
    if (next.sensation) changed.push('la sensación');
    if (next.appearance) changed.push('la apariencia');
    if (next.observations) changed.push('las observaciones');
    if (next.symbol && next.symbol !== 'none') changed.push('el símbolo');
    if (next.relations) changed.push('las relaciones sexuales');

    if (changed.length === 1) return `Se ha registrado ${changed[0]}`;
    if (changed.length === 2) return `Se han registrado ${joinLabelsEs(changed)}`;
    if (changed.length > 2) return 'Se han actualizado varios campos';
    return 'Registro guardado';
  }

  if (previous.temperature !== next.temperature || previous.time !== next.time) {
    changed.push('la temperatura');
  }
  if (previous.sensation !== next.sensation) changed.push('la sensación');
  if (previous.appearance !== next.appearance) changed.push('la apariencia');
  if (previous.observations !== next.observations) changed.push('las observaciones');
  if (previous.symbol !== next.symbol) changed.push('el símbolo');
  if (previous.relations !== next.relations) changed.push('las relaciones sexuales');

  if (changed.length === 0) return 'Registro actualizado';
  if (changed.length === 1) return `Se ha actualizado ${changed[0]}`;
  if (changed.length === 2) return `Se han actualizado ${joinLabelsEs(changed)}`;
  return 'Se han actualizado varios campos';
};


const CycleOverviewCard = ({
  cycleData,
  onEdit,
  onDeleteRecord = () => {},
  onToggleRelations = () => {},
  currentPeakIsoDate,
  onEditStartDate = () => {},
  handleOpenCpmDialog = () => {},
  handleOpenT8Dialog = () => {},
  cpmMetric = {},
  t8Metric = {},
}) => {
  const records = cycleData.records || [];
  const isPostpartumModeEnabled = Boolean(cycleData?.postpartumMode);
  const [activePoint, setActivePoint] = useState(null);
  const [recentlyChangedDays, setRecentlyChangedDays] = useState([]);
  const hasInitializedWheelRef = useRef(true);
const circleRef = useRef(null);
const wheelDragRef = useRef({
  pointerId: null,
  startOffset: 0,
  lastX: 0,
  lastY: 0,
  accumulatedDrag: 0,
  moved: false,
});
const ringDragActiveRef = useRef(false);
const suppressDotClickRef = useRef(false);
const recentSignaturesRef = useRef(new Map());
  const splashTimeoutRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const cycleStartDate = cycleData.startDate ? parseISO(cycleData.startDate) : null;
  const today = startOfDay(new Date());
  const peakStatuses = useMemo(() => computePeakStatuses(records), [records]);
  const resolvedActivePoint = useMemo(() => {
  if (!activePoint?.isoDate) return null;

  const latestRecord =
    (activePoint?.id
      ? records.find((record) => record?.id === activePoint.id)
      : null) ||
    records.find((record) => record?.isoDate === activePoint.isoDate);

  if (!latestRecord) {
    return activePoint;
  }

  const resolvedPeakStatus =
    peakStatuses[latestRecord.isoDate] ?? activePoint?.peakStatus ?? null;

  return {
    ...latestRecord,
    cycleDay: latestRecord.cycleDay ?? activePoint?.cycleDay ?? null,
    peakStatus: resolvedPeakStatus,
    peak_marker:
      latestRecord.peak_marker ?? (resolvedPeakStatus === 'P' ? 'peak' : null),
  };
}, [activePoint, records, peakStatuses]);
  useEffect(() => {
  if (!activePoint?.id || String(activePoint.id).startsWith('placeholder-')) return;

  const stillExists = records.some((record) => record?.id === activePoint.id);
  if (!stillExists) {
    setActivePoint(null);
  }
}, [activePoint, records]);

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
        const initialSize = merged.size;
        newDays.forEach((day) => merged.add(day));
        if (merged.size === initialSize) {
          return current;
        }
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
  const dragDistancePerStep = ((2 * Math.PI * radius) / totalDots) * 0.8;
const dragStartThreshold = dragDistancePerStep * 0.14;
  const getLocalSvgPoint = useCallback(
  (event) => {
    if (!circleRef.current) return null;

    const rect = circleRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const clientX = event.clientX;
    const clientY = event.clientY;

    if (clientX == null || clientY == null) return null;

    return {
      x: ((clientX - rect.left) / rect.width) * viewBoxSize,
      y: ((clientY - rect.top) / rect.height) * viewBoxSize,
      clientX,
      clientY,
      rect,
    };
  },
  [viewBoxSize]
);
const buildWheelDragState = useCallback(
  (event) => {
    const point = getLocalSvgPoint(event);
    if (!point) return null;

    return {
      pointerId: event.pointerId,
      startOffset: wheelOffset,
      lastX: point.x,
      lastY: point.y,
      accumulatedDrag: 0,
      moved: false,
    };
  },
  [getLocalSvgPoint, wheelOffset]
);


const resetWheelDrag = useCallback(() => {
  wheelDragRef.current = {
    pointerId: null,
    startOffset: 0,
    lastX: 0,
    lastY: 0,
    accumulatedDrag: 0,
    moved: false,
  };
}, []);
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

  const handleDotClick = useCallback((dot, event) => {
  event.stopPropagation();

  if (!circleRef.current) {
    setActivePoint(null);
    return;
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

  setActivePoint(targetRecord);
}, [currentPeakIsoDate, getLocalSvgPoint]);

const handleDotPointerDown = useCallback(
  (event) => {
    suppressDotClickRef.current = false;

    if (!hasOverflow) return;
    if (event.button !== undefined && event.button !== 0) return;

    const nextDragState = buildWheelDragState(event);
    if (!nextDragState) return;

    event.stopPropagation();

    wheelDragRef.current = nextDragState;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  },
  [buildWheelDragState, hasOverflow]
);

const handleDotPointerMove = useCallback(
  (event) => {
    if (!hasOverflow) return;

    const drag = wheelDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const point = getLocalSvgPoint(event);
    if (!point) return;

    event.preventDefault();

    const deltaX = point.x - drag.lastX;
    const deltaY = point.y - drag.lastY;
    drag.lastX = point.x;
    drag.lastY = point.y;

    const currentAngle = Math.atan2(point.y - center, point.x - center);
    const tangentX = -Math.sin(currentAngle);
    const tangentY = Math.cos(currentAngle);

    const projectedDelta = deltaX * tangentX + deltaY * tangentY;
    drag.accumulatedDrag += projectedDelta;

    if (!drag.moved && Math.abs(drag.accumulatedDrag) >= dragStartThreshold) {
      drag.moved = true;
      suppressDotClickRef.current = true;
      setActivePoint(null);
    }

    const steppedDelta =
      drag.accumulatedDrag > 0
        ? Math.floor(drag.accumulatedDrag / dragDistancePerStep)
        : Math.ceil(drag.accumulatedDrag / dragDistancePerStep);

    const nextOffset = clampOffset(drag.startOffset - steppedDelta);

    setWheelOffset((previous) => (previous === nextOffset ? previous : nextOffset));
  },
  [center, clampOffset, dragDistancePerStep, dragStartThreshold, getLocalSvgPoint, hasOverflow]
);

const handleDotPointerUp = useCallback(
  (event) => {
    const drag = wheelDragRef.current;

    if (hasOverflow && drag.pointerId !== event.pointerId) return;

    event.stopPropagation();

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {}

    resetWheelDrag();
  },
  [hasOverflow, resetWheelDrag]
);
const handleDotTap = useCallback(
  (dot, event) => {
    if (suppressDotClickRef.current) {
      suppressDotClickRef.current = false;
      return;
    }

    handleDotClick(dot, event);
  },
  [handleDotClick]
);

const handleDotPointerCancel = useCallback(
  (event) => {
    const drag = wheelDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {}

    resetWheelDrag();
  },
  [resetWheelDrag]
);
const handleRingPointerDown = useCallback(
  (event) => {
    if (!hasOverflow) return;
    if (event.button !== undefined && event.button !== 0) return;

    const nextDragState = buildWheelDragState(event);
    if (!nextDragState) return;

    ringDragActiveRef.current = true;
    setActivePoint(null);
    wheelDragRef.current = nextDragState;

    event.currentTarget.setPointerCapture?.(event.pointerId);
  },
  [buildWheelDragState, hasOverflow]
);

const handleRingPointerMove = useCallback(
  (event) => {
    if (!hasOverflow) return;
    if (!ringDragActiveRef.current) return;

    const drag = wheelDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const point = getLocalSvgPoint(event);
    if (!point) return;

    event.preventDefault();

    const deltaX = point.x - drag.lastX;
    const deltaY = point.y - drag.lastY;
    drag.lastX = point.x;
    drag.lastY = point.y;

    const currentAngle = Math.atan2(point.y - center, point.x - center);
    const tangentX = -Math.sin(currentAngle);
    const tangentY = Math.cos(currentAngle);

    const projectedDelta = deltaX * tangentX + deltaY * tangentY;
    drag.accumulatedDrag += projectedDelta;

    if (!drag.moved && Math.abs(drag.accumulatedDrag) >= dragStartThreshold) {
      drag.moved = true;
    }

    const steppedDelta =
      drag.accumulatedDrag > 0
        ? Math.floor(drag.accumulatedDrag / dragDistancePerStep)
        : Math.ceil(drag.accumulatedDrag / dragDistancePerStep);

    const nextOffset = clampOffset(drag.startOffset - steppedDelta);

    setWheelOffset((previous) => (previous === nextOffset ? previous : nextOffset));
  },
  [center, clampOffset, dragDistancePerStep, dragStartThreshold, getLocalSvgPoint, hasOverflow]
);

const handleRingPointerUp = useCallback(
  (event) => {
    if (!ringDragActiveRef.current) return;

    const drag = wheelDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {}

    ringDragActiveRef.current = false;
    resetWheelDrag();
  },
  [resetWheelDrag]
);

const handleRingPointerCancel = useCallback(
  (event) => {
    if (!ringDragActiveRef.current) return;

    const drag = wheelDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {}

    ringDragActiveRef.current = false;
    resetWheelDrag();
  },
  [resetWheelDrag]
);
  const renderCompactCalcItem = ({ label, value, onClick, ariaLabel, modeLabel = null }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-2xl border border-rose-100/80 bg-white/80 px-3 py-2 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
      aria-label={ariaLabel}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">{label}</span>
        {modeLabel ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
            {modeLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{value ?? '—'}</p>
    </button>
  );

  const getSymbolInfo = useCallback(
    (symbolValue) =>
      FERTILITY_SYMBOL_OPTIONS.find((symbol) => symbol.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0],
    []
  );

  const formatTemperatureDisplay = useCallback((value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }).format(n);
  }, []);

  const activePointDetails = useMemo(() => {
  if (!resolvedActivePoint) return null;

  const point = resolvedActivePoint;

    const selectedMeasurement =
      point.measurements?.find((measurement) => measurement?.selected) ||
      ((point.temperature_chart ?? point.temperature_raw) != null
        ? {
            temperature: point.temperature_chart ?? point.temperature_raw,
            temperature_corrected: point.temperature_corrected ?? null,
            time: point.timestamp ? format(parseISO(point.timestamp), 'HH:mm') : null,
            use_corrected: point.use_corrected ?? false,
          }
        : null);

    const usesCorrected = selectedMeasurement?.use_corrected ?? point.use_corrected ?? false;
    const correctedTemp = selectedMeasurement?.temperature_corrected ?? point.temperature_corrected ?? null;
    const rawTemp =
      selectedMeasurement?.temperature ??
      point.temperature_chart ??
      point.temperature_raw ??
      point.displayTemperature ??
      null;
    const resolvedTemp =
      usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== ''
        ? correctedTemp
        : rawTemp ?? correctedTemp;

    const displayTemp = formatTemperatureDisplay(resolvedTemp);
    const hasTemperature = displayTemp !== null;
    const showCorrectedIndicator =
      usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== '';

    let timeValue = null;
    if (selectedMeasurement?.time) {
      timeValue = selectedMeasurement.time;
    } else if (point.timestamp && isValid(parseISO(point.timestamp))) {
      timeValue = format(parseISO(point.timestamp), 'HH:mm');
    }

    const mucusSensation = point.mucusSensation ?? point.mucus_sensation ?? '';
    const mucusAppearance = point.mucusAppearance ?? point.mucus_appearance ?? '';
    const hasMucusSensation = Boolean(mucusSensation);
    const hasMucusAppearance = Boolean(mucusAppearance);
    const observationsText = point.observations ?? '';
    const hasObservations = Boolean(observationsText);
    const hasRelations = Boolean(point.had_relations ?? point.hadRelations ?? false);

   return {
  record: point,
  symbolInfo: getSymbolInfo(point.fertility_symbol),
  hasTemperature,
  displayTemp,
  showCorrectedIndicator,
  timeValue,
  hasMucus: hasMucusSensation || hasMucusAppearance,
  hasMucusSensation,
  hasMucusAppearance,
  mucusSensation,
  mucusAppearance,
  hasObservations,
  observationsText,
  hasRelations,
};
}, [resolvedActivePoint, formatTemperatureDisplay, getSymbolInfo]);

  const handleAddFromDetailPanel = useCallback(
    (isoDate, sectionKey = null) => {
      if (!isoDate) return;
      const cycleStartDateValue = cycleData?.startDate ? parseISO(cycleData.startDate) : null;
      const computedCycleDay =
        cycleStartDateValue && isValid(cycleStartDateValue)
          ? differenceInDays(parseISO(isoDate), cycleStartDateValue) + 1
          : null;

      onEdit(
        {
          id: `placeholder-${isoDate}`,
          isoDate,
          cycleDay: computedCycleDay,
          fertility_symbol: null,
          mucus_sensation: '',
          mucusSensation: '',
          mucus_appearance: '',
          mucusAppearance: '',
          observations: '',
          temperature_chart: null,
          displayTemperature: null,
          ignored: false,
        },
        sectionKey
      );
    },
    [cycleData?.startDate, onEdit]
  );
    const handleToggleRelations = useCallback(
  (isoDate) => {
    if (!isoDate) return;

    setActivePoint((prev) => {
      if (!prev || prev.isoDate !== isoDate) return prev;

      const nextValue = !(prev.had_relations ?? prev.hadRelations ?? false);

      return {
        ...prev,
        had_relations: nextValue,
        hadRelations: nextValue,
      };
    });

    onToggleRelations(isoDate);
  },
  [onToggleRelations]
);

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
          className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-sm font-semibold text-subtitulo shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 focus:ring-offset-transparent hover:bg-white"
          title="Editar fecha de inicio del ciclo"
        >
          <Edit className="w-4 h-4" />
          {`Ciclo actual`}
          </button>
          {cycleData?.postpartumMode && (
            <Badge
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-0 text-rose-600 hover:bg-rose-50"
              aria-label="Modo postparto activado"
              title="Modo postparto activado"
            >
              <Baby className="h-4 w-4" aria-hidden="true" />
            </Badge>
          )}
        

      </motion.div>

      {/* Contenedor principal con flex-grow para usar todo el espacio disponible */}
        <motion.div
        className="px-4 flex-grow flex flex-col justify-start mt-2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        {/* Tarjeta SOLO para el círculo + navegación */}
        
        <div className="relative overflow-hidden rounded-[75px]   p-4  mb-2">
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
  className="relative mx-auto flex items-center justify-center mb-4 drop-shadow-[0_15px_35px_rgba(221,86,101,0.22)] aspect-square w-full"
  style={{ maxWidth: viewBoxSize, touchAction: 'pan-y' }}
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
  onWheel={handleWheelScroll}
>
            <svg
              className="block w-full h-full wheel-no-tap"
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              preserveAspectRatio="xMidYMid meet"
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
              <circle
  cx={center}
  cy={center}
  r={radius - 28}
  fill="url(#ringGlow)"
  stroke="rgba(255,225,228,0.8)"
  strokeWidth={1.2}
  filter="url(#circleDepthShadow)"
  pointerEvents="none"
/>
              <circle
  cx={center}
  cy={center}
  r={radius}
  fill="transparent"
  stroke="transparent"
  strokeWidth={115}
  pointerEvents={hasOverflow ? 'stroke' : 'none'}
  onPointerDown={handleRingPointerDown}
  onPointerMove={handleRingPointerMove}
  onPointerUp={handleRingPointerUp}
  onPointerCancel={handleRingPointerCancel}
  style={{
    touchAction: hasOverflow ? 'none' : 'auto',
    cursor: hasOverflow ? 'grab' : 'default',
  }}
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
    pointerEvents="none"
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
  <circle
  cx={dot.x}
  cy={dot.y}
  r={dot.isToday ? 18 : 16}
  fill="transparent"
  pointerEvents="all"
  onPointerDown={handleDotPointerDown}
  onPointerMove={handleDotPointerMove}
  onPointerUp={handleDotPointerUp}
  onPointerCancel={handleDotPointerCancel}
  onClick={(e) => handleDotTap(dot, e)}
  style={{
    cursor: hasOverflow ? 'grab' : 'pointer',
    touchAction: hasOverflow ? 'none' : 'auto',
  }}
/>
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
  initial={false}
  whileTap={
    prefersReducedMotion || !hasInitializedWheelRef.current
      ? undefined
      : {
          y: 2,
          scale: 0.75,
          opacity: 0.95,
          transition: { duration: 0.08, ease: 'easeOut' },
        }
  }
  style={{ pointerEvents: 'none' }}
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
    <g key={`peak-${index}`} pointerEvents="none">
      <line
        x1={labelX - 4}
        y1={labelY - 4}
        x2={labelX + 4}
        y2={labelY + 4}
        stroke="rgba(255,255,255,0.96)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1={labelX + 4}
        y1={labelY - 4}
        x2={labelX - 4}
        y2={labelY + 4}
        stroke="rgba(255,255,255,0.96)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1={labelX - 4}
        y1={labelY - 4}
        x2={labelX + 4}
        y2={labelY + 4}
        stroke="#db2777"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1={labelX + 4}
        y1={labelY - 4}
        x2={labelX - 4}
        y2={labelY + 4}
        stroke="#db2777"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
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
            
            {/* Contenido central */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <motion.div
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1, delay: 0.1, ease: 'easeOut' }}
              >
                <div className="flex items-center justify-center ">
                  <p className="text-6xl font-semibold text-fertiliapp-fuerte leading-none tabular-nums">
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

    <motion.div
          className="mx-2 mb-2 rounded-2xl border border-fertiliapp-suave bg-white/70 p-2 shadow-[0_10px_30px_rgba(148,163,184,0.15)] backdrop-blur-md"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.06 }}
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Cálculo fértil</span>
          </div>
          <div className="flex gap-2">
            {renderCompactCalcItem({
              label: 'CPM',
              value: cpmMetric?.finalFormatted ?? '—',
              onClick: handleOpenCpmDialog,
              ariaLabel: 'Editar CPM',
              modeLabel: cpmMetric?.modeLabel ?? 'Auto',
            })}
            {renderCompactCalcItem({
              label: 'T-8',
              value: t8Metric?.finalFormatted ?? '—',
              onClick: handleOpenT8Dialog,
              ariaLabel: 'Editar T-8',
              modeLabel: t8Metric?.modeLabel ?? 'Auto',
            })}
          </div>
        </motion.div>

          <AnimatePresence initial={false}>
  {resolvedActivePoint && activePointDetails && (
    <motion.div
      className="fixed inset-x-0 z-40 px-4 pointer-events-none"
      style={{ bottom: 'calc(var(--bottom-nav-safe) + 10px)' }}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div
        className="mx-auto w-full max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-end px-1">
          <button
            type="button"
            onClick={() => setActivePoint(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full  text-slate-500 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
            aria-label="Cerrar detalle del día"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[42dvh] overflow-y-auto rounded-[30px] shadow-[0_-8px_30px_rgba(221,86,101,0.12)]">
          <div>
  <DayDetail
    isoDate={resolvedActivePoint.isoDate}
    cycleDay={resolvedActivePoint.cycleDay ?? null}
    details={activePointDetails}
    peakStatus={peakStatuses[resolvedActivePoint.isoDate] || resolvedActivePoint.peakStatus || null}
    isPeakDay={Boolean(
      resolvedActivePoint.peak_marker === 'peak' ||
      peakStatuses[resolvedActivePoint.isoDate] === 'P'
    )}
    onEdit={onEdit}
    onAdd={handleAddFromDetailPanel}
    onDelete={onDeleteRecord}
    onToggleRelations={handleToggleRelations}
  />
</div>
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
      </motion.div>
    </div>
  );
};

const FloatingActionButton = ({ onAddRecord, onAddCycle }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDownOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleAddRecord = () => {
    setOpen(false);
    onAddRecord();
  };

  const handleAddCycle = () => {
    setOpen(false);
    onAddCycle();
  };

  return (
    <div ref={containerRef} className="fixed right-4 top-12 md:top-6 flex flex-col-reverse items-end space-y-2 z-50">
      {open && (
  <div className="flex flex-col space-y-2 mt-1">
    <motion.button
      onClick={handleAddRecord}
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
      onClick={handleAddCycle}
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
    deleteRecord,
    startNewCycle,
    isLoading,
    updateCycleDates,
    checkCycleOverlap,
    previewUpdateCycleDates,
    previewStartNewCycle,
    refreshData,
    setCycleIgnoreForAutoCalculations,
    undoCurrentCycle,
    previewUndoCurrentCycle,
  } = useCycleData();
  const { toast } = useToast();
  const { preferences } = useAuth();
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => currentCycle?.startDate || '');
  const [dateError, setDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [overlapImpactPreview, setOverlapImpactPreview] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [showUndoCycleDialog, setShowUndoCycleDialog] = useState(false);
  const [showUndoImpactDialog, setShowUndoImpactDialog] = useState(false);
  const [undoImpactPreview, setUndoImpactPreview] = useState(null);
  const [isUndoingCycle, setIsUndoingCycle] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const calculatorEditor = useFertilityCalculatorsEditor({
    currentCycle,
    archivedCycles,
    setCycleIgnoreForAutoCalculations,
    toast,
  });

  const {
    cpmMetric,
    t8Metric,
    cpmSelection,
    t8Selection,
    computedCpmData,
    computedT8Data,
    manualCpmValue,
    manualCpmBaseValue,
    manualT8Value,
    manualT8BaseValue,
    handleOpenCpmDialog,
    handleOpenT8Dialog,
  } = calculatorEditor;

  const undoCandidate = useMemo(() => {
    if (!currentCycle?.id || currentCycle?.endDate) return null;
    if (!currentCycle?.startDate) return null;

    const parsedStart = parseISO(currentCycle.startDate);
    if (!isValid(parsedStart)) return null;

    const dayBefore = format(addDays(parsedStart, -1), 'yyyy-MM-dd');
    const candidates = archivedCycles.filter((cycle) => cycle?.endDate === dayBefore);
    if (!candidates.length) return null;

    return candidates.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0];
  }, [archivedCycles, currentCycle]);

  const undoRangeText = useMemo(() => {
    if (!undoCandidate?.startDate || !undoCandidate?.endDate) return '';

    const start = parseISO(undoCandidate.startDate);
    const end = parseISO(undoCandidate.endDate);
    if (!isValid(start) || !isValid(end)) return '';

    const formatRangeDate = (date) =>
      format(date, 'dd MMM yy', { locale: es }).replace('.', '');

    return `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
  }, [undoCandidate]);

  const undoCycleDescription = useMemo(() => {
    const rangeSuffix = undoRangeText ? ` (${undoRangeText})` : '';
    return `¿Quieres unir el ciclo actual al ciclo anterior${rangeSuffix}? Esta acción no se puede deshacer.`;
  }, [undoRangeText]);

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
    setOverlapImpactPreview(null);
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

  const handleConfirmUndoCycle = useCallback(async () => {
    if (!currentCycle?.id) return;
    try {
      const preview = await previewUndoCurrentCycle(currentCycle.id);
      if (preview) {
        setUndoImpactPreview(preview);
        setShowUndoImpactDialog(true);
        return;
      }
    } catch (error) {
      console.error('Failed to preview undo cycle', error);
      return;
    }

    setIsUndoingCycle(true);
    try {
      await undoCurrentCycle(currentCycle.id);
      setShowUndoCycleDialog(false);
      handleCloseStartDateEditor();
    } catch (error) {
      console.error('Failed to undo cycle', error);
    } finally {
      setIsUndoingCycle(false);
    }
    }, [currentCycle?.id, handleCloseStartDateEditor, undoCurrentCycle, previewUndoCurrentCycle]);

  const handleExecuteUndoCycle = useCallback(async () => {
    if (!currentCycle?.id) return;
    setIsUndoingCycle(true);
    try {
      await undoCurrentCycle(currentCycle.id);
      setShowUndoImpactDialog(false);
      setShowUndoCycleDialog(false);
      handleCloseStartDateEditor();
    } catch (error) {
      console.error('Failed to undo cycle', error);
    } finally {
      setIsUndoingCycle(false);
    }
  }, [currentCycle?.id, handleCloseStartDateEditor, undoCurrentCycle]);

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
      const preview = previewUpdateCycleDates
        ? await previewUpdateCycleDates(currentCycle.id, draftStartDate)
        : null;

      if (preview) {
        setPendingStartDate(draftStartDate);
        setOverlapCycle(null);
        setOverlapImpactPreview(preview);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(currentCycle.id, draftStartDate);
      await refreshData({ silent: true });
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
    previewUpdateCycleDates,
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
      await updateCycleDates(currentCycle.id, pendingStartDate);
      await refreshData({ silent: true });
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
    updateCycleDates,
    refreshData,
    toast,
    handleCloseStartDateEditor,
    resetStartDateFlow,
  ]);

  const [showForm, setShowForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);
  const [newCyclePrefillDate, setNewCyclePrefillDate] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [initialSectionKey, setInitialSectionKey] = useState(null);
  const [formDraftToRestore, setFormDraftToRestore] = useState(null);
  const isPlaceholderRecord = Boolean(
    editingRecord && String(editingRecord.id || '').startsWith('placeholder-')
  );
  const currentPeakIsoDate = useMemo(() => {
    const peakRecord = currentCycle?.data?.find((record) => record?.peak_marker === 'peak');
    return peakRecord?.isoDate || null;
  }, [currentCycle?.data]);

  const [isNewCycleFlowFromForm, setIsNewCycleFlowFromForm] = useState(false);

  const clearDataEntryDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(DATA_ENTRY_FORM_DRAFT_KEY);
  }, []);

  const saveDataEntryDraft = useCallback((draft) => {
    if (typeof window === 'undefined' || !draft) return;
    window.localStorage.setItem(DATA_ENTRY_FORM_DRAFT_KEY, JSON.stringify(draft));
  }, []);

  const loadDataEntryDraft = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const stored = window.localStorage.getItem(DATA_ENTRY_FORM_DRAFT_KEY);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }, []);
  const handleCloseForm = useCallback(() => {
    clearDataEntryDraft();
    setShowForm(false);
    setEditingRecord(null);
    setInitialSectionKey(null);
  setIsNewCycleFlowFromForm(false);
    setFormDraftToRestore(null);
  }, [clearDataEntryDraft]);

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleEdit = useCallback((record, sectionKey = null) => {
    setEditingRecord(record);
    setInitialSectionKey(sectionKey ?? null);
    setShowForm(true);
  }, []);

  const buildDashboardRecordPayload = useCallback(
  (isoDate, overrides = {}) => {
    const existingRecord =
      currentCycle?.data?.find((record) => record.isoDate === isoDate) || null;

    const baseTime =
      existingRecord?.timestamp && isValid(parseISO(existingRecord.timestamp))
        ? format(parseISO(existingRecord.timestamp), 'HH:mm')
        : format(new Date(), 'HH:mm');

    const fallbackTemperatureRaw =
      existingRecord?.temperature_raw ?? existingRecord?.temperature ?? '';

    const fallbackTemperatureCorrected =
      existingRecord?.temperature_corrected ?? '';

    const fallbackUseCorrected = Boolean(existingRecord?.use_corrected);

    const measurements = existingRecord?.measurements?.length
      ? existingRecord.measurements.map((measurement, idx) => {
          const measurementTime =
            measurement?.time ||
            (measurement?.timestamp && isValid(parseISO(measurement.timestamp))
              ? format(parseISO(measurement.timestamp), 'HH:mm')
              : baseTime);

          return {
            temperature:
              measurement?.temperature ??
              measurement?.temperature_raw ??
              fallbackTemperatureRaw,
            temperature_corrected:
              measurement?.temperature_corrected ?? fallbackTemperatureCorrected,
            time: measurementTime,
            time_corrected: measurement?.time_corrected || measurementTime,
            use_corrected:
              measurement?.use_corrected !== undefined
                ? Boolean(measurement?.use_corrected)
                : fallbackUseCorrected,
            selected: Boolean(measurement?.selected ?? idx === 0),
          };
        })
      : [
          {
            temperature: fallbackTemperatureRaw,
            temperature_corrected: fallbackTemperatureCorrected,
            time: baseTime,
            time_corrected: baseTime,
            use_corrected: fallbackUseCorrected,
            selected: true,
          },
        ];

    return {
      isoDate,
      measurements,
      mucusSensation:
        existingRecord?.mucusSensation ?? existingRecord?.mucus_sensation ?? '',
      mucusAppearance:
        existingRecord?.mucusAppearance ?? existingRecord?.mucus_appearance ?? '',
      fertility_symbol:
        existingRecord?.fertility_symbol ?? existingRecord?.fertilitySymbol ?? 'none',
      observations: existingRecord?.observations ?? '',
      peak_marker: existingRecord?.peak_marker ?? null,
      ignored: existingRecord?.ignored ?? false,
      had_relations:
        existingRecord?.had_relations ?? existingRecord?.hadRelations ?? false,
      hadRelations:
        existingRecord?.had_relations ?? existingRecord?.hadRelations ?? false,
      ...overrides,
    };
  },
  [currentCycle?.data]
);
const handleToggleRelationsFromDashboard = useCallback(
  async (isoDate) => {
    if (!isoDate) return;

    const existingRecord =
      currentCycle?.data?.find((record) => record.isoDate === isoDate) || null;

    const hasRelations = Boolean(
      existingRecord?.had_relations ?? existingRecord?.hadRelations ?? false
    );

    const nextHasRelations = !hasRelations;

    const payload = buildDashboardRecordPayload(isoDate, {
      had_relations: nextHasRelations,
      hadRelations: nextHasRelations,
    });

    try {
      await addOrUpdateDataPoint(payload, existingRecord);

      toast({
        title: nextHasRelations
          ? 'Se han marcado las relaciones sexuales'
          : 'Se han desmarcado las relaciones sexuales',
        duration: 1400,
      });
    } catch (error) {
      console.error('Error updating relations from dashboard:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar RS.',
        variant: 'destructive',
      });
    }
  },
  [addOrUpdateDataPoint, buildDashboardRecordPayload, currentCycle?.data, toast]
);

  const handleRequestDeleteRecord = useCallback(
  (recordId) => {
    const targetRecord = currentCycle?.data?.find((record) => record?.id === recordId);
    if (!targetRecord) return;
    setRecordToDelete(targetRecord);
  },
  [currentCycle?.data]
);
const handleConfirmDeleteRecord = useCallback(async () => {
  if (!recordToDelete?.id || !currentCycle?.id) return;

  setIsDeletingRecord(true);

  try {
    await deleteRecord(recordToDelete.id, currentCycle.id);
    setRecordToDelete(null);
    await refreshData({ silent: true });
  } catch (error) {
    console.error('Error deleting record from dashboard:', error);
    toast({
      title: 'Error',
      description: 'No se pudo eliminar el registro.',
      variant: 'destructive',
    });
  } finally {
    setIsDeletingRecord(false);
  }
}, [recordToDelete?.id, currentCycle?.id, deleteRecord, refreshData, toast]);

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
  setIsProcessing(true);

  const toastMessage = getDashboardUpdateToastMessage(editingRecord, data);

  try {
    await addOrUpdateDataPoint(data, editingRecord);

    toast({
      title: toastMessage,
      duration: 1400,
    });

    clearDataEntryDraft();

    if (!keepFormOpen) {
      setShowForm(false);
      setEditingRecord(null);
      setInitialSectionKey(null);
      setIsNewCycleFlowFromForm(false);
      setFormDraftToRestore(null);
    }
  } finally {
    setIsProcessing(false);
  }
};

  const handleCloseNewCycleDialog = useCallback(() => {
    setShowNewCycleDialog(false);
    setNewCyclePrefillDate(null);
    if (isNewCycleFlowFromForm) {
      setShowForm(true);
      setFormDraftToRestore(loadDataEntryDraft());
    }
  }, [isNewCycleFlowFromForm, loadDataEntryDraft]);

  const handleConfirmNewCycle = async (selectedStartDate) => {
    await startNewCycle(selectedStartDate);
    setShowNewCycleDialog(false);
    setNewCyclePrefillDate(null);
    if (isNewCycleFlowFromForm) {
      setShowForm(true);
      setFormDraftToRestore(loadDataEntryDraft());
    } else {
      setInitialSectionKey(null);
      setShowForm(true);
    }
  };

  const handleOpenNewCycleDialog = useCallback((initialIsoDate = null, draftPayload = null) => {
    if (draftPayload) {
      saveDataEntryDraft(draftPayload);
      setFormDraftToRestore(draftPayload);
      setIsNewCycleFlowFromForm(true);
    } else {
      setIsNewCycleFlowFromForm(false);
    }
    setNewCyclePrefillDate(initialIsoDate || null);
    setShowNewCycleDialog(true);
  }, [saveDataEntryDraft]);

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

  const fertilityStartConfig = useMemo(() => {
    const merged = mergeFertilityStartConfig({
      incoming: preferences?.fertilityStartConfig,
    });

    return {
      ...merged,
      calculators: {
        ...merged.calculators,
        cpm: Boolean(merged.calculators?.cpm) && cpmSelection !== 'none',
        t8: Boolean(merged.calculators?.t8) && t8Selection !== 'none',
      },
    };
  }, [preferences?.fertilityStartConfig, cpmSelection, t8Selection]);

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
            onClick={() => handleOpenNewCycleDialog()}
            className="h-11 w-full rounded-full bg-fertiliapp-fuerte px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Iniciar ciclo
          </button>
        </div>
        <NewCycleDialog
          isOpen={showNewCycleDialog}
          onClose={handleCloseNewCycleDialog}
          onPreview={(selectedStartDate) => previewStartNewCycle?.(selectedStartDate, currentCycle?.id)}
          onConfirm={handleConfirmNewCycle}
          currentCycleRecords={currentCycle?.data ?? []}
          initialStartDate={newCyclePrefillDate}
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
  onDeleteRecord={handleRequestDeleteRecord}
  onToggleRelations={handleToggleRelationsFromDashboard}
  currentPeakIsoDate={currentPeakIsoDate}
  onEditStartDate={handleOpenStartDateEditor}
  handleOpenCpmDialog={handleOpenCpmDialog}
  handleOpenT8Dialog={handleOpenT8Dialog}
  cpmMetric={cpmMetric}
  t8Metric={t8Metric}
/>
          <FertilityCalculatorsEditorDialogs
            editor={calculatorEditor}
            onNavigateToCycleDetails={(cycle) => {
              const cycleId = cycle?.cycleId || cycle?.id;
              if (!cycleId) return;
              if (currentCycle?.id && cycleId === currentCycle.id) {
                navigate('/');
                return;
              }
              navigate(`/cycle/${cycleId}`);
            }}
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
              className="bg-transparent border-none p-0 text-gray-800 w-[96vw] sm:w-auto max-w-2xl max-h-[92dvh] overflow-hidden"
            >
              <CycleDatesEditor
                cycle={currentCycle}
                startDate={draftStartDate}
                endDate={currentCycle.endDate}
                otherCycles={[...(archivedCycles ?? []), currentCycle].filter(Boolean)}
                onStartDateChange={(value) => setDraftStartDate(value)}
                onSave={handleSaveStartDate}
                onCancel={handleCloseStartDateEditor}
                isProcessing={isUpdatingStartDate || isLoading || isUndoingCycle}
                dateError={dateError}
                includeEndDate={false}
                showOverlapDialog={showOverlapDialog}
                overlapCycle={overlapCycle}
                overlapImpactPreview={overlapImpactPreview}
                onConfirmOverlap={handleConfirmOverlapStart}
                onCancelOverlap={handleCancelOverlapStart}
                onClearError={() => setDateError('')}
                saveLabel="Guardar cambios"
                title="Editar fecha de inicio"
                description="Selecciona una nueva fecha de inicio para el ciclo actual. Los registros se reorganizarán automáticamente."
                onUndoCycle={undoCandidate ? () => setShowUndoCycleDialog(true) : undefined}
                isUndoingCycle={isUndoingCycle}
                className="w-full"
              />
            </DialogContent>
          </Dialog>
        </motion.div>
      </div>

<DeletionDialog
        isOpen={showUndoCycleDialog}
        onClose={() => setShowUndoCycleDialog(false)}
        onConfirm={handleConfirmUndoCycle}
        title="Deshacer ciclo"
        confirmLabel="Deshacer ciclo"
        cancelLabel="Cancelar"
        description={undoCycleDescription}
        isProcessing={isUndoingCycle}
      />

      <OverlapWarningDialog
        isOpen={showUndoImpactDialog}
        onCancel={() => {
          setShowUndoImpactDialog(false);
          setUndoImpactPreview(null);
        }}
        onConfirm={handleExecuteUndoCycle}
        title="Este cambio ajustará otros ciclos"
        description="Deshacer el ciclo actual unirá ciclos y moverá registros."
        confirmLabel="Aplicar cambios"
        affectedCycles={undoImpactPreview?.affectedCycles || []}
        impactSummary={undoImpactPreview?.impactSummary}
        adjustedCyclesPreview={undoImpactPreview?.adjustedCyclesPreview || []}
      />

      <DeletionDialog
        isOpen={Boolean(recordToDelete)}
        onClose={() => {
          if (isDeletingRecord) return;
          setRecordToDelete(null);
        }}
        onConfirm={handleConfirmDeleteRecord}
        title="Eliminar registro"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        description="¿Quieres eliminar este registro? Esta acción no se puede deshacer."
        isProcessing={isDeletingRecord}
      />

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          return;
          }

          if (isNewCycleFlowFromForm || showNewCycleDialog) {
            return;
          }
          
          handleCloseForm();
        }}
      >
        <DialogContent
          unestyled
          hideClose
          className="bg-transparent border-none p-0 text-gray-800 w-[96vw] max-w-2xl h-[92dvh] max-h-[92dvh] overflow-hidden shadow-none"
        onInteractOutside={(e) => {
    // Evita que el click en el dialog "Nuevo ciclo" cierre el formulario (dialog padre)
    e.preventDefault();
  }}
  onPointerDownOutside={(e) => {
    e.preventDefault();
  }}
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
            onOpenNewCycle={handleOpenNewCycleDialog}
            formDraft={formDraftToRestore}
          />
        </DialogContent>
      </Dialog>

      <FloatingActionButton
        onAddRecord={() => {
          setEditingRecord(null);
          setInitialSectionKey(null);
          setShowForm(true);
        }}
        onAddCycle={() => handleOpenNewCycleDialog()}
      />

      <NewCycleDialog
        isOpen={showNewCycleDialog}
        onClose={handleCloseNewCycleDialog}
        onPreview={(selectedStartDate) => previewStartNewCycle?.(selectedStartDate, currentCycle?.id)}
        onConfirm={handleConfirmNewCycle}
        currentCycleStartDate={currentCycle.startDate}
        currentCycleRecords={currentCycle?.data ?? []}
        initialStartDate={newCyclePrefillDate}
      />
    </>
  );
};

export default ModernFertilityDashboard;
