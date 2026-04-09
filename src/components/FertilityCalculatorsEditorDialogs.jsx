import React, { useCallback } from 'react';
import { Ban, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
      <Dialog
        open={dialogs.isCpmDialogOpen}
        onOpenChange={(open) => {
          if (!open) dialogs.handleCloseCpmDialog();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-0 text-gray-800 shadow-xl">
          <DialogHeader className="space-y-2 px-4 pt-4 text-left">
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle>Editar CPM</DialogTitle>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${dialogs.cpmStatusMode === 'none' ? 'bg-gray-100 text-gray-600' : 'bg-rose-100 text-rose-700'}`}>
                {dialogs.cpmStatusChipLabel}
              </span>
            </div>
            <DialogDescription>
              <div className="text-xs">Puedes usar el valor calculado automáticamente o fijar un valor manual.</div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            <div
              role="radio"
              tabIndex={0}
              onClick={() => dialogs.setCpmSelectionDraft('auto')}
              onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setCpmSelectionDraft('auto'))}
              className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.cpmSelectionDraft === 'auto' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100 bg-white/80 hover:border-fertiliapp-suave'} ${!cpmInfo.canCompute ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-rose-900">Cálculo automático</p>
                  <span className="text-[11px] font-semibold text-rose-600">
                    {cpmInfo.canCompute && cpmInfo.value !== null
                      ? `CPM automático: ${dialogs.cpmAutomaticValueLabel} días`
                      : 'No disponible todavía'}
                  </span>
                  <p className="text-[10px] text-rose-600">Basado en tus ciclos completados.</p>
                </div>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.cpmSelectionDraft === 'auto' ? 'border-emerald-400 bg-emerald-400' : 'border-fertiliapp-suave bg-white'}`}>
                  {dialogs.cpmSelectionDraft === 'auto' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                </span>
              </div>

              <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                  <span>Datos disponibles</span>
                  <button
                    type="button"
                    onClick={() => dialogs.setShowCpmDetails((previous) => !previous)}
                    className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                    aria-expanded={dialogs.showCpmDetails}
                  >
                    {cpmInfo.highlightLabel}
                  </button>
                </div>

                {cpmInfo.summary && <p className="mt-1 text-[11px] text-rose-500">{cpmInfo.summary}</p>}
                {!cpmInfo.detailsAvailable && (
                  <p className="mt-1 text-[11px] text-rose-500">Aún no hay ciclos finalizados con fecha de finalización.</p>
                )}

                {dialogs.showCpmDetails && cpmInfo.detailsAvailable && (
                  <div className="mt-2 space-y-2">
                    {cpmInfo.cycles.length > 0 ? (
                      <ul className="space-y-1">
                        {cpmInfo.cycles.map((cycle, index) => {
                          const key = cycle.cycleId || cycle.id || `${cycle.displayName || cycle.name || cycle.startDate || 'cycle'}-${index}`;
                          const durationText = typeof cycle.duration === 'number' && Number.isFinite(cycle.duration) ? `${cycle.duration} días` : 'duración desconocida';
                          const isShortest = Boolean(cpmInfo.shortestCycle && cpmInfo.shortestCycle === cycle);
                          const cycleId = cycle.cycleId || cycle.id;
                          const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations);
                          const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false;

                          return (
                            <li key={key}>
                              <div className="flex items-stretch gap-2">
                                <div className={`flex-1 rounded-2xl border px-3 py-2 shadow-sm transition hover:border-rose-200 hover:bg-white ${isIgnored ? 'border-rose-200 bg-rose-50/80 opacity-80' : 'border-rose-100 bg-white/50'}`}>
                                  <button
                                    type="button"
                                    onClick={() => onNavigateToCycleDetails?.(cycle)}
                                    className="block w-full rounded-2xl px-1 py-0.5 text-left transition hover:bg-white/60 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-rose-700">{cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}</p>
                                      <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                    </div>
                                  </button>
                                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-500">
                                    <span>Duración: {durationText}</span>
                                    {isShortest && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-600">Ciclo más corto</span>}
                                  </div>
                                  {isIgnored && <p className="mt-1 text-[11px] text-rose-400">Ignorado para el cálculo automático.</p>}
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  disabled={!cycleId || isPending}
                                  onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)}
                                  className="h-8 w-8 shrink-0 self-center border-transparent bg-transparent p-0"
                                  title={isIgnored ? 'Incluir ciclo en el cálculo automático' : 'Ignorar ciclo para el cálculo automático'}
                                  aria-label={isIgnored ? 'Incluir ciclo en el cálculo automático' : 'Ignorar ciclo para el cálculo automático'}
                                  aria-pressed={isIgnored}
                                >
                                  {isPending ? <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> : isIgnored ? <Ban className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-green-800/70" />}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-rose-500">Aún no hay ciclos finalizados con fecha de finalización.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              role="radio"
              tabIndex={0}
              onClick={() => dialogs.setCpmSelectionDraft('manual')}
              onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setCpmSelectionDraft('manual'))}
              className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.cpmSelectionDraft === 'manual' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100 bg-white/80 hover:border-rose-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-rose-900">Valor manual</p>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.cpmSelectionDraft === 'manual' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'}`}>
                  {dialogs.cpmSelectionDraft === 'manual' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-cpm-base" className="text-xs text-gray-600">Ciclo más corto</Label>
                  <Input id="manual-cpm-base" type="number" value={dialogs.manualCpmBaseInput} onChange={dialogs.handleManualCpmBaseInputChange} placeholder="Introduce un entero" aria-describedby={dialogs.manualCpmEditedSide ? 'manual-cpm-helper' : undefined} />
                  {dialogs.manualCpmBaseError && <p className="text-xs text-red-500">{dialogs.manualCpmBaseError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-cpm-final" className="text-xs text-gray-600">CPM obtenido</Label>
                  <Input id="manual-cpm-final" type="number" value={dialogs.manualCpmFinalInput} onChange={dialogs.handleManualCpmFinalInputChange} placeholder="Introduce el valor" aria-describedby={dialogs.manualCpmEditedSide ? 'manual-cpm-helper' : undefined} />
                  {dialogs.manualCpmFinalError && <p className="text-xs text-red-500">{dialogs.manualCpmFinalError}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                {dialogs.manualCpmEditedSide && (
                  <span id="manual-cpm-helper" className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600">
                    {dialogs.manualCpmEditedSide === 'base' ? 'Usando Ciclo más corto como base' : 'Usando CPM (final)'}
                  </span>
                )}
                <Button type="button" variant="outline" onClick={() => dialogs.setShowCpmDeleteDialog(true)} disabled={!dialogs.canDeleteManualCpm} className="h-8 shrink-0 rounded-full border border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">Borrar</Button>
              </div>

              {dialogs.isCpmSaveDisabled && dialogs.cpmSelectionDraft === 'manual' && !dialogs.isManualCpm && (
                <p className="mt-2 text-[11px] text-rose-500">Introduce un valor válido antes de seleccionar.</p>
              )}
            </div>

            <div
              role="radio"
              tabIndex={0}
              onClick={() => dialogs.setCpmSelectionDraft('none')}
              onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setCpmSelectionDraft('none'))}
              className={`cursor-pointer rounded-2xl border px-3 py-2 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.cpmSelectionDraft === 'none' ? 'border-emerald-300 bg-emerald-50/60' : 'border-dashed border-rose-200 bg-white/70 hover:border-rose-300'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-rose-900">No usar ningún valor</p>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.cpmSelectionDraft === 'none' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'}`}>
                  {dialogs.cpmSelectionDraft === 'none' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-0 flex flex-col gap-3 px-4 pb-4">
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={dialogs.handleCloseCpmDialog} className="h-8 rounded-full px-4 text-xs">Cancelar</Button>
              <Button type="button" onClick={dialogs.handleSaveCpm} disabled={dialogs.isCpmSaveDisabled} className="h-8 rounded-full px-4 text-xs">Guardar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogs.showCpmDeleteDialog} onOpenChange={dialogs.setShowCpmDeleteDialog}>
        <DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100">
          <DialogHeader><DialogTitle>¿Estás segura de que quieres borrar el valor manual de CPM?</DialogTitle></DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => dialogs.setShowCpmDeleteDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button type="button" variant="destructive" onClick={dialogs.handleConfirmCpmDelete} disabled={dialogs.isDeletingManualCpm} className="w-full sm:w-auto">{dialogs.isDeletingManualCpm ? 'Borrando…' : 'Borrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogs.isT8DialogOpen}
        onOpenChange={(open) => {
          if (!open) dialogs.handleCloseT8Dialog();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-0 text-gray-800 shadow-xl">
          <DialogHeader className="space-y-2 px-4 pt-4 text-left">
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle>Editar T-8</DialogTitle>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${dialogs.t8StatusMode === 'none' ? 'bg-gray-100 text-gray-600' : 'bg-rose-100 text-rose-700'}`}>
                {dialogs.t8StatusChipLabel}
              </span>
            </div>
            <DialogDescription>
              <div className="text-xs">Puedes usar el valor calculado automáticamente o fijar un valor manual.</div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-3">

            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('auto')} onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setT8SelectionDraft('auto'))} className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.t8SelectionDraft === 'auto' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100 bg-white/80 hover:border-rose-200'} ${!computedT8Data.canCompute ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-rose-900">Cálculo automático</p>
                  <span className="text-[11px] font-semibold text-rose-600">{computedT8Data.canCompute && computedT8Data.value !== null ? `T-8 automático: Día ${dialogs.t8AutomaticValueLabel}` : 'No disponible todavía'}</span>
                  <p className="text-[10px] text-rose-600">Basado en tus ciclos completados.</p>
                </div>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.t8SelectionDraft === 'auto' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'}`}>{dialogs.t8SelectionDraft === 'auto' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}</span>
              </div>

              <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2.5 text-[11px] text-rose-900">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700">
                  <span>Datos disponibles</span>
                  <button type="button" onClick={() => dialogs.setShowT8Details((previous) => !previous)} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70" aria-expanded={dialogs.showT8Details}>{t8Info.highlightLabel}</button>
                </div>
                {t8Info.summary && <p className="mt-1 text-[11px] text-rose-500">{t8Info.summary}</p>}
                {computedT8Data.cycleCount === 0 && <p className="mt-1 text-[11px] text-rose-500">Aún no hay ciclos con ovulación confirmada por temperatura.</p>}

                {dialogs.showT8Details && computedT8Data.cycleCount > 0 && (
                  <div className="mt-2 space-y-2">
                    {computedT8Data.cyclesConsidered.length > 0 ? (
                      <ul className="space-y-1">
                        {computedT8Data.cyclesConsidered.map((cycle, index) => {
                          const key = cycle.cycleId || `${cycle.displayName}-${cycle.riseDay}-${index}`;
                          const cycleId = cycle.cycleId || cycle.id;
                          const riseDayText = typeof cycle.riseDay === 'number' && Number.isFinite(cycle.riseDay) ? cycle.riseDay : '—';
                          const isIgnored = Boolean(cycle.isIgnored || cycle.ignoredForAutoCalculations);
                          const isPending = cycleId ? pendingIgnoredCycleIds.includes(cycleId) : false;

                          return (
                            <li key={key}>
                              <div className="flex items-stretch gap-2">
                                <div className={`flex-1 rounded-2xl border px-3 py-2 shadow-sm transition hover:border-rose-200 hover:bg-white ${isIgnored ? 'border-rose-200 bg-rose-50/80 opacity-80' : 'border-rose-100 bg-white/40'}`}>
                                  <button type="button" onClick={() => onNavigateToCycleDetails?.(cycle)} className="block w-full rounded-2xl px-1 py-0.5 text-left transition hover:bg-white/60 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-rose-700">{cycle.dateRangeLabel || cycle.displayName || cycle.name || 'Ciclo sin nombre'}</p>
                                      <ChevronRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                                    </div>
                                  </button>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-rose-500">
                                    <span>Día de subida: {riseDayText}</span>
                                    {Number.isFinite(cycle.t8Day) && <span>T-8: Día {cycle.t8Day}</span>}
                                  </div>
                                  {isIgnored && <p className="mt-1 text-[11px] text-rose-400">Ignorado para el cálculo automático.</p>}
                                </div>

                                <Button type="button" variant="outline" size="icon" disabled={!cycleId || isPending} onClick={() => cycleId && handleToggleCycleIgnore(cycleId, !isIgnored)} className="h-8 w-8 shrink-0 self-center border-transparent bg-transparent p-0" title={isIgnored ? 'Incluir ciclo en el cálculo automático' : 'Ignorar ciclo para el cálculo automático'} aria-label={isIgnored ? 'Incluir ciclo en el cálculo automático' : 'Ignorar ciclo para el cálculo automático'} aria-pressed={isIgnored}>
                                  {isPending ? <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> : isIgnored ? <Ban className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-green-800/70" />}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-rose-500">Aún no hay ciclos con ovulación confirmada por temperatura.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('manual')} onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setT8SelectionDraft('manual'))} className={`cursor-pointer rounded-2xl border px-3 py-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.t8SelectionDraft === 'manual' ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-100 bg-white/80 hover:border-rose-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-rose-900">Valor manual</p>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.t8SelectionDraft === 'manual' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'}`}>{dialogs.t8SelectionDraft === 'manual' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-t8-base" className="text-xs text-gray-600">Ciclo con subida (día)</Label>
                  <Input id="manual-t8-base" type="number" value={dialogs.manualT8BaseInput} onChange={dialogs.handleManualT8BaseInputChange} placeholder="Día de subida" aria-describedby={dialogs.manualT8EditedSide ? 'manual-t8-helper' : undefined} />
                  {dialogs.manualT8BaseError && <p className="text-xs text-red-500">{dialogs.manualT8BaseError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-t8-final" className="text-xs text-gray-600">T-8 manual (día)</Label>
                  <Input id="manual-t8-final" type="number" value={dialogs.manualT8FinalInput} onChange={dialogs.handleManualT8FinalInputChange} placeholder="Día del T-8" aria-describedby={dialogs.manualT8EditedSide ? 'manual-t8-helper' : undefined} />
                  {dialogs.manualT8FinalError && <p className="text-xs text-red-500">{dialogs.manualT8FinalError}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                {dialogs.manualT8EditedSide && (
                  <span id="manual-t8-helper" className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600">
                    {dialogs.manualT8EditedSide === 'base' ? 'Usando día de subida como base' : 'Usando T-8 manual'}
                  </span>
                )}
                <Button type="button" variant="outline" onClick={() => dialogs.setShowT8DeleteDialog(true)} disabled={!dialogs.canDeleteManualT8} className="h-8 shrink-0 rounded-full border border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">Borrar</Button>
              </div>

              {dialogs.isT8SaveDisabled && dialogs.t8SelectionDraft === 'manual' && !dialogs.isManualT8 && (
                <p className="mt-2 text-[11px] text-rose-500">Introduce un valor válido antes de seleccionar.</p>
              )}
            </div>

            <div role="radio" tabIndex={0} onClick={() => dialogs.setT8SelectionDraft('none')} onKeyDown={(event) => handleCardKeyDown(event, () => dialogs.setT8SelectionDraft('none'))} className={`cursor-pointer rounded-2xl border px-3 py-2 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 ${dialogs.t8SelectionDraft === 'none' ? 'border-emerald-300 bg-emerald-50/60' : 'border-dashed border-rose-200 bg-white/70 hover:border-rose-300'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-rose-900">No usar ningún valor</p>
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${dialogs.t8SelectionDraft === 'none' ? 'border-emerald-400 bg-emerald-400' : 'border-rose-300 bg-white'}`}>{dialogs.t8SelectionDraft === 'none' && <span className="h-2.5 w-2.5 rounded-full bg-white" />}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-0 flex flex-col gap-3 px-4 pb-4">
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={dialogs.handleCloseT8Dialog} className="h-8 rounded-full px-4 text-xs">Cancelar</Button>
              <Button type="button" onClick={dialogs.handleSaveT8} disabled={dialogs.isT8SaveDisabled} className="h-8 rounded-full px-4 text-xs">Guardar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogs.showT8DeleteDialog} onOpenChange={dialogs.setShowT8DeleteDialog}>
        <DialogContent className="w-[90vw] max-w-xs rounded-2xl border border-rose-100">
          <DialogHeader><DialogTitle>¿Estás segura de que quieres borrar el valor manual de T-8?</DialogTitle></DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => dialogs.setShowT8DeleteDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button type="button" variant="destructive" onClick={dialogs.handleConfirmT8Delete} disabled={dialogs.isDeletingManualT8} className="w-full sm:w-auto">{dialogs.isDeletingManualT8 ? 'Borrando…' : 'Borrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FertilityCalculatorsEditorDialogs;
