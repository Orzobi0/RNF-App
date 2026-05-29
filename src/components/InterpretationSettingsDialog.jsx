import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const formatTemp = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} C` : '-');

const formatDate = (isoDate) => {
  if (!isoDate) return '-';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
};

const ruleLabel = (rule) => {
  switch (rule) {
    case '3-high':
      return '3/6';
    case 'german-3+1':
      return '+4 por excepcion';
    case 'german-2nd-exception':
      return 'segunda excepcion';
    case 'pp-after-3-high':
      return 'postparto con dia extra';
    case 'pp-after-german-3+1':
      return 'postparto +4 con dia extra';
    case 'pp-after-german-2nd-exception':
      return 'postparto segunda excepcion';
    default:
      return rule || '-';
  }
};

const statusLabel = (status) => {
  switch (status) {
    case 'confirmed':
      return 'Confirmada manualmente';
    case 'invalid':
      return 'Pendiente: la secuencia no confirma';
    case 'insufficient':
    case 'pending':
      return 'Pendiente: faltan temperaturas posteriores';
    default:
      return 'Pendiente';
  }
};

const compactStatusLabel = (evaluation) => {
  const status = evaluation?.status;
  const rule = evaluation?.rule ?? evaluation?.ovulationDetails?.rule ?? null;

  if (status === 'confirmed') {
    switch (rule) {
      case '3-high':
        return 'Confirmada D+3';
      case 'german-3+1':
      case 'german-2nd-exception':
        return 'Excepcion D+4';
      case 'pp-after-3-high':
      case 'pp-after-german-3+1':
      case 'pp-after-german-2nd-exception':
        return 'Confirmada postparto';
      default:
        return 'Confirmada';
    }
  }

  if (status === 'invalid') return 'No confirma';
  if (status === 'insufficient') return 'Faltan datos';
  if (status === 'pending') {
    const count =
      evaluation?.sequenceDisplayIndices?.length ??
      evaluation?.ovulationDetails?.sequenceDisplayIndices?.length ??
      0;
    return count >= 3 ? 'Necesita D+4' : 'Pendiente';
  }
  return 'Pendiente';
};

const compactRuleLabel = (rule) => {
  switch (rule) {
    case '3-high':
      return 'regla 3/6';
    case 'german-3+1':
      return '1a excepcion';
    case 'german-2nd-exception':
      return '2a excepcion';
    case 'pp-after-3-high':
      return 'postparto';
    case 'pp-after-german-3+1':
      return 'postparto - 1a excepcion';
    case 'pp-after-german-2nd-exception':
      return 'postparto - 2a excepcion';
    default:
      return 'confirmada';
  }
};

const compactDraftText = (draft, evaluation, summary) => {
  if (!draft?.firstHighIsoDate) {
    return 'Selecciona primer dia de subida';
  }

  if (evaluation?.status === 'invalid') {
    return 'Sin confirmacion termica por reglas';
  }

  if (evaluation?.status === 'insufficient') {
    return 'Faltan datos para confirmar temperatura';
  }

  if (evaluation?.status === 'pending') {
    return 'Subida termica pendiente';
  }

  if (evaluation?.status === 'confirmed') {
    const date = formatDate(summary?.confirmationIsoDate);
    const day = Number.isInteger(summary?.confirmationCycleDay)
      ? `D${summary.confirmationCycleDay}`
      : null;
    const dayPart = day ? `${date} ${day}` : date;
    const rule = compactRuleLabel(summary?.rule ?? evaluation?.rule ?? evaluation?.ovulationDetails?.rule);
    return `Confirmacion termica el ${dayPart} (${rule})`;
  }

  return compactStatusLabel(evaluation);
};

const SummaryRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-semibold text-slate-700">{value}</span>
  </div>
);

const FutureSection = ({ title }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 opacity-75">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-400">
        Proximamente
      </span>
    </div>
  </div>
);

const InterpretationSettingsDialog = ({
  open,
  editing = false,
  manualActive = false,
  automaticSummary = null,
  manualSummary = null,
  draft = null,
  draftEvaluation = null,
  draftSummary = null,
  canSave = false,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onResetAuto,
  isRotated = false,
  viewport = null,
  isFullScreen = false,
}) => {
  const [floatingPosition, setFloatingPosition] = useState(null);
  const [floatingMovedByUser, setFloatingMovedByUser] = useState(false);
  const [isDraggingFloatingBar, setIsDraggingFloatingBar] = useState(false);
  const dragStateRef = useRef(null);

  const viewportWidth = Math.max(
    1,
    Number(viewport?.w) ||
      (typeof window !== 'undefined'
        ? Math.round(window.visualViewport?.width ?? window.innerWidth ?? 1)
        : 1)
  );
  const viewportHeight = Math.max(
    1,
    Number(viewport?.h) ||
      (typeof window !== 'undefined'
        ? Math.round(window.visualViewport?.height ?? window.innerHeight ?? 1)
        : 1)
  );

  const getDefaultFloatingPosition = useCallback(() => {
    if (isRotated) {
      return {
        x: 28,
        y: viewportHeight / 2,
      };
    }

    return {
      x: viewportWidth / 2,
      y: viewportHeight - (isFullScreen ? 42 : 92),
    };
  }, [isFullScreen, isRotated, viewportHeight, viewportWidth]);

  useEffect(() => {
    if (!open || !editing) {
      setFloatingPosition(null);
      setFloatingMovedByUser(false);
      return;
    }

    if (!floatingMovedByUser) {
      setFloatingPosition(getDefaultFloatingPosition());
    }
  }, [editing, floatingMovedByUser, getDefaultFloatingPosition, open]);

  useEffect(() => {
    setFloatingMovedByUser(false);
  }, [isFullScreen, isRotated]);

  const clampFloatingPosition = useCallback((position) => {
    const margin = 20;
    return {
      x: Math.min(Math.max(position.x, margin), viewportWidth - margin),
      y: Math.min(Math.max(position.y, margin), viewportHeight - margin),
    };
  }, [viewportHeight, viewportWidth]);

  const clearDragState = useCallback(() => {
    const state = dragStateRef.current;
    if (state?.holdTimer && typeof window !== 'undefined') {
      window.clearTimeout(state.holdTimer);
    }
    dragStateRef.current = null;
    setIsDraggingFloatingBar(false);
  }, []);

  const handleFloatingPointerDown = useCallback((event) => {
    if (event.target?.closest?.('[data-floating-action="true"]')) return;
    if (typeof window === 'undefined') return;

    const startPosition = floatingPosition ?? getDefaultFloatingPosition();
    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition,
      dragging: false,
      holdTimer: 0,
    };

    state.holdTimer = window.setTimeout(() => {
      state.dragging = true;
      setIsDraggingFloatingBar(true);
      setFloatingMovedByUser(true);
    }, 180);

    dragStateRef.current = state;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }, [floatingPosition, getDefaultFloatingPosition]);

  const handleFloatingPointerMove = useCallback((event) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId || !state.dragging) return;

    event.preventDefault();
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    setFloatingPosition(clampFloatingPosition({
      x: state.startPosition.x + dx,
      y: state.startPosition.y + dy,
    }));
  }, [clampFloatingPosition]);

  const handleFloatingPointerUp = useCallback((event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    }
    clearDragState();
  }, [clearDragState]);

  if (!open) return null;

  if (editing) {
    const rotatedWidth = Math.max(
      280,
      Math.min(Number(viewport?.h) > 0 ? Number(viewport.h) - 32 : 520, 520)
    );
    const position = floatingPosition ?? getDefaultFloatingPosition();
    const barWidth = isRotated ? `${rotatedWidth}px` : 'min(calc(100vw - 16px), 520px)';

    return (
      <div
        className="pointer-events-none fixed z-[450] p-0"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: barWidth,
          transform: `translate(-50%, -50%) rotate(${isRotated ? 90 : 0}deg)`,
          transformOrigin: 'center center',
        }}
      >
        <div
          className={`pointer-events-auto mx-auto flex h-10 w-full max-w-lg touch-none select-none items-center gap-1.5 rounded-lg border border-orange-200 bg-white/95 px-2 shadow-xl shadow-slate-900/15 backdrop-blur ${
            isDraggingFloatingBar ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handleFloatingPointerDown}
          onPointerMove={handleFloatingPointerMove}
          onPointerUp={handleFloatingPointerUp}
          onPointerCancel={handleFloatingPointerUp}
        >
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-red-700 sm:text-xs">
            {compactDraftText(draft, draftEvaluation, draftSummary)}
          </p>
          <Button
            type="button"
            variant="ghost"
            data-floating-action="true"
            className="h-7 shrink-0 px-2 text-[11px] text-slate-600 sm:px-2.5 sm:text-xs"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCancelEdit}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-floating-action="true"
            className="h-7 shrink-0 bg-rose-600 px-2 text-[11px] text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100 sm:px-2.5 sm:text-xs"
            disabled={!canSave}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onSaveEdit}
          >
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  const summary = manualActive ? manualSummary : automaticSummary;

  return (
    <div className="fixed inset-0 z-[350] flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes de interpretacion"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-orange-100 bg-white shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-orange-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-titulo">Ajustes de interpretacion</h2>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="Cerrar ajustes de interpretacion"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            <p className="text-sm font-semibold text-red-800">
              {manualActive ? 'Subida termica manual' : 'Subida termica automatica'}
            </p>
            <div className="mt-3 space-y-2">
              <SummaryRow label="Linea base" value={formatTemp(summary?.baselineTemp)} />
              <SummaryRow label="Primer dia alto" value={formatDate(summary?.firstHighIsoDate)} />
              <SummaryRow label="Confirmacion" value={formatDate(summary?.confirmationIsoDate)} />
              <SummaryRow label="Regla" value={ruleLabel(summary?.rule)} />
              {manualActive && (
                <SummaryRow label="Estado" value={statusLabel(summary?.status)} />
              )}
            </div>
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Subida termica</h3>
              <p className="text-xs leading-relaxed text-slate-500">
                La fase postovulatoria confirmada requiere tambien cierre por moco/pico.
              </p>
            </div>

            {manualActive ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="bg-rose-600 text-white hover:bg-rose-700" onClick={onStartEdit}>
                  Modificar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-orange-200 bg-white text-red-700 hover:bg-orange-50"
                  onClick={onResetAuto}
                >
                  Volver a automatico
                </Button>
              </div>
            ) : (
              <Button type="button" className="bg-rose-600 text-white hover:bg-rose-700" onClick={onStartEdit}>
                Modificar manualmente
              </Button>
            )}
          </section>

          <FutureSection title="Inicio fertil manual" />
          <FutureSection title="Otras fases" />
        </div>
      </section>
    </div>
  );
};

export default InterpretationSettingsDialog;
