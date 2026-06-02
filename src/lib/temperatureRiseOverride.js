import { evaluateHighSequencePostpartum } from '@/lib/evaluateHighSequencePostpartum';

const normalizeTemp = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(2));
};

const getCalcTemperature = (point) =>
  point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;

const isIgnoredForCalc = (point) =>
  point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;

const isValidTemperaturePoint = (point) =>
  point && Number.isFinite(getCalcTemperature(point)) && !isIgnoredForCalc(point);

const findFirstHighIndex = (processedData, firstHighIsoDate) => {
  if (!firstHighIsoDate || !Array.isArray(processedData)) return null;
  const index = processedData.findIndex((point) => point?.isoDate === firstHighIsoDate);
  return index >= 0 ? index : null;
};

const filterValidIndices = (processedData, indices) => {
  if (!Array.isArray(indices)) return [];
  const seen = new Set();
  return indices
    .map((value) => Number(value))
    .filter((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= processedData.length) return false;
      if (seen.has(index)) return false;
      seen.add(index);
      return isValidTemperaturePoint(processedData[index]);
    });
};

const createWarning = (code, { severity = 'warning', indices = [] } = {}) => ({
  code,
  severity,
  indices,
});

export const getPreviousValidTemperatureIndices = (processedData = [], firstHighIndex = null, count = 6) => {
  if (!Array.isArray(processedData) || !Number.isInteger(firstHighIndex)) return [];

  const indices = [];
  for (let index = firstHighIndex - 1; index >= 0 && indices.length < count; index -= 1) {
    if (isValidTemperaturePoint(processedData[index])) {
      indices.push(index);
    }
  }

  return indices.reverse();
};

const getManualCoherenceWarnings = ({ processedData, baselineTemp, firstHighIndex }) => {
  const warnings = [];
  const previousSixIndices = getPreviousValidTemperatureIndices(processedData, firstHighIndex, 6);

  if (previousSixIndices.length < 6) {
    warnings.push(createWarning('missing-previous-six', { indices: previousSixIndices }));
  }

  const previousAboveBaselineIndices = previousSixIndices.filter((index) => {
    const temp = getCalcTemperature(processedData[index]);
    return Number.isFinite(temp) && temp > baselineTemp;
  });

  if (previousAboveBaselineIndices.length > 0) {
    warnings.push(createWarning('baseline-below-previous-six', {
      severity: 'error',
      indices: previousAboveBaselineIndices,
    }));
  } else if (previousSixIndices.length === 6) {
    const previousTemps = previousSixIndices
      .map((index) => getCalcTemperature(processedData[index]))
      .filter(Number.isFinite);
    const previousMax = previousTemps.length ? Math.max(...previousTemps) : null;
    if (Number.isFinite(previousMax) && baselineTemp > previousMax) {
      warnings.push(createWarning('baseline-above-previous-six', { severity: 'info' }));
    }
  }

  const firstHighTemp = getCalcTemperature(processedData[firstHighIndex]);
  if (!Number.isFinite(firstHighTemp) || firstHighTemp <= baselineTemp) {
    warnings.push(createWarning('first-high-not-above-baseline', {
      severity: 'error',
      indices: Number.isInteger(firstHighIndex) ? [firstHighIndex] : [],
    }));
  }

  return {
    previousSixIndices,
    warnings,
  };
};

const hasBlockingManualWarning = (warnings) =>
  warnings.some((warning) =>
    ['missing-previous-six', 'baseline-below-previous-six', 'first-high-not-above-baseline'].includes(warning?.code)
  );

