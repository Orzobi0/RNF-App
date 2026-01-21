import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const normalizeMonth = (value) => value.replace('.', '').toLowerCase();

const formatMonth = (date) => normalizeMonth(format(date, 'MMM', { locale: es }));

const formatDayMonthYear = (date) => normalizeMonth(format(date, 'd MMM yyyy', { locale: es }));

export const formatCycleTitle = ({ startDate, endDate }) => {
  if (!endDate) {
    return 'Ciclo actual';
  }

  if (!startDate) {
    return 'Mis registros';
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (!isValid(start) || !isValid(end)) {
    return 'Mis registros';
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${formatMonth(start)} ${start.getFullYear()}`;
  }

  if (sameYear) {
    return `${start.getDate()} ${formatMonth(start)} – ${end.getDate()} ${formatMonth(end)} ${start.getFullYear()}`;
  }

  const yearRange = `${start.getFullYear()}–${String(end.getFullYear()).slice(-2)}`;
  return `${start.getDate()} ${formatMonth(start)} – ${end.getDate()} ${formatMonth(end)} · ${yearRange}`;
};

export const formatCycleMeta = ({ startDate, endDate, recordCount = 0, referenceDate = new Date() }) => {
  if (!startDate) {
    return `${recordCount} registros`;
  }

  const start = parseISO(startDate);

  if (!isValid(start)) {
    return `${recordCount} registros`;
  }

  if (!endDate) {
    const cycleDay = differenceInCalendarDays(startOfDay(referenceDate), startOfDay(start)) + 1;
    return `Desde ${formatDayMonthYear(start)} · Día ${cycleDay} · ${recordCount} registros`;
  }

  const end = parseISO(endDate);

  if (!isValid(end)) {
    return `${recordCount} registros`;
  }

  const duration = differenceInCalendarDays(startOfDay(end), startOfDay(start)) + 1;
  return `${duration} días · ${recordCount} registros`;
};