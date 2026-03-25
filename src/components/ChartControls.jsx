import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Eye,
  Layers,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const BTN_BASE =
  'h-9 w-9 p-2 rounded-full border shadow-md backdrop-blur-sm transition-all duration-200';

const MINI_BTN_BASE =
  'h-8 w-8 rounded-full border shadow-md backdrop-blur-sm flex items-center justify-center transition-all duration-200';

const QuickLayersIcon = ({ className = '' }) => (
  <Layers className={className} aria-hidden="true" />
);

const ManualBaselineIcon = ({ className = '' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="3" y1="12" x2="25" y2="12" strokeDasharray="4 4" />
  </svg>
);

const ChartControls = ({
  isFullScreen,
  isLandscapeFullscreen = false,
  showBackToCycleRecords,
  targetCycleId,
  showInterpretation,
  showManualBaseline,
  onToggleInterpretation,
  onToggleManualBaseline,
  onInterpretationPointerUp,
  onToggleFullScreen,
  onToggleSettings,
}) => {
  const [isQuickPanelOpen, setIsQuickPanelOpen] = useState(false);
const [quickIconPulse, setQuickIconPulse] = useState(false);
const quickPanelRef = useRef(null);

  useEffect(() => {
    if (!isQuickPanelOpen) return;

    const handlePointerDown = (event) => {
      if (quickPanelRef.current && !quickPanelRef.current.contains(event.target)) {
        setIsQuickPanelOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsQuickPanelOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isQuickPanelOpen]);
const isFullscreenHud = isFullScreen;
const iconRotationClass = isFullscreenHud ? 'rotate-90' : '';

  const topGroupPos = isFullScreen
  ? 'fixed top-[calc(env(safe-area-inset-top)+8px)] right-[calc(env(safe-area-inset-right)+8px)]'
  : 'absolute top-3 left-3';

const bottomGroupPos = isFullScreen
  ? 'fixed right-[calc(env(safe-area-inset-right)+8px)] bottom-[calc(env(safe-area-inset-bottom)+8px)]'
  : 'absolute top-3 right-3';

const isRightAlignedTopGroup = isFullScreen;
const topGroupDirection = isFullscreenHud
  ? 'flex-row'
  : 'flex-col';

const bottomGroupDirection = isFullscreenHud
  ? 'flex-row-reverse'
  : 'flex-col';

const topGroupLayout = isLandscapeFullscreen ? 'gap-1.5' : 'gap-2';
const bottomGroupLayout = isLandscapeFullscreen ? 'gap-1.5' : 'gap-2';

  const quickAccessButtonClass = (() => {
    if (showInterpretation && showManualBaseline) {
      return 'bg-white/85 text-fuchsia-600 border-fuchsia-300 shadow-lg shadow-fuchsia-200/50';
    }

    if (showInterpretation) {
      return 'bg-white/85 text-fertiliapp-fuerte border-fertiliapp-fuerte shadow-lg shadow-fertiliapp-fuerte/20';
    }

    if (showManualBaseline) {
      return 'bg-white/85 text-violet-600 border-violet-400 shadow-lg shadow-violet-300/20';
    }

    return 'bg-white/20 text-slate-600 border-white/70';
  })();

  const handleToggleQuickPanel = () => {
  setQuickIconPulse(false);

  requestAnimationFrame(() => {
    setQuickIconPulse(true);
  });

  setIsQuickPanelOpen((prev) => !prev);
};

  const handleToggleSettings = () => {
    setIsQuickPanelOpen(false);
    onToggleSettings();
  };

  const handleToggleFullScreen = () => {
    setIsQuickPanelOpen(false);
    onToggleFullScreen();
  };

  const handleQuickInterpretation = () => {
    onToggleInterpretation();
    setIsQuickPanelOpen(false);
  };

  const handleQuickBaseline = () => {
    onToggleManualBaseline();
    setIsQuickPanelOpen(false);
  };

  return (
    <>
      <div
        className={`chart-controls z-[200] ${topGroupPos}`}
        data-chart-interactive="true"
      >
      <div
  className={`flex ${topGroupDirection} ${topGroupLayout} ${
    isRightAlignedTopGroup ? 'items-center justify-end' : 'items-start'
  }`}
>
          {showBackToCycleRecords && targetCycleId && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className={`${BTN_BASE} bg-white/20 text-fertiliapp border border-fertiliapp shadow-lg shadow-fertiliapp/20`}
              aria-label="Volver al ciclo"
            >
              <Link to={`/cycle/${targetCycleId}`}>
                <ArrowLeft className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
              </Link>
            </Button>
          )}

          <div ref={quickPanelRef} className="relative">
            <motion.button
              type="button"
              onClick={handleToggleQuickPanel}
              aria-label="Opciones rápidas de visualización"
              aria-expanded={isQuickPanelOpen}
              aria-haspopup="menu"
              className={`${BTN_BASE} ${quickAccessButtonClass} flex items-center justify-center`}
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: 1.04 }}
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' }}
            >
              <motion.span
  animate={quickIconPulse ? { rotate: [0, 90, 0] } : { rotate: 0 }}
  transition={{ duration: 0.35, ease: 'easeInOut' }}
>
  <QuickLayersIcon className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
</motion.span>
            </motion.button>

            <AnimatePresence initial={false}>
              {isQuickPanelOpen && (
            <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.12, ease: 'linear' }}
  className={
  isFullscreenHud
    ? 'absolute right-[calc(100%+8px)] top-0 flex flex-row-reverse gap-2 items-center'
    : `absolute top-[calc(100%+8px)] flex flex-col gap-2 ${
        isRightAlignedTopGroup ? 'right-0 items-end' : 'left-0 items-start'
      }`
}
>
                  <motion.button
  type="button"
  onClick={handleQuickInterpretation}
  onPointerUp={onInterpretationPointerUp}
  aria-label="Mostrar u ocultar interpretación"
  aria-pressed={showInterpretation}
  className={`${MINI_BTN_BASE} ${
    showInterpretation
      ? 'bg-fertiliapp-fuerte text-white border-fertiliapp-fuerte shadow-fertiliapp-fuerte/30'
      : 'bg-white/80 text-fertiliapp-fuerte border-fertiliapp-fuerte/60'
  }`}
  whileTap={{ scale: 0.92 }}
  whileHover={{ scale: 1.04 }}
  initial={{ opacity: 0, y: -6 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
  style={{ filter: 'drop-shadow(0 4px 10px rgba(221, 86, 101, 0.18))' }}
>
                    <Eye className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
                  </motion.button>

                  <motion.button
  type="button"
  onClick={handleQuickBaseline}
  aria-label="Mostrar u ocultar línea base"
  aria-pressed={showManualBaseline}
  className={`${MINI_BTN_BASE} ${
    showManualBaseline
      ? 'bg-violet-500 text-white border-violet-500 shadow-violet-400/30'
      : 'bg-white/80 text-violet-600 border-violet-300'
  }`}
  whileTap={{ scale: 0.92 }}
  whileHover={{ scale: 1.04 }}
  initial={{ opacity: 0, y: -6 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
  style={{ filter: 'drop-shadow(0 4px 10px rgba(139, 92, 246, 0.16))' }}
>
                    <ManualBaselineIcon className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        className={`chart-controls z-[200] ${bottomGroupPos}`}
        data-chart-interactive="true"
      >
        <div className={`flex ${bottomGroupDirection} ${bottomGroupLayout} items-center justify-end`}>
  <Button
    type="button"
    onClick={handleToggleFullScreen}
    variant="ghost"
    size="icon"
    className={`${BTN_BASE} ${
      isLandscapeFullscreen
        ? 'bg-white/70 text-slate-700 border-white/80'
        : 'bg-white/20 text-slate-600 border-white/70'
    }`}
    aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
  >
    <RotateCcw className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
  </Button>

  <Button
    type="button"
    onClick={handleToggleSettings}
    variant="ghost"
    size="icon"
    className={`${BTN_BASE} ${
      isFullScreen
        ? 'bg-white/70 text-secundario border border-secundario shadow-lg shadow-secundario/20'
        : 'bg-white/20 text-secundario border border-secundario shadow-lg shadow-secundario/20'
    }`}
    aria-label="Ajustes"
  >
    <SlidersHorizontal className={`h-4 w-4 transition-transform ${iconRotationClass}`} />
  </Button>
</div>
      </div>
    </>
  );
};

export default ChartControls;