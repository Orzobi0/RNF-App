export const FERTILITY_SYMBOLS = {
  NONE: { value: 'none', label: 'Sin Símbolo', color: 'bg-gray-200', textColor: '#e2e8f0' },
  MENSTRUATION: { value: 'red', label: 'Menstruación', color: 'bg-red-500', textColor: '#e2e8f0' },
  FERTILE: { value: 'white', label: 'Moco (Fértil)', color: 'bg-white', textColor: '#e2e8f0' },
  INFERTILE: { value: 'green', label: 'Seco', color: 'bg-green-500', textColor: '#e2e8f0' },
  NON_FERTILE_MUCUS: { value: 'yellow', label: 'Moco (No fértil)', color: 'bg-yellow-400', textColor: '#1f2937' },
  SPOTTING: { value: 'spot', label: 'Spotting', color: 'bg-red-500', textColor: '#e2e8f0', pattern: 'spotting-pattern' },
};

export const FERTILITY_SYMBOL_OPTIONS = Object.values(FERTILITY_SYMBOLS);

export const getSymbolAppearance = (symbolValue) => {
  const found = FERTILITY_SYMBOL_OPTIONS.find((opt) => opt.value === symbolValue);
  return found || FERTILITY_SYMBOLS.NONE;
};

export const getSymbolColorPalette = (symbolValue) => {
  switch (symbolValue) {
    case 'red':
      return {
        main: '#fb7185',
        light: '#fecdd3',
        glow: 'rgba(251,113,133,0.35)',
        border: 'none'
      };
    case 'white':
      return {
        main: '#fdf5f8',
        light: '#ffe4f0',
        glow: 'rgba(251,113,133,0.22)',
        border: 'rgba(251,113,133,0.22)'
      };
    case 'green':
      return {
        main: '#22c55e',
        light: '#bbf7d0',
        glow: 'rgba(22,163,74,0.32)',
        border: 'rgba(22,163,74,0.32)'
      };
    case 'yellow':
      return {
        main: '#f1c232',
        light: '#facc15',
        glow: 'rgba(234,179,8,0.32)',
        border: 'rgba(234,179,8,0.32)'
      };
    case 'spot':
      return {
        main: '#fb7185',
        light: '#fecdd3',
        glow: 'rgba(248,113,113,0.45)',
        border: '#fee2e2',
        pattern: 'spotting-pattern'
      };
    default:
      return {
        main: '#d1d5db',
        light: '#d1d5db',
        glow: 'rgba(209,213,219,0.35)',
        border: '#d1d5db'
      };
  }
};

export const getFertilitySymbolTheme = (symbolValue) => {
  switch (symbolValue) {
    case 'red':
      return {
        icon: 'text-rose-500',
        panelBorder: 'border-rose-200/70',
        panelBackground: 'from-rose-50 to-rose-100',
        triggerBorder: 'border-rose-200',
        triggerHover: 'hover:bg-rose-50',
        triggerActive: 'data-[state=open]:bg-rose-50',
        triggerFocus:
          'focus:ring-rose-200 focus:border-rose-400 !focus:shadow-[0_0_0_3px_rgba(244,63,94,0.20)]',
        contentBorder: 'border-rose-200',
      };
    case 'green':
      return {
        icon: 'text-emerald-500',
        panelBorder: 'border-emerald-200/70',
        panelBackground: 'from-emerald-50 to-emerald-100',
        triggerBorder: 'border-emerald-200',
        triggerHover: 'hover:bg-emerald-50',
        triggerActive: 'data-[state=open]:bg-emerald-50',
        triggerFocus:
          'focus:ring-emerald-200 focus:border-emerald-400 !focus:shadow-[0_0_0_3px_rgba(16,185,129,0.20)]',
        contentBorder: 'border-emerald-200',
      };
    case 'yellow':
      return {
        icon: 'text-amber-500',
        panelBorder: 'border-amber-200/70',
        panelBackground: 'from-amber-50 to-yellow-100',
        triggerBorder: 'border-amber-200',
        triggerHover: 'hover:bg-amber-50',
        triggerActive: 'data-[state=open]:bg-amber-50',
        triggerFocus:
          'focus:ring-amber-200 focus:border-amber-400 !focus:shadow-[0_0_0_3px_rgba(245,158,11,0.22)]',
        contentBorder: 'border-amber-200',
      };
    case 'spot':
      return {
        icon: 'text-rose-500',
        panelBorder: 'border-rose-200/70',
        panelBackground: 'from-rose-50 to-rose-100',
        triggerBorder: 'border-rose-200',
        triggerHover: 'hover:bg-rose-50',
        triggerActive: 'data-[state=open]:bg-rose-50',
        triggerFocus:
          'focus:ring-rose-200 focus:border-rose-400 !focus:shadow-[0_0_0_3px_rgba(244,63,94,0.20)]',
        contentBorder: 'border-rose-200',
      };
    case 'white':
      return {
        icon: 'text-slate-500',
        panelBorder: 'border-slate-200/80',
        panelBackground: 'from-slate-50 to-slate-100',
        triggerBorder: 'border-slate-200',
        triggerHover: 'hover:bg-slate-50',
        triggerActive: 'data-[state=open]:bg-slate-50',
        triggerFocus:
          'focus:ring-slate-200 focus:border-slate-300 !focus:shadow-[0_0_0_3px_rgba(148,163,184,0.20)]',
        contentBorder: 'border-slate-200',
      };
    default:
      return {
        icon: 'text-slate-500',
        panelBorder: 'border-slate-300/60',
        panelBackground: 'from-stone-100 to-slate-100',
        triggerBorder: 'border-slate-200',
        triggerHover: 'hover:bg-white',
        triggerActive: 'data-[state=open]:bg-slate-50',
        triggerFocus:
          'focus:ring-slate-200 focus:border-slate-300 !focus:shadow-[0_0_0_3px_rgba(148,163,184,0.18)]',
        contentBorder: 'border-slate-200',
      };
  }
};
export const getFertilitySymbolDockStyles = (symbolValue) => {
  switch (symbolValue) {
    case 'red':
      return {
        activeBorder: 'border-rose-300',
        activeBg: 'bg-rose-50',
        activeText: 'text-rose-600',
        filledText: 'text-rose-500',
        idleText: 'text-rose-400',
        focusRing: 'focus-visible:ring-rose-200',
      };
    case 'green':
      return {
        activeBorder: 'border-emerald-300',
        activeBg: 'bg-emerald-50',
        activeText: 'text-emerald-600',
        filledText: 'text-emerald-500',
        idleText: 'text-emerald-400',
        focusRing: 'focus-visible:ring-emerald-200',
      };
    case 'yellow':
      return {
        activeBorder: 'border-amber-300',
        activeBg: 'bg-amber-50',
        activeText: 'text-amber-600',
        filledText: 'text-amber-500',
        idleText: 'text-amber-500',
        focusRing: 'focus-visible:ring-amber-200',
      };
    case 'spot':
      return {
        activeBorder: 'border-rose-300',
        activeBg: 'bg-rose-50',
        activeText: 'text-rose-600',
        filledText: 'text-rose-500',
        idleText: 'text-rose-400',
        focusRing: 'focus-visible:ring-rose-200',
      };
    case 'white':
      return {
        activeBorder: 'border-slate-300',
        activeBg: 'bg-white',
        activeText: 'text-slate-600',
        filledText: 'text-slate-500',
        idleText: 'text-slate-500',
        focusRing: 'focus-visible:ring-slate-200',
      };
    default:
      return {
        activeBorder: 'border-slate-300',
        activeBg: 'bg-slate-100',
        activeText: 'text-slate-600',
        filledText: 'text-slate-600',
        idleText: 'text-slate-500',
        focusRing: 'focus-visible:ring-slate-200',
      };
  }
};