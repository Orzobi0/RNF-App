import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Baby, CalendarDays, ChevronRight, Loader2, RotateCcw, Pencil,  Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import useBackClose from '@/hooks/useBackClose';

const DRAG_CLOSE_THRESHOLD_PX = 80;

const SwitchIndicator = ({ checked, disabled }) => (
  <span
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
      checked ? 'bg-rose-400' : 'bg-slate-300',
      disabled && 'opacity-60'
    )}
    aria-hidden="true"
  >
    <span
      className={cn(
        'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0.5'
      )}
    />
  </span>
);

const CycleOptionsSheet = ({
  open,
  onOpenChange,
  showCycleSummary = false,
  cycleLabel,
  cycleMeta,
  isCurrentCycle = false,
  onCycleSummaryClick,
  postpartumMode = false,
  isUpdatingPostpartum = false,
  editDatesLabel = 'Editar fecha de inicio',
  onEditStartDate,
  onPostpartumChange,
  onUndoCycle,
  showUndoCycle = false,
  onDeleteCycle,
  showDeleteCycle = false,
  deleteTitle = 'Eliminar ciclo',
  deleteLabel = 'Eliminar ciclo',
  isProcessing = false,
}) => {
  const canTogglePostpartum = !isProcessing && !isUpdatingPostpartum;
  const dragStartYRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const dragPointerTypeRef = useRef(null);
  const dragTargetRef = useRef(null);
  const dragFallbackTimeoutRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (open) {
      dragStartYRef.current = 0;
      dragOffsetRef.current = 0;
      isDraggingRef.current = false;
      dragPointerIdRef.current = null;
      dragPointerTypeRef.current = null;
      dragTargetRef.current = null;
      if (dragFallbackTimeoutRef.current) {
        window.clearTimeout(dragFallbackTimeoutRef.current);
        dragFallbackTimeoutRef.current = null;
      }
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [open]);

  const finishDrag = useCallback(
    (event) => {
      if (!isDraggingRef.current) return;
      if (event?.pointerId != null && dragPointerIdRef.current !== event.pointerId) return;

      dragTargetRef.current?.releasePointerCapture?.(dragPointerIdRef.current);
      if (dragFallbackTimeoutRef.current) {
        window.clearTimeout(dragFallbackTimeoutRef.current);
        dragFallbackTimeoutRef.current = null;
      }
      isDraggingRef.current = false;
      dragPointerIdRef.current = null;
      dragPointerTypeRef.current = null;
      dragTargetRef.current = null;
      setIsDragging(false);

      if (dragOffsetRef.current >= DRAG_CLOSE_THRESHOLD_PX) {
        onOpenChange?.(false);
        return;
      }

      dragOffsetRef.current = 0;
      setDragOffset(0);
    },
    [onOpenChange]
  );
const handleBackClose = useCallback(() => {
  onOpenChange?.(false);
}, [onOpenChange]);

useBackClose(open, handleBackClose);

  const handleDragPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragPointerIdRef.current = event.pointerId;
    dragPointerTypeRef.current = event.pointerType;
    dragTargetRef.current = event.currentTarget;
    dragStartYRef.current = event.clientY;
    dragOffsetRef.current = 0;
    isDraggingRef.current = true;
    setIsDragging(true);
    setDragOffset(0);
  }, []);

  const handleDragPointerMove = useCallback((event) => {
    if (!isDraggingRef.current) return;
    if (event.pointerId != null && dragPointerIdRef.current !== event.pointerId) return;

    const nextOffset = Math.max(0, event.clientY - dragStartYRef.current);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);

    if (nextOffset > 0) {
      event.preventDefault();
    }

    if (nextOffset >= DRAG_CLOSE_THRESHOLD_PX) {
      dragTargetRef.current?.releasePointerCapture?.(dragPointerIdRef.current);
      if (dragFallbackTimeoutRef.current) {
        window.clearTimeout(dragFallbackTimeoutRef.current);
        dragFallbackTimeoutRef.current = null;
      }
      isDraggingRef.current = false;
      dragPointerIdRef.current = null;
      dragPointerTypeRef.current = null;
      dragTargetRef.current = null;
      setIsDragging(false);
      onOpenChange?.(false);
      return;
    }

    if (dragPointerTypeRef.current !== 'touch') {
      if (dragFallbackTimeoutRef.current) {
        window.clearTimeout(dragFallbackTimeoutRef.current);
      }
      dragFallbackTimeoutRef.current = window.setTimeout(() => {
        finishDrag({ pointerId: dragPointerIdRef.current });
      }, 220);
    }
  }, [finishDrag, onOpenChange]);

  useEffect(() => {
    if (!isDragging) return undefined;

    window.addEventListener('pointermove', handleDragPointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    window.addEventListener('mouseup', finishDrag);
    window.addEventListener('touchend', finishDrag);
    window.addEventListener('touchcancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handleDragPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      window.removeEventListener('mouseup', finishDrag);
      window.removeEventListener('touchend', finishDrag);
      window.removeEventListener('touchcancel', finishDrag);
    };
  }, [finishDrag, handleDragPointerMove, isDragging]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/[0.12] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[min(82dvh,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-rose-100 bg-white px-4 pt-3 shadow-[0_-18px_40px_rgba(15,23,42,0.18)] outline-none',
            'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
            'data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom'
          )}
          style={{
            bottom: dragOffset ? `-${dragOffset}px` : undefined,
            transition: isDragging ? 'none' : 'bottom 180ms ease-out',
          }}
        >
          <div
            className="touch-none select-none pb-3"
            onPointerDown={handleDragPointerDown}
            onLostPointerCapture={finishDrag}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />

            <div className="pr-12">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight text-slate-900">
                Opciones del ciclo
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {[cycleLabel, cycleMeta, isCurrentCycle ? 'Ciclo actual' : null, postpartumMode ? 'Modo postparto activado' : null]
                  .filter(Boolean)
                  .join('. ')}
              </DialogPrimitive.Description>
            </div>
          </div>

          <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Cerrar opciones del ciclo</span>
          </DialogPrimitive.Close>

          <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-1">
            {showCycleSummary ? (
              <button
                type="button"
                onClick={onCycleSummaryClick}
                disabled={!onCycleSummaryClick || isProcessing}
                aria-label={cycleLabel ? `Ver registros de ${cycleLabel}` : 'Ver registros del ciclo'}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-1 py-1 text-left transition hover:bg-rose-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-fertiliapp-fuerte">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-slate-800">
                      {cycleLabel}
                    </span>
                    {isCurrentCycle ? (
                      <span className="shrink-0 rounded-full bg-fertiliapp-fuerte px-2 py-0.5 text-[10px] font-semibold leading-4 text-white">
                        Actual
                      </span>
                    ) : null}
                    {postpartumMode ? (
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white text-fertiliapp-fuerte"
                        aria-label="Modo postparto activado"
                        title="Modo postparto activado"
                      >
                        <Baby className="h-3 w-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                  {cycleMeta ? (
                    <span className="mt-0.5 block truncate text-xs font-medium leading-4 text-slate-500">
                      {cycleMeta}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-rose-100/80 bg-white">
              <button
                type="button"
                onClick={onEditStartDate}
                disabled={isProcessing}
                className="flex min-h-[56px] w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-rose-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-fertiliapp-fuerte">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                  {editDatesLabel}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              </button>

              <div className="mx-3 h-px bg-rose-100/70" />

              <button
                type="button"
                role="switch"
                aria-checked={postpartumMode}
                onClick={() => {
                  if (!canTogglePostpartum) return;
                  onPostpartumChange?.(!postpartumMode);
                }}
                disabled={!canTogglePostpartum}
                className="grid min-h-[56px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-3 text-left transition hover:bg-rose-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-rose-600">
                  <Baby className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 text-sm font-semibold text-slate-800">Modo postparto</span>
                <span className="inline-flex h-8 min-w-11 items-center justify-end">
                  {isUpdatingPostpartum ? (
                    <Loader2 className="h-5 w-5 animate-spin text-rose-400" aria-hidden="true" />
                  ) : (
                    <SwitchIndicator checked={postpartumMode} disabled={!canTogglePostpartum} />
                  )}
                </span>
              </button>
            </div>

            {showUndoCycle ? (
              <div className="border-t border-rose-100/80 pt-4">
              <button
                type="button"
                onClick={onUndoCycle}
                disabled={isProcessing}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-amber-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-amber-900">Deshacer ciclo</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-amber-800">
                    Une el ciclo actual con el anterior.
                  </span>
                </span>
              </button>
              </div>
            ) : null}

            {showDeleteCycle ? (
              <div className="border-t border-rose-100/80 pt-4">
              <button
                type="button"
                onClick={onDeleteCycle}
                disabled={isProcessing}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-red-700 transition hover:bg-red-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-red-900">{deleteLabel || deleteTitle}</span>
                </span>
              </button>
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default CycleOptionsSheet;
