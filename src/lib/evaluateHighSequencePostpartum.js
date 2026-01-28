export const evaluateHighSequencePostpartum = ({
  baselineTemp: currentBaselineTemp,
  firstHighIndex: sequenceStartIndex,
  processedData,
  isValid,
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
  let lineOrBelowCount = 0;
  let ex2Active = false;
  let ex2QualifiedIndex = null;
  let ex1Triggered = false;
  const precedingLowIndex = sequenceStartIndex > 0 ? sequenceStartIndex - 1 : null;

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

  for (let idx = sequenceStartIndex; idx < processedData.length; idx += 1) {
    const point = processedData[idx];
    if (!isValid(point)) break;

    const temp = point.displayTemperature;
    if (!Number.isFinite(temp)) break;

    if (temp > currentBaselineTemp) {
      addSequenceIndex(idx);
      highs.push({ index: idx, temp });

      // Ex1 solo aplica si NO estamos en Ex2 (no se combinan excepciones)
      if (!ex2Active && highs.length === 3 && highs[2].temp < requiredRise) {
        ex1Triggered = true;
      }

      if (!ex2Active && highs.length === 4 && highs[2].temp >= requiredRise) {
        return {
          confirmed: true,
          confirmationIndex: highs[3].index,
          usedIndices: buildUsedIndices(),
          highSequenceIndices: [...sequenceIndices],
          rule: "pp-4-high",
        };
      }

      if (!ex2Active && ex1Triggered && highs.length === 5) {
        return {
          confirmed: true,
          confirmationIndex: highs[4].index,
          usedIndices: buildUsedIndices(),
          highSequenceIndices: [...sequenceIndices],
          rule: "pp-ex1-5-high",
        };
      }

      if (ex2Active) {
        // En Ex2, el "4º alto" (tras el día en línea/bajo) debe ser >= baseline+0.2.
        // Si no lo es, NO se confirma y se fuerza rebaseline (no se puede combinar con Ex1).
        if (highs.length === 4 && ex2QualifiedIndex == null) {
          if (temp >= requiredRise) {
            ex2QualifiedIndex = idx; // este es el 4º alto válido
          } else {
            return ensureRebaseline();
          }
        }

        // Posparto: +1 día alto adicional tras la confirmación base => 5º alto
        if (ex2QualifiedIndex != null && highs.length >= 5) {
          const confirmationIndex = highs[highs.length - 1].index; // 5º alto
          if (confirmationIndex !== ex2QualifiedIndex) {
            return {
              confirmed: true,
              confirmationIndex,
              usedIndices: buildUsedIndices(),
              highSequenceIndices: [...sequenceIndices],
              rule: "pp-ex2-5-high",
            };
          }
        }
      }

      continue;
    }

    if (temp <= currentBaselineTemp) {
      lineOrBelowCount += 1;
      addSequenceIndex(idx);

      if (lineOrBelowCount >= 2) {
        return ensureRebaseline();
      }

      if (highs.length > 0 && highs.length < 3 && !ex2Active) {
        ex2Active = true;
        continue;
      }

      break;
    }

    break;
  }

  return {
    confirmed: false,
    usedIndices: buildUsedIndices(),
    highSequenceIndices: [...sequenceIndices],
  };
};