import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Thermometer,
  Droplets,
  Eye,
  EyeOff,
  CalendarDays,
  Sprout,
  Clock,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Circle,
  Plus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfDay, parseISO, addHours, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';

const DataEntryFormFields = ({
  date,
  setDate,
  measurements,
  addMeasurement,
  updateMeasurement,
  removeMeasurement,
  confirmMeasurement,
  selectMeasurement,
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
  isProcessing,
  isEditing,
  initialData,
  cycleStartDate,
  cycleEndDate,
  recordedDates = [],
  submitCurrentState,
}) => {
  const [open, setOpen] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState(null);

    useEffect(() => {
    if (correctionIndex !== null) {
      return;
    }

    const existingCorrectionIndex = measurements.findIndex((measurement) => {
      if (!measurement) return false;

      const hasCorrectedTemperature =
        measurement.temperature_corrected !== undefined &&
        measurement.temperature_corrected !== null &&
        String(measurement.temperature_corrected).trim() !== '';

      return Boolean(measurement.use_corrected) || hasCorrectedTemperature;
    });

    if (existingCorrectionIndex !== -1) {
      setCorrectionIndex(existingCorrectionIndex);
    }
  }, [correctionIndex, measurements]);

  const handleTempAdjust = (index, delta) => {
    const originalTemp = parseFloat(measurements[index].temperature ?? 0);
    const current = parseFloat(
      measurements[index].temperature_corrected ?? originalTemp
    );
    const newTemp = (current + delta).toFixed(2);
    updateMeasurement(index, 'temperature_corrected', newTemp);
    
    const tempDiff = parseFloat(newTemp) - originalTemp;
    const hoursOffset = Math.round(tempDiff * 10);
    const originalTime = measurements[index].time || '00:00';
    const parsedTime = parse(originalTime, 'HH:mm', new Date());
    const newTime = format(addHours(parsedTime, hoursOffset), 'HH:mm');
    updateMeasurement(index, 'time_corrected', newTime);
    
    if (!measurements[index].use_corrected) {
      updateMeasurement(index, 'use_corrected', true);
    }
  };
  const cycleStart = startOfDay(parseISO(cycleStartDate));
  const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : addDays(cycleStart, 45);
  const disabledDateRanges = [{ before: cycleStart }, { after: cycleEnd }];
  const selectedIsoDate = date ? format(date, 'yyyy-MM-dd') : null;
  const isCurrentPeak = peakTag === 'peak';
  const hasOtherPeak = existingPeakIsoDate && existingPeakIsoDate !== selectedIsoDate;
  const formattedExistingPeak = existingPeakIsoDate
    ? format(parseISO(existingPeakIsoDate), 'dd/MM/yyyy')
    : null;

  const togglePeakTag = async () => {
    if (isProcessing || typeof submitCurrentState !== 'function') {
      return;
    }

    const newPeakTag = isCurrentPeak ? null : 'peak';
    setPeakTag(newPeakTag);

    try {
      await submitCurrentState({
        peakTagOverride: newPeakTag,
        keepFormOpen: true,
        skipReset: true,
      });
          } catch (error) {
      // Restore previous peak marker if the submission fails
      setPeakTag(isCurrentPeak ? 'peak' : null);
    }
  };
  const handleIgnoredChange = (checked) => {
    const nextValue = checked === true;
    setIgnored(nextValue);

    if (!isEditing || isProcessing || typeof submitCurrentState !== 'function') {
      return;
    }

    submitCurrentState({
      overrideIgnored: nextValue,
      keepFormOpen: true,
      skipReset: true,
    });
  };

  const handleUseCorrectedChange = (index, checked) => {
    const nextValue = checked === true;
    updateMeasurement(index, 'use_corrected', nextValue);

    if (!isEditing || isProcessing || typeof submitCurrentState !== 'function') {
      return;
    }

    const updatedMeasurements = measurements.map((measurement, measurementIndex) =>
      measurementIndex === index
        ? {
            ...measurement,
            use_corrected: nextValue,
          }
        : measurement
    );

    submitCurrentState({
      overrideMeasurements: updatedMeasurements,
      keepFormOpen: true,
      skipReset: true,
    });
  };

  const peakButtonLabel = isCurrentPeak
    ? 'Quitar día pico'
    : hasOtherPeak
      ? 'Actualizar el día pico'
      : 'Determinar día pico';
  return (
    <>
      {/* Fecha */}
      <div className="space-y-2 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl p-3 border border-pink-300/50">
        <Label htmlFor="date" className="flex items-center text-pink-700 text-sm font-semibold">
          <CalendarDays className="mr-2 h-5 w-5 text-pink-400" />
          Fecha del Registro
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal bg-white/70 border-pink-200 text-gray-800 hover:bg-white',
                !date && 'text-muted-foreground'
              )}
              disabled={isProcessing}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {date ? format(date, 'PPP', { locale: es }) : <span>Selecciona una fecha</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-white border-pink-200 text-gray-800" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(selectedDate) => {
                setDate(startOfDay(selectedDate || new Date()));
                setOpen(false);
              }}
              initialFocus
              locale={es}
              disabled={isProcessing ? () => true : disabledDateRanges}
              modifiers={{ hasRecord: recordedDates }}
              modifiersClassNames={{
                hasRecord:
                  'relative after:content-["" ] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:w-1.5 after:h-1.5 after:rounded-full after:bg-pink-500'
              }}
              className="[&_button]:text-gray-800 [&_button:hover]:bg-pink-100 [&_button[aria-selected=true]]:bg-pink-500"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mediciones */}
      {measurements.map((m, idx) => {
        const measurementSelectId = `measurement_select_${idx}`;
        return (
          <div key={idx} className="space-y-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
            <div className="flex items-start justify-between gap-2">
              <Label className="flex items-center text-amber-800 text-sm font-semibold">
                <Thermometer className="mr-2 h-5 w-5 text-orange-500" />
                Medición {idx + 1}
              </Label>
              <label
                htmlFor={measurementSelectId}
                className="flex items-center gap-2 rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm"
              >
                <input
                  id={measurementSelectId}
                  type="radio"
                  checked={m.selected}
                  onChange={() => selectMeasurement(idx)}
                  disabled={isProcessing}
                  className="h-3.5 w-3.5 text-orange-500 focus:ring-orange-400"
                />
                <span>Usar en gráfica</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.01"
                min="34.0"
                max="40.0"
                value={m.temperature}
                onChange={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                onInput={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                placeholder="36.50"
                className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
                disabled={isProcessing}
              />
              <Input
                type="time"
                value={m.time}
                onChange={(e) => updateMeasurement(idx, 'time', e.target.value)}
                className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
                disabled={isProcessing}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isProcessing}
                  className=" text-white bg-orange-300 focus:ring-orange-400"
                  onClick={() => {
                    if (correctionIndex === idx) {
                      setCorrectionIndex(null);
                    } else {
                      setCorrectionIndex(idx);
                      if (m.temperature_corrected === '' || m.temperature_corrected === undefined) {
                        updateMeasurement(idx, 'temperature_corrected', m.temperature);
                      }
                      if (!m.time_corrected) {
                        updateMeasurement(idx, 'time_corrected', m.time);
                      }
                    }
                  }}
                >
                  Corregir
                </Button>
                {!m.confirmed && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => confirmMeasurement(idx)}
                      disabled={isProcessing}
                      className="h-7 w-7"
                    >
                      <Check className="h-4 w-4 " />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => removeMeasurement(idx)}
                      disabled={isProcessing}
                      className="h-7 w-7"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <Button
                type="button"
                onClick={addMeasurement}
                disabled={isProcessing}
                size="sm"
                variant="outline"
                className="ml-auto flex items-center gap-1 rounded-full border-amber-300 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir medición
              </Button>
            </div>

            {/* Ignorar */}
            {isEditing && (
              <div className="space-y-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ignored"
                    checked={ignored}
                    onCheckedChange={handleIgnoredChange}
                    className="data-[state=checked]:bg-orange-500 data-[state=checked]:text-white border-amber-400"
                    disabled={isProcessing}
                  />
                  <Label htmlFor="ignored" className="text-xs text-amber-700 flex items-center">
                    {ignored ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                    {ignored ? 'Restaurar' : 'Despreciar'}
                  </Label>

                </div>
              </div>
              )}
              
            {correctionIndex === idx && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="34.0"
                    max="40.0"
                    value={m.temperature_corrected}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateMeasurement(idx, 'temperature_corrected', value);
                      if (!m.use_corrected) {
                        updateMeasurement(idx, 'use_corrected', true);
                      }
                    }}
                    className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
                    disabled={isProcessing}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => handleTempAdjust(idx, 0.1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={isProcessing}
                    onClick={() => handleTempAdjust(idx, -0.1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <Input
                      type="time"
                      value={m.time_corrected}
                      onChange={(e) => updateMeasurement(idx, 'time_corrected', e.target.value)}
                      className="bg-white/70 border-amber-200 text-gray-800 focus:ring-orange-500 focus:border-orange-500 text-base"
                      disabled={isProcessing}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`use_corrected_${idx}`}
                    checked={m.use_corrected}
                    onCheckedChange={(checked) => handleUseCorrectedChange(idx, checked)}
                  />
                  <Label htmlFor={`use_corrected_${idx}`} className="text-xs">
                    Usar valor corregido
                  </Label>
                </div>
              </div>
              )}
          </div>
        );
      })}
      {selectedIsoDate && (
        <div className="mb-2 mt-4">
          <div className="space-y-2 rounded-2xl border border-rose-200/60 bg-gradient-to-r from-rose-50 to-pink-50 p-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                size="sm"
                variant={isCurrentPeak ? 'default' : 'outline'}
                disabled={isProcessing}
                onClick={togglePeakTag}
                className={cn(
                  'group w-full justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-all duration-200 sm:w-auto sm:text-sm',
                  isCurrentPeak
                    ? 'bg-rose-500 text-white shadow-md hover:bg-rose-600'
                    : 'border-rose-200 text-rose-600 shadow-sm hover:bg-rose-50'
                )}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                {peakButtonLabel}
              </Button>
              </div>
              {hasOtherPeak && formattedExistingPeak && (
              <p className="text-[11px] text-rose-500 font-medium">
                Ya hay un pico registrado el {formattedExistingPeak}.
              </p>
            )}
            {!hasOtherPeak && isCurrentPeak && (
              <p className="text-[11px] text-rose-500">
                Este día se marcará como pico y los tres siguientes quedarán etiquetados.
              </p>
            )}
        </div>
        </div>
      )}

      
      {/* Símbolo de fertilidad */}
      <div className="space-y-2 bg-gradient-to-r from-stone-50 to-slate-50 rounded-xl p-3 border border-slate-100/50">
        <Label htmlFor="fertilitySymbol" className="flex items-center text-slate-800 text-sm font-semibold">
          <Sprout className="mr-2 h-5 w-5 text-slate-400" />
          Símbolo de Fertilidad
        </Label>
        <Select value={fertilitySymbol} onValueChange={setFertilitySymbol} disabled={isProcessing}>
          <SelectTrigger className="w-full bg-white border-slate-200 text-gray-800 hover:bg-white">
            <SelectValue placeholder="Selecciona un símbolo" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200 text-gray-800">
            {FERTILITY_SYMBOL_OPTIONS.map((symbol) => (
              <SelectItem key={symbol.value} value={symbol.value} className="cursor-pointer">
                <div className="flex items-center">
                  <span className={`w-4 h-4 rounded-full mr-2 border border-gray-300 ${symbol.color}`} />
                  {symbol.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Sensación y apariencia */}
      <div className="space-y-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100/50">
        <Label htmlFor="mucusSensation" className="flex items-center text-slate-800 text-sm font-semibold">
          <Droplets className="mr-2 h-5 w-5 text-sky-600" />
          Sensación del moco
        </Label>
        <Input
          id="mucusSensation"
          value={mucusSensation}
          onChange={(e) => setMucusSensation(e.target.value)}
          className="bg-white/70 border-blue-200 text-gray-800 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 text-base"
          disabled={isProcessing}
        />
      </div>
      <div className="space-y-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-3 border border-emerald-100/50">
        <Label htmlFor="mucusAppearance" className="flex items-center text-slate-800 text-sm font-semibold">
          <Circle className="mr-2 h-5 w-5 text-emerald-600" />
          Apariencia del moco
        </Label>
        <Input
          id="mucusAppearance"
          value={mucusAppearance}
          onChange={(e) => setMucusAppearance(e.target.value)}
          className="bg-white/70 border-emerald-200 text-gray-800 placeholder-gray-400 focus:ring-emerald-500 focus:border-emerald-500 text-base"
          disabled={isProcessing}
        />
      </div>

      {/* Observaciones */}
      <div className="space-y-2 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-3 border border-violet-100/50">
        <Label htmlFor="observations" className="flex items-center text-slate-800 text-sm font-semibold">
          Observaciones
        </Label>
        <Textarea
          id="observations"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          className="bg-white/70 border-violet-200 text-gray-800 placeholder-gray-400 focus:ring-violet-500 focus:border-violet-500 text-base min-h-[40px] resize-none"
          disabled={isProcessing}
        />
      </div>
      

    </>
  );
};

export default DataEntryFormFields;
