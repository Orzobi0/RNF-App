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
  cycleId,
  initialScrollIndex = 0,
  visibleDays = 5
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
      } = useFertilityChart(data, isFullScreen, onToggleIgnore, cycleId, visibleDays);

      if (!allDataPoints || allDataPoints.length === 0) {
        return <div className="text-center text-slate-400 p-8">No hay datos para mostrar en el gráfico.</div>;
      }
      
      const chartWidth = dimensions.width;
      const chartHeight = dimensions.height;

      const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.05, delayChildren: 0.2 }
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
              className="absolute left-0 top-0 h-full bg-slate-800 pointer-events-none z-10"
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
            className={`relative p-0 rounded-lg shadow-inner ${isFullScreen ? 'w-full h-full bg-slate-900 flex items-center justify-center' : 'bg-slate-800 overflow-x-auto overflow-y-hidden'}`}
          >
          <motion.svg
            width={chartWidth}
            height={chartHeight}
            className="font-sans"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <defs>
              <linearGradient id="tempLineGradientChart" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <pattern id="spotting-pattern-chart" patternUnits="userSpaceOnUse" width="6" height="6">
                <circle cx="3" cy="3" r="1.5" fill="rgba(239, 68, 68, 0.7)" />
              </pattern>
            </defs>

            <ChartAxes
              padding={padding}
              chartWidth={chartWidth}
              chartHeight={chartHeight}
              tempMin={tempMin}
              tempMax={tempMax}
              tempRange={tempRange}
              getY={getY}
              responsiveFontSize={responsiveFontSize}
              isFullScreen={isFullScreen}
            />
            
            <ChartLine
              data={validDataForLine}
              allDataPoints={allDataPoints} 
              getX={getX}
              getY={getY}
              temperatureField="displayTemperature" 
            />

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
      onClose={clearActivePoint}
    />
  </div>
)}
          </div>
        </div>
      );
    };

    export default FertilityChart;