const normalizeSource = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-_\s]/g, '');

const isInteger = (value) => Number.isInteger(value);

const asArray = (value) => (Array.isArray(value) ? value : []);

const compact = (items) => items.filter((item) => item != null && item !== '');

const callFormatDate = (formatDateFromIndex, index) => {
  if (!isInteger(index) || typeof formatDateFromIndex !== 'function') return null;
  const label = formatDateFromIndex(index);
  return typeof label === 'string' && label.trim() && label !== '\u2014' ? label : null;
};

const getWindow = (reasons = {}) =>
  reasons?.window ?? reasons?.fertileWindow ?? reasons?.details?.fertileWindow ?? null;

const getDetails = (reasons = {}) => reasons?.details ?? {};

const getUsedCandidates = (reasons = {}) =>
  asArray(reasons?.aggregate?.usedCandidates ?? reasons?.details?.aggregate?.usedCandidates);

const getCalculatorCandidate = (reasons = {}, source) => {
  const normalizedSource = normalizeSource(source);
  return getUsedCandidates(reasons).find((candidate) => {
    const candidateSource = normalizeSource(candidate?.source ?? candidate?.originalSource);
    return candidateSource === normalizedSource;
  });
};

const findSelectedCandidate = ({ reasons = {}, startIndex = null }) => {
  const usedCandidates = getUsedCandidates(reasons);
  if (usedCandidates.length === 0) return null;
  const dayNumber = isInteger(startIndex) ? startIndex + 1 : null;
  if (dayNumber != null) {
    const byDay = usedCandidates.find(
      (candidate) => Number.isFinite(candidate?.day) && Math.round(candidate.day) === dayNumber
    );
    if (byDay) return byDay;
  }
  return usedCandidates[0] ?? null;
};

const getManualStart = (info) => {
  const reasons = info?.reasons ?? {};
  return (
    info?.source === 'manual' ||
    reasons?.source === 'manual' ||
    reasons?.fertileStartOverride?.mode === 'manual' ||
    reasons?.details?.fertileStartOverride?.mode === 'manual' ||
    info?.status === 'manual' ||
    info?.status === 'manual-boundary'
  );
};

const getCandidateCriterion = (candidate) => {
  const source = normalizeSource(candidate?.source ?? candidate?.originalSource);
  if (source === 'CPM') return 'cpm';
  if (source === 'T8') return 't8';

  const reason = String(candidate?.reason ?? candidate?.descriptor ?? '').toLowerCase();
  if (reason === 'p' || reason.includes('peak') || reason.includes('pico')) return 'peak';
  if (reason.includes('white') || reason.includes('blanco')) return 'whiteSymbol';
  if (reason.includes('m+') || reason.includes('mayor') || reason === 'f') return 'highMucus';
  if (reason === 'm' || reason.includes('moco')) return 'mucus';
  if (reason.includes('s/m') || reason.includes('sens') || reason.includes('bip')) return 'mucusSign';
  return null;
};

const getOpeningCriterion = (info) => {
  if (getManualStart(info)) return 'manual';
  const reasons = info?.reasons ?? {};
  const source = normalizeSource(info?.source ?? reasons?.source);
  if (source === 'CPM') return 'cpm';
  if (source === 'T8') return 't8';
  if (source === 'MARKER') return 'whiteSymbol';
  if (source === 'MUCUS') return 'mucus';

  const candidateCriterion = getCandidateCriterion(
    findSelectedCandidate({ reasons, startIndex: info?.startIndex ?? reasons?.startIndex })
  );
  if (candidateCriterion) return candidateCriterion;

  const text = `${info?.message ?? ''} ${info?.label ?? ''}`.toLowerCase();
  if (text.includes('cpm')) return 'cpm';
  if (text.includes('t-8') || text.includes('t8')) return 't8';
  if (text.includes('pico')) return 'peak';
  if (text.includes('moco de mayor') || text.includes('m+')) return 'highMucus';
  if (text.includes('moco')) return 'mucus';
  if (text.includes('simbolo') || text.includes('s\u00edmbolo') || text.includes('signo')) {
    return 'whiteSymbol';
  }
  return null;
};

