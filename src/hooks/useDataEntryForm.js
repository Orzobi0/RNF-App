import { useState, useEffect } from 'react';
import { format, startOfDay, parseISO, addDays } from "date-fns";
    import { useToast } from '@/components/ui/use-toast';
    import { FERTILITY_SYMBOLS } from '@/config/fertilitySymbols';

   export const useDataEntryForm = (onSubmit, initialData, isEditing, cycleStartDate, cycleEndDate) => {
      const [date, setDate] = useState(initialData?.isoDate ? parseISO(initialData.isoDate) : startOfDay(new Date()));
      const [temperatureRaw, setTemperatureRaw] = useState(initialData?.temperature_raw === null || initialData?.temperature_raw === undefined ? '' : String(initialData.temperature_raw));
      const [time, setTime] = useState(initialData?.timestamp ? format(parseISO(initialData.timestamp), 'HH:mm') : format(new Date(), 'HH:mm'));
      const [temperatureCorrected, setTemperatureCorrected] = useState(initialData?.temperature_corrected === null || initialData?.temperature_corrected === undefined ? '' : String(initialData.temperature_corrected));
      const [useCorrected, setUseCorrected] = useState(initialData?.use_corrected || false);
      const [mucusSensation, setMucusSensation] = useState(initialData?.mucusSensation || '');
      const [mucusAppearance, setMucusAppearance] = useState(initialData?.mucusAppearance || '');
      const [fertilitySymbol, setFertilitySymbol] = useState(initialData?.fertility_symbol || FERTILITY_SYMBOLS.NONE.value);
      const [observations, setObservations] = useState(initialData?.observations || '');
      const [ignored, setIgnored] = useState(initialData?.ignored || false);
      const { toast } = useToast();

      useEffect(() => {
        if (initialData) {
          setDate(parseISO(initialData.isoDate));
          setTemperatureRaw(initialData.temperature_raw === null || initialData.temperature_raw === undefined ? '' : String(initialData.temperature_raw));
          setTime(initialData.timestamp ? format(parseISO(initialData.timestamp), 'HH:mm') : '');
          setTemperatureCorrected(initialData.temperature_corrected === null || initialData.temperature_corrected === undefined ? '' : String(initialData.temperature_corrected));
          setUseCorrected(initialData.use_corrected || false);
          setMucusSensation(initialData.mucusSensation || '');
          setMucusAppearance(initialData.mucusAppearance || '');
          setFertilitySymbol(initialData.fertility_symbol || FERTILITY_SYMBOLS.NONE.value);
          setObservations(initialData.observations || '');
          setIgnored(initialData.ignored || false);
        } else {
          setDate(startOfDay(new Date()));
          setTemperatureRaw('');
          setTime(format(new Date(), 'HH:mm'));
          setTemperatureCorrected('');
          setUseCorrected(false);
          setMucusSensation('');
          setMucusAppearance('');
          setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
          setObservations('');
          setIgnored(false);
        }
      }, [initialData]);

      const handleSubmit = (e) => {
        e.preventDefault();
        if (!date) {
          toast({ title: "Error", description: "La fecha es obligatoria.", variant: "destructive" });
          return;
        }
        
        const cycleStart = startOfDay(parseISO(cycleStartDate));
        const cycleEnd = cycleEndDate
          ? startOfDay(parseISO(cycleEndDate))
          : addDays(cycleStart, 45);
        if (date < cycleStart || date > cycleEnd) {
          toast({ title: 'Error', description: 'La fecha debe estar dentro del ciclo.', variant: 'destructive' });
          return;
        }
        const isoDate = format(date, "yyyy-MM-dd");

        onSubmit({
          isoDate: isoDate,
          time: time,
          temperature_raw: temperatureRaw === '' ? null : parseFloat(temperatureRaw),
          temperature_corrected: temperatureCorrected === '' ? null : parseFloat(temperatureCorrected),
          use_corrected: useCorrected,
          mucusSensation: mucusSensation,
          mucusAppearance: mucusAppearance,
          fertility_symbol: fertilitySymbol,
          observations: observations,
          ignored: ignored,
        });
        
        if (!isEditing) {
          setDate(startOfDay(new Date()));
          setTemperatureRaw('');
          setTime(format(new Date(), 'HH:mm'));
          setTemperatureCorrected('');
          setUseCorrected(false);
          setMucusSensation('');
          setMucusAppearance('');
          setFertilitySymbol(FERTILITY_SYMBOLS.NONE.value);
          setObservations('');
        }
      };

      return {
        date, setDate,
        temperatureRaw, setTemperatureRaw,
        time, setTime,
        temperatureCorrected, setTemperatureCorrected,
        useCorrected, setUseCorrected,
        mucusSensation, setMucusSensation,
        mucusAppearance, setMucusAppearance,
        fertilitySymbol, setFertilitySymbol,
        observations, setObservations,
        ignored, setIgnored,
        handleSubmit,
      };
    };