import { addDays, differenceInCalendarDays, isValid, parseISO, startOfDay, subDays } from 'date-fns';

const toDay = (value) => {
  if (!value || typeof value !== 'string') return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : null;
};

export const sortCyclesByStartDate = (cycles = []) => (
  [...cycles].sort((a, b) => {
    const startA = toDay(a?.startDate);
    const startB = toDay(b?.startDate);
    if (!startA && !startB) return 0;
    if (!startA) return 1;
    if (!startB) return -1;
    return startA - startB;
  })
);

export const getPrevCycleById = (cyclesSorted = [], cycleId) => {
  const index = cyclesSorted.findIndex((cycle) => cycle?.id === cycleId);
  return index > 0 ? cyclesSorted[index - 1] : null;
};

export const getNextCycleById = (cyclesSorted = [], cycleId) => {
  const index = cyclesSorted.findIndex((cycle) => cycle?.id === cycleId);
  return index >= 0 && index < cyclesSorted.length - 1 ? cyclesSorted[index + 1] : null;
};

export const computeCycleIntegrity = (cyclesSorted = []) => {
  const byCycleId = {};

  cyclesSorted.forEach((cycle) => {
    if (!cycle?.id) return;
    const prevCycle = getPrevCycleById(cyclesSorted, cycle.id);
    const nextCycle = getNextCycleById(cyclesSorted, cycle.id);
    const cycleStart = toDay(cycle.startDate);
    const cycleEnd = toDay(cycle.endDate);
    const prevEnd = toDay(prevCycle?.endDate);
    const nextStart = toDay(nextCycle?.startDate);

    const gapBeforeDays = prevEnd && cycleStart ? Math.max(0, differenceInCalendarDays(cycleStart, addDays(prevEnd, 1))) : 0;
    const gapAfterDays = cycleEnd && nextStart ? Math.max(0, differenceInCalendarDays(nextStart, addDays(cycleEnd, 1))) : 0;

    byCycleId[cycle.id] = {
      gapBeforeDays,
      gapAfterDays,
      hasGapBefore: gapBeforeDays > 0,
      hasGapAfter: gapAfterDays > 0,
      prevCycleId: prevCycle?.id ?? null,
      nextCycleId: nextCycle?.id ?? null,
    };
  });

  return byCycleId;
};

export const getContiguityWarningForDraft = ({ cycles = [], cycleId, draftStartDate, draftEndDate }) => {
  const sorted = sortCyclesByStartDate(cycles);
  const prevCycle = getPrevCycleById(sorted, cycleId);
  const nextCycle = getNextCycleById(sorted, cycleId);
  const newStart = toDay(draftStartDate);
  const newEnd = toDay(draftEndDate);
  const prevEnd = toDay(prevCycle?.endDate);
  const nextStart = toDay(nextCycle?.startDate);

  const expectedStart = prevEnd ? addDays(prevEnd, 1) : null;
  const expectedEnd = nextStart ? subDays(nextStart, 1) : null;

  const gapBeforeDays = expectedStart && newStart ? Math.max(0, differenceInCalendarDays(newStart, expectedStart)) : 0;
  const gapAfterDays = expectedEnd && newEnd ? Math.max(0, differenceInCalendarDays(expectedEnd, newEnd)) : 0;

  const adjustedStart = expectedStart ?? newStart;
  const adjustedEnd = expectedEnd ?? newEnd;
  const autoAdjustInvalid = adjustedStart && adjustedEnd ? adjustedStart > adjustedEnd : false;

  return {
    prevCycle,
    nextCycle,
    expectedStart,
    expectedEnd,
    hasGapBefore: gapBeforeDays > 0,
    hasGapAfter: gapAfterDays > 0,
    gapBeforeDays,
    gapAfterDays,
    autoAdjustStartDate: expectedStart,
    autoAdjustEndDate: expectedEnd,
    canAutoAdjust: !autoAdjustInvalid && Boolean(expectedStart || expectedEnd),
    autoAdjustReason: autoAdjustInvalid
      ? 'El auto-ajuste invierte el rango del ciclo (inicio posterior al fin).'
      : null,
  };
};
