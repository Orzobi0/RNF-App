const normalizeTextBase = (value) => {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
};

const collapseRepeatingLetters = (text) => text.replace(/(.)\1{2,}/g, '$1');

const normalizeObservationText = (value) => {
  if (value == null) return '';

  let text = normalizeTextBase(value);

  text = text
    .replace(/c[\.\s_-]*h/g, 'ch')
    .replace(/[-_/]+/g, ' ')
    .replace(/n\s*\/\s*a/gi, 'na')
    .replace(/\bnoseca\b/g, 'no seca');

  text = collapseRepeatingLetters(text);

  text = text
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
};

const createWordMatcher = (root) => {
  const pattern = new RegExp(`\\b${root}[a-z]*\\b`, 'i');
  return (text) => pattern.test(text);
};

const createPhraseMatcher = (phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  return (text) => pattern.test(text);
};

const detectMatches = (text, matchers) => {
  if (!text) return [];
  return matchers
    .filter(({ test }) => test(text))
    .map(({ canonical }) => canonical);
};

const SENSATION_EMPTY = [
  { canonical: 'sin sensacion', test: createPhraseMatcher('sin sensacion') },
  { canonical: 'ninguna', test: createWordMatcher('ningun') },
  { canonical: 'nada', test: createWordMatcher('nada') },
  { canonical: 'vacia', test: createWordMatcher('vaci') },
  { canonical: 'na', test: createPhraseMatcher('na') },
  { canonical: 'sin datos', test: createPhraseMatcher('sin datos') },
  { canonical: 'sin info', test: createPhraseMatcher('sin info') },
  { canonical: 'sin informacion', test: createPhraseMatcher('sin informacion') },
  { canonical: 'no hay', test: createPhraseMatcher('no hay') },
  { canonical: '-', test: (text) => /^[-–—]*$/.test(text) },
];

const SENSATION_INFERTILE = [
  { canonical: 'seca', test: createWordMatcher('seca') },
  { canonical: 'sequedad', test: createWordMatcher('sequedad') },
  { canonical: 'no seca', test: createPhraseMatcher('no seca') },
];

const SENSATION_FERTILE_START = [
  { canonical: 'humeda', test: createWordMatcher('humed') },
  { canonical: 'humedad', test: createWordMatcher('humedad') },
];

const SENSATION_FERTILE_HIGH = [
  { canonical: 'mojada', test: createWordMatcher('mojad') },
  { canonical: 'resbalosa', test: createWordMatcher('resbal') },
  { canonical: 'deslizante', test: createWordMatcher('desliz') },
  { canonical: 'lubricada', test: createWordMatcher('lubric') },
];

const APPEARANCE_INFERTILE = [
  { canonical: 'sin moco', test: createPhraseMatcher('sin moco') },
  { canonical: 'nada', test: createWordMatcher('nada') },
  { canonical: 'vacio', test: createWordMatcher('vaci') },
  { canonical: 'pegajoso', test: createWordMatcher('pegajos') },
  { canonical: 'gomoso', test: createWordMatcher('gomos') },
  { canonical: 'grumoso', test: createWordMatcher('grumos') },
  { canonical: 'espeso', test: createWordMatcher('espes') },
  { canonical: 'denso', test: createWordMatcher('denso') },
  { canonical: 'pastoso', test: createWordMatcher('pastos') },
  { canonical: 'opaco', test: createWordMatcher('opac') },
  { canonical: 'turbio', test: createWordMatcher('turb') },
  { canonical: 'blanquecino', test: createWordMatcher('blanquecin') },
  { canonical: 'amarillento', test: createWordMatcher('amarillent') },
];

const APPEARANCE_FERTILE_START = [
  { canonical: 'cremoso', test: createWordMatcher('cremos') },
  { canonical: 'lechoso', test: createWordMatcher('lechos') },
  { canonical: 'opalescente', test: createWordMatcher('opalescent') },
];

const APPEARANCE_FERTILE_HIGH = [
  { canonical: 'cristalino', test: createWordMatcher('cristalin') },
  { canonical: 'transparente', test: createWordMatcher('transpar') },
  { canonical: 'brillante', test: createWordMatcher('brillant') },
  { canonical: 'elastico', test: createWordMatcher('elastic') },
  { canonical: 'filante', test: createWordMatcher('filant') },
  { canonical: 'hilos', test: createWordMatcher('hilo') },
  { canonical: 'clara de huevo', test: createPhraseMatcher('clara de huevo') },
  { canonical: 'ch', test: createPhraseMatcher('ch') },
];

