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
import { cn } from '@/lib/utils';

const DeletionDialog = ({
  isOpen,
  onClose,
  onConfirm,
  recordDate,
  title = 'Confirmar eliminación',
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  isProcessing = false,
  confirmButtonClassName,
}) => {
  const handleClose = React.useCallback(() => {
    if (!isProcessing) {
      onClose();
    }
  }, [isProcessing, onClose]);

  useBackClose(isOpen, handleClose);

  const message =
    description ??
    (recordDate
      ? `¿Estás seguro de que quieres eliminar el registro del ${recordDate}? Esta acción no se puede deshacer.`
      : 'Esta acción no se puede deshacer.');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="bg-white/95 backdrop-blur border border-fertiliapp-fuerte text-slate-700">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-fertiliapp-fuerte">{title}</DialogTitle>
          <DialogDescription className="text-slate-600">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="border-pink-200 text-fertiliapp-fuerte hover:bg-pink-50 hover:text-fertiliapp-fuerte"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className={cn(
              'bg-fertiliapp-fuerte hover:brightness-95 text-white shadow-lg',
              isProcessing && 'opacity-80 cursor-not-allowed',
              confirmButtonClassName
            )}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeletionDialog;