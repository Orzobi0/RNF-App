import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, RotateCcw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BTN_BASE =
  'h-9 w-9 p-2 rounded-full border shadow-md backdrop-blur-sm';

const getSlots = (mode) => {
  // Grid 2x2
  // normal (arriba dcha): [interpret, rotate; empty, settings]
  if (mode === 'normal') return ['interpretation', 'rotate', 'empty', 'settings'];

  // fullscreen (abajo dcha): [empty, interpret; settings, rotate]
  return ['empty', 'interpretation', 'settings', 'rotate'];
};

const ChartControls = ({
  isFullScreen,
  showBackToCycleRecords,
  targetCycleId,
  showInterpretation,
  onToggleInterpretation,
  onInterpretationPointerUp,
  onToggleFullScreen,
  onToggleSettings,
}) => {
  const mode = isFullScreen ? 'fullscreen' : 'normal';
  const iconRotationClass = isFullScreen ? 'rotate-90' : '';

  const backPos = isFullScreen
    ? 'fixed top-[calc(env(safe-area-inset-top)+8px)] right-[calc(env(safe-area-inset-right)+8px)]'
    : 'absolute top-3 left-3';

  const actionsPos = isFullScreen
    ? 'fixed right-[calc(env(safe-area-inset-right)+8px)] bottom-[calc(env(safe-area-inset-bottom)+8px)]'
    : 'absolute top-3 right-3';

  const slots = getSlots(mode);

  const controls = {
    interpretation: (
      <Button
        key="interpretation"
        type="button"
        onClick={onToggleInterpretation}
        onPointerUp={onInterpretationPointerUp}
        variant="ghost"
        size="icon"
        className={`${BTN_BASE} transition-colors ${
          showInterpretation
            ? 'bg-fertiliapp-fuerte text-white shadow-lg shadow-fertiliapp-fuerte/50 border-fertiliapp-fuerte'
            : 'bg-white/20 text-fertiliapp-fuerte border-fertiliapp-fuerte'
        }`}
        aria-label={showInterpretation ? 'Ocultar interpretación' : 'Mostrar interpretación'}
      >
        {showInterpretation ? (
          <EyeOff className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
        ) : (
          <Eye className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
        )}
      </Button>
    ),
    rotate: (
      <Button
        key="rotate"
        type="button"
        onClick={onToggleFullScreen}
        variant="ghost"
        size="icon"
        className={`${BTN_BASE} bg-white/20 text-slate-600`}
        aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
      >
        <RotateCcw className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
      </Button>
    ),
    settings: (
      <Button
        key="settings"
        type="button"
        onClick={onToggleSettings}
        variant="ghost"
        size="icon"
        className={`${BTN_BASE} bg-white/20 text-secundario border border-secundario shadow-lg shadow-secundario`}
        aria-label="Ajustes"
      >
        <Settings className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
      </Button>
    ),
  };

  return (
    <>
      {showBackToCycleRecords && targetCycleId && (
        <div className={`chart-controls z-[200] ${backPos}`} data-chart-interactive="true">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className={`${BTN_BASE} bg-white/20 text-fertiliapp border border-fertiliapp shadow-lg shadow-fertiliapp`}
            aria-label="Volver al ciclo"
          >
            <Link to={`/cycle/${targetCycleId}`}>
              <ArrowLeft className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
            </Link>
          </Button>
        </div>
      )}

      <div className={`chart-controls z-[200] ${actionsPos}`} data-chart-interactive="true">
        <div className="grid grid-cols-2 gap-2">
          {slots.map((slot, i) =>
            slot === 'empty' ? <div key={`empty-${i}`} className="h-9 w-9" /> : controls[slot]
          )}
        </div>
      </div>
    </>
  );
};

export default ChartControls;