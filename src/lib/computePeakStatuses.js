import { addDays, format, isAfter, parseISO, startOfDay } from 'date-fns';

const isPlaceholderRecord = (record) =>
  Boolean(record?.id) && String(record.id).startsWith('placeholder-');

export const computePeakStatuses = (records = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    return {};
  }

  const today = startOfDay(new Date());
  const peakRecord = records
    .filter((record) => {
      if (!record || !record.isoDate) return false;
      if (isPlaceholderRecord(record)) return false;
      if (record.peak_marker !== 'peak') return false;
      const recordDate = startOfDay(parseISO(record.isoDate));
      return !isAfter(recordDate, today);
    })
    .sort((a, b) => parseISO(a.isoDate) - parseISO(b.isoDate))[0];

  if (!peakRecord) {
    return {};
  }

  const baseDate = startOfDay(parseISO(peakRecord.isoDate));
  const peakIso = format(baseDate, 'yyyy-MM-dd');
  const statuses = { [peakIso]: 'P' };

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidateDate = addDays(baseDate, offset);
    if (isAfter(candidateDate, today)) {
      break;
    }

    const candidateIso = format(candidateDate, 'yyyy-MM-dd');
    statuses[candidateIso] = String(offset);
  }

  return statuses;
};

export default computePeakStatuses;