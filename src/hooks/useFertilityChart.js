import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { normalizePeakStatus } from '@/chart/core/peakStatusUtils';
import { buildChartRenderModel } from '@/chart/core/buildChartRenderModel';
import { computeChartLayout } from '@/chart/core/computeChartLayout';
import {
  calculateTodayIndex,
  getCorrectedPriorityWarnings,
  prepareChartData,
} from '@/chart/core/prepareChartData';
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

      const peakStatusByIsoDate = useMemo(() => computePeakStatuses(data), [data]);
      const processedData = useMemo(() => {
        if (import.meta?.env?.DEV) {
          getCorrectedPriorityWarnings(data).forEach((warning) => {
            console.warn('[fertility] use_corrected debe priorizar temperature_corrected', warning);
          });
        }

        return prepareChartData(data, peakStatusByIsoDate);
      }, [data, peakStatusByIsoDate]);

  const todayIndex = useMemo(() => calculateTodayIndex(processedData), [processedData]);

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
      
      const chartLayout = useMemo(
        () =>
          computeChartLayout({
            dimensions,
            isFullScreen,
            orientation,
            forceLandscape,
            visibleDays,
            exportMode,
            showRelationsRow,
            rotatedSafeStartInsetPx,
            rotatedSafeEndInsetPx,
            dataPointCount: allDataPoints.length,
            tempMin,
            tempMax,
          }),
        [
          dimensions,
          isFullScreen,
          orientation,
          forceLandscape,
          visibleDays,
          exportMode,
          showRelationsRow,
          rotatedSafeStartInsetPx,
          rotatedSafeEndInsetPx,
          allDataPoints.length,
          tempMin,
          tempMax,
        ]
      );

      const viewportHeight = chartLayout.viewportHeight;
      
      const responsiveFontSize = (multiplier = 1) => {
        // General (app-like): mantener comportamiento de la app también en export.
        return chartLayout.responsiveFontSize(multiplier);
      };
      const bottomRowsResponsiveFontSize = (multiplier = 1) => {
        return chartLayout.bottomRowsResponsiveFontSize(multiplier);
      };
      const textRowHeight = chartLayout.textRowHeight;
      const extraScrollableHeight = chartLayout.extraScrollableHeight;
      const chartContentHeight = chartLayout.chartContentHeight;
      const scrollableContentHeight = chartLayout.scrollableContentHeight;

      const padding = chartLayout.padding;
      
      const graphBottomInset = chartLayout.graphBottomInset;
      const graphBottomY = chartLayout.graphBottomY;
      const getY = useCallback((temp) => {
        return chartLayout.getY(temp);
      }, [chartLayout]);

      const getX = useCallback((index) => {
        return chartLayout.getX(index);
      }, [chartLayout]);

      const renderModel = useMemo(
        () =>
          buildChartRenderModel({
            layout: chartLayout,
            dataPoints: allDataPoints,
            tempMin,
            tempMax,
            tempRange,
            todayIndex,
            baselineTemp,
            baselineStartIndex,
            firstHighIndex,
            baselineIndices,
            ovulationDetails,
            fertilityStart,
            interpretationSegments: [],
          }),
        [
          chartLayout,
          allDataPoints,
          tempMin,
          tempMax,
          tempRange,
          todayIndex,
          baselineTemp,
          baselineStartIndex,
          firstHighIndex,
          baselineIndices,
          ovulationDetails,
          fertilityStart,
        ]
      );
       
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
        bottomRowsResponsiveFontSize,
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
        renderModel,
      };
    };
