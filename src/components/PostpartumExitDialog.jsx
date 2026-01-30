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
} from '@/components/ui/dialog';

const PostpartumExitDialog = ({ isOpen, onClose, onConfirm }) => {
  useBackClose(isOpen, onClose);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="bg-white/95 backdrop-blur border border-fertiliapp-fuerte text-slate-700">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-fertiliapp-fuerte">
            Modo postparto activado
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Se ha añadido un nuevo ciclo. ¿Deseas desactivar el modo postparto?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-pink-200 text-fertiliapp-fuerte hover:bg-pink-50 hover:text-fertiliapp-fuerte"
          >
            No
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-fertiliapp-fuerte hover:brightness-95 text-white shadow-lg"
          >
            Sí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PostpartumExitDialog;