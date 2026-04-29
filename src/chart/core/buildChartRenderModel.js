import { isAfter, isSameDay, parseISO, startOfDay } from 'date-fns';
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

const hasTextValue = (value) => value != null && String(value).trim() !== '';

const hasRealDayData = (point, displayTemperature) => {
  if (displayTemperature != null) return true;
  if (normalizeTemp(point?.temperature_raw) != null) return true;
  if (normalizeTemp(point?.temperature_corrected) != null) return true;
  if (hasTextValue(point?.mucus_sensation ?? point?.mucusSensation)) return true;
  if (hasTextValue(point?.mucus_appearance ?? point?.mucusAppearance)) return true;
  if (hasTextValue(point?.observations ?? point?.notes)) return true;
  if (hasTextValue(point?.peakStatus ?? point?.peak_marker)) return true;
  if (Boolean(point?.had_relations ?? point?.hadRelations)) return true;

  const symbol = point?.fertility_symbol ?? point?.fertilitySymbol;
  return hasTextValue(symbol) && String(symbol).trim().toLowerCase() !== 'none';
};

const isPlaceholderDay = (point, displayTemperature) => {
  const id = String(point?.id || '');
  const hasRealId = id.trim() !== '' && !id.startsWith('placeholder-');
  return id.startsWith('placeholder-') || (!hasRealId && !hasRealDayData(point, displayTemperature));
};

const buildHighSequenceOrderByIndex = ({ dataPoints, ovulationDetails, firstHighIndex }) => {
  if (!ovulationDetails?.confirmed) return {};
  const preferredIndices = Array.isArray(ovulationDetails?.sequenceDisplayIndices)
    ? ovulationDetails.sequenceDisplayIndices
    : null;
  const fallbackIndices = Array.isArray(ovulationDetails?.highSequenceIndices)
    ? ovulationDetails.highSequenceIndices
    : [];
  const firstHighIdx = Number(firstHighIndex);
  const hasFirstHigh = Number.isInteger(firstHighIdx);
  const out = {};

  (preferredIndices ?? fallbackIndices)
    .map((value) => Number(value))
    .filter((idx) => Number.isInteger(idx) && (!hasFirstHigh || idx >= firstHighIdx))
    .forEach((idx, position) => {
      const point = dataPoints[idx];
      const calcTemperature =
        point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
      const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
      if (point && Number.isFinite(calcTemperature) && !ignoredForCalc && out[idx] == null) {
        out[idx] = position + 1;
      }
    });

  return out;
};

