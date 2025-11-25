import { differenceInCalendarDays, format, parseISO } from 'date-fns';

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
  { patterns: ['empapad\\w*'], level: 2, descriptor: 'empapada' },
  { patterns: ['mojad\\w*'], level: 2, descriptor: 'mojada' },
  {
    patterns: ['resbalad\\w*', 'desliz\\w*'],
    level: 2,
    descriptor: 'resbaladiza',
  },
  { patterns: ['resbalos\\w*'], level: 2, descriptor: 'resbalosa' },
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

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const detectSymbol = ({ appearance, observations, fertilitySymbol }) => {
  const sources = [appearance, observations, fertilitySymbol].map((value) =>
    String(value || '').toUpperCase()
  );

  const matchesToken = (token) => {
    if (!token) return false;
    const escapedToken = escapeRegex(token);
    const boundaryPattern = `(?:^|[^\\p{L}\\p{N}])${escapedToken}(?=$|[^\\p{L}\\p{N}])`;
    const regex = new RegExp(boundaryPattern, 'u');
    return sources.some((text) => regex.test(text));
  };

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
    peakDayIndex = null,
    postPeakStartIndex = null,
    peakThirdDayIndex = null,
    temperatureInfertileStartIndex = null,
    temperatureConfirmationIndex = null,
    temperatureRule = null,
    todayIndex = null,
  } = context || {};

  const { days, bipScore } = normalizeCycleDays(processedData);

  const totalDays = Array.isArray(days) ? days.length : 0;
  const isValidIndex = (idx) =>
    Number.isInteger(idx) && idx >= 0 && idx < totalDays;

  const findLastStatusIndex = (status) => {
    if (!status || totalDays === 0) return null;
    for (let idx = totalDays - 1; idx >= 0; idx -= 1) {
      if (days[idx]?.normalizedPeakStatus === status) {
        return idx;
      }
    }
    return null;
  };

  let effectivePeakIndex = isValidIndex(peakDayIndex) ? peakDayIndex : null;

  if (effectivePeakIndex == null) {
    const explicitPeakIndex = findLastStatusIndex('P');
    if (isValidIndex(explicitPeakIndex)) {
      effectivePeakIndex = explicitPeakIndex;
    }
  }

  if (effectivePeakIndex == null) {
    const inferenceOffsets = [
      { status: '1', offset: 1 },
      { status: '2', offset: 2 },
      { status: '3', offset: 3 },
    ];
    for (const { status, offset } of inferenceOffsets) {
      const statusIndex = findLastStatusIndex(status);
      if (statusIndex == null) continue;
      const candidate = statusIndex - offset;
      if (isValidIndex(candidate)) {
        effectivePeakIndex = candidate;
        break;
      }
    }
  }

  if (effectivePeakIndex == null && totalDays > 0) {
    let bestIndex = null;
    let bestScore = -Infinity;
    for (let idx = 0; idx < totalDays; idx += 1) {
      const day = days[idx];
      if (!day) continue;
      const score = Number.isFinite(day.scoreFertil) ? day.scoreFertil : null;
      if (score == null) continue;
      if (
        score > bestScore ||
        (score === bestScore && (bestIndex == null || idx > bestIndex))
      ) {
        bestScore = score;
        bestIndex = idx;
      }
    }
    if (bestIndex != null) {
      effectivePeakIndex = bestIndex;
    }
  }

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
      } else if (isValidIndex(effectivePeakIndex)) {
      const peakBound = Math.min(lastIndex, effectivePeakIndex + 2);
      const candidate = Math.max(fertileStartIndex, peakBound);
      fertileEndIndex = candidate >= fertileStartIndex ? candidate : fertileStartIndex;
    } else {
      fertileEndIndex = lastIndex;
    }
  }

  const formatPeakDelta = (delta) => {
    if (delta === 0) return 'P';
    if (delta === -1) return 'P−1';
    if (delta === -2) return 'P−2';
    if (delta === 1) return 'P+1';
    if (delta === 2) return 'P+2';
    return null;
  };

  const clampIndexWithin = (idx) => {
    if (!Number.isInteger(idx)) return null;
    if (lastIndex == null || lastIndex < 0) return idx >= 0 ? idx : null;
    if (idx < 0) return null;
    if (idx > lastIndex) return lastIndex;
    return idx;
  };

  const parseEntryDate = (idx) => {
    if (!Number.isInteger(idx)) return null;
    if (idx < 0 || idx >= processedData.length) return null;
    const iso = processedData[idx]?.isoDate;
    if (!iso) return null;
    try {
      const parsed = parseISO(iso);
      return Number.isNaN(parsed?.getTime?.()) ? null : parsed;
    } catch (error) {
      return null;
    }
  };

  const formatDateLabel = (idx) => {
    const date = parseEntryDate(idx);
    if (!date) return null;
    try {
      return format(date, 'dd/MM');
    } catch (error) {
      return null;
    }
  };

  const findStatusIndex = (status) => {
    if (!status) return null;
    for (let idx = 0; idx < days.length; idx += 1) {
      if (days[idx]?.normalizedPeakStatus === status) {
        return idx;
      }
    }
    return null;
  };

  let pPlus3Index = findStatusIndex('3');
  if (pPlus3Index == null && Number.isInteger(peakThirdDayIndex)) {
    pPlus3Index = clampIndexWithin(peakThirdDayIndex);
  }
  if (pPlus3Index == null && Number.isInteger(postPeakStartIndex)) {
    pPlus3Index = clampIndexWithin(postPeakStartIndex - 1);
  }

    let pPlus4Index = null;
  if (pPlus3Index != null) {
    const candidate = clampIndexWithin(pPlus3Index + 1);
    if (candidate != null) {
      pPlus4Index = candidate;
    }
      }

  const peakIndexForDiff = clampIndexWithin(effectivePeakIndex);
  const peakDate = parseEntryDate(peakIndexForDiff);
  if (peakDate) {
    for (let idx = peakIndexForDiff + 1; idx < processedData.length; idx += 1) {
      const currentDate = parseEntryDate(idx);
      if (!currentDate) continue;
      const diff = differenceInCalendarDays(currentDate, peakDate);
      if (pPlus3Index == null && diff >= 3) {
        pPlus3Index = clampIndexWithin(idx);
      }
      if (pPlus4Index == null && diff >= 4) {
        pPlus4Index = clampIndexWithin(idx);
      }
      if (pPlus3Index != null && pPlus4Index != null) {
        break;
      }
    }

  }

  const temperatureConfirmationIdx = clampIndexWithin(temperatureConfirmationIndex);
  const temperatureInfertileIdx = clampIndexWithin(temperatureInfertileStartIndex);
  let tPlus3Index = temperatureConfirmationIdx;
  if (tPlus3Index == null && temperatureInfertileIdx != null) {
    const candidate = clampIndexWithin(temperatureInfertileIdx - 1);
    if (candidate != null && candidate >= 0) tPlus3Index = candidate;
  }
  if (pPlus4Index == null && pPlus3Index != null) {
    const candidate = clampIndexWithin(pPlus3Index + 1);
    if (candidate != null) pPlus4Index = candidate;
  }

  const waitingStartIndex = pPlus3Index != null ? pPlus3Index : null;

  const mucusInfertileStartIndex = pPlus4Index ?? pPlus3Index ?? null;

  let postOvulatoryStartIndex = null;
  if (mucusInfertileStartIndex != null && temperatureInfertileIdx != null) {
    postOvulatoryStartIndex = Math.min(mucusInfertileStartIndex, temperatureInfertileIdx);
  } else if (mucusInfertileStartIndex != null) {
    postOvulatoryStartIndex = mucusInfertileStartIndex;
  } else if (temperatureInfertileIdx != null) {
    postOvulatoryStartIndex = temperatureInfertileIdx;
  }

  let closureAlemanIndex = null;
  if (pPlus3Index != null && tPlus3Index != null) {
    closureAlemanIndex = Math.max(pPlus3Index, tPlus3Index);
  }

    let closureOmsIndex = null;
  if (pPlus4Index != null && tPlus3Index != null) {
    closureOmsIndex = Math.max(pPlus4Index, tPlus3Index);
  }

  let closureDetail = null;
  let closureIndex = null;
  if (closureAlemanIndex != null || closureOmsIndex != null) {
    const alemanCandidate = closureAlemanIndex != null ? closureAlemanIndex : Number.NEGATIVE_INFINITY;
    const omsCandidate = closureOmsIndex != null ? closureOmsIndex : Number.NEGATIVE_INFINITY;
    closureIndex = Math.max(alemanCandidate, omsCandidate);
    if (closureOmsIndex != null && (closureAlemanIndex == null || closureOmsIndex >= closureAlemanIndex)) {
      closureDetail = 'P+4 y T+3 (OMS)';
    } else if (closureAlemanIndex != null) {
      closureDetail = 'P+3 y T+3 (Alemanes)';
    }
    }

    if (closureIndex != null && fertileStartIndex != null) {
    const boundedClosure = clampIndexWithin(closureIndex);
    if (boundedClosure != null) {
      fertileEndIndex = Math.max(fertileStartIndex, boundedClosure);
    }
    }

    const windowEndIndex = fertileEndIndex != null
    ? fertileEndIndex
    : lastIndex != null
      ? lastIndex
      : null;

  const PROFILE_LABELS = {
    conservador: 'modo conservador',
    consenso: 'modo consenso',
    permisivo: 'modo permisivo',
    marcador: 'marcador explícito',
  };

  const profileMode = aggregate?.selectedMode ?? combineMode ?? 'conservador';
  const usedCandidates = aggregate?.usedCandidates ?? [];
  const hasProfileSource = usedCandidates.some((candidate) => candidate?.kind === 'profile');
  const hasCalculatorSource = usedCandidates.some((candidate) => candidate?.kind === 'calculator');
  const hasMucusObservations = days.some(
    (day) => day?.entryFlags?.hasAppearance || day?.entryFlags?.hasSensation || day?.symbolDetected
  );

  let fertileHeaderText = `Fase fértil abierta (perfil: ${PROFILE_LABELS[profileMode] ?? profileMode}).`;
  if (profileMode === 'marcador') {
    fertileHeaderText = 'Fase fértil abierta (ajustada por tus marcadores).';
  } else if (hasProfileSource && hasMucusObservations) {
    fertileHeaderText = 'Fase fértil abierta (basada en tus observaciones de moco).';
  } else if (hasCalculatorSource && !hasProfileSource) {
    fertileHeaderText = 'Inicio fértil estimado por calculadora (según tus ciclos anteriores).';
  }

  const infertileTitleAbsolute = 'Fase de infertilidad absoluta confirmada(postovulatoria)';
  const infertileDetailText = closureDetail ?? 'criterio indeterminado';
  const infertileBodyAbsolute = `Ventana cerrada por doble criterio: ${infertileDetailText}.`;
  const referencePeakIndex = clampIndexWithin(effectivePeakIndex);

  const hasMucusClosure = pPlus3Index != null || pPlus4Index != null;
  const hasTemperatureClosure = tPlus3Index != null;
  const hasAbsoluteClosure = hasMucusClosure && hasTemperatureClosure;

  const peakDateLabel = formatDateLabel(referencePeakIndex);
  const temperatureDateLabel = formatDateLabel(tPlus3Index);
  const infertileTitleMucus = 'Fase de infertilidad postovulatoria (método moco)';
  const infertileBodyMucus = peakDateLabel
    ? `Fase de infertilidad alcanzada por determinación de día pico el ${peakDateLabel}.`
    : 'Fase de infertilidad alcanzada por determinación de día pico.';
  const infertileTitleTemperature = 'Ovulación confirmada por temperatura';
  const infertileBodyTemperature = temperatureDateLabel
    ? `Ovulación confirmada por temperatura el ${temperatureDateLabel}. La fase de infertilidad absoluta está pendiente de determinar día pico (si se registra).`
    : 'Ovulación confirmada por temperatura. La fase de infertilidad absoluta está pendiente de determinar día pico (si se registra).';

  const dailyAssessments = new Array(days.length).fill(null);
  let lastRecordedLevel = null;
  let gapCount = 0;
  let lastStrongIndex = null;
  const stateOrder = { inicio: 0, aumento: 1, alta: 2, muyAlta: 3 };

  const buildReasonsList = (day) => {
    if (!day) return [];
    const reasons = [];
    if (Number.isFinite(day.M) && day.M > 0) {
      const descriptor = day.descriptors?.appearance;
      reasons.push(`M${day.M}${descriptor ? ` (${descriptor})` : ''}`);
    }
    if (Number.isFinite(day.S) && day.S > 0) {
      const descriptor = day.descriptors?.sensation;
      reasons.push(`S${day.S}${descriptor ? ` (${descriptor})` : ''}`);
    }
    if (day.symbolDetected && day.symbolDetected !== 'none') {
      if (day.symbolDetected === 'white') {
        reasons.push('white');
      } else {
        reasons.push(`símbolo ${day.symbolDetected}`);
      }
    }

    if (day.hasChangeBIP) {
      reasons.push('cambio BIP');
    }
    return reasons;
      };
    const levelStateMap = ['inicio', 'aumento', 'alta', 'muyAlta'];

    for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (!day) {
      dailyAssessments[i] = null;
      continue;
    }

    const isWithinPostOvulatory = Number.isInteger(postOvulatoryStartIndex)
      ? i >= postOvulatoryStartIndex
      : false;
    const isWithinFertile =
      fertileStartIndex != null &&
      windowEndIndex != null &&
      i >= fertileStartIndex &&
      i <= windowEndIndex &&
      !isWithinPostOvulatory;
    const isFutureDay = Number.isInteger(todayIndex) && todayIndex != null ? i > todayIndex : false;

    if (!isWithinFertile) {
      gapCount = 0;
      lastRecordedLevel = null;

      const shouldRenderPostPhase =
        isWithinPostOvulatory || (windowEndIndex != null && i > windowEndIndex);

      if (shouldRenderPostPhase) {
        if (!hasMucusClosure && !hasTemperatureClosure && postOvulatoryStartIndex == null) {
          dailyAssessments[i] = null;
          continue;
        }

        const hasRecord = Boolean(day.entryFlags?.hasAny);
        const note = !hasRecord ? 'Sin registro hoy; estimación basada en días adyacentes.' : null;
        let infertileTitle = infertileTitleAbsolute;
        let infertileBody = infertileBodyAbsolute;
        let infertileStatus = 'absolute';

        if (!hasAbsoluteClosure && hasMucusClosure) {
          infertileTitle = infertileTitleMucus;
          infertileBody = infertileBodyMucus;
          infertileStatus = 'mucus';
        } else if (!hasAbsoluteClosure && hasTemperatureClosure) {
          infertileTitle = infertileTitleTemperature;
          infertileBody = infertileBodyTemperature;
          infertileStatus = 'temperature';
        }

        dailyAssessments[i] = {
          index: i,
          state: 'infertil',
          status: infertileStatus,
          title: infertileTitle,
          header: infertileTitle,
          body: infertileBody,
          detail: closureDetail,
          hasRecord,
          inherited: false,
          note,
          isFertile: false,
          phase: 'postOvulatory',
          label: infertileTitle,
          summaryText: infertileBody,
          reasonsList: [],
          reasonsText: '',
          showFertilityStatus: !isFutureDay,
        };
      }
      continue;
    }

    const hasRecord = Boolean(day.entryFlags?.hasAny);

    let rawLevel = 0;
    if (
      day.normalizedPeakStatus === 'P' ||
      day.symbolDetected === 'M+' ||
      day.symbolDetected === 'F' ||
      day.S >= 3 ||
      day.M >= 3
    ) {
      rawLevel = 3;
    } else if (day.M >= 2 || day.S >= 2 || day.symbolDetected === 'M') {
      rawLevel = 2;
    } else if (day.M >= 1 || day.S >= 1 || day.hasChangeBIP) {
      rawLevel = 1;
    }

    if (hasRecord) {
      gapCount = 0;
      lastRecordedLevel = rawLevel;
    } else {
      gapCount += 1;
    }
    const strongSigns =
      day.M >= 2 || day.symbolDetected === 'M+' || day.symbolDetected === 'F' || day.S >= 3;

    const isWaitingCandidate =
      waitingStartIndex != null &&
      i >= waitingStartIndex &&
      (tPlus3Index == null || i <= tPlus3Index);

    let effectiveLevel = rawLevel;
    let state = null;

    if (isWaitingCandidate && !strongSigns) {
      state = 'waiting';
    } else {
      if (!hasRecord) {
        const baseLevel = lastRecordedLevel != null ? lastRecordedLevel : rawLevel;
        const degradeSteps = Math.floor(gapCount / 2);
        effectiveLevel = Math.max(0, baseLevel - degradeSteps);
      }
      const levelIndex = Math.max(0, Math.min(3, effectiveLevel));
      state = levelStateMap[levelIndex];
    }

    const reasonsList = buildReasonsList(day);
    const reasonsText = reasonsList.join('; ');
    const deltaFromPeak = referencePeakIndex != null ? i - referencePeakIndex : null;
    const deltaLabel = deltaFromPeak != null ? formatPeakDelta(deltaFromPeak) : null;
    const note = !hasRecord ? 'Sin registro hoy; estimación basada en días adyacentes.' : null;

    if (state !== 'waiting') {
      if (deltaFromPeak === 0 || deltaFromPeak === 1 || deltaFromPeak === 2) {
        state = 'muyAlta';
        effectiveLevel = Math.max(effectiveLevel, 3);
      } else if (deltaFromPeak === 3) {
        if (stateOrder[state] < stateOrder.alta) {
          state = 'alta';
        }
        effectiveLevel = Math.max(effectiveLevel, 2);
      } else if (lastStrongIndex != null && i - lastStrongIndex <= 3) {
        if (stateOrder[state] < stateOrder.aumento) {
          state = 'aumento';
        }
        effectiveLevel = Math.max(effectiveLevel, 1);
      }
    }

    if (state === 'alta' || state === 'muyAlta' || strongSigns) {
      lastStrongIndex = i;
    }

    let title;
    let body;

    switch (state) {
      case 'waiting':
        title = 'Fertilidad en espera de confirmación por temperatura';
        body = 'Final de moco alcanzado (≥P+3). Ventana mantenida hasta confirmación térmica (T+3).';
        break;
      case 'aumento':
        title = 'Aumento de fertilidad';
        body = reasonsText ? `Signos en aumento: ${reasonsText}.` : 'Signos en aumento.';
        break;
      case 'alta':
        title = 'Fertilidad alta';
        body = reasonsText ? `Signos fértiles claros (${reasonsText}).` : 'Signos fértiles claros.';
        break;
      case 'muyAlta': {
        title = 'Fertilidad muy alta';
        const deltaSuffix = deltaLabel ? ` (${deltaLabel})` : '';
        body = `Día de máxima fertilidad${deltaSuffix}.`;
        body += reasonsText ? ` Signos pico: ${reasonsText}.` : ' Signos pico presentes.';
        break;
      }
      case 'inicio':
      default:
        title = 'Ventana fértil abierta';
        body = 'Hoy sin signos destacables, a la espera de registrar más datos.';
        break;
    }

    if (!hasRecord) {
      if (state === 'alta') {
        title = 'Fertilidad estimada alta';
        body = `${body} Sin datos apuntados este día; se estima en base a días cercanos.`;
      } else if (state === 'muyAlta') {
        title = 'Fertilidad estimada muy alta';
        body = `${body} Sin datos apuntados este día; se estima en base a días cercanos.`;
      } else if (state === 'aumento' || state === 'inicio') {
        title = 'Ventana fértil abierta (sin registro hoy)';
        body = `${body} Sin datos apuntados este día; se estima en base a días cercanos.`;
      }
    }

    const assessment = {
      index: i,
      state,
      level: state === 'waiting' ? rawLevel : effectiveLevel,
      title,
      header: fertileHeaderText,
      body,
      reasonsList,
      reasonsText,
      hasRecord,
      inherited: !hasRecord,
      note,
      isFertile: true,
      phase: 'fertile',
      label: title,
      summaryText: body,
      delta: deltaLabel,
      showFertilityStatus: !isFutureDay,
      reasonParts: {
        symbol: day.symbolDetected ?? null,
        appearance: day.descriptors?.appearance ?? null,
        sensation: day.descriptors?.sensation ?? null,
      },
    };

    dailyAssessments[i] = assessment;
  }

  if (windowEndIndex != null) {
    fertileEndIndex = windowEndIndex;
  }

  let currentAssessment = null;
  if (Number.isInteger(todayIndex) && dailyAssessments.length > 0) {
    const startIdx = Math.min(Math.max(todayIndex, 0), dailyAssessments.length - 1);
    let fallbackAssessment = null;
    for (let idx = startIdx; idx >= 0; idx -= 1) {
      const candidate = dailyAssessments[idx];
      if (!candidate) continue;
      if (!fallbackAssessment) {
        fallbackAssessment = candidate;
      }
      if (candidate.isFertile) {
        currentAssessment = candidate;
        break;
      }
    }
    if (!currentAssessment && fallbackAssessment) {
      currentAssessment = fallbackAssessment;
    }
  }
  const debug = {
    bipScore,
    explicitStartDay,
    effectivePeakIndex,
    candidatesBeforeAggregate,
    closureDetail,
    waitingStartIndex,
    pPlus3Index,
    pPlus4Index,
    temperatureConfirmationIndex: tPlus3Index,
    temperatureInfertileIndex: temperatureInfertileIdx,
    temperatureRule: temperatureRule ?? null,
    mucusInfertileStartIndex,
    postOvulatoryStartIndex,
  };

  return {
    fertileStartFinalIndex,
    fertileWindow:
      fertileStartIndex != null && fertileEndIndex != null
        ? {
            startIndex: fertileStartIndex,
            endIndex: fertileEndIndex,
            waitingStartIndex,
            closureDetail,
            temperatureConfirmationIndex: tPlus3Index,
            temperatureInfertileStartIndex: temperatureInfertileIdx,
            mucusInfertileStartIndex,
            postOvulatoryStartIndex,
            temperatureRule: temperatureRule ?? null,
          }
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