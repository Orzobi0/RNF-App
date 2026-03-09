import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ChartPoints from '@/components/chartElements/ChartPoints';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import ChartLeftLegend from '@/components/chartElements/ChartLeftLegend';
import FertilityChartCanvasOverlay from '@/components/chartElements/FertilityChartCanvasOverlay';
import { getChartTheme } from '@/components/chartElements/chartTheme';
import { useFertilityChart } from '@/hooks/useFertilityChart';
import { isAfter, parseISO, startOfDay } from 'date-fns';

const FertilityChart = ({
  data,
  isFullScreen,
  orientation,
  onToggleIgnore,
  onEdit,
  onTogglePeak,
  cycleId,
  initialScrollIndex = 0,
  visibleDays = 5,
  showInterpretation = false,
  showManualBaseline = false,
  reduceMotion = false,
  forceLandscape = false,
  currentPeakIsoDate = null,
  showRelationsRow = false,
  fertilityStartConfig = null,
  fertilityCalculatorCycles = [],
  fertilityCalculatorCandidates = null,
  onShowPhaseInfo = null,
  isArchivedCycle = false,
  cycleEndDate = null,
  exportMode = false,
}) => {
  const {
    chartRef,
    tooltipRef,
    dimensions,
    activePoint,
    activeIndex,
    tooltipPosition,
    allDataPoints,
    validDataForLine,
    tempMin,
    tempMax,
    tempRange,
    padding,
    textRowHeight,
    getY,
    getX,
    handlePointInteraction,
    handleToggleIgnore,
    responsiveFontSize,
    clearActivePoint,
    baselineTemp,
    baselineStartIndex,
    baselineIndices,
    firstHighIndex,
    ovulationDetails,
    fertilityStart,
    hasTemperatureData,
    hasAnyObservation,
    graphBottomInset,
    todayIndex,
  } = useFertilityChart(
    data,
    isFullScreen,
    orientation,
    onToggleIgnore,
    cycleId,
    visibleDays,
    forceLandscape,
    fertilityStartConfig,
    fertilityCalculatorCycles,
    fertilityCalculatorCandidates,
    showRelationsRow,
    exportMode
  );
  const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const effectiveReduceMotion = reduceMotion || exportMode;
  const uniqueIdRef = useRef(null);
  if (!uniqueIdRef.current) {
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    uniqueIdRef.current = `fertility-chart-${cycleId ?? 'default'}-${randomSuffix}`;
  }
  const uniqueId = uniqueIdRef.current;
  const MANUAL_DRAG_THRESHOLD_PX = 10;
  const normalizeTemp2 = useCallback((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(2));
  }, []);
  const areTempsEqual2 = useCallback((left, right) => {
    const normalizedLeft = normalizeTemp2(left);
    const normalizedRight = normalizeTemp2(right);
    return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight;
  }, [normalizeTemp2]);
  const findNearestSnapTemp = useCallback((target, snapTemps) => {
    if (!Array.isArray(snapTemps) || !snapTemps.length) return null;
    const normalizedTarget = normalizeTemp2(target);
    if (normalizedTarget == null) return snapTemps[Math.floor(snapTemps.length / 2)];
    let nearest = snapTemps[0];
    let minDiff = Math.abs(normalizedTarget - nearest);
    for (let index = 1; index < snapTemps.length; index += 1) {
      const snap = snapTemps[index];
      const diff = Math.abs(normalizedTarget - snap);
      if (diff < minDiff) {
        nearest = snap;
        minDiff = diff;
      }
    }
    return nearest;
  }, [normalizeTemp2]);

  const isPointEligibleForManualMode = useCallback((point, index) => {
    if (!point || !Number.isFinite(point?.displayTemperature)) return false;
    if (point?.ignoredForCalc ?? point?.ignored) return false;
    if (isArchivedCycle) {
      if (!cycleEndDate) return true;
      return typeof point?.isoDate === 'string' ? point.isoDate <= cycleEndDate : true;
    }
    if (!Number.isInteger(todayIndex)) return true;
    return index <= todayIndex;
  }, [isArchivedCycle, cycleEndDate, todayIndex]);
  const getOverscanDays = useCallback((visibleDaysValue, totalPoints) => {
    // En ciclos archivados priorizamos fluidez: render completo para tamaños medios.
    const fullRenderThreshold = isArchivedCycle ? 220 : 120;
    if (totalPoints <= fullRenderThreshold) return totalPoints;

    const screens = isArchivedCycle
      ? (visibleDaysValue >= 20 ? 2 : 3)
      : (visibleDaysValue >= 20 ? 1 : 2);
    const raw = Math.ceil(visibleDaysValue * screens);
    const capped = Math.min(raw, isArchivedCycle ? 48 : 24);
    return Math.max(capped, 12);
  }, [isArchivedCycle]);

  const initialRange = useMemo(() => {
    const total = allDataPoints.length;
    if (!total) return { startIndex: 0, endIndex: -1 };

    const overscanDays = getOverscanDays(visibleDays, total);
    const startIndex = Math.max(0, Math.floor(initialScrollIndex) - overscanDays);
    const endIndex = Math.min(
      total - 1,
      Math.floor(initialScrollIndex) + visibleDays + overscanDays
    );

    return { startIndex, endIndex };
  }, [allDataPoints.length, getOverscanDays, initialScrollIndex, visibleDays]);

  const [visibleRange, setVisibleRange] = useState(initialRange);
  const scrollRafRef = useRef(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollStopTimerRef = useRef(null);
  const pointerGestureRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const manualModeEnabled = showManualBaseline;
  const manualEligiblePoints = useMemo(
    () => allDataPoints.filter((point, index) => isPointEligibleForManualMode(point, index)),
    [allDataPoints, isPointEligibleForManualMode]
  );
  const manualSnapTemps = useMemo(() => {
    const set = new Set();
    manualEligiblePoints.forEach((point) => {
      const value = normalizeTemp2(point?.displayTemperature);
      if (value != null) {
        set.add(value.toFixed(2));
      }
    });
    return Array.from(set).map(Number).sort((a, b) => a - b);
  }, [manualEligiblePoints, normalizeTemp2]);
  const [manualBaselineTemp, setManualBaselineTemp] = useState(null);
  useEffect(() => {
    if (!manualSnapTemps.length) {
      setManualBaselineTemp(null);
      return;
    }
    setManualBaselineTemp((prev) => {
      const normalizedPrev = normalizeTemp2(prev);
      if (normalizedPrev != null) {
        const exactMatch = manualSnapTemps.find((value) => areTempsEqual2(value, normalizedPrev));
        if (exactMatch != null) {
          return exactMatch;
        }
      return findNearestSnapTemp(normalizedPrev, manualSnapTemps);
      }
      if (Number.isFinite(baselineTemp)) {
        return findNearestSnapTemp(baselineTemp, manualSnapTemps);
      }
      return manualSnapTemps[Math.floor(manualSnapTemps.length / 2)];
    });
  }, [manualSnapTemps, baselineTemp, normalizeTemp2, areTempsEqual2, findNearestSnapTemp]);
  const manualBaselineY = Number.isFinite(manualBaselineTemp) ? getY(manualBaselineTemp) : null;
  const manualBaselinePlusTemp = Number.isFinite(manualBaselineTemp)
    ? Number((manualBaselineTemp + 0.2).toFixed(2))
    : null;
  const manualBaselinePlusY = Number.isFinite(manualBaselinePlusTemp)
    ? getY(manualBaselinePlusTemp)
    : null;
  const manualDragRef = useRef({
    dragging: false,
    pointerId: null,
    startY: 0,
    accumDelta: 0,
  });
  const handleManualBaselinePointerDown = useCallback((event) => {
    if (!manualModeEnabled || manualSnapTemps.length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    manualDragRef.current = {
      dragging: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      accumDelta: 0,
    };
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [manualModeEnabled, manualSnapTemps.length]);
  const handleManualBaselinePointerMove = useCallback((event) => {
  const state = manualDragRef.current;
  if (!state.dragging || state.pointerId !== event.pointerId) return;

  event.preventDefault();
  event.stopPropagation();

  const deltaY = event.clientY - state.startY;
  state.startY = event.clientY;
  state.accumDelta += deltaY;

  const steps = Math.trunc(state.accumDelta / MANUAL_DRAG_THRESHOLD_PX);
  if (!steps) return;

  state.accumDelta -= steps * MANUAL_DRAG_THRESHOLD_PX;

  setManualBaselineTemp((prev) => {
    if (!manualSnapTemps.length) return prev;

    const normalizedPrev = normalizeTemp2(prev);
    const exactIndex = manualSnapTemps.findIndex((value) => areTempsEqual2(value, normalizedPrev));
    const nearestValue = findNearestSnapTemp(normalizedPrev, manualSnapTemps);
    const nearestIndex = manualSnapTemps.findIndex((value) => areTempsEqual2(value, nearestValue));
    const currentIndex = exactIndex >= 0 ? exactIndex : Math.max(0, nearestIndex);

    const nextIndex = Math.min(
      manualSnapTemps.length - 1,
      Math.max(0, currentIndex - steps)
    );

    return manualSnapTemps[nextIndex];
  });
}, [manualSnapTemps, normalizeTemp2, areTempsEqual2, findNearestSnapTemp]);
  const handleManualBaselinePointerUp = useCallback((event) => {
    const state = manualDragRef.current;
    if (state.pointerId !== event.pointerId) return;
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    manualDragRef.current = { dragging: false, pointerId: null, startY: 0, accumDelta: 0 };
  }, []);
  const handleManualBaselinePointerCancel = useCallback(() => {
    manualDragRef.current = { dragging: false, pointerId: null, startY: 0, accumDelta: 0 };
  }, []);
  const overlayRootRef = useRef(null);
  const [manualHandleStyle, setManualHandleStyle] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!manualModeEnabled || !Number.isFinite(manualBaselineY)) return undefined;

    const updateHandlePosition = () => {
      const scroller = chartRef.current;
      const overlayRoot = overlayRootRef.current;
      if (!scroller || !overlayRoot) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const rootRect = overlayRoot.getBoundingClientRect();
      const buttonSize = 40;
const bubbleHeight = 24;
const gapBetweenBubbleAndButton = 4;
const blockHeight = bubbleHeight + gapBetweenBubbleAndButton + buttonSize;
const rightGap = isFullScreen ? 8 : 4;
const topGap = isFullScreen ? 8 : 4;
const bottomGap = isFullScreen ? 8 : 4;

const localY = manualBaselineY - scroller.scrollTop;
const clampedCenterY = Math.min(
  scroller.clientHeight - bottomGap - buttonSize / 2,
  Math.max(topGap + buttonSize / 2, localY)
);

const top =
  scrollerRect.top -
  rootRect.top +
  clampedCenterY -
  (bubbleHeight + gapBetweenBubbleAndButton + buttonSize / 2);

const left = scrollerRect.right - rootRect.left - buttonSize - rightGap;

setManualHandleStyle({ top, left });
    };

    updateHandlePosition();
    const scroller = chartRef.current;
    scroller?.addEventListener('scroll', updateHandlePosition, { passive: true });
    window.addEventListener('resize', updateHandlePosition);
    window.visualViewport?.addEventListener('resize', updateHandlePosition);
    window.visualViewport?.addEventListener('scroll', updateHandlePosition);

    return () => {
      scroller?.removeEventListener('scroll', updateHandlePosition);
      window.removeEventListener('resize', updateHandlePosition);
      window.visualViewport?.removeEventListener('resize', updateHandlePosition);
      window.visualViewport?.removeEventListener('scroll', updateHandlePosition);
    };
  }, [manualModeEnabled, manualBaselineY, chartRef, isFullScreen]);
  const getNearestDataIndexByX = useCallback((targetX) => {
    const totalPoints = allDataPoints.length;
    if (!Number.isFinite(targetX) || totalPoints === 0) return null;
    if (totalPoints === 1) return 0;

    let low = 0;
    let high = totalPoints - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midX = getX(mid);

      if (midX < targetX) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const rightIndex = Math.min(Math.max(low, 0), totalPoints - 1);
    const leftIndex = Math.max(rightIndex - 1, 0);
    return Math.abs(getX(leftIndex) - targetX) <= Math.abs(getX(rightIndex) - targetX)
      ? leftIndex
      : rightIndex;
  }, [allDataPoints, getX]);
  const activateTooltipFromPointer = useCallback((event) => {
    if (exportMode) return;

  const clickedInteractiveElement =
      event.target?.closest?.('[data-chart-interactive="true"], [data-manual-baseline-interactive="true"]');
    if (clickedInteractiveElement) return;

    const scroller = chartRef.current;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const vv =
  typeof window !== 'undefined' ? window.visualViewport : null;

const adjustedClientX = event.clientX - (vv?.offsetLeft ?? 0);
const adjustedClientY = event.clientY - (vv?.offsetTop ?? 0);

const isRotated =
  isFullScreen &&
  forceLandscape &&
  ((vv?.width ?? window.innerWidth ?? 0) < (vv?.height ?? window.innerHeight ?? 0));

let localX = adjustedClientX - rect.left;

if (isRotated) {
  const cy = rect.top + rect.height / 2;
  const dy = adjustedClientY - cy;
  const unrotW = rect.height || 1;
  localX = dy + unrotW / 2;
}

    const worldX = scroller.scrollLeft + localX;
    const index = getNearestDataIndexByX(worldX);
    if (index == null) return;

    const point = allDataPoints[index];
    if (!point) return;

    const isFuture = point.isoDate
      ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
      : false;
    if (isFuture) return;

  handlePointInteraction(point, index, event);
  }, [
    exportMode,
    chartRef,
    isFullScreen,
    forceLandscape,
    getNearestDataIndexByX,
    allDataPoints,
    handlePointInteraction,
  ]);

  const handleChartPointerDown = useCallback((event) => {
    if (exportMode) return;
    const scroller = chartRef.current;
    if (!scroller) return;
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroller.scrollLeft,
      moved: false,
    };
  }, [chartRef, exportMode]);

  const handleChartPointerMove = useCallback((event) => {
    const gesture = pointerGestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;
    const movedX = Math.abs(event.clientX - gesture.startX);
    const movedY = Math.abs(event.clientY - gesture.startY);
    if (movedX > 8 || movedY > 8) {
      gesture.moved = true;
    }
  }, []);

  const handleChartPointerUp = useCallback((event) => {
    const gesture = pointerGestureRef.current;
    const scroller = chartRef.current;
    const isSamePointer = gesture.pointerId === event.pointerId;
    pointerGestureRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      moved: false,
    };

    if (!isSamePointer || !scroller) return;
    const scrollDelta = Math.abs(scroller.scrollLeft - gesture.startScrollLeft);
    if (gesture.moved || scrollDelta > 4 || isScrolling) return;

    activateTooltipFromPointer(event);
  }, [activateTooltipFromPointer, chartRef, isScrolling]);

  const handleChartPointerCancel = useCallback(() => {
    pointerGestureRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      moved: false,
    };
  }, []);
  
  if (!allDataPoints || allDataPoints.length === 0) {
    return (
      <div className="text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-slate-400 font-medium">No hay datos para mostrar en el gráfico</p>
      </div>
    );
  }

  const chartWidth = dimensions.width;
  const chartHeight = dimensions.contentHeight ?? dimensions.height;
  const viewportHeight = dimensions.viewportHeight ?? dimensions.height;
  const scrollableContentHeight = dimensions.scrollableContentHeight ?? chartHeight;
  const verticalThreshold = isIOS ? 24 : 2;
  const needsVerticalScroll =
  Number.isFinite(scrollableContentHeight) &&
  Number.isFinite(viewportHeight) &&
  scrollableContentHeight > viewportHeight + verticalThreshold;
  const allowVerticalScroll = needsVerticalScroll || showRelationsRow;
  const graphBottomY = chartHeight - padding.bottom - (graphBottomInset || 0);
  const rowsZoneHeight = Math.max(chartHeight - graphBottomY, 0);
  const baselineY = baselineTemp != null ? getY(baselineTemp) : null;
  const hasPotentialRise = baselineTemp != null && Number.isFinite(firstHighIndex);
  const confirmedRise = Boolean(ovulationDetails?.confirmed);
  const shouldRenderBaseline = baselineTemp != null && confirmedRise;

  const baselineStartX = getX(0);
  const baselineEndX =
    allDataPoints.length > 0
      ? getX(allDataPoints.length - 1)
      : chartWidth - padding.right;
  const theme = getChartTheme();
  const baselineStroke = confirmedRise ? theme.baseline.defaultStroke : theme.points.ignoredStroke;
  const baselineDash = confirmedRise ? '6 4' : '4 4';
  const baselineOpacity = confirmedRise ? 1 : 0.7;
  const baselineWidth = 3;
  const isLoading = chartWidth === 0;

  const manualLabelPoints = useMemo(() => {
    if (!manualModeEnabled) return [];
    const total = allDataPoints.length;
    if (!total) return [];
    const overscan = 2;
    const start = Math.max(0, (visibleRange?.startIndex ?? 0) - overscan);
    const end = Math.min(total - 1, (visibleRange?.endIndex ?? (total - 1)) + overscan);
    const list = [];
    for (let index = start; index <= end; index += 1) {
      const point = allDataPoints[index];
      if (!isPointEligibleForManualMode(point, index)) continue;
      const normalizedTemp = normalizeTemp2(point?.displayTemperature);
      if (normalizedTemp == null) continue;
      list.push({ index, value: normalizedTemp, x: getX(index), y: getY(normalizedTemp) });
    }
    return list;
  }, [manualModeEnabled, allDataPoints, visibleRange, isPointEligibleForManualMode, getX, getY, normalizeTemp2]);

  const validDataMap = useMemo(() => {
    const map = new Map();
    validDataForLine.forEach((point) => {
      if (point && point.id != null) {
        map.set(point.id, point);
      }
    });
    return map;
  }, [validDataForLine]);

  const fertileStartFinalIndex = useMemo(
    () =>
      Number.isInteger(fertilityStart?.fertileStartFinalIndex)
        ? fertilityStart.fertileStartFinalIndex
        : null,
    [fertilityStart]
  );

  const chartAreaHeight = Math.max(chartHeight - padding.top - padding.bottom - (graphBottomInset || 0), 0);
  const getDayLeftEdge = useCallback(
    (index) => {
      if (!Number.isFinite(index) || !allDataPoints.length) return padding.left;
      if (index <= 0) return padding.left;
      return getX(index);
    },
    [allDataPoints, getX, padding.left]
  );

  const getDayRightEdge = useCallback(
    (index) => {
      if (!Number.isFinite(index) || !allDataPoints.length) return chartWidth - padding.right;
      if (index >= allDataPoints.length - 1) return chartWidth - padding.right;
      return getX(index + 1);
    },
    [allDataPoints, chartWidth, getX, padding.right]
  );

  const getSegmentBounds = useCallback(
    (startIdx, endIdx, { inclusiveEnd = true } = {}) => {
      if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx)) return null;
      if (allDataPoints.length === 0) return null;

      const clampStart = (value) =>
        Math.max(0, Math.min(allDataPoints.length - 1, Math.floor(value)));

      const clampEndInclusive = (value) =>
        Math.max(0, Math.min(allDataPoints.length - 1, Math.floor(value)));
      const clampEndExclusive = (value) =>
        Math.max(0, Math.min(allDataPoints.length, Math.floor(value)));

      const start = clampStart(startIdx);
      const end = inclusiveEnd
        ? clampEndInclusive(endIdx)
        : clampEndExclusive(endIdx);

      const leftBoundary =
        start <= 0 ? padding.left : getDayLeftEdge(start);

      let rightBoundary;
      if (inclusiveEnd) {
        rightBoundary =
          end >= allDataPoints.length - 1
            ? chartWidth - padding.right
            : getDayRightEdge(end);
      } else {
        if (end <= 0) {
          rightBoundary = padding.left;
        } else if (end >= allDataPoints.length) {
          rightBoundary = chartWidth - padding.right;
        } else {
          rightBoundary = getDayLeftEdge(end);
        }
      }

      const width = Math.max(rightBoundary - leftBoundary, 0);
      if (width <= 0) return null;

      return { x: leftBoundary, width };
    },
    [
      allDataPoints,
      chartWidth,
      getDayLeftEdge,
      getDayRightEdge,
      padding.left,
      padding.right,
    ]
  );
  
  const totalLastIndex = allDataPoints.length > 0 ? allDataPoints.length - 1 : null;

  const archivedPhaseEndIndex = useMemo(() => {
    if (!isArchivedCycle || !cycleEndDate || totalLastIndex == null) {
      return null;
    }
    const normalizedEnd = typeof cycleEndDate === 'string' ? cycleEndDate : null;
    if (!normalizedEnd) return null;
    const matchingIndex = allDataPoints.findIndex((point) => point?.isoDate === normalizedEnd);
    if (matchingIndex >= 0) {
      return Math.min(matchingIndex, totalLastIndex);
    }
    for (let idx = allDataPoints.length - 1; idx >= 0; idx -= 1) {
      const iso = allDataPoints[idx]?.isoDate;
      if (typeof iso === 'string' && iso <= normalizedEnd) {
        return Math.min(idx, totalLastIndex);
      }
    }
    return null;
  }, [isArchivedCycle, cycleEndDate, allDataPoints, totalLastIndex]);

  const relativeFertileLimitIndex = useMemo(() => {
    if (totalLastIndex == null) {
      return null;
    }
    if (isArchivedCycle) {
      return Number.isInteger(archivedPhaseEndIndex)
        ? Math.min(archivedPhaseEndIndex, totalLastIndex)
        : totalLastIndex;
    }
    if (Number.isInteger(todayIndex)) {
      return Math.min(todayIndex, totalLastIndex);
    }
    return totalLastIndex;
  }, [archivedPhaseEndIndex, isArchivedCycle, todayIndex, totalLastIndex]);
  
  const phaseInfoLimitIndex = useMemo(() => {
    if (isArchivedCycle) {
      if (Number.isInteger(archivedPhaseEndIndex)) {
        return archivedPhaseEndIndex;
      }
      return Number.isInteger(relativeFertileLimitIndex) ? relativeFertileLimitIndex : null;
    }
    return Number.isInteger(todayIndex) ? todayIndex : null;
  }, [archivedPhaseEndIndex, isArchivedCycle, relativeFertileLimitIndex, todayIndex]);
  const interpretationBandTop =
    chartAreaHeight > 0 ? padding.top + chartAreaHeight * 0.5 : null;
  const interpretationBandHeight =
    interpretationBandTop != null
      ? Math.max(graphBottomY - interpretationBandTop, 0)
      : 0;

  const postOvulatoryPhaseInfo = useMemo(() => {
    if (!showInterpretation || !hasAnyObservation) return null;

    const debug = fertilityStart?.debug;
    const mucusStartIndex = Number.isInteger(debug?.mucusInfertileStartIndex)
      ? debug.mucusInfertileStartIndex
      : null;

    const tempStartIndex = Number.isInteger(
      fertilityStart?.fertileWindow?.temperatureInfertileStartIndex
    )
      ? fertilityStart.fertileWindow.temperatureInfertileStartIndex
      : null;

    const computedPostStart = [mucusStartIndex, tempStartIndex]
      .filter((idx) => Number.isInteger(idx))
      .sort((a, b) => a - b)[0];

    const postStartIndex = Number.isInteger(computedPostStart)
      ? computedPostStart
      : Number.isInteger(debug?.postOvulatoryStartIndex)
        ? debug.postOvulatoryStartIndex
        : null;

    const computedAbsoluteStart =
      Number.isInteger(mucusStartIndex) && Number.isInteger(tempStartIndex)
        ? Math.max(mucusStartIndex, tempStartIndex)
        : null;

    const absoluteStartIndex = Number.isInteger(computedAbsoluteStart)
      ? computedAbsoluteStart
      : Number.isInteger(debug?.absoluteStartIndex)
        ? debug.absoluteStartIndex
        : null;

    const temperatureDetails = {
      confirmed: Boolean(ovulationDetails?.confirmed),
      rule: ovulationDetails?.rule ?? null,
      baselineTemp: ovulationDetails?.baselineTemp ?? null,
      baselineIndices: Array.isArray(ovulationDetails?.baselineIndices)
        ? ovulationDetails.baselineIndices
        : [],
      firstHighIndex: Number.isInteger(ovulationDetails?.firstHighIndex)
        ? ovulationDetails.firstHighIndex
        : null,
      highSequenceIndices: Array.isArray(ovulationDetails?.highSequenceIndices)
        ? ovulationDetails.highSequenceIndices
        : [],
      confirmationIndex: Number.isInteger(ovulationDetails?.confirmationIndex)
        ? ovulationDetails.confirmationIndex
        : null,
      startIndex: tempStartIndex,
    };

    const mucusDetails = {
      peakDayIndex: Number.isInteger(ovulationDetails?.peakDayIndex)
        ? ovulationDetails.peakDayIndex
        : null,
      thirdDayIndex: Number.isInteger(ovulationDetails?.thirdDayIndex)
        ? ovulationDetails.thirdDayIndex
        : null,
      startIndex: mucusStartIndex,
    };

    const hasTemperatureClosure = tempStartIndex != null;
    const hasMucusClosure = mucusStartIndex != null;

    if (!hasTemperatureClosure && !hasMucusClosure) {
      return null;
    }

    const startIndex = Number.isInteger(postStartIndex) ? postStartIndex : null;
    if (startIndex == null) return null;

    let status = 'pending';
    let message = '';
    let label = 'Infertilidad postovulatoria';
    let tooltip = 'Fase postovulatoria: se ha cumplido un criterio de cierre; falta el segundo para confirmar la infertilidad absoluta.';

    const absoluteLabel = 'Infertilidad absoluta';
    const absoluteMessage = 'Fase postovulatoria alcanzada (se ha confirmado día pico y subida de temperatura).';
    const absoluteTooltip = 'Confirmación completa: doble criterio (día pico + temperatura).';
    const formatDay = (idx) => (Number.isInteger(idx) ? `D${idx + 1}` : '—');
    let estimatedLabel = label;
    let estimatedTooltip = tooltip;
    let estimatedMessage = message;
    let estimatedStatus = 'pending';

    if (hasTemperatureClosure && hasMucusClosure) {
      status = 'absolute';
      label = absoluteLabel;
      tooltip = absoluteTooltip;
      message = absoluteMessage;

      const temperatureFirst = Number.isInteger(tempStartIndex)
        && (!Number.isInteger(mucusStartIndex) || tempStartIndex <= mucusStartIndex);
      if (temperatureFirst) {
        const ruleLabel = temperatureDetails.rule || 'regla desconocida';
        const confirmationDay = temperatureDetails.confirmationIndex != null
          ? `D${temperatureDetails.confirmationIndex + 1}`
          : '—';
        estimatedMessage = `Temperatura confirmada el ${confirmationDay}. A la espera de determinación del día pico.`;
        estimatedTooltip = estimatedMessage;
        estimatedLabel = 'Infertilidad estimada por temperatura';
      } else {
        const mucusRuleLabel = mucusDetails.thirdDayIndex != null ? '3° día postpico' : '4º día postpico';
        estimatedMessage = `Alcanzado ${mucusRuleLabel} tras alcanzar día pico el ${mucusDetails.peakDayIndex + 1} del ciclo`;
        estimatedTooltip = estimatedMessage;
        estimatedLabel = 'Infertilidad estimada por moco';
      }
    } else if (hasTemperatureClosure) {
      const ruleLabel = temperatureDetails.rule || 'regla desconocida';
      const confirmationDay = temperatureDetails.confirmationIndex != null
        ? `D${temperatureDetails.confirmationIndex + 1}`
        : '—';
      message = `Temperatura confirmada el ${confirmationDay}. A la espera de determinación del día pico.`;
      tooltip = message;
      label = 'Infertilidad estimada por temperatura';
      estimatedMessage = message;
      estimatedTooltip = tooltip;
      estimatedLabel = label;
    } else {
      const mucusRuleLabel = mucusDetails.thirdDayIndex != null ? '3° día postpico' : '4º día postpico';
      message = `Alcanzado ${mucusRuleLabel} tras seleccionar día pico el ${mucusDetails.peakDayIndex + 1} del ciclo`;
      tooltip = message;
      label = 'Infertilidad estimada por moco';
      estimatedMessage = message;
      estimatedTooltip = tooltip;
      estimatedLabel = label;
    }

    return {
      phase: 'postOvulatory',
      status,
      startIndex,
      absoluteStartIndex,
      estimated: {
        status: estimatedStatus,
        label: estimatedLabel,
        tooltip: estimatedTooltip,
        message: estimatedMessage,
      },
      absolute: {
        label: absoluteLabel,
        tooltip: absoluteTooltip,
        message: absoluteMessage,
      },
      reasons: {
        type: 'post',
        status,
        mucus: mucusDetails,
        temperature: temperatureDetails,
      },
      message,
      label,
      tooltip,
    };
  }, [
    showInterpretation,
    hasAnyObservation,
    ovulationDetails,
    fertilityStart,
  ]);

  const interpretationSegments = useMemo(() => {
    if (
      !showInterpretation ||
      chartAreaHeight <= 0 ||
      interpretationBandTop == null ||
      interpretationBandHeight <= 0 ||
      allDataPoints.length === 0
    ) {
      return [];
    }
    const segments = [];
    const lastIndex = allDataPoints.length - 1;
    const phaseRenderLimit =
      Number.isInteger(relativeFertileLimitIndex) && relativeFertileLimitIndex >= 0
        ? Math.min(relativeFertileLimitIndex, lastIndex)
        : lastIndex;

        const appendPostSegments = (targetSegments, renderLimit) => {
      if (!postOvulatoryPhaseInfo) return;

      const postStart = postOvulatoryPhaseInfo.startIndex;
      const absStart = Number.isInteger(postOvulatoryPhaseInfo.absoluteStartIndex)
        ? postOvulatoryPhaseInfo.absoluteStartIndex
        : null;

      const estimatedInfo = postOvulatoryPhaseInfo.estimated ?? postOvulatoryPhaseInfo;
      const absoluteInfo = postOvulatoryPhaseInfo.absolute ?? postOvulatoryPhaseInfo;

      const absoluteSegmentStart = absStart != null ? absStart : postStart;
      const renderEnd =
        postOvulatoryPhaseInfo.status === 'absolute'
          ? lastIndex
          : Math.min(lastIndex, renderLimit);

      if (absStart != null && absStart > postStart) {
        const pendingEnd = Math.min(absStart - 1, renderLimit);
        const pendingBounds = getSegmentBounds(postStart, pendingEnd);
        if (pendingBounds) {
          targetSegments.push({
            key: 'post-pending',
            phase: 'postOvulatory',
            status: estimatedInfo.status ?? 'pending',
            bounds: pendingBounds,
            startIndex: postStart,
            endIndex: pendingEnd,
            displayLabel: estimatedInfo.label,
            tooltip: estimatedInfo.tooltip,
            message: estimatedInfo.message,
            reasons: postOvulatoryPhaseInfo.reasons,
          });
        }
      }

      if (absoluteSegmentStart <= renderEnd) {
        const absoluteBounds = getSegmentBounds(absoluteSegmentStart, renderEnd);
        if (absoluteBounds) {
          targetSegments.push({
            key: 'post-absolute',
            phase: 'postOvulatory',
            status: absStart != null ? 'absolute' : postOvulatoryPhaseInfo.status,
            bounds: absoluteBounds,
            startIndex: absoluteSegmentStart,
            endIndex: renderEnd,
            displayLabel: absStart != null ? absoluteInfo.label : postOvulatoryPhaseInfo.label,
            tooltip: absStart != null ? absoluteInfo.tooltip : postOvulatoryPhaseInfo.tooltip,
            message: absStart != null ? absoluteInfo.message : postOvulatoryPhaseInfo.message,
            reasons: postOvulatoryPhaseInfo.reasons,
          });
        }
      }
    };
    const hasFertileStart = Number.isInteger(fertileStartFinalIndex);
    const hasPostPhase = Number.isFinite(postOvulatoryPhaseInfo?.startIndex);

    // Mientras NO haya ni inicio fértil (CPM / T-8 / perfiles / marcador)
    // ni fase postovulatoria, todo lo registrado se considera
    // fase relativamente infértil (preovulatoria).
    if (!hasFertileStart && !hasPostPhase) {
      const relativeDefaultEnd = Math.min(phaseRenderLimit, lastIndex);
      if (relativeDefaultEnd < 0) {
        return segments;
      }
      const bounds = getSegmentBounds(0, relativeDefaultEnd);
      if (bounds) {
        segments.push({
          key: 'relative-default',
          phase: 'relativeInfertile',
          status: 'default',
          bounds,
          startIndex: 0,
          endIndex: relativeDefaultEnd,
          displayLabel: 'Relativamente infértil',
          tooltip:
            'Relativamente infértil (preovulatoria: sin día fértil por CPM/T-8 ni signos de moco fértil)',
          message: 'Relativamente infértil',
          reasons: {
            type: 'relative',
            fertileStartFinalIndex: null,
            aggregate: fertilityStart?.aggregate ?? null,
            bipScore: fertilityStart?.debug?.bipScore ?? null,
          },
        });
      }
      return segments;
    }

     // Caso: NO hay inicio fértil pero SÍ hay fase postovulatoria
    if (!hasFertileStart && hasPostPhase) {
      const postStart = postOvulatoryPhaseInfo.startIndex;
      const preEnd = Math.min(postStart - 1, phaseRenderLimit);

      // Banda previa: “Sin ventana fértil identificable”
      if (preEnd >= 0) {
        const bounds = getSegmentBounds(0, preEnd);
        if (bounds) {
          segments.push({
            key: 'no-fertile-window',
            phase: 'nodata',
            status: 'no-fertile-window',
            bounds,
            startIndex: 0,
            endIndex: preEnd,
            displayLabel: 'Sin ventana fértil identificable',
            tooltip: 'Sin ventana fértil identificable',
            message: 'Sin ventana fértil identificable',
            reasons: {
              type: 'nofertile',
              status: 'no-fertile-window',
              message:
                'No se ha identificado un inicio fértil claro en este ciclo (ni por moco, ni por calculadora, ni por marcador explícito).',
            },
          });
        }
      }

      // Banda postovulatoria normal
      if (
        Number.isFinite(postOvulatoryPhaseInfo.startIndex) &&
        postOvulatoryPhaseInfo.startIndex <= lastIndex
      ) {
    appendPostSegments(segments, phaseRenderLimit);
      }

      return segments;
    }


    if (hasFertileStart && fertileStartFinalIndex > 0) {
      const endIndex = Math.min(fertileStartFinalIndex - 1, phaseRenderLimit);
      if (endIndex >= 0) {
        const bounds = getSegmentBounds(0, endIndex);
        if (bounds) {
          segments.push({
            key: 'relative',
            phase: 'relativeInfertile',
            status: 'default',
            bounds,
            startIndex: 0,
            endIndex,
            displayLabel: 'Relativamente infértil',
            tooltip: 'Relativamente infértil (fase relativamente infértil preovulatoria)',
            message: 'Relativamente infértil',
            reasons: {
              type: 'relative',
              fertileStartFinalIndex,
              aggregate: fertilityStart?.aggregate ?? null,
              bipScore: fertilityStart?.debug?.bipScore ?? null,
            },
          });
        }
      }
    }

    const fertileStartIndex = hasFertileStart
      ? Math.max(fertileStartFinalIndex, 0)
      : 0;

    const postPhaseStart = postOvulatoryPhaseInfo?.startIndex;
    const fertileEndIndex =
      Number.isFinite(postPhaseStart) && postPhaseStart != null
        ? Math.min(postPhaseStart - 1, lastIndex)
        : lastIndex;

    const fertileSegmentEnd = Math.min(fertileEndIndex, phaseRenderLimit);

    if (fertileSegmentEnd >= fertileStartIndex) {
      const bounds = getSegmentBounds(fertileStartIndex, fertileSegmentEnd);
      if (bounds) {
        const explicitDay = Number.isInteger(fertilityStart?.debug?.explicitStartDay)
          ? fertilityStart.debug.explicitStartDay
          : null;
        const usedCandidates = fertilityStart?.aggregate?.usedCandidates ?? [];
        const hasProfileSource = usedCandidates.some((candidate) => candidate?.kind === 'profile');
        const hasCalculatorSource = usedCandidates.some((candidate) => candidate?.kind === 'calculator');
        let fertileSource = null;
        if (hasFertileStart && explicitDay != null && explicitDay === fertileStartFinalIndex) {
          fertileSource = 'marker';
        } else if (hasProfileSource) {
          fertileSource = 'profiles';
        } else if (hasCalculatorSource) {
          fertileSource = 'calculator';
        }
        segments.push({
          key: 'fertile',
          phase: 'fertile',
          status: 'default',
          bounds,
          startIndex: fertileStartIndex,
          endIndex: fertileSegmentEnd,
          displayLabel: 'Fértil',
          tooltip: 'Fértil',
          message: 'Fértil',
          reasons: {
            type: 'fertile',
            startIndex: fertileStartIndex,
            endIndex: fertileSegmentEnd,
            source: fertileSource,
            details: fertilityStart?.debug ?? null,
            notes: fertilityStart?.aggregate?.notes ?? [],
            statusSummary: fertilityStart?.currentAssessment ?? null,
            dailyAssessments: fertilityStart?.dailyAssessments ?? [],
            window: fertilityStart?.fertileWindow ?? null,
            aggregate: fertilityStart?.aggregate ?? null,
          },
        });
      }
    }

    if (
      postOvulatoryPhaseInfo &&
      Number.isFinite(postOvulatoryPhaseInfo.startIndex) &&
      postOvulatoryPhaseInfo.startIndex <= lastIndex
    ) {
      appendPostSegments(segments, phaseRenderLimit);
    }

    return segments;
  }, [
    showInterpretation,
    chartAreaHeight,
    interpretationBandTop,
    interpretationBandHeight,
    allDataPoints.length,
    fertileStartFinalIndex,
    fertilityStart,
    postOvulatoryPhaseInfo,
    hasAnyObservation,
    getSegmentBounds,
    relativeFertileLimitIndex,
  ]);
  const relativePhaseGradientId = `${uniqueId}-phase-relative-gradient`;
  const fertilePhaseGradientId = `${uniqueId}-phase-fertile-gradient`;
  const postPendingGradientId = `${uniqueId}-phase-post-pending-gradient`;
  const postAbsoluteGradientId = `${uniqueId}-phase-post-absolute-gradient`;
  const getSegmentTextColor = (segment) => {
    if (segment.phase === 'relativeInfertile') {
      return '#065F46';
    }
    if (segment.phase === 'fertile') {
      return '#9D174D';
    }
    if (segment.phase === 'postOvulatory') {
      return segment.status === 'pending' ? '#075985' : '#1E3A8A';
    }
    if (segment.phase === 'nodata') {
      return '#475569';
    }
    return 'hsl(var(--foreground))';
  };
  const phaseTextShadow = '0 1px 1px var(--phase-text-shadow, rgba(15, 23, 42, 0.2))';

  const temperatureRiseHighlightPath = useMemo(() => {
    if (!showInterpretation || !ovulationDetails?.confirmed) return null;
    const indices = Array.isArray(ovulationDetails?.highSequenceIndices)
      ? ovulationDetails.highSequenceIndices
      : [];

    if (indices.length < 2) return null;

    const coordinates = indices
      .map((idx) => {
        if (idx == null || idx < 0 || idx >= allDataPoints.length) return null;
        const point = allDataPoints[idx];
        const dataPoint = validDataMap.get(point?.id);
        if (!dataPoint || !Number.isFinite(dataPoint.displayTemperature)) return null;
        return { x: getX(idx), y: getY(dataPoint.displayTemperature) };
      })
      .filter(Boolean);

    if (coordinates.length < 2) return null;

    return coordinates
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
      .join(' ');
  }, [
    showInterpretation,
    ovulationDetails,
    allDataPoints,
    validDataMap,
    getX,
    getY,
  ]);
  
  // Detectar orientación real del viewport para rotación visual
  const readViewport = () => {
  if (typeof window === 'undefined') return { w: 0, h: 0 };
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth ?? 0;
  const h = vv?.height ?? window.innerHeight ?? 0;
  return { w: Math.round(w), h: Math.round(h) };
};

