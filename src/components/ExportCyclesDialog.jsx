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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

  const str = String(value).trim();

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
};

const formatDate = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};

const getCycleDayCount = (cycle) => {
  const start = parseDateOnly(cycle?.startDate);
  const end = cycle?.type === 'current' ? parseDateOnly(new Date()) : parseDateOnly(cycle?.endDate);

  if (!start || !end) return cycle?.recordCount ?? 0;

  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return cycle?.recordCount ?? 0;

  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

const buildCycleLabel = (cycle) => {
  const start = formatDate(cycle?.startDate);
  const end = cycle?.type === 'current'
    ? 'actualidad'
    : formatDate(cycle?.endDate);

  if (start && end) return `Ciclo ${start} - ${end}`;
  if (start && cycle?.type === 'current') return `Ciclo ${start} - actualidad`;
  if (start) return `Ciclo ${start}`;
  return cycle?.name || 'Ciclo';
};
const ExportCyclesDialog = ({
  isOpen,
  onClose,
  cycles = [],
  onConfirm,
  selectedIds = [],
  onToggleId,
  onToggleAll,
  format,
  pdfContentMode,
  onPdfContentModeChange,
  includeRs,
  onIncludeRsChange,
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
          <Label htmlFor={checkboxId} className="text-sm font-medium text-slate-700">
            {buildCycleLabel(cycle)}
          </Label>
          <p className="text-sm text-slate-500">
            {getCycleDayCount(cycle)} días&nbsp;&nbsp;{cycle.recordCount ?? 0} registros
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
            Selecciona los ciclos que deseas exportar.
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
            <ScrollArea
              type="auto"
              className="h-72 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <div className="space-y-3 pr-1">
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
            <Label htmlFor="export-pdf-content" className="text-sm font-medium text-slate-700">
              Contenido del PDF
            </Label>
            <Select
              value={pdfContentMode}
              onValueChange={onPdfContentModeChange}
              disabled={isProcessing || format !== 'pdf'}
            >
              <SelectTrigger id="export-pdf-content" className="w-full">
                <SelectValue placeholder="Selecciona contenido del PDF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chart">Gráfica</SelectItem>
                <SelectItem value="table">Tabla</SelectItem>
                <SelectItem value="chart-and-table">Gráfica + Tabla</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/60 px-3 py-2">
            <Checkbox
              id="export-rs"
              checked={includeRs}
              onCheckedChange={(value) => onIncludeRsChange(Boolean(value))}
              disabled={isProcessing}
            />
            <div className="space-y-1">
              <Label htmlFor="export-rs" className="text-sm font-medium text-slate-700">
                Incluir fila RS
              </Label>
              <p className="text-xs text-slate-500">
                Descarga la fila de relaciones sexuales
              </p>
            </div>
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