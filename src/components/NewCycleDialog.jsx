import React, { useState } from 'react';
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
import { format } from 'date-fns';

const NewCycleDialog = ({ isOpen, onClose, onConfirm, currentCycleStartDate }) => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  useBackClose(isOpen, onClose);
  
  const handleConfirm = () => {
    onConfirm(startDate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-pink-100 text-gray-800">
        <DialogHeader>
          <DialogTitle>Iniciar Nuevo Ciclo</DialogTitle>
                    <DialogDescription className="text-gray-600">
            ¿Estás seguro de que quieres iniciar un nuevo ciclo? Los datos del ciclo actual ({format(new Date(currentCycleStartDate), 'dd/MM/yyyy')} - {format(new Date(), 'dd/MM/yyyy')}) serán archivados.
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
            className="bg-gray-50 border-gray-200 text-gray-800"
          />
        </div>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-gray-300 text-gray-700 hover:bg-gray-100">Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} className="bg-pink-600 hover:bg-pink-700 text-white">Confirmar Nuevo Ciclo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCycleDialog;