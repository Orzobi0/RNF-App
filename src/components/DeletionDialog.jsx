import React from 'react';
import { Button } from '@/components/ui/button';
import useBackClose from '@/hooks/useBackClose';
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogDescription,
      DialogFooter,
    } from "@/components/ui/dialog";

const DeletionDialog = ({ isOpen, onClose, onConfirm, recordDate }) => {
  useBackClose(isOpen, onClose);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-50">
        <DialogHeader>
          <DialogTitle>Confirmar Eliminación</DialogTitle>
          <DialogDescription className="text-slate-400">
            ¿Estás seguro de que quieres eliminar el registro del {recordDate}? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-slate-600 hover:bg-slate-700">Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm}>Eliminar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

    export default DeletionDialog;