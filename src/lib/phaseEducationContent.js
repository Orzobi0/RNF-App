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

const cycleDayLabel = (index) => (isInteger(index) ? `Dia ${index + 1}` : null);

const formatIndexLabel = (index, formatDateFromIndex) => {
  const day = cycleDayLabel(index);
  const date = callFormatDate(formatDateFromIndex, index);
  if (day && date) return `${day} (${date})`;
  return day ?? date ?? null;
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

  const temperatureRule =
    fertileWindow?.temperatureRule ??
    details?.temperatureRule ??
    temperature?.rule ??
    temperature?.temperatureRule ??
    null;

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

const getRuleLabel = (rule) => {
  const normalized = String(rule ?? '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('first') || normalized.includes('primera')) return 'primera excepcion';
  if (normalized.includes('second') || normalized.includes('segunda')) return 'segunda excepcion';
  if (normalized.includes('3') || normalized.includes('normal')) return 'regla normal 3/6';
  if (normalized.includes('manual')) return 'ajuste manual';
  if (normalized.includes('ignored') || normalized.includes('alter')) return 'valores alterados';
  return rule;
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

const buildFacts = ({ startIndex, endIndex, limitIndex, reasons, formatDateFromIndex }) =>
  compact([
    isInteger(startIndex) && {
      label: 'Inicio del segmento',
      value: formatIndexLabel(startIndex, formatDateFromIndex),
    },
    isInteger(endIndex) && {
      label: 'Fin visible del segmento',
      value: formatIndexLabel(endIndex, formatDateFromIndex),
    },
    isInteger(limitIndex) && {
      label: 'Limite evaluado',
      value: formatIndexLabel(limitIndex, formatDateFromIndex),
    },
    getUsedCandidates(reasons).length > 1 && {
      label: 'Criterios comparados',
      value: `${getUsedCandidates(reasons).length} candidatos; se usa el mas precoz.`,
    },
  ]);

const makeContent = ({ title, eyebrow, summary, sections, facts, caution, methodLabel }) => ({
  title,
  eyebrow,
  summary,
  sections: sections.filter(Boolean),
  facts: facts?.filter((fact) => fact?.label && fact?.value) ?? [],
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
  const { status, reasons = {}, startIndex, endIndex, limitIndex, formatDateFromIndex } = info;
  const closure = getClosureInfo(reasons);
  const criterion = getOpeningCriterion(info);
  const methodLabel = getMethodLabel({ ...info, criterion, ...closure });
  const facts = buildFacts({ startIndex, endIndex, limitIndex, reasons, formatDateFromIndex });

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
      facts,
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
    ],
    facts,
    caution: 'Esta interpretacion depende de que los registros y ajustes de ciclo sean coherentes.',
    methodLabel,
  });
};

const buildFertileContent = (info) => {
  const { reasons = {}, startIndex, endIndex, formatDateFromIndex } = info;
  const closure = getClosureInfo(reasons);
  const criterion = getOpeningCriterion(info);
  const methodLabel = getMethodLabel({ ...info, criterion, ...closure });
  const nextIndex = isInteger(endIndex) ? endIndex + 1 : closure.postIndex;
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
    sections: [...openingSections, ...closureSections],
    facts: compact([
      isInteger(startIndex) && { label: 'Inicio fertil', value: formatIndexLabel(startIndex, formatDateFromIndex) },
      isInteger(nextIndex) && { label: 'Siguiente limite', value: formatIndexLabel(nextIndex, formatDateFromIndex) },
      closure.hasMucusClosure && { label: 'Cierre por moco', value: formatIndexLabel(closure.mucusIndex, formatDateFromIndex) },
      closure.hasTemperatureClosure && { label: 'Cierre por temperatura', value: formatIndexLabel(closure.temperatureIndex, formatDateFromIndex) },
      closure.temperatureRule && { label: 'Regla termica', value: getRuleLabel(closure.temperatureRule) },
    ]),
    caution: 'Esta fase no afirma certeza biologica; resume lo que la app interpreta con los criterios activos.',
    methodLabel,
  });
};