const getClosureInfo = (reasons = {}) => {
  const fertileWindow = getWindow(reasons);
  const details = getDetails(reasons);
  const temperature = reasons?.temperature ?? {};
  const mucus = reasons?.mucus ?? {};

  const mucusIndex = isInteger(fertileWindow?.mucusInfertileStartIndex)
    ? fertileWindow.mucusInfertileStartIndex
    : isInteger(details?.mucusInfertileStartIndex)
      ? details.mucusInfertileStartIndex
      : isInteger(mucus?.mucusInfertileStartIndex)
        ? mucus.mucusInfertileStartIndex
        : isInteger(mucus?.startIndex)
          ? mucus.startIndex
          : null;

  const temperatureIndex = isInteger(fertileWindow?.temperatureInfertileStartIndex)
    ? fertileWindow.temperatureInfertileStartIndex
    : isInteger(details?.temperatureInfertileIndex)
      ? details.temperatureInfertileIndex
      : isInteger(details?.temperatureInfertileStartIndex)
        ? details.temperatureInfertileStartIndex
        : isInteger(temperature?.temperatureInfertileStartIndex)
          ? temperature.temperatureInfertileStartIndex
          : isInteger(temperature?.startIndex)
            ? temperature.startIndex
            : null;

  const postIndex = isInteger(fertileWindow?.postOvulatoryStartIndex)
    ? fertileWindow.postOvulatoryStartIndex
    : isInteger(details?.postOvulatoryStartIndex)
      ? details.postOvulatoryStartIndex
      : null;

  const temperatureRule = getTemperatureRule(reasons);

  const temperatureConfirmationIndex = isInteger(fertileWindow?.temperatureConfirmationIndex)
    ? fertileWindow.temperatureConfirmationIndex
    : isInteger(details?.temperatureConfirmationIndex)
      ? details.temperatureConfirmationIndex
      : isInteger(temperature?.confirmationIndex)
        ? temperature.confirmationIndex
        : null;

  return {
    hasMucusClosure: isInteger(mucusIndex),
    hasTemperatureClosure: isInteger(temperatureIndex),
    mucusIndex,
    temperatureIndex,
    postIndex,
    temperatureRule,
    temperatureConfirmationIndex,
  };
};

const getTemperatureRule = (reasons = {}) => {
  const fertileWindow = getWindow(reasons);
  const details = getDetails(reasons);
  const temperature = reasons?.temperature ?? {};
  return (
    fertileWindow?.temperatureRule ??
    reasons?.fertileWindow?.temperatureRule ??
    details?.temperatureRule ??
    temperature?.rule ??
    temperature?.temperatureRule ??
    null
  );
};

const getPeakIndex = (reasons = {}) => {
  const mucus = reasons?.mucus ?? {};
  const details = getDetails(reasons);
  const candidates = [
    mucus?.peakDayIndex,
    mucus?.peakIndex,
    details?.effectivePeakIndex,
    details?.contextPeakIndex,
    details?.peakDayIndex,
    details?.peakIndex,
    details?.ovulationDetails?.peakDayIndex,
  ];
  return candidates.find((value) => isInteger(value)) ?? null;
};

const getPeakText = (reasons, formatDateFromIndex) => {
  const peakIndex = getPeakIndex(reasons);
  const peakDate = callFormatDate(formatDateFromIndex, peakIndex);
  return peakDate ? `el ${peakDate}` : 'el dia pico registrado';
};

const getPeakDetectionText = (reasons, formatDateFromIndex) => {
  const peakIndex = getPeakIndex(reasons);
  const peakDate = callFormatDate(formatDateFromIndex, peakIndex);
  return peakDate
    ? `Se ha identificado un dia pico marcado por la usuaria: el ${peakDate}.`
    : 'Se ha identificado un dia pico marcado por la usuaria.';
};

const getCalculatorMode = (candidate, selection) => {
  if (selection === 'manual' || candidate?.isManual || candidate?.manualBase != null) return 'manual';
  if (selection === 'auto') return 'auto';
  return candidate ? 'auto' : null;
};

