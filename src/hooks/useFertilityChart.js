import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { parseISO, differenceInCalendarDays } from 'date-fns';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { evaluateHighSequencePostpartum } from '../lib/evaluateHighSequencePostpartum';
import {
  computeCpmCandidateFromCycles,
  computeFertilityStartOutput,
  computeT8CandidateFromCycles,
} from '@/lib/fertilityStart';

const DEFAULT_FERTILITY_START_CONFIG = {
  calculators: { cpm: true, t8: true },
  postpartum: false,
  combineMode: 'estandar',
};

const DEFAULT_TEMP_MIN = 36.1;
const DEFAULT_TEMP_MAX = 37.5;

export const computeOvulationMetrics = (processedData = [], options = {}) => {
  const { postpartum = false } = options;
  const getCalcTemperature = (point) =>
    point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
  const isIgnoredForCalc = (point) =>
    point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
  const isValid = (p) => p && getCalcTemperature(p) != null && !isIgnoredForCalc(p);
  const isValidTemperaturePoint = (p) => isValid(p) && Number.isFinite(getCalcTemperature(p));
  const windowSize = 6;
  const borderlineTolerance = 0.05;
  const isDev =
    typeof import.meta !== 'undefined'
      ? Boolean(import.meta?.env?.DEV)
      : process?.env?.NODE_ENV !== 'production';

  const findPreviousValidIndex = (startIndex, predicate = isValidTemperaturePoint) => {
    if (!Number.isInteger(startIndex)) return null;
    for (let idx = startIndex; idx >= 0; idx -= 1) {
      const point = processedData[idx];
      if (predicate(point)) {
        return idx;
      }
    }
    return null;
  };

  const filterValidIndices = (indices, predicate = isValidTemperaturePoint) => {
    if (!Array.isArray(indices) || indices.length === 0) return [];
    const seen = new Set();
    const result = [];
    indices.forEach((value) => {
      const idx = Number(value);
      if (!Number.isInteger(idx) || idx < 0 || idx >= processedData.length) return;
      if (seen.has(idx)) return;
      const point = processedData[idx];
      if (!predicate(point)) return;
      seen.add(idx);
      result.push(idx);
    });
    return result;
  };

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
      baselineIndices: entries.map((entry) => entry.index),
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

      const temperature = getCalcTemperature(candidate);
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
          const potentialTemp = getCalcTemperature(potentialHigh);
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
          baselineIndices: baselineInfo.baselineIndices,
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
    usedIndices: [],
    ovulationIndex: null,
  };

  let baselineTemp = null;
  let baselineStartIndex = null;
  let firstHighIndex = null;
  let baselineIndices = [];
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
  let ex2Active = false;          // 2ª excepción activa
  let lineOrBelowCount = 0;       // para detectar “dos valores en línea/bajo”
  let slipUsed = false;
  // Evitamos usar index-1 porque puede apuntar a un día ignorado o sin temperatura.
  const precedingLowIndex = findPreviousValidIndex(sequenceStartIndex - 1);

  const buildUsedIndices = () =>
    precedingLowIndex != null
      ? [precedingLowIndex, ...sequenceIndices]
      : [...sequenceIndices];

    const ensureRebaseline = () => ({
    confirmed: false,
    requireRebaseline: true,
    usedIndices: buildUsedIndices(),
    highSequenceIndices: [...sequenceIndices],
  });

  for (let idx = sequenceStartIndex; idx < processedData.length; idx++) {
    const point = processedData[idx];

    if (!point) break;
    const ignored = isIgnoredForCalc(point);
    if (ignored) continue; // trastorno/ignorado NO rompe

    const temp = getCalcTemperature(point);
    if (!Number.isFinite(temp)) break; // ausencia de dato => rompe (consecutivas)

    // --- Caso normal: temperatura alta ---
    if (temp > currentBaselineTemp) {
      addSequenceIndex(idx);
      highs.push({ index: idx, temp });
 // Si estamos en 2ª excepción, NO se combinan excepciones:
      // confirmación cuando consigues el 3er ALTO “real”, y este debe ser >= +0.2
      if (ex2Active) {
        if (highs.length === 3) {
          if (temp >= requiredRise) {
            return {
              confirmed: true,
              confirmationIndex: idx,
              usedIndices: buildUsedIndices(),
              highSequenceIndices: [...sequenceIndices],
              rule: "german-2nd-exception",
            };
          }
          return ensureRebaseline();
        }
        continue;
      }
      // Regla normal: 3-high
      if (highs.length === 3 && highs[2].temp >= requiredRise) {
        
        return {
          confirmed: true,
          confirmationIndex: highs[2].index,
          usedIndices: buildUsedIndices(),
          highSequenceIndices: [...sequenceIndices],
          rule: "3-high",
        };
      }

      // 1ª excepción: tercer alto <+0.2 → pedir un 4º > baseline
      if (highs.length === 4 && highs[2].temp < requiredRise && highs[3].temp > currentBaselineTemp) {
        
        return {
          confirmed: true,
          confirmationIndex: highs[3].index,
          usedIndices: buildUsedIndices(),
          highSequenceIndices: [...sequenceIndices],
          rule: "german-3+1",
        };
      }

      // Regla 5-high
      if (highs.length === 5 && highs[3].temp > currentBaselineTemp && highs[4].temp >= requiredRise) {
        
        return {
          confirmed: true,
          confirmationIndex: highs[4].index,
          usedIndices: buildUsedIndices(),
          highSequenceIndices: [...sequenceIndices],
          rule: "5-high",
        };
      }

      continue;
    }

    // --- Línea / ligeramente por debajo (2ª excepción) ---
    const isLineOrSlightlyBelow =
      temp <= currentBaselineTemp && temp >= currentBaselineTemp - 0.05;

    if (isLineOrSlightlyBelow && highs.length > 0 && highs.length < 3) {
      lineOrBelowCount += 1;
      addSequenceIndex(idx);
      // Si hay DOS valores en línea/bajo => rebaseline (PDF)
      if (lineOrBelowCount >= 2) return ensureRebaseline();
      ex2Active = true;
      // OJO: este día NO cuenta como “alto” (no meterlo en highs)
      continue;
    }


    // --- Slip permitido ---
    if (!slipUsed && !ex2Active && highs.length > 0 && highs.length < 3) {
      slipUsed = true;
      addSequenceIndex(idx);
      continue;
    }

    break;
  }

  return {
    confirmed: false,
    usedIndices: buildUsedIndices(),
    highSequenceIndices: [...sequenceIndices],
  };
};


  while (searchStartIndex < processedData.length) {
    const baselineInfo = findBaselineFromIndex(searchStartIndex);
    if (!baselineInfo) {
      break;
    }

    baselineTemp = baselineInfo.baselineTemp;
    baselineStartIndex = baselineInfo.baselineStartIndex;
    baselineIndices = Array.isArray(baselineInfo.baselineIndices)
      ? [...baselineInfo.baselineIndices]
      : [];
    firstHighIndex = baselineInfo.firstHighIndex;
    baselineBorderlineCount = baselineInfo.baselineBorderlineCount;

    if (firstHighIndex == null) {
      searchStartIndex = baselineStartIndex + 1;
      continue;
    }

    const evaluation = postpartum
      ? evaluateHighSequencePostpartum({
        ...baselineInfo,
        processedData,
        isValid,
        findPreviousValidIndex,
      })
      : evaluateHighSequence(baselineInfo);
    if (evaluation?.requireRebaseline) {
      searchStartIndex = baselineStartIndex + 1;
      continue;
    }

    if (evaluation?.confirmed) {
      const firstSequenceIndex = evaluation.highSequenceIndices?.length
        ? evaluation.highSequenceIndices[0]
        : null;
        const boundedConfirmation = Number.isInteger(evaluation.confirmationIndex)
        ? Math.max(0, Math.min(evaluation.confirmationIndex, processedData.length - 1))
        : null;
      let infertileStartIndex = null;
      if (boundedConfirmation != null) {
        const candidate = boundedConfirmation;
        infertileStartIndex = Math.max(0, Math.min(candidate, processedData.length - 1));
      }

      confirmedDetails = {
        confirmed: true,
        confirmationIndex: boundedConfirmation,
        infertileStartIndex,
        rule: evaluation.rule,
        highSequenceIndices: evaluation.highSequenceIndices ?? evaluation.usedIndices,
        usedIndices: evaluation.usedIndices,
        ovulationIndex:
          firstHighIndex != null
            ? firstHighIndex
            : firstSequenceIndex != null
              ? firstSequenceIndex
              : null,
      };
      break;
    }
        searchStartIndex = baselineStartIndex + 1;
  }

  const filteredBaselineIndices = filterValidIndices(baselineIndices);
  const filteredHighSequenceIndices = filterValidIndices(confirmedDetails?.highSequenceIndices);
  const filteredUsedIndices = filterValidIndices(confirmedDetails?.usedIndices);
  const filteredDetails = {
    ...confirmedDetails,
    highSequenceIndices: filteredHighSequenceIndices,
    usedIndices: filteredUsedIndices,
  };

  if (isDev) {
    // Manual repro (dev):
    // 1) Día X: raw alta, corregida baja, use_corrected = true.
    // 2) Marcar ignored = true y activar "mostrar".
    // 3) Verificar que numeración/interpretación no salta índices inexistentes.
    const formatPoint = (index) => {
      const point = processedData[index];
      if (!point) return null;
      return {
        index,
        isoDate: point.isoDate,
        displayTemperature: point.displayTemperature,
        calcTemperature: getCalcTemperature(point),
        ignored: point.ignored,
        ignoredForCalc: isIgnoredForCalc(point),
        use_corrected: point.use_corrected,
        temperature_raw: point.temperature_raw ?? null,
        temperature_corrected: point.temperature_corrected ?? null,
        temperature_chart: point.temperature_chart ?? null,
      };
    };

    const logList = (label, indices) => {
      console.groupCollapsed(`${label} (${indices.length})`);
      indices.forEach((idx) => console.log(formatPoint(idx)));
      console.groupEnd();
    };

    console.groupCollapsed('[fertility] Ovulation metrics debug');
    console.log('baselineTemp', baselineTemp);
    console.log('baselineIndices', filteredBaselineIndices);
    console.log('firstHighIndex', firstHighIndex);
    console.log('ovulationDetails', {
      rule: filteredDetails?.rule,
      confirmationIndex: filteredDetails?.confirmationIndex,
      highSequenceIndices: filteredHighSequenceIndices,
      usedIndices: filteredUsedIndices,
    });
    logList('baselineIndices', filteredBaselineIndices);
    logList('highSequenceIndices', filteredHighSequenceIndices);
    logList('usedIndices', filteredUsedIndices);
    console.groupEnd();
  }

  return {
    baselineTemp,
    baselineStartIndex,
    firstHighIndex,
    baselineIndices: filteredBaselineIndices,
    ovulationDetails: filteredDetails,
  };
};

