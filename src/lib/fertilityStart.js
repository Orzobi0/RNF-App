const SCORE_MAP = {
  0: 0,
  1: 0.4,
  2: 0.8,
  3: 1,
};

const SYMBOL_FLOOR = {
  M: 0.8,
  F: 1,
  'M+': 1,
  white: 0.4,
};

const clamp = (value, min = 0, max = 1) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const normalizeText = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
};

const buildNormalizedText = (value) => {
  const normalized = normalizeText(value);
  return normalized.replace(/\s+/g, ' ').trim();
};

const matchPatternWithModifiers = (text, definitions = []) => {
  if (!text) return null;

  let bestMatch = null;

  definitions.forEach((definition, definitionIndex) => {
    const {
      patterns = [],
      level,
      descriptor,
      negatedLevel,
      allowedModifiers = null,
      disallowedModifiers = null,
      selectionScore: baseSelectionScore,
      forceSelection = false,
    } = definition || {};

    patterns.forEach((pattern) => {
      if (!pattern) return;
      const regex = new RegExp(
        `(?:^|[^a-z0-9])(?:(no|muy|poco|leve)\\s+)?(${pattern})(?=$|[^a-z0-9])`,
        'g'
      );

      let match;
      while ((match = regex.exec(text)) !== null) {
        const modifier = match[1] ? match[1].trim() : null;
        if (allowedModifiers && !allowedModifiers.includes(modifier)) {
          continue;
        }
        if (disallowedModifiers && disallowedModifiers.includes(modifier)) {
          continue;
        }

        let resolvedLevel = level;
        if (modifier === 'no') {
          resolvedLevel = negatedLevel != null ? negatedLevel : 1;
        } else if (modifier === 'muy') {
          resolvedLevel = Math.min(3, level + 1);
        } else if (modifier === 'poco' || modifier === 'leve') {
          resolvedLevel = Math.max(0, level - 1);
        }

        const selectionScore =
          baseSelectionScore != null ? baseSelectionScore : resolvedLevel + definitionIndex * 1e-3;

        const descriptorValue =
          typeof descriptor === 'function' ? descriptor({ modifier }) : descriptor;

        if (
          !bestMatch ||
          forceSelection ||
          resolvedLevel > bestMatch.level ||
          (resolvedLevel === bestMatch.level && selectionScore > bestMatch.selectionScore)
        ) {
          bestMatch = {
            level: resolvedLevel,
            baseLevel: level,
            descriptor: descriptorValue,
            modifier,
            selectionScore,
            force: forceSelection,
          };
        }
      }
    });
  });

  return bestMatch;
};

const SENSATION_PATTERNS = [
  { patterns: ['escurridiz\\w*'], level: 3, descriptor: 'escurridiza', selectionScore: 4 },
  {
    patterns: ['lubric\\w*', 'aceitos\\w*', 'oleos\\w*'],
    level: 3,
    descriptor: 'lubricada',
  },
  { patterns: ['mojad\\w*'], level: 2, descriptor: 'mojada' },
  {
    patterns: ['resbalad\\w*', 'desliz\\w*'],
    level: 2,
    descriptor: 'resbaladiza',
  },
  { patterns: ['humed\\w*'], level: 1, descriptor: 'húmeda' },
  {
    patterns: ['pegajos\\w*', 'viscos\\w*'],
    level: 1,
    descriptor: 'pegajosa',
  },
  { patterns: ['asper\\w*'], level: 0, descriptor: 'áspera', selectionScore: 0.6 },
  { patterns: ['sin\\s+humedad'], level: 0, descriptor: 'sin humedad', selectionScore: 0.5 },
  {
    patterns: ['seca', 'seco', 'tirant\\w*'],
    level: 0,
    descriptor: 'seca',
  },
];

