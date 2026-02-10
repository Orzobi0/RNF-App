import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import useBackClose from '@/hooks/useBackClose';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import OverlapWarningDialog from './OverlapWarningDialog';
import { format, parseISO, isValid, startOfDay, isSameDay, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

const EditCycleDatesDialog = ({
  isOpen,
  onClose,
  onConfirm,
  initialStartDate,
  initialEndDate,
  includeEndDate = true,
  title = 'Editar Fechas del Ciclo',
  description,
  cycleId,
  checkOverlap,
  errorMessage,
  conflictCycle,
  onResetError,
  cycleData = [],
  otherCycles = [],
}) => {
  const [startDate, setStartDate] = useState(initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEndDate || '');
  const [endDateError, setEndDateError] = useState('');
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);

  useBackClose(isOpen, onClose);

  useEffect(() => {
    setStartDate(initialStartDate || '');
    setEndDate(initialEndDate || '');
  }, [initialStartDate, initialEndDate]);

  const formatConflictDetails = () => {
    if (!conflictCycle) return null;

    const formatDate = (date) => {
      if (!date) return null;
      try {
        return format(parseISO(date), 'dd/MM/yyyy');
      } catch (error) {
        console.error('Error formatting conflict date', error);
        return date;
      }
    };

    const start = formatDate(conflictCycle.startDate) ?? 'sin fecha de inicio';
    const end = conflictCycle.endDate ? formatDate(conflictCycle.endDate) : 'en curso';
    return `Conflicto con el ciclo del ${start} al ${end}.`;
  };

  const clearInlineErrors = () => {
    setEndDateError('');
    if (onResetError) {
      onResetError();
    }
  };

  const handleStartChange = (value) => {
    setStartDate(value);
    clearInlineErrors();
  };

  const handleEndChange = (value) => {
    setEndDate(value);
    setEndDateError('');
    if (onResetError) {
      onResetError();
    }
  };

  const conflictDetails = formatConflictDetails();

  const toDate = (value) => {
    if (!value) return null;
    const parsed = parseISO(value);
    return isValid(parsed) ? startOfDay(parsed) : null;
  };

  const selectedStartDate = toDate(startDate);
  const selectedEndDate = toDate(endDate);

  const recordedDates = (cycleData ?? [])
    .map((record) => toDate(record?.isoDate))
    .filter(Boolean);

  const activeCycle = otherCycles.find((candidate) => candidate?.id === cycleId);
  const activeCycleStart = toDate(activeCycle?.startDate);
  const activeCycleEnd = toDate(activeCycle?.endDate);
  const activeCycleRange = activeCycleStart
    ? { from: activeCycleStart, to: activeCycleEnd ?? activeCycleStart }
    : undefined;

    const isRangeStart = (date, range) => Boolean(range?.from && isSameDay(date, range.from));
  const isRangeEnd = (date, range) => {
    if (!range?.to) return false;
    return isSameDay(date, range.to) && !isSameDay(range.from, range.to);
  };
  const isRangeMiddle = (date, range) => {
    if (!range?.from || !range?.to || isSameDay(range.from, range.to)) return false;
    return isAfter(date, range.from) && isBefore(date, range.to);
  };
  const matchesAnyRange = (date, ranges, matcher) => ranges.some((range) => matcher(date, range));

  const otherCycleRanges = (otherCycles ?? [])
    .filter((candidate) => candidate?.id && candidate.id !== cycleId)
    .map((candidate) => {
      const start = toDate(candidate?.startDate);
      const end = toDate(candidate?.endDate);
      if (!start) return null;
      return { from: start, to: end ?? start };
    })
    .filter(Boolean);

  const handleConfirm = async () => {
    if (includeEndDate && !endDate) {
      setEndDateError('La fecha de fin es obligatoria');
      return;
    }
    if (includeEndDate && startDate && endDate && endDate < startDate) {
      setEndDateError('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }
    const payload = includeEndDate
      ? { startDate, endDate }
      : { startDate };
    if (checkOverlap && cycleId && startDate) {
      const overlap = await checkOverlap(
        cycleId,
        startDate,
        includeEndDate ? endDate || undefined : undefined
      );
      if (overlap) {
        setOverlapCycle(overlap);
        setPendingPayload(payload);
        setShowOverlapDialog(true);
        return;
      }
    }
    onConfirm(payload);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-white border-pink-100 text-gray-800">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-gray-600">
              {description ?? (includeEndDate
                ? 'Modifica la fecha de inicio y fin del ciclo.'
                : 'Modifica la fecha de inicio del ciclo.')}
            </DialogDescription>
          </DialogHeader>
          {(errorMessage || conflictCycle) && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold text-red-800">No se pudo guardar el ciclo</p>
              {errorMessage && <p className="mt-1">{errorMessage}</p>}
              {conflictDetails && <p className="mt-1">{conflictDetails}</p>}
              <p className="mt-3 text-xs text-red-600">
                Ajusta las fechas para que no se superpongan con ciclos existentes.
              </p>
            </div>
          )}
          <div className="my-4 space-y-4">
            <div>
              <label htmlFor="startDate" className="text-gray-700 text-sm">
                Inicio del ciclo
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1 w-full justify-start border-gray-200 bg-gray-50 text-left font-normal text-gray-800"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedStartDate
                      ? format(selectedStartDate, 'PPP', { locale: es })
                      : 'Selecciona una fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedStartDate}
                    onSelect={(selectedDate) => {
                      if (!selectedDate) return;
                      handleStartChange(format(startOfDay(selectedDate), 'yyyy-MM-dd'));
                    }}
                    locale={es}
                    initialFocus
                    defaultMonth={selectedStartDate ?? activeCycleStart ?? new Date()}
                    enableSwipeNavigation
                    modifiers={{
                      hasRecord: recordedDates,
                      inActiveCycleStart: (date) => isRangeStart(date, activeCycleRange),
                      inActiveCycleMiddle: (date) => isRangeMiddle(date, activeCycleRange),
                      inActiveCycleEnd: (date) => isRangeEnd(date, activeCycleRange),
                      inOtherCycleStart: (date) => matchesAnyRange(date, otherCycleRanges, isRangeStart),
                      inOtherCycleMiddle: (date) => matchesAnyRange(date, otherCycleRanges, isRangeMiddle),
                      inOtherCycleEnd: (date) => matchesAnyRange(date, otherCycleRanges, isRangeEnd),
                    }}
                    modifiersClassNames={{
                      hasRecord:
                        'relative after:content-[""] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:h-1.5 after:w-1.5 after:rounded-full after:bg-fertiliapp-fuerte',
                      inActiveCycleStart: 'in-cycle-range-start',
                      inActiveCycleMiddle: 'in-cycle-range-middle',
                      inActiveCycleEnd: 'in-cycle-range-end',
                      inOtherCycleStart: 'in-other-cycle-range-start',
                      inOtherCycleMiddle: 'in-other-cycle-range-middle',
                      inOtherCycleEnd: 'in-other-cycle-range-end',
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {includeEndDate && (
              <div>
                <label htmlFor="endDate" className="text-gray-700 text-sm">
                  Fin del ciclo
                </label>
                 <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-1 w-full justify-start border-gray-200 bg-gray-50 text-left font-normal text-gray-800"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedEndDate
                        ? format(selectedEndDate, 'PPP', { locale: es })
                        : 'Selecciona una fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedEndDate}
                      onSelect={(selectedDate) => {
                        if (!selectedDate) return;
                        handleEndChange(format(startOfDay(selectedDate), 'yyyy-MM-dd'));
                      }}
                      locale={es}
                      initialFocus
                      defaultMonth={selectedEndDate ?? activeCycleEnd ?? activeCycleStart ?? new Date()}
                      enableSwipeNavigation
                      modifiers={{
                        hasRecord: recordedDates,
                        inActiveCycleStart: (date) => isRangeStart(date, activeCycleRange),
                        inActiveCycleMiddle: (date) => isRangeMiddle(date, activeCycleRange),
                        inActiveCycleEnd: (date) => isRangeEnd(date, activeCycleRange),
                        inOtherCycleStart: (date) => matchesAnyRange(date, otherCycleRanges, isRangeStart),
                        inOtherCycleMiddle: (date) => matchesAnyRange(date, otherCycleRanges, isRangeMiddle),
                        inOtherCycleEnd: (date) => matchesAnyRange(date, otherCycleRanges, isRangeEnd),
                      }}
                      modifiersClassNames={{
                        hasRecord:
                          'relative after:content-[""] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:h-1.5 after:w-1.5 after:rounded-full after:bg-fertiliapp-fuerte',
                        inActiveCycleStart: 'in-cycle-range-start',
                        inActiveCycleMiddle: 'in-cycle-range-middle',
                        inActiveCycleEnd: 'in-cycle-range-end',
                        inOtherCycleStart: 'in-other-cycle-range-start',
                        inOtherCycleMiddle: 'in-other-cycle-range-middle',
                        inOtherCycleEnd: 'in-other-cycle-range-end',
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {endDateError && (
                  <p className="text-red-500 text-sm mt-1">{endDateError}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-end">
            <Button variant="outline" onClick={onClose} className="border-gray-300 text-titulo hover:bg-gray-100">Cancelar</Button>
            <Button variant="primary" onClick={handleConfirm} className="bg-pink-600 hover:bg-pink-700 text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OverlapWarningDialog
        isOpen={showOverlapDialog}
        conflictCycle={overlapCycle}
        onCancel={() => setShowOverlapDialog(false)}
        onConfirm={() => {
          setShowOverlapDialog(false);
          if (pendingPayload) {
            onConfirm({ ...pendingPayload, force: true });
          }
        }}
      />
    </>
  );
};

export default EditCycleDatesDialog;
