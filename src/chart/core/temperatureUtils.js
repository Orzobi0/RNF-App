export const normalizeTemp = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveMeasurementTemp = (measurement) => {
  if (!measurement) return null;

  const raw = normalizeTemp(measurement.temperature);
  const corrected = normalizeTemp(measurement.temperature_corrected);

  if (measurement.use_corrected && corrected !== null) {
    return corrected;
  }

  if (raw !== null) {
    return raw;
  }

  if (corrected !== null) {
    return corrected;
  }

  return null;
};

export const resolveEffectiveTemperature = (entry) => {
  if (!entry) return null;

  const chart = normalizeTemp(entry.temperature_chart);
  const raw = normalizeTemp(entry.temperature_raw);
  const corrected = normalizeTemp(entry.temperature_corrected);

  if (entry.use_corrected && corrected !== null) {
    return corrected;
  }

  if (chart !== null) {
    return chart;
  }

  if (raw !== null) {
    return raw;
  }

  if (corrected !== null) {
    return corrected;
  }

  if (Array.isArray(entry.measurements)) {
    const selectedMeasurement = entry.measurements.find(
      (measurement) => measurement && measurement.selected && resolveMeasurementTemp(measurement) !== null
    );
    const fallbackMeasurement =
      selectedMeasurement || entry.measurements.find((measurement) => resolveMeasurementTemp(measurement) !== null);

    if (fallbackMeasurement) {
      return resolveMeasurementTemp(fallbackMeasurement);
    }
  }

  return null;
};
