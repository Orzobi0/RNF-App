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
    ? `Se ha identificado un dia pico determinado por la usuaria: el ${peakDate}.`
    : 'Se ha identificado un dia pico determinado por la usuaria.';
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
  title: 'Referencia para clasificar el moco (Esquema grupo Bonn)',
  body: [
    'S · Sequedad: sensación seca, áspera o incluso picor desagradable. No se observa moco visible.',
    'Ø · Sin sensación definida: no se percibe humedad ni sequedad. Tampoco se observa moco visible.',
    'h · Humedad: se percibe humedad, pero no se observa moco visible. Aunque no haya moco visible, la sensación ya indica un cambio respecto a la sequedad.',
    'M · Moco presente: puede ser espeso, turbio, cremoso, blanquecino, grumoso, amarillento, pegajoso, poco elástico o no filante. Indica presencia de moco. Puede tener sensación de humedad o no sentir nada.',
    'M+ · Sensación mojada, escurridiza, resbaladiza, deslizante, lubricante o suave; o moco cristalino, transparente, filante, líquido, parecido a clara de huevo crudo, a veces con hilos rojizos o blanquecinos.',
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
  if (criterion === 'temperature') return 'criterio térmico (método grupo Bonn)';
  if (hasMucusClosure && hasTemperatureClosure) {
    return hasActiveCalculation({ fertilityStartConfig, cpmSelection, t8Selection })
      ? 'Método sintotérmico: doble criterio moco y temperatura'
      : 'Doble criterio moco y temperatura';
  }
  if (hasMucusClosure) return 'criterio mucoso';
  if (hasTemperatureClosure) return 'criterio térmico (método grupo Bonn)';
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
  return 'La fase relativamente infértil termina porque se ha registrado un símbolo blanco o un signo equivalente de fertilidad.';
}
if (criterion === 'highMucus') {
  return 'La fase relativamente infértil termina porque se ha registrado moco o sensación de mayor fertilidad.';
}
if (criterion === 'mucus' || criterion === 'mucusSign') {
  return 'La fase relativamente infértil termina porque se ha registrado sensación o moco de mayor fertilidad.';
}
  return 'Segun los datos registrados, la app interpreta que la fase fertil esta abierta.';
};

const buildOpeningSections = ({
  criterion,
  reasons,
  cpmSelection,
  t8Selection,
  calculationActive = false,
}) => {
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
      title: 'Qué ha detectado la app',
      body:
        'Se ha registrado día pico. En la observación del moco, el día pico corresponde al último día con sensación o apariencia de mayor fertilidad (M+): por ejemplo sensación mojada, resbaladiza o lubricante, o moco transparente, filante o similar a clara de huevo.',
    },
    {
      title: 'Qué criterio se ha aplicado',
      body:
        'Un día pico registrado indica que ya ha existido un patrón de fertilidad alta. Por eso puede abrir o reforzar la interpretación de fase fértil si es el criterio que aparece antes que otros límites activos.',
    },
  ];
}
if (criterion === 'whiteSymbol') {
  return [
    {
      title: 'Qué ha detectado la app',
      body:
        'Hay un símbolo blanco o marcador fértil registrado o derivado de la sensación/apariencia observada. Ese símbolo indica que ha aumentado la fertilidad respecto al patrón previo.',
    },
    {
      title: 'Qué criterio se ha aplicado',
      body: calculationActive
        ? 'Aunque hay cálculos preovulatorios activos, en el método sintotérmico, la fase fértil inicia con el más precoz entre los disponibles.'
        : 'Como los cálculos preovulatorios no están activos en este ciclo, la apertura de la fase fértil comienza con el registro de símbolo blanco o marcador fértil.',
    },
  ];
}
  if (criterion === 'highMucus') {
  return [
    {
      title: 'Qué ha detectado la app',
      body:
        'Se ha registrado un dato compatible con moco de mayor fertilidad: sensación mojada, resbaladiza o lubricante, o una apariencia más fértil como moco transparente, cristalino, filante o similar a clara de huevo.',
    },
    {
      title: 'Qué criterio se ha aplicado',
      body:
        'El criterio mucoso abre la fase fértil cuando aparece un signo de fertilidad. En este caso, el registro corresponde a una categoría de mayor fertilidad, por eso la fase relativamente infértil termina aquí.',
    },
  ];
}


