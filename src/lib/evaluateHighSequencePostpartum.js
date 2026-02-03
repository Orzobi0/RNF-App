export const evaluateHighSequencePostpartum = ({
  baselineTemp: currentBaselineTemp,
  firstHighIndex: sequenceStartIndex,
  processedData,
  isValid,
  findPreviousValidIndex,
}) => {
  if (sequenceStartIndex == null) {
    return { confirmed: false };
  }

  const getCalcTemperature = (point) =>
    point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;

  const isIgnoredForCalc = (point) =>
    point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;

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
  // Evitamos usar index-1 porque puede apuntar a un día ignorado o sin temperatura.
  const precedingLowIndex =
    typeof findPreviousValidIndex === 'function'
      ? findPreviousValidIndex(sequenceStartIndex - 1)
      : sequenceStartIndex > 0
        ? sequenceStartIndex - 1
        : null;

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
    const borderlineTolerance = 0.05;
    const point = processedData[idx];
    if (!point) break;

    // Ignorado/trastorno: NO rompe la secuencia, simplemente se salta
    if (isIgnoredForCalc(point)) continue;

    // Si no es válido ya no es por ignorado: es ausencia/valor inválido => rompe (prudencia)
    if (!isValid(point)) break;

    const temp = getCalcTemperature(point);
    if (!Number.isFinite(temp)) break;

    const isLineOrSlightlyBelow =
      temp <= currentBaselineTemp && temp >= currentBaselineTemp - borderlineTolerance;
    const isClearlyBelow =
      temp < currentBaselineTemp - borderlineTolerance;

       // Si baja claramente por debajo de la línea básica, no lo tratamos como Ex2.
    // Es demasiado “bajo” para considerarlo un rasante: prudencia => rebaseline.
    if (isClearlyBelow) {
      addSequenceIndex(idx);
      return ensureRebaseline();
    }
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
        ex1Triggered = false; // por seguridad: no combinamos excepciones
        // En Ex2, el "4º alto" (tras el día en línea/bajo) debe ser >= baseline+0.2.
        // Si no lo es, NO se confirma y se fuerza rebaseline (no se puede combinar con Ex1).
        if (highs.length === 3 && ex2QualifiedIndex == null) {
          if (temp >= requiredRise) {
            ex2QualifiedIndex = idx; // este es el 4º alto válido
          } else {
            return ensureRebaseline();
          }
        }

        // Posparto: +1 día alto adicional tras la confirmación base => 5º alto
        if (ex2QualifiedIndex != null && highs.length >= 4) {
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

    if (isLineOrSlightlyBelow) {
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