import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';

    const DEFAULT_TEMP_MIN = 35.5;
    const DEFAULT_TEMP_MAX = 37.5;

export const useFertilityChart = (
  data,
  isFullScreen,
  orientation,
  onToggleIgnore,
  cycleId,
  visibleDays = 5,
  forceLandscape = false
) => {
      const chartRef = useRef(null);
      const tooltipRef = useRef(null);
      const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
      const [activePoint, setActivePoint] = useState(null);
      const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

      const processedData = useMemo(() => {
        return data.map(d => {
          const t = d.temperature_chart == null
            ? null
            : parseFloat(String(d.temperature_chart).replace(',', '.'));
          return {
            ...d,
            displayTemperature: isNaN(t) ? null : t
          };
        });
      }, [data]);

      useLayoutEffect(() => {
        const updateDimensions = () => {
          if (!chartRef.current) return;

          const parentEl = chartRef.current.parentElement || chartRef.current;
          let parentW = parentEl.clientWidth || 600;
          let parentH = parentEl.clientHeight || 400;
          let containerWidth = chartRef.current.clientWidth > 0 ? chartRef.current.clientWidth : parentW;
          let newWidth;
          let newHeight;

          if (isFullScreen) {
            let availW = window.innerWidth;
            let availH = window.innerHeight;

            if (forceLandscape && availH > availW) {
              [availW, availH] = [availH, availW];
            }

            containerWidth = availW;
            if (orientation === 'portrait' && !forceLandscape) {
              const legendSpace = Math.max(30, availW * 0.05);
              const perDayWidth = (availW - legendSpace) / visibleDays;
              newWidth = perDayWidth * data.length;

            } else {
              const perDayWidth = availW / visibleDays;
              newWidth = perDayWidth * data.length;
            }
            newHeight = availH;
          } else {
            const perDayWidth = containerWidth / visibleDays;
            newWidth = perDayWidth * data.length;
            newHeight = parentH;
          }
          
          setDimensions({ width: newWidth, height: newHeight });
        };

        updateDimensions(); 
        window.addEventListener('resize', updateDimensions);
        
        let resizeObserver;
        if (chartRef.current) {
          const targetEl = chartRef.current.parentElement || chartRef.current;
          resizeObserver = new ResizeObserver(updateDimensions);
          resizeObserver.observe(targetEl);
        }
        
        return () => {
          window.removeEventListener('resize', updateDimensions);
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
        };
      }, [isFullScreen, data.length, visibleDays, orientation, forceLandscape]);

  const validDataForLine = useMemo(() => processedData.filter(d => d && d.isoDate && !d.ignored && d.displayTemperature !== null && d.displayTemperature !== undefined), [processedData]);
  const allDataPoints = useMemo(() => processedData.filter(d => d && d.isoDate), [processedData]);

  const { baselineTemp, baselineStartIndex } = useMemo(() => {
    const isValid = (p) => p && p.displayTemperature != null && !p.ignored;
    for (let i = 0; i < processedData.length; i++) {
      const current = processedData[i];
      if (!isValid(current)) continue;
      const prev = [];
      let highestPrevTemp = null;
      let highestPrevIndex = null;
      for (let j = i - 1; j >= 0 && prev.length < 6; j--) {
        const candidate = processedData[j];
        if (isValid(candidate)) {
          prev.unshift({ index: j, temp: candidate.displayTemperature });
          if (
            highestPrevTemp === null ||
            candidate.displayTemperature > highestPrevTemp
          ) {
            highestPrevTemp = candidate.displayTemperature;
            highestPrevIndex = j;
          }
        }
      }
      if (prev.length < 6) continue;
      if (
        highestPrevTemp === null ||
        !Number.isFinite(highestPrevTemp) ||
        highestPrevIndex === null ||
        !Number.isFinite(highestPrevIndex)
      ) {
        continue;
      }
      if (current.displayTemperature > highestPrevTemp) {
        return {
          baselineTemp: highestPrevTemp,
          baselineStartIndex: highestPrevIndex
        };
      }
    }
    return { baselineTemp: null, baselineStartIndex: null };
  }, [processedData]);

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
      
      const baseFontSize = 9;
      const responsiveFontSize = (multiplier = 1) => {
        if (!isFullScreen) return baseFontSize * multiplier;
        const smallerDim = Math.min(chartWidth, chartHeight);
        return Math.max(8, Math.min(baseFontSize * multiplier, smallerDim / (allDataPoints.length > 0 ? (40 / multiplier) : 40) ));
      };

      // In pantalla completa damos un poco más de altura a cada
      // fila de texto para permitir mostrar palabras más largas
      // en orientación vertical.
      const textRowHeight = responsiveFontSize(isFullScreen ? 1.6 : 2.5);
      const isLandscapeVisual = forceLandscape || orientation === 'landscape';
      // En horizontal mostramos todas las filas (sensación, apariencia y observaciones)
      // por lo que reservamos más altura bajo la gráfica. Mantenemos portrait como estaba.
      const numTextRowsBelowChart = isLandscapeVisual ? 9 : 5; 
      const totalTextRowsHeight = textRowHeight * numTextRowsBelowChart;

      const padding = { 
        top: isFullScreen ? Math.max(isLandscapeVisual ? 6 : 12, chartHeight * (isLandscapeVisual ? 0.015 : 0.03)) : 12, 
        right: isFullScreen ? Math.max(isLandscapeVisual ? 35 : 30, chartWidth * (isLandscapeVisual ? 0.02 : 0.05)) : 50, 
        bottom: (isFullScreen ? Math.max(isLandscapeVisual ? 0 : 40, chartHeight * (isLandscapeVisual ? 0 : 0.11)) : 60) + totalTextRowsHeight + 25, 
        left: isFullScreen ? Math.max(isLandscapeVisual ? 45 : 20, chartWidth * (isLandscapeVisual ? 0.02 : 0.05)) : 50
      };
      
      const getY = (temp) => {
        if (temp === null || temp === undefined || tempRange === 0) return chartHeight - padding.bottom; 
        const graphHeight = chartHeight - padding.top - padding.bottom;
        if (graphHeight <=0) return chartHeight - padding.bottom;
        return chartHeight - padding.bottom - ((temp - tempMin) / tempRange) * graphHeight;
      };

      const getX = (index) => {
        const extraMargin = (isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 5 : 10;
        const daySpacing = (isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 25 : 0;
        const availableWidth = chartWidth - padding.left - padding.right - extraMargin - daySpacing * (allDataPoints.length - 1);
        if (availableWidth <= 0) return padding.left + extraMargin + daySpacing * index;
        const pointsToDisplay = allDataPoints.length > 1 ? allDataPoints.length - 1 : 1;
        if (pointsToDisplay === 0 || allDataPoints.length === 0) return padding.left + extraMargin + daySpacing * index;
        return padding.left + extraMargin + index * (availableWidth / (allDataPoints.length === 1 ? 1 : pointsToDisplay)) + daySpacing * index;
      };
      
const handlePointInteraction = (point, index, event) => {

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
    clientX: clientX - chartRect.left + chartRef.current.scrollLeft,
    clientY: clientY - chartRect.top + chartRef.current.scrollTop
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
          onToggleIgnore(cycleId, recordId);
          setActivePoint(null);
        }
      };

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
        baselineTemp,
        baselineStartIndex,
      };
    };