const APPEARANCE_PATTERNS = [
  {
    patterns: ['poco\\s+elastic\\w*', 'leve\\s+elastic\\w*'],
    level: 1,
    descriptor: 'poco elástico',
    forceSelection: true,
    selectionScore: 20,
  },
  {
    patterns: ['amarillent\\w*'],
    level: 1,
    descriptor: 'amarillento',
  },
  {
    patterns: ['cristalin\\w*'],
    level: 3,
    descriptor: 'cristalino',
    selectionScore: 4,
  },
  {
    patterns: ['liquid\\w*', 'acuos\\w*', 'transpar\\w*'],
    level: 3,
    descriptor: 'líquido',
    selectionScore: 4,
  },
  {
    patterns: ['como\\s+agua'],
    level: 3,
    descriptor: 'como agua',
    selectionScore: 3.8,
  },
  {
    patterns: ['estirabl\\w*'],
    level: 3,
    descriptor: 'estirable',
    selectionScore: 3.6,
  },
  {
    patterns: ['ch'],
    level: 3,
    descriptor: 'clara de huevo',
    selectionScore: 3.5,
  },
  {
    patterns: ['clara\\s*(?:de)?\\s*huevo'],
    level: 3,
    descriptor: 'clara de huevo',
    selectionScore: 3.4,
  },
  {
    patterns: ['filant\\w*', 'hilad\\w*', 'elastic\\w*'],
    level: 3,
    descriptor: ({ modifier }) => {
      if (modifier === 'no') return 'no filante';
      if (modifier === 'poco' || modifier === 'leve') return 'poco filante';
      return 'filante';
    },
    negatedLevel: 1,
  },
  {
    patterns: ['cremos\\w*', 'lechos\\w*', 'leche', 'crema', 'manteq\\w*', 'pastos\\w*'],
    level: 2,
    descriptor: 'cremosa',
  },
  {
    patterns: ['turbio\\w*'],
    level: 2,
    descriptor: 'turbio',
    selectionScore: 2.6,
  },
  {
    patterns: ['pegajos\\w*', 'grumos\\w*', 'grumoso', 'gomos\\w*'],
    level: 1,
    descriptor: 'pegajosa',
  },
  { patterns: ['espes\\w*'], level: 1, descriptor: 'espeso' },
  {
    patterns: ['nada\\s+visible'],
    level: 0,
    descriptor: 'sin moco',
    selectionScore: 1,
  },
  {
    patterns: ['sin\\s+moco', 'ausente', 'nulo'],
    level: 0,
    descriptor: 'sin moco',
  },
];

const tryParseLevel = (value) => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const bounded = Math.round(value);
    if (bounded >= 0 && bounded <= 3) {
      return bounded;
    }
  }
  const trimmed = String(value).trim();
  if (/^[0-3]$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  return null;
};

const detectSensationLevel = (rawValue) => {
  const numeric = tryParseLevel(rawValue);
  if (numeric != null) {
    return { level: numeric, reason: `S${numeric}`, descriptor: `S${numeric}`, hasInput: true };
  }

  const rawString = rawValue != null ? String(rawValue).trim() : '';
  const text = buildNormalizedText(rawValue);
  const hasInput = rawString.length > 0;

  if (!text) {
    return { level: 0, reason: null, descriptor: null, hasInput };
  }

  if (/^s\s*0?$/.test(text)) {
    return { level: 0, reason: 'seca', descriptor: 'seca', hasInput: true };
  }

  if (text === 'h') {
    return { level: 1, reason: 'húmeda', descriptor: 'húmeda', hasInput: true };
  }

  const match = matchPatternWithModifiers(text, SENSATION_PATTERNS);
  if (match) {
    const boundedLevel = Math.max(0, Math.min(3, match.level));
    return {
      level: boundedLevel,
      reason: match.descriptor,
      descriptor: match.descriptor,
      hasInput: true,
    };
  }

  return { level: 0, reason: null, descriptor: null, hasInput };
};

const detectAppearanceLevel = (rawValue) => {
  const numeric = tryParseLevel(rawValue);
  if (numeric != null) {
    return { level: numeric, reason: `M${numeric}`, descriptor: `M${numeric}`, hasInput: true };
  }

  const rawString = rawValue != null ? String(rawValue).trim() : '';
  const text = buildNormalizedText(rawValue);
  const hasInput = rawString.length > 0;

  if (!text) {
    return { level: 0, reason: null, descriptor: null, hasInput };
  }

  if (/^m\s*0$/.test(text)) {
    return { level: 0, reason: 'sin moco', descriptor: 'sin moco', hasInput: true };
  }

  if (/[∅ø]/i.test(rawString)) {
    return { level: 0, reason: 'sin moco', descriptor: 'sin moco', hasInput: true };
  }

  const match = matchPatternWithModifiers(text, APPEARANCE_PATTERNS);
  if (match) {
    const boundedLevel = Math.max(0, Math.min(3, match.level));
    return {
      level: boundedLevel,
      reason: match.descriptor,
      descriptor: match.descriptor,
      hasInput: true,
    };
  }

  return { level: 0, reason: null, descriptor: null, hasInput };
};

