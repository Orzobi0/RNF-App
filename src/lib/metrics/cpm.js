export const MANUAL_CPM_DEDUCTION = 20;

/**
 * Deduction para el CPM automático:
 * - Si hay `deduction` numérico en `computedCpmData`, úsalo tal cual.
 * - Si no, si `cycleCount >= 12` → 20.
 * - En caso contrario → 21.
 */
export function getAutomaticCpmDeduction({ cycleCount, deduction }) {
  if (typeof deduction === 'number' && Number.isFinite(deduction)) {
    return deduction;
  }

  const safeCount =
    typeof cycleCount === 'number' && Number.isFinite(cycleCount) ? cycleCount : 0;

  return safeCount >= 12 ? 20 : 21;
}

/**
 * Construye el objeto `cpmMetric` que antes se creaba en DashboardPage.
 * Mantén exactamente la misma forma/propiedades que el `cpmMetric` actual:
 *  - title, baseText, finalText, microCopy, microCopyMuted,
 *    modeLabel, microCopyId, baseValue, finalValue,
 *    baseFormatted, finalFormatted, isManual
 *
 * Reglas:
 *  - `cpmSelection` puede ser 'auto' | 'manual' | 'none'
 *  - `isManualCpm` indica si hay valor manual guardado
 *  - Si selección = 'manual' e `isManualCpm` true → usa manual
 *  - Si selección = 'auto' → usa automático
 *  - Si selección = 'none' → base/final = null y se muestra “Sin datos”
 *  - Para modo manual, la deducción **SIEMPRE** es 20 (MANUAL_CPM_DEDUCTION)
 *  - Para modo auto, la deducción se obtiene con `getAutomaticCpmDeduction`
 *  - `modeLabel` debe ser:
 *      - 'Manual' en manual
 *      - 'Auto' en automático
 *      - 'Sin usar' en none
 *  - `baseText` = `Ciclo más corto: ${baseFormatted ?? '—'}`
 *  - `finalText` = `CPM = ${finalFormatted ?? '—'}`
 *  - `microCopy`:
 *      - Si hay `finalValue` numérico:
 *          - Si manual y hay base manual → `${baseLabel} − 20`
 *          - Si manual sin base → 'Valor definido manualmente'
 *          - Si auto y hay base automática → `${baseLabel} − <deducción auto>`
 *      - Si no hay `finalValue` → 'Sin datos disponibles'
 */
export function buildCpmMetric({
  computedCpmData,
  cpmSelection,
  isManualCpm,
  manualCpmBaseValue,
  manualCpmValue,
  formatNumber,
}) {
  const automaticBase =
    typeof computedCpmData.shortestCycle?.duration === 'number' &&
    Number.isFinite(computedCpmData.shortestCycle.duration)
      ? computedCpmData.shortestCycle.duration
      : null;

  const automaticFinal =
    typeof computedCpmData.value === 'number' && Number.isFinite(computedCpmData.value)
      ? computedCpmData.value
      : null;

  const shouldUseManual = isManualCpm && cpmSelection === 'manual';
  const shouldUseAuto = cpmSelection === 'auto';
  const isIgnored = cpmSelection === 'none';

  const baseValue = shouldUseManual
    ? manualCpmBaseValue
    : shouldUseAuto
      ? automaticBase
      : null;

  const finalValue = shouldUseManual
    ? manualCpmValue
    : shouldUseAuto
      ? automaticFinal
      : null;

  const baseFormatted = formatNumber(baseValue, { maximumFractionDigits: 0 });
  const finalFormatted = formatNumber(finalValue, { maximumFractionDigits: 2 });

  const baseText = `Ciclo más corto: ${baseFormatted ?? '—'}`;
  const finalText = `CPM = ${finalFormatted ?? '—'}`;

  let microCopy = 'Sin datos disponibles';
  let microCopyMuted = true;

  if (typeof finalValue === 'number' && Number.isFinite(finalValue)) {
    if (shouldUseManual) {
      if (typeof manualCpmBaseValue === 'number' && Number.isFinite(manualCpmBaseValue)) {
        const baseLabel =
          formatNumber(manualCpmBaseValue, { maximumFractionDigits: 0 }) ??
          `${manualCpmBaseValue}`;
        microCopy = `${baseLabel} − ${MANUAL_CPM_DEDUCTION}`;
        microCopyMuted = false;
      } else {
        microCopy = 'Valor definido manualmente';
        microCopyMuted = true;
      }
    } else if (shouldUseAuto && typeof automaticBase === 'number' && Number.isFinite(automaticBase)) {
      const deduction = getAutomaticCpmDeduction({
        cycleCount: computedCpmData.cycleCount ?? 0,
        deduction: computedCpmData.deduction,
      });
      const baseLabel =
        formatNumber(automaticBase, { maximumFractionDigits: 0 }) ?? `${automaticBase}`;
      microCopy = `${baseLabel} − ${deduction}`;
      microCopyMuted = false;
    }
  }

  if (typeof finalValue !== 'number' || !Number.isFinite(finalValue)) {
    microCopy = 'Sin datos disponibles';
    microCopyMuted = true;
  }

  const modeLabel = isIgnored ? 'Sin usar' : shouldUseManual ? 'Manual' : 'Auto';

  return {
    title: 'CPM',
    baseText,
    finalText,
    microCopy,
    microCopyMuted,
    modeLabel,
    microCopyId: 'cpm-metric-microcopy',
    baseValue,
    finalValue,
    baseFormatted,
    finalFormatted,
    isManual: shouldUseManual,
  };
}