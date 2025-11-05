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
    hasTemperatureData,
  } = useFertilityChart(
    data,
    isFullScreen,
    orientation,
    onToggleIgnore,
    cycleId,
    visibleDays,
    forceLandscape
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

  const chartAreaHeight = Math.max(chartHeight - padding.top - padding.bottom, 0);
  const temperatureBelowClipId = `${uniqueId}-temperature-below`;
  const temperatureAboveClipId = `${uniqueId}-temperature-above`;
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
  const temperatureAreaPaths = useMemo(() => {
    if (!hasTemperatureData || chartAreaHeight <= 0) {
      return { below: null, above: null };
    }

    const bottomY = chartHeight - padding.bottom;
    const topY = padding.top;
    const validPoints = allDataPoints
      .map((point, index) => {
        const dataPoint = point ? validDataMap.get(point.id) : null;
        if (!dataPoint || !Number.isFinite(dataPoint.displayTemperature)) {
          return null;
        }

        return {
          index,
          x: getX(index),
          y: getY(dataPoint.displayTemperature),
        };
      })
      .filter(Boolean);

    if (!validPoints.length) {
      return { below: null, above: null };
    }

    const firstPoint = validPoints[0];
    const lastPoint = validPoints[validPoints.length - 1];
    const leftBoundary = getDayLeftEdge(firstPoint.index);
    const rightBoundary = chartWidth - padding.right;

    const extendedPoints = [...validPoints];
    if (extendedPoints[extendedPoints.length - 1].x !== rightBoundary) {
      extendedPoints.push({
        index: lastPoint.index,
        x: rightBoundary,
        y: lastPoint.y,
      });
    }

    const buildPath = (boundaryY) => {
      const commands = [
        `M ${leftBoundary} ${boundaryY}`,
        `L ${firstPoint.x} ${firstPoint.y}`,
        ...extendedPoints.slice(1).map(({ x, y }) => `L ${x} ${y}`),
        `L ${rightBoundary} ${boundaryY}`,
        'Z',
      ];

      return commands.join(' ');
    };

    return {
      below: buildPath(bottomY),
      above: buildPath(topY),
    };
  }, [
    allDataPoints,
    chartAreaHeight,
    chartHeight,
    chartWidth,
    getDayLeftEdge,
    getX,
    getY,
    hasTemperatureData,
    padding.bottom,
    padding.right,
    padding.top,
    validDataMap,
  ]);

  const temperatureInfertilityBounds = useMemo(() => {
    if (
      !showInterpretation ||
      !ovulationDetails?.confirmed ||
      temperatureInfertilityStartIndex == null ||
      chartAreaHeight <= 0
    ) {
      return null;
    }
    const inclusiveEnd = absoluteInfertilityStartIndex == null;
    const endIndex =
      absoluteInfertilityStartIndex != null
        ? absoluteInfertilityStartIndex
        : allDataPoints.length - 1;
  
    if (endIndex < temperatureInfertilityStartIndex) return null;

    return getSegmentBounds(temperatureInfertilityStartIndex, endIndex, { inclusiveEnd });
  }, [
    showInterpretation,
    ovulationDetails,
    temperatureInfertilityStartIndex,
    chartAreaHeight,
    absoluteInfertilityStartIndex,
    allDataPoints.length,
    getSegmentBounds,
  ]);

  const peakInfertilityBounds = useMemo(() => {
    if (!showInterpretation || peakInfertilityStartIndex == null || chartAreaHeight <= 0) {
      return null;
    }

    const inclusiveEnd = absoluteInfertilityStartIndex == null;
    const endIndex =
      absoluteInfertilityStartIndex != null
        ? absoluteInfertilityStartIndex
        : allDataPoints.length - 1;

    if (endIndex < peakInfertilityStartIndex) return null;

    return getSegmentBounds(peakInfertilityStartIndex, endIndex, { inclusiveEnd });
  }, [
    showInterpretation,
    peakInfertilityStartIndex,
    chartAreaHeight,
    absoluteInfertilityStartIndex,
    allDataPoints.length,
    getSegmentBounds,
  ]);

  const absoluteInfertilityBounds = useMemo(() => {
    if (
      !showInterpretation ||
      absoluteInfertilityStartIndex == null ||
      chartAreaHeight <= 0
    ) {
      return null;
    }

    return getSegmentBounds(absoluteInfertilityStartIndex, allDataPoints.length - 1);
  }, [
    showInterpretation,
    absoluteInfertilityStartIndex,
    chartAreaHeight,
    allDataPoints.length,
    getSegmentBounds,
  ]);

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

  const interpretationFeatherSize = 14;
  const horizontalMaskGradient = `linear-gradient(to right, transparent, rgba(0,0,0,0.95) ${interpretationFeatherSize}px, rgba(0,0,0,0.95) calc(100% - ${interpretationFeatherSize}px), transparent)`;
  const verticalMaskGradient = `linear-gradient(to bottom, transparent, rgba(0,0,0,0.95) ${interpretationFeatherSize}px, rgba(0,0,0,0.95) calc(100% - ${interpretationFeatherSize}px), transparent)`;
  const interpretationMaskStyle = {
    maskImage: `${horizontalMaskGradient}, ${verticalMaskGradient}`,
    maskMode: 'alpha',
    maskRepeat: 'no-repeat',
    maskSize: '100% 100%',
    maskComposite: 'intersect',
    WebkitMaskImage: `${horizontalMaskGradient}, ${verticalMaskGradient}`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    WebkitMaskComposite: 'source-in'
  };
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
            <pattern id="temperatureInfertilityPattern" patternUnits="userSpaceOnUse" width="14" height="14">
              <rect width="14" height="14" fill="rgba(191, 219, 254, 0.45)" />
              <path d="M0 0 L14 14" stroke="rgba(59, 130, 246, 0.55)" strokeWidth="1.4" />
              <path d="M14 0 L0 14" stroke="rgba(59, 130, 246, 0.55)" strokeWidth="1.4" />
            </pattern>
            <pattern id="peakInfertilityPattern" patternUnits="userSpaceOnUse" width="12" height="12">
              <rect width="12" height="12" fill="rgba(167, 243, 208, 0.42)" />
              <circle cx="3" cy="3" r="1.7" fill="rgba(13, 148, 136, 0.55)" />
              <circle cx="9" cy="9" r="1.7" fill="rgba(13, 148, 136, 0.55)" />
            </pattern>
            <pattern id="absoluteInfertilityPattern" patternUnits="userSpaceOnUse" width="16" height="16">
              <rect width="16" height="16" fill="rgba(56, 189, 248, 0.45)" />
              <path d="M0 0 L16 16" stroke="rgba(13, 148, 136, 0.6)" strokeWidth="1.2" />
              <path d="M16 0 L0 16" stroke="rgba(13, 148, 136, 0.6)" strokeWidth="1.2" />
              <circle cx="4" cy="12" r="1.6" fill="rgba(19, 78, 74, 0.6)" />
              <circle cx="12" cy="4" r="1.6" fill="rgba(19, 78, 74, 0.6)" />
            </pattern>
            {hasTemperatureData && temperatureAreaPaths.below && (
              <clipPath id={temperatureBelowClipId} clipPathUnits="userSpaceOnUse">
                <path d={temperatureAreaPaths.below} />
              </clipPath>
            )}
            {hasTemperatureData && temperatureAreaPaths.above && (
              <clipPath id={temperatureAboveClipId} clipPathUnits="userSpaceOnUse">
                <path d={temperatureAreaPaths.above} />
              </clipPath>
            )}
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
          />
          {showInterpretation && (
            <>
            {peakInfertilityBounds && (
                hasTemperatureData && temperatureAreaPaths.below ? (
                  <rect
                    x={peakInfertilityBounds.x}
                    y={padding.top}
                    width={peakInfertilityBounds.width}
                    height={chartAreaHeight}
                    fill="url(#peakInfertilityPattern)"
                    opacity={0.75}
                    pointerEvents="none"
                    clipPath={`url(#${temperatureBelowClipId})`}
                    style={interpretationMaskStyle}
                  />
                ) : (
                  <rect
                    x={peakInfertilityBounds.x}
                    y={padding.top}
                    width={peakInfertilityBounds.width}
                    height={chartAreaHeight}
                    fill="url(#peakInfertilityPattern)"
                    opacity={0.75}
                    pointerEvents="none"
                    style={interpretationMaskStyle}
                  />
                )
              )}
              {temperatureInfertilityBounds && (
                hasTemperatureData && temperatureAreaPaths.above ? (
                  <rect
                    x={temperatureInfertilityBounds.x}
                    y={padding.top}
                    width={temperatureInfertilityBounds.width}
                    height={chartAreaHeight}
                    fill="url(#temperatureInfertilityPattern)"
                    opacity={0.7}
                    pointerEvents="none"
                    clipPath={`url(#${temperatureAboveClipId})`}
                    style={interpretationMaskStyle}
                  />
                ) : (
                  <rect
                    x={temperatureInfertilityBounds.x}
                    y={padding.top}
                    width={temperatureInfertilityBounds.width}
                    height={chartAreaHeight}
                    fill="url(#temperatureInfertilityPattern)"
                    opacity={0.7}
                    pointerEvents="none"
                    style={interpretationMaskStyle}
                  />
                )
              )}
              {absoluteInfertilityBounds && (
                <rect
                  x={absoluteInfertilityBounds.x}
                  y={padding.top}
                  width={absoluteInfertilityBounds.width}
                  height={chartAreaHeight}
                  fill="url(#absoluteInfertilityPattern)"
                  opacity={0.5}
                  pointerEvents="none"
                  style={interpretationMaskStyle}
                />
              )}
            </>
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
            baselineY={chartHeight - padding.bottom}
            temperatureField="displayTemperature"
            reduceMotion={reduceMotion}
          />
          {temperatureRiseHighlightPath && (
            <path
              d={temperatureRiseHighlightPath}
              fill="none"
              stroke="#cc0e93"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
              style={{ filter: 'drop-shadow(0 2px 6px rgba(206, 14, 147, 0.4))' }}
              pointerEvents="none"
            />
          )}

          {activeIndex !== null && highlightX !== null && dayWidth > 0 && (
            <g pointerEvents="none">
              {(() => {
                const chartAreaBottomY = chartHeight - padding.bottom;
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
            compact={false}
            reduceMotion={reduceMotion}
            showInterpretation={showInterpretation}
            ovulationDetails={ovulationDetails}
            baselineStartIndex={baselineStartIndex}
            firstHighIndex={firstHighIndex}
            baselineIndices={baselineIndices}
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