const getCpmRuleText = (candidate, mode) => {
  if (mode === 'manual') {
    return 'El CPM aplicado procede de un valor configurado manualmente, no de un calculo automatico de ciclos previos.';
  }
  const base = Number(candidate?.base ?? candidate?.manualBase ?? candidate?.shortestCycle);
  const sampleSize = Number(candidate?.sampleSize ?? candidate?.cycleCount ?? candidate?.cyclesCount);
  if (sampleSize >= 12) {
    return 'El CPM automatico usa el ciclo mas corto de 12 ciclos validos y resta 20 dias.';
  }
  if (sampleSize >= 6) {
    return 'El CPM automatico usa el ciclo mas corto de 6 a 11 ciclos validos y resta 21 dias.';
  }
  if (Number.isFinite(base)) {
    return 'El CPM automatico usa el ciclo mas corto disponible segun la configuracion actual.';
  }
  return 'El CPM automatico se basa en ciclos previos validos y abre un limite preovulatorio antes de la ovulacion posible.';
};

const getT8RuleText = (mode) => {
  if (mode === 'manual') {
    return 'El T-8 aplicado procede de un valor configurado manualmente.';
  }
  return 'El T-8 usa ciclos anteriores con subida termica confirmada: toma el primer dia alto mas precoz y resta 8 dias.';
};

const MUCUS_LEGEND_SECTION = {
  title: 'Como clasifica la app el moco',
  body: [
    'S: sequedad o ausencia de moco visible.',
    '\u00d8: no se percibe humedad ni sequedad y no hay moco visible.',
    'h: humedad sin moco visible.',
    'M: moco presente, pero no de maxima fertilidad.',
    'M+: sensacion mojada, resbaladiza, lubricante o moco cristalino, filante o similar a clara de huevo.',
  ],
};

const isMucusCriterion = (criterion) =>
  ['mucus', 'highMucus', 'peak', 'whiteSymbol', 'mucusSign'].includes(criterion);

const hasActiveCalculation = ({ fertilityStartConfig, cpmSelection, t8Selection }) =>
  Boolean(fertilityStartConfig?.calculators?.cpm && cpmSelection !== 'none') ||
  Boolean(fertilityStartConfig?.calculators?.t8 && t8Selection !== 'none');

export const getMethodLabel = ({
  postpartumActive = false,
  fertilityStartConfig = null,
  cpmSelection = null,
  t8Selection = null,
  criterion = null,
  hasTemperatureClosure = false,
  hasMucusClosure = false,
} = {}) => {
  if (postpartumActive) return 'criterios de postparto';
  if (criterion === 'cpm' || criterion === 't8') return 'interpretacion con calculo preovulatorio';
  if (criterion === 'mucus' || criterion === 'highMucus' || criterion === 'peak' || criterion === 'whiteSymbol' || criterion === 'mucusSign') {
    if (hasTemperatureClosure) return 'interpretacion mucotermica';
    return 'criterio mucoso';
  }
  if (criterion === 'temperature') return 'criterio termico';
  if (hasMucusClosure && hasTemperatureClosure) {
    return hasActiveCalculation({ fertilityStartConfig, cpmSelection, t8Selection })
      ? 'interpretacion sintotermica'
      : 'doble criterio de moco y temperatura';
  }
  if (hasMucusClosure) return 'criterio mucoso';
  if (hasTemperatureClosure) return 'criterio termico';
  return 'criterios activos de interpretacion';
};

const makeContent = ({ title, eyebrow, summary, sections, caution, methodLabel }) => ({
  title,
  eyebrow,
  summary,
  sections: sections.filter(Boolean),
  caution,
  methodLabel,
});

const getOpeningTitle = (criterion, phase) => {
  if (criterion === 'manual') return 'Inicio fertil por ajuste manual';
  if (criterion === 'cpm') return 'Inicio fertil por CPM';
  if (criterion === 't8') return 'Inicio fertil por T-8';
  if (criterion === 'peak') return 'Inicio fertil por dia pico';
  if (criterion === 'whiteSymbol') return 'Inicio fertil por marcador fertil';
  if (criterion === 'highMucus') return 'Inicio fertil por moco de mayor fertilidad';
  if (criterion === 'mucus' || criterion === 'mucusSign') return 'Inicio fertil por moco';
  return phase === 'relativeInfertile' ? 'Fin de fase relativamente infertil' : 'Fase fertil abierta';
};

