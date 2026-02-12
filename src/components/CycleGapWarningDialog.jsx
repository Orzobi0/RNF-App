import React from 'react';
import { format, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const formatDateLabel = (dateOrIso) => {
  if (!dateOrIso) return null;
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return isValid(date) ? format(date, 'dd/MM/yyyy') : null;
};

const CycleGapWarningDialog = ({
  isOpen,
  onCancel,
  onConfirmSave,
  onConfirmAutoAdjust,
  warning,
}) => {
  if (!warning) return null;

  const prevStart = formatDateLabel(warning.prevCycle?.startDate);
  const prevEnd = formatDateLabel(warning.prevCycle?.endDate);
  const nextStart = formatDateLabel(warning.nextCycle?.startDate);
  const nextEnd = formatDateLabel(warning.nextCycle?.endDate);
  const gapBeforeStart = formatDateLabel(warning.expectedStart);
  const gapBeforeEnd = formatDateLabel(warning.newStartDate ? new Date(warning.newStartDate) : null);
  const gapAfterStart = formatDateLabel(warning.newEndDate ? new Date(warning.newEndDate) : null);
  const gapAfterEnd = formatDateLabel(warning.expectedEnd);

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-white border-pink-100 text-gray-800">
        <DialogHeader>
          <DialogTitle>Las fechas no son contiguas</DialogTitle>
          <DialogDescription className="text-gray-600 space-y-2">
            {warning.prevCycle && (
              <p>Ciclo anterior: {prevStart ?? 'sin inicio'} — {prevEnd ?? 'sin fin'}.</p>
            )}
            {warning.hasGapBefore && (
              <p>Hay un hueco de {warning.gapBeforeDays} día(s) sin ciclo entre {gapBeforeStart} y {gapBeforeEnd}.</p>
            )}
            {warning.nextCycle && (
              <p>Ciclo siguiente: {nextStart ?? 'sin inicio'} — {nextEnd ?? 'sin fin'}.</p>
            )}
            {warning.hasGapAfter && (
              <p>Hay un hueco de {warning.gapAfterDays} día(s) sin ciclo entre {gapAfterStart} y {gapAfterEnd}.</p>
            )}
            {warning.autoAdjustReason && <p className="text-amber-700">{warning.autoAdjustReason}</p>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="outline" onClick={onConfirmSave}>Guardar igualmente</Button>
          <Button onClick={onConfirmAutoAdjust} disabled={!warning.canAutoAdjust}>Auto-ajustar y guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CycleGapWarningDialog;
