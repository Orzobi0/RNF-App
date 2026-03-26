import React, { useCallback } from 'react';
import { Ban, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FertilityCalculatorsEditorDialogs = ({ editor, onNavigateToCycleDetails }) => {
  const {
    cpmInfo,
    t8Info,
    computedT8Data,
    pendingIgnoredCycleIds,
    handleToggleCycleIgnore,
    dialogs,
  } = editor;

  const handleCardKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }, []);

  return (
    <>
      <Dialog open={dialogs.isCpmDialogOpen} onOpenChange={(open) => !open && dialogs.handleCloseCpmDialog()}>
        <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-0 text-gray-800 shadow-xl">
          <DialogHeader className="space-y-2 px-4 pt-4 text-left"><DialogTitle>Editar CPM</DialogTitle><DialogDescription><div className="text-xs">Puedes usar el valor calculado automáticamente o fijar un valor manual.</div></DialogDescription></DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            <div role="radio" tabIndex={0} onClick={() => dialogs.setCpmSelectionDraft('auto')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setCpmSelectionDraft('auto'))} className={`cursor-pointer rounded-2xl border px-3 py-3 ${dialogs.cpmSelectionDraft === 'auto' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}>
              <button type="button" onClick={() => dialogs.setShowCpmDetails((p) => !p)}>{cpmInfo.highlightLabel}</button>
              {dialogs.showCpmDetails && cpmInfo.detailsAvailable && (
                <ul className="mt-2 space-y-1">{cpmInfo.cycles.map((cycle, index) => {
                  const key = cycle.cycleId || cycle.id || `${index}`;
                  const cycleId = cycle.cycleId || cycle.id;
                  const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations);
                  const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false;
                  return <li key={key} className="flex gap-2"><button type="button" className="flex-1 text-left" onClick={() => onNavigateToCycleDetails?.(cycle)}>{cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo'} <ChevronRight className="inline h-3 w-3" /></button><Button type="button" variant="outline" size="xs" disabled={!cycleId || isPending} onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isIgnored ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</Button></li>;
                })}</ul>
              )}
            </div>
            <div role="radio" tabIndex={0} onClick={() => dialogs.setCpmSelectionDraft('manual')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setCpmSelectionDraft('manual'))} className={`cursor-pointer rounded-2xl border px-3 py-3 ${dialogs.cpmSelectionDraft === 'manual' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}>
              <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="manual-cpm-base">Ciclo más corto</Label><Input id="manual-cpm-base" value={dialogs.manualCpmBaseInput} onChange={dialogs.handleManualCpmBaseInputChange} /></div><div><Label htmlFor="manual-cpm-final">CPM obtenido</Label><Input id="manual-cpm-final" value={dialogs.manualCpmFinalInput} onChange={dialogs.handleManualCpmFinalInputChange} /></div></div>
              <Button type="button" variant="outline" onClick={() => dialogs.setShowCpmDeleteDialog(true)} disabled={!dialogs.canDeleteManualCpm}>Borrar</Button>
            </div>
            <div role="radio" tabIndex={0} onClick={() => dialogs.setCpmSelectionDraft('none')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setCpmSelectionDraft('none'))} className={`cursor-pointer rounded-2xl border px-3 py-2 ${dialogs.cpmSelectionDraft === 'none' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}>No usar ningún valor</div>
          </div>
          <DialogFooter className="px-4 pb-4"><Button type="button" variant="secondary" onClick={dialogs.handleCloseCpmDialog}>Cancelar</Button><Button type="button" onClick={dialogs.handleSaveCpm} disabled={dialogs.isCpmSaveDisabled}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogs.showCpmDeleteDialog} onOpenChange={dialogs.setShowCpmDeleteDialog}><DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100"><DialogHeader><DialogTitle>¿Estás segura de que quieres borrar el valor manual de CPM?</DialogTitle></DialogHeader><DialogFooter><Button type="button" variant="secondary" onClick={() => dialogs.setShowCpmDeleteDialog(false)}>Cancelar</Button><Button type="button" variant="destructive" onClick={dialogs.handleConfirmCpmDelete} disabled={dialogs.isDeletingManualCpm}>{dialogs.isDeletingManualCpm ? 'Borrando…' : 'Borrar'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dialogs.isT8DialogOpen} onOpenChange={(open) => !open && dialogs.handleCloseT8Dialog()}>
        <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-0 text-gray-800 shadow-xl">
          <DialogHeader className="space-y-2 px-4 pt-4 text-left"><DialogTitle>Editar T-8</DialogTitle><DialogDescription><div className="text-xs">Puedes usar el valor calculado automáticamente o fijar un valor manual.</div></DialogDescription></DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('auto')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setT8SelectionDraft('auto'))} className={`cursor-pointer rounded-2xl border px-3 py-3 ${dialogs.t8SelectionDraft === 'auto' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}>
              <button type="button" onClick={() => dialogs.setShowT8Details((p) => !p)}>{t8Info.highlightLabel}</button>
              {dialogs.showT8Details && computedT8Data.cycleCount > 0 && <ul className="mt-2 space-y-1">{computedT8Data.cyclesConsidered.map((cycle, index) => { const cycleId = cycle.cycleId || cycle.id; const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations); const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false; return <li key={`${cycleId || index}`} className="flex gap-2"><button type="button" className="flex-1 text-left" onClick={() => onNavigateToCycleDetails?.(cycle)}>{cycle.dateRangeLabel || cycle.displayName || 'Ciclo'} <ChevronRight className="inline h-3 w-3" /></button><Button type="button" variant="outline" size="xs" disabled={!cycleId || isPending} onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isIgnored ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</Button></li>; })}</ul>}
            </div>
            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('manual')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setT8SelectionDraft('manual'))} className={`cursor-pointer rounded-2xl border px-3 py-3 ${dialogs.t8SelectionDraft === 'manual' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}><div className="grid grid-cols-2 gap-2"><div><Label htmlFor="manual-t8-base">Ciclo con subida (día)</Label><Input id="manual-t8-base" value={dialogs.manualT8BaseInput} onChange={dialogs.handleManualT8BaseInputChange} /></div><div><Label htmlFor="manual-t8-final">T-8 manual (día)</Label><Input id="manual-t8-final" value={dialogs.manualT8FinalInput} onChange={dialogs.handleManualT8FinalInputChange} /></div></div><Button type="button" variant="outline" onClick={() => dialogs.setShowT8DeleteDialog(true)} disabled={!dialogs.canDeleteManualT8}>Borrar</Button></div>
            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('none')} onKeyDown={(e) => handleCardKeyDown(e, () => dialogs.setT8SelectionDraft('none'))} className={`cursor-pointer rounded-2xl border px-3 py-2 ${dialogs.t8SelectionDraft === 'none' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100'}`}>No usar ningún valor</div>
          </div>
          <DialogFooter className="px-4 pb-4"><Button type="button" variant="secondary" onClick={dialogs.handleCloseT8Dialog}>Cancelar</Button><Button type="button" onClick={dialogs.handleSaveT8} disabled={dialogs.isT8SaveDisabled}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogs.showT8DeleteDialog} onOpenChange={dialogs.setShowT8DeleteDialog}><DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100"><DialogHeader><DialogTitle>¿Estás segura de que quieres borrar el valor manual de T-8?</DialogTitle></DialogHeader><DialogFooter><Button type="button" variant="secondary" onClick={() => dialogs.setShowT8DeleteDialog(false)}>Cancelar</Button><Button type="button" variant="destructive" onClick={dialogs.handleConfirmT8Delete} disabled={dialogs.isDeletingManualT8}>{dialogs.isDeletingManualT8 ? 'Borrando…' : 'Borrar'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
};

export default FertilityCalculatorsEditorDialogs;