const [viewport, setViewport] = useState(readViewport);
const isViewportPortrait = viewport.w < viewport.h;

useEffect(() => {
  if (typeof window === 'undefined') return undefined;

  let raf = 0;
  const vv = window.visualViewport;

  const onResize = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setViewport(readViewport()));
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', onResize); // en iOS cambia al mostrar/ocultar barras/teclado

  onResize();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    vv?.removeEventListener('resize', onResize);
    vv?.removeEventListener('scroll', onResize);
  };
}, []);

  const updateVisibleRange = useCallback(
    (scrollLeft = 0) => {
      const node = chartRef.current;
      if (!node) return;

      const totalPoints = allDataPoints.length;
      if (!totalPoints) {
        setVisibleRange({ startIndex: 0, endIndex: -1 });
        return;
      }
      
      const viewportW = node.clientWidth || 1;
      const dayW = viewportW / Math.max(visibleDays, 1);
      const safeDayW = dayW || 1;

      const overscanDays = getOverscanDays(visibleDays, totalPoints);

      const firstVisible = Math.floor(scrollLeft / safeDayW);
      const lastVisible = Math.floor((scrollLeft + viewportW) / safeDayW);

      let startIndex = firstVisible - overscanDays;
      let endIndex = lastVisible + overscanDays;

      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(totalPoints - 1, endIndex);
      setVisibleRange((prev) =>
        prev.startIndex === startIndex && prev.endIndex === endIndex
          ? prev
          : { startIndex, endIndex }
      );
    },
    [allDataPoints.length, getOverscanDays, visibleDays]
  );

  useEffect(() => {
  if (!chartRef.current) return;
  const dayWidth = chartRef.current.clientWidth / visibleDays;
  chartRef.current.scrollLeft = Math.max(0, dayWidth * initialScrollIndex);
  updateVisibleRange(chartRef.current.scrollLeft);
}, [
  initialScrollIndex,
  visibleDays,
  dimensions.width,
  dimensions.viewportWidth,
  dimensions.viewportHeight,
  orientation,
  updateVisibleRange,
]);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollStopTimerRef.current) window.clearTimeout(scrollStopTimerRef.current);
      scrollStopTimerRef.current = window.setTimeout(() => setIsScrolling(false), 140);

      if (scrollRafRef.current) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateVisibleRange(node.scrollLeft);
      });
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    updateVisibleRange(node.scrollLeft);
    return () => {
      node.removeEventListener('scroll', handleScroll);
      if (scrollStopTimerRef.current) window.clearTimeout(scrollStopTimerRef.current);
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [updateVisibleRange]);

  const applyRotation = !exportMode && isFullScreen && forceLandscape && isViewportPortrait;
  const visualOrientation = forceLandscape ? 'landscape' : orientation;
  const isIOSFakeLandscape = isIOS && applyRotation;
  const isRotationStage = !exportMode && isFullScreen && forceLandscape;
  const shouldRotateStage = isRotationStage && applyRotation;

