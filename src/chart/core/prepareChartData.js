import { parseISO, differenceInCalendarDays } from 'date-fns';
import { normalizePeakStatus } from './peakStatusUtils';
import { normalizeTemp, resolveEffectiveTemperature } from './temperatureUtils';

export const prepareChartData = (data, peakStatusByIsoDate = {}) =>
  data.map((entry) => {
    const resolvedValue = resolveEffectiveTemperature(entry);
    const measurementIgnored = Array.isArray(entry?.measurements)
      ? entry.measurements.some((measurement) => measurement?.ignored)
      : false;
    const isoDate = entry?.isoDate;
    const peakMarker = entry?.peak_marker ?? entry?.peakStatus ?? null;
    const resolvedPeakStatus = isoDate
      ? peakStatusByIsoDate[isoDate] ?? peakMarker
      : peakMarker;
    const normalizedPeakStatus = normalizePeakStatus(resolvedPeakStatus);
    const displayTemperature = normalizeTemp(resolvedValue);
    const ignoredForCalc = Boolean(entry?.ignored || measurementIgnored);

    return {
      ...entry,
      displayTemperature,
      calcTemperature: ignoredForCalc ? null : displayTemperature,
      ignoredForCalc,
      peakStatus: resolvedPeakStatus ?? null,
      normalizedPeakStatus,
    };
  });

export const getCorrectedPriorityWarnings = (data) =>
  data
    .map((entry) => {
      const resolvedValue = resolveEffectiveTemperature(entry);
      const corrected = normalizeTemp(entry?.temperature_corrected);

      if (!entry?.use_corrected || corrected === null || resolvedValue === corrected) {
        return null;
      }

      return {
        isoDate: entry?.isoDate,
        resolvedValue,
        corrected,
      };
    })
    .filter(Boolean);

export const calculateTodayIndex = (processedData, today = new Date()) => {
  if (!Array.isArray(processedData) || processedData.length === 0) {
    return null;
  }

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
      // Keep malformed dates out of the render model without changing chart data.
    }
  });

  return lastIndex;
};
