import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ChartAxes from '@/components/chartElements/ChartAxes';
import ChartLine from '@/components/chartElements/ChartLine';
import ChartPoints from '@/components/chartElements/ChartPoints';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import ChartLeftLegend from '@/components/chartElements/ChartLeftLegend';
import { useFertilityChart } from '@/hooks/useFertilityChart';
import RelationsRow from '@/components/chartElements/RelationsRow';

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
  reduceMotion = false,
  forceLandscape = false,
  currentPeakIsoDate = null,
  showRelationsRow = false,
  fertilityStartConfig = null,
  fertilityCalculatorCycles = [],
  fertilityCalculatorCandidates = null,
  onShowPhaseInfo = null,
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
    fertilityCalculatorCandidates
  );
  const uniqueIdRef = useRef(null);
  if (!uniqueIdRef.current) {
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    uniqueIdRef.current = `fertility-chart-${cycleId ?? 'default'}-${randomSuffix}`;
  }
  const uniqueId = uniqueIdRef.current;

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
  const chartHeight = dimensions.height;
  const graphBottomY = chartHeight - padding.bottom - (graphBottomInset || 0);
  const rowsZoneHeight = Math.max(chartHeight - graphBottomY, 0);
  const baselineY = baselineTemp != null ? getY(baselineTemp) : null;
  const hasPotentialRise = baselineTemp != null && Number.isFinite(firstHighIndex);
  const confirmedRise = Boolean(ovulationDetails?.confirmed);
  const shouldRenderBaseline = baselineTemp != null;

  const baselineStartX = getX(0);
  const baselineEndX =
    allDataPoints.length > 0
      ? getX(allDataPoints.length - 1)
      : chartWidth - padding.right;
  const baselineStroke = confirmedRise ? '#F59E0B' : '#94A3B8';
  const baselineDash = confirmedRise ? '6 4' : '4 4';
  const baselineOpacity = confirmedRise ? 1 : 0.7;
  const baselineWidth = 3;
  const isLoading = chartWidth === 0;
  const highlightX = activeIndex != null ? getX(activeIndex) : null;
  const prevX =
    activeIndex != null
      ? activeIndex > 0
        ? getX(activeIndex - 1)
        : highlightX
      : null;
  const nextX =
    activeIndex != null
      ? activeIndex < allDataPoints.length - 1
        ? getX(activeIndex + 1)
        : highlightX
      : null;
  const fallbackDayWidth = Math.max(
    (chartWidth - padding.left - padding.right) / Math.max(allDataPoints.length, 1),
    0
  );
  const dayWidth =
    activeIndex != null
      ? Math.max(
          ((nextX != null && prevX != null ? nextX - prevX : 0) || fallbackDayWidth),
          fallbackDayWidth,
          0
        )
      : 0;
 

  const validDataMap = useMemo(() => {
    const map = new Map();
    validDataForLine.forEach((point) => {
      if (point && point.id != null) {
        map.set(point.id, point);
      }
    });
    return map;
  }, [validDataForLine]);

  const temperatureInfertilityStartIndex = useMemo(() => {
    if (!ovulationDetails?.confirmed) return null;
    return Number.isFinite(ovulationDetails?.infertileStartIndex)
      ? ovulationDetails.infertileStartIndex
      : null;
  }, [ovulationDetails]);

  const peakInfertilityStartIndex = useMemo(() => {
    return Number.isFinite(ovulationDetails?.peakInfertilityStartIndex)
      ? ovulationDetails.peakInfertilityStartIndex
      : null;
  }, [ovulationDetails]);

  const absoluteInfertilityStartIndex = useMemo(() => {
    if (temperatureInfertilityStartIndex == null || peakInfertilityStartIndex == null) {
      return null;
    }
    return Math.max(temperatureInfertilityStartIndex, peakInfertilityStartIndex);
  }, [temperatureInfertilityStartIndex, peakInfertilityStartIndex])

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
  const interpretationBandTop =
    chartAreaHeight > 0 ? padding.top + chartAreaHeight * 0.5 : null;
  const interpretationBandHeight =
    interpretationBandTop != null
      ? Math.max(graphBottomY - interpretationBandTop, 0)
      : 0;

  const postOvulatoryPhaseInfo = useMemo(() => {
    if (!showInterpretation || !hasAnyObservation) return null;

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
      startIndex: Number.isInteger(temperatureInfertilityStartIndex)
        ? temperatureInfertilityStartIndex
        : null,
    };

    const mucusDetails = {
      peakDayIndex: Number.isInteger(ovulationDetails?.peakDayIndex)
        ? ovulationDetails.peakDayIndex
        : null,
      thirdDayIndex: Number.isInteger(ovulationDetails?.thirdDayIndex)
        ? ovulationDetails.thirdDayIndex
        : null,
      startIndex: Number.isInteger(peakInfertilityStartIndex)
        ? peakInfertilityStartIndex
        : null,
    };

    const hasTemperatureClosure = temperatureDetails.startIndex != null;
    const hasMucusClosure = mucusDetails.startIndex != null;

    if (!hasTemperatureClosure && !hasMucusClosure) {
      return null;
    }

    let startIndex = null;
    let status = 'pending';
    let message = '';
    let label = 'Infértil';
    let tooltip = 'Infértil (postovulatoria pendiente, a la espera del segundo criterio)';

    if (hasTemperatureClosure && hasMucusClosure) {
      startIndex = Math.max(temperatureDetails.startIndex, mucusDetails.startIndex);
      status = 'absolute';
      label = 'Infertilidad absoluta';
      tooltip = 'Infertilidad absoluta (postovulatoria con doble criterio alcanzado)';
      message = 'Infertilidad absoluta';
    } else if (hasTemperatureClosure) {
      startIndex = temperatureDetails.startIndex;
      const ruleLabel = temperatureDetails.rule || 'regla desconocida';
      const confirmationDay = temperatureDetails.confirmationIndex != null
        ? `D${temperatureDetails.confirmationIndex + 1}`
        : '—';
      message = `Cierre pendiente: falta moco. Temperatura con regla ${ruleLabel} confirmada en ${confirmationDay}.`;
    } else {
      startIndex = mucusDetails.startIndex;
      const mucusRuleLabel = mucusDetails.thirdDayIndex != null ? '3° día' : 'P+4';
      message = `Cierre pendiente: falta temperatura. Moco vía ${mucusRuleLabel}.`;
    }

    return {
      phase: 'postOvulatory',
      status,
      startIndex,
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
    temperatureInfertilityStartIndex,
    peakInfertilityStartIndex,
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

    const hasFertileStart = Number.isInteger(fertileStartFinalIndex);
const hasPostPhase = Number.isFinite(postOvulatoryPhaseInfo?.startIndex);

// Mientras NO haya ni inicio fértil (CPM / T-8 / perfiles / marcador)
// ni fase postovulatoria, todo lo registrado se considera
// fase relativamente infértil (preovulatoria).
if (!hasFertileStart && !hasPostPhase) {
  const bounds = getSegmentBounds(0, lastIndex);
  if (bounds) {
    segments.push({
      key: 'relative-default',
      phase: 'relativeInfertile',
      status: 'default',
      bounds,
      startIndex: 0,
      endIndex: lastIndex,
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


    if (hasFertileStart && fertileStartFinalIndex > 0) {
      const endIndex = Math.min(fertileStartFinalIndex - 1, lastIndex);
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

    if (fertileEndIndex >= fertileStartIndex) {
      const bounds = getSegmentBounds(fertileStartIndex, fertileEndIndex);
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
          endIndex: fertileEndIndex,
          displayLabel: 'Fértil',
          tooltip: 'Fértil',
          message: 'Fértil',
          reasons: {
            type: 'fertile',
            startIndex: fertileStartIndex,
            endIndex: fertileEndIndex,
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
      const bounds = getSegmentBounds(
        postOvulatoryPhaseInfo.startIndex,
        lastIndex
      );
      if (bounds) {
        segments.push({
          key: 'post',
          phase: postOvulatoryPhaseInfo.phase,
          status: postOvulatoryPhaseInfo.status,
          bounds,
          startIndex: postOvulatoryPhaseInfo.startIndex,
          endIndex: lastIndex,
          displayLabel: postOvulatoryPhaseInfo.label,
          tooltip: postOvulatoryPhaseInfo.tooltip,
          message: postOvulatoryPhaseInfo.message,
          reasons: postOvulatoryPhaseInfo.reasons,
        });
      }
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
  const [viewport, setViewport] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 0, h: typeof window !== 'undefined' ? window.innerHeight : 0 });
  const isViewportPortrait = viewport.w < viewport.h;

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const dayWidth = chartRef.current.clientWidth / visibleDays;
    chartRef.current.scrollLeft = Math.max(0, dayWidth * initialScrollIndex);
  }, [initialScrollIndex, visibleDays, dimensions.width, orientation]);

   const applyRotation = forceLandscape && isViewportPortrait;

  // Clase del contenedor de scroll ajustada para rotación artificial
  const rotatedContainer = applyRotation;
  const baseFullClass = 'w-full h-full bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100';
  const containerClass = isFullScreen
    ? `${baseFullClass} min-h-full ${rotatedContainer ? 'overflow-y-auto overflow-x-hidden' : 'overflow-x-auto overflow-y-visible'}`
    : `${baseFullClass} overflow-x-auto overflow-y-visible border border-pink-100/50`;
  const showLegend = !isFullScreen || orientation === 'portrait';

  return (
      <motion.div className="relative w-full h-full" initial={false}>
      

      {/* Contenedor principal del gráfico */}
      <motion.div
        ref={chartRef}
        className={`relative p-0 ${isFullScreen ? '' : 'rounded-2xl'} ${containerClass}`}
        style={{
          touchAction: 'auto',
          boxShadow: isFullScreen
            ? 'inset 0 1px 3px rgba(244, 114, 182, 0.1)'
            : '0 8px 32px rgba(244, 114, 182, 0.12), 0 2px 8px rgba(244, 114, 182, 0.08)',
          ...(applyRotation
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${viewport.h}px`,
                height: `${viewport.w}px`,
                transform: 'rotate(90deg) translateY(-100%)',
                transformOrigin: 'top left'
              }
            : {})
        }}
        initial={false}
      >
        {isLoading && (
          <div className="flex items-center justify-center w-full h-full text-slate-400">
            Cargando...
          </div>
        )}
        <div className="inline-block" style={{ width: chartWidth, height: chartHeight }}>
          {/* Leyenda izquierda mejorada */}
      {showLegend && (
        <div
          className="absolute left-0 top-0 h-full bg-transparent pointer-events-none z-10"
          style={{ width: padding.left }}
        >
          <ChartLeftLegend
            padding={padding}
            chartHeight={chartHeight}
            tempMin={tempMin}
            tempMax={tempMax}
            tempRange={tempRange}
            getY={getY}
            responsiveFontSize={responsiveFontSize}
            textRowHeight={textRowHeight}
            isFullScreen={isFullScreen}
            graphBottomY={graphBottomY}
            rowsZoneHeight={rowsZoneHeight}
          />
        </div>
      )}
        <motion.svg
          width={chartWidth}
          height={chartHeight}
          className="font-sans flex-shrink-0"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          initial={false}
        >
          <defs>
            {/* Gradientes mejorados para la línea de temperatura */}
            <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F472B6" />
              <stop offset="50%" stopColor="#EC4899" />
              <stop offset="100%" stopColor="#E91E63" />
            </linearGradient>
            
            <linearGradient id="tempAreaGradientChart" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(244, 114, 182, 0.18)" />
              <stop offset="100%" stopColor="rgba(244, 114, 182, 0.02)" />
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

          {/* Fondo transparente para interacciones */}
          <rect width="100%" height="100%" fill="transparent" />

          {/* Ejes del gráfico */}
          <ChartAxes
            padding={padding}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            tempMin={tempMin}
            tempMax={tempMax}
            tempRange={tempRange}
            getY={getY}
            getX={getX}
            allDataPoints={allDataPoints}
            responsiveFontSize={responsiveFontSize}
            isFullScreen={isFullScreen}
            showLeftLabels={!showLegend}
            reduceMotion={reduceMotion}
            graphBottomY={graphBottomY}
            chartAreaHeight={Math.max(chartHeight - padding.top - padding.bottom - (graphBottomInset || 0), 0)}
            rowsZoneHeight={rowsZoneHeight}
          />
          {showInterpretation &&
            interpretationSegments.length > 0 &&
            interpretationBandTop != null &&
            interpretationBandHeight > 0 && (
              <g>
                {interpretationSegments.map((segment) => {
                  const rectY = interpretationBandTop;
                  const rectHeight = interpretationBandHeight;
                  const backgroundFill = (() => {
                  // Postovulatoria
                  if (segment.phase === 'postOvulatory') {
                    return segment.status === 'pending'
                      ? `url(#${postPendingGradientId})`
                      : `url(#${postAbsoluteGradientId})`;
                  }

                  // Relativamente infértil (tanto el segmento "relative" como el "relative-default")
                  if (segment.phase === 'relativeInfertile') {
                    return `url(#${relativePhaseGradientId})`;
                  }

                  // Fértil
                  if (segment.phase === 'fertile') {
                    return `url(#${fertilePhaseGradientId})`;
                  }

                  // Nodata u otros → gris suave
                  if (segment.phase === 'nodata') {
                    return 'rgba(203, 213, 225, 0.2)';
                  }

                  // Fallback: trata cualquier cosa rara como fértil
                  return `url(#${fertilePhaseGradientId})`;
                })();

                const rectFill = backgroundFill;

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
                      <rect
                        x={segment.bounds.x}
                        y={rectY}
                        width={segment.bounds.width}
                        height={rectHeight}
                        fill={rectFill}
                        pointerEvents="none"
                      />
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
            {/* Línea baseline mejorada */}
          {showInterpretation && shouldRenderBaseline && baselineY !== null && (
            reduceMotion ? (
              
              <line
                x1={baselineStartX}
                y1={baselineY}
                x2={baselineEndX}
                y2={baselineY}
                stroke={baselineStroke}
                strokeWidth={baselineWidth}
                strokeDasharray={baselineDash}
                opacity={baselineOpacity}
              />
            ) : (
            <motion.path
                d={`M ${baselineStartX} ${baselineY} L ${baselineEndX} ${baselineY}`}
                stroke={baselineStroke}
                strokeWidth={baselineWidth}
                strokeDasharray={baselineDash}
                opacity={baselineOpacity}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: baselineOpacity }}
                transition={{ duration: 4, ease: 'easeInOut', delay: 0.5 }}
              />
            )
          )}
          {/* Línea de temperatura */}
          <ChartLine
            data={validDataForLine}
            allDataPoints={allDataPoints}
            getX={getX}
            getY={getY}
            baselineY={graphBottomY}
            temperatureField="displayTemperature"
            reduceMotion={reduceMotion}
          />
          {temperatureRiseHighlightPath && (
            <g pointerEvents="none">

              {/* Línea principal */}
              <path
                d={temperatureRiseHighlightPath}
                fill="none"
                stroke="#cc0e93"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            </g>
          )}

          {activeIndex !== null && highlightX !== null && dayWidth > 0 && (
            <g pointerEvents="none">
              {(() => {
                const chartAreaBottomY = graphBottomY;
                const thinStrokeWidth = Math.max(3, Math.min(14, dayWidth * 0.4));
                const thickStrokeWidth = Math.max(thinStrokeWidth * 2, textRowHeight * 0.85);

                return (
                  <>
                    <line
                      x1={highlightX}
                      y1={0}
                      x2={highlightX}
                      y2={chartAreaBottomY}
                      stroke="rgba(235, 171, 204,0.15)"
                      strokeWidth={thinStrokeWidth}                      
                    />
                    <line
                      x1={highlightX}
                      y1={chartAreaBottomY}
                      x2={highlightX}
                      y2={chartHeight}
                      stroke="rgba(235, 171, 204,0.15)"
                      strokeWidth={thickStrokeWidth}                      
                    />
                  </>
                );
              })()}
            </g>
          )}

          {/* Puntos del gráfico */}
          <ChartPoints
            data={allDataPoints}
            getX={getX}
            getY={getY}
            isFullScreen={isFullScreen}
            orientation={orientation}
            responsiveFontSize={responsiveFontSize}
            onPointInteraction={handlePointInteraction}
            clearActivePoint={clearActivePoint}
            activePoint={activePoint}
            padding={padding}
            chartHeight={chartHeight}
            chartWidth={chartWidth}
            temperatureField="displayTemperature"
            textRowHeight={textRowHeight}
            graphBottomY={graphBottomY}
            rowsZoneHeight={rowsZoneHeight}
            compact={false}
            reduceMotion={reduceMotion}
            showInterpretation={showInterpretation}
            ovulationDetails={ovulationDetails}
            baselineStartIndex={baselineStartIndex}
            firstHighIndex={firstHighIndex}
            baselineIndices={baselineIndices}
            graphBottomLift={graphBottomInset}
          />

        </motion.svg>
        </div>

        {showRelationsRow && (
          <RelationsRow
            allDataPoints={allDataPoints}
            getX={getX}
            padding={padding}
            chartWidth={chartWidth}
            textRowHeight={textRowHeight}
            isFullScreen={isFullScreen}
            responsiveFontSize={responsiveFontSize}
          />
        )}

        {/* Tooltip mejorado */}
        {activePoint && (
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
    </motion.div>
  );
};

export default FertilityChart;