const buildBaselineOrderByIndex = ({ dataPoints, ovulationDetails, firstHighIndex }) => {
  if (!ovulationDetails?.confirmed) return {};
  const firstHighIdx = Number(firstHighIndex);
  if (!Number.isInteger(firstHighIdx)) return {};

  const out = {};
  let order = 1;
  for (let idx = firstHighIdx - 1; idx >= 0 && order <= 6; idx -= 1) {
    const point = dataPoints[idx];
    const calcTemperature =
      point?.calcTemperature != null ? point.calcTemperature : point?.displayTemperature;
    const ignoredForCalc = point?.ignoredForCalc != null ? point.ignoredForCalc : point?.ignored;
    if (point && Number.isFinite(calcTemperature) && !ignoredForCalc) {
      out[idx] = order;
      order += 1;
    }
  }

  return out;
};

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
  today = new Date(),
}) => {
  const dayBounds = layout?.dayBounds ?? [];
  const getX = layout?.getX ?? (() => 0);
  const getY = layout?.getY ?? (() => 0);
  const todayStart = startOfDay(today);
  const graphBottomY = layout?.graphBottomY ?? 0;
  const padding = layout?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const isWithinPlotArea = (y) =>
    Number.isFinite(y) && y >= padding.top && y <= graphBottomY;

  const days = dataPoints.map((point, index) => {
    const bounds = dayBounds[index] ?? {};
    const x = Number.isFinite(bounds.x) ? bounds.x : getX(index);
    const displayTemperature = normalizeTemp(point?.displayTemperature);
    let isFuture = Boolean(point?.isFutureDay);
    let isToday = false;

    if (point?.isoDate) {
      try {
        const parsed = startOfDay(parseISO(point.isoDate));
        if (!Number.isNaN(parsed?.getTime?.())) {
          isFuture = isAfter(parsed, todayStart);
          isToday = isSameDay(parsed, todayStart);
        }
      } catch (error) {
        // Keep malformed dates out of render-only date flags.
      }
    }

    return {
      index,
      point,
      source: point,
      id: point?.id ?? null,
      isoDate: point?.isoDate ?? null,
      date: point?.date ?? null,
      cycleDay: point?.cycleDay ?? null,
      x,
      left: bounds.left ?? x,
      right: bounds.right ?? x,
      width: bounds.width ?? 0,
      isFuture,
      isToday,
      isPlaceholder: isPlaceholderDay(point, displayTemperature),
      hasRelations: Boolean(point?.had_relations ?? point?.hadRelations),
      fertilitySymbol: point?.fertility_symbol ?? point?.fertilitySymbol ?? null,
      fertility_symbol: point?.fertility_symbol ?? point?.fertilitySymbol ?? null,
      peakStatus: point?.peakStatus ?? point?.peak_marker ?? null,
      mucusSensation: point?.mucusSensation ?? point?.mucus_sensation ?? null,
      mucus_sensation: point?.mucus_sensation ?? point?.mucusSensation ?? null,
      mucusAppearance: point?.mucusAppearance ?? point?.mucus_appearance ?? null,
      mucus_appearance: point?.mucus_appearance ?? point?.mucusAppearance ?? null,
      observations: point?.observations ?? point?.notes ?? null,
      displayTemperature,
      temperature_raw: point?.temperature_raw ?? null,
      temperature_corrected: point?.temperature_corrected ?? null,
      ignored: Boolean(point?.ignored),
      ignoredForCalc: Boolean(point?.ignoredForCalc),
      useCorrected: Boolean(point?.use_corrected),
      use_corrected: Boolean(point?.use_corrected),
      had_relations: Boolean(point?.had_relations ?? point?.hadRelations),
      hadRelations: Boolean(point?.had_relations ?? point?.hadRelations),
    };
  });

  const temperatures = dataPoints
    .map((point, index) => {
      const value = normalizeTemp(point?.displayTemperature);
      const rawValue = normalizeTemp(point?.temperature_raw);
      const correctedValue = normalizeTemp(point?.temperature_corrected);
      const x = days[index]?.x ?? getX(index);
      const useCorrected = Boolean(point?.use_corrected);
      const y = value !== null ? getY(value) : null;
      const rawY = rawValue !== null ? getY(rawValue) : null;
      const correctedY = correctedValue !== null ? getY(correctedValue) : null;

      return {
        index,
        x,
        y,
        value,
        rawValue,
        rawY,
        correctedValue,
        correctedY,
        ignored: Boolean(point?.ignored),
        ignoredForCalc: Boolean(point?.ignoredForCalc),
        useCorrected,
        hasCorrection: hasTemperatureCorrection(rawValue, correctedValue, value, useCorrected),
        isWithinPlotArea: isWithinPlotArea(y),
      };
    })
    .filter((point) => point.value !== null || point.rawValue !== null || point.correctedValue !== null);
  const temperaturesByIndex = [];
  temperatures.forEach((temperature) => {
    temperaturesByIndex[temperature.index] = temperature;
  });

  const baselineY = baselineTemp != null ? getY(baselineTemp) : null;
  const highSequenceOrderByIndex = buildHighSequenceOrderByIndex({
    dataPoints,
    ovulationDetails,
    firstHighIndex,
  });
  const baselineOrderByIndex = buildBaselineOrderByIndex({
    dataPoints,
    ovulationDetails,
    firstHighIndex,
  });

  return {
    dimensions: layout?.dimensions ?? {},
    padding,
    graph: {
      tempMin,
      tempMax,
      tempRange,
      graphBottomY,
      chartAreaHeight: layout?.chartAreaHeight ?? 0,
      effectiveChartAreaHeight: layout?.effectiveChartAreaHeight ?? 0,
      graphBottomInset: layout?.graphBottomInset ?? 0,
      rowsZoneHeight: layout?.rowsZoneHeight ?? 0,
    },
    days,
    temperatures,
    temperaturesByIndex,
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
      highSequenceOrderByIndex,
      baselineOrderByIndex,
    },
    interpretationSegments,
  };
};
