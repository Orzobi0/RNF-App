import React from 'react';
    import { Button } from '@/components/ui/button';
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogDescription,
      DialogFooter,
    } from "@/components/ui/dialog";
    import { format } from 'date-fns';

    const NewCycleDialog = ({ isOpen, onClose, onConfirm, currentCycleStartDate }) => (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-50">
          <DialogHeader>
            <DialogTitle>Iniciar Nuevo Ciclo</DialogTitle>
            <DialogDescription className="text-slate-400">
              ¿Estás seguro de que quieres iniciar un nuevo ciclo? Los datos del ciclo actual ({format(new Date(currentCycleStartDate), "dd/MM/yyyy")} - {format(new Date(), "dd/MM/yyyy")}) serán archivados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button variant="outline" onClick={onClose} className="border-slate-600 hover:bg-slate-700">Cancelar</Button>
            <Button variant="primary" onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700">Confirmar Nuevo Ciclo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    export default NewCycleDialog;