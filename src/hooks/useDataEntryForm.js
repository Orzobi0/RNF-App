import { useState, useEffect } from 'react';
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
  const [date, setDate] = useState(
    initialData?.isoDate ? parseISO(initialData.isoDate) : startOfDay(new Date())
  );
  const [measurements, setMeasurements] = useState(() => {
    if (initialData?.measurements && Array.isArray(initialData.measurements)) {
      return initialData.measurements.map((m) => ({
        temperature: m.temperature ?? '',
        time: m.time || format(new Date(), 'HH:mm'),
        selected: !!m.selected,
        temperature_corrected: m.temperature_corrected ?? '',
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
    } else {
      setMeasurements([
      {
          temperature: '',
          time: format(new Date(), 'HH:mm'),
          selected: true,
          temperature_corrected: '',
          use_corrected: false,
          confirmed: true,
        },
      ]);
      setMucusSensation('');
      setMucusAppearance('');
      setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
      setObservations('');
      setIgnored(false);
    }
  }, [initialData]);

   useEffect(() => {
    if (!onDateSelect) return;
    const iso = format(date, 'yyyy-MM-dd');
    const found = cycleData.find((r) => r.isoDate === iso);
    onDateSelect(found || null);
  }, [date, cycleData, onDateSelect]);

  const addMeasurement = () => {
    setMeasurements((prev) => [
      ...prev,
       {
        temperature: prev[prev.length - 1]?.temperature || '',
        time: format(new Date(), 'HH:mm'),
        selected: false,
        temperature_corrected: '',
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date) {
      toast({
        title: 'Error',
        description: 'La fecha es obligatoria.',
        variant: 'destructive',
      });
      return;
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
      return;
    }
    const isoDate = format(date, 'yyyy-MM-dd');

    onSubmit({
      isoDate,
      measurements: measurements.map((m) => ({
        temperature: m.temperature === '' ? null : parseFloat(m.temperature),
        time: m.time,
        selected: m.selected,
        temperature_corrected:
          m.temperature_corrected === ''
            ? null
            : parseFloat(m.temperature_corrected),
        use_corrected: !!m.use_corrected,
      })),
      mucusSensation,
      mucusAppearance,
      fertility_symbol: fertilitySymbol,
      observations,
      ignored,
    });

    if (!isEditing) {
      setDate(startOfDay(new Date()));
      setMeasurements([
        {
          temperature: '',
          time: format(new Date(), 'HH:mm'),
          selected: true,
          temperature_corrected: '',
          use_corrected: false,
          confirmed: true,
        },
      ]);
      setMucusSensation('');
      setMucusAppearance('');
      setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
      setObservations('');
    }
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
    handleSubmit,
  };
};