// Angulo real que pintamos (0 o 90). Lo forzamos a animar al entrar.
const [rotationAngle, setRotationAngle] = useState(applyRotation ? 90 : 0);
const [rotationBooting, setRotationBooting] = useState(false);

useEffect(() => {
  if (!isRotationStage) {
    setRotationBooting(false);
    setRotationAngle(0);
    return;
  }

  const target = applyRotation ? 90 : 0;

  // Si no hay que rotar (viewport ya landscape), vuelve a 0 suave.
  if (target === 0) {
    setRotationBooting(false);
    setRotationAngle(0);
    return;
  }

  // Entrada a rotación: 1 frame oculto a 0deg, siguiente frame -> 90deg (se anima)
  setRotationBooting(true);
  setRotationAngle(0);

  let raf1 = 0;
  let raf2 = 0;

  raf1 = requestAnimationFrame(() => {
    setRotationAngle(90);
    raf2 = requestAnimationFrame(() => setRotationBooting(false));
  });

  return () => {
    if (raf1) cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
  };
}, [applyRotation, isRotationStage]);

const rotationStageStyle = shouldRotateStage
  ? {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: `${isViewportPortrait ? viewport.h : viewport.w}px`,
      height: `${isViewportPortrait ? viewport.w : viewport.h}px`,
      transform: `translate3d(-50%, -50%, 0) rotate(${rotationAngle}deg)`,
      transformOrigin: 'center center',
      transition: effectiveReduceMotion
        ? 'transform 120ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease-out'
        : 'transform 120ms cubic-bezier(0.2, 0, 0, 1), opacity 120ms ease',
      willChange: 'transform, opacity',
      opacity: rotationBooting ? 0 : 1,
    }
  : null;

