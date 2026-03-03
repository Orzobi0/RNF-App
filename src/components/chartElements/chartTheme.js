export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const ROOT_CSS_VARS = {
  sensation: '--color-sensacion-fuerte',
  appearance: '--color-apariencia-fuerte',
  observation: '--color-observaciones-fuerte',
};

export const THEME = {
  bgGradient: [
    { offset: '0%', color: '#fffbfc' },
    { offset: '50%', color: '#fff5f7' },
    { offset: '100%', color: '#fff1f3' },
  ],
  dataZoneGradient: [
    { offset: '0%', color: '#fff7fb' },
    { offset: '50%', color: '#ffe4f0' },
    { offset: '100%', color: '#fff7fb' },
  ],
  tempLineGradient: [
    { offset: '0%', color: '#f472b6' },
    { offset: '30%', color: '#ec4899' },
    { offset: '70%', color: '#db2777' },
    { offset: '100%', color: '#be185d' },
  ],
  tempLineGlowGradient: [
    { offset: '0%', color: '#f9a8d4' },
    { offset: '100%', color: '#ec4899' },
  ],
  tempPointRadialGradient: [
    { offset: '0%', color: '#FDF2F8' },
    { offset: '50%', color: '#F9A8D4' },
    { offset: '85%', color: '#EC4899' },
    { offset: '100%', color: '#DB2777' },
  ],
  tempPointIgnoredGradient: [
    { offset: '0%', color: '#FFFFFF' },
    { offset: '80%', color: '#F8FAFC' },
    { offset: '100%', color: '#E2E8F0' },
  ],
  ovulationPointGradient: [
    { offset: '0%', color: '#dbeafe' },
    { offset: '50%', color: '#93c5fd' },
    { offset: '85%', color: '#3b82f6' },
    { offset: '100%', color: '#2563eb' },
  ],
  grid: {
    major: '#f9a8d4',
    minor: '#fce7f3',
    vertical: '#fce7f3',
  },
  text: {
    axisMajor: '#be185d',
    axisMinor: '#db2777',
    dateDay: '#60666f',
    neutral: '#374151',
  },
  card: {
    fill: '#ffffff',
    border: 'rgba(244, 114, 182, 0.20)',
    shadowRGBA: 'rgba(244, 114, 182, 0.10)',
  },
  baseline: {
    strokeDefault: '#F59E0B',
    dashDefault: '6 4',
    opacityDefault: 1,
  },
  highlight: {
    strokeTop: 'rgba(235, 171, 204,0.15)',
    strokeBottom: 'rgba(235, 171, 204,0.32)',
    alphaTop: 0.15,
    alphaBottom: 0.32,
  },
  rowColors: {
    sensation: { cssVar: ROOT_CSS_VARS.sensation, fallback: '#0ea5e9' },
    appearance: { cssVar: ROOT_CSS_VARS.appearance, fallback: '#10b981' },
    observation: { cssVar: ROOT_CSS_VARS.observation, fallback: '#8b5cf6' },
    relations: { fallback: '#f44336' },
  },
  symbol: {
    peakEmoji: '#ec4899',
    postPeak: '#7f1d1d',
    borderFallback: 'rgba(244, 114, 182, 0.35)',
  },
  misc: {
    correctionLine: 'rgba(148, 163, 184, 0.35)',
    correctionPointFill: 'rgba(226, 232, 240, 0.6)',
    correctionPointStroke: 'rgba(148, 163, 184, 0.5)',
    today: '#be185d',
    baselineNumber: '#2563eb',
    highSequenceNumber: '#be185d',
    textShadowWhite: 'rgba(255, 255, 255, 0.9)',
  },
};

export const resolveCssVar = (varName, fallback) => {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value?.trim() || fallback;
};

export const getCanvasTheme = () => ({
  ...THEME,
  rowColors: {
    sensation: resolveCssVar(THEME.rowColors.sensation.cssVar, THEME.rowColors.sensation.fallback),
    appearance: resolveCssVar(THEME.rowColors.appearance.cssVar, THEME.rowColors.appearance.fallback),
    observation: resolveCssVar(THEME.rowColors.observation.cssVar, THEME.rowColors.observation.fallback),
    relations: THEME.rowColors.relations.fallback,
  },
});
