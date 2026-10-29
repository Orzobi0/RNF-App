import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';

const NewCycleDialog = ({
  isOpen,
  onClose,
  onConfirm,
  onPreview,
  currentCycleStartDate,
  currentCycleRecords = [],
  initialStartDate,
}) => {
  const [startDate, setStartDate] = useState(initialStartDate || format(new Date(), 'yyyy-MM-dd'));
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [impactPreview, setImpactPreview] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const busyRef = useRef(false);
  const handleClose = () => {
    if (!busyRef.current) onClose();
  };
  useBackClose(isOpen, handleClose);

  useEffect(() => {
    if (!isOpen || (!isCreating && !isPreviewing)) return;

    // Keep the existing dialog history entry while busy, including repeated
    // mobile Back gestures. Capture runs before the router/useBackClose handlers.
    const dialogState = window.history.state;
    const dialogUrl = window.location.href;
    const preventBack = (event) => {
      event.stopImmediatePropagation();
      window.history.pushState(dialogState, '', dialogUrl);
    };
    window.addEventListener('popstate', preventBack, true);
    return () => window.removeEventListener('popstate', preventBack, true);
  }, [isOpen, isCreating, isPreviewing]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setStartDate(initialStartDate || format(new Date(), 'yyyy-MM-dd'));
    setShowOverlapWarning(false);
    setPendingStartDate(null);
    setImpactPreview(null);
  }, [initialStartDate, isOpen]);

  const isFirstCycle = !currentCycleStartDate;

  const hasOverlapRecords = useMemo(() => {
    if (isFirstCycle || !startDate || !currentCycleRecords.length) {
      return false;
    }

    const selectedDate = startOfDay(parseISO(startDate));
    if (!isValid(selectedDate)) {
      return false;
    }

    return currentCycleRecords.some((record) => {
      if (!record?.isoDate) return false;
      const recordDate = startOfDay(parseISO(record.isoDate));
      if (!isValid(recordDate)) return false;
      return recordDate.getTime() >= selectedDate.getTime();
    });
  }, [currentCycleRecords, isFirstCycle, startDate]);

  const createCycle = async (date) => {
    setIsCreating(true);
    try {
      // The caller also awaits the data reload and owns success/error handling.
      await onConfirm(date);
    } finally {
      setIsCreating(false);
      setShowOverlapWarning(false);
      setPendingStartDate(null);
      setImpactPreview(null);
      busyRef.current = false;
    }
  };

  const handleConfirm = async () => {
    if (busyRef.current || showOverlapWarning) return;
    busyRef.current = true;
    setIsPreviewing(true);
    try {
      if (onPreview) {
        const preview = await onPreview(startDate);
        if (preview) {
          setImpactPreview(preview);
          setPendingStartDate(startDate);
          setShowOverlapWarning(true);
          return;
        }
      }

      if (!isFirstCycle && hasOverlapRecords) {
        setPendingStartDate(startDate);
        setShowOverlapWarning(true);
        return;
      }
      await createCycle(startDate);
    } finally {
      setIsPreviewing(false);
      busyRef.current = false;
    }
  };

  const handleConfirmOverlap = () => {
    if (!pendingStartDate || busyRef.current) return;
    busyRef.current = true;
    // Keep the warning mounted until completion to avoid a history.back()
    // from its cleanup competing with mobile navigation during the operation.
    return createCycle(pendingStartDate);
  };

  const formattedCurrentStart = !isFirstCycle
    ? format(parseISO(currentCycleStartDate), 'dd/MM/yyyy')
    : '';

  const archiveEndText = (() => {
    if (isFirstCycle) return '';
    const d = new Date(startDate);
    d.setDate(d.getDate() - 1);
    return format(d, 'dd/MM/yyyy');
  })();

  const selectedStartDate = startDate ? startOfDay(parseISO(startDate)) : null;
  const recordedDates = currentCycleRecords
    .map((record) => {
      if (!record?.isoDate) return null;
      const parsed = startOfDay(parseISO(record.isoDate));
      return isValid(parsed) ? parsed : null;
    })
    .filter(Boolean);

  const currentCycleRange = currentCycleStartDate
    ? { from: startOfDay(parseISO(currentCycleStartDate)), to: startOfDay(new Date()) }
    : undefined;

  return (
    <>
      <Dialog open={isOpen || isCreating} onOpenChange={handleClose}>
        <DialogContent
          hideClose={isCreating || isPreviewing}
          onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
          onInteractOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
          className="bg-white border-pink-100 text-gray-800 rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle>Iniciar nuevo ciclo</DialogTitle>
            <DialogDescription className="text-gray-600">
              {isFirstCycle
                ? 'Este será tu primer ciclo. Selecciona la fecha de inicio.'
                : `¿Estás seguro de que quieres iniciar un nuevo ciclo? Los datos del ciclo actual (${formattedCurrentStart} - ${archiveEndText}) serán archivados.`}
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-2">
            <label htmlFor="startDate" className="text-gray-700 text-sm">
              Fecha de inicio del nuevo ciclo
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  disabled={isCreating || isPreviewing}
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
                    setStartDate(format(startOfDay(selectedDate), 'yyyy-MM-dd'));
                  }}
                  locale={es}
                  initialFocus
                  disabled={[
                    { after: startOfDay(new Date()) },
                    ...(isFirstCycle
                      ? []
                      : [{ before: startOfDay(parseISO(currentCycleStartDate)) }]),
                  ]}
                  modifiers={{
                    hasRecord: recordedDates,
                    inActiveCycle: currentCycleRange,
                  }}
                  modifiersClassNames={{
                    hasRecord:
                      'relative after:content-[""] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:h-1.5 after:w-1.5 after:rounded-full after:bg-fertiliapp-fuerte',
                    inActiveCycle: 'in-cycle-soft-outline',
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isCreating || isPreviewing}
              className="border-gray-300 text-subtitulo hover:brightness-95"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isCreating || isPreviewing}
              className="bg-fertiliapp-fuerte hover:brightness-95 text-white"
            >
              {isFirstCycle ? 'Iniciar ciclo' : 'Confirmar nuevo ciclo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OverlapWarningDialog
        isOpen={showOverlapWarning}
        onCancel={() => {
          if (busyRef.current) return;
          setShowOverlapWarning(false);
          setPendingStartDate(null);
          setImpactPreview(null);
        }}
        onConfirm={handleConfirmOverlap}
        conflictCycle={
          isFirstCycle
            ? null
            : {
                startDate: currentCycleStartDate,
                endDate: null,
              }
        }
        message="Este nuevo ciclo actual coincide en fechas con el ciclo anterior. Los registros se pasarán al nuevo ciclo si continúas. ¿Deseas continuar?"
        title={impactPreview ? 'Este cambio ajustará otros ciclos' : undefined}
        description={impactPreview ? 'Se aplicarán ajustes en ciclos y/o registros antes de guardar.' : undefined}
        confirmLabel={impactPreview ? 'Aplicar cambios' : undefined}
        affectedCycles={impactPreview?.affectedCycles || []}
        impactSummary={impactPreview?.impactSummary}
        adjustedCyclesPreview={impactPreview?.adjustedCyclesPreview || []}
      />
      {/* Stay inside Radix's modal/focus stack; Overlay's body portal is outside it. */}
      <Dialog open={isCreating}>
        <DialogContent
          hideClose
          overlayClassName="z-[100] bg-black/25 bg-none backdrop-blur-sm"
          className="z-[101] w-[90%] max-w-md border-fertiliapp-suave bg-white/90 px-5 py-4 shadow-lg sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div role="status" aria-live="polite" className="flex items-center gap-3">
            <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-fertiliapp-fuerte" />
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-titulo">Creando nuevo ciclo…</DialogTitle>
              <DialogDescription className="text-sm">Puede tardar unos segundos.</DialogDescription>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NewCycleDialog;

