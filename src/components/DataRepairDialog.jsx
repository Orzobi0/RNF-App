import React, { useMemo, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const formatDateLabel = (iso) => {
  if (!iso) return 'Fecha inválida';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd-MM-yyyy') : iso;
};

const EntryPreviewCard = ({ entry }) => {
  const preview = entry?.preview || entry?.entryPreview || {};
  return (
    <div className="rounded-xl border bg-white p-3 text-xs space-y-1">
      
      <div><b>Temp gráfica/orig/corr:</b> {preview.temperature_chart ?? '—'} / {preview.temperature_raw ?? '—'} / {preview.temperature_corrected ?? '—'}</div>
      <div><b>Hora:</b> {preview.timestamp && isValid(parseISO(preview.timestamp)) ? format(parseISO(preview.timestamp), 'HH:mm') : '—'}</div>
      <div><b>Moco:</b> {preview.mucus_sensation ?? '—'} / {preview.mucus_appearance ?? '—'}</div>
      <div><b>Símbolo:</b> {preview.fertility_symbol ?? '—'}</div>
      <div><b>Obs:</b> {preview.observations || '—'}</div>
      <div><b>RS:</b> {preview.had_relations ? 'Sí' : 'No'}</div>
      <div><b>Ignorado:</b> {preview.ignored ? 'Sí' : 'No'}</div>
      <div><b>Día Pico:</b> {preview.peak_marker ?? '—'}</div>
      <div><b>+ Mediciones:</b> {preview.measurementsCount ?? '—'}</div>
      <div><b>ID:</b> {entry?.entryId}</div>
    </div>
  );
};

const DataRepairDialog = ({
  open,
  onOpenChange,
  cycle,
  cycles,
  onResolveDuplicate,
  onMoveOutOfRange,
  onDeleteEntry,
}) => {
  const [selectedWinners, setSelectedWinners] = useState({});
  const [moveMeasurementsByIso, setMoveMeasurementsByIso] = useState({});
  const [targetCycleByEntry, setTargetCycleByEntry] = useState({});
  const [pendingActionKey, setPendingActionKey] = useState(null);

  const issues = cycle?.issues;

  const suggestedCycleByIso = useMemo(() => {
    const map = {};
    for (const issue of issues?.outOfRange || []) {
      const iso = issue.isoDateResolved;
      const target = (cycles || []).find((c) => c?.id !== cycle?.id && c?.startDate && iso && iso >= c.startDate && (!c.endDate || iso <= c.endDate));
      if (target?.id) map[issue.entryId] = target.id;
    }
    return map;
  }, [cycle?.id, cycles, issues?.outOfRange]);

  
  const sortedTargetCycles = useMemo(() => (
    (cycles || [])
      .filter((c) => c?.id !== cycle?.id)
      .slice()
      .sort((a, b) => {
        const endA = a?.endDate || '9999-12-31';
        const endB = b?.endDate || '9999-12-31';
        if (endA !== endB) return endB.localeCompare(endA);
        return (a?.startDate || '').localeCompare(b?.startDate || '');
      })
  ), [cycle?.id, cycles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reparación manual de datos</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="font-semibold">Duplicados</h3>
            {(issues?.duplicates || []).length === 0 && <p className="text-sm text-slate-500">Sin duplicados.</p>}
            {(issues?.duplicates || []).map((dup) => {
              const winner = selectedWinners[dup.isoDate] || dup.entries?.[0]?.entryId;
              const moveMeasurements = moveMeasurementsByIso[dup.isoDate] ?? false;
              const losers = dup.entries.map((entry) => entry.entryId).filter((id) => id !== winner);

              return (
                <div key={dup.isoDate} className="rounded-xl border p-3 space-y-3 bg-slate-50">
                  <div className="text-sm font-medium">{formatDateLabel(dup.isoDate)}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {dup.entries.map((entry) => (
                      <label key={entry.entryId} className="space-y-1 cursor-pointer">
                        <div className="text-xs">
                          <input
                            type="radio"
                            name={`winner-${dup.isoDate}`}
                            checked={winner === entry.entryId}
                            onChange={() => setSelectedWinners((prev) => ({ ...prev, [dup.isoDate]: entry.entryId }))}
                          />{' '}
                          Conservar este
                        </div>
                        <EntryPreviewCard entry={entry} />
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={moveMeasurements}
                      onCheckedChange={(checked) =>
                        setMoveMeasurementsByIso((prev) => ({ ...prev, [dup.isoDate]: checked !== false }))
                      }
                    />
                    Mover mediciones de los descartados al conservado
                  </label>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('¿Confirmas resolver este duplicado? Esta acción elimina registros duplicados.')) return;
                      const actionKey = `resolve-${dup.isoDate}`;
                      setPendingActionKey(actionKey);
                      try {
                        await onResolveDuplicate({
                          cycleId: cycle.id,
                          isoDate: dup.isoDate,
                          winnerEntryId: winner,
                          loserEntryIds: losers,
                          moveMeasurements,
                        });
                      } finally {
                        setPendingActionKey((prev) => (prev === actionKey ? null : prev));
                      }
                    }}
                    disabled={!losers.length || pendingActionKey === `resolve-${dup.isoDate}`}
                  >
                    Aplicar
                  </Button>
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Fuera de rango</h3>
            {(issues?.outOfRange || []).length === 0 && <p className="text-sm text-slate-500">Sin registros fuera de rango.</p>}
            {(issues?.outOfRange || []).map((issue) => {
              const selectedTarget = targetCycleByEntry[issue.entryId] || suggestedCycleByIso[issue.entryId] || '';
              return (
                <div key={issue.entryId} className="rounded-xl border p-3 space-y-2 bg-slate-50">
                  <div className="text-sm">
                    Fecha: <b>{issue.isoDateResolved ? formatDateLabel(issue.isoDateResolved) : 'inválida'}</b> · Rango ciclo: {formatDateLabel(cycle?.startDate)} - {cycle?.endDate ? formatDateLabel(cycle.endDate) : 'actualidad'}
                  </div>
                  <EntryPreviewCard entry={issue} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="border rounded-3xl h-9 px-2 text-sm"
                      value={selectedTarget}
                      onChange={(e) => setTargetCycleByEntry((prev) => ({ ...prev, [issue.entryId]: e.target.value }))}
                    >
                      <option value="">Seleccionar ciclo destino…</option>
                      {sortedTargetCycles.map((c) => (
                        <option key={c.id} value={c.id}>                            
                          {formatDateLabel(c.startDate)} - {c.endDate ? formatDateLabel(c.endDate) : 'actualidad'}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!selectedTarget || !issue.isoDateResolved || pendingActionKey === `move-${issue.entryId}`}
                      onClick={async () => {
                        if (!window.confirm('¿Mover este registro al ciclo seleccionado?')) return;
                        const actionKey = `move-${issue.entryId}`;
                        setPendingActionKey(actionKey);
                        try {
                          await onMoveOutOfRange({
                            fromCycleId: cycle.id,
                            toCycleId: selectedTarget,
                            entryId: issue.entryId,
                            isoDate: issue.isoDateResolved,
                          });
                        } finally {
                          setPendingActionKey((prev) => (prev === actionKey ? null : prev));
                        }
                      }}
                    >
                      Mover
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pendingActionKey === `delete-${issue.entryId}`}
                      onClick={async () => {
                        if (!window.confirm('¿Eliminar este registro y sus mediciones?')) return;
                        const actionKey = `delete-${issue.entryId}`;
                        setPendingActionKey(actionKey);
                        try {
                          await onDeleteEntry({ cycleId: cycle.id, entryId: issue.entryId });
                        } finally {
                          setPendingActionKey((prev) => (prev === actionKey ? null : prev));
                        }
                      }}
                    >
                      Eliminar este registro
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DataRepairDialog;