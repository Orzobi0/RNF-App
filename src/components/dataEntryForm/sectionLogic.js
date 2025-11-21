export const SECTION_METADATA = Object.freeze({
  temperature: {
    key: 'temperature',
    ariaLabel: 'Alternar sección de temperatura',
    srLabel: 'Temperatura',
  },
  symbol: {
    key: 'symbol',
    ariaLabel: 'Alternar sección de símbolo de fertilidad',
    srLabel: 'Símbolo de fertilidad',
  },
  sensation: {
    key: 'sensation',
    ariaLabel: 'Alternar sección de sensación del moco',
    srLabel: 'Sensación del moco',
  },
  appearance: {
    key: 'appearance',
    ariaLabel: 'Alternar sección de apariencia del moco',
    srLabel: 'Apariencia del moco',
  },
  observations: {
    key: 'observations',
    ariaLabel: 'Alternar sección de observaciones',
    srLabel: 'Observaciones',
  },
});

export const toggleSection = (current = [], target) => {
  if (!target) {
    return Array.isArray(current) ? current : [];
  }

  const normalizedCurrent = Array.isArray(current) ? current : current ? [current] : [];
  const isActive = normalizedCurrent.includes(target);

  if (isActive) {
    return normalizedCurrent.filter((key) => key !== target);
  }

  return [...normalizedCurrent, target];
};

export const getToggleFeedback = (type, previousValue, nextValue) => {
  const wasActive = Boolean(previousValue);
  const isActive = Boolean(nextValue);

  if (wasActive === isActive) {
    return null;
  }

  const label = type === 'peak' ? 'Día pico' : 'Relaciones sexuales';
  return wasActive ? `Se ha actualizado ${label}` : `Se ha seleccionado ${label}`;
};

export const computePeakState = ({ peakTag, existingPeakIsoDate, selectedIsoDate }) => {
  const hasExistingPeak = Boolean(existingPeakIsoDate);
  const matchesExisting = Boolean(
    existingPeakIsoDate && selectedIsoDate && existingPeakIsoDate === selectedIsoDate
  );
  const isPeakDay = peakTag === 'peak' || matchesExisting;
  const mode = isPeakDay ? 'remove' : hasExistingPeak ? 'update' : 'assign';

  return { mode, isPeakDay };
};