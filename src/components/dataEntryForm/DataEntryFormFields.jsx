import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  Heart,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfDay, parseISO, addHours, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import { AnimatePresence, motion } from 'framer-motion';
import {
  computePeakState,
  getToggleFeedback,
  toggleSection,
  SECTION_METADATA,
} from '@/components/dataEntryForm/sectionLogic';

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
  hadRelations,
  setHadRelations,
  ignored,
  setIgnored,
  peakTag,
  setPeakTag,
  existingPeakIsoDate,
  isProcessing,
  isEditing,
  cycleStartDate,
  cycleEndDate,
  recordedDates = [],
  submitCurrentState,
}) => {
  const [open, setOpen] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState(null);
  const [openSections, setOpenSections] = useState([]);
  const [statusMessages, setStatusMessages] = useState({ peak: null, relations: null });
  const initializedSectionsRef = useRef(false);

  useEffect(() => {
    setOpenSections([]);
    setStatusMessages({ peak: null, relations: null });
    initializedSectionsRef.current = false;
  }, [date]);

  useEffect(() => {
    if (correctionIndex !== null) {
      return;
    }

    const existingCorrectionIndex = measurements.findIndex((measurement) => {
      if (!measurement) return false;

      return Boolean(measurement.use_corrected);
    });

    if (existingCorrectionIndex !== -1) {
      setCorrectionIndex(existingCorrectionIndex);
    }
  }, [correctionIndex, measurements]);

  const handleTempAdjust = (index, delta) => {
    const originalTemp = parseFloat(measurements[index].temperature ?? 0);
    const current = parseFloat(measurements[index].temperature_corrected ?? originalTemp);
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
  const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;
  const disabledDateRanges = cycleEnd ? [{ before: cycleStart }, { after: cycleEnd }] : [{ before: cycleStart }];
  const selectedIsoDate = date ? format(date, 'yyyy-MM-dd') : null;
  
  const { mode: peakMode, isPeakDay } = computePeakState({
    peakTag,
    existingPeakIsoDate,
    selectedIsoDate,
  });

  const peakButtonLabel =
    peakMode === 'assign'
      ? 'Asignar día pico'
      : peakMode === 'update'
        ? 'Actualizar día pico'
        : 'Quitar día pico';

  const peakButtonBaseClasses = [
    'flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold uppercase tracking-wide transition-all duration-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'min-h-[44px] min-w-[44px]'
  ];

  const peakToneMap = {
    assign:
      'bg-rose-500 text-white border border-rose-500 rounded-full hover:bg-rose-600 focus-visible:ring-rose-300 shadow-[0_6px_14px_-2px_rgba(244,63,94,0.45)]',
    update:
      'bg-white text-amber-600 border border-amber-400 rounded-full hover:bg-amber-500 hover:text-white focus-visible:ring-amber-300 shadow-[0_6px_14px_-2px_rgba(245,158,11,0.45)]',
    remove:
      'bg-white text-rose-700 border border-rose-300 rounded-full hover:bg-rose-50 focus-visible:ring-rose-200 shadow-[0_6px_14px_-2px_rgba(244,63,94,0.25)]',
  };

  const peakButtonClasses = cn(...peakButtonBaseClasses, peakToneMap[peakMode]);

  const togglePeakTag = async () => {
    if (isProcessing || typeof submitCurrentState !== 'function' || !selectedIsoDate) {
      return;
    }

    const newPeakTag = isPeakDay ? null : 'peak';
    setPeakTag(newPeakTag);

    try {
      await submitCurrentState({
        peakTagOverride: newPeakTag,
        keepFormOpen: true,
        skipReset: true,
      });
      const message = getToggleFeedback('peak', isPeakDay, newPeakTag === 'peak');
      if (message) {
        setStatusMessages((prev) => ({
          ...prev,
          peak: message,
        }));
      }
    } catch (error) {
      // Restore previous peak marker if the submission fails
      setPeakTag(isPeakDay ? 'peak' : null);
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

    if (!nextValue && correctionIndex === index) {
      setCorrectionIndex(null);
    }

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
  const relationsButtonClasses = cn(
    'inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
    hadRelations
      ? 'border-rose-400 bg-rose-50 text-rose-600 hover:bg-rose-100 focus-visible:ring-rose-200'
      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-200'
  );

  const handleRelationsToggle = async () => {
    if (isProcessing || typeof submitCurrentState !== 'function' || !selectedIsoDate) {
      return;
    }

    const previousValue = hadRelations;
    const nextValue = !previousValue;

    setHadRelations(nextValue);

    try {
      await submitCurrentState({
        overrideHadRelations: nextValue,
        keepFormOpen: true,
        skipReset: true,
      });

      const message = getToggleFeedback('relations', previousValue, nextValue);
      if (message) {
        setStatusMessages((current) => ({
          ...current,
          relations: message,
        }));
      }
      } catch (error) {
      setHadRelations(previousValue);
    }
  };

  const handleSectionToggle = (key) => {
    setOpenSections((current) => toggleSection(current, key));
  };

  const sectionOrder = useMemo(
    () => [
      { ...SECTION_METADATA.temperature, icon: Thermometer },
      { ...SECTION_METADATA.symbol, icon: Sprout },
      { ...SECTION_METADATA.sensation, icon: Droplets },
      { ...SECTION_METADATA.appearance, icon: Circle },
      { ...SECTION_METADATA.observations, icon: Edit3 },
    ],
    []
  );

  const filledBySection = useMemo(() => {
    const hasTemperature = measurements.some((measurement) => {
      if (!measurement) return false;
      const baseTemp = measurement.temperature;
      const correctedTemp = measurement.temperature_corrected;
      return [baseTemp, correctedTemp].some((value) => {
        if (value === undefined || value === null) return false;
        return String(value).trim() !== '';
      });
    });

    const hasSymbol = (() => {
      if (typeof fertilitySymbol === 'string') {
        const trimmed = fertilitySymbol.trim();
        if (!trimmed) return false;
        return trimmed !== 'none';
      }
      return Boolean(fertilitySymbol);
    })();
    const hasSensation = Boolean(mucusSensation && mucusSensation.trim());
    const hasAppearance = Boolean(mucusAppearance && mucusAppearance.trim());
    const hasObservations = Boolean(observations && observations.trim());

    return {
      temperature: hasTemperature,
      symbol: hasSymbol,
      sensation: hasSensation,
      appearance: hasAppearance,
      observations: hasObservations,
    };
  }, [
    fertilitySymbol,
    measurements,
    mucusAppearance,
    mucusSensation,
    observations,
  ]);

  useEffect(() => {
    if (!isEditing) {
      initializedSectionsRef.current = false;
      return;
    }

    if (initializedSectionsRef.current) {
      return;
    }

    const filledKeys = sectionOrder
      .map((section) => section.key)
      .filter((key) => filledBySection[key]);

    if (filledKeys.length === 0) {
      return;
    }

    setOpenSections((current) => {
      const next = Array.from(new Set([...current, ...filledKeys]));
      return next;
    });

    initializedSectionsRef.current = true;
  }, [filledBySection, isEditing, sectionOrder]);

  useEffect(() => {
    if (!isEditing) {
      initializedSectionsRef.current = false;
      setOpenSections([]);
    }
  }, [isEditing]);

  const sectionStyles = useMemo(
    () => ({
      temperature: {
        activeBorder: 'border-orange-300',
        activeBg: 'bg-orange-50',
        activeText: 'text-orange-600',
        filledText: 'text-orange-500',
        focusRing: 'focus-visible:ring-orange-200',
      },
      symbol: {
        activeBorder: 'border-slate-300',
        activeBg: 'bg-slate-100',
        activeText: 'text-slate-600',
        filledText: 'text-slate-600',
        focusRing: 'focus-visible:ring-slate-200',
      },
      sensation: {
        activeBorder: 'border-sky-300',
        activeBg: 'bg-sky-50',
        activeText: 'text-sky-600',
        filledText: 'text-sky-500',
        focusRing: 'focus-visible:ring-sky-200',
      },
      appearance: {
        activeBorder: 'border-emerald-300',
        activeBg: 'bg-emerald-50',
        activeText: 'text-emerald-600',
        filledText: 'text-emerald-500',
        focusRing: 'focus-visible:ring-emerald-200',
      },
      observations: {
        activeBorder: 'border-violet-300',
        activeBg: 'bg-violet-50',
        activeText: 'text-violet-600',
        filledText: 'text-violet-500',
        focusRing: 'focus-visible:ring-violet-200',
      },
    }),
    []
  );

  const renderSectionContent = (key) => {
    switch (key) {
      case 'temperature':
        return (
          <div className="space-y-3 rounded-3xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow-sm">
            {measurements.map((m, idx) => {
              const measurementSelectId = `measurement_select_${idx}`;
              return (
                <div key={idx} className="space-y-3 rounded-xl border border-amber-200/60 bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Label className="flex items-center text-amber-800 text-sm font-semibold">
                      <Thermometer className="mr-2 h-5 w-5 text-orange-500" />
                      Medición {idx + 1}
                    </Label>
                    <label
                      htmlFor={measurementSelectId}
                      className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm"
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
                      data-field={idx === 0 ? 'temperature' : undefined}
                      type="number"
                      step="0.01"
                      min="34.0"
                      max="40.0"
                      value={m.temperature}
                      onChange={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                      onInput={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                      placeholder="36.50"
                      className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 text-base"
                      disabled={isProcessing}
                    />
                    <Input
                      data-field={idx === 0 ? 'time' : undefined}
                      type="time"
                      value={m.time}
                      onChange={(e) => updateMeasurement(idx, 'time', e.target.value)}
                      className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 text-base"
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        className="bg-slate-200 text-slate-600"
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
                      {isEditing && Boolean(m.temperature) && (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleIgnoredChange(!ignored)}
                          className={cn(
                            'h-9 w-9 border-amber-200 text-amber-600 transition-colors',
                            ignored ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-white/70 hover:bg-amber-100'
                          )}
                          title={ignored ? 'Restaurar' : 'Despreciar'}
                          aria-label={ignored ? 'Restaurar medición ignorada' : 'Despreciar medición seleccionada'}
                        >
                          {ignored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                      )}
                      {!m.confirmed && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            onClick={() => confirmMeasurement(idx)}
                            disabled={isProcessing}
                            className="h-9 w-9"
                            aria-label="Confirmar medición"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            onClick={() => removeMeasurement(idx)}
                            disabled={isProcessing}
                            className="h-9 w-9"
                            aria-label="Eliminar medición"
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
                      className="ml-auto flex items-center gap-1 rounded-full border-amber-300 bg-amber-50/80 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
                      aria-label="Añadir una nueva medición"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Añadir medición
                    </Button>
                  </div>

                  {correctionIndex === idx && (
                    <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-white/80 p-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                          className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 text-base"
                          disabled={isProcessing}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleTempAdjust(idx, 0.1)}
                          aria-label="Aumentar temperatura corregida"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleTempAdjust(idx, -0.1)}
                          aria-label="Disminuir temperatura corregida"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-500" />
                          <Input
                            type="time"
                            value={m.time_corrected}
                            onChange={(e) => updateMeasurement(idx, 'time_corrected', e.target.value)}
                            className="bg-white/70 border-amber-200 text-gray-800 focus:border-orange-500 focus:ring-orange-500 text-base"
                            disabled={isProcessing}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
          </div>
        );
      case 'symbol':
        return (
          <div className="space-y-3 rounded-3xl border border-slate-300/60 bg-gradient-to-r from-stone-100 to-slate-100 p-3 shadow-sm">
            <div className="flex flex-col gap-3">
              <Label htmlFor="fertilitySymbol" className="flex items-center text-slate-800 text-sm font-semibold">
                <Sprout className="mr-2 h-5 w-5 text-slate-500" />
                Símbolo de Fertilidad
              </Label>
              <Select value={fertilitySymbol} onValueChange={setFertilitySymbol} disabled={isProcessing}>
                <SelectTrigger
                  className="w-full bg-white border-slate-200 text-gray-800 hover:bg-white"
                  data-field="fertilitySymbol"
                >
                  <SelectValue placeholder="Selecciona un símbolo" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-gray-800">
                  {FERTILITY_SYMBOL_OPTIONS.map((symbol) => (
                    <SelectItem key={symbol.value} value={symbol.value} className="cursor-pointer">
                      <div className="flex items-center">
                        <span
                          className={cn(
                            'mr-2 h-4 w-4 rounded-full border border-gray-300',
                            symbol.pattern === 'spotting-pattern' ? 'spotting-pattern-icon' : symbol.color
                          )}
                        />
                        {symbol.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 'sensation':
        return (
          <div className="space-y-2 rounded-3xl border border-blue-300/60 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 shadow-sm">
            <Label htmlFor="mucusSensation" className="flex items-center text-slate-800 text-sm font-semibold">
              <Droplets className="mr-2 h-5 w-5 text-sky-600" />
              Sensación del moco
            </Label>
            <Input
              data-field="mucusSensation"
              id="mucusSensation"
              value={mucusSensation}
              onChange={(e) => setMucusSensation(e.target.value)}
              className="bg-white/70 border-blue-200 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 text-base"
              disabled={isProcessing}
            />
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-2 rounded-3xl border border-emerald-300/60 bg-gradient-to-r from-emerald-50 to-teal-50 p-3 shadow-sm">
            <Label htmlFor="mucusAppearance" className="flex items-center text-slate-800 text-sm font-semibold">
              <Circle className="mr-2 h-5 w-5 text-emerald-600" />
              Apariencia del moco
            </Label>
            <Input
              data-field="mucusAppearance"
              id="mucusAppearance"
              value={mucusAppearance}
              onChange={(e) => setMucusAppearance(e.target.value)}
              className="bg-white/70 border-emerald-200 text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:ring-emerald-500 text-base"
              disabled={isProcessing}
            />
          </div>
        );
      case 'observations':
        return (
          <div className="space-y-2 rounded-3xl border border-violet-300/60 bg-gradient-to-r from-violet-50 to-purple-50 p-3 shadow-sm">
            <Label htmlFor="observations" className="flex items-center text-slate-800 text-sm font-semibold">
              <Edit3 className="mr-2 h-5 w-5 text-violet-600" />
              Observaciones
            </Label>
            <Textarea
              data-field="observations"
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="min-h-[40px] resize-none bg-white/70 border-violet-200 text-gray-800 placeholder-gray-400 focus:border-violet-500 focus:ring-violet-500 text-base"
              disabled={isProcessing}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-2 rounded-3xl border border-pink-300/50 bg-gradient-to-r from-pink-50 to-rose-50 p-3">
        <Label htmlFor="date" className="flex items-center text-pink-700 text-sm font-semibold">
          <CalendarDays className="mr-2 h-5 w-5 text-pink-400" />
          Fecha del Registro
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal bg-white/70 border-pink-200 text-gray-800 hover:bg-white/70 hover:text-gray-800',
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
                if (!selectedDate) {
                  setOpen(false);
                  return;
                }

                setDate(startOfDay(selectedDate));
                setOpen(false);
              }}
              initialFocus
              locale={es}
              disabled={isProcessing ? () => true : disabledDateRanges}
              modifiers={{ hasRecord: recordedDates }}
              modifiersClassNames={{
                hasRecord:
                  'relative after:content-["" ] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:w-1.5 after:h-1.5 after:rounded-full after:bg-pink-500',
              }}
              className="[&_button]:text-gray-800 [&_button:hover]:bg-pink-100 [&_button[aria-selected=true]]:bg-pink-500"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-4 p-0 bg-transparent border-0 shadow-none">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {sectionOrder.map((section) => {
            const Icon = section.icon;
            const isActive = openSections.includes(section.key);
            const styles = sectionStyles[section.key] || {};
            const isFilled = filledBySection[section.key];
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => handleSectionToggle(section.key)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  styles.focusRing,
                  isActive
                    ? cn('shadow-inner', styles.activeBorder, styles.activeBg, styles.activeText)
                    : cn('border-transparent bg-transparent hover:bg-slate-100',
                        isFilled ? styles.filledText : 'text-slate-500'
                      ),
                  !isActive && !isFilled && 'text-slate-500',
                  'min-h-[44px] min-w-[44px]'
                )}
                aria-label={section.ariaLabel}
                aria-expanded={isActive}
                aria-controls={`${section.key}-panel`}
              >
              <Icon
                  className={cn(
                    'h-5 w-5',
                    isActive
                      ? styles.activeText
                      : isFilled
                        ? styles.filledText
                        : 'text-slate-500'
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">{section.srLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={togglePeakTag}
            className={peakButtonClasses}
            aria-pressed={isPeakDay}
            aria-label={peakButtonLabel}
            disabled={isProcessing || !selectedIsoDate}
          >
            Día pico
          </button>
          <button
            type="button"
            className={relationsButtonClasses}
            onClick={handleRelationsToggle}
            disabled={isProcessing || !selectedIsoDate}
            aria-pressed={hadRelations}
            aria-label={hadRelations ? 'Desmarcar relaciones sexuales' : 'Marcar relaciones sexuales'}
          >
            <span className="text-xs font-semibold uppercase tracking-wide">RS</span>
            <Heart className={cn('h-4 w-4', hadRelations ? 'text-rose-500 fill-current' : 'text-slate-400')} aria-hidden="true" />
          </button>
        </div>
        {(statusMessages.peak || statusMessages.relations) && (
          <div className="flex flex-col gap-1">
            {statusMessages.peak && (
              <span className="text-xs font-medium text-rose-600" role="status" aria-live="polite">
                {statusMessages.peak}
              </span>
            )}
            {statusMessages.relations && (
              <span className="text-xs font-medium text-rose-600" role="status" aria-live="polite">
                {statusMessages.relations}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-3">
        <AnimatePresence initial={false}>
          {sectionOrder
            .filter((section) => openSections.includes(section.key))
            .map((section) => (
              <motion.div
                key={section.key}
                id={`${section.key}-panel`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  {renderSectionContent(section.key)}
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

    </>
  );
};

export default DataEntryFormFields;
