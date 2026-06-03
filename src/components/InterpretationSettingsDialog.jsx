import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, GripHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const formatTemp = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} ºC` : '-');

const formatDate = (isoDate) => {
  if (!isoDate) return '-';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
};

const getWarningCode = (warning) =>
  typeof warning === 'string' ? warning : warning?.code ?? null;

const getWarningCodes = (source) =>
  (Array.isArray(source?.warnings) ? source.warnings : [])
    .map(getWarningCode)
    .filter(Boolean);

const hasNoComplyWarning = (source) => {
  const codes = getWarningCodes(source);
  return (
    source?.rule === 'no-cumple' ||
    source?.status === 'invalid' ||
    codes.includes('missing-previous-six') ||
    codes.includes('baseline-below-previous-six') ||
    codes.includes('first-high-not-above-baseline')
  );
};

const warningLabel = (source) => {
  const codes = getWarningCodes(source);
  if (codes.includes('baseline-below-previous-six')) {
    return 'Hay temperaturas previas por encima de la línea base';
  }
  if (codes.includes('first-high-not-above-baseline')) {
    return 'El día seleccionado no supera la línea base';
  }
  if (codes.includes('missing-previous-six')) {
    return 'Faltan 6 temperaturas previas';
  }
  if (codes.includes('baseline-above-previous-six')) {
    return 'Línea base manual conservadora';
  }
  return null;
};

const fertileStartWarningLabel = (source) => {
  const warnings = Array.isArray(source?.warnings) ? source.warnings : [];
  if (warnings.includes('manual-date-out-of-cycle')) {
    return 'Fecha manual fuera del ciclo';
  }
  if (warnings.includes('manual-after-temperature-closure')) {
    return 'Inicio fértil posterior al cierre térmico';
  }
  if (warnings.includes('manual-after-mucus-closure')) {
    return 'Inicio fértil posterior al cierre estimado por moco';
  }
  if (warnings.includes('manual-after-calculated-closure')) {
    return 'Inicio fértil posterior al cierre calculado';
  }
  return null;
};

const ruleLabel = (rule, source = null) => {
  if (rule === 'ignored') return 'No se usa';
  if (rule === 'no-cumple' || hasNoComplyWarning(source)) return 'No cumple';
  switch (rule) {
    case '3-high':
      return '3/6';
    case 'german-3+1':
      return '+4 por excepción';
    case 'german-2nd-exception':
      return 'segunda excepción';
    case 'pp-after-3-high':
      return 'postparto con dia extra';
    case 'pp-after-german-3+1':
      return 'postparto +4 con dia extra';
    case 'pp-after-german-2nd-exception':
      return 'postparto segunda excepción';
    default:
      return rule || '-';
  }
};

const statusLabel = (status, { manual = false } = {}) => {
  switch (status) {
    case 'ignored':
      return 'Subida térmica ignorada manualmente';
    case 'confirmed':
      return manual ? 'Confirmada manualmente' : 'Confirmada';
    case 'invalid':
      return 'Manual fuera de regla';
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
        return 'Excepción D+4';
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
      return '1ª excepción';
    case 'german-2nd-exception':
      return '2ª excepción';
    case 'pp-after-3-high':
      return 'postparto';
    case 'pp-after-german-3+1':
      return 'postparto - 1ª excepción';
    case 'pp-after-german-2nd-exception':
      return 'postparto - 2ª excepción';
    default:
      return 'confirmada';
  }
};

const compactDraftText = (draft, evaluation, summary) => {
  if (!draft?.firstHighIsoDate) {
    return 'Selecciona primer día de subida';
  }

  const warning = warningLabel(summary) ?? warningLabel(evaluation);
  if (warning && warning !== 'Línea base manual conservadora') {
    return warning;
  }

  if (evaluation?.status === 'invalid') {
    return 'Sin confirmación térmica por reglas';
  }

  if (evaluation?.status === 'insufficient') {
    return 'Faltan datos para confirmar temperatura';
  }

  if (evaluation?.status === 'pending') {
    return 'Subida térmica pendiente';
  }

  if (evaluation?.status === 'confirmed') {
    const date = formatDate(summary?.confirmationIsoDate);
    const day = Number.isInteger(summary?.confirmationCycleDay)
      ? `D${summary.confirmationCycleDay}`
      : null;
    const dayPart = day ? `${date} ${day}` : date;
    const rule = compactRuleLabel(summary?.rule ?? evaluation?.rule ?? evaluation?.ovulationDetails?.rule);
    return `Confirmación térmica el ${dayPart} - ${rule}`;
  }

  return compactStatusLabel(evaluation);
};

const compactFertileStartDraftText = (draft, summary) => {
  if (!draft?.isoDate) return 'Selecciona inicio fértil';
  const date = formatDate(draft.isoDate);
  const day = Number.isInteger(summary?.cycleDay) ? `D${summary.cycleDay}` : null;
  return day ? `Inicio fértil manual ${date} ${day}` : `Inicio fértil manual ${date}`;
};

const SummaryRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-semibold text-slate-700">{value}</span>
  </div>
);

const getThermalChip = ({ manualActive, ignoredActive, summary, summaryOutOfRule }) => {
  if (ignoredActive) {
    return {
      label: 'Ignorada',
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    };
  }

  if (summaryOutOfRule) {
    return {
      label: 'No cumple',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (manualActive) {
    if (summary?.status === 'pending' || summary?.status === 'insufficient') {
      return {
        label: 'Pendiente',
        className: 'border-orange-200 bg-orange-50 text-orange-700',
      };
    }
    return {
      label: 'Manual',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (summary?.status === 'confirmed') {
    return {
      label: 'Auto',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  return {
    label: 'Auto',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  };
};

const getFertileStartChip = ({ manualActive, summary, warning }) => {
  if (manualActive) {
    return {
      label: 'Manual',
      className: 'border-pink-200 bg-pink-50 text-pink-700',
      warning: Boolean(warning),
    };
  }
  if (summary?.status === 'insufficient' || !summary?.isoDate) {
    return {
      label: 'Sin datos',
      className: 'border-slate-200 bg-slate-50 text-slate-500',
    };
  }
  return {
    label: 'Auto',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
};

const SectionHeader = ({ title, chip, expanded, onToggle, disabled = false }) => (
  <button
    type="button"
    className={`flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left ${
      disabled ? 'cursor-default' : 'hover:bg-orange-50/60'
    }`}
    onClick={disabled ? undefined : onToggle}
    disabled={disabled}
    aria-expanded={disabled ? undefined : expanded}
  >
    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{title}</span>
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        chip?.className ?? 'border-slate-200 bg-slate-50 text-slate-500'
      }`}
    >
      {chip?.label}
    </span>
    {chip?.warning && (
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-amber-500"
        aria-label="Hay avisos"
      >
        <title>Hay avisos</title>
      </AlertTriangle>
    )}
    {!disabled && (
      <ChevronDown
        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
          expanded ? 'rotate-180' : ''
        }`}
        aria-hidden="true"
      />
    )}
  </button>
);

const FutureSection = ({ title }) => (
  <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70">
    <SectionHeader
      title={title}
      chip={{
        label: 'Próximamente',
        className: 'border-slate-200 bg-white text-slate-400',
      }}
      disabled
    />
  </div>
);

const CalculatorSwitch = ({ checked, disabled, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      if (!disabled) onChange?.(!checked);
    }}
    className={`relative inline-flex h-6 w-11 min-w-11 shrink-0 items-center rounded-full transition ${
      checked ? 'bg-rose-400' : 'bg-slate-300'
    } ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:brightness-105'}`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const CalculatorRow = ({ item, postpartum, onChange }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm font-semibold text-slate-700">{item.label}</span>
        <span className="min-w-0 truncate text-xs text-slate-500">
          {item.value} · {postpartum ? 'Omitido por postparto' : item.status}
        </span>
      </div>
      {postpartum && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Omitido por postparto</p>
      )}
    </div>
    <CalculatorSwitch
      checked={Boolean(item.enabled)}
      disabled={postpartum}
      onChange={(checked) => onChange?.(item.key, checked)}
      label={`${item.label} en la interpretacion`}
    />
  </div>
);

