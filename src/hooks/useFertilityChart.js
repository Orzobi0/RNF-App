import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import computePeakStatuses from '@/lib/computePeakStatuses';

const DEFAULT_TEMP_MIN = 35.5;
const DEFAULT_TEMP_MAX = 37.5;

export const computeOvulationMetrics = (processedData = []) => {
  const isValid = (p) => p && p.displayTemperature != null && !p.ignored;
  const windowSize = 6;
  const borderlineTolerance = 0.05;

  const getBaselineInfo = (entries) => {
    if (!entries || entries.length !== windowSize) return null;
    const temps = entries.map((entry) => entry.temp);
    if (temps.some((value) => !Number.isFinite(value))) return null;

    const maxTemp = temps.reduce(
      (max, current) => (current > max ? current : max),
      temps[0]
    );
    const borderlineCount = temps.reduce((count, current) => {
      if (current >= maxTemp - borderlineTolerance && current < maxTemp) {
        return count + 1;
      }
      return count;
    }, 0);

    if (borderlineCount >= 2) {
      return null;
    }

    return {
      baselineTemp: maxTemp,
      baselineStartIndex: entries[0].index,
      baselineBorderlineCount: borderlineCount,
    };
  };

  const findBaselineFromIndex = (startIndex) => {
    const slidingWindow = [];

    for (let idx = startIndex; idx < processedData.length; idx += 1) {
      const candidate = processedData[idx];
      if (!isValid(candidate)) {
        continue;
      }

      const temperature = candidate.displayTemperature;
      if (!Number.isFinite(temperature)) {
        continue;
      }

      slidingWindow.push({ index: idx, temp: temperature });
      if (slidingWindow.length > windowSize) {
        slidingWindow.shift();
      }
    

      if (slidingWindow.length === windowSize) {
        const baselineInfo = getBaselineInfo(slidingWindow);
        if (!baselineInfo) {
          continue;
        }

        let firstHighIndex = null;
        for (let j = idx + 1; j < processedData.length; j += 1) {
          const potentialHigh = processedData[j];
          if (!isValid(potentialHigh)) {
            continue;
          }
          const potentialTemp = potentialHigh.displayTemperature;
          if (!Number.isFinite(potentialTemp)) {
            continue;
          }
          if (potentialTemp > baselineInfo.baselineTemp) {
            firstHighIndex = j;
            break;
          }
        }

        return {
          baselineTemp: baselineInfo.baselineTemp,
          baselineStartIndex: baselineInfo.baselineStartIndex,
          baselineBorderlineCount: baselineInfo.baselineBorderlineCount,
          firstHighIndex,
        };
      }
    }
      return null;
  };

  const emptyDetails = {
    confirmed: false,
    confirmationIndex: null,
    infertileStartIndex: null,
    rule: null,
    highSequenceIndices: [],
    ovulationIndex: null,
  };

  let baselineTemp = null;
  let baselineStartIndex = null;
  let firstHighIndex = null;
  let baselineBorderlineCount = null;

  let confirmedDetails = emptyDetails;
  let searchStartIndex = 0;

const evaluateHighSequence = ({
  baselineTemp: currentBaselineTemp,
  firstHighIndex: sequenceStartIndex,
}) => {
  if (sequenceStartIndex == null) {
    return { confirmed: false };
  }

  const requiredRise = currentBaselineTemp + 0.2;
  const highs = [];
  const sequenceIndices = [];
  const seenSequenceIndices = new Set();
  const addSequenceIndex = (index) => {
    if (index == null || seenSequenceIndices.has(index)) return;
    seenSequenceIndices.add(index);
    sequenceIndices.push(index);
  };
  let borderlineSkipIndex = null; // segunda excepción
  let slipUsed = false; // un valor bajo permitido antes de 3 altos

  for (let idx = sequenceStartIndex; idx < processedData.length; idx++) {
    const point = processedData[idx];
    if (!isValid(point)) break;

    const temp = point.displayTemperature;
    if (!Number.isFinite(temp)) break;

    // --- Caso normal: temperatura alta ---
    if (temp > currentBaselineTemp) {
      addSequenceIndex(idx);
      highs.push({ index: idx, temp });

      // Regla normal: 3-high
      if (highs.length === 3 && highs[2].temp >= requiredRise) {
        return {
          confirmed: true,
          confirmationIndex: highs[2].index,
          usedIndices: sequenceIndices,
          rule: "3-high",
        };
      }

      // 1ª excepción: tercer alto <+0.2 → pedir un 4º > baseline
      if (highs.length === 4 && highs[2].temp < requiredRise && highs[3].temp > currentBaselineTemp) {
        return {
          confirmed: true,
          confirmationIndex: highs[3].index,
          usedIndices: sequenceIndices,
          rule: "german-3+1",
        };
      }

      // 2ª excepción: un rasante en los 3 primeros → basta con que el 3º alto sea ≥ +0.2
      if (
        borderlineSkipIndex !== null &&
        highs.length === 3 &&
        highs[2].temp >= requiredRise
      ) {
        return {
          confirmed: true,
          confirmationIndex: highs[2].index,
          usedIndices: sequenceIndices,
          rule: "german-2nd-exception",
        };
      }


      // Regla 5-high
      if (highs.length === 5 && highs[3].temp > currentBaselineTemp && highs[4].temp >= requiredRise) {
        return {
          confirmed: true,
          confirmationIndex: highs[4].index,
          usedIndices: sequenceIndices,
          rule: "5-high",
        };
      }

      continue;
    }

    // --- Borderline (segunda excepción) ---
    if (temp >= currentBaselineTemp - 0.05 && borderlineSkipIndex === null && highs.length > 0 && highs.length < 3) {
      borderlineSkipIndex = idx;
      addSequenceIndex(idx);
      highs.push({ index: idx, temp: currentBaselineTemp }); // lo contamos como un “alto” justo en baseline
      continue;
    }


    // --- Slip permitido ---
    if (!slipUsed && highs.length > 0 && highs.length < 3) {
      slipUsed = true;
      addSequenceIndex(idx);
      continue;
    }

    break;
  }

  return { confirmed: false, usedIndices: sequenceIndices };
};


  while (searchStartIndex < processedData.length) {
    const baselineInfo = findBaselineFromIndex(searchStartIndex);
    if (!baselineInfo) {
      break;
    }

    baselineTemp = baselineInfo.baselineTemp;
    baselineStartIndex = baselineInfo.baselineStartIndex;
    firstHighIndex = baselineInfo.firstHighIndex;
    baselineBorderlineCount = baselineInfo.baselineBorderlineCount;

    if (firstHighIndex == null) {
      searchStartIndex = baselineStartIndex + 1;
      continue;
    }

    const evaluation = evaluateHighSequence(baselineInfo);
    if (evaluation?.requireRebaseline) {
      searchStartIndex = baselineStartIndex + 1;
      continue;
    }

    if (evaluation?.confirmed) {
      confirmedDetails = {
        confirmed: true,
        confirmationIndex: evaluation.confirmationIndex,
        infertileStartIndex: evaluation.confirmationIndex,
        rule: evaluation.rule,
        highSequenceIndices: evaluation.usedIndices,
        ovulationIndex:
          firstHighIndex != null
            ? firstHighIndex
            : evaluation.usedIndices?.length
              ? evaluation.usedIndices[0]
              : null,
      };
      break;
    }
        searchStartIndex = baselineStartIndex + 1;
  }

  return {
    baselineTemp,
    baselineStartIndex,
    firstHighIndex,
    ovulationDetails: confirmedDetails,
  };
};

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
      const [activeIndex, setActiveIndex] = useState(null);

      const clearActivePoint = useCallback(() => {
        setActivePoint(null);
        setActiveIndex(null);
      }, []);


      const peakStatusByIsoDate = useMemo(() => computePeakStatuses(data), [data]);
      const processedData = useMemo(() => {
        const normalizeTemp = (value) => {
          if (value === null || value === undefined || value === '') {
            return null;
          }
          const parsed = parseFloat(String(value).replace(',', '.'));
          return Number.isFinite(parsed) ? parsed : null;
        };
        const getMeasurementTemp = (measurement) => {
          if (!measurement) return null;
          const raw = normalizeTemp(measurement.temperature);
          const corrected = normalizeTemp(measurement.temperature_corrected);
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

        return data.map((d) => {
          const directSources = [
            d?.temperature_chart,
            d?.temperature_raw,
            d?.temperature_corrected,
          ];

          let resolvedValue = null;
          for (const candidate of directSources) {
            if (candidate !== null && candidate !== undefined && candidate !== '') {
              resolvedValue = candidate;
              break;
            }
          }

          if (resolvedValue == null && Array.isArray(d?.measurements)) {
            const selectedMeasurement = d.measurements.find(
              (m) => m && m.selected && getMeasurementTemp(m) !== null
            );
            const fallbackMeasurement =
              selectedMeasurement || d.measurements.find((m) => getMeasurementTemp(m) !== null);
            if (fallbackMeasurement) {
              resolvedValue = getMeasurementTemp(fallbackMeasurement);
            }
          }
          const isoDate = d?.isoDate;  
          return {
            ...d,
            displayTemperature: normalizeTemp(resolvedValue),
            peakStatus: isoDate ? peakStatusByIsoDate[isoDate] || null : null,
          };
        });
      }, [data, peakStatusByIsoDate]);

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

  const validDataForLine = useMemo(
    () =>
      processedData.filter(
        (d) =>
          d &&
          d.isoDate &&
          !d.ignored &&
          d.displayTemperature !== null &&
          d.displayTemperature !== undefined
      ),
    [processedData]
  );
  const allDataPoints = useMemo(() => processedData.filter((d) => d && d.isoDate), [processedData]);
  const hasTemperatureData = validDataForLine.length > 0;

  const peakDayIndex = useMemo(() => {
    if (!allDataPoints.length) return null;
    for (let idx = 0; idx < allDataPoints.length; idx += 1) {
      if (allDataPoints[idx]?.peakStatus === 'P') {
        return idx;
      }
    }
    return null;
  }, [allDataPoints]);

  const peakInfertilityStartIndex = useMemo(() => {
    if (!allDataPoints.length) return null;
    if (!hasTemperatureData) return 0;

    let thirdDayIndex = null;
    for (let idx = 0; idx < allDataPoints.length; idx += 1) {
      if (allDataPoints[idx]?.peakStatus === '3') {
        thirdDayIndex = idx;
        break;
      }
    }

    if (thirdDayIndex == null) return null;
    const candidate = thirdDayIndex + 1;
    if (candidate >= allDataPoints.length) {
      return thirdDayIndex;
    }
    return candidate;
  }, [allDataPoints, hasTemperatureData]);

  const { baselineTemp, baselineStartIndex, firstHighIndex, ovulationDetails: rawOvulationDetails } = useMemo(
    () => computeOvulationMetrics(processedData),
    [processedData]
  );
  const ovulationDetails = useMemo(() => {
    const baseDetails =
      rawOvulationDetails ?? {
        confirmed: false,
        confirmationIndex: null,
        infertileStartIndex: null,
        rule: null,
        highSequenceIndices: [],
        ovulationIndex: null,
      };

    return {
      ...baseDetails,
      peakDayIndex,
      peakInfertilityStartIndex,
    };
  }, [rawOvulationDetails, peakDayIndex, peakInfertilityStartIndex]);

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
        if (!point) {
          clearActivePoint();
          return;
        }

        // 1) Calcula la posición del ratón/tap
        const chartRect = chartRef.current.getBoundingClientRect();
        let clientX, clientY;
        if (event.type.startsWith('touch')) {
          const touch = event.changedTouches[0];
          clientX = touch.clientX;
          clientY = touch.clientY;
        } else {
          clientX = event.clientX;
          clientY = event.clientY;
        }

        // 2) Mapea a coordenadas SVG
        const svgX = getX(index);
        const displayTemp = point.displayTemperature ?? point.temperature_chart ?? null;
        const svgY = getY(displayTemp);

        // 3) Fija posición y punto activo
        setTooltipPosition({
          svgX,
          svgY,
          clientX: clientX - chartRect.left + chartRef.current.scrollLeft,
          clientY: clientY - chartRect.top + chartRef.current.scrollTop,
        });
        setActiveIndex(index);
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
            if(!isPointClick) clearActivePoint();
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
      }, [activePoint, clearActivePoint]);
      const handleToggleIgnore = (recordId) => {
        if (onToggleIgnore && recordId) {
          onToggleIgnore(cycleId, recordId);
          clearActivePoint();
        }
      };

      return {
        chartRef,
        tooltipRef,
        dimensions,
        activePoint,
        activeIndex,
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
        setActiveIndex,
        getY,
        getX,
        handlePointInteraction,
        clearActivePoint,
        handleToggleIgnore,
        responsiveFontSize,
        baselineTemp,
        baselineStartIndex,
        firstHighIndex,
        ovulationDetails,
        hasTemperatureData,
      };
    };
