import { normalizeTemp } from './temperatureUtils';

const hasTemperatureCorrection = (rawValue, correctedValue, displayValue, useCorrected) =>
  Boolean(
    useCorrected &&
    rawValue !== null &&
    correctedValue !== null &&
    displayValue !== null &&
    Math.abs(correctedValue - rawValue) > 1e-6 &&
    Math.abs(displayValue - correctedValue) < 1e-6
  );

export const buildChartRenderModel = ({
  layout,
  dataPoints = [],
  tempMin,
  tempMax,
  tempRange,
  todayIndex,
  baselineTemp,
  baselineStartIndex,
  firstHighIndex,
  baselineIndices = [],
  ovulationDetails = null,
  fertilityStart = null,
  interpretationSegments = [],
}) => {
  const dayBounds = layout?.dayBounds ?? [];
  const getX = layout?.getX ?? (() => 0);
  const getY = layout?.getY ?? (() => 0);

  const days = dataPoints.map((point, index) => {
    const bounds = dayBounds[index] ?? {};
    const x = Number.isFinite(bounds.x) ? bounds.x : getX(index);

    return {
      index,
      isoDate: point?.isoDate ?? null,
      date: point?.date ?? null,
      cycleDay: point?.cycleDay ?? null,
      x,
      left: bounds.left ?? x,
      right: bounds.right ?? x,
      width: bounds.width ?? 0,
      isFuture: Boolean(point?.isFutureDay),
      isToday: Number.isInteger(todayIndex) && index === todayIndex,
      isPlaceholder: !point?.isoDate,
    };
  });

  const temperatures = dataPoints
    .map((point, index) => {
      const value = normalizeTemp(point?.displayTemperature);
      const rawValue = normalizeTemp(point?.temperature_raw);
      const correctedValue = normalizeTemp(point?.temperature_corrected);
      const x = days[index]?.x ?? getX(index);
      const useCorrected = Boolean(point?.use_corrected);

      return {
        index,
        x,
        y: value !== null ? getY(value) : null,
        value,
        rawValue,
        rawY: rawValue !== null ? getY(rawValue) : null,
        correctedValue,
        correctedY: correctedValue !== null ? getY(correctedValue) : null,
        ignored: Boolean(point?.ignored),
        ignoredForCalc: Boolean(point?.ignoredForCalc),
        useCorrected,
        hasCorrection: hasTemperatureCorrection(rawValue, correctedValue, value, useCorrected),
      };
    })
    .filter((point) => point.value !== null || point.rawValue !== null || point.correctedValue !== null);

  const baselineY = baselineTemp != null ? getY(baselineTemp) : null;

  return {
    dimensions: layout?.dimensions ?? {},
    padding: layout?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 },
    graph: {
      tempMin,
      tempMax,
      tempRange,
      graphBottomY: layout?.graphBottomY ?? 0,
      chartAreaHeight: layout?.chartAreaHeight ?? 0,
      effectiveChartAreaHeight: layout?.effectiveChartAreaHeight ?? 0,
      graphBottomInset: layout?.graphBottomInset ?? 0,
      rowsZoneHeight: layout?.rowsZoneHeight ?? 0,
    },
    days,
    temperatures,
    rows: layout?.rows ?? {},
    fertility: {
      baselineTemp,
      baselineY,
      baselineStartIndex,
      baselineStartX: dataPoints.length ? getX(0) : null,
      baselineEndX: dataPoints.length ? getX(dataPoints.length - 1) : null,
      firstHighIndex,
      baselineIndices,
      ovulationDetails,
      fertilityStart,
    },
    interpretationSegments,
  };
};