const detectSymbol = ({ appearance, observations, fertilitySymbol }) => {
  const sources = [appearance, observations, fertilitySymbol].map((value) =>
    String(value || '').toUpperCase()
  );

  const matchesToken = (token) =>
    sources.some((text) =>
      new RegExp(`(^|\\s)${token}(?=$|\\s|[.,;:])`).test(text)
    );

  if (matchesToken('M\+')) {
    return 'M+';
  }

  if (matchesToken('M')) {
    return 'M';
  }

  if (matchesToken('F') || matchesToken('FER')) {
    return 'F';
  }

  if (String(fertilitySymbol || '').toLowerCase() === 'white') {
    return 'white';
  }

  return 'none';
};

const normalizePeakStatus = (value) => {
  if (value == null) return '';
  const s = String(value).trim().toUpperCase();
  if (s === 'P' || s === 'PEAK') return 'P';
  if (s === '1' || s === 'P1' || s === 'P+1') return '1';
  if (s === '2' || s === 'P2' || s === 'P+2') return '2';
  if (s === '3' || s === 'P3' || s === 'P+3') return '3';
  return '';
};

const ensureLevelBounds = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 3) return 3;
  return value;
};

const buildNormalizedDay = (day, bipBaseline, index) => {
  const rawSensation = day?.mucusSensation ?? day?.mucus_sensation;
  const rawAppearance = day?.mucusAppearance ?? day?.mucus_appearance;
  const inputSymbol = day?.fertility_symbol ?? day?.fertilitySymbol;
  const rawObservations = day?.observations ?? day?.notes;

  const sensationInfo = detectSensationLevel(rawSensation);
  const appearanceInfo = detectAppearanceLevel(rawAppearance);
  let S = ensureLevelBounds(sensationInfo.level);
  let M = ensureLevelBounds(appearanceInfo.level);
  const reasons = [];

  if (sensationInfo.reason) {
    reasons.push(`S:${sensationInfo.reason}`);
  }

  if (appearanceInfo.reason) {
    reasons.push(`M:${appearanceInfo.reason}`);
  }

  const symbol = detectSymbol({
    appearance: rawAppearance,
    observations: rawObservations,
    fertilitySymbol: inputSymbol,
  });

  const rawSymbol = symbol;
  let symbolDetected = symbol;
  if (symbolDetected === 'white') {
    // Indicador suave de presencia de moco
    M = Math.max(M, 1);
  }

  if (symbolDetected === 'M') {
    M = Math.max(M, 2);
  }

  if (symbolDetected === 'M+') {
    M = Math.max(M, 3);
  }

  if (symbolDetected === 'F') {
    M = Math.max(M, 3);
    S = Math.max(S, 3);
  }

  const SScore = SCORE_MAP[S] ?? 0;
  const MScore = SCORE_MAP[M] ?? 0;
  const scoreCore = Math.max(SScore, MScore);

  if (symbolDetected && symbolDetected !== 'none') {
    reasons.push(`symbol:${symbolDetected}`);
  }

  const floorValue = SYMBOL_FLOOR[symbolDetected] ?? 0;
  const scoreFertil = clamp(Math.max(scoreCore, floorValue));

  const hasChangeBIP =
    bipBaseline != null && Number.isFinite(bipBaseline)
      ? scoreCore >= bipBaseline + 0.4 - 1e-9
      : false;

  if (hasChangeBIP) {
    reasons.push('cambioBIP');
  }

  const entryFlags = {
    hasSensation: Boolean(sensationInfo.hasInput),
    hasAppearance: Boolean(appearanceInfo.hasInput),
    hasSymbol:
      inputSymbol != null &&
      String(inputSymbol).trim() !== '' &&
      String(inputSymbol).trim().toLowerCase() !== 'none',
    hasObservation:
      rawObservations != null && String(rawObservations).trim() !== '',
  };
  entryFlags.hasAny =
    entryFlags.hasSensation || entryFlags.hasAppearance || entryFlags.hasSymbol || entryFlags.hasObservation;

  const normalizedPeakStatus = normalizePeakStatus(
    day?.normalizedPeakStatus ?? day?.peakStatus ?? day?.peak_marker
  );

  return {
    index,
    S,
    M,
    symbolDetected,
    rawSymbol,
    scoreCore,
    scoreFertil,
    hasChangeBIP,
    reasons,
    entryFlags,
    descriptors: {
      sensation: sensationInfo.descriptor ?? sensationInfo.reason ?? null,
      appearance: appearanceInfo.descriptor ?? appearanceInfo.reason ?? null,
    },
    normalizedPeakStatus,
  };
};

