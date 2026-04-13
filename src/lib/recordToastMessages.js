const normalizeTextValue = (value) => String(value ?? '').trim();

const normalizeNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
};

const getSelectedMeasurementForToast = (source) =>
  source?.measurements?.find((measurement) => measurement?.selected) ||
  source?.measurements?.[0] ||
  null;

const getComparableRecordState = (source) => {
  if (!source) return null;

  const selectedMeasurement = getSelectedMeasurementForToast(source);
  const useCorrected = Boolean(selectedMeasurement?.use_corrected ?? source?.use_corrected);

  const temperature = normalizeNumericValue(
    useCorrected
      ? (
          selectedMeasurement?.temperature_corrected ??
          source?.temperature_corrected ??
          selectedMeasurement?.temperature ??
          source?.temperature_chart ??
          source?.temperature_raw ??
          source?.temperature
        )
      : (
          selectedMeasurement?.temperature ??
          source?.temperature_chart ??
          source?.temperature_raw ??
          source?.temperature ??
          selectedMeasurement?.temperature_corrected ??
          source?.temperature_corrected
        )
  );

  const time = normalizeTextValue(
    selectedMeasurement?.time ??
      source?.time ??
      source?.time_corrected ??
      ''
  );

  return {
    temperature,
    time,
    sensation: normalizeTextValue(source?.mucusSensation ?? source?.mucus_sensation),
    appearance: normalizeTextValue(source?.mucusAppearance ?? source?.mucus_appearance),
    observations: normalizeTextValue(source?.observations),
    symbol: source?.fertility_symbol ?? source?.fertilitySymbol ?? 'none',
    relations: Boolean(source?.had_relations ?? source?.hadRelations),
  };
};

const joinLabelsEs = (labels) => {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};

export const getRecordUpdateToastMessage = (previousRecord, nextData) => {
  const previous = getComparableRecordState(previousRecord);
  const next = getComparableRecordState(nextData);

  if (!next) return 'Registro actualizado';

  const changed = [];

  if (!previous) {
    if (next.temperature !== null || next.time) changed.push('la temperatura');
    if (next.sensation) changed.push('la sensación');
    if (next.appearance) changed.push('la apariencia');
    if (next.observations) changed.push('las observaciones');
    if (next.symbol && next.symbol !== 'none') changed.push('el símbolo');
    if (next.relations) changed.push('las relaciones sexuales');

    if (changed.length === 1) return `Se ha registrado ${changed[0]}`;
    if (changed.length === 2) return `Se han registrado ${joinLabelsEs(changed)}`;
    if (changed.length > 2) return 'Se han actualizado varios campos';
    return 'Registro guardado';
  }

  if (previous.temperature !== next.temperature || previous.time !== next.time) {
    changed.push('la temperatura');
  }
  if (previous.sensation !== next.sensation) changed.push('la sensación');
  if (previous.appearance !== next.appearance) changed.push('la apariencia');
  if (previous.observations !== next.observations) changed.push('las observaciones');
  if (previous.symbol !== next.symbol) changed.push('el símbolo');
  if (previous.relations !== next.relations) changed.push('las relaciones sexuales');

  if (changed.length === 0) return 'Registro actualizado';
  if (changed.length === 1) return `Se ha actualizado ${changed[0]}`;
  if (changed.length === 2) return `Se han actualizado ${joinLabelsEs(changed)}`;
  return 'Se han actualizado varios campos';
};

export const getRelationsToastMessage = (hasRelations) =>
  hasRelations
    ? 'Se han marcado las relaciones sexuales'
    : 'Se han desmarcado las relaciones sexuales';

export const getPeakDayToastMessage = (peakMode) => {
  if (peakMode === 'remove') return 'Se ha eliminado el día pico';
  if (peakMode === 'update') return 'Se ha actualizado el día pico';
  return 'Se ha determinado el día pico';
};
