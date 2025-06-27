import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const EditCycleDatesDialog = ({ isOpen, onClose, onConfirm, initialStartDate, initialEndDate }) => {
  const [startDate, setStartDate] = useState(initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEndDate || '');

  useEffect(() => {
    setStartDate(initialStartDate || '');
    setEndDate(initialEndDate || '');
  }, [initialStartDate, initialEndDate]);

  const handleConfirm = () => {
    onConfirm({ startDate, endDate: endDate || null });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle>Editar Fechas del Ciclo</DialogTitle>
          <DialogDescription className="text-slate-400">
            Modifica la fecha de inicio y fin del ciclo.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 space-y-4">
          <div>
            <label htmlFor="startDate" className="text-slate-300 text-sm">
              Inicio del ciclo
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-700 border-slate-600 text-slate-50"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="text-slate-300 text-sm">
              Fin del ciclo
            </label>
            <Input
              id="endDate"
              type="date"
              value={endDate || ''}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-700 border-slate-600 text-slate-50"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-slate-600 hover:bg-slate-700">Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} className="bg-pink-600 hover:bg-pink-700">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCycleDatesDialog;