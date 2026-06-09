const COMBINE_MODE_OPTIONS = new Set(['estandar']);

export const createDefaultFertilityStartConfig = () => ({
  calculators: { cpm: true, t8: true },
  combineMode: 'estandar',
});

export const PREFERENCE_DEFAULTS = {
  theme: 'light',
  units: 'metric',
  preferredTemperatureTime: '',
  manualCpm: null,
  manualT8: null,
  manualCpmBase: null,
  manualT8Base: null,
  cpmMode: 'auto',
  t8Mode: 'auto',
  showRelationsRow: true,
  fertilityStartConfig: createDefaultFertilityStartConfig(),
};

export const PREFERENCES_UI_FIELDS = [
  'preferredTemperatureTime',
  'cpmMode',
  'manualCpm',
  'manualCpmBase',
  't8Mode',
  'manualT8',
  'manualT8Base',
  'showRelationsRow',
  'fertilityStartConfig',
];

const CPM_MODE_OPTIONS = new Set(['auto', 'manual', 'none']);
const T8_MODE_OPTIONS = new Set(['auto', 'manual', 'none']);

export const normalizeCombineMode = (value) => {
  if (value === 'conservador') return 'estandar';
  return COMBINE_MODE_OPTIONS.has(value) ? value : null;
};

export const mergeFertilityStartConfig = ({ current, incoming, legacyCombineMode } = {}) => {
  const base = createDefaultFertilityStartConfig();
  const merged = {
    calculators: { ...base.calculators },
    combineMode: base.combineMode,
  };
  let combineModeSet = false;

  const applyConfig = (source) => {
    if (!source || typeof source !== 'object') return;
    Object.keys(merged.calculators).forEach((key) => {
      if (typeof source?.calculators?.[key] === 'boolean') {
        merged.calculators[key] = source.calculators[key];
      }
    });

    const normalizedMode = normalizeCombineMode(source.combineMode);
    if (normalizedMode) {
      merged.combineMode = normalizedMode;
      combineModeSet = true;
    }
  };

  applyConfig(current);
  applyConfig(incoming);

  if (!combineModeSet) {
    const legacyMode = normalizeCombineMode(legacyCombineMode);
    if (legacyMode) {
      merged.combineMode = legacyMode;
    }
  }

  return merged;
};

export const syncFertilityCalculatorsWithModes = (preferences = {}) => {
  const cpmMode = normalizePreferenceValue('cpmMode', preferences?.cpmMode);
  const t8Mode = normalizePreferenceValue('t8Mode', preferences?.t8Mode);
  const fertilityStartConfig = mergeFertilityStartConfig({
    incoming: preferences?.fertilityStartConfig,
  });

  return {
    ...preferences,
    cpmMode,
    t8Mode,
    fertilityStartConfig: {
      ...fertilityStartConfig,
      calculators: {
        ...fertilityStartConfig.calculators,
        cpm: cpmMode !== 'none',
        t8: t8Mode !== 'none',
      },
    },
  };
};

const normalizeNumberOrNull = (value) => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

export const normalizePreferenceValue = (key, value, currentPreferences = PREFERENCE_DEFAULTS) => {
  switch (key) {
    case 'preferredTemperatureTime':
      return typeof value === 'string' ? value : '';
    case 'cpmMode':
      return CPM_MODE_OPTIONS.has(value) ? value : currentPreferences.cpmMode;
    case 't8Mode':
      return T8_MODE_OPTIONS.has(value) ? value : currentPreferences.t8Mode;
    case 'showRelationsRow':
      return typeof value === 'boolean' ? value : Boolean(currentPreferences.showRelationsRow);
    case 'manualCpm':
    case 'manualT8':
    case 'manualCpmBase':
    case 'manualT8Base': {
      const normalized = normalizeNumberOrNull(value);
      return normalized === undefined ? currentPreferences[key] : normalized;
    }
    default:
      return value;
  }
};

export const normalizeStoredPreferences = (rawPreferences = {}) => {
  const defaults = {
    ...PREFERENCE_DEFAULTS,
    fertilityStartConfig: createDefaultFertilityStartConfig(),
  };
  const {
    combineMode: legacyCombineMode,
    fertilityStartConfig: storedFertilityStartConfig,
    ...rest
  } = rawPreferences ?? {};

  const normalized = {
    ...defaults,
    ...rest,
  };

  PREFERENCES_UI_FIELDS.forEach((fieldKey) => {
    if (fieldKey === 'fertilityStartConfig') return;
    normalized[fieldKey] = normalizePreferenceValue(fieldKey, normalized[fieldKey], defaults);
  });

  const storedConfig = mergeFertilityStartConfig({
    current: defaults.fertilityStartConfig,
    incoming: storedFertilityStartConfig,
    legacyCombineMode,
  });

  if (storedConfig.calculators?.cpm === false && normalized.cpmMode !== 'none') {
    normalized.cpmMode = 'none';
  }
  if (storedConfig.calculators?.t8 === false && normalized.t8Mode !== 'none') {
    normalized.t8Mode = 'none';
  }

  normalized.fertilityStartConfig = mergeFertilityStartConfig({
    current: defaults.fertilityStartConfig,
    incoming: storedConfig,
  });

  return syncFertilityCalculatorsWithModes(normalized);
};

export const normalizePreferencePatch = (patch = {}, currentPreferences = PREFERENCE_DEFAULTS) => {
  const { combineMode: legacyCombineMode, fertilityStartConfig, ...restPatch } = patch ?? {};
  const normalizedPatch = {};

  Object.keys(restPatch).forEach((key) => {
    normalizedPatch[key] = normalizePreferenceValue(key, restPatch[key], currentPreferences);
  });

  const hasFertilityUpdate =
    (fertilityStartConfig && typeof fertilityStartConfig === 'object') || legacyCombineMode !== undefined;

  if (hasFertilityUpdate) {
    normalizedPatch.fertilityStartConfig = mergeFertilityStartConfig({
      current: currentPreferences?.fertilityStartConfig,
      incoming: fertilityStartConfig,
      legacyCombineMode,
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(normalizedPatch, 'cpmMode') ||
    Object.prototype.hasOwnProperty.call(normalizedPatch, 't8Mode') ||
    Object.prototype.hasOwnProperty.call(normalizedPatch, 'fertilityStartConfig')
  ) {
    const synced = syncFertilityCalculatorsWithModes({
      ...currentPreferences,
      ...normalizedPatch,
    });
    normalizedPatch.cpmMode = synced.cpmMode;
    normalizedPatch.t8Mode = synced.t8Mode;
    normalizedPatch.fertilityStartConfig = synced.fertilityStartConfig;
  }

  return { normalizedPatch, hasFertilityUpdate };
};

export const validatePreferenceField = (key, value, fullPreferences = {}) => {
  switch (key) {
    case 'preferredTemperatureTime':
      if (!value) return null;
      return /^\d{2}:\d{2}$/.test(value) ? null : 'Formato inválido. Usa HH:mm.';
    case 'manualCpm':
    case 'manualCpmBase':
    case 'manualT8':
    case 'manualT8Base':
      if (value === null || value === undefined || value === '') return null;
      return Number.isFinite(Number(value)) ? null : 'Debe ser un número válido.';
    case 'cpmMode':
      return CPM_MODE_OPTIONS.has(value) ? null : 'Modo CPM inválido.';
    case 't8Mode':
      return T8_MODE_OPTIONS.has(value) ? null : 'Modo T-8 inválido.';
    case 'showRelationsRow':
      return typeof value === 'boolean' ? null : 'Valor inválido.';
    case 'fertilityStartConfig':
      return null;
    default:
      return null;
  }
};

export const validatePreferences = (prefs = {}) => {
  const errors = {};
  PREFERENCES_UI_FIELDS.forEach((key) => {
    const error = validatePreferenceField(key, prefs[key], prefs);
    if (error) errors[key] = error;
  });

  if (prefs.cpmMode !== 'manual') {
    errors.manualCpm = null;
    errors.manualCpmBase = null;
  }

  if (prefs.t8Mode !== 'manual') {
    errors.manualT8 = null;
    errors.manualT8Base = null;
  }

  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value));
};

const isEqualValue = (a, b) => {
  if (typeof a === 'object' && a && typeof b === 'object' && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
};

export const buildPreferencesDiff = (base = {}, draft = {}, keys = PREFERENCES_UI_FIELDS) => {
  const diff = {};
  keys.forEach((key) => {
    if (!isEqualValue(base[key], draft[key])) {
      diff[key] = draft[key];
    }
  });
  return diff;
};
