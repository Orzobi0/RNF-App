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

const OverlapWarningDialog = ({
  isOpen,
  onCancel,
  onConfirm,
  conflictCycle,
  message,
  title = 'Estas fechas coinciden con otro ciclo',
  description,
  confirmLabel = 'Confirmar',
  affectedCycles = [],
  impactSummary,
  adjustedCyclesPreview = [],
}) => {
  const formatDate = (date) => {
    if (!date) return null;
    try {
      return format(parseISO(date), 'dd/MM/yyyy');
    } catch (error) {
      console.error('Failed to format conflict cycle date', error);
      return date;
    }
  };

  const trimmedCount = impactSummary?.trimmedCycles ?? impactSummary?.trims ?? 0;
  const deletedCount = impactSummary?.deletedCycles ?? impactSummary?.deletions ?? 0;
  const movedCount = impactSummary?.movedEntries ?? 0;
  const formattedStart = conflictCycle?.startDate
    ? formatDate(conflictCycle.startDate)
    : null;
  const formattedEnd = conflictCycle?.endDate
    ? formatDate(conflictCycle.endDate)
    : 'actualmente en curso';

  return (
    <Dialog
  open={isOpen}
  onOpenChange={(open) => {
    if (!open) onCancel?.();
  }}
>
      <DialogContent
  className="bg-slate-50 border-slate-200 text-gray-800"
  onPointerDownOutside={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-gray-600">
            {description ?? message ??
              (conflictCycle
                ? `La fecha que has elegido coincide con otro ciclo, del ${formattedStart ?? 'sin inicio registrado'} al ${formattedEnd}. Si continúas, se ajustarán otros ciclos y algunos registros podrán moverse.`
                : 'La fecha que has elegido coincide con otro ciclo. ¿Deseas continuar?')}
          </DialogDescription>
        </DialogHeader>

        {affectedCycles.length > 0 && (
          <div className="bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold">Este cambio afecta a los ciclos:</p>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              {affectedCycles.map((cycle, index) => {
                if (typeof cycle === 'string') {
                  return <li key={`${cycle}-${index}`}>{cycle}</li>;
                }
                const start = formatDate(cycle?.startDate) ?? 'sin inicio';
                const end = cycle?.endDate ? formatDate(cycle.endDate) : 'en curso';
                return <li key={`${cycle?.cycleId || cycle?.id || index}`}>{start} - {end}</li>;
              })}
            </ul>
          </div>
        )}
        
        {impactSummary && (
          <div className="bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
            <p>
              Este cambio hará lo siguiente: {[
                trimmedCount > 0 ? `${trimmedCount} ciclo${trimmedCount === 1 ? '' : 's'} ajustado${trimmedCount === 1 ? '' : 's'}` : null,
                deletedCount > 0 ? `${deletedCount} ciclo${deletedCount === 1 ? '' : 's'} eliminado${deletedCount === 1 ? '' : 's'}` : null,
                movedCount > 0 ? `${movedCount} registro${movedCount === 1 ? '' : 's'} movido${movedCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(' y ') || 'no afectará a otros ciclos ni moverá registros'}.
            </p>
          </div>
        )}

        {adjustedCyclesPreview.length > 0 && (
          <div className="bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold">Así quedarán los ciclos afectados:</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {adjustedCyclesPreview.map((cycle, index) => {
               const start = formatDate(cycle.startDate) ?? 'sin inicio';
               const end = cycle.endDate ? formatDate(cycle.endDate) : 'en curso';
                if (cycle.type === 'delete' || cycle.deleted) {
                  return <li key={`${cycle.cycleId}-delete-${index}`}>{start} - {end} (se eliminará)</li>;
                }

                return <li key={`${cycle.cycleId}-${cycle.startDate}-${index}`}>{start} - {end}</li>;
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="sm:justify-end">
  <Button
    type="button"
    variant="outline"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onCancel?.();
    }}
    className="border-gray-300 text-titulo hover:bg-gray-100"
  >
    Cancelar
  </Button>

  <Button
    type="button"
    variant="destructive"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onConfirm?.();
    }}
    className="bg-fertiliapp-fuerte hover:bg-pink-700 text-white"
  >
    {confirmLabel}
  </Button>
</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OverlapWarningDialog;