import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const formatTemp = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} C` : '—');

const formatDate = (isoDate) => {
  if (!isoDate) return '—';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
};

const ruleLabel = (rule) => {
  switch (rule) {
    case '3-high':
      return '3 dias altos';
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
      return rule || '—';
  }
};

const statusLabel = (status) => {
  switch (status) {
    case 'confirmed':
      return 'Confirmada manualmente';
    case 'invalid':
      return 'Pendiente: la secuencia no confirma';
    case 'insufficient':
      return 'Pendiente: faltan temperaturas posteriores';
    case 'pending':
      return 'Pendiente: faltan temperaturas posteriores';
    default:
      return 'Pendiente';
  }
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
  canSave = false,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onResetAuto,
  isRotated = false,
  viewport = null,
}) => {
  if (!open) return null;

  if (editing) {
    const rotatedWidth = Math.max(
      280,
      Math.min(Number(viewport?.h) > 0 ? Number(viewport.h) - 32 : 640, 672)
    );
    const editingShellClass = isRotated
      ? 'pointer-events-none fixed z-[450] p-0'
      : 'fixed inset-x-0 bottom-0 z-[450] px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]';
    const editingShellStyle = isRotated
      ? {
          left: 'calc(env(safe-area-inset-left) + 24px)',
          top: '50%',
          width: `${rotatedWidth}px`,
          transform: 'translate(-50%, -50%) rotate(90deg)',
          transformOrigin: 'center center',
        }
      : undefined;

    return (
      <div className={editingShellClass} style={editingShellStyle}>
        <div className="pointer-events-auto mx-auto flex h-12 w-full max-w-2xl items-center gap-2 rounded-xl border border-violet-200 bg-white/95 px-2.5 shadow-xl shadow-slate-900/15 backdrop-blur">
          <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-violet-700 sm:text-sm">
            Ajustando subida termica · Linea base {formatTemp(draft?.baselineTemp)} · Primer dia alto {formatDate(draft?.firstHighIsoDate)}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-xs text-slate-600 sm:px-3 sm:text-sm"
            onClick={onCancelEdit}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-8 shrink-0 bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 sm:px-3 sm:text-sm"
            disabled={!canSave}
            onClick={onSaveEdit}
          >
            Aceptar
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
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-rose-100 bg-white shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-rose-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-titulo">Ajustes de interpretacion</h2>
            <p className="text-xs text-slate-500">
              Subida termica: {manualActive ? 'Manual' : 'Automatica'}
            </p>
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
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <p className="text-sm font-semibold text-violet-800">
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
                <Button type="button" className="bg-violet-600 text-white hover:bg-violet-700" onClick={onStartEdit}>
                  Modificar
                </Button>
                <Button type="button" variant="outline" onClick={onResetAuto}>
                  Volver a automatico
                </Button>
              </div>
            ) : (
              <Button type="button" className="bg-violet-600 text-white hover:bg-violet-700" onClick={onStartEdit}>
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
