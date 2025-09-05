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

const EditCycleDatesDialog = ({
  isOpen,
  onClose,
  onConfirm,
  initialStartDate,
  initialEndDate,
  includeEndDate = true,
  title = 'Editar Fechas del Ciclo',
  description,
}) => {
  const [startDate, setStartDate] = useState(initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEndDate || '');
  const [endDateError, setEndDateError] = useState('');

  useBackClose(isOpen, onClose);

  useEffect(() => {
    setStartDate(initialStartDate || '');
    setEndDate(initialEndDate || '');
  }, [initialStartDate, initialEndDate]);

  const handleConfirm = () => {
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
    onConfirm(payload);
  };

  return (
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
        <div className="my-4 space-y-4">
          <div>
            <label htmlFor="startDate" className="text-gray-700 text-sm">
              Inicio del ciclo
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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
                onChange={(e) => { setEndDate(e.target.value); setEndDateError(''); }}
                className="bg-gray-50 border-gray-200 text-gray-800"
              />
               {endDateError && (
                <p className="text-red-500 text-sm mt-1">{endDateError}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-gray-300 text-gray-700 hover:bg-gray-100">Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} className="bg-pink-600 hover:bg-pink-700 text-white">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCycleDatesDialog;