const getOpeningSummary = (criterion) => {
  if (criterion === 'manual') {
    return 'Segun la configuracion actual, la fase relativamente infertil termina donde se ha fijado manualmente el inicio fertil.';
  }
  if (criterion === 'cpm' || criterion === 't8') {
    return `La fase relativamente infertil termina aqui porque el calculo ${criterion === 'cpm' ? 'CPM' : 'T-8'} es el criterio mas precoz entre los criterios activos.`;
  }
  if (criterion === 'peak') {
    return 'La app abre la fase fertil porque se ha marcado dia pico, un dato que indica fertilidad alta en la observacion del moco.';
  }
  if (criterion === 'whiteSymbol') {
    return 'La app abre la fase fertil porque se ha registrado o derivado un marcador fertil.';
  }
  if (criterion === 'highMucus') {
    return 'La app abre la fase fertil porque se ha registrado moco o sensacion de mayor fertilidad.';
  }
  if (criterion === 'mucus' || criterion === 'mucusSign') {
    return 'La app abre la fase fertil porque se ha registrado humedad, moco o una sensacion fertil.';
  }
  return 'Segun los datos registrados, la app interpreta que la fase fertil esta abierta.';
};

const buildOpeningSections = ({ criterion, reasons, cpmSelection, t8Selection }) => {
  const candidate = findSelectedCandidate({ reasons });
  if (criterion === 'manual') {
    return [
      {
        title: 'Que ha detectado la app',
        body: 'Hay un ajuste manual de inicio fertil. La app mantiene la fecha configurada y la muestra como limite de la fase anterior.',
      },
      {
        title: 'Que criterio se ha aplicado',
        body: 'Este limite no procede de CPM, T-8, moco ni temperatura, sino de un valor configurado manualmente.',
      },
    ];
  }
  if (criterion === 'cpm') {
    const cpmCandidate = getCalculatorCandidate(reasons, 'CPM') ?? candidate;
    const mode = getCalculatorMode(cpmCandidate, cpmSelection);
    return [
      {
        title: 'Que ha detectado la app',
        body: 'Entre los criterios disponibles para abrir fertilidad, el limite CPM llega antes que los demas candidatos activos.',
      },
      { title: 'Que criterio se ha aplicado', body: getCpmRuleText(cpmCandidate, mode) },
    ];
  }
  if (criterion === 't8') {
    const t8Candidate = getCalculatorCandidate(reasons, 'T8') ?? candidate;
    const mode = getCalculatorMode(t8Candidate, t8Selection);
    return [
      {
        title: 'Que ha detectado la app',
        body: 'Entre los criterios disponibles para abrir fertilidad, el limite T-8 llega antes que los demas candidatos activos.',
      },
      { title: 'Que criterio se ha aplicado', body: getT8RuleText(mode) },
    ];
  }
  if (criterion === 'peak') {
    return [
      {
        title: 'Que ha detectado la app',
        body: 'Se ha registrado dia pico. En la observacion del moco, el pico puede requerir confirmacion retrospectiva porque se reconoce como el ultimo dia de maxima fertilidad.',
      },
      {
        title: 'Que criterio se ha aplicado',
        body: 'Un dia pico registrado abre la fase fertil si llega antes que otros limites activos.',
      },
    ];
  }
  if (criterion === 'whiteSymbol') {
    return [
      {
        title: 'Que ha detectado la app',
        body: 'Hay un simbolo blanco o marcador fertil registrado o derivado de la sensacion/apariencia observada.',
      },
      {
        title: 'Que criterio se ha aplicado',
        body: 'Ese marcador se trata como signo fertil para abrir la ventana fertil cuando es el criterio mas precoz.',
      },
    ];
  }
  return [
    {
      title: 'Que ha detectado la app',
      body:
        criterion === 'highMucus'
          ? 'Se ha registrado M+ o una sensacion de mayor fertilidad.'
          : 'Se ha registrado humedad, moco o una sensacion fertil. La sequedad o ausencia de moco visible no abre fertilidad por este criterio.',
    },
    {
      title: 'Que criterio se ha aplicado',
      body: 'En una interpretacion basada en moco, la aparicion de humedad o mucosidad cambia el patron previo seco/no fertil y abre la ventana fertil.',
    },
  ];
};

