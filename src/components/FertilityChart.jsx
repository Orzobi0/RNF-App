import React, { useEffect } from 'react';
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
  onToggleIgnore,
  onEdit,
  cycleId,
  initialScrollIndex = 0,
  visibleDays = 5,
  showInterpretation = false
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
      } = useFertilityChart(data, isFullScreen, onToggleIgnore, cycleId, visibleDays);

      if (!allDataPoints || allDataPoints.length === 0) {
        return <div className="text-center text-slate-400 p-8">No hay datos para mostrar en el gráfico.</div>;
      }
      
      const chartWidth = dimensions.width;
      const chartHeight = dimensions.height;
      const baselineY = baselineTemp != null ? getY(baselineTemp) : null;
      const baselineStartX = baselineTemp != null ? getX(baselineStartIndex) : null;

      const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.2 }
        }
      };
  useEffect(() => {
        if (isFullScreen || !chartRef.current) return;
        const dayWidth = chartRef.current.clientWidth / visibleDays;
        chartRef.current.scrollLeft = Math.max(0, dayWidth * initialScrollIndex);
      }, [isFullScreen, initialScrollIndex, visibleDays, dimensions.width]);


      return (
        <div className="relative">
          {!isFullScreen && (
            <div
              className="absolute left-0 top-0 h-full bg-[#F4F6F8] pointer-events-none z-10"
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
          <div
            ref={chartRef}
            className={`relative p-0 rounded-xl ${isFullScreen ? 'w-full h-full bg-white flex items-center justify-center overflow-x-auto overflow-y-hidden' : 'bg-white overflow-x-auto overflow-y-hidden'}`}
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}
          >
          <motion.svg
            width={chartWidth}
            height={chartHeight}
            className="font-sans flex-shrink-0"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <defs>
        
              <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
              <linearGradient id="tempAreaGradientChart" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(244,114,182,0.15)" />
                <stop offset="100%" stopColor="rgba(217,70,239,0)" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="transparent" />

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
            />
            
            <ChartLine
              data={validDataForLine}
              allDataPoints={allDataPoints}
              getX={getX}
              getY={getY}
              baselineY={chartHeight - padding.bottom}
              temperatureField="displayTemperature"
            />
            {showInterpretation && baselineTemp != null && (
              <line
                x1={baselineStartX}
                y1={baselineY}
                x2={chartWidth - padding.right}
                y2={baselineY}
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}

            <ChartPoints
              data={allDataPoints}
              getX={getX}
              getY={getY}
              isFullScreen={isFullScreen}
              responsiveFontSize={responsiveFontSize}
              onPointInteraction={handlePointInteraction}
              clearActivePoint={clearActivePoint}
              activePoint={activePoint}
              padding={padding}
              chartHeight={chartHeight}
              chartWidth={chartWidth}
              temperatureField="displayTemperature"
            textRowHeight={textRowHeight}
          />
          </motion.svg>
{activePoint && (
  <div ref={tooltipRef}>
      <ChartTooltip
        point={activePoint}
        position={tooltipPosition}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        onToggleIgnore={handleToggleIgnore}
        onEdit={onEdit}
        onClose={clearActivePoint}
      />
  </div>
)}
          </div>
        </div>
      );
    };

export default FertilityChart;