import React from 'react';
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
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-white border-pink-100 text-gray-800">
        <DialogHeader>
          <DialogTitle>Solapamiento detectado</DialogTitle>
          <DialogDescription className="text-gray-600">
            {conflictCycle
              ? `La nueva fecha de inicio se solapa con el ciclo que comenzó el ${conflictCycle.startDate} y terminó el ${conflictCycle.endDate || 'actualmente en curso'}. ¿Deseas ajustar las fechas y mover los registros al nuevo ciclo?`
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