const buildRelativeContent = (info) => {
  const { status, reasons = {} } = info;
  const closure = getClosureInfo(reasons);
  const criterion = getOpeningCriterion(info);
  const methodLabel = getMethodLabel({ ...info, criterion, ...closure });

  if (status === 'default' || !criterion) {
    return makeContent({
      title: 'Fase relativamente infertil',
      eyebrow: methodLabel,
      summary: 'La fase relativamente infertil comienza con la menstruacion. Con los datos actuales, la app aun no ha encontrado un criterio activo que abra la fase fertil.',
      sections: [
        {
          title: 'Que ha detectado la app',
          body: 'No aparece todavia un signo fertil ni un limite CPM/T-8 aplicable antes del segmento mostrado.',
        },
        {
          title: 'Que criterio se ha aplicado',
          body: 'Mientras no haya apertura fertil, la app mantiene la fase preovulatoria relativamente infertil desde el inicio del ciclo.',
        },
      ],
      caution: 'Esta interpretacion depende de la calidad de los registros y de los criterios que esten activos.',
      methodLabel,
    });
  }

  return makeContent({
    title: getOpeningTitle(criterion, 'relativeInfertile'),
    eyebrow: methodLabel,
    summary: getOpeningSummary(criterion),
    sections: [
      ...buildOpeningSections({
        criterion,
        reasons,
        cpmSelection: info.cpmSelection,
        t8Selection: info.t8Selection,
      }),
      getUsedCandidates(reasons).length > 1 && {
        title: 'Por que se aplica aqui',
        body: 'Cuando hay varios criterios activos para abrir fertilidad, la app usa el mas precoz entre los candidatos disponibles.',
      },
      isMucusCriterion(criterion) && MUCUS_LEGEND_SECTION,
    ],
    caution: 'Esta interpretacion depende de que los registros y ajustes de ciclo sean coherentes.',
    methodLabel,
  });
};

const buildFertileContent = (info) => {
  const { reasons = {} } = info;
  const closure = getClosureInfo(reasons);
  const criterion = getOpeningCriterion(info);
  const methodLabel = getMethodLabel({ ...info, criterion, ...closure });
  const openingSections = buildOpeningSections({
    criterion,
    reasons,
    cpmSelection: info.cpmSelection,
    t8Selection: info.t8Selection,
  });
  const closureSections = [];

  if (closure.hasMucusClosure && closure.hasTemperatureClosure) {
    closureSections.push({
      title: 'Como se cierra',
      body: 'Hay cierre por moco y por temperatura. Si ambos no coinciden, la app toma el criterio mas tardio para iniciar la fase postovulatoria confirmada.',
    });
  } else if (closure.hasMucusClosure) {
    closureSections.push({
      title: 'Como se cierra',
      body: info.postpartumActive
        ? 'Hay cierre postpico por moco en postparto, pero falta el criterio termico para una confirmacion doble.'
        : 'Hay cierre por moco, pero falta temperatura. La interpretacion postovulatoria queda estimada por moco si la logica actual ya la muestra asi.',
    });
  } else if (closure.hasTemperatureClosure) {
    closureSections.push({
      title: 'Como se cierra',
      body: 'Hay subida de temperatura confirmada, pero falta cierre por moco. La interpretacion postovulatoria queda estimada por temperatura si la logica actual ya la muestra asi.',
    });
  } else {
    closureSections.push({
      title: 'Que falta',
      body: 'Aun no hay cierre por moco ni por temperatura en los datos disponibles, por eso la fase fertil sigue abierta.',
    });
  }

  return makeContent({
    title: getOpeningTitle(criterion, 'fertile'),
    eyebrow: methodLabel,
    summary: getOpeningSummary(criterion),
    sections: [
      ...openingSections,
      isMucusCriterion(criterion) && MUCUS_LEGEND_SECTION,
      ...closureSections,
    ],
    caution: 'Esta fase no afirma certeza biologica; resume lo que la app interpreta con los criterios activos.',
    methodLabel,
  });
};

