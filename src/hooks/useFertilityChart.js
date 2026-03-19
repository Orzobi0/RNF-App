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

  const getPreviousValidEntries = (beforeIndex, count = windowSize) => {
    const entries = [];

    for (let idx = beforeIndex - 1; idx >= 0 && entries.length < count; idx -= 1) {
      const point = processedData[idx];
      if (!isValidTemperaturePoint(point)) continue;

      entries.push({
        index: idx,
        temp: getCalcTemperature(point),
      });
    }

    return entries.length === count ? entries.reverse() : [];
  };

  const buildBaselineCandidate = (highIndex) => {
    const point = processedData[highIndex];
    if (!isValidTemperaturePoint(point)) return null;

    const currentTemp = getCalcTemperature(point);
    const previousEntries = getPreviousValidEntries(highIndex, windowSize);

    if (previousEntries.length !== windowSize) return null;

    const isFirstHigh = previousEntries.every((entry) => entry.temp < currentTemp);
    if (!isFirstHigh) return null;

    const baselineTemp = previousEntries.reduce(
      (max, entry) => (entry.temp > max ? entry.temp : max),
      previousEntries[0].temp
    );

    return {
      baselineTemp,
      baselineStartIndex: previousEntries[0].index,
      baselineIndices: previousEntries.map((entry) => entry.index),
      firstHighIndex: highIndex,
    };
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

  const emptyDetails = {
    confirmed: false,
    confirmationIndex: null,
    infertileStartIndex: null,
    rule: null,
    sequenceDisplayIndices: [],
    highOnlyIndices: [],
    usedIndices: [],
    ovulationIndex: null,
  };

  const evaluateHighSequenceStandard = ({
    baselineTemp: currentBaselineTemp,
    firstHighIndex: sequenceStartIndex,
  }) => {
    if (sequenceStartIndex == null) {
      return { confirmed: false };
    }

    const requiredRise = Number((currentBaselineTemp + 0.2).toFixed(2));
    const targetHighCount = 3;
    const maxDisplayDays = targetHighCount + 1; // 4

    const sequenceDisplayIndices = [];
    const highOnlyIndices = [];
    let lineOrBelowCount = 0;
    let mode = null; // null | 'first-exception' | 'second-exception'

    const addSequenceDay = (index, temp) => {
      sequenceDisplayIndices.push(index);
      if (temp > currentBaselineTemp) {
        highOnlyIndices.push(index);
      } else {
        lineOrBelowCount += 1;
      }
    };

    const buildResult = ({
      confirmed = false,
      confirmationIndex = null,
      rule = null,
      requireRebaseline = false,
    } = {}) => ({
      confirmed,
      confirmationIndex,
      infertileStartIndex: confirmed ? confirmationIndex : null,
      rule,
      requireRebaseline,
      sequenceDisplayIndices: [...sequenceDisplayIndices],
      highOnlyIndices: [...highOnlyIndices],
      usedIndices: [...sequenceDisplayIndices],
      ovulationIndex: sequenceStartIndex,
    });

    for (let idx = sequenceStartIndex; idx < processedData.length; idx += 1) {
      const point = processedData[idx];
      if (!point) break;

      if (isIgnoredForCalc(point)) continue;

      const temp = getCalcTemperature(point);
      if (!Number.isFinite(temp)) break;

      const isHigh = temp > currentBaselineTemp;
      const isAtLeastPlusPointTwo = temp >= requiredRise;

      addSequenceDay(idx, temp);

      const dayNumber = sequenceDisplayIndices.length;

      if (dayNumber === 1 && !isHigh) {
        return buildResult({ requireRebaseline: true });
      }

      if (lineOrBelowCount >= 2) {
        return buildResult({ requireRebaseline: true });
      }

      if (dayNumber < targetHighCount) {
        continue;
      }

      if (dayNumber === targetHighCount) {
        if (lineOrBelowCount === 0) {
          if (!isHigh) {
            return buildResult({ requireRebaseline: true });
          }

          if (isAtLeastPlusPointTwo) {
            return buildResult({
              confirmed: true,
              confirmationIndex: idx,
              rule: '3-high',
            });
          }

          mode = 'first-exception';
          continue;
        }

        if (lineOrBelowCount === 1) {
          mode = 'second-exception';
          continue;
        }

        return buildResult({ requireRebaseline: true });
      }

      if (dayNumber === maxDisplayDays) {
        if (mode === 'first-exception') {
          if (!isHigh) {
            return buildResult({ requireRebaseline: true });
          }

          return buildResult({
            confirmed: true,
            confirmationIndex: idx,
            rule: 'german-3+1',
          });
        }

        if (mode === 'second-exception') {
          if (isHigh && isAtLeastPlusPointTwo) {
            return buildResult({
              confirmed: true,
              confirmationIndex: idx,
              rule: 'german-2nd-exception',
            });
          }

          return buildResult({ requireRebaseline: true });
        }

        return buildResult({ requireRebaseline: true });
      }

      return buildResult({ requireRebaseline: true });
    }

    return buildResult();
  };

  let baselineTemp = null;
  let baselineStartIndex = null;
  let firstHighIndex = null;
  let baselineIndices = [];
  let confirmedDetails = emptyDetails;

  for (let candidateIndex = 0; candidateIndex < processedData.length; candidateIndex += 1) {
    const baselineInfo = buildBaselineCandidate(candidateIndex);
    if (!baselineInfo) continue;

    baselineTemp = baselineInfo.baselineTemp;
    baselineStartIndex = baselineInfo.baselineStartIndex;
    baselineIndices = [...baselineInfo.baselineIndices];
    firstHighIndex = baselineInfo.firstHighIndex;

    const evaluation = postpartum
      ? evaluateHighSequencePostpartum({
          ...baselineInfo,
          processedData,
          isValid,
          findPreviousValidIndex,
        })
      : evaluateHighSequenceStandard(baselineInfo);

    if (!evaluation?.confirmed) {
      continue;
    }

    const boundedConfirmation = Number.isInteger(evaluation.confirmationIndex)
      ? Math.max(0, Math.min(evaluation.confirmationIndex, processedData.length - 1))
      : null;

    confirmedDetails = {
      confirmed: true,
      confirmationIndex: boundedConfirmation,
      infertileStartIndex: boundedConfirmation,
      rule: evaluation.rule,
      sequenceDisplayIndices: evaluation.sequenceDisplayIndices ?? [],
      highOnlyIndices: evaluation.highOnlyIndices ?? [],
      usedIndices: evaluation.usedIndices ?? [],
      ovulationIndex: evaluation.ovulationIndex ?? baselineInfo.firstHighIndex ?? null,
    };

    break;
  }

  const filteredBaselineIndices = filterValidIndices(baselineIndices);
  const filteredSequenceDisplayIndices = filterValidIndices(
    confirmedDetails?.sequenceDisplayIndices
  );
  const filteredHighOnlyIndices = filterValidIndices(
    confirmedDetails?.highOnlyIndices
  );
  const filteredUsedIndices = filterValidIndices(confirmedDetails?.usedIndices);

  const filteredDetails = {
    ...confirmedDetails,
    sequenceDisplayIndices: filteredSequenceDisplayIndices,
    highOnlyIndices: filteredHighOnlyIndices,
    usedIndices: filteredUsedIndices,

    // compat con partes de la UI que aún leen este campo
    highSequenceIndices: filteredSequenceDisplayIndices,
  };

  if (isDev) {
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
      sequenceDisplayIndices: filteredDetails?.sequenceDisplayIndices,
      highOnlyIndices: filteredDetails?.highOnlyIndices,
      usedIndices: filteredDetails?.usedIndices,
    });
    logList('baselineIndices', filteredBaselineIndices);
    logList('sequenceDisplayIndices', filteredDetails?.sequenceDisplayIndices ?? []);
    logList('highOnlyIndices', filteredDetails?.highOnlyIndices ?? []);
    logList('usedIndices', filteredUsedIndices);
    console.groupEnd();
  }

  const shouldExposeConfirmedBaseline = Boolean(filteredDetails?.confirmed);