return [
  {
    title: 'Qué ha detectado la app',
    body:
      'Se ha registrado humedad, moco visible o una sensación compatible con fertilidad. La sequedad o ausencia de moco visible no abre fertilidad por este criterio, pero la aparición de humedad o moco sí cambia la interpretación.',
  },
  {
    title: 'Qué criterio se ha aplicado',
    body:
      'En una interpretación basada en moco, la aparición de humedad o mucosidad cambia el patrón previo seco/no fértil y abre la fase fértil.',
  },
];
};

const buildRelativeContent = (info) => {
  const { status, reasons = {} } = info;
  const closure = getClosureInfo(reasons);
  const criterion = getOpeningCriterion(info);
  const methodLabel = getMethodLabel({ ...info, criterion, ...closure });

  if (!criterion) {
    return makeContent({
      title: 'Fase relativamente infertil',
      eyebrow: methodLabel,
      summary:
  'La fase relativamente infértil comienza con la menstruación. Con los datos actuales, la app todavía no ha detectado un criterio activo que abra la fase fértil.',
sections: [
  {
    title: 'Qué ha detectado la app',
    body:
      hasActiveCalculation(info)
        ? 'No aparece todavía un signo fértil ni un límite CPM/T-8 aplicable antes del segmento mostrado.'
        : 'No aparece todavía un signo fértil aplicable con los criterios activos de este ciclo.',
  },
  {
    title: 'Qué criterio se ha aplicado',
    body:
      hasActiveCalculation(info)
        ? 'Mientras no haya apertura fértil por cálculo o por signo observado, la app mantiene la fase preovulatoria relativamente infértil desde el inicio del ciclo.'
        : 'Como los cálculos preovulatorios no están activos, la app mantiene la fase relativamente infértil hasta que aparezca un signo fértil registrado.',
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
  calculationActive: hasActiveCalculation(info),
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
  calculationActive: hasActiveCalculation(info),
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
  ? 'Hay cierre por moco al alcanzar el 3er día postpico. En postparto, la temperatura requiere un día alto adicional, por eso aún falta el criterio térmico para la confirmación por doble chequeo.'
  : 'Hay cierre por moco al alcanzar el 3er día postpico, pero falta confirmación por temperatura.',
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
    caution: 'Esta explicación se basa en los registros disponibles y puede cambiar si se añaden o corrigen datos del ciclo.',
    methodLabel,
  });
};

const buildTemperatureSection = (closure, postpartumActive) => {
  if (!closure.hasTemperatureClosure) return null;
  const rule = String(closure.temperatureRule ?? '').toLowerCase();
  const normalizedRule = rule.startsWith('pp-after-') ? rule.replace('pp-after-', '') : rule;
  const isPostpartumRule = postpartumActive || rule.startsWith('pp-after-');

  let title = 'Criterio térmico';
  let body =
    'Se ha detectado una subida térmica compatible con los criterios activos, pero no dispone de suficiente detalle para mostrar la regla exacta aplicada.';

  if (normalizedRule === '3-high') {
    title = 'Regla térmica 3/6';
    body =
      'Se ha identificado una subida térmica siguiendo la regla 3/6: tres temperaturas altas consecutivas por encima de las seis anteriores. Para confirmar la subida, el tercer valor alto debe estar al menos 0,2 ºC por encima de la línea básica.';
  } else if (normalizedRule === 'german-3+1') {
    title = 'Primera excepción térmica';
    body =
      'Se ha aplicado la primera excepción térmica. Hay tres temperaturas altas, pero el tercer valor no alcanza los 0,2 ºC sobre la línea básica. Por eso se espera un cuarto valor alto por encima de la línea básica, aunque ya no se exige que esté 0,2 ºC por encima.';
  } else if (normalizedRule === 'german-2nd-exception') {
    title = 'Segunda excepción térmica';
    body =
      'Se ha aplicado la segunda excepción térmica. Entre los valores altos hay un único valor en la línea básica o por debajo, por lo que ese valor no sirve para cerrar la subida. Se espera un cuarto día alto, que sí debe estar al menos 0,2 ºC por encima de la línea básica.';
  }

  if (isPostpartumRule) {
    body +=
      ' En modo postparto, el método SENSIPLAN requiere añadir un día alto adicional antes de confirmar la subida térmica.';
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
  const normalizedStatus = String(status ?? info?.status ?? '').toLowerCase();

const isEstimatedTemperatureSegment =
  source === 'TEMPERATURE' ||
  (displayText.includes('estimada') && displayText.includes('temperatura'));

const isEstimatedMucusSegment =
  source === 'MUCUS' ||
  (displayText.includes('estimada') && displayText.includes('moco'));

const isConfirmed =
  !isEstimatedTemperatureSegment &&
  !isEstimatedMucusSegment &&
  (
    normalizedStatus === 'absolute' ||
    source === 'ABSOLUTE' ||
    displayText.includes('confirmada')
  );

const criterion = isEstimatedTemperatureSegment
  ? 'temperature'
  : isEstimatedMucusSegment
    ? 'mucus'
    : isConfirmed
      ? 'both'
      : displayText.includes('temperatura')
        ? 'temperature'
        : displayText.includes('moco')
          ? 'mucus'
          : null;

  const methodLabel = getMethodLabel({
    ...info,
    criterion: criterion === 'temperature' ? 'temperature' : criterion === 'mucus' ? 'mucus' : null,
    ...closure,
  });

  const peakText = getPeakText(reasons, formatDateFromIndex);
  const peakDetectionText = getPeakDetectionText(reasons, formatDateFromIndex);
  const postPeakDayText = '3er día postpico';
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
    ? 'En modo postparto, según el método SENSIPLAN, se exige un día más de temperatura alta. La infertilidad por temperatura ha de confirmarse necesariamente con el tercer día post-pico. En caso de que temperatura y mucosidad no coincidan se hará caso al más tardío de ambos.'
    : 'El método SENSIPLAN aplica el doble criterio de moco y temperatura: 3er día postpico y subida térmica confirmada, tomando el más tardío de ambos.',
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
      'La app muestra una infertilidad estimada por temperatura porque la subida térmica ya cumple el criterio térmico aplicado.',
    sections: [
      buildTemperatureSection(closure, info.postpartumActive) ?? {
        title: 'Qué ha detectado la app',
        body:
          'La app ha detectado una subida térmica compatible con los criterios activos, pero no dispone de suficiente detalle para mostrar la regla exacta aplicada.',
      },
      {
        title: 'Criterio utilizado',
        body:
          'Esta estimación se basa en el criterio térmico. La app analiza la línea básica y los valores altos posteriores para comprobar si la subida de temperatura puede considerarse válida.',
      },
    ],
    caution:
      'Si alguna temperatura está alterada por enfermedad, cambio de rutina u otra incidencia, conviene marcarla para que no justifique una subida térmica falsa.',
    methodLabel,
  });
}

  if (criterion === 'mucus') {
  return makeContent({
    title: 'Infertilidad estimada por moco',
    eyebrow: methodLabel,
    summary: `La app muestra una infertilidad estimada por moco al alcanzar el ${postPeakDayText} tras ${peakText}.`,
    sections: [
      {
        title: 'Qué ha detectado la app',
        body: `${peakDetectionText} En la observación del moco, el día pico corresponde al último día con sensación o apariencia de mayor fertilidad (M+). Al alcanzar el ${postPeakDayText}, la app puede estimar el inicio de una fase infértil por moco.`,
      },
      {
        title: 'Criterio utilizado',
        body:
          'Esta estimación se basa en el criterio mucoso: después del día pico se cuentan los 3 días postpico necesarios. Si el patrón de moco cambia y vuelve a aparecer moco de máxima fertilidad, la evaluación puede modificarse.',
      },
      MUCUS_LEGEND_SECTION,
    ],
    caution:
      'El día pico depende de que la usuaria haya identificado correctamente el último día con sensación o apariencia más fértil (M+).',
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
