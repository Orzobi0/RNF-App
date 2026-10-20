import { measurementsFromRecord, normalizeMeasurements, measurementsForSheetSave } from '@/lib/temperatureMeasurements';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format, startOfDay, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { FERTILITY_SYMBOLS } from '@/config/fertilitySymbols';

export const useDataEntryForm = (
  onSubmit,
  initialData,
  isEditing,
  cycleStartDate,
  cycleEndDate,
  cycleData = [],
  onDateSelect,
  defaultIsoDate,
  onSaveMeasurements
) => {
  const buildEmptyMeasurement = (overrides = {}) => {
    const now = format(new Date(), 'HH:mm');
    return {
      temperature: '',
      time: now,
      selected: true,
      temperature_corrected: '',
      time_corrected: now,
      use_corrected: false,
      confirmed: true,
      source: 'manual', device_model: null, device_key: null,
      ...overrides,
    };
  };
  const getDefaultDate = () => {
    if (initialData?.isoDate) {
      return parseISO(initialData.isoDate);
    }

    const today = startOfDay(new Date());

    if (defaultIsoDate) {
      const parsedDefault = startOfDay(parseISO(defaultIsoDate));
      if (!Number.isNaN(parsedDefault.getTime())) {
        return parsedDefault > today ? today : parsedDefault;
      }
    }

    const cycleStart = cycleStartDate ? startOfDay(parseISO(cycleStartDate)) : null;
    const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;

    let candidate = today;

    if (cycleStart && candidate < cycleStart) {
      candidate = cycleStart;
    }

    if (cycleEnd && candidate > cycleEnd) {
      candidate = cycleEnd;
    }

    return candidate;
  };

  const [date, setDate] = useState(getDefaultDate);
  const [measurements, setMeasurements] = useState(() => measurementsFromRecord(initialData));

  const [mucusSensation, setMucusSensation] = useState(
    initialData?.mucusSensation ?? initialData?.mucus_sensation ?? ''
  );
  const [mucusAppearance, setMucusAppearance] = useState(
    initialData?.mucusAppearance ?? initialData?.mucus_appearance ?? ''
  );
  const [fertilitySymbol, setFertilitySymbol] = useState(
    initialData?.fertility_symbol || FERTILITY_SYMBOLS.NONE.value
  );
  const [observations, setObservations] = useState(initialData?.observations || '');
  const [hadRelations, setHadRelations] = useState(
    initialData?.hadRelations ?? initialData?.had_relations ?? false
  );
  const [ignored, setIgnored] = useState(initialData?.ignored || false);
  const [peakTag, setPeakTag] = useState(
    initialData?.peak_marker === 'peak' ? 'peak' : null
  );
  const existingPeakIsoDate = useMemo(() => {
    const peakRecord = cycleData.find((record) => record?.peak_marker === 'peak');
    return peakRecord?.isoDate || null;
  }, [cycleData]);
  const { toast } = useToast();

  const persistedMeasurementsRef = useRef(measurementsFromRecord(initialData));
  const preserveDraftDateRef = useRef(null);
  const previousInitialDataRef = useRef(initialData);
  const previousDefaultIsoRef = useRef(defaultIsoDate);

  useEffect(() => {
    const hadInitialData = Boolean(previousInitialDataRef.current);
    const defaultIsoChanged = previousDefaultIsoRef.current !== defaultIsoDate;

    previousInitialDataRef.current = initialData;
    previousDefaultIsoRef.current = defaultIsoDate;

    // A temperature-only save refreshes the record, but must not replace other
    // unsaved fields in the open form with the persisted versions.
    if (preserveDraftDateRef.current === format(date, 'yyyy-MM-dd') &&
        (!initialData || initialData.isoDate === preserveDraftDateRef.current) && !defaultIsoChanged) return;
    preserveDraftDateRef.current = null;
    persistedMeasurementsRef.current = measurementsFromRecord(initialData);
    if (initialData) {
      setDate(parseISO(initialData.isoDate));
      setMeasurements(measurementsFromRecord(initialData));
      setMucusSensation(initialData.mucusSensation ?? initialData.mucus_sensation ?? '');
      setMucusAppearance(initialData.mucusAppearance ?? initialData.mucus_appearance ?? '');
      setFertilitySymbol(initialData.fertility_symbol || FERTILITY_SYMBOLS.NONE.value);
      setHadRelations(initialData.hadRelations ?? initialData.had_relations ?? false);
      setObservations(initialData.observations || '');
      setIgnored(initialData.ignored || false);
      setPeakTag(initialData.peak_marker === 'peak' ? 'peak' : null);
    } else {
      setMeasurements([
        buildEmptyMeasurement(),
      ]);
      setMucusSensation('');
      setMucusAppearance('');
      setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
      setObservations('');
      setHadRelations(false);
      setIgnored(false);
      setPeakTag(null);
      if (!hadInitialData || defaultIsoChanged) {
        setDate(getDefaultDate());
      }
    }
  }, [initialData, defaultIsoDate]);

  useEffect(() => {
    if (initialData) {
      return;
    }

    const cycleStart = cycleStartDate ? startOfDay(parseISO(cycleStartDate)) : null;
    const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;

    setDate((currentDate) => {
      if (!currentDate) {
        return getDefaultDate();
      }

      let adjustedDate = currentDate;

      if (cycleStart && adjustedDate < cycleStart) {
        adjustedDate = cycleStart;
      }

      if (cycleEnd && adjustedDate > cycleEnd) {
        adjustedDate = cycleEnd;
      }

      return adjustedDate;
    });
  }, [cycleStartDate, cycleEndDate, initialData]);

  useEffect(() => {
    if (!onDateSelect) return;
    const iso = format(date, 'yyyy-MM-dd');
    const found = cycleData.find((r) => r.isoDate === iso);
    onDateSelect(found || null);
    if (found && preserveDraftDateRef.current !== iso) {
      setPeakTag(found.peak_marker === 'peak' ? 'peak' : null);
    }
  }, [date, cycleData, onDateSelect]);

  const addMeasurement = () => {
    setMeasurements((prev) => {
      const now = format(new Date(), 'HH:mm');
      if (!prev.length) {
        return [buildEmptyMeasurement({ time: now, time_corrected: now, confirmed: false })];
      }
      return [
        ...prev,
        buildEmptyMeasurement({
          temperature: '',
          time: now,
          time_corrected: now,
          selected: false,
          confirmed: false,
        }),
      ];
    });
  };
  const removeMeasurement = (index) => {
    setMeasurements((prev) => {
      if (prev[index]?.selected && prev.length > 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
  };

  const confirmMeasurement = (index) => {
    setMeasurements((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], confirmed: true };
      return copy;
    });
  };

  const updateMeasurement = (index, field, value) => {
    setMeasurements((prev) => {
      const copy = [...prev];
      copy[index] = { ...(copy[index] ?? buildEmptyMeasurement()), [field]: value };
      return copy;
    });
  };

  const selectMeasurement = (index) => {
    setMeasurements((prev) =>
      prev.map((m, i) => ({ ...m, selected: i === index }))
    );
  };

  const buildSubmissionPayload = (options = {}) => {
    const {
      overrideMeasurements,
      overrideIgnored,
      peakTagOverride,
      overrideHadRelations,
    } = options;
    if (!date) {
      toast({
        title: 'Error',
        description: 'La fecha es obligatoria.',
        variant: 'destructive',
      });
      return null;
    }
    const selectedDay = startOfDay(date);
const today = startOfDay(new Date());
const cycleStart = startOfDay(parseISO(cycleStartDate));
const cycleEnd = cycleEndDate
  ? startOfDay(parseISO(cycleEndDate))
  : null;

if (selectedDay > today) {
  toast({
    title: 'Fecha no permitida',
    description: 'No se pueden guardar registros en días futuros.',
    variant: 'destructive',
  });
  return null;
}

if (selectedDay < cycleStart || (cycleEnd && selectedDay > cycleEnd)) {
  toast({
    title: 'Error',
    description: 'La fecha debe estar dentro del ciclo.',
    variant: 'destructive',
  });
  return null;
}

const isoDate = format(selectedDay, 'yyyy-MM-dd');
    const normalizeMeasurementValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const peakTagOverrideProvided = Object.prototype.hasOwnProperty.call(
      options,
      'peakTagOverride'
    );
    const effectivePeakTag = peakTagOverrideProvided
      ? peakTagOverride
      : peakTag;

    const measurementsSource = Array.isArray(overrideMeasurements)
      ? overrideMeasurements
      : measurements;

    const isMeasurementValid = (measurement) => {
      if (!measurement) return false;
      const raw = measurement.temperature;
      const corrected = measurement.temperature_corrected;
      const rawString = raw === null || raw === undefined ? '' : String(raw).trim();
      const correctedString =
        corrected === null || corrected === undefined ? '' : String(corrected).trim();
      return rawString !== '' || correctedString !== '';
    };
    const filteredMeasurements = measurementsSource.filter(isMeasurementValid);

      const hadRelationsOverrideProvided = Object.prototype.hasOwnProperty.call(
      options,
      'overrideHadRelations'
    );

    const effectiveHadRelations = hadRelationsOverrideProvided
      ? !!overrideHadRelations
      : hadRelations;

    return {
      isoDate,
      measurementsComplete: !!initialData?.measurementsLoaded || !initialData?.id,
      measurements: normalizeMeasurements(filteredMeasurements).map((m) => ({
        source: m.source ?? null, device_model: m.device_model ?? null, device_key: m.device_key ?? null,
        temperature: normalizeMeasurementValue(m.temperature),
        time: m.time,
        selected: m.selected,
        temperature_corrected: normalizeMeasurementValue(m.temperature_corrected),
        time_corrected: m.time_corrected ?? m.time ?? '',
        use_corrected: !!m.use_corrected,
      })),
      mucusSensation,
      mucusAppearance,
      fertility_symbol: fertilitySymbol,
      observations,
      had_relations: effectiveHadRelations,
      ignored:
        Object.prototype.hasOwnProperty.call(options, 'overrideIgnored')
          ? !!overrideIgnored
          : ignored,
      peak_marker: effectivePeakTag === 'peak' ? 'peak' : null,
    };
  };

  const buildDraftPayload = () => ({
    isoDate: date ? format(date, 'yyyy-MM-dd') : null,
    measurements,
    mucusSensation,
    mucusAppearance,
    fertility_symbol: fertilitySymbol,
    observations,
    had_relations: hadRelations,
    ignored,
    peak_marker: peakTag === 'peak' ? 'peak' : null,
  });


  const applyDraftPayload = useCallback((draft) => {
    if (!draft) {
      return;
    }

    if (draft.isoDate) {
      const parsedDate = startOfDay(parseISO(draft.isoDate));
      if (!Number.isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
      }
    }

    if (Array.isArray(draft.measurements)) setMeasurements(normalizeMeasurements(draft.measurements));

    setMucusSensation(draft.mucusSensation ?? draft.mucus_sensation ?? '');
    setMucusAppearance(draft.mucusAppearance ?? draft.mucus_appearance ?? '');
    setFertilitySymbol(draft.fertility_symbol || FERTILITY_SYMBOLS.NONE.value);
    setObservations(draft.observations || '');
    setHadRelations(Boolean(draft.had_relations ?? draft.hadRelations ?? false));
    setIgnored(Boolean(draft.ignored));
    setPeakTag(draft.peak_marker === 'peak' ? 'peak' : null);
  }, []);
  const resetFormState = () => {
    setDate(getDefaultDate());
    setMeasurements([
      {
        temperature: '',
        time: format(new Date(), 'HH:mm'),
        selected: true,
        temperature_corrected: '',
        time_corrected: format(new Date(), 'HH:mm'),
        use_corrected: false,
        confirmed: true,
        source: 'manual', device_model: null, device_key: null,
      },
    ]);
    setMucusSensation('');
    setMucusAppearance('');
    setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
    setObservations('');
    setHadRelations(false);
    setPeakTag(null);
  };

  const submitCurrentState = (options = {}) => {
  const {
    keepFormOpen = false,
    skipReset = false,
    submitAction = null,
    ...payloadOptions
  } = options;

  const payload = buildSubmissionPayload(payloadOptions);
  if (!payload) {
    return null;
  }

  const result = onSubmit(payload, { keepFormOpen, skipReset, submitAction });

    if (!isEditing && !skipReset) {
      resetFormState();
    }
  
    return result;
  };

  const saveMeasurementsFromSheet = async (next, operation) => {
    if (!onSaveMeasurements) { setMeasurements(next); if (typeof operation?.ignored === 'boolean') setIgnored(operation.ignored); return; }
    const toSave = measurementsForSheetSave(persistedMeasurementsRef.current, normalizeMeasurements(measurements), next, operation);
    const payload = buildSubmissionPayload({ overrideMeasurements: toSave });
    if (!payload) throw new Error('La fecha o las temperaturas no son válidas.');
    const previousPreservedDate = preserveDraftDateRef.current;
    preserveDraftDateRef.current = payload.isoDate;
    try {
      await onSaveMeasurements(payload.isoDate, payload.measurements, operation);
      if (typeof operation?.ignored === 'boolean') setIgnored(operation.ignored);
      persistedMeasurementsRef.current = payload.measurements;
      setMeasurements(next);
      toast({ title: 'Temperaturas guardadas', duration: 1600 });
    } catch (error) {
      preserveDraftDateRef.current = previousPreservedDate;
      throw error;
    }
  };

  const handleSubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    return submitCurrentState();
  };

  return {
    date,
    setDate,
    measurements,
    setMeasurements,
    saveMeasurementsFromSheet,
    addMeasurement,
    updateMeasurement,
    selectMeasurement,
    removeMeasurement,
    confirmMeasurement,
    mucusSensation,
    setMucusSensation,
    mucusAppearance,
    setMucusAppearance,
    fertilitySymbol,
    setFertilitySymbol,
    observations,
    setObservations,
    ignored,
    setIgnored,
    peakTag,
    setPeakTag,
    existingPeakIsoDate,
    handleSubmit,
    submitCurrentState,
    buildDraftPayload,
    applyDraftPayload,
    hadRelations,
    setHadRelations,
  };
};