const InterpretationSettingsDialog = ({
  open,
  editing = false,
  editingMode = 'temperatureRise',
  manualActive = false,
  ignoredActive = false,
  automaticSummary = null,
  manualSummary = null,
  ignoredSummary = null,
  draft = null,
  draftEvaluation = null,
  draftSummary = null,
  fertileStartManualActive = false,
  automaticFertileStartSummary = null,
  manualFertileStartSummary = null,
  fertileStartDraft = null,
  fertileStartDraftSummary = null,
  canSave = false,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onResetAuto,
  onIgnoreTemperatureRise,
  canIgnoreTemperatureRise = false,
  onStartFertileStartEdit,
  onCancelFertileStartEdit,
  onSaveFertileStartEdit,
  onResetFertileStartAuto,
  cyclePostpartumMode = false,
  calculatorSummary = 'CPM y T-8 activos',
  calculatorItems = [],
  onCalculatorEnabledChange,
  isRotated = false,
  viewport = null,
  isFullScreen = false,
}) => {
  const [floatingPosition, setFloatingPosition] = useState(null);
  const [floatingMovedByUser, setFloatingMovedByUser] = useState(false);
  const [isDraggingFloatingBar, setIsDraggingFloatingBar] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const dragStateRef = useRef(null);
  const wasOpenRef = useRef(false);

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

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setExpandedKey(null);
    }
    wasOpenRef.current = open;
  }, [open]);

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

    const isFertileStartEditing = editingMode === 'fertileStart';
    const floatingText = isFertileStartEditing
      ? compactFertileStartDraftText(fertileStartDraft, fertileStartDraftSummary)
      : compactDraftText(draft, draftEvaluation, draftSummary);
    const handleCancel = isFertileStartEditing ? onCancelFertileStartEdit : onCancelEdit;
    const handleSave = isFertileStartEditing ? onSaveFertileStartEdit : onSaveEdit;
    const floatingTone = isFertileStartEditing
      ? {
          container: 'border-pink-200',
          grip: 'text-pink-500',
          text: 'text-pink-700',
          save: 'bg-pink-600 hover:bg-pink-700',
        }
      : {
          container: 'border-orange-200',
          grip: 'text-red-400',
          text: 'text-red-700',
          save: 'bg-rose-600 hover:bg-rose-700',
        };

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
          className={`pointer-events-auto mx-auto flex h-10 w-full max-w-lg touch-none select-none items-center gap-1.5 rounded-lg border bg-white/95 px-2 shadow-xl shadow-slate-900/15 backdrop-blur ${floatingTone.container} ${
            isDraggingFloatingBar ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handleFloatingPointerDown}
          onPointerMove={handleFloatingPointerMove}
          onPointerUp={handleFloatingPointerUp}
          onPointerCancel={handleFloatingPointerUp}
        >
          <GripHorizontal className={`h-3.5 w-3.5 shrink-0 ${floatingTone.grip}`} aria-hidden="true" />
          <p className={`min-w-0 flex-1 truncate text-[11px] font-semibold sm:text-xs ${floatingTone.text}`}>
            {floatingText}
          </p>
          <Button
            type="button"
            variant="ghost"
            data-floating-action="true"
            className="h-7 shrink-0 px-2 text-[11px] text-slate-600 sm:px-2.5 sm:text-xs"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-floating-action="true"
            className={`h-7 shrink-0 px-2 text-[11px] text-white disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100 sm:px-2.5 sm:text-xs ${floatingTone.save}`}
            disabled={!canSave}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleSave}
          >
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  const summary = ignoredActive ? ignoredSummary : manualActive ? manualSummary : automaticSummary;
  const summaryWarning = manualActive ? warningLabel(summary) : null;
  const summaryOutOfRule = manualActive && hasNoComplyWarning(summary);
  const fertileStartSummary = fertileStartManualActive
    ? manualFertileStartSummary
    : automaticFertileStartSummary;
  const fertileStartWarning = fertileStartManualActive
    ? fertileStartWarningLabel(fertileStartSummary)
    : null;
  const thermalExpanded = expandedKey === 'thermal';
  const fertileStartExpanded = expandedKey === 'fertileStart';
  const calculationExpanded = expandedKey === 'calculation';
  const thermalChip = getThermalChip({ manualActive, ignoredActive, summary, summaryOutOfRule });
  const fertileStartChip = getFertileStartChip({
    manualActive: fertileStartManualActive,
    summary: fertileStartSummary,
    warning: fertileStartWarning,
  });
  const toggleThermal = () => {
    setExpandedKey((current) => (current === 'thermal' ? null : 'thermal'));
  };
  const toggleFertileStart = () => {
    setExpandedKey((current) => (current === 'fertileStart' ? null : 'fertileStart'));
  };
  const toggleCalculation = () => {
    setExpandedKey((current) => (current === 'calculation' ? null : 'calculation'));
  };

  return (
    <div className="fixed inset-0 z-[350] flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes de interpretación"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-orange-100 bg-white shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-orange-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-titulo">Ajustes de interpretación</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Configura cómo se interpreta este ciclo
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="Cerrar ajustes de interpretación"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-3 sm:px-4 sm:pb-4">
                    <section className="overflow-hidden rounded-xl border border-pink-100 bg-pink-50/30">
            <SectionHeader
              title="Inicio fértil"
              chip={fertileStartChip}
              expanded={fertileStartExpanded}
              onToggle={toggleFertileStart}
            />

            {fertileStartExpanded && (
              <div className="space-y-3 border-t border-pink-100 bg-white/80 px-3 py-3">
                <div className="space-y-2">
                  <SummaryRow label="Fecha" value={formatDate(fertileStartSummary?.isoDate)} />
                  <SummaryRow
                    label="Día"
                    value={
                      Number.isInteger(fertileStartSummary?.cycleDay)
                        ? `D${fertileStartSummary.cycleDay}`
                        : '-'
                    }
                  />
                  <SummaryRow label="Motivo" value={fertileStartSummary?.reasonLabel ?? '-'} />
                  {fertileStartWarning && (
                    <SummaryRow label="Aviso" value={fertileStartWarning} />
                  )}
                </div>

                {fertileStartManualActive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-pink-600 text-white hover:bg-pink-700"
                      onClick={onStartFertileStartEdit}
                    >
                      Modificar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-pink-200 bg-white text-pink-700 hover:bg-pink-50"
                      onClick={onResetFertileStartAuto}
                    >
                      Volver a automático
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="bg-pink-600 text-white hover:bg-pink-700"
                    onClick={onStartFertileStartEdit}
                  >
                    Modificar manualmente
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50/35">
            <SectionHeader
              title="Cálculo"
              chip={{
                label: cyclePostpartumMode ? 'Omitido por postparto' : calculatorSummary,
                className: cyclePostpartumMode
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-amber-200 bg-amber-50 text-amber-700',
              }}
              expanded={calculationExpanded}
              onToggle={toggleCalculation}
            />

            {calculationExpanded && (
              <div className="space-y-3 border-t border-amber-100 bg-white/80 px-3 py-3">
                {cyclePostpartumMode && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">
                    El modo postparto está activo: CPM y T-8 se omiten del cálculo final.
                  </p>
                )}

                <div className="space-y-2">
                  {calculatorItems.map((item) => (
                    <CalculatorRow
                      key={item.key}
                      item={item}
                      postpartum={cyclePostpartumMode}
                      onChange={onCalculatorEnabledChange}
                    />
                  ))}
                </div>

                <Link
                  to="/settings/preferences"
                  className="inline-flex min-h-10 items-center rounded-lg px-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Editar valores en Preferencias
                </Link>
              </div>
            )}
          </section>
          
          <section className="overflow-hidden rounded-xl border border-orange-100 bg-orange-50/35">
            <SectionHeader
              title="Subida térmica"
              chip={thermalChip}
              expanded={thermalExpanded}
              onToggle={toggleThermal}
            />

            {thermalExpanded && (
              <div className="space-y-3 border-t border-orange-100 bg-white/80 px-3 py-3">
                <div className="space-y-2">
                  <SummaryRow label="Línea base" value={formatTemp(summary?.baselineTemp)} />
                  <SummaryRow label="Primer día alto" value={formatDate(summary?.firstHighIsoDate)} />
                  <SummaryRow
                    label="Confirmación"
                    value={summaryOutOfRule ? '-' : formatDate(summary?.confirmationIsoDate)}
                  />
                  <SummaryRow label="Regla" value={ruleLabel(summary?.rule, summary)} />
                  <SummaryRow
                    label="Estado"
                    value={
                      summaryOutOfRule
                        ? 'Manual fuera de regla'
                        : statusLabel(summary?.status, { manual: manualActive })
                    }
                  />
                  {summaryWarning && (
                    <SummaryRow label="Aviso" value={summaryWarning} />
                  )}
                </div>

                {ignoredActive && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    La temperatura no cerrará la fase fértil mientras esté ignorada.
                  </p>
                )}

                {ignoredActive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={onStartEdit}
                    >
                      Modificar manualmente
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      onClick={onResetAuto}
                    >
                      Volver a automático
                    </Button>
                  </div>
                ) : manualActive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={onStartEdit}
                    >
                      Modificar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-orange-200 bg-white text-red-700 hover:bg-orange-50"
                      onClick={onResetAuto}
                    >
                      Volver a automático
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      onClick={onIgnoreTemperatureRise}
                    >
                      No usar subida detectada
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={onStartEdit}
                    >
                      Modificar manualmente
                    </Button>
                    {canIgnoreTemperatureRise && (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        onClick={onIgnoreTemperatureRise}
                      >
                        No usar subida detectada
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};

export default InterpretationSettingsDialog;
