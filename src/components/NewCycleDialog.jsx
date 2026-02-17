import React, { useMemo, useState } from 'react';
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
import { Calendar as CalendarIcon } from 'lucide-react';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';

const NewCycleDialog = ({
  isOpen,
  onClose,
  onConfirm,
  onPreview,
  currentCycleStartDate,
  currentCycleRecords = [],
}) => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [impactPreview, setImpactPreview] = useState(null);
  useBackClose(isOpen, onClose);

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

  const handleConfirm = async () => {
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
    onConfirm(startDate);
  };

  const handleConfirmOverlap = () => {
    if (!pendingStartDate) return;
    setShowOverlapWarning(false);
    onConfirm(pendingStartDate);
    setPendingStartDate(null);
    setImpactPreview(null);
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
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-white border-pink-100 text-gray-800 rounded-3xl">
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
              onClick={onClose}
              className="border-gray-300 text-subtitulo hover:brightness-95"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
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
    </>
  );
};

export default NewCycleDialog;

