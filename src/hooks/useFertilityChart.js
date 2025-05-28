import { useEffect, useRef, useState, useMemo } from 'react';

    const DEFAULT_TEMP_MIN = 35.0;
    const DEFAULT_TEMP_MAX = 37.5;

    export const useFertilityChart = (data, isFullScreen, onToggleIgnore, cycleId) => {
      const chartRef = useRef(null);
      const tooltipRef = useRef(null);
      const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
      const [activePoint, setActivePoint] = useState(null);
      const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

      const processedData = useMemo(() => {
        return data.map(d => ({
          ...d,
          displayTemperature: d.temperature_chart 
        }));
      }, [data]);

      useEffect(() => {
        const updateDimensions = () => {
          if (chartRef.current) {
            let newWidth = chartRef.current.clientWidth;
            let newHeight = chartRef.current.clientHeight;

            if (isFullScreen) {
              newWidth = window.innerWidth;
              newHeight = window.innerHeight;
            } else {
              newWidth = chartRef.current.clientWidth > 0 ? chartRef.current.clientWidth : 600;
              newHeight = 450; 
            }
            setDimensions({ width: newWidth, height: newHeight });
          }
        };

        updateDimensions(); 
        window.addEventListener('resize', updateDimensions);
        
        let resizeObserver;
        if (isFullScreen && chartRef.current) {
          resizeObserver = new ResizeObserver(updateDimensions);
          resizeObserver.observe(document.documentElement); 
        }
        
        return () => {
          window.removeEventListener('resize', updateDimensions);
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
        };
      }, [isFullScreen]);

      const validDataForLine = useMemo(() => processedData.filter(d => d && d.isoDate && !d.ignored && d.displayTemperature !== null && d.displayTemperature !== undefined), [processedData]);
      const allDataPoints = useMemo(() => processedData.filter(d => d && d.isoDate), [processedData]);

      const { tempMin, tempMax } = useMemo(() => {
        const recordedTemps = validDataForLine.map(d => d.displayTemperature).filter(t => t !== null && t !== undefined);
        if (recordedTemps.length === 0) {
          return { tempMin: DEFAULT_TEMP_MIN, tempMax: DEFAULT_TEMP_MAX };
        }
        let min = Math.min(...recordedTemps, DEFAULT_TEMP_MIN);
        let max = Math.max(...recordedTemps, DEFAULT_TEMP_MAX);

        min = Math.floor(min * 2) / 2; 
        max = Math.ceil(max * 2) / 2; 

        if (max - min < 2.0) {
          const mid = (min + max) / 2;
          min = mid - 1.0;
          max = mid + 1.0;
        }
        
        return { tempMin: min, tempMax: max };
      }, [validDataForLine]);
      
      const tempRange = tempMax - tempMin;
      
      const chartWidth = dimensions.width;
      const chartHeight = dimensions.height;
      
      const baseFontSize = 10;
      const responsiveFontSize = (multiplier = 1) => {
        if (!isFullScreen) return baseFontSize * multiplier;
        const smallerDim = Math.min(chartWidth, chartHeight);
        return Math.max(8, Math.min(baseFontSize * multiplier, smallerDim / (allDataPoints.length > 0 ? (40 / multiplier) : 40) ));
      };

      const textRowHeight = responsiveFontSize(isFullScreen ? 1.5 : 1.8); 
      const numTextRowsBelowChart = 5; 
      const totalTextRowsHeight = textRowHeight * numTextRowsBelowChart;

      const padding = { 
        top: isFullScreen ? Math.max(20, chartHeight * 0.1) : 30, 
        right: isFullScreen ? Math.max(30, chartWidth * 0.05) : 50, 
        bottom: (isFullScreen ? Math.max(60, chartHeight * 0.20) : 60) + totalTextRowsHeight, 
        left: isFullScreen ? Math.max(30, chartWidth * 0.05) : 50
      };
      
      const getY = (temp) => {
        if (temp === null || temp === undefined || tempRange === 0) return chartHeight - padding.bottom; 
        const graphHeight = chartHeight - padding.top - padding.bottom;
        if (graphHeight <=0) return chartHeight - padding.bottom;
        return chartHeight - padding.bottom - ((temp - tempMin) / tempRange) * graphHeight;
      };

      const getX = (index) => {
        const availableWidth = chartWidth - padding.left - padding.right;
        if (availableWidth <= 0) return padding.left;
        const pointsToDisplay = allDataPoints.length > 1 ? allDataPoints.length -1 : 1;
        if (pointsToDisplay === 0 || allDataPoints.length === 0) return padding.left;
        return padding.left + index * (availableWidth / (allDataPoints.length === 1 ? 1 : pointsToDisplay));
      };
      
const handlePointInteraction = (point, index, event) => {
  console.log('▶️ handlePointInteraction:', point, index);
  // Si no es un registro real, simplemente limpiamos y salimos
  if (!point || String(point.id).startsWith('placeholder-')) {
    clearActivePoint();
    return;
  }

  // 1) Calcula la posición del ratón/tap
  const chartRect = chartRef.current.getBoundingClientRect();
  let clientX, clientY;
  if (event.type.startsWith('touch')) {
    const touch = event.changedTouches[0];
    clientX = touch.clientX; clientY = touch.clientY;
  } else {
    clientX = event.clientX;    clientY = event.clientY;
  }

  // 2) Mapea a coordenadas SVG
  const svgX = getX(index);
  const svgY = getY(point.displayTemperature);

  // 3) Fija posición y punto activo
  setTooltipPosition({
    svgX,
    svgY,
    clientX: clientX - chartRect.left,
    clientY: clientY - chartRect.top
  });
  setActivePoint(point);
};

      
      useEffect(() => {
        const handleClickOutside = (event) => {
          if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
             const chartPoints = chartRef.current?.querySelectorAll('circle, text, rect');
             let isPointClick = false;
             if(chartPoints){
                for(let pointEl of chartPoints){
                    if(pointEl.contains(event.target)){
                        isPointClick = true;
                        break;
                    }
                }
             }
            if(!isPointClick) setActivePoint(null);
          }
        };
    
        if (activePoint) {
          document.addEventListener('mousedown', handleClickOutside);
          document.addEventListener('touchstart', handleClickOutside);
        }
    
        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
          document.removeEventListener('touchstart', handleClickOutside);
        };
      }, [activePoint]);

        const clearActivePoint = () => {
          setActivePoint(null);
          
        }
          const handleToggleIgnore = (recordId) => {
        if (onToggleIgnore && recordId) {
          onToggleIgnore(recordId, cycleId);
        }
      }

      return {
        chartRef,
        tooltipRef,
        dimensions, 
        activePoint,
        tooltipPosition,
        processedData,
        validDataForLine,
        allDataPoints,
        tempMin,
        tempMax,
        tempRange,
        padding,
        textRowHeight,
        setActivePoint,
        getY,
        getX,
        handlePointInteraction,
        clearActivePoint,
        handleToggleIgnore,
        responsiveFontSize,
      };
    };