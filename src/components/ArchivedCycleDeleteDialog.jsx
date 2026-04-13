import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import DeletionDialog from '@/components/DeletionDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ARCHIVED_CYCLE_DELETE_STRATEGY } from '@/lib/cycleDataHandler';

const strategyLabels = {
  [ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE]: 'Eliminar ciclo y registros (dejar hueco)',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV]: 'Fusionar con el ciclo anterior',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT]: 'Fusionar con el ciclo siguiente',
};

const strategyDescriptions = {
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV]:
    'Mueve los registros al ciclo anterior y extiende su fecha de fin.',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE]:
    'Borra el ciclo completo y sus registros.',
  [ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT]:
    'Mueve los registros al ciclo siguiente y adelanta su fecha de inicio.',
};

const strategyOrder = [
  ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_PREV,
  ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE,
  ARCHIVED_CYCLE_DELETE_STRATEGY.MERGE_NEXT,
];

const formatUiDate = (isoDate) => {
  if (!isoDate) return 'En curso';
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy');
  } catch {
    return isoDate;
  }
};

const ArchivedCycleDeleteDialog = ({
  isOpen,
  cycle,
  onClose,
  onDeleteSimple,
  onDeleteWithStrategy,
  previewDeleteCycle,
  getPublicError,
  onDeleted,
}) => {
  const { toast } = useToast();
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const cycleRangeLabel = useMemo(() => {
    if (!cycle?.startDate) return '';
    return `${formatUiDate(cycle.startDate)} - ${formatUiDate(cycle.endDate)}`;
  }, [cycle]);

  const isArchived = Boolean(cycle?.endDate);

  const reset = useCallback(() => {
    setSelectedStrategy(null);
    setDeletePreview(null);
    setIsLoadingPreview(false);
    setIsDeleting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const handleSelectStrategy = useCallback(
    async (strategy) => {
      if (!cycle?.id || !previewDeleteCycle) return;
      setSelectedStrategy(strategy);
      setIsLoadingPreview(true);
      try {
        const preview = await previewDeleteCycle(cycle.id, strategy);
        setDeletePreview(preview);
      } catch (error) {
        const publicError = getPublicError?.(error);
        toast({
          title: publicError?.title || 'Error',
          description: publicError?.message || 'No se pudo preparar la vista previa.',
          variant: 'destructive',
        });
        setSelectedStrategy(null);
        setDeletePreview(null);
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [cycle?.id, getPublicError, previewDeleteCycle, toast]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!cycle?.id) return;

    setIsDeleting(true);
    try {
      if (isArchived && selectedStrategy) {
        await onDeleteWithStrategy?.(cycle.id, selectedStrategy);
      } else {
        await onDeleteSimple?.(cycle.id);
      }
      toast({ title: 'Ciclo eliminado', description: 'El ciclo ha sido eliminado.' });
      onDeleted?.(cycle, selectedStrategy);
      onClose?.();
    } catch (error) {
      const publicError = getPublicError?.(error);
      toast({
        title: publicError?.title || 'Error',
        description: publicError?.message || 'No se pudo eliminar el ciclo.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [
    cycle,
    getPublicError,
    isArchived,
    onClose,
    onDeleteSimple,
    onDeleteWithStrategy,
    onDeleted,
    selectedStrategy,
    toast,
  ]);

  if (!cycle) return null;

  if (!isArchived) {
    return (
      <DeletionDialog
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={handleConfirmDelete}
        title="Eliminar ciclo"
        confirmLabel="Eliminar ciclo"
        description={
          cycleRangeLabel
            ? `¿Estás segura de que quieres eliminar el ciclo ${cycleRangeLabel}? Esta acción no se puede deshacer.`
            : '¿Estás segura de que quieres eliminar este ciclo? Esta acción no se puede deshacer.'
        }
        isProcessing={isDeleting}
      />
    );
  }

  return (
    <>
      <Dialog open={isOpen && !selectedStrategy} onOpenChange={(open) => !open && onClose?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar ciclo archivado</DialogTitle>
            <DialogDescription>
              Elige cómo quieres eliminar este ciclo. Puedes borrarlo o fusionarlo con uno vecino.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {strategyOrder.map((strategy) => (
              <Button
                key={strategy}
                type="button"
                variant="outline"
                className={`h-auto w-full flex-col items-start gap-1 text-left ${
                  strategy === ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE
                    ? 'border-red-200 bg-red-100/20 hover:bg-red-200/80'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                disabled={isLoadingPreview || isDeleting}
                onClick={() => handleSelectStrategy(strategy)}
              >
                <span
                  className={`font-semibold ${
                    strategy === ARCHIVED_CYCLE_DELETE_STRATEGY.DELETE ? 'text-red-700' : 'text-slate-800'
                  }`}
                >
                  {strategyLabels[strategy]}
                </span>
                <span className="text-xs text-slate-600">{strategyDescriptions[strategy]}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoadingPreview || isDeleting}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOpen && Boolean(selectedStrategy) && Boolean(deletePreview)}
        onOpenChange={(open) => !open && onClose?.()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>Revisa el impacto antes de confirmar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              <strong>Estrategia:</strong> {selectedStrategy ? strategyLabels[selectedStrategy] : ''}
            </p>
            <p>
              <strong>Impacto:</strong> {deletePreview?.impactSummary?.trimmedCycles ?? 0} ciclos ajustados,{' '}
              {deletePreview?.impactSummary?.deletedCycles ?? 0} eliminados,{' '}
              {deletePreview?.impactSummary?.movedEntries ?? 0} registros movidos.
            </p>
            <div>
              <p className="font-semibold text-slate-800">Ciclos afectados</p>
              <ul className="mt-1 list-disc pl-5">
                {(deletePreview?.affectedCycles ?? []).map((affected) => (
                  <li key={affected.cycleId}>
                    {formatUiDate(affected.startDate)} → {formatUiDate(affected.endDate)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Cómo quedarán</p>
              <ul className="mt-1 list-disc pl-5">
                {(deletePreview?.adjustedCyclesPreview ?? []).map((adjusted) => (
                  <li key={`${adjusted.cycleId}-${adjusted.type}`}>
                    {adjusted.type === 'delete' ? 'Eliminar' : 'Ajustar'} ciclo: {formatUiDate(adjusted.startDate)} →{' '}
                    {formatUiDate(adjusted.endDate)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedStrategy(null);
                setDeletePreview(null);
              }}
              disabled={isDeleting}
            >
              Atrás
            </Button>
            <Button type="button" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ArchivedCycleDeleteDialog;