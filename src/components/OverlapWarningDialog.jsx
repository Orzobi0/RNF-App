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
  title = 'Solapamiento detectado',
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
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-white border-pink-100 text-gray-800">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-gray-600">
            {description ?? message ??
              (conflictCycle
                ? `La nueva fecha se solapa con el ciclo que comenzó el ${formattedStart ?? 'sin inicio registrado'} y terminó el ${formattedEnd}. ¿Deseas ajustar las fechas y mover los registros al nuevo ciclo?`
                : 'La nueva fecha de inicio se solapa con otro ciclo. ¿Deseas continuar?')}
          </DialogDescription>
        </DialogHeader>

        {affectedCycles.length > 0 && (
          <div className="rounded-md border border-pink-100 bg-white px-3 py-2 text-sm text-gray-700">
            <p className="font-medium">Este nuevo cambio afecta a los ciclos:</p>
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
          <div className="rounded-md border border-pink-100 bg-pink-50 px-3 py-2 text-sm text-gray-700">
            <p>
              Esto implica {[
                trimmedCount > 0 ? `${trimmedCount} recortes` : null,
                deletedCount > 0 ? `${deletedCount} eliminaciones` : null,
                movedCount > 0 ? `${movedCount} registros movidos` : null,
              ].filter(Boolean).join(' y ') || 'sin recortes, eliminaciones ni movimientos de registros'}.
            </p>
          </div>
        )}

        {adjustedCyclesPreview.length > 0 && (
          <div className="rounded-md border border-pink-100 bg-white px-3 py-2 text-sm text-gray-700">
            <p className="font-medium">Los ciclos afectados quedarán así:</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {adjustedCyclesPreview.map((cycle, index) => {
               const start = formatDate(cycle.startDate) ?? 'sin inicio';
               const end = cycle.endDate ? formatDate(cycle.endDate) : 'en curso';
                if (cycle.type === 'delete' || cycle.deleted) {
                  return <li key={`${cycle.cycleId}-delete-${index}`}>{start} - {end} (eliminado)</li>;
                }

                return <li key={`${cycle.cycleId}-${cycle.startDate}-${index}`}>{start} - {end}</li>;
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={onCancel} className="border-gray-300 text-titulo hover:bg-gray-100">Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} className="bg-fertiliapp-fuerte hover:bg-pink-700 text-white">{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OverlapWarningDialog;