const evaluateHighSequenceStandard = ({
  baselineTemp: currentBaselineTemp,
  firstHighIndex: sequenceStartIndex,
  processedData,
}) => {
  if (sequenceStartIndex == null) {
    return { confirmed: false };
  }

  const requiredRise = Number((currentBaselineTemp + 0.2).toFixed(2));
  const targetHighCount = 3;
  const maxDisplayDays = targetHighCount + 1;
  const sequenceDisplayIndices = [];
  const highOnlyIndices = [];
  let lineOrBelowCount = 0;
  let mode = null;

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
    if (dayNumber === 1 && !isHigh) return buildResult({ requireRebaseline: true });
    if (lineOrBelowCount >= 2) return buildResult({ requireRebaseline: true });
    if (dayNumber < targetHighCount) continue;

    if (dayNumber === targetHighCount) {
      if (lineOrBelowCount === 0) {
        if (!isHigh) return buildResult({ requireRebaseline: true });
        if (isAtLeastPlusPointTwo) {
          return buildResult({ confirmed: true, confirmationIndex: idx, rule: '3-high' });
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
        if (!isHigh) return buildResult({ requireRebaseline: true });
        return buildResult({ confirmed: true, confirmationIndex: idx, rule: 'german-3+1' });
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

export const normalizeTemperatureRiseOverride = (override) => {
  const source = override?.temperatureRise ?? override ?? null;
  const mode = source?.mode === 'manual' ? 'manual' : 'auto';
  return {
    mode,
    baselineTemp: normalizeTemp(source?.baselineTemp),
    firstHighIsoDate:
      typeof source?.firstHighIsoDate === 'string' && source.firstHighIsoDate.trim()
        ? source.firstHighIsoDate
        : null,
    updatedAt: typeof source?.updatedAt === 'string' ? source.updatedAt : null,
  };
};

export const createAutoTemperatureRiseOverride = () => ({
  mode: 'auto',
  baselineTemp: null,
  firstHighIsoDate: null,
  updatedAt: new Date().toISOString(),
});

export const createManualTemperatureRiseOverride = ({ baselineTemp, firstHighIsoDate }) => ({
  mode: 'manual',
  baselineTemp: normalizeTemp(baselineTemp),
  firstHighIsoDate: firstHighIsoDate || null,
  updatedAt: new Date().toISOString(),
});

export const evaluateTemperatureRiseOverride = (
  processedData = [],
  override = null,
  { postpartum = false } = {}
) => {
  const normalized = normalizeTemperatureRiseOverride(override);
  const baselineTemp = normalizeTemp(normalized.baselineTemp);
  const firstHighIndex = findFirstHighIndex(processedData, normalized.firstHighIsoDate);
  const hasUsableManualOverride =
    normalized.mode === 'manual' &&
    baselineTemp != null &&
    Number.isInteger(firstHighIndex) &&
    firstHighIndex >= 0;

  if (!hasUsableManualOverride) {
    const isPendingManualDraft = normalized.mode === 'manual' && baselineTemp != null;
    return {
      active: false,
      mode: normalized.mode,
      status: isPendingManualDraft ? 'pending' : 'auto',
      baselineTemp,
      firstHighIndex: null,
      firstHighIsoDate: normalized.firstHighIsoDate,
      previousSixIndices: [],
      warnings: isPendingManualDraft ? [createWarning('missing-first-high')] : [],
      rule: null,
      ovulationDetails: null,
    };
  }

  const coherence = getManualCoherenceWarnings({
    processedData,
    baselineTemp,
    firstHighIndex,
  });

  const evaluation = postpartum
    ? evaluateHighSequencePostpartum({ baselineTemp, firstHighIndex, processedData })
    : evaluateHighSequenceStandard({ baselineTemp, firstHighIndex, processedData });

  const sequenceDisplayIndices = filterValidIndices(
    processedData,
    evaluation?.sequenceDisplayIndices ?? []
  );
  const highOnlyIndices = filterValidIndices(processedData, evaluation?.highOnlyIndices ?? []);
  const usedIndices = filterValidIndices(processedData, evaluation?.usedIndices ?? []);
  const confirmationIndex = Number.isInteger(evaluation?.confirmationIndex)
    ? Math.max(0, Math.min(evaluation.confirmationIndex, processedData.length - 1))
    : null;
  const confirmed = Boolean(evaluation?.confirmed && Number.isInteger(confirmationIndex));
  const hasTemperaturesAfterStart = sequenceDisplayIndices.length > 0;
  const hasEnoughStandardDays = sequenceDisplayIndices.length >= 3;
  const strongManualWarning = hasBlockingManualWarning(coherence.warnings);
  const status = strongManualWarning
    ? 'invalid'
    : confirmed
    ? 'confirmed'
    : evaluation?.requireRebaseline
      ? 'invalid'
      : hasTemperaturesAfterStart && hasEnoughStandardDays
        ? 'pending'
        : 'insufficient';
  const rule = strongManualWarning || status === 'invalid'
    ? 'no-cumple'
    : evaluation?.rule ?? null;
  const requireRebaseline = Boolean(evaluation?.requireRebaseline || strongManualWarning);
  const resolvedConfirmationIndex = strongManualWarning ? null : confirmationIndex;

  return {
    active: true,
    mode: 'manual',
    source: 'manual',
    status,
    baselineTemp,
    baselineStartIndex: null,
    baselineIndices: [],
    firstHighIndex,
    firstHighIsoDate: normalized.firstHighIsoDate,
    confirmationIndex: resolvedConfirmationIndex,
    rule,
    sequenceDisplayIndices,
    highOnlyIndices,
    usedIndices,
    previousSixIndices: coherence.previousSixIndices,
    warnings: coherence.warnings,
    ovulationDetails: {
      confirmed: confirmed && !strongManualWarning,
      confirmationIndex: resolvedConfirmationIndex,
      infertileStartIndex: confirmed && !strongManualWarning ? resolvedConfirmationIndex : null,
      rule,
      requireRebaseline,
      sequenceDisplayIndices,
      highOnlyIndices,
      highSequenceIndices: sequenceDisplayIndices,
      usedIndices,
      previousSixIndices: coherence.previousSixIndices,
      warnings: coherence.warnings,
      ovulationIndex: firstHighIndex,
      source: 'manual',
      status,
      firstHighIsoDate: normalized.firstHighIsoDate,
    },
  };
};