const ensureUnique = (values = []) => Array.from(new Set(values));

const detectSpotting = (day) => {
  const directKeys = ['spotting', 'had_spotting', 'hadSpotting'];
  if (directKeys.some((key) => Boolean(day?.[key]))) {
    return true;
  }
  const fertilitySymbol = day?.fertility_symbol ?? day?.fertilitySymbol ?? null;
  if (fertilitySymbol && String(fertilitySymbol).toLowerCase() === 'spot') {
    return true;
  }
  return false;
};

const buildSummaryFromMatches = ({
  infertileTerms,
  fertileStartTerms,
  fertileHighTerms,
  isUnknownFertile,
  isEmpty,
}) => {
  if (isEmpty) {
    return { type: 'empty' };
  }
  const hasHigh = fertileHighTerms.length > 0;
  const hasStart = fertileStartTerms.length > 0 || isUnknownFertile;
  const hasInfertile = infertileTerms.length > 0;

  if ((hasHigh || hasStart) && hasInfertile) {
    return { type: hasHigh ? 'fertileHigh' : 'fertileStart', conflict: true };
  }
  if (hasHigh) {
    return { type: 'fertileHigh', conflict: false };
  }
  if (hasStart) {
    return { type: 'fertileStart', conflict: false };
  }
  if (hasInfertile) {
    return { type: 'infertile', conflict: false };
  }
  return { type: 'unknown', conflict: false };
};

const analyzeSensation = (rawValue) => {
  const normalized = normalizeObservationText(rawValue);
  const emptyMatches = detectMatches(normalized, SENSATION_EMPTY);
  const infertileMatches = detectMatches(normalized, SENSATION_INFERTILE);
  const fertileHighMatches = detectMatches(normalized, SENSATION_FERTILE_HIGH);
  const fertileStartMatches = detectMatches(normalized, SENSATION_FERTILE_START);
  const hasText = Boolean(normalized);
  const isEmpty = !hasText || emptyMatches.length > 0;
  const hasUnknownFertile = hasText && !isEmpty && infertileMatches.length === 0 && fertileHighMatches.length === 0 && fertileStartMatches.length === 0;

  const summary = buildSummaryFromMatches({
    infertileTerms: infertileMatches,
    fertileStartTerms: fertileStartMatches,
    fertileHighTerms: fertileHighMatches,
    isUnknownFertile: hasUnknownFertile,
    isEmpty,
  });

  const matchedTerms = ensureUnique([
    ...infertileMatches,
    ...fertileStartMatches,
    ...fertileHighMatches,
  ]);

  return {
    normalized,
    isEmpty,
    infertileMatches,
    fertileStartMatches,
    fertileHighMatches,
    hasUnknownFertile,
    summary,
    matchedTerms,
  };
};

const analyzeAppearance = (rawValue) => {
  const normalized = normalizeObservationText(rawValue);
  const infertileMatches = detectMatches(normalized, APPEARANCE_INFERTILE);
  const fertileStartMatches = detectMatches(normalized, APPEARANCE_FERTILE_START);
  const fertileHighMatches = detectMatches(normalized, APPEARANCE_FERTILE_HIGH);
  const hasText = Boolean(normalized);
  const isEmpty = !hasText;

  const summary = buildSummaryFromMatches({
    infertileTerms: infertileMatches,
    fertileStartTerms: fertileStartMatches,
    fertileHighTerms: fertileHighMatches,
    isUnknownFertile: false,
    isEmpty,
  });

  const matchedTerms = ensureUnique([
    ...infertileMatches,
    ...fertileStartMatches,
    ...fertileHighMatches,
  ]);

  return {
    normalized,
    isEmpty,
    infertileMatches,
    fertileStartMatches,
    fertileHighMatches,
    summary,
    matchedTerms,
  };
};