export const useFertilityChart = (
  data,
  isFullScreen,
  orientation,
  onToggleIgnore,
  cycleId,
  visibleDays = 5,
  forceLandscape = false,
  fertilityStartConfig = null,
  calculatorCycles = [],
  externalCalculatorCandidates = null,
  showRelationsRow = false,
  exportMode = false,
) => {
      const chartRef = useRef(null);
      const tooltipRef = useRef(null);
      const [dimensions, setDimensions] = useState({
        width: 0,
        height: 0,
        viewportWidth: 0,
        viewportHeight: 0,
      });
      const [activePoint, setActivePoint] = useState(null);
      const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
      const [activeIndex, setActiveIndex] = useState(null);

      const clearActivePoint = useCallback(() => {
        setActivePoint(null);
        setActiveIndex(null);
      }, []);

      // Normaliza los códigos de pico que vienen de computePeakStatuses
      const normalizePeakStatus = (value) => {
        if (value == null) return '';
        const s = String(value).trim().toUpperCase();
        if (s === 'P' || s === 'PEAK') return 'P';
        if (s === '1' || s === 'P1' || s === 'P+1') return '1';
        if (s === '2' || s === 'P2' || s === 'P+2') return '2';
        if (s === '3' || s === 'P3' || s === 'P+3') return '3';
        return '';
      };

      const peakStatusByIsoDate = useMemo(() => computePeakStatuses(data), [data]);
      const processedData = useMemo(() => {
        const normalizeTemp = (value) => {
          if (value === null || value === undefined || value === '') {
            return null;
          }
          const parsed = parseFloat(String(value).replace(',', '.'));
          return Number.isFinite(parsed) ? parsed : null;
        };
        const resolveMeasurementTemp = (measurement) => {
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

        const resolveEffectiveTemperature = (entry) => {
          if (!entry) return null;
          const chart = normalizeTemp(entry.temperature_chart);
          const raw = normalizeTemp(entry.temperature_raw);
          const corrected = normalizeTemp(entry.temperature_corrected);
          if (entry.use_corrected && corrected !== null) {
            return corrected;
          }
          if (chart !== null) {
            return chart;
          }
          if (raw !== null) {
            return raw;
          }
          if (corrected !== null) {
            return corrected;
          }

          if (Array.isArray(entry.measurements)) {
            const selectedMeasurement = entry.measurements.find(
              (m) => m && m.selected && resolveMeasurementTemp(m) !== null
            );
            const fallbackMeasurement =
              selectedMeasurement || entry.measurements.find((m) => resolveMeasurementTemp(m) !== null);
            if (fallbackMeasurement) {
              return resolveMeasurementTemp(fallbackMeasurement);
            }
          }
          
          return null;
        };

        return data.map((d) => {
          const resolvedValue = resolveEffectiveTemperature(d);
          const measurementIgnored = Array.isArray(d?.measurements)
            ? d.measurements.some((m) => m?.ignored)
            : false;
          const isoDate = d?.isoDate;
          const peakMarker = d?.peak_marker ?? d?.peakStatus ?? null;
          const resolvedPeakStatus = isoDate
            ? peakStatusByIsoDate[isoDate] ?? peakMarker
            : peakMarker;
          const normalizedPeakStatus = normalizePeakStatus(resolvedPeakStatus); 
          if (import.meta?.env?.DEV && d?.use_corrected && normalizeTemp(d?.temperature_corrected) !== null) {
            if (resolvedValue !== normalizeTemp(d?.temperature_corrected)) {
              console.warn('[fertility] use_corrected debe priorizar temperature_corrected', {
                isoDate,
                resolvedValue,
                corrected: normalizeTemp(d?.temperature_corrected),
              });
            }
          }
          const displayTemperature = normalizeTemp(resolvedValue);
          const ignoredForCalc = Boolean(d?.ignored || measurementIgnored);
          return {
        ...d,
            displayTemperature,
            calcTemperature: ignoredForCalc ? null : displayTemperature,
            ignoredForCalc,
            peakStatus: resolvedPeakStatus ?? null,
            normalizedPeakStatus,
          };
        });
      }, [data, peakStatusByIsoDate]);

  const todayIndex = useMemo(() => {
    if (!Array.isArray(processedData) || processedData.length === 0) {
      return null;
    }
    const today = new Date();
    let lastIndex = null;
    processedData.forEach((entry, idx) => {
      if (!entry?.isoDate) return;
      try {
        const parsed = parseISO(entry.isoDate);
        if (Number.isNaN(parsed?.getTime?.())) return;
        if (differenceInCalendarDays(parsed, today) <= 0) {
          lastIndex = idx;
        }
      } catch (error) {
        // ignore parsing issues
      }
    });
    return lastIndex;
  }, [processedData]);

      useLayoutEffect(() => {
        const updateDimensions = () => {
          if (!chartRef.current) return;

          const parentEl = chartRef.current.parentElement || chartRef.current;
          let parentW = parentEl.clientWidth || 600;
          let parentH = parentEl.clientHeight || 400;
          let containerWidth = chartRef.current.clientWidth > 0 ? chartRef.current.clientWidth : parentW;
          let newWidth;
          let newHeight;
          let viewportWidth;
          let viewportHeight;

          if (isFullScreen) {
            let availW = window.innerWidth;
            let availH = window.innerHeight;
             // ✅ En exportMode, el gráfico se renderiza dentro de un contenedor offscreen
  // con widthPx/heightPx. Si usamos window.innerWidth, el layout queda "estrecho"
  // y luego solo se reescala (no ganas espacio por día).
  if (exportMode) {
    const exportW =
      chartRef.current?.clientWidth ||
      parentEl?.clientWidth ||
      parentW ||
      availW;
    const exportH =
      chartRef.current?.clientHeight ||
      parentEl?.clientHeight ||
      parentH ||
      availH;
    availW = exportW;
    availH = exportH;
  }
            if (forceLandscape && availH > availW) {
              [availW, availH] = [availH, availW];
            }

            containerWidth = availW;
            viewportWidth = availW;
            viewportHeight = availH;
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
            viewportWidth = containerWidth;
            viewportHeight = parentH;
          }
          
        
          setDimensions({
            width: newWidth,
            height: newHeight,
            viewportWidth,
            viewportHeight,
          });
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
      }, [isFullScreen, data.length, visibleDays, orientation, forceLandscape, exportMode]);

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
  const rawAllDataPoints = useMemo(() => processedData.filter((d) => d && d.isoDate), [processedData]);
  const hasTemperatureData = validDataForLine.length > 0;

  const hasAnyObservation = useMemo(() => {
    if (!Array.isArray(processedData) || processedData.length === 0) {
      return false;
    }
    return processedData.some((day) => {
      if (!day) return false;
      if (day.displayTemperature != null) return true;

      const hasMucusInfo = ['mucusAppearance', 'mucus_appearance', 'mucusSensation', 'mucus_sensation']
        .some((field) => {
          const value = day?.[field];
          return value != null && String(value).trim() !== '';
        });
      if (hasMucusInfo) return true;

      const hasSymbol = (() => {
        const symbol = day?.fertility_symbol ?? day?.fertilitySymbol;
        if (symbol == null) return false;
        return String(symbol).trim() !== '';
      })();
      if (hasSymbol) return true;

      const hasObservationText = (() => {
        const observation = day?.observations ?? day?.notes;
        if (observation == null) return false;
        return String(observation).trim() !== '';
      })();
      if (hasObservationText) return true;

      const normalizedPeak = normalizePeakStatus(
        day?.normalizedPeakStatus ?? day?.peakStatus ?? day?.peak_marker
      );
      return normalizedPeak !== '';
    });
  }, [processedData]);

  const normalizedFertilityConfig = useMemo(() => {
    const config = fertilityStartConfig ?? {};
    const ensureBoolean = (value, fallback) =>
      typeof value === 'boolean' ? value : fallback;
    const calculators = {
      cpm: ensureBoolean(
        config?.calculators?.cpm,
        DEFAULT_FERTILITY_START_CONFIG.calculators.cpm
      ),
      t8: ensureBoolean(
        config?.calculators?.t8,
        DEFAULT_FERTILITY_START_CONFIG.calculators.t8
      ),
    };
    const validModes = new Set(['estandar']);
    const combineMode = validModes.has(config?.combineMode)
      ? config.combineMode
      : DEFAULT_FERTILITY_START_CONFIG.combineMode;
    const postpartum = Boolean(config?.postpartum);
    return { calculators, combineMode, postpartum };
  }, [fertilityStartConfig]);

  const fertilityCalculatorCandidates = useMemo(() => {
    if (Array.isArray(externalCalculatorCandidates) && externalCalculatorCandidates.length > 0) {
      return externalCalculatorCandidates
        .map((candidate) => {
          if (!candidate) return null;
          const { source, day, reason } = candidate;
          const normalizedSource = typeof source === 'string'
            ? source.toUpperCase().replace(/-/g, '')
            : '';
          if (normalizedSource !== 'CPM' && normalizedSource !== 'T8') {
            return null;
          }
          const numericDay = Number(day);
          if (!Number.isFinite(numericDay)) {
            return null;
          }
          return {
            source: normalizedSource,
            originalSource: source ?? normalizedSource,
            day: numericDay,
            reason: typeof reason === 'string' ? reason : '',
            kind: 'calculator',
          };
        })
        .filter(Boolean);
    }
    const cycles = Array.isArray(calculatorCycles) ? calculatorCycles : [];
    if (!cycles.length) {
      return [];
    }
    const cpmCandidate = computeCpmCandidateFromCycles(cycles);
    const t8Candidate = computeT8CandidateFromCycles(cycles, computeOvulationMetrics);
    return [cpmCandidate, t8Candidate].filter(Boolean);
  }, [externalCalculatorCandidates, calculatorCycles]);

  const { peakDayIndex, thirdDayIndex, peakInfertilityStartIndex } = useMemo(() => {
    if (!rawAllDataPoints.length) {
      return {
        peakDayIndex: null,
        thirdDayIndex: null,
        peakInfertilityStartIndex: null,
      };
    }

    const normalizedStatuses = rawAllDataPoints.map((entry) =>
      entry?.normalizedPeakStatus ?? normalizePeakStatus(entry?.peakStatus ?? entry?.peak_marker)
    );

    let detectedPeakIndex = null;
    let detectedThirdIndex = null;

    normalizedStatuses.forEach((status, idx) => {
      if (status === 'P' && detectedPeakIndex == null) {
        detectedPeakIndex = idx;
      }
      if (status === '3' && detectedThirdIndex == null) {
        detectedThirdIndex = idx;
      }
    });

    if (detectedPeakIndex == null) {
      return {
        peakDayIndex: null,
        thirdDayIndex: null,
        peakInfertilityStartIndex: null,
      };
    }

    if (detectedThirdIndex != null) {
      const lastIndex = rawAllDataPoints.length - 1;
      const startIdx = Math.min(detectedThirdIndex + 1, lastIndex);
      return {
        peakDayIndex: detectedPeakIndex,
        thirdDayIndex: detectedThirdIndex,
        peakInfertilityStartIndex: startIdx,
      };
    }

    return {
      peakDayIndex: detectedPeakIndex,
      thirdDayIndex: null,
      peakInfertilityStartIndex: null,
    };
  }, [rawAllDataPoints]);

  const {
    baselineTemp,
    baselineStartIndex,
    firstHighIndex,
    baselineIndices,
    ovulationDetails: rawOvulationDetails,
  } = useMemo(
    () => computeOvulationMetrics(processedData, { postpartum: normalizedFertilityConfig.postpartum }),
    [processedData, normalizedFertilityConfig.postpartum]
  );
  const ovulationDetails = useMemo(() => {
    const baseDetails =
      rawOvulationDetails ?? {
        confirmed: false,
        confirmationIndex: null,
        infertileStartIndex: null,
        rule: null,
        highSequenceIndices: [],
        usedIndices: [],
        ovulationIndex: null,
      };

    return {
      ...baseDetails,
      baselineTemp,
      baselineIndices,
      baselineStartIndex,
      firstHighIndex,
      peakDayIndex,
      peakInfertilityStartIndex,
      thirdDayIndex,
    };
  }, [
    rawOvulationDetails,
    baselineTemp,
    baselineIndices,
    baselineStartIndex,
    firstHighIndex,
    peakDayIndex,
    peakInfertilityStartIndex,
    thirdDayIndex,
  ]);

  const fertilityStart = useMemo(
    () =>
      computeFertilityStartOutput({
        processedData,
        config: normalizedFertilityConfig,
        calculatorCandidates: fertilityCalculatorCandidates,
        context: {
          peakDayIndex,
          postPeakStartIndex: peakInfertilityStartIndex,
          peakThirdDayIndex: ovulationDetails?.thirdDayIndex ?? null,
          temperatureInfertileStartIndex: ovulationDetails?.infertileStartIndex ?? null,
          temperatureConfirmationIndex: ovulationDetails?.confirmationIndex ?? null,
          temperatureRule: ovulationDetails?.rule ?? null,
          todayIndex,
        },
      }),
    [
      processedData,
      normalizedFertilityConfig,
      fertilityCalculatorCandidates,
      ovulationDetails?.thirdDayIndex,
      ovulationDetails?.infertileStartIndex,
      ovulationDetails?.confirmationIndex,
      ovulationDetails?.rule,
      peakDayIndex,
      peakInfertilityStartIndex,
      todayIndex,
    ]
  );

  const processedDataWithAssessments = useMemo(
    () =>
      processedData.map((entry, index) => {
        if (!entry) return entry;
        const isFutureDay = Number.isInteger(todayIndex) ? index > todayIndex : false;
        // Ya no añadimos fertilityAssessment: solo marcamos si es futuro
        return { ...entry, isFutureDay };
      }),
    [processedData, todayIndex]
  );

  const allDataPoints = useMemo(
    () => processedDataWithAssessments.filter((d) => d && d.isoDate),
    [processedDataWithAssessments]
  );

      const { tempMin, tempMax } = useMemo(() => {
        const recordedTemps = validDataForLine
          .map((d) => d.displayTemperature)
          .filter((t) => t !== null && t !== undefined);

        if (recordedTemps.length === 0) {
          return { tempMin: DEFAULT_TEMP_MIN, tempMax: DEFAULT_TEMP_MAX };
        }

        const desiredRange = DEFAULT_TEMP_MAX - DEFAULT_TEMP_MIN;

        const actualMin = Math.min(...recordedTemps);
        const actualMax = Math.max(...recordedTemps);

        let min = Math.min(actualMin, DEFAULT_TEMP_MIN);
        let max = Math.max(actualMax, DEFAULT_TEMP_MAX);

        const roundDownTenth = (value) => Math.floor(value * 10) / 10;
        const roundUpTenth = (value) => Math.ceil(value * 10) / 10;

        min = roundDownTenth(min);
        max = roundUpTenth(max);

        if (max - min < desiredRange) {
          const mid = (min + max) / 2;
          min = roundDownTenth(mid - desiredRange / 2);
          max = roundUpTenth(mid + desiredRange / 2);
        }
        
        
        if (Math.abs(min - actualMin) < 1e-9) {
          min = roundDownTenth(min - 0.1);
        }

        if (Math.abs(max - actualMax) < 1e-9) {
          max = roundUpTenth(max + 0.1);
        }

        return {
          tempMin: parseFloat(min.toFixed(1)),
          tempMax: parseFloat(max.toFixed(1)),
        };
      }, [validDataForLine]);
      
      const tempRange = tempMax - tempMin;
      
      const chartWidth = dimensions.width;
      // Altura visible medida por ResizeObserver (la "ventana" que tenía antes de RS).
      const viewportHeight = dimensions.viewportHeight || dimensions.height;
      const viewportWidth = dimensions.viewportWidth || chartWidth;
      
      const clamp = (min, value, max) => Math.min(max, Math.max(min, value));

      // En export queremos letras legibles y que escalen según el "ancho por día"
      // (si renderizas 35 días en un contenedor ancho, debe subir el tamaño).
      const baseFontSize = exportMode ? 11 : 9;

      const responsiveFontSize = (multiplier = 1) => {
        // Export: escala por ancho disponible por día (no por nº total de puntos)
        if (exportMode) {
          const vw = (dimensions.viewportWidth || viewportWidth || chartWidth || 1);
          const perDayPx = vw / Math.max(Number(visibleDays) || 1, 1);

          // Ajusta estos 3 números si quieres más/menos:
          // - 0.33: agresividad (más alto => letras más grandes)
          // - 11..15: límites base en px (antes de multiplier)
          const base = clamp(11, perDayPx * 0.33, 15);
          const scaled = base * multiplier;

          // Límite final para que no se desmadre en tramos cortos
          return clamp(10, scaled, 18);
        }

        // Normal (app): comportamiento actual
        if (!isFullScreen) return baseFontSize * multiplier;
        const smallerDim = Math.min(chartWidth, viewportHeight);
        return Math.max(
          8,
          Math.min(
            baseFontSize * multiplier,
            smallerDim / (allDataPoints.length > 0 ? (40 / multiplier) : 40)
          )
        );
      };

      // In pantalla completa damos un poco más de altura a cada
      // fila de texto para permitir mostrar palabras más largas
      // en orientación vertical.
      const textRowHeight = Math.round(
        responsiveFontSize(isFullScreen ? (exportMode ? 1.45 : 1.6) : 2)
      );
      const isLandscapeVisual = forceLandscape || orientation === 'landscape';
      const isDenseExport = exportMode && isFullScreen && isLandscapeVisual && visibleDays >= 28;
      // Cálculo exacto para que la fila inferior "bese" el borde inferior del SVG.
      // Observaciones está en rowIndex = 9 (fullscreen) o 7.5 (no fullscreen).
      // rowBlockHeight/2 equivale a 1 (fullscreen) o 0.75 (no fullscreen).
      const obsRowIndex = isFullScreen ? 9 : 7.5;
      const relationsRowIndex = obsRowIndex + (showRelationsRow ? (isFullScreen ? 2 : 1.5) : 0);
      const halfBlock = isFullScreen ? 1 : 0.75;
      const baseBottomRowsExact = Math.round(textRowHeight * (obsRowIndex + halfBlock));
      const relationsBottomRowsExact = Math.round(textRowHeight * (relationsRowIndex + halfBlock));
      const bottomRowsExact = baseBottomRowsExact;

      // Cuando hay fila de RS añadimos altura extra equivalente al espacio adicional de filas
      // inferior para que la zona de temperaturas no se comprima y el extra sea scrollable.
      const extraScrollableHeight = showRelationsRow
        ? Math.max(0, relationsBottomRowsExact - baseBottomRowsExact)
        : 0;
      const visibleRowsHeight = showRelationsRow ? relationsBottomRowsExact : baseBottomRowsExact;
      const minGraphArea = Math.max(viewportHeight - visibleRowsHeight, textRowHeight * (isFullScreen ? 10 : 8));
      const chartContentHeight = visibleRowsHeight + Math.max(minGraphArea, 0);
      const scrollableContentHeight = chartContentHeight + extraScrollableHeight;

        const basePadding = {
        top: isFullScreen
          ? Math.max(
              isLandscapeVisual ? 6 : 12,
              viewportHeight * (isLandscapeVisual ? 0.015 : 0.03)
            )
          : 12, 
        right: isFullScreen
          ? Math.max(
              isLandscapeVisual ? 35 : 30,
              Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.02 : 0.05)
            )
          : 50, 
        // 👇 Ajuste exacto. Si quieres que quede "pegadísimo", puedes restar 1px.
        bottom: Math.max(0, bottomRowsExact - 1),
        left: isFullScreen
          ? Math.max(
              isLandscapeVisual ? 45 : 20,
              Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.02 : 0.05)
            )
          : 50
      };
      // ✅ Solo export: menos padding lateral = más ancho útil por día (sin deformar)
const padding = isDenseExport
  ? {
      ...basePadding,
      left: Math.max(34, Math.round(basePadding.left * 0.78)),
      right: Math.max(18, Math.round(basePadding.right * 0.60)),
    }
  : basePadding;
      
      // --- Levanta el suelo del área del gráfico (sin mover filas) ---
      // Ajusta cuántas "filas" quieres ganar de aire bajo el gráfico:
      const GRAPH_BOTTOM_LIFT_ROWS = 4; // p.ej. 0.8 filas; prueba 0.6–1.2
      const graphBottomInset = Math.max(0, Math.round(textRowHeight * GRAPH_BOTTOM_LIFT_ROWS));
      const graphBottomY = chartContentHeight - padding.bottom - graphBottomInset;
      const getY = useCallback((temp) => {
        const effectiveHeight = chartContentHeight - padding.top - padding.bottom - graphBottomInset;
        if (temp === null || temp === undefined || tempRange === 0 || effectiveHeight <= 0) {
          return graphBottomY;
        }
        return graphBottomY - ((temp - tempMin) / tempRange) * effectiveHeight;
      }, [
        chartContentHeight,
        padding.top,
        padding.bottom,
        graphBottomInset,
        tempRange,
        graphBottomY,
        tempMin,
      ]);

      const getX = useCallback((index) => {
        const extraMargin = isDenseExport ? 2 : ((isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 5 : 10);
        const daySpacing = (isFullScreen && !(forceLandscape || orientation === 'landscape')) ? 25 : 0;
        const EXTRA_RIGHT_GAP = isDenseExport ? 4 : 15;
        const edgePadding = isDenseExport
  ? 0
  : isFullScreen
          ? Math.max(
              isLandscapeVisual ? 8 : 18,
              Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.01 : 0.05)
            )
          : 20;
        const paddingRightForX = padding.right + EXTRA_RIGHT_GAP;
        const availableWidth =
          chartWidth -
          padding.left -
          paddingRightForX -
          extraMargin -
          edgePadding * 2 -
          daySpacing * (allDataPoints.length - 1);
        if (availableWidth <= 0) {
          return padding.left + extraMargin + edgePadding + daySpacing * index;
        }
        const pointsToDisplay = allDataPoints.length > 1 ? allDataPoints.length - 1 : 1;
        if (pointsToDisplay === 0 || allDataPoints.length === 0) {
          return padding.left + extraMargin + edgePadding + daySpacing * index;
        }
        return (
          padding.left +
          extraMargin +
          edgePadding +
          index * (availableWidth / (allDataPoints.length === 1 ? 1 : pointsToDisplay)) +
          daySpacing * index
        );
      }, [
        isFullScreen,
        forceLandscape,
        orientation,
        padding.left,
        padding.right,
        chartWidth,
        viewportWidth,
        allDataPoints.length,
        isLandscapeVisual,
      ]);
      
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
          if (chartRef.current?.contains(event.target)) {
            return;
          }

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
        dimensions: {
          ...dimensions,
          // chartContentHeight: altura total del SVG cuando hay RS (para scroll vertical interno)
          contentHeight: chartContentHeight,
          scrollableContentHeight,
          extraScrollableHeight,
          // viewportHeight: altura visible sin RS; mantiene compatibilidad con el estado previo
          viewportHeight,
        },
        activePoint,
        activeIndex,
        tooltipPosition,
        processedData: processedDataWithAssessments,
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
        baselineIndices,
        firstHighIndex,
        ovulationDetails,
        fertilityStart,
        hasTemperatureData,
        hasAnyObservation,
        graphBottomInset,
        todayIndex,
      };
    };
