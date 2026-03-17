export const chartTheme = {
  background: {
    chartArea: '#fff7fb',
    rowsArea: '#fff7fb',
  },
  grid: {
    horizontalMajor: 'rgba(249,168,212,0.7)',
    horizontalMinor: 'rgba(252,231,243,0.9)',
    vertical: 'rgba(252,231,243,0.85)',
    labelMajor: '#be185d',
    labelMinor: '#db2777',
  },
  interpretation: {
    fertile: 'rgba(236,72,153,0.22)',
    relativeInfertile: 'rgba(16,185,129,0.2)',
    postOvulatoryAbsolute: 'rgba(37,99,235,0.24)',
    postOvulatory: 'rgba(14,165,233,0.24)',
    default: 'rgba(148,163,184,0.2)',
  },
  baseline: {
    defaultStroke: '#F59E0B',
  },
  temperature: {
    line: '#E91E63',
    lineWidth: 2.8,
    halo: 'rgba(233,30,99,0.12)',
    haloWidth: 4,
    gapStroke: 'rgba(213,135,177,0.9)',
    gapDash: [6, 5],
    gapWidth: 2,
  },
  points: {
    fill: '#F472B6',
    stroke: '#E91E63',
    // Ignorados: más claritos (menos protagonistas)
 ignoredFill: '#F1F5F9',     // slate-100
 ignoredStroke: '#CBD5E1',   // slate-300

 // Punto "raw" descartado por corrección: más oscuro (se nota)
 discardedFill: '#CBD5E1',   // era tu ignoredFill antiguo (más marcado)
 discardedStroke: '#94A3B8', // era tu ignoredStroke antiguo
    correctionLine: 'rgba(148,163,184,0.35)',
    correctionPointFill: 'rgba(226,232,240,0.6)',
  },
  highlight: {
    activeColumn: 'rgba(235,171,204,0.15)',
    risePath: '#cc0e93',
  },
  svg: {
    temperatureGradient: ['#F472B6', '#EC4899', '#E91E63'],
    areaGradientTop: 'rgba(244, 114, 182, 0.18)',
    areaGradientBottom: 'rgba(244, 114, 182, 0.02)',
  },
};

export const getCanvasTheme = () => chartTheme;
export const getChartTheme = () => chartTheme;
