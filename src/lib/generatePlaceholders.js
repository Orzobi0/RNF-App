import { addDays, format, differenceInDays, startOfDay, parseISO } from 'date-fns';

export function generatePlaceholders(startDate, daysInCycle) {
  if (!startDate || !daysInCycle) return [];
  const cycleStart = typeof startDate === 'string' ? parseISO(startDate) : startDate;

  return [...Array(daysInCycle)].map((_, i) => {
    const date = addDays(cycleStart, i);
    const isoDate = format(date, 'yyyy-MM-dd');
    const formattedDate = format(date, 'dd/MM');
    const cycleDay = differenceInDays(startOfDay(date), startOfDay(cycleStart)) + 1;

    return {
      date: formattedDate,
      isoDate,
      cycleDay,
      temperature: null,
      mucusSensation: null,
      mucusAppearance: null,
      id: `placeholder-${isoDate}`,
      ignored: false,
      peak_marker: null,
    };
  });
}

export default generatePlaceholders;