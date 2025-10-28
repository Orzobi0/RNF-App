import React from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const OverlapWarningDialog = ({ isOpen, onCancel, onConfirm, conflictCycle }) => {
  const formatDate = (date) => {
    if (!date) return null;
    try {
      return format(parseISO(date), 'dd/MM/yyyy');
    } catch (error) {
      console.error('Failed to format conflict cycle date', error);
      return date;
    }
  };

  const formattedStart = conflictCycle?.startDate
    ? formatDate(conflictCycle.startDate)
    : null;
  const formattedEnd = conflictCycle?.endDate
    ? formatDate(conflictCycle.endDate)
    : 'actualmente en curso';

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-white border-pink-100 text-gray-800">
        <DialogHeader>
          <DialogTitle>Solapamiento detectado</DialogTitle>
          <DialogDescription className="text-gray-600">
            {conflictCycle
              ? `La nueva fecha se solapa con el ciclo que comenzó el ${formattedStart ?? 'sin inicio registrado'} y terminó el ${formattedEnd}. ¿Deseas ajustar las fechas y mover los registros al nuevo ciclo?`
              : 'La nueva fecha de inicio se solapa con otro ciclo. ¿Deseas continuar?'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onCancel} className="border-gray-300 text-gray-700 hover:bg-gray-100">Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} className="bg-pink-600 hover:bg-pink-700 text-white">Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OverlapWarningDialog;