export const normalizeCycleDays = (processedData = []) => {
  if (!Array.isArray(processedData) || processedData.length === 0) {
    return { days: [], bipScore: 0 };
  }

  const candidateScores = [];
  for (let i = 0; i < Math.min(6, processedData.length); i += 1) {
    const entry = processedData[i];
    if (!entry) continue;
    const fertilitySymbol = String(entry?.fertility_symbol || '').toLowerCase();
    if (fertilitySymbol === 'red') {
      continue;
    }
    const sensationInfo = detectSensationLevel(entry?.mucusSensation ?? entry?.mucus_sensation);
    const appearanceInfo = detectAppearanceLevel(entry?.mucusAppearance ?? entry?.mucus_appearance);
    const SScore = SCORE_MAP[ensureLevelBounds(sensationInfo.level)] ?? 0;
    const MScore = SCORE_MAP[ensureLevelBounds(appearanceInfo.level)] ?? 0;
    candidateScores.push(Math.max(SScore, MScore));
  }

  const bipScore = candidateScores.length > 0 ? Math.max(...candidateScores) : 0;

  const days = processedData.map((day, index) =>
    buildNormalizedDay(day, bipScore, index)
  );

  return { days, bipScore };
};

const findAlemanasCandidate = (days) => {
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day) continue;
    if (day.symbolDetected === 'M+' || day.symbolDetected === 'F') {
      return { source: 'Alemanas', day: i + 1, reason: 'M+', kind: 'profile' };
    }
    if (day.M >= 2 || day.S >= 2) {
      return { source: 'Alemanas', day: i + 1, reason: 'S/M>=2', kind: 'profile' };
    }
    if (day.hasChangeBIP) {
      return { source: 'Alemanas', day: i + 1, reason: 'BIP', kind: 'profile' };
    }
  }
  return null;
};

const findOmsCandidate = (days) => {
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day) continue;
    if (day.M >= 2) {
      return { source: 'OMS', day: i + 1, reason: 'M>=2', kind: 'profile' };
    }
    if (day.S >= 2) {
      return { source: 'OMS', day: i + 1, reason: 'S>=2', kind: 'profile' };
    }
    if (day.symbolDetected === 'M+' || day.symbolDetected === 'F') {
      return { source: 'OMS', day: i + 1, reason: 'M+', kind: 'profile' };
    }
    if (day.hasChangeBIP) {
      return { source: 'OMS', day: i + 1, reason: 'BIP', kind: 'profile' };
    }
  }
  return null;
};

const findCreightonCandidate = (days) => {
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day) continue;
    if (day.symbolDetected === 'M+') {
      return { source: 'Creighton', day: i + 1, reason: 'M+', kind: 'profile' };
    }
    if (day.symbolDetected === 'M' || day.M >= 2) {
      return { source: 'Creighton', day: i + 1, reason: 'M>=2', kind: 'profile' };
    }
    if (day.hasChangeBIP) {
      return { source: 'Creighton', day: i + 1, reason: 'BIP', kind: 'profile' };
    }
  }
  return null;
};

