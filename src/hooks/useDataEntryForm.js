import { useState, useEffect, useMemo } from 'react';
import { format, startOfDay, parseISO, addDays } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { FERTILITY_SYMBOLS } from '@/config/fertilitySymbols';

export const useDataEntryForm = (
  onSubmit,
  initialData,
  isEditing,
  cycleStartDate,
  cycleEndDate,
  cycleData = [],
  onDateSelect
) => {
  const getDefaultDate = () => {
    if (initialData?.isoDate) {
      return parseISO(initialData.isoDate);
    }

    const today = startOfDay(new Date());
    const cycleStart = cycleStartDate ? startOfDay(parseISO(cycleStartDate)) : null;
    const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;

    let candidate = today;

    if (cycleStart && candidate < cycleStart) {
      candidate = cycleStart;
    }

    if (cycleEnd && candidate > cycleEnd) {
      candidate = cycleEnd;
    }

    if (!cycleEnd && cycleStart) {
      const maxAllowedDate = addDays(cycleStart, 45);
      if (candidate > maxAllowedDate) {
        candidate = maxAllowedDate;
      }
    }

    return candidate;
  };

  const [date, setDate] = useState(getDefaultDate);
  const [measurements, setMeasurements] = useState(() => {
    if (initialData?.measurements && Array.isArray(initialData.measurements)) {
      return initialData.measurements.map((m) => ({
        temperature: m.temperature ?? '',
        time: m.time || format(new Date(), 'HH:mm'),
        selected: !!m.selected,
        temperature_corrected: m.temperature_corrected ?? '',
        time_corrected: m.time_corrected || m.time || format(new Date(), 'HH:mm'),
        use_corrected: !!m.use_corrected,
        confirmed: true,
      }));
    }
    return [
      {
        temperature:
          initialData?.temperature_raw === null || initialData?.temperature_raw === undefined
            ? ''
            : String(initialData.temperature_raw),
        time: initialData?.timestamp
          ? format(parseISO(initialData.timestamp), 'HH:mm')
          : format(new Date(), 'HH:mm'),
        selected: true,
        temperature_corrected: '',
        time_corrected: initialData?.timestamp
          ? format(parseISO(initialData.timestamp), 'HH:mm')
          : format(new Date(), 'HH:mm'),
        use_corrected: false,
        confirmed: true,
      },
    ];
  });

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
  const [ignored, setIgnored] = useState(initialData?.ignored || false);
  const [peakTag, setPeakTag] = useState(
    initialData?.peak_marker === 'peak' ? 'peak' : null
  );
  const existingPeakIsoDate = useMemo(() => {
    const peakRecord = cycleData.find((record) => record?.peak_marker === 'peak');
    return peakRecord?.isoDate || null;
  }, [cycleData]);
  const { toast } = useToast();

  useEffect(() => {
    if (initialData) {
      setDate(parseISO(initialData.isoDate));
      if (initialData.measurements && Array.isArray(initialData.measurements)) {
        setMeasurements(
          initialData.measurements.map((m) => ({
            temperature: m.temperature ?? '',
            time: m.time || format(new Date(), 'HH:mm'),
            selected: !!m.selected,
            temperature_corrected: m.temperature_corrected ?? '',
            time_corrected: m.time_corrected || m.time || format(new Date(), 'HH:mm'),
            use_corrected: !!m.use_corrected,
            confirmed: true,
          }))
        );
      }
      setMucusSensation(initialData.mucusSensation ?? initialData.mucus_sensation ?? '');
      setMucusAppearance(initialData.mucusAppearance ?? initialData.mucus_appearance ?? '');
      setFertilitySymbol(initialData.fertility_symbol || FERTILITY_SYMBOLS.NONE.value);
      setObservations(initialData.observations || '');
      setIgnored(initialData.ignored || false);
      setPeakTag(initialData.peak_marker === 'peak' ? 'peak' : null);
    } else {
      setMeasurements([
        {
          temperature: '',
          time: format(new Date(), 'HH:mm'),
          selected: true,
          temperature_corrected: '',
          time_corrected: format(new Date(), 'HH:mm'),
          use_corrected: false,      
          confirmed: true,
        },
      ]);
      setMucusSensation('');
      setMucusAppearance('');
      setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
      setObservations('');
      setIgnored(false);
      setPeakTag(null);
      setDate(getDefaultDate());
    }
  }, [initialData]);

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

      if (!cycleEnd && cycleStart) {
        const maxAllowedDate = addDays(cycleStart, 45);
        if (adjustedDate > maxAllowedDate) {
          adjustedDate = maxAllowedDate;
        }
      }

      return adjustedDate;
    });
  }, [cycleStartDate, cycleEndDate, initialData]);

   useEffect(() => {
    if (!onDateSelect) return;
    const iso = format(date, 'yyyy-MM-dd');
    const found = cycleData.find((r) => r.isoDate === iso);
    onDateSelect(found || null);
    if (found) {
      setPeakTag(found.peak_marker === 'peak' ? 'peak' : null);
    }
  }, [date, cycleData, onDateSelect]);

  const addMeasurement = () => {
    setMeasurements((prev) => [
      ...prev,
        {
        temperature: prev[prev.length - 1]?.temperature || '',
        time: format(new Date(), 'HH:mm'),
        selected: false,
        temperature_corrected: '',
        time_corrected: format(new Date(), 'HH:mm'),
        use_corrected: false,
        confirmed: false,
      },
    ]);
  };
  const removeMeasurement = (index) => {
    setMeasurements((prev) => prev.filter((_, i) => i !== index));
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
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const selectMeasurement = (index) => {
    setMeasurements((prev) =>
      prev.map((m, i) => ({ ...m, selected: i === index }))
    );
  };

  const buildSubmissionPayload = (options = {}) => {
    if (!date) {
      toast({
        title: 'Error',
        description: 'La fecha es obligatoria.',
        variant: 'destructive',
      });
      return null;
    }
    const cycleStart = startOfDay(parseISO(cycleStartDate));
    const cycleEnd = cycleEndDate
      ? startOfDay(parseISO(cycleEndDate))
      : addDays(cycleStart, 45);
    if (date < cycleStart || date > cycleEnd) {
      toast({
        title: 'Error',
        description: 'La fecha debe estar dentro del ciclo.',
        variant: 'destructive',
      });
      return null;
    }
    const isoDate = format(date, 'yyyy-MM-dd');
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
      ? options.peakTagOverride
      : peakTag;

    return {
      isoDate,
      measurements: measurements.map((m) => ({
        temperature: normalizeMeasurementValue(m.temperature),
        time: m.time,
        selected: m.selected,
        temperature_corrected: normalizeMeasurementValue(m.temperature_corrected),
        time_corrected: m.time_corrected,
        use_corrected: !!m.use_corrected,
      })),
      mucusSensation,
      mucusAppearance,
      fertility_symbol: fertilitySymbol,
      observations,
      ignored,
      peak_marker: effectivePeakTag === 'peak' ? 'peak' : null,
    };
  };

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
      },
    ]);
    setMucusSensation('');
    setMucusAppearance('');
    setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
    setObservations('');
    setPeakTag(null);
  };

  const submitCurrentState = (options = {}) => {
    const payload = buildSubmissionPayload(options);
    if (!payload) {
      return null;
    }

    const result = onSubmit(payload);

    if (!isEditing) {
      resetFormState();
    }
  
    return result;
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
  };
};