const buildTemperatureSection = (closure, postpartumActive) => {
  if (!closure.hasTemperatureClosure) return null;
  const ruleLabel = getRuleLabel(closure.temperatureRule);
  let body =
    'La regla normal 3/6 busca tres temperaturas altas consecutivas sobre las seis anteriores; la tercera debe estar al menos 0,2 C sobre la linea basica.';
  if (ruleLabel === 'primera excepcion') {
    body = 'Se aplica la primera excepcion: si el tercer valor alto no llega a +0,2 C, se espera un cuarto valor por encima de la linea basica.';
  } else if (ruleLabel === 'segunda excepcion') {
    body = 'Se aplica la segunda excepcion: si hay un unico valor justo en linea o por debajo entre los altos, se espera un cuarto dia alto al menos +0,2 C.';
  }
  if (postpartumActive) {
    body += ' En la primera ovulacion postparto se toma un dia mas, por eso se valora el cuarto dia alto cuando corresponde.';
  }
  return {
    title: 'Criterio termico',
    body,
  };
};

const buildPostContent = (info) => {
  const { reasons = {}, status, formatDateFromIndex, startIndex } = info;
  const closure = getClosureInfo(reasons);
  const displayText = `${info?.displayLabel ?? ''} ${info?.label ?? ''} ${info?.message ?? ''}`.toLowerCase();
  const criterion =
    status === 'absolute' || (closure.hasMucusClosure && closure.hasTemperatureClosure)
      ? 'both'
      : displayText.includes('temperatura') || (!closure.hasMucusClosure && closure.hasTemperatureClosure)
        ? 'temperature'
        : displayText.includes('moco') || closure.hasMucusClosure
          ? 'mucus'
          : null;
  const methodLabel = getMethodLabel({
    ...info,
    criterion: criterion === 'temperature' ? 'temperature' : criterion === 'mucus' ? 'mucus' : null,
    ...closure,
  });

  const isConfirmed = criterion === 'both' || status === 'absolute';
  const title = info.postpartumActive
    ? isConfirmed
      ? 'Postparto: cierre confirmado'
      : criterion === 'temperature'
        ? 'Postparto: cierre estimado por temperatura'
        : 'Postparto: cierre estimado por moco'
    : isConfirmed
      ? 'Inicio postovulatorio confirmado'
      : criterion === 'temperature'
        ? 'Inicio postovulatorio por temperatura'
        : 'Inicio postovulatorio por moco';

  const summary = info.postpartumActive
    ? 'Segun los datos registrados, la app interpreta el cierre postparto usando los criterios especificos de primera ovulacion postparto.'
    : isConfirmed
      ? 'La app interpreta el inicio postovulatorio como confirmado porque se han cumplido los criterios de moco y temperatura.'
      : criterion === 'temperature'
        ? 'La app muestra un cierre estimado por temperatura; falta el criterio mucoso para doble confirmacion.'
        : 'La app muestra un cierre estimado por moco; falta temperatura para doble confirmacion.';

  const sections = [
    {
      title: 'Que ha detectado la app',
      body: isConfirmed
        ? 'Hay datos de cierre por moco y subida termica. Cuando no coinciden, la app usa el criterio mas tardio.'
        : criterion === 'temperature'
          ? 'Hay subida termica confirmada disponible en la interpretacion actual.'
          : 'Hay cierre postpico por moco disponible en la interpretacion actual.',
    },
    criterion !== 'temperature' && {
      title: info.postpartumActive ? 'Criterio de moco postparto' : 'Criterio mucoso',
      body: info.postpartumActive
        ? 'En postparto se anade un dia mas: se valora el cuarto dia postpico y se toma el limite mas tardio junto con temperatura.'
        : 'El cierre por moco se basa en la evaluacion postpico. Si la logica actual detecta reinicio por vuelta de moco de la misma categoria del climax, esta explicacion depende de ese reinicio ya calculado.',
    },
    buildTemperatureSection(closure, info.postpartumActive),
  ];

  return makeContent({
    title,
    eyebrow: methodLabel,
    summary,
    sections,
    facts: compact([
      isInteger(startIndex) && { label: 'Inicio del segmento', value: formatIndexLabel(startIndex, formatDateFromIndex) },
      closure.hasMucusClosure && { label: 'Cierre por moco', value: formatIndexLabel(closure.mucusIndex, formatDateFromIndex) },
      closure.hasTemperatureClosure && { label: 'Cierre por temperatura', value: formatIndexLabel(closure.temperatureIndex, formatDateFromIndex) },
      closure.temperatureConfirmationIndex != null && {
        label: 'Confirmacion termica',
        value: formatIndexLabel(closure.temperatureConfirmationIndex, formatDateFromIndex),
      },
      closure.temperatureRule && { label: 'Regla termica', value: getRuleLabel(closure.temperatureRule) },
    ]),
    caution: info.postpartumActive
      ? 'No se mezclan criterios de ciclo estandar con postparto; esta lectura depende de registros suficientes en postparto.'
      : 'Esta interpretacion depende de la calidad de los registros de moco y temperatura.',
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
