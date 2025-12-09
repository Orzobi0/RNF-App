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
import { Input } from '@/components/ui/input';
import OverlapWarningDialog from './OverlapWarningDialog';
import { format, parseISO } from 'date-fns';

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

  const handleConfirm = async () => {
    if (includeEndDate && !endDate) {
      setEndDateError('La fecha de fin es obligatoria');
      return;
    }
    if (includeEndDate && startDate && endDate && endDate < startDate) {
      setEndDateError('La fecha de fin no puede ser anterior al inicio');
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
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => handleStartChange(e.target.value)}
                className="bg-gray-50 border-gray-200 text-gray-800"
              />
            </div>
            {includeEndDate && (
              <div>
                <label htmlFor="endDate" className="text-gray-700 text-sm">
                  Fin del ciclo
                </label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate || ''}
                  onChange={(e) => handleEndChange(e.target.value)}
                  className="bg-gray-50 border-gray-200 text-gray-800"
                />
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
