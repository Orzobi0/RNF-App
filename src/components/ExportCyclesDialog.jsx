import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const ExportCyclesDialog = ({
  isOpen,
  onClose,
  cycles = [],
  onConfirm,
  selectedIds = [],
  onToggleId,
  onToggleAll,
  format,
  onFormatChange,
  isProcessing,
}) => {
  const { currentCycles, archivedCycles, allSelectedState } = useMemo(() => {
    const current = cycles.filter((cycle) => cycle.type === 'current');
    const archived = cycles.filter((cycle) => cycle.type !== 'current');
    const allIds = cycles.map((cycle) => cycle.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    const isIndeterminate = !allSelected && selectedIds.length > 0;

    return {
      currentCycles: current,
      archivedCycles: archived,
      allSelectedState: allSelected ? true : isIndeterminate ? 'indeterminate' : false,
    };
  }, [cycles, selectedIds]);

  const handleDialogChange = (open) => {
    if (!open) {
      onClose();
    }
  };

  const renderCycleRow = (cycle) => {
    const checkboxId = `export-cycle-${cycle.id}`;
    const isChecked = selectedIds.includes(cycle.id);

    return (
      <div
        key={cycle.id}
        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white/60 p-3 shadow-sm"
      >
        <Checkbox
          id={checkboxId}
          checked={isChecked}
          onCheckedChange={(value) => onToggleId(cycle.id, value)}
          disabled={isProcessing}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={checkboxId} className="text-base font-medium text-slate-700">
            {cycle.name}
          </Label>
          <p className="text-sm text-slate-500">
            Inicio: {cycle.startDate ? cycle.startDate : 'N/D'} · Fin:{' '}
            {cycle.endDate ? cycle.endDate : cycle.type === 'current' ? 'En curso' : 'N/D'} · Registros:{' '}
            {cycle.recordCount ?? 0}
          </p>
        </div>
      </div>
    );
  };

  const hasCycles = cycles.length > 0;
  const isConfirmDisabled = !selectedIds.length || isProcessing;

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar ciclos</DialogTitle>
          <DialogDescription>
            Selecciona los ciclos que deseas exportar y el formato de archivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-cycles"
                checked={allSelectedState}
                onCheckedChange={(value) => onToggleAll(Boolean(value))}
                disabled={!hasCycles || isProcessing}
              />
              <Label htmlFor="select-all-cycles" className="text-sm font-medium text-slate-700">
                Seleccionar todos
              </Label>
            </div>
            <span className="text-xs text-slate-500">
              {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
            </span>
          </div>

          {hasCycles ? (
            <ScrollArea className="max-h-72 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-3">
                {currentCycles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ciclo actual
                    </p>
                    <div className="space-y-2">
                      {currentCycles.map((cycle) => renderCycleRow(cycle))}
                    </div>
                  </div>
                )}

                {archivedCycles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ciclos archivados
                    </p>
                    <div className="space-y-2">
                      {archivedCycles.map((cycle) => renderCycleRow(cycle))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
              No hay ciclos disponibles para exportar.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="export-format" className="text-sm font-medium text-slate-700">
              Formato
            </Label>
            <Select value={format} onValueChange={onFormatChange} disabled={isProcessing}>
              <SelectTrigger id="export-format" className="w-full">
                <SelectValue placeholder="Selecciona un formato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isConfirmDisabled || !hasCycles}>
            {isProcessing ? 'Exportando...' : 'Exportar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportCyclesDialog;