import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ChartAxes from '@/components/chartElements/ChartAxes';
import ChartLine from '@/components/chartElements/ChartLine';
import ChartPoints from '@/components/chartElements/ChartPoints';
import ChartTooltip from '@/components/chartElements/ChartTooltip';
import ChartLeftLegend from '@/components/chartElements/ChartLeftLegend';
import { useFertilityChart } from '@/hooks/useFertilityChart';

const FertilityChart = ({
  data,
  isFullScreen,
  orientation,
  onToggleIgnore,
  onEdit,
  cycleId,
  initialScrollIndex = 0,
  visibleDays = 5,
  showInterpretation = false,
  reduceMotion = false,
  forceLandscape = false
}) => {
  const {
    chartRef,
    tooltipRef,
    dimensions,
    activePoint,
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
    setActivePoint,
    baselineTemp,
    baselineStartIndex,
  } = useFertilityChart(data, isFullScreen, orientation, onToggleIgnore, cycleId, visibleDays, forceLandscape);

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
  const canRenderBaseline = baselineTemp != null && Number.isFinite(baselineStartIndex);
  const baselineStartX = getX(0);
  const isLoading = chartWidth === 0;
  

  
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
    ? `${baseFullClass} min-h-full ${rotatedContainer ? 'flex items-stretch justify-start overflow-y-auto overflow-x-hidden' : 'flex items-center justify-start overflow-x-auto overflow-y-hidden'}`
    : `${baseFullClass} overflow-x-auto overflow-y-hidden border border-pink-100/50`;
  const showLegend = !isFullScreen || orientation === 'portrait';
  return (
      <motion.div className="relative w-full h-full" initial={false}>
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

      {/* Contenedor principal del gráfico */}
      <motion.div
        ref={chartRef}
        className={`relative p-0 ${isFullScreen ? '' : 'rounded-2xl'} ${containerClass}`}
        style={{
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
              <stop offset="0%" stopColor="rgba(244,114,182,0.25)" />
              <stop offset="50%" stopColor="rgba(236,72,153,0.15)" />
              <stop offset="100%" stopColor="rgba(233,30,99,0.05)" />
            </linearGradient>

            {/* Patrón unificado para spotting */}
            <pattern id="spotting-pattern-chart" patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill="#f3f4f6" />
              <circle cx="3" cy="3" r="1.5" fill="rgba(239,68,68,0.7)" />
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
          />
                   {/* Línea baseline mejorada */}
          {showInterpretation && canRenderBaseline && (            
            (reduceMotion ? (
              
              <line
                x1={baselineStartX}
                y1={baselineY}
                x2={chartWidth - padding.right}
                y2={baselineY}
                stroke="#F59E0B"
                strokeWidth={3}
                strokeDasharray="6 4"
              />
            ) : (
            <motion.path
                d={`M ${baselineStartX} ${baselineY} L ${chartWidth - padding.right} ${baselineY}`}
                stroke="#F59E0B"
                strokeWidth={3}
                strokeDasharray="6 4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 4, ease: "easeInOut", delay: 0.5 }}
/>
            ))
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
          />
 
        </motion.svg>

        {/* Tooltip mejorado */}
        {activePoint && (
          <motion.div 
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ChartTooltip
              point={activePoint}
              position={tooltipPosition}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
              onToggleIgnore={handleToggleIgnore}
              onEdit={onEdit}
              onClose={clearActivePoint}
            />
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default FertilityChart;