const buildTemperatureSection = (closure, postpartumActive) => {
  if (!closure.hasTemperatureClosure) return null;
  const rule = String(closure.temperatureRule ?? '').toLowerCase();
  const normalizedRule = rule.startsWith('pp-after-') ? rule.replace('pp-after-', '') : rule;
  const isPostpartumRule = postpartumActive || rule.startsWith('pp-after-');
  let title = 'Criterio termico';
  let body =
    'La app ha detectado una subida termica compatible con los criterios activos, pero no dispone de suficiente detalle para mostrar la regla exacta aplicada.';

  if (normalizedRule === '3-high') {
    title = 'Regla termica 3/6';
    body =
      'La app ha identificado tres temperaturas altas consecutivas por encima de las seis anteriores. Para confirmar la subida termica, el tercer valor alto debe estar al menos 0,2 \u00baC por encima de la linea basica.';
  } else if (normalizedRule === 'german-3+1') {
    title = 'Primera excepcion termica';
    body =
      'La app ha aplicado la primera excepcion: habia tres temperaturas altas, pero el tercer valor no alcanzaba los 0,2 \u00baC sobre la linea basica. Por eso se espera un cuarto valor por encima de la linea basica, aunque ya no se exige que este 0,2 \u00baC por encima.';
  } else if (normalizedRule === 'german-2nd-exception') {
    title = 'Segunda excepcion termica';
    body =
      'La app ha aplicado la segunda excepcion: entre los valores altos habia un unico valor en la linea basica o por debajo. Ese valor no se usa para cerrar la subida y se espera un cuarto dia alto, que si debe estar al menos 0,2 \u00baC por encima de la linea basica.';
  }

  if (isPostpartumRule) {
    body += ' En modo postparto la app aplica una regla mas estricta y anade un dia alto adicional antes de cerrar por temperatura.';
  }
  return {
    title,
    body,
  };
};

