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
import { Input } from '@/components/ui/input';
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';

const NewCycleDialog = ({
  isOpen,
  onClose,
  onConfirm,
  currentCycleStartDate,
  currentCycleRecords = [],
}) => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState(null);
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

  const handleConfirm = () => {
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
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              min={isFirstCycle ? undefined : format(parseISO(currentCycleStartDate), 'yyyy-MM-dd')}
              className="bg-gray-50 border-gray-200 text-gray-800"
            />
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
      />
    </>
  );
};

export default NewCycleDialog;

