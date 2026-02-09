import React from 'react';
import { format, parseISO, startOfDay, isValid, isSameDay, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';

  const parsedDate = new Date(dateString);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  const day = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const year = String(parsedDate.getFullYear());

  return `${day}/${month}/${year}`;
};

const CycleDatesEditor = ({
  cycle,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSave,
  onCancel,
  isProcessing = false,
  dateError = '',
  includeEndDate = true,
  showOverlapDialog = false,
  overlapCycle = null,
  onConfirmOverlap,
  onCancelOverlap,
  title = 'Editar fechas del ciclo',
  description = 'Actualiza las fechas de inicio y fin del ciclo. Guarda los cambios cuando termines.',
  saveLabel = 'Guardar',
  cancelLabel = 'Cancelar',
  onClearError,
  className = 'mb-6 mx-auto w-full max-w-xl',
  onDeleteCycle,
  deleteTitle = 'Eliminar ciclo',
  deleteDescription = 'Esta acción no se puede deshacer. Se eliminarán todos los registros asociados.',
  deleteLabel = 'Eliminar ciclo',
  isDeletingCycle = false,
  onUndoCycle,
  isUndoingCycle = false,
  otherCycles = [],
}) => {
  const formattedStartDate = cycle?.startDate ? formatDateDisplay(cycle.startDate) : null;
  const formattedEndDate = cycle?.endDate ? formatDateDisplay(cycle.endDate) : 'En curso';

  const currentRangeLabel = formattedStartDate
    ? `Fecha actual: ${formattedStartDate}${includeEndDate ? ` — ${formattedEndDate}` : ''}`
    : null;
  
  const toDate = (value) => {
    if (!value) return null;
    const parsed = parseISO(value);
    return isValid(parsed) ? startOfDay(parsed) : null;
  };

  const selectedStartDate = toDate(startDate);
  const selectedEndDate = toDate(endDate);
  const cycleStart = toDate(cycle?.startDate);
  const cycleEnd = toDate(cycle?.endDate);

  const recordedDates = (cycle?.data ?? [])
    .map((record) => toDate(record?.isoDate))
    .filter(Boolean);

  const otherCycleRanges = otherCycles
    .filter((candidate) => candidate?.id && cycle?.id && candidate.id !== cycle.id)
    .map((candidate) => {
      const start = toDate(candidate?.startDate);
      const end = toDate(candidate?.endDate);
      if (!start) return null;
      return { from: start, to: end ?? start };
    })
    .filter(Boolean);

  const activeCycleRange = cycleStart ? { from: cycleStart, to: cycleEnd ?? cycleStart } : undefined;  
  
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
  const handleStartChange = (event) => {
    if (onClearError) {
      onClearError();
    }
    onStartDateChange?.(event.target.value);
  };

  const handleEndChange = (event) => {
    if (onClearError) {
      onClearError();
    }
    onEndDateChange?.(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.();
  };

  return (
    <>
      <div className={`${className} rounded-3xl border border-rose-100 bg-white/90 p-5 shadow-md`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-titulo mb-1">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
            {currentRangeLabel && (
              <p className="text-xs text-slate-500 mt-1">{currentRangeLabel}</p>
            )}
            <div className={`grid ${includeEndDate ? 'grid-cols-2 gap-4' : 'grid-cols-1 gap-4'}`}>
              <label className="flex h-full flex-col text-sm text-slate-700">
                Inicio del ciclo
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-1 w-full justify-start border-fertiliapp-suave bg-white text-left font-normal text-slate-800"
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
                        handleStartChange({ target: { value: format(startOfDay(selectedDate), 'yyyy-MM-dd') } });
                      }}
                      locale={es}
                      initialFocus
                      defaultMonth={selectedStartDate ?? cycleStart ?? new Date()}
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
              </label>
              {includeEndDate && (
                <label className="flex h-full flex-col text-sm text-slate-700">
                  Fin del ciclo
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-1 w-full justify-start border-fertiliapp-suave bg-white text-left font-normal text-slate-800"
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
                          handleEndChange({ target: { value: format(startOfDay(selectedDate), 'yyyy-MM-dd') } });
                        }}
                        locale={es}
                        initialFocus
                        defaultMonth={selectedEndDate ?? cycleEnd ?? cycleStart ?? new Date()}
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
                </label>
              )}
            </div>
            {dateError && <p className="mt-2 text-sm text-red-500">{dateError}</p>}
            <div className="mt-4 flex flex-wrap gap-3 justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="border-fertiliapp-suave text-titulo hover:brightness-95"
                disabled={isProcessing || isUndoingCycle}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                className="bg-fertiliapp-fuerte text-white shadow hover:brightness-95"
                disabled={isProcessing || isUndoingCycle}
              >
                {saveLabel}
              </Button>
            </div>
            {onUndoCycle && (
              <div className="mt-4 rounded-3xl bg-amber-50 p-4 text-left">
                <h3 className="font-semibold text-slate-800 mb-2">Deshacer ciclo</h3>
                <p className="text-sm text-slate-700 mb-3">
                  Une el ciclo actual con el anterior y mueve todos los registros.
                </p>
                <Button
                  type="button"
                  onClick={onUndoCycle}
                  disabled={isProcessing || isUndoingCycle}
                  className="w-full sm:w-auto bg-amber-500 hover:brightness-95 text-white shadow-md"
                >
                  {isUndoingCycle ? 'Deshaciendo…' : 'Deshacer ciclo'}
                </Button>
              </div>
            )}
            {onDeleteCycle && (
              <div className="mt-6 rounded-3xl bg-alerta-2-suave p-4 text-left">
                <h3 className="font-semibold text-slate-800 mb-2">{deleteTitle}</h3>
                {deleteDescription && (
                  <p className="text-sm text-slate-800 mb-3">{deleteDescription}</p>
                )}
                <Button
                  type="button"
                  onClick={onDeleteCycle}
                  disabled={isProcessing || isDeletingCycle || isUndoingCycle}
                  className="w-full sm:w-auto bg-alerta-2 hover:brightness-95 text-white shadow-md"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleteLabel}
                </Button>
              </div>
            )}
          </div>
        </form>
      </div>
      <OverlapWarningDialog
        isOpen={showOverlapDialog}
        conflictCycle={overlapCycle}
        onCancel={onCancelOverlap}
        onConfirm={onConfirmOverlap}
      />
    </>
  );
};

export default CycleDatesEditor;