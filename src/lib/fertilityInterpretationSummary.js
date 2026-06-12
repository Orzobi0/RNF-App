const SUMMARY_TITLE = 'Estado del ciclo';

const normalizeCalculatorSource = (source) => {
  if (typeof source !== 'string') return '';
  return source.toUpperCase().replace(/-/g, '');
};

const isValidIndex = (value) => Number.isInteger(value) && value >= 0;

const isReached = (index, currentIndex) =>
  isValidIndex(index) && isValidIndex(currentIndex) && currentIndex >= index;

const formatDateLabel = (isoDate) => {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const parts = isoDate.split('-');
  if (parts.length !== 3) return null;
  const [, month, day] = parts;
  if (!month || !day) return null;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}`;
};

const getPointIsoDate = (allDataPoints, index) =>
  isValidIndex(index) && Array.isArray(allDataPoints)
    ? allDataPoints[index]?.isoDate ?? null
    : null;

const getDateFromIndex = (allDataPoints, index) => formatDateLabel(getPointIsoDate(allDataPoints, index));

const getRoundedDay = (candidate) => {
  const numericDay = Number(candidate?.day);
  return Number.isFinite(numericDay) ? Math.max(1, Math.round(numericDay)) : null;
};

const getSelectedCandidates = (aggregate) => {
  const selectedDay = Number.isFinite(Number(aggregate?.selectedDay))
    ? Math.max(1, Math.round(Number(aggregate.selectedDay)))
    : null;

  if (selectedDay == null) return [];

  return (aggregate?.usedCandidates ?? []).filter(
    (candidate) => getRoundedDay(candidate) === selectedDay
  );
};

const getPrimaryBadge = ({
  fertilityStart,
  aggregate,
  cpmSelection,
  t8Selection,
  noData,
  ovulationDetails,
}) => {
  if (noData) return 'Sin datos';

  const temperatureSource = ovulationDetails?.source ?? ovulationDetails?.mode ?? null;
  const temperatureStatus = ovulationDetails?.status ?? null;

  if (
    temperatureSource === 'manual' ||
    temperatureSource === 'ignored' ||
    temperatureStatus === 'ignored'
  ) {
    return 'Manual';
  }

  if (fertilityStart?.fertileStartOverride?.mode === 'manual') return 'Manual';
  if (cpmSelection === 'manual' || t8Selection === 'manual') return 'Manual';

  const selectedCandidates = getSelectedCandidates(aggregate);
  if (selectedCandidates.some((candidate) => candidate?.isManual)) return 'Manual';

  return 'Auto';
};

const buildBadges = ({ primaryBadge, postpartumMode }) =>
  postpartumMode ? [primaryBadge, 'Posparto'] : [primaryBadge];

const buildRelativeBody = ({ fertilityStartConfig, cpmSelection, t8Selection, postpartumMode }) => {
  if (postpartumMode) return 'Hasta primera señal fértil registrada.';

  const calculators = fertilityStartConfig?.calculators ?? {};
  const active = [];

  if (calculators.cpm && cpmSelection !== 'none') active.push('CPM');
  if (calculators.t8 && t8Selection !== 'none') active.push('T-8');

  if (active.length === 2) {
    return 'Hasta primera señal fértil o criterio CPM/T-8 activo.';
  }

  if (active.length === 1) {
    return `Hasta primera señal fértil o criterio ${active[0]} activo.`;
  }

  return 'Hasta primera señal fértil registrada.';
};

const getPostOvulatoryInfo = ({ fertilityStart, ovulationDetails, hasAnyObservation }) => {
  if (!hasAnyObservation) return null;

  const debug = fertilityStart?.debug ?? {};
  const fertileWindow = fertilityStart?.fertileWindow ?? {};
  const mucusStartIndex = isValidIndex(debug.mucusInfertileStartIndex)
    ? debug.mucusInfertileStartIndex
    : null;
  const temperatureStartIndex = isValidIndex(fertileWindow.temperatureInfertileStartIndex)
    ? fertileWindow.temperatureInfertileStartIndex
    : isValidIndex(ovulationDetails?.infertileStartIndex)
      ? ovulationDetails.infertileStartIndex
      : null;
  const candidatePostStarts = [mucusStartIndex, temperatureStartIndex].filter(isValidIndex);
  const computedPostStartIndex =
    candidatePostStarts.length > 0 ? Math.min(...candidatePostStarts) : null;
  const postStartIndex = isValidIndex(computedPostStartIndex)
    ? computedPostStartIndex
    : isValidIndex(debug.postOvulatoryStartIndex)
      ? debug.postOvulatoryStartIndex
      : null;
  const computedAbsoluteStartIndex =
    isValidIndex(mucusStartIndex) && isValidIndex(temperatureStartIndex)
      ? Math.max(mucusStartIndex, temperatureStartIndex)
      : null;
  const absoluteStartIndex = isValidIndex(computedAbsoluteStartIndex)
    ? computedAbsoluteStartIndex
    : isValidIndex(debug.absoluteStartIndex)
      ? debug.absoluteStartIndex
      : null;

  if (!isValidIndex(postStartIndex)) return null;

  return {
    postStartIndex,
    absoluteStartIndex,
    mucusStartIndex,
    temperatureStartIndex,
    peakIndex: isValidIndex(ovulationDetails?.peakDayIndex)
      ? ovulationDetails.peakDayIndex
      : isValidIndex(debug.effectivePeakIndex)
        ? debug.effectivePeakIndex
        : null,
    temperatureConfirmationIndex: isValidIndex(fertileWindow.temperatureConfirmationIndex)
      ? fertileWindow.temperatureConfirmationIndex
      : isValidIndex(ovulationDetails?.confirmationIndex)
        ? ovulationDetails.confirmationIndex
        : null,
  };
};

const getPeakIndex = ({ fertilityStart, ovulationDetails, allDataPoints }) => {
  if (isValidIndex(ovulationDetails?.peakDayIndex)) return ovulationDetails.peakDayIndex;
  if (isValidIndex(fertilityStart?.debug?.effectivePeakIndex)) {
    return fertilityStart.debug.effectivePeakIndex;
  }

  if (!Array.isArray(allDataPoints)) return null;
  const foundIndex = allDataPoints.findIndex((point) => {
    const status = String(point?.normalizedPeakStatus ?? point?.peakStatus ?? point?.peak_marker ?? '')
      .trim()
      .toUpperCase();
    return status === 'P' || status === 'PEAK';
  });

  return foundIndex >= 0 ? foundIndex : null;
};

const getVisualPhaseAtIndex = ({
  fertilityStart,
  todayIndex,
  ovulationDetails,
  hasAnyObservation,
}) => {
  if (!isValidIndex(todayIndex)) return { phase: 'insufficient' };

  const fertileStartIndex = isValidIndex(fertilityStart?.fertileStartFinalIndex)
    ? fertilityStart.fertileStartFinalIndex
    : null;
  const postInfo = getPostOvulatoryInfo({
    fertilityStart,
    ovulationDetails,
    hasAnyObservation,
  });

  if (postInfo && isReached(postInfo.postStartIndex, todayIndex)) {
    return { phase: 'postOvulatory', postInfo };
  }

  if (isValidIndex(fertileStartIndex) && todayIndex >= fertileStartIndex) {
    return { phase: 'fertile', fertileStartIndex, postInfo };
  }

  return { phase: 'relativeInfertile', fertileStartIndex, postInfo };
};

const buildFertileOpeningBody = ({ fertilityStart, fertileStartIndex, allDataPoints }) => {
  const aggregate = fertilityStart?.aggregate ?? null;
  const selectedCandidates = getSelectedCandidates(aggregate);
  const startDate = getDateFromIndex(allDataPoints, fertileStartIndex);
  const dateSuffix = startDate ? ` el ${startDate}.` : '.';
  const calculatorCandidate = selectedCandidates.find((candidate) =>
    ['CPM', 'T8'].includes(normalizeCalculatorSource(candidate?.source))
  );

  if (calculatorCandidate) {
    const source = normalizeCalculatorSource(calculatorCandidate.source) === 'T8' ? 'T-8' : 'CPM';
    return `Por alcanzar ${source}${dateSuffix}`;
  }

  if (fertilityStart?.fertileStartOverride?.mode === 'manual') {
    return `Por ajuste manual${dateSuffix}`;
  }

  return `Por registro de observaciones${dateSuffix}`;
};

const joinSummarySentences = (...parts) =>
  parts
    .map((part) => String(part ?? '').trim().replace(/\.+$/, ''))
    .filter(Boolean)
    .map((part) => `${part}.`)
    .join(' ');

const buildPostSummary = ({ postInfo, todayIndex, allDataPoints }) => {
  const peakDate = getDateFromIndex(allDataPoints, postInfo?.peakIndex);
  const peakBody = peakDate
    ? `Tras determinar el ${peakDate} como día pico.`
    : 'Tras determinar el día pico.';
  const deltaFromPeak =
    isValidIndex(postInfo?.peakIndex) && isValidIndex(todayIndex)
      ? todayIndex - postInfo.peakIndex
      : null;

  if (isReached(postInfo?.absoluteStartIndex, todayIndex)) {
    return {
      headline: 'Infertilidad postovulatoria confirmada',
      body: 'Cierre por moco y temperatura.',
      status: 'postovulatory-confirmed',
    };
  }

  const canUseMucusClosure =
    isReached(postInfo?.mucusStartIndex, todayIndex) &&
    (!Number.isFinite(deltaFromPeak) || deltaFromPeak >= 4);

  if (canUseMucusClosure) {
    return {
      headline: 'Infertilidad estimada por moco',
      body: peakDate ? `Cierre por moco tras el día pico el ${peakDate}.` : 'Cierre por moco detectado.',
      status: 'mucus-estimated',
    };
  }

  if (isReached(postInfo?.temperatureStartIndex, todayIndex)) {
    const confirmationDate = getDateFromIndex(
      allDataPoints,
      postInfo.temperatureConfirmationIndex ?? postInfo.temperatureStartIndex
    );
    const temperatureBody = confirmationDate
      ? `Subida de temperatura confirmada el ${confirmationDate}.`
      : 'Subida de temperatura confirmada.';

    if (deltaFromPeak === 0) {
      return {
        headline: 'Día pico · Infertilidad estimada por temperatura',
        body: joinSummarySentences('Determinado por la usuaria.', temperatureBody),
        status: 'temperature-estimated',
      };
    }

    if (deltaFromPeak === 1 || deltaFromPeak === 2 || deltaFromPeak === 3) {
      return {
        headline: `${deltaFromPeak}º día postpico · Infertilidad estimada por temperatura`,
        body: joinSummarySentences(peakBody, temperatureBody),
        status: 'temperature-estimated',
      };
    }

    return {
      headline: 'Infertilidad estimada por temperatura',
      body: temperatureBody,
      status: 'temperature-estimated',
    };
  }

  if (deltaFromPeak === 0) {
    return {
      headline: 'Día pico',
      body: 'Determinado por la usuaria.',
      status: 'peak-day',
    };
  }

  if (deltaFromPeak === 1 || deltaFromPeak === 2 || deltaFromPeak === 3) {
    return {
      headline: `${deltaFromPeak}º día postpico`,
      body: peakBody,
      status: `postpeak-${deltaFromPeak}`,
    };
  }

  return null;
};

export function buildFertilityInterpretationSummary({
  fertilityStart,
  todayIndex,
  currentDay,
  postpartumMode,
  cpmSelection,
  t8Selection,
  fertilityStartConfig,
  allDataPoints,
  ovulationDetails,
  hasAnyObservation,
}) {
  const aggregate = fertilityStart?.aggregate ?? null;
  const hasKnownCyclePosition =
    isValidIndex(todayIndex) || (Number.isFinite(Number(currentDay)) && Number(currentDay) > 0);
  const noData = !fertilityStart || !hasKnownCyclePosition;
  const primaryBadge = getPrimaryBadge({
    fertilityStart,
    aggregate,
    cpmSelection,
    t8Selection,
    noData,
    ovulationDetails,
  });
  const badges = buildBadges({ primaryBadge, postpartumMode });

  if (noData) {
    return {
      title: SUMMARY_TITLE,
      headline: 'Sin datos suficientes',
      body: 'No se puede ubicar el día actual del ciclo.',
      badges,
      status: 'insufficient',
    };
  }

  const peakIndex = getPeakIndex({ fertilityStart, ovulationDetails, allDataPoints });
  const deltaFromPeak =
    isValidIndex(peakIndex) && isValidIndex(todayIndex) ? todayIndex - peakIndex : null;
  const visualPhase = getVisualPhaseAtIndex({
    fertilityStart,
    todayIndex,
    ovulationDetails: {
      ...ovulationDetails,
      peakDayIndex: peakIndex,
    },
    hasAnyObservation,
  });

  if (visualPhase.phase === 'postOvulatory') {
    const postSummary = buildPostSummary({
      postInfo: visualPhase.postInfo,
      todayIndex,
      allDataPoints,
    });

    if (postSummary) {
      return {
        title: SUMMARY_TITLE,
        ...postSummary,
        badges,
      };
    }
  }

  if (deltaFromPeak === 0) {
    return {
      title: SUMMARY_TITLE,
      headline: 'Día pico',
      body: 'Determinado por la usuaria.',
      badges,
      status: 'peak-day',
    };
  }

  if (deltaFromPeak === 1 || deltaFromPeak === 2 || deltaFromPeak === 3) {
    const peakDate = getDateFromIndex(allDataPoints, peakIndex);
    return {
      title: SUMMARY_TITLE,
      headline: `${deltaFromPeak}º día postpico`,
      body: peakDate
        ? `Tras determinar el ${peakDate} como día pico.`
        : 'Tras determinar el día pico.',
      badges,
      status: `postpeak-${deltaFromPeak}`,
    };
  }

  if (visualPhase.phase === 'fertile') {
    return {
      title: SUMMARY_TITLE,
      headline: 'Ventana fértil abierta',
      body: buildFertileOpeningBody({
        fertilityStart,
        fertileStartIndex: visualPhase.fertileStartIndex,
        allDataPoints,
      }),
      badges,
      status: 'fertile-open',
    };
  }

  if (visualPhase.phase === 'relativeInfertile') {
    return {
      title: SUMMARY_TITLE,
      headline: 'Relativamente infértil',
      body: buildRelativeBody({
        fertilityStartConfig,
        cpmSelection,
        t8Selection,
        postpartumMode,
      }),
      badges,
      status: 'relative-infertile',
    };
  }

  return {
    title: SUMMARY_TITLE,
    headline: 'Sin datos suficientes',
    body: 'No hay datos suficientes para interpretar el ciclo.',
    badges: buildBadges({ primaryBadge: 'Sin datos', postpartumMode }),
    status: 'insufficient',
  };
}
