import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogDescription,
      DialogFooter,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

const NewCycleDialog = ({ isOpen, onClose, onConfirm, currentCycleStartDate }) => {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const handleConfirm = () => {
    onConfirm(startDate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle>Iniciar Nuevo Ciclo</DialogTitle>
          <DialogDescription className="text-slate-400">
            ¿Estás seguro de que quieres iniciar un nuevo ciclo? Los datos del ciclo actual ({format(new Date(currentCycleStartDate), "dd/MM/yyyy")} - {format(new Date(), "dd/MM/yyyy")}) serán archivados.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 space-y-2">
          <label htmlFor="startDate" className="text-slate-300 text-sm">
            Fecha de inicio del nuevo ciclo
          </label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={format(new Date(), "yyyy-MM-dd")}
            className="bg-slate-700 border-slate-600 text-slate-50"
          />
        </div>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-slate-600 hover:bg-slate-700">Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-700">Confirmar Nuevo Ciclo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCycleDialog;