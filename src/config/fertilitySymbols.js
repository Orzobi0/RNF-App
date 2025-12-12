export const FERTILITY_SYMBOLS = {
  NONE: { value: 'none', label: 'Sin Símbolo', color: 'bg-slate-200', textColor: '#64748b' },
  MENSTRUATION: { value: 'red', label: 'Menstruación', color: 'bg-[#fb7185]', textColor: '#ffffff' },
  FERTILE: { value: 'white', label: 'Moco (Fértil)', color: 'bg-[#fdf5f8] border-2 border-[rgba(251,113,133,0.6)]', textColor: '#4B2E3B' },
  INFERTILE: { value: 'green', label: 'Seco', color: 'bg-verde-fertil', textColor: '#ffffff' },
  NON_FERTILE_MUCUS: { value: 'yellow', label: 'Moco (No fértil)', color: 'bg-amarillo-moco', textColor: '#3A2430' },
  SPOTTING: { value: 'spot', label: 'Spotting', color: 'spotting-pattern-icon', textColor: '#ffffff', pattern: 'spotting-pattern' },
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
        light: '#ffffff',
        glow: 'rgba(255,255,255,0.4)',
        border: 'rgba(251,113,133,0.6)'
      };
    case 'green':
      return {
        main: '#67C5A4',
        light: '#E7F6F0',
        glow: 'rgba(103,197,164,0.35)',
        border: 'rgba(103,197,164,0.55)'
      };
    case 'yellow':
      return {
        main: '#F7B944',
        light: '#FFF6E8',
        glow: 'rgba(247,185,68,0.32)',
        border: 'rgba(247,185,68,0.55)'
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
    case 'spot':
      return {
        icon: 'text-[color:rgba(251,113,133,1)]',
        panelBorder: 'border-[color:rgba(251,113,133,0.25)]',
        panelBackground: 'from-[rgba(254,205,211,0.35)] to-[rgba(254,205,211,0.60)]',
        triggerBorder: 'border-[color:rgba(251,113,133,0.28)]',
        triggerHover: 'hover:bg-[rgba(254,205,211,0.35)]',
        triggerActive: 'data-[state=open]:bg-[rgba(254,205,211,0.35)]',
        triggerFocus:
          'focus:ring-[rgba(251,113,133,0.20)] focus:border-[color:rgba(251,113,133,0.55)] !focus:shadow-[0_0_0_3px_rgba(251,113,133,0.18)]',
        contentBorder: 'border-[color:rgba(251,113,133,0.22)]',
      };

    case 'green':
      return {
        icon: 'text-[color:rgba(103,197,164,1)]',
        panelBorder: 'border-[color:rgba(103,197,164,0.30)]',
        panelBackground: 'from-[rgba(231,246,240,0.70)] to-[rgba(231,246,240,1)]',
        triggerBorder: 'border-[color:rgba(103,197,164,0.40)]',
        triggerHover: 'hover:bg-[rgba(231,246,240,0.85)]',
        triggerActive: 'data-[state=open]:bg-[rgba(231,246,240,0.85)]',
        triggerFocus:
          'focus:ring-[rgba(103,197,164,0.22)] focus:border-[color:rgba(103,197,164,0.60)] !focus:shadow-[0_0_0_3px_rgba(103,197,164,0.18)]',
        contentBorder: 'border-[color:rgba(103,197,164,0.30)]',
      };

    case 'yellow':
      return {
        icon: 'text-[color:rgba(247,185,68,1)]',
        panelBorder: 'border-[color:rgba(247,185,68,0.30)]',
        panelBackground: 'from-[rgba(255,246,232,0.75)] to-[rgba(255,246,232,1)]',
        triggerBorder: 'border-[color:rgba(247,185,68,0.42)]',
        triggerHover: 'hover:bg-[rgba(255,246,232,0.92)]',
        triggerActive: 'data-[state=open]:bg-[rgba(255,246,232,0.92)]',
        triggerFocus:
          'focus:ring-[rgba(247,185,68,0.22)] focus:border-[color:rgba(247,185,68,0.62)] !focus:shadow-[0_0_0_3px_rgba(247,185,68,0.18)]',
        contentBorder: 'border-[color:rgba(247,185,68,0.30)]',
      };

    case 'white':
      return {
        icon: 'text-[color:var(--color-texto-subtitulo)]',
        panelBorder: 'border-[color:rgba(251,113,133,0.22)]',
        panelBackground: 'from-[rgba(255,255,255,1)] to-[rgba(253,245,248,1)]',
        triggerBorder: 'border-[color:rgba(251,113,133,0.22)]',
        triggerHover: 'hover:bg-[rgba(253,245,248,0.85)]',
        triggerActive: 'data-[state=open]:bg-[rgba(253,245,248,0.85)]',
        triggerFocus:
          'focus:ring-[rgba(251,113,133,0.16)] focus:border-[color:rgba(251,113,133,0.45)] !focus:shadow-[0_0_0_3px_rgba(251,113,133,0.14)]',
        contentBorder: 'border-[color:rgba(251,113,133,0.18)]',
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
    case 'spot':
      return {
        activeBorder: 'border-[color:rgba(251,113,133,0.45)]',
        activeBg: 'bg-[rgba(254,205,211,0.35)]',
        activeText: 'text-[color:rgba(251,113,133,1)]',
        filledText: 'text-[color:rgba(251,113,133,1)]',
        idleText: 'text-[color:rgba(251,113,133,0.75)]',
        focusRing: 'focus-visible:ring-[rgba(251,113,133,0.20)]',
      };

    case 'green':
      return {
        activeBorder: 'border-[color:rgba(103,197,164,0.55)]',
        activeBg: 'bg-[rgba(231,246,240,0.92)]',
        activeText: 'text-[color:var(--color-apariencia-fuerte)]',
        filledText: 'text-[color:rgba(103,197,164,1)]',
        idleText: 'text-[color:rgba(103,197,164,0.80)]',
        focusRing: 'focus-visible:ring-[rgba(103,197,164,0.20)]',
      };

    case 'yellow':
      return {
        activeBorder: 'border-[color:rgba(247,185,68,0.60)]',
        activeBg: 'bg-[rgba(255,246,232,0.95)]',
        activeText: 'text-[color:var(--color-alerta-2)]',
        filledText: 'text-[color:rgba(247,185,68,1)]',
        idleText: 'text-[color:rgba(247,185,68,0.85)]',
        focusRing: 'focus-visible:ring-[rgba(247,185,68,0.20)]',
      };

    case 'white':
      return {
        activeBorder: 'border-[color:rgba(251,113,133,0.35)]',
        activeBg: 'bg-[rgba(253,245,248,0.90)]',
        activeText: 'text-[color:var(--color-texto-titulo)]',
        filledText: 'text-[color:var(--color-texto-subtitulo)]',
        idleText: 'text-[color:var(--color-texto-subtitulo)]',
        focusRing: 'focus-visible:ring-[rgba(251,113,133,0.16)]',
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