return {
  baselineTemp: shouldExposeConfirmedBaseline ? baselineTemp : null,
  baselineStartIndex: shouldExposeConfirmedBaseline ? baselineStartIndex : null,
  firstHighIndex: shouldExposeConfirmedBaseline ? firstHighIndex : null,
  baselineIndices: shouldExposeConfirmedBaseline ? filteredBaselineIndices : [],
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
  rotatedSafeStartInsetPx = 0,
  rotatedSafeEndInsetPx = 0,
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

          const nodeW = Math.max(
  1,
  chartRef.current?.clientWidth ||
    parentEl?.clientWidth ||
    parentW ||
    1
);

const nodeH = Math.max(
  1,
  chartRef.current?.clientHeight ||
    parentEl?.clientHeight ||
    parentH ||
    1
);

if (isFullScreen) {
  containerWidth = nodeW;
  viewportWidth = nodeW;
  viewportHeight = nodeH;

  if (orientation === 'portrait' && !forceLandscape) {
    const legendSpace = Math.max(30, nodeW * 0.05);
    const perDayWidth = (nodeW - legendSpace) / visibleDays;
    newWidth = perDayWidth * data.length;
  } else {
    const perDayWidth = nodeW / visibleDays;
    newWidth = perDayWidth * data.length;
  }

  newHeight = nodeH;
} else {
  containerWidth = nodeW;
  viewportWidth = nodeW;
  viewportHeight = nodeH;

  const perDayWidth = nodeW / visibleDays;
  newWidth = perDayWidth * data.length;
  newHeight = nodeH;
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
        window.addEventListener('orientationchange', updateDimensions);
        
        let resizeObserver;
        const canObserve = typeof window !== 'undefined' && typeof window.ResizeObserver === 'function';
        if (canObserve && chartRef.current) {
  const node = chartRef.current;
  const targetEl = node.parentElement;

  resizeObserver = new ResizeObserver(updateDimensions);
  resizeObserver.observe(node);

  if (targetEl && targetEl !== node) {
    resizeObserver.observe(targetEl);
  }
}
        
        return () => {
          window.removeEventListener('resize', updateDimensions);
          window.removeEventListener('orientationchange', updateDimensions);
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
      const exportExtraTextRows = exportMode ? 6 : 0;
      const exportExtraBottomPx = exportExtraTextRows * textRowHeight;
      const bottomRowsExact = baseBottomRowsExact + exportExtraBottomPx;

      // Cuando hay fila de RS añadimos altura extra equivalente al espacio adicional de filas
      // inferior para que la zona de temperaturas no se comprima y el extra sea scrollable.
      const extraScrollableHeight = showRelationsRow
        ? Math.max(0, relationsBottomRowsExact - baseBottomRowsExact)
        : 0;
      const minGraphArea = Math.max(
        viewportHeight - bottomRowsExact,
        textRowHeight * (isFullScreen ? 10 : 8)
      );
      const chartContentHeight = bottomRowsExact + Math.max(minGraphArea, 0);
      const scrollableContentHeight = chartContentHeight + extraScrollableHeight;

const effectiveRotatedStartInset = Math.max(0, Number(rotatedSafeStartInsetPx) || 0);
const effectiveRotatedEndInset = Math.max(0, Number(rotatedSafeEndInsetPx) || 0);

const computedRight = isFullScreen
  ? Math.max(
      isLandscapeVisual ? 16 : 30,
      Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.01 : 0.05)
    )
  : 50;

const computedLeft = isFullScreen
  ? Math.max(
      isLandscapeVisual ? 45 : 20,
      Math.min(chartWidth, viewportWidth) * (isLandscapeVisual ? 0.02 : 0.05)
    )
  : 50;

  const cappedRotatedEndInset = isLandscapeVisual
   ? Math.min(effectiveRotatedEndInset, 12)
   : effectiveRotatedEndInset;

const basePadding = {
  top: isFullScreen
    ? Math.max(
        isLandscapeVisual ? 6 : 12,
        viewportHeight * (isLandscapeVisual ? 0.015 : 0.03)
      )
    : 12,
  right: isFullScreen
    ? computedRight + cappedRotatedEndInset + (isLandscapeVisual ? 8 : 0)
    : 50,
  bottom: Math.max(0, bottomRowsExact - 1),
  left: isFullScreen
    ? computedLeft + effectiveRotatedStartInset
    : 50,
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
      const GRAPH_BOTTOM_LIFT_ROWS = 1.5; // p.ej. 0.8 filas; prueba 0.6–1.2
      const graphBottomInset = Math.max(0, Math.round(textRowHeight * GRAPH_BOTTOM_LIFT_ROWS));
      const graphBottomY = chartContentHeight - padding.bottom - graphBottomInset;
      const getY = useCallback((temp) => {
      const effectiveHeight = Math.max(
          chartContentHeight - padding.top - padding.bottom - graphBottomInset,
          textRowHeight * 6
        );
        if (temp === null || temp === undefined || tempRange === 0 || effectiveHeight <= 0) {
          return graphBottomY;
        }
        return graphBottomY - ((temp - tempMin) / tempRange) * effectiveHeight;
      }, [
        chartContentHeight,
        padding.top,
        padding.bottom,
        graphBottomInset,
        textRowHeight,
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

  const node = chartRef.current;
  if (!node) return;

  // 1) clientX/clientY (mouse/touch)
  let clientX, clientY;
if (event?.changedTouches?.[0]) {
  clientX = event.changedTouches[0].clientX;
  clientY = event.changedTouches[0].clientY;
} else {
  clientX = event.clientX;
  clientY = event.clientY;
}
if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

const vv =
  typeof window !== 'undefined' ? window.visualViewport : null;

const adjustedClientX = clientX - (vv?.offsetLeft ?? 0);
const adjustedClientY = clientY - (vv?.offsetTop ?? 0);

  // 2) coordenadas del punto en el SVG (para lógica de tooltip)
  const svgX = getX(index);
  const displayTemp = point.displayTemperature ?? point.temperature_chart ?? null;
  const svgY = getY(displayTemp);

  // 3) bounding + scroll del contenedor
  const chartRect = node.getBoundingClientRect();
  const scrollLeft = node.scrollLeft ?? 0;
  const scrollTop = node.scrollTop ?? 0;
  const viewportWidth = node.clientWidth ?? chartRect.width ?? 0;
  const viewportHeight = node.clientHeight ?? chartRect.height ?? 0;

  // 4) detectar rotación forzada
  const isRotated =
  !exportMode &&
  isFullScreen &&
  forceLandscape &&
  ((vv?.width ?? window.innerWidth ?? 0) < (vv?.height ?? window.innerHeight ?? 0));

let localX = adjustedClientX - chartRect.left;
let localY = adjustedClientY - chartRect.top;

  if (isRotated) {
    const cx = chartRect.left + chartRect.width / 2;
    const cy = chartRect.top + chartRect.height / 2;
    const dx = adjustedClientX - cx;
const dy = adjustedClientY - cy;

    // inversa de rotate(90): rotate(-90)
    const ux = dy;
    const uy = -dx;

    const unrotW = chartRect.height || 1;
    const unrotH = chartRect.width || 1;

    localX = ux + unrotW / 2;
    localY = uy + unrotH / 2;
  }

  setTooltipPosition({
    svgX,
    svgY,
    clientX: localX + scrollLeft,
    clientY: localY + scrollTop,
    scrollLeft,
    scrollTop,
    viewportWidth,
    viewportHeight,
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