const aggregateCandidates = (candidates, mode) => {
  const validCandidates = candidates
    .filter((candidate) => candidate && Number.isFinite(candidate.day))
    .map((candidate) => ({ ...candidate }));

  if (validCandidates.length === 0) {
    return {
      status: 'indeterminado',
      selectedDay: null,
      selectedMode: mode,
      usedCandidates: [],
      notes: ['Sin candidatos disponibles'],
    };
  }

  const sortedCandidates = [...validCandidates].sort((a, b) => {
    const aDay = Number.isFinite(a.day) ? a.day : Number.POSITIVE_INFINITY;
    const bDay = Number.isFinite(b.day) ? b.day : Number.POSITIVE_INFINITY;
    return aDay - bDay;
  });

  const dayNumbers = sortedCandidates.map((candidate) => Math.round(candidate.day));

  let selectedDay = null;
  if (mode === 'permisivo') {
    selectedDay = Math.max(...dayNumbers);
  } else if (mode === 'consenso') {
    const frequency = new Map();
    dayNumbers.forEach((day) => {
      const current = frequency.get(day) ?? 0;
      frequency.set(day, current + 1);
    });
    let maxCount = 0;
    let earliestDay = null;
    frequency.forEach((count, day) => {
      if (count > maxCount || (count === maxCount && (earliestDay == null || day < earliestDay))) {
        maxCount = count;
        earliestDay = day;
      }
    });
    selectedDay = earliestDay;
  } else {
    selectedDay = Math.min(...dayNumbers);
  }

  return {
    status: selectedDay != null ? 'ok' : 'indeterminado',
    selectedDay: selectedDay ?? null,
    selectedMode: mode,
    usedCandidates: sortedCandidates,
    notes: [],
  };
};

