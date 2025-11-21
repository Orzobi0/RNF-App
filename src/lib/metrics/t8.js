// src/lib/metrics/t8.js

/**
 * Igual que el t8Metric actual en DashboardPage, pero movido aquí.
 * Mantén la misma estructura:
 *  - title, baseText, finalText, microCopy, microCopyMuted,
 *    modeLabel, microCopyId, baseValue, finalValue,
 *    baseFormatted, finalFormatted, isManual
 *
 * Reglas:
 *  - T-8 = día de subida − 8
 *  - Para manual: usa los valores manuales si selección = 'manual' e `isManualT8` true
 *  - Para auto: usa `computedT8Data` si selección = 'auto'
 *  - Para 'none': todo a null y “Sin datos disponibles”
 *  - `modeLabel`:
 *      - 'Manual' / 'Auto' / 'Sin usar'
 *  - `baseText` = `Día de subida: ${baseFormatted ?? '—'}`
 *  - `finalText` = `T-8 = ${finalFormatted ?? '—'}`
 *  - `microCopy`:
 *      - Si hay final:
 *          - manual con base → `${baseLabel} − 8`
 *          - manual sin base → 'Valor definido manualmente'
 *          - auto con base → `${baseLabel} − 8`
 *      - Si no hay final → 'Sin datos disponibles'
 */
export function buildT8Metric({
  computedT8Data,
  t8Selection,
  isManualT8,
  manualT8BaseValue,
  manualT8Value,
  formatNumber,
}) {
  const automaticRiseDay =
    typeof computedT8Data.earliestCycle?.riseDay === 'number' &&
    Number.isFinite(computedT8Data.earliestCycle.riseDay)
      ? computedT8Data.earliestCycle.riseDay
      : null;

  const automaticFinal =
    typeof computedT8Data.value === 'number' && Number.isFinite(computedT8Data.value)
      ? computedT8Data.value
      : null;

  // Solo usamos los valores automáticos si realmente se puede calcular T-8.
  // Si computedT8Data.canCompute es booleano, lo respetamos. Si no existe,
  // asumimos true para no romper otros casos.
  const canUseAutoValues =
    computedT8Data && typeof computedT8Data.canCompute === 'boolean'
      ? computedT8Data.canCompute
      : true;

  const shouldUseManual = isManualT8 && t8Selection === 'manual';
  const shouldUseAuto = t8Selection === 'auto' && canUseAutoValues;
  const isIgnored = t8Selection === 'none';

  const baseValue = shouldUseManual
    ? manualT8BaseValue
    : shouldUseAuto
      ? automaticRiseDay
      : null;

  const finalValue = shouldUseManual
    ? manualT8Value
    : shouldUseAuto
      ? automaticFinal
      : null;

  const baseFormatted = formatNumber(baseValue, { maximumFractionDigits: 0 });
  const finalFormatted = formatNumber(finalValue, { maximumFractionDigits: 0 });

  const baseText = `Día de subida: ${baseFormatted ?? '—'}`;
  const finalText = `T-8 = ${finalFormatted ?? '—'}`;

  let microCopy = 'Sin datos disponibles';
  let microCopyMuted = true;

  if (typeof finalValue === 'number' && Number.isFinite(finalValue)) {
    if (shouldUseManual) {
      if (typeof manualT8BaseValue === 'number' && Number.isFinite(manualT8BaseValue)) {
        const baseLabel =
          formatNumber(manualT8BaseValue, { maximumFractionDigits: 0 }) ??
          `${manualT8BaseValue}`;
        microCopy = `${baseLabel} − 8`;
        microCopyMuted = false;
      } else {
        microCopy = 'Valor definido manualmente';
        microCopyMuted = true;
      }
    } else if (shouldUseAuto && typeof automaticRiseDay === 'number' && Number.isFinite(automaticRiseDay)) {
      const baseLabel =
        formatNumber(automaticRiseDay, { maximumFractionDigits: 0 }) ?? `${automaticRiseDay}`;
      microCopy = `${baseLabel} − 8`;
      microCopyMuted = false;
    }
  }

  if (typeof finalValue !== 'number' || !Number.isFinite(finalValue)) {
    microCopy = 'Sin datos disponibles';
    microCopyMuted = true;
  }

  const modeLabel = isIgnored ? 'Sin usar' : shouldUseManual ? 'Manual' : 'Auto';

  return {
    title: 'T-8',
    baseText,
    finalText,
    microCopy,
    microCopyMuted,
    modeLabel,
    microCopyId: 't8-metric-microcopy',
    baseValue,
    finalValue,
    baseFormatted,
    finalFormatted,
    isManual: shouldUseManual,
  };
}