const buildPostContent = (info) => {
  const { reasons = {}, status, formatDateFromIndex } = info;
  const closure = getClosureInfo(reasons);
  const source = normalizeSource(info?.source ?? reasons?.source);
  const displayText = `${info?.displayLabel ?? ''} ${info?.label ?? ''} ${info?.message ?? ''}`.toLowerCase();
  const isConfirmed = status === 'absolute' || (closure.hasMucusClosure && closure.hasTemperatureClosure);
  const criterion = isConfirmed
    ? 'both'
    : source === 'TEMPERATURE' || displayText.includes('temperatura')
      ? 'temperature'
      : source === 'MUCUS' || displayText.includes('moco') || closure.hasMucusClosure
        ? 'mucus'
        : null;

  const methodLabel = getMethodLabel({
    ...info,
    criterion: criterion === 'temperature' ? 'temperature' : criterion === 'mucus' ? 'mucus' : null,
    ...closure,
  });

  const peakText = getPeakText(reasons, formatDateFromIndex);
  const peakDetectionText = getPeakDetectionText(reasons, formatDateFromIndex);
  const postPeakDayText = info.postpartumActive ? '4.\u00ba dia postpico' : '3.er dia postpico';
  const orderText =
    closure.hasMucusClosure && closure.hasTemperatureClosure
      ? closure.mucusIndex > closure.temperatureIndex
        ? 'En este ciclo, el cierre termico llega antes que el cierre por moco, por eso se toma el cierre por moco.'
        : closure.temperatureIndex > closure.mucusIndex
          ? 'En este ciclo, el cierre por moco llega antes que el cierre termico, por eso se toma el cierre termico.'
          : 'En este ciclo, ambos criterios llegan al mismo limite.'
      : null;

  if (isConfirmed) {
    return makeContent({
      title: 'Inicio postovulatorio confirmado',
      eyebrow: methodLabel,
      summary:
        'La app interpreta el inicio postovulatorio como confirmado porque se han cumplido los criterios de moco y temperatura.',
      sections: [
        {
          title: 'Que ha detectado la app',
          body: compact([
            'Hay cierre por moco y subida termica confirmada. Cuando ambos criterios no coinciden el mismo dia, la app usa el criterio mas tardio para iniciar la fase postovulatoria confirmada.',
            orderText,
          ]),
        },
        {
          title: 'Criterio utilizado',
          body: info.postpartumActive
            ? 'En modo postparto, la app aplica una regla mas prudente: cuarto dia postpico y cuarto dia alto, tomando el mas tardio de ambos.'
            : 'La app aplica el doble criterio de moco y temperatura: 3.er dia postpico y subida termica confirmada, tomando el mas tardio de ambos.',
        },
        MUCUS_LEGEND_SECTION,
        buildTemperatureSection(closure, info.postpartumActive),
      ],
      caution: 'Esta interpretacion depende de la calidad de los registros de moco y temperatura.',
      methodLabel,
    });
  }

  if (criterion === 'temperature') {
    return makeContent({
      title: 'Infertilidad estimada por temperatura',
      eyebrow: methodLabel,
      summary:
        'La app estima una fase infertil por temperatura porque la subida termica ya cumple el criterio termico aplicado.',
      sections: [
        buildTemperatureSection(closure, info.postpartumActive) ?? {
          title: 'Que ha detectado la app',
          body: 'La app ha detectado una subida termica compatible con los criterios activos, pero no dispone de suficiente detalle para mostrar la regla exacta aplicada.',
        },
        {
          title: 'Criterio utilizado',
          body: 'Esta explicacion se basa en el criterio termico. Como todavia falta el cierre por moco, la app debe presentarlo como infertilidad estimada, no como infertilidad postovulatoria confirmada.',
        },
      ],
      caution: 'Esta interpretacion depende de que las temperaturas alteradas o ignoradas no se usen como justificacion.',
      methodLabel,
    });
  }

  if (criterion === 'mucus') {
    return makeContent({
      title: 'Infertilidad estimada por moco',
      eyebrow: methodLabel,
      summary: `La app establece una infertilidad estimada por moco al alcanzar el ${postPeakDayText} tras ${peakText}.`,
      sections: [
        {
          title: 'Que ha detectado la app',
          body: `${peakDetectionText} El dia pico corresponde al ultimo dia con la sensacion o apariencia mas fertil registrada. Tras alcanzar el ${postPeakDayText}, el criterio mucoso permite estimar el inicio de una fase infertil por moco.`,
        },
        {
          title: 'Criterio utilizado',
          body: 'Esta explicacion se basa en el criterio mucoso. Como todavia falta la confirmacion termica, la app debe presentarlo como infertilidad estimada, no como infertilidad postovulatoria confirmada.',
        },
        MUCUS_LEGEND_SECTION,
      ],
      caution:
        'Si despues del pico vuelve a aparecer moco de la misma categoria de maxima fertilidad, la evaluacion del moco puede cambiar.',
      methodLabel,
    });
  }

  return makeContent({
    title: 'Fase postovulatoria',
    eyebrow: methodLabel,
    summary: 'La app no dispone de suficiente detalle para explicar este tramo postovulatorio con un criterio concreto.',
    sections: [
      {
        title: 'Limitacion',
        body: 'La explicacion depende de que el segmento incluya cierre por moco, cierre por temperatura o ambos criterios.',
      },
    ],
    caution: 'Revisa los registros del ciclo antes de sacar conclusiones practicas.',
    methodLabel,
  });
};

const buildNoDataContent = (info) => {
  const methodLabel = getMethodLabel(info);
  return makeContent({
    title: info.status === 'no-fertile-window' ? 'Sin ventana fertil identificable' : 'Sin datos suficientes',
    eyebrow: methodLabel,
    summary: 'Con los datos registrados, la app no tiene informacion suficiente para explicar una fase con mas detalle.',
    sections: [
      {
        title: 'Que ha detectado la app',
        body: 'No hay un inicio fertil, cierre por moco o cierre por temperatura que permita construir una explicacion especifica.',
      },
      {
        title: 'Limitacion',
        body: 'La interpretacion depende de que existan registros observables y de que los criterios activos tengan datos aplicables.',
      },
    ],
    caution: 'Revisa los registros del ciclo antes de sacar conclusiones practicas.',
    methodLabel,
  });
};

export const getPhaseEducationContent = (info = {}) => {
  if (!info || typeof info !== 'object') return null;
  const phase = info.phase ?? null;
  if (phase === 'relativeInfertile') return buildRelativeContent(info);
  if (phase === 'fertile') return buildFertileContent(info);
  if (phase === 'postOvulatory') return buildPostContent(info);
  if (phase === 'nodata') return buildNoDataContent(info);
  return null;
};