export const computeFertilityStartOutput = ({
  processedData = [],
  config = {},
  calculatorCandidates = [],
  context = {},
}) => {
  const {
    methods = { alemanas: true, oms: true, creighton: true },
    calculators = { cpm: true, t8: true },
    postpartum = false,
    combineMode = 'conservador',
  } = config || {};

  const {
    highSequenceIndices = [],
    peakDayIndex = null,
    postPeakStartIndex = null,
    todayIndex = null,
  } = context || {};

  const { days, bipScore } = normalizeCycleDays(processedData);

  const candidates = [];
  const pushCandidate = (candidate) => {
    if (!candidate || !Number.isFinite(candidate.day)) return;
    candidates.push({
      originalSource: candidate.originalSource ?? candidate.source,
      ...candidate,
      kind: candidate.kind ?? 'profile',
    });
  };

  if (methods.alemanas) {
    pushCandidate(findAlemanasCandidate(days));
  }
  if (methods.oms) {
    pushCandidate(findOmsCandidate(days));
  }
  if (methods.creighton) {
    pushCandidate(findCreightonCandidate(days));
  }

  const notes = [];
  if (postpartum) {
    notes.push('Calculadoras CPM/T-8 omitidas por configuración de posparto.');
  }

  if (!postpartum) {
    calculatorCandidates.forEach((candidate) => {
      if (!candidate) return;
      const normalizedSource = typeof candidate.source === 'string'
        ? candidate.source.toUpperCase().replace(/-/g, '')
        : '';
      const include =
        (normalizedSource === 'CPM' && calculators.cpm) ||
        (normalizedSource === 'T8' && calculators.t8);
      if (include) {
        pushCandidate({
          ...candidate,
          source: normalizedSource,
          kind: 'calculator',
        });
      }
    });
  }

  if (!methods.alemanas && !methods.oms && !methods.creighton) {
    notes.push('Ningún perfil sintotérmico seleccionado.');
  }

  const candidatesBeforeAggregate = candidates.map((candidate) => ({ ...candidate }));

  const aggregate = aggregateCandidates(candidates, combineMode);
  aggregate.notes = Array.from(new Set([...(aggregate.notes ?? []), ...notes].filter(Boolean)));

  const clampSelectedDay = (day) => {
    if (!Number.isFinite(day)) return null;
    const bounded = Math.max(1, Math.round(day));
    if (processedData.length > 0) {
      return Math.min(bounded, processedData.length);
    }
    return bounded;
  };

  let selectedDay = Number.isFinite(aggregate.selectedDay)
    ? clampSelectedDay(aggregate.selectedDay)
    : null;
  if (selectedDay != null && selectedDay !== aggregate.selectedDay) {
    const note = `El día calculado (${aggregate.selectedDay}) supera la duración del ciclo. Se usa ${selectedDay}.`;
    aggregate.notes = Array.from(new Set([...(aggregate.notes ?? []), note]));
    aggregate.selectedDay = selectedDay;
  }

  let explicitStartDay = null;
  if (Array.isArray(days) && days.length > 0) {
    const whiteIndex = days.findIndex((day) => day?.rawSymbol === 'white');
    if (whiteIndex >= 0) {
      explicitStartDay = whiteIndex;
    }
  }

  if (Array.isArray(processedData) && processedData.length > 0) {
    for (let idx = 0; idx < processedData.length; idx += 1) {
      const entry = processedData[idx];
      const normalized = normalizePeakStatus(
        entry?.normalizedPeakStatus ?? entry?.peakStatus ?? entry?.peak_marker
      );
      if (normalized === 'P') {
        explicitStartDay = explicitStartDay != null
          ? Math.min(explicitStartDay, idx)
          : idx;
        break;
      }
    }
  }

  if (
    explicitStartDay != null &&
    (selectedDay == null || explicitStartDay + 1 < selectedDay)
  ) {
    const overrideDay = clampSelectedDay(explicitStartDay + 1);
    if (overrideDay != null) {
      aggregate.selectedDay = overrideDay;
      aggregate.selectedMode = 'marcador';
      aggregate.status = 'ok';
      aggregate.notes = Array.from(
        new Set([...(aggregate.notes ?? []), 'Inicio fértil ajustado por marcador explícito.'])
      );
      selectedDay = overrideDay;
    }
  } else {
    selectedDay = aggregate.selectedDay ?? null;
  }

  let fertileStartFinalIndex = null;
  if (selectedDay != null && selectedDay >= 1) {
    fertileStartFinalIndex = selectedDay - 1;
  }

  const lastIndex = days.length > 0 ? days.length - 1 : null;
  const fertileStartIndex =
    Number.isInteger(fertileStartFinalIndex) && fertileStartFinalIndex >= 0
      ? fertileStartFinalIndex
      : null;
  let fertileEndIndex = null;
  if (fertileStartIndex != null && lastIndex != null && lastIndex >= fertileStartIndex) {
    if (Number.isInteger(postPeakStartIndex)) {
      const candidate = Math.max(fertileStartIndex, Math.min(postPeakStartIndex - 1, lastIndex));
      fertileEndIndex = candidate >= fertileStartIndex ? candidate : fertileStartIndex;
    } else {
      fertileEndIndex = lastIndex;
    }
  }

  const highSequenceSet = new Set(
    Array.isArray(highSequenceIndices)
      ? highSequenceIndices
          .map((idx) =>
            Number.isInteger(idx) && idx >= 0 ? Math.min(idx, Math.max(lastIndex ?? 0, 0)) : null
          )
          .filter((idx) => idx != null)
      : []
  );

  const describeScoreLevel = (score) => {
    if (score >= 0.95) return { label: 'Fertilidad muy alta', shortLabel: 'Muy alta' };
    if (score >= 0.8) return { label: 'Fertilidad alta', shortLabel: 'Alta' };
    if (score >= 0.6) return { label: 'Fertilidad media', shortLabel: 'Media' };
    if (score >= 0.4) return { label: 'Fertilidad baja', shortLabel: 'Baja' };
    return { label: 'Fertilidad baja', shortLabel: 'Baja' };
  };

  const getSymbolReason = (symbol) => {
    if (symbol === 'M+') return 'M+';
    if (symbol === 'M') return 'M';
    if (symbol === 'F') return 'FER';
    if (symbol === 'white') return 'white';
    return null;
  };

  const formatPeakDelta = (delta) => {
    if (delta === 0) return 'P';
    if (delta === -1) return 'P−1';
    if (delta === -2) return 'P−2';
    if (delta === 1) return 'P+1';
    if (delta === 2) return 'P+2';
    return null;
  };

  const dailyAssessments = [];
  let previousAssessment = null;

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day) {
      dailyAssessments.push(null);
      continue;
    }

    const baseScore = clamp(day.scoreFertil ?? 0);
    let methodScore = baseScore;

    if (methods.alemanas && day.hasChangeBIP) {
      methodScore = clamp(methodScore + 0.2);
    }
    if (methods.creighton && (day.symbolDetected === 'M' || day.M >= 2)) {
      methodScore = clamp(methodScore + 0.1);
    }

    const isWithinFertile =
      fertileStartIndex != null &&
      fertileEndIndex != null &&
      i >= fertileStartIndex &&
      i <= fertileEndIndex;

    if (!isWithinFertile) {
      dailyAssessments.push(null);
      continue;
    }

    let contextBonus = 0;
    const contextTokens = [];

    if (highSequenceSet.has(i)) {
      contextBonus = Math.max(contextBonus, 0.1);
      contextTokens.push('secuencia alta');
    }

    if (Number.isInteger(peakDayIndex)) {
      const delta = i - peakDayIndex;
      const formatted = formatPeakDelta(delta);
      if (formatted) {
        if (delta === 0 || delta === -1 || delta === -2) {
          contextBonus = Math.max(contextBonus, 0.1);
        } else if (delta === 1 || delta === 2) {
          contextBonus = Math.max(contextBonus, 0.05);
        }
        contextTokens.push(formatted);
      }
    }

    const contextAdjustedScore = clamp(methodScore + contextBonus);

    let finalScore = contextAdjustedScore;
    const hasRecord = Boolean(day.entryFlags?.hasAny);

    let symbolReason = getSymbolReason(day.symbolDetected);
    let appearanceReason = day.descriptors?.appearance ?? null;
    let sensationReason = day.descriptors?.sensation ?? null;
    let inherited = false;

    const combinedContext = [...contextTokens];

    if (day.hasChangeBIP) {
      combinedContext.push('BIP');
    }

    if (!hasRecord) {
      inherited = true;
      const prev = previousAssessment && previousAssessment.isFertile ? previousAssessment : null;
      if (prev) {
        finalScore = clamp(Math.max(prev.score - 0.05, 0.4));
        symbolReason = symbolReason ?? prev.reasonParts?.symbol ?? null;
        appearanceReason = appearanceReason ?? prev.reasonParts?.appearance ?? null;
        sensationReason = sensationReason ?? prev.reasonParts?.sensation ?? null;
        combinedContext.push(...(prev.reasonParts?.context ?? []), 'sin registro');
      } else {
        finalScore = Math.max(0.4, finalScore || 0);
        combinedContext.push('sin registro');
      }
    } else {
      finalScore = Math.max(0.4, finalScore);
    }

    const levelInfo = describeScoreLevel(finalScore);

    const mainBlocks = [];
    if (symbolReason) {
      mainBlocks.push(symbolReason);
    }

    const textureParts = [];
    if (appearanceReason) {
      textureParts.push(appearanceReason);
    }
    if (sensationReason) {
      textureParts.push(sensationReason);
    }

    if (textureParts.length === 2) {
      mainBlocks.push(`${textureParts[0]} y ${textureParts[1]}`);
    } else if (textureParts.length === 1) {
      mainBlocks.push(textureParts[0]);
    }

    if (symbolReason === 'white' && mainBlocks.length === 1) {
      mainBlocks[0] = 'white sin otros signos';
    }

    const distinctContext = Array.from(new Set(combinedContext.filter(Boolean)));
    const summarySections = [];
    if (mainBlocks.length) {
      summarySections.push(mainBlocks.join(', '));
    }
    if (distinctContext.length) {
      summarySections.push(distinctContext.join(', '));
    }

    const summaryText = `${levelInfo.shortLabel}${summarySections.length ? ` (${summarySections.join('; ')})` : ''}`;

    const assessment = {
      index: i,
      score: finalScore,
      label: levelInfo.label,
      shortLabel: levelInfo.shortLabel,
      summaryText,
      isFertile: true,
      hasRecord,
      inherited,
      reasonParts: {
        symbol: symbolReason,
        appearance: appearanceReason,
        sensation: sensationReason,
        context: distinctContext,
      },
      scoreDetails: {
        base: baseScore,
        methodAdjusted: methodScore,
        contextAdjusted: contextAdjustedScore,
        contextBonus,
      },
    };

    dailyAssessments.push(assessment);
    previousAssessment = assessment;
  }

  let currentAssessment = null;
  if (Number.isInteger(todayIndex)) {
    for (let idx = Math.min(Math.max(todayIndex, 0), dailyAssessments.length - 1); idx >= 0; idx -= 1) {
      const candidate = dailyAssessments[idx];
      if (candidate && candidate.isFertile) {
        currentAssessment = candidate;
        break;
      }
    }
  }
  const debug = {
    bipScore,
    explicitStartDay,
    candidatesBeforeAggregate,
  };

  return {
    fertileStartFinalIndex,
    fertileWindow:
      fertileStartIndex != null && fertileEndIndex != null
        ? { startIndex: fertileStartIndex, endIndex: fertileEndIndex }
        : null,
    dailyAssessments,
    currentAssessment,
    candidates: candidatesBeforeAggregate,
    aggregate,
    debug,
  };
};

