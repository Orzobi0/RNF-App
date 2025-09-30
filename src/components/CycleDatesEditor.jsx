import React from 'react';
import { Button } from '@/components/ui/button';
import OverlapWarningDialog from '@/components/OverlapWarningDialog';

const CycleDatesEditor = ({
  cycle,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSave,
  onCancel,
  isProcessing = false,
  dateError = '',
  includeEndDate = true,
  showOverlapDialog = false,
  overlapCycle = null,
  onConfirmOverlap,
  onCancelOverlap,
  title = 'Editar fechas del ciclo',
  description = 'Actualiza las fechas de inicio y fin del ciclo. Guarda los cambios cuando termines.',
  saveLabel = 'Guardar',
  cancelLabel = 'Cancelar',
  onClearError,
  className = 'mb-6 mx-auto w-full max-w-xl',
}) => {
  const currentRangeLabel = cycle?.startDate
    ? `Fecha actual: ${cycle.startDate}${includeEndDate ? ` — ${cycle.endDate || 'En curso'}` : ''}`
    : null;
  const handleStartChange = (event) => {
    if (onClearError) {
      onClearError();
    }
    onStartDateChange?.(event.target.value);
  };

  const handleEndChange = (event) => {
    if (onClearError) {
      onClearError();
    }
    onEndDateChange?.(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.();
  };

  return (
    <>
      <div className={`${className} rounded-2xl border border-rose-100 bg-white/90 p-5 shadow-lg`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-rose-700 mb-1">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
            {currentRangeLabel && (
              <p className="text-xs text-slate-500 mt-1">{currentRangeLabel}</p>
            )}
            <div className={`grid ${includeEndDate ? 'grid-cols-1 sm:grid-cols-2 gap-4' : 'grid-cols-1 gap-4'}`}>
              <label className="flex flex-col text-sm text-slate-700">
                Inicio del ciclo
                <input
                  type="date"
                  value={startDate || ''}
                  onChange={handleStartChange}
                  className="mt-1 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </label>
              {includeEndDate && (
                <label className="flex flex-col text-sm text-slate-700">
                  Fin del ciclo
                  <input
                    type="date"
                    value={endDate || ''}
                    onChange={handleEndChange}
                    className="mt-1 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  />
                </label>
              )}
            </div>
            {dateError && <p className="mt-2 text-sm text-red-500">{dateError}</p>}
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="border-rose-200 text-rose-600 hover:bg-rose-50"
                disabled={isProcessing}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow hover:from-pink-600 hover:to-rose-600"
                disabled={isProcessing}
              >
                {saveLabel}
              </Button>
            </div>
          </div>
        </form>
      </div>
      <OverlapWarningDialog
        isOpen={showOverlapDialog}
        conflictCycle={overlapCycle}
        onCancel={onCancelOverlap}
        onConfirm={onConfirmOverlap}
      />
    </>
  );
};

export default CycleDatesEditor;