const safeAreaStyle = isFullScreen
  ? (shouldRotateStage
      ? {
          boxSizing: 'border-box',
          paddingTop: 0,
          paddingRight: 'calc(env(safe-area-inset-top) + 8px)',
          paddingBottom: 0,
          paddingLeft: 0,
        }
      : {
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          boxSizing: 'border-box',
        })
  : null;

const rotationWrapperStyle = rotationStageStyle
  ? { ...rotationStageStyle, ...(safeAreaStyle ?? {}) }
  : safeAreaStyle ?? undefined;

  // Clase del contenedor de scroll ajustada para rotación artificial
  const baseFullClass = 'w-full h-full bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100';
  const containerClass = isFullScreen
    ? `${baseFullClass} h-full overflow-x-auto ${allowVerticalScroll ? 'overflow-y-auto' : 'overflow-y-hidden'}`
    : `${baseFullClass} overflow-x-auto ${allowVerticalScroll ? 'overflow-y-auto' : 'overflow-y-hidden'} border border-pink-100/50`;
  const showLegend = true;
  const handlePointInteractionSafe = exportMode ? () => {} : handlePointInteraction;
  const clearActivePointSafe = exportMode ? () => {} : clearActivePoint;
  const showCanvasOverlay =
  !exportMode && chartWidth > 0 && chartHeight > 0 && scrollableContentHeight > 0;
  return (
      <motion.div
  className="relative w-full h-full bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100"
  initial={false}
>
  <div
    ref={overlayRootRef}
    className="relative w-full h-full"
    style={rotationWrapperStyle}
  >
      {showCanvasOverlay && (
   <div
     className={`absolute inset-0 overflow-hidden pointer-events-none ${isFullScreen ? '' : 'rounded-2xl'}`}
     style={{ zIndex: 0 }}
   >
          <FertilityChartCanvasOverlay
            chartRef={chartRef}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            scrollableContentHeight={scrollableContentHeight}
            padding={padding}
            graphBottomY={graphBottomY}
            allDataPoints={allDataPoints}
            tempMin={tempMin}
            tempMax={tempMax}
            tempRange={tempRange}
            getX={getX}
            getY={getY}
            responsiveFontSize={responsiveFontSize}
            visibleRange={visibleRange}
            activeIndex={activeIndex}
            showInterpretation={showInterpretation}
            interpretationSegments={interpretationSegments}
            shouldRenderBaseline={shouldRenderBaseline}
            baselineY={baselineY}
            baselineStartX={baselineStartX}
            baselineEndX={baselineEndX}
            baselineStroke={baselineStroke}
            baselineDash={baselineDash}
            baselineOpacity={baselineOpacity}
            baselineWidth={baselineWidth}
            temperatureRiseHighlightPath={temperatureRiseHighlightPath}
          />
        </div>
      )}

      {/* Contenedor principal del gráfico */}
      <motion.div
        ref={chartRef}
        className={`relative z-10 p-0 ${isFullScreen ? '' : 'rounded-2xl'} ${containerClass}`}
        style={{
        background: showCanvasOverlay ? 'transparent' : undefined,
  // Sin scroll vertical real, bloquea el pan-y para que iOS no “arrastre” la página.
  touchAction: shouldRotateStage
   ? 'pan-x pan-y'
   : (allowVerticalScroll ? 'pan-x pan-y' : 'pan-x'),
  // Evita que el scroll “salte” al body cuando llegas al borde (scroll chaining)
  overscrollBehavior: isIOSFakeLandscape ? 'none' : 'contain',
  overscrollBehaviorY: isIOSFakeLandscape ? 'none' : 'contain',
  WebkitOverflowScrolling: isIOSFakeLandscape ? 'auto' : 'touch',
  boxShadow: isFullScreen
    ? 'inset 0 1px 3px rgba(244, 114, 182, 0.1)'
    : '0 8px 32px rgba(244, 114, 182, 0.12), 0 2px 8px rgba(244, 114, 182, 0.08)',
}}
>

        {isLoading && (
          <div className="flex items-center justify-center w-full h-full text-slate-400">
            Cargando...
          </div>
        )}
        <div className="inline-block" style={{ width: chartWidth, minHeight: chartHeight }}>
            <div className="relative" style={{ width: chartWidth, height: scrollableContentHeight }}>
              {/* Leyenda izquierda mejorada */}
              {showLegend && (
                <div
                  className="absolute left-0 top-0 h-full bg-transparent pointer-events-none z-10"
                  style={{ width: padding.left }}
                >
                  <ChartLeftLegend
                    padding={padding}
                    chartHeight={scrollableContentHeight} 
                    tempMin={tempMin}
                    tempMax={tempMax}
                    tempRange={tempRange}
                    getY={getY}
                    responsiveFontSize={responsiveFontSize}
                    textRowHeight={textRowHeight}
                    isFullScreen={isFullScreen}
                    reduceMotion={effectiveReduceMotion}
                    graphBottomY={graphBottomY}
                    rowsZoneHeight={rowsZoneHeight}
                    showRelationsRow={showRelationsRow}
                  />
                </div>
              )}
              
              <motion.svg
                width={chartWidth}
                height={scrollableContentHeight}   
                className="font-sans flex-shrink-0 relative z-20"
                viewBox={`0 0 ${chartWidth} ${scrollableContentHeight}`} 
                preserveAspectRatio="xMidYMid meet"
                initial={false}
                onPointerDown={handleChartPointerDown}
                onPointerMove={handleChartPointerMove}
                onPointerUp={handleChartPointerUp}
                onPointerCancel={handleChartPointerCancel}
              >
          <defs>
            {/* Gradientes mejorados para la línea de temperatura */}
            <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={theme.svg.temperatureGradient[0]} />
              <stop offset="50%" stopColor={theme.svg.temperatureGradient[1]} />
              <stop offset="100%" stopColor={theme.svg.temperatureGradient[2]} />
            </linearGradient>
            
            <linearGradient id="tempAreaGradientChart" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={theme.svg.areaGradientTop} />
              <stop offset="100%" stopColor={theme.svg.areaGradientBottom} />
            </linearGradient>
            
            <linearGradient id={relativePhaseGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--phase-rel)" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="var(--phase-rel)"
                stopOpacity="var(--phase-rel-stop, 0.28)"
              />
            </linearGradient>
            <linearGradient id={fertilePhaseGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--phase-fertile)" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="var(--phase-fertile)"
                stopOpacity="var(--phase-fertile-stop, 0.27)"
              />
            </linearGradient>
            <linearGradient id={postPendingGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--phase-post)" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="var(--phase-post)"
                stopOpacity="var(--phase-post-stop, 0.45)"
              />
            </linearGradient>
            <linearGradient id={postAbsoluteGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--phase-post-abs)" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="var(--phase-post-abs)"
                stopOpacity="var(--phase-post-abs-stop, 0.7)"
              />
            </linearGradient>
            {/* Patrón unificado para spotting */}
            <pattern id="spotting-pattern-chart" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#ef4444" />
              <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
            </pattern>

            {/* Filtros para efectos de sombra */}
            <filter id="chartShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Filtro para el resplandor de la línea baseline */}
            <filter id="baselineGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {showInterpretation &&
            interpretationSegments.length > 0 &&
            interpretationBandTop != null &&
            interpretationBandHeight > 0 && (
              <g>
                {interpretationSegments.map((segment) => {
                  const rectY = interpretationBandTop;
                  const rectHeight = interpretationBandHeight;
                  const minFontSize = isFullScreen ? 14 : 13;
                  const fontSize = Math.max(responsiveFontSize(1.1), minFontSize);
                  const isNarrow = segment.bounds.width < 120;
                  const availableWidth = Math.max(segment.bounds.width - 16, 0);
                  const approxCharWidth = Math.max(fontSize * 0.58, 1);
                  const maxChars = Math.max(1, Math.floor(availableWidth / approxCharWidth));
                  const tooltipText = segment.tooltip ?? segment.displayLabel ?? segment.message ?? '';
                  let displayText = segment.displayLabel ?? segment.message ?? '';
                  if (isNarrow && displayText.length > maxChars) {
                    const sliceLength = Math.max(maxChars - 1, 1);
                    const truncated = displayText.slice(0, sliceLength).trimEnd();
                    displayText = `${truncated}${displayText.length > sliceLength ? '…' : ''}`;
                  }
                  const textX = isNarrow
                    ? segment.bounds.x + 8
                    : segment.bounds.x + segment.bounds.width / 2;
                  const textAnchor = isNarrow ? 'start' : 'middle';
                  const textY = rectY + rectHeight / 2;
                  const textFillColor = getSegmentTextColor(segment);
                  const handleActivate = (event) => {
                    if (typeof event?.stopPropagation === 'function') {
                      event.stopPropagation();
                    }
                    if (typeof onShowPhaseInfo === 'function') {
                      onShowPhaseInfo({
                        phase: segment.phase,
                        status: segment.status,
                        reasons: segment.reasons,
                        message: segment.message,
                        startIndex: segment.startIndex,
                        endIndex: segment.endIndex,
                        limitIndex: phaseInfoLimitIndex,
                        label: segment.displayLabel ?? segment.message ?? null,
                      });
                    }
                  };
                  const handleKeyDown = (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleActivate(event);
                    }
                  };

                  return (
                    <g key={segment.key}>
                      <text
                        x={textX}
                        y={textY}
                        fill={textFillColor}
                        fontSize={fontSize}
                        fontWeight={600}
                        dominantBaseline="middle"
                        textAnchor={textAnchor}
                        role="button"
                        aria-label={tooltipText}
                        tabIndex={0}
                        data-chart-interactive="true"
                        onClick={handleActivate}
                        onKeyDown={handleKeyDown}
                        style={{ cursor: 'pointer', userSelect: 'none', lineHeight: 1.2, textShadow: phaseTextShadow }}
                        pointerEvents="auto"
                      >
                        <title>{tooltipText}</title>
                        {displayText}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
  
          {manualModeEnabled && Number.isFinite(manualBaselineY) && (
            <g pointerEvents="none">
              {Number.isFinite(manualBaselinePlusY) && (
                <line
                  x1={baselineStartX}
                  x2={baselineEndX}
                  y1={manualBaselinePlusY}
                  y2={manualBaselinePlusY}
                  stroke="#a78bfa"
                  strokeWidth={1}
                  strokeDasharray="3 6"
                  opacity={0.38}
                />
              )}
              <line
                x1={baselineStartX}
                x2={baselineEndX}
                y1={manualBaselineY}
                y2={manualBaselineY}
                stroke="#7c3aed"
                strokeWidth={2.2}
                strokeDasharray="7 5"
                opacity={0.92}
              />
              {manualLabelPoints.map((labelPoint) => (
                <text
                  key={`manual-label-${labelPoint.index}`}
                  x={labelPoint.x}
                  y={labelPoint.y - 10}
                  textAnchor="middle"
                  fontSize={responsiveFontSize(0.78)}
                  fontWeight={700}
                  fill="#4c1d95"
                  stroke="#fff"
                  strokeWidth={1}
                  paintOrder="stroke"
                >
                  {labelPoint.value.toFixed(2)}
                </text>
              ))}
            </g>
          )}

          {/* Puntos del gráfico */}
          <ChartPoints
            data={allDataPoints}
            getX={getX}
            getY={getY}
            isFullScreen={isFullScreen}
            orientation={visualOrientation}
            responsiveFontSize={responsiveFontSize}
            onPointInteraction={handlePointInteractionSafe}
            clearActivePoint={clearActivePointSafe}
            activePoint={activePoint}
            visibleRange={visibleRange}
            padding={padding}
            chartHeight={chartHeight}
            chartWidth={chartWidth}
            temperatureField="displayTemperature"
            textRowHeight={textRowHeight}
            graphBottomY={graphBottomY}
            rowsZoneHeight={rowsZoneHeight}
            compact={false}
            reduceMotion={effectiveReduceMotion}
            isScrolling={isScrolling}
            showInterpretation={showInterpretation}
            ovulationDetails={ovulationDetails}
            baselineStartIndex={baselineStartIndex}
            firstHighIndex={firstHighIndex}
            baselineIndices={baselineIndices}
            graphBottomLift={graphBottomInset}
            showRelationsRow={showRelationsRow}
            autoLabelStep={exportMode}
            isArchivedCycle={isArchivedCycle}
            renderTemperatureLayer={false}
            manualModeEnabled={manualModeEnabled}
            manualBaselineTemp={manualBaselineTemp}
            isPointEligibleForManualMode={isPointEligibleForManualMode}
          />

        </motion.svg>
            </div>
          </div>
        {manualModeEnabled && Number.isFinite(manualBaselineY) && (
  <div className="pointer-events-none absolute inset-0 z-30">
    <div
      className="absolute flex flex-col items-center gap-1"
      style={manualHandleStyle}
    >
      <div className="rounded-full bg-violet-600/95 px-2 py-1 text-[11px] font-bold text-white shadow-md">
        {manualBaselineTemp.toFixed(2)}°
      </div>

      <button
        type="button"
        className="pointer-events-auto h-10 w-10 rounded-full border border-violet-500 bg-white text-violet-700 shadow-lg select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handleManualBaselinePointerDown}
        onPointerMove={handleManualBaselinePointerMove}
        onPointerUp={handleManualBaselinePointerUp}
        onPointerCancel={handleManualBaselinePointerCancel}
        data-chart-interactive="true"
        data-manual-baseline-interactive="true"
        aria-label="Arrastrar baseline manual"
        title="Arrastrar baseline manual"
      >
        ↕
      </button>
    </div>
  </div>
)}

        {/* Tooltip mejorado */}
        {!exportMode && activePoint && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ChartTooltip
              point={activePoint}
              position={tooltipPosition}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
              onToggleIgnore={handleToggleIgnore}
              onEdit={onEdit}
              onClose={clearActivePoint}
              onTogglePeak={onTogglePeak}
              currentPeakIsoDate={currentPeakIsoDate}
            />
          </motion.div>
        )}
      </motion.div>
      </div>
    </motion.div>
  );
};

export default FertilityChart;