const parseDate = (isoDate) => {
  if (!isoDate) return null;
  try {
    const parsed = new Date(isoDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    return null;
  }
};

export const computeCpmCandidateFromCycles = (cycles = []) => {
  if (!Array.isArray(cycles) || cycles.length === 0) {
    return null;
  }

  const completed = cycles
    .map((cycle) => {
      if (!cycle?.startDate || !cycle?.endDate) return null;
      const start = parseDate(cycle.startDate);
      const end = parseDate(cycle.endDate);
      if (!start || !end || end < start) return null;
      const duration = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (!Number.isFinite(duration) || duration <= 0) return null;
      const ignored = Boolean(cycle?.ignoredForAutoCalculations);
      return {
        duration,
        ignored,
      };
    })
    .filter(Boolean);

  const included = completed.filter((cycle) => !cycle.ignored);
  if (included.length < 6) {
    return null;
  }

  const shortest = included.reduce((min, current) =>
    current.duration < min.duration ? current : min
  );

  const deduction = included.length >= 12 ? 20 : 21;
  const rawDay = shortest.duration - deduction;
  if (!Number.isFinite(rawDay)) {
    return null;
  }

  return {
    source: 'CPM',
    day: Math.max(1, Math.round(rawDay)),
    reason: `ciclo_mas_corto=${shortest.duration}`,
    kind: 'calculator',
  };
};

const normalizeTemperatureValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveEntryTemperature = (entry) => {
  const directSources = [
    entry?.temperature_chart,
    entry?.temperature_raw,
    entry?.temperature_corrected,
  ];

  for (const candidate of directSources) {
    const normalized = normalizeTemperatureValue(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  if (Array.isArray(entry?.measurements)) {
    const findTemp = (measurement) => {
      if (!measurement) return null;
      const raw = normalizeTemperatureValue(measurement.temperature);
      const corrected = normalizeTemperatureValue(measurement.temperature_corrected);
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

    const selected = entry.measurements.find(
      (measurement) => measurement && measurement.selected && findTemp(measurement) !== null
    );
    const fallback = selected || entry.measurements.find((measurement) => findTemp(measurement) !== null);
    if (fallback) {
      const temp = findTemp(fallback);
      if (temp !== null) {
        return temp;
      }
    }
  }

  return null;
};

export const computeT8CandidateFromCycles = (cycles = [], computeOvulationMetricsFn) => {
  if (!Array.isArray(cycles) || cycles.length === 0 || typeof computeOvulationMetricsFn !== 'function') {
    return null;
  }

  const considered = [];
  const included = [];

  cycles.forEach((cycle) => {
    if (!cycle?.data || !Array.isArray(cycle.data)) return;
    if (!cycle.startDate) return;

    const processedEntries = cycle.data
      .filter((entry) => entry && entry.isoDate)
      .map((entry) => ({
        ...entry,
        displayTemperature: resolveEntryTemperature(entry),
      }));

    if (processedEntries.length === 0) return;

    const { ovulationDetails } = computeOvulationMetricsFn(processedEntries);
    if (!ovulationDetails?.confirmed) return;

    const ovulationIndex = Number.isInteger(ovulationDetails?.ovulationIndex)
      ? ovulationDetails.ovulationIndex
      : Number.isInteger(ovulationDetails?.confirmationIndex)
        ? ovulationDetails.confirmationIndex
        : null;

    if (ovulationIndex == null || ovulationIndex < 0 || ovulationIndex >= processedEntries.length) {
      return;
    }

    const ovulationEntry = processedEntries[ovulationIndex];
    const riseDay = Number(ovulationEntry?.cycleDay);
    if (!Number.isFinite(riseDay) || riseDay <= 0) {
      return;
    }

    const t8Day = Math.max(1, Math.round(riseDay - 8));
    const cycleInfo = {
      riseDay,
      t8Day,
      ignored: Boolean(cycle?.ignoredForAutoCalculations),
    };

    considered.push(cycleInfo);
    if (!cycleInfo.ignored && included.length < 12) {
      included.push(cycleInfo);
    }
  });

  if (included.length < 6) {
    return null;
  }

  const earliest = included.reduce((earliestCycle, current) =>
    current.t8Day < earliestCycle.t8Day ? current : earliestCycle
  );

  return {
    source: 'T8',
    day: Math.max(1, Math.round(earliest.t8Day)),
    reason: `t8=${earliest.t8Day}`,
    kind: 'calculator',
  };
};

export { SYMBOL_FLOOR };