const buildClassification = ({
  sensation,
  appearance,
  day,
}) => {
  const classification = {
    phase: 'INFERTIL',
    level: 0,
    basis: 'default',
    reason: 'Sin datos de moco',
    details: [],
    matchedTerms: { sensation: [], appearance: [] },
    near_peak_hint: false,
  };

  const addDetail = (text) => {
    if (!text) return;
    classification.details.push(text);
  };

  if (!sensation.isEmpty) {
    classification.basis = 'sensation';
    classification.matchedTerms.sensation = sensation.matchedTerms;

    if (sensation.summary.type === 'fertileHigh') {
      classification.phase = 'FERTIL_ALTA';
      classification.level = 2;
      const term = sensation.fertileHighMatches[0] || sensation.fertileStartMatches[0] || 'sensación fértil alta';
      classification.reason = `Sensación fértil alta: ${term}`;
      if (sensation.summary.conflict) {
        addDetail('Conflicto con términos secos: prevalece la sensación fértil.');
      }
    } else if (sensation.summary.type === 'fertileStart' || sensation.hasUnknownFertile) {
      classification.phase = 'FERTIL_COMIENZO';
      classification.level = 1;
      if (sensation.fertileStartMatches.length > 0) {
        classification.reason = `Sensación fértil: ${sensation.fertileStartMatches[0]}`;
      } else {
        classification.reason = 'Sensación no catalogada tratada como fértil (comienzo)';
        addDetail(`Texto registrado: "${sensation.normalized}".`);
      }
      if (sensation.summary.conflict) {
        addDetail('Conflicto con términos secos: prevalece la sensación fértil.');
      }
    } else if (sensation.summary.type === 'infertile') {
      classification.phase = 'INFERTIL';
      classification.level = 0;
      classification.reason = `Sensación: ${sensation.infertileMatches[0]}`;
    } else {
      classification.phase = 'INFERTIL';
      classification.level = 0;
      classification.reason = sensation.normalized
        ? 'Sensación no concluyente'
        : 'Sin datos de sensación';
    }
  } else {
    if (!appearance.isEmpty) {
      classification.basis = 'appearance';
      classification.matchedTerms.appearance = appearance.matchedTerms;

      if (appearance.summary.type === 'fertileHigh') {
        classification.phase = 'FERTIL_ALTA';
        classification.level = 2;
        const term = appearance.fertileHighMatches[0] || 'apariencia fértil alta';
        classification.reason = `Apariencia fértil alta: ${term}`;
      } else if (appearance.summary.type === 'fertileStart') {
        classification.phase = 'FERTIL_COMIENZO';
        classification.level = 1;
        const term = appearance.fertileStartMatches[0] || 'apariencia fértil';
        classification.reason = `Apariencia fértil: ${term}`;
      } else if (appearance.summary.type === 'infertile') {
        classification.phase = 'INFERTIL';
        classification.level = 0;
        classification.reason = `Apariencia: ${appearance.infertileMatches[0]}`;
      } else {
        classification.phase = 'INFERTIL';
        classification.level = 0;
        classification.reason = 'Apariencia no concluyente';
      }
    } else {
      classification.reason = 'Sin datos de moco';
    }
  }

  if (classification.basis === 'sensation' && classification.phase === 'FERTIL_COMIENZO') {
    if (appearance.fertileHighMatches.length > 0) {
      classification.phase = 'FERTIL_ALTA';
      classification.level = 2;
      const term = appearance.fertileHighMatches[0];
      addDetail(`Escalado a FÉRTIL_ALTA por apariencia: ${term}.`);
      classification.matchedTerms.appearance = ensureUnique([
        ...classification.matchedTerms.appearance,
        ...appearance.fertileHighMatches,
      ]);
    }
  }

  if (classification.basis === 'appearance' && sensation.isEmpty) {
    addDetail('Sensación vacía; se usa apariencia.');
  }

  const spotting = detectSpotting(day);
  const nearPeakHint = spotting && classification.phase === 'FERTIL_ALTA';
  classification.near_peak_hint = nearPeakHint;
  if (nearPeakHint) {
    addDetail('Spotting con moco fértil alto: posible ovulación próxima.');
  }

  return classification;
};

export const classifyMucusDay = (day = {}) => {
  const sensationValue = day?.mucusSensation ?? day?.mucus_sensation ?? '';
  const appearanceValue = day?.mucusAppearance ?? day?.mucus_appearance ?? '';

  const sensation = analyzeSensation(sensationValue);
  const appearance = analyzeAppearance(appearanceValue);

  return buildClassification({ sensation, appearance, day });
};

export const buildClassificationTimeline = (data = []) => {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data.map((entry, index) => ({
    index,
    isoDate: entry?.isoDate ?? null,
    classification: entry?.classification ?? null,
  }));
};

export { normalizeObservationText };

export default classifyMucusDay;