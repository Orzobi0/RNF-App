export const evaluateHighSequencePostpartum = ({
  baselineTemp: currentBaselineTemp,
  firstHighIndex: sequenceStartIndex,
  processedData,
}) => {
  if (sequenceStartIndex == null) {
    return { confirmed: false };
  }

  const getCalcTemperature = (point) =>
    point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;

  const isIgnoredForCalc = (point) =>
    point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;

  const requiredRise = Number((currentBaselineTemp + 0.2).toFixed(2));

  const sequenceDisplayIndices = [];
  const highOnlyIndices = [];
  let lineOrBelowCount = 0;
  let mode = null; // null | 'first-exception' | 'second-exception'
  let standardConfirmed = false;
  let standardRule = null;

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

    // Primero: confirmar como modo normal
    if (!standardConfirmed) {
      if (dayNumber === 1 && !isHigh) {
        return buildResult({ requireRebaseline: true });
      }

      if (lineOrBelowCount >= 2) {
        return buildResult({ requireRebaseline: true });
      }

      if (dayNumber < 3) {
        continue;
      }

      if (dayNumber === 3) {
        if (lineOrBelowCount === 0) {
          if (!isHigh) {
            return buildResult({ requireRebaseline: true });
          }

          if (isAtLeastPlusPointTwo) {
            standardConfirmed = true;
            standardRule = '3-high';
            continue;
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

      if (dayNumber === 4) {
        if (mode === 'first-exception') {
          if (!isHigh) {
            return buildResult({ requireRebaseline: true });
          }

          standardConfirmed = true;
          standardRule = 'german-3+1';
          continue;
        }

        if (mode === 'second-exception') {
          if (isHigh && isAtLeastPlusPointTwo) {
            standardConfirmed = true;
            standardRule = 'german-2nd-exception';
            continue;
          }

          return buildResult({ requireRebaseline: true });
        }

        return buildResult({ requireRebaseline: true });
      }

      return buildResult({ requireRebaseline: true });
    }

    // Después: exigir 1 día extra postparto
    if (isHigh) {
      return buildResult({
        confirmed: true,
        confirmationIndex: idx,
        rule: `pp-after-${standardRule}`,
      });
    }

    return buildResult({ requireRebaseline: true });
  }

  return buildResult();
};