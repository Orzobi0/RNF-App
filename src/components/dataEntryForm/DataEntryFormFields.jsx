import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Thermometer, Droplets, Eye, EyeOff, CalendarDays, Sprout, Clock, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfDay, parseISO } from 'date-fns';
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
  isProcessing,
  isEditing,
  initialData,
  cycleStartDate,
  cycleEndDate,
  recordedDates = [],
}) => {
  const [open, setOpen] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState(null);

  const handleTempAdjust = (index, delta) => {
    const current = parseFloat(
      measurements[index].temperature_corrected ?? measurements[index].temperature ?? 0
    );
    const newTemp = (current + delta).toFixed(2);
    updateMeasurement(index, 'temperature_corrected', newTemp);
  };
  const cycleStart = startOfDay(parseISO(cycleStartDate));
  const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : addDays(cycleStart, 45);
  const disabledDateRanges = [{ before: cycleStart }, { after: cycleEnd }];

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
                  'relative flex-col after:content-["" ] after:block after:w-1.5 after:h-1.5 after:rounded-full after:bg-pink-500 after:mx-auto after:mt-0.025'
              }}
              className="[&_button]:text-gray-800 [&_button:hover]:bg-pink-100 [&_button[aria-selected=true]]:bg-pink-500"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mediciones */}
      {measurements.map((m, idx) => (
        <div key={idx} className="space-y-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
          <Label className="flex items-center text-amber-800 text-sm font-semibold">
            <Thermometer className="mr-2 h-5 w-5 text-orange-500" />
            Medición {idx + 1}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              min="34.0"
              max="40.0"
              value={m.temperature}
              onChange={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
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
          <div className="flex items-center space-x-2">
            <input
              type="radio"
              checked={m.selected}
              onChange={() => selectMeasurement(idx)}
              disabled={isProcessing}
            />
            <Label className="text-xs text-amber-700">Usar en gráfica</Label>
          </div>
                   <div className="flex items-center space-x-2 mt-2">
            {!m.confirmed && (
              <>
                <Button
                  type="button"
                  size="icon"
                  onClick={() => confirmMeasurement(idx)}
                  disabled={isProcessing}
                  className="h-7 w-7"
                >
                  <Check className="h-4 w-4" />
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isProcessing}
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
          </div>
          {correctionIndex === idx && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => handleTempAdjust(idx, 0.05)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  step="0.01"
                  min="34.0"
                  max="40.0"
                  value={m.temperature_corrected}
                  onChange={(e) => updateMeasurement(idx, 'temperature_corrected', e.target.value)}
                  className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
                  disabled={isProcessing}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => handleTempAdjust(idx, -0.05)}
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
                  onCheckedChange={(checked) => updateMeasurement(idx, 'use_corrected', checked)}
                />
                <Label htmlFor={`use_corrected_${idx}`} className="text-xs">
                  Usar valor corregido
                </Label>
              </div>
            </div>
          )}

        </div>
      ))}
      <Button type="button" onClick={addMeasurement} disabled={isProcessing} className="mb-2">
        Añadir medición
      </Button>
      {/* Símbolo de fertilidad */}
      <div className="space-y-2 bg-gradient-to-r from-stone-50 to-slate-50 rounded-xl p-3 border border-slate-100/50">
        <Label htmlFor="fertilitySymbol" className="flex items-center text-slate-800 text-sm font-semibold">
          <Sprout className="mr-2 h-5 w-5 text-slate-400" />
          Símbolo de Fertilidad
        </Label>
        <Select value={fertilitySymbol} onValueChange={setFertilitySymbol} disabled={isProcessing}>
          <SelectTrigger className="w-full bg-white border-slate-200 text-gray-800 hover:bg-white">
            <div className="flex items-center">
              <span
                className={`w-3 h-3 rounded-full mr-2 border border-gray-300 ${
                  (FERTILITY_SYMBOL_OPTIONS.find((s) => s.value === fertilitySymbol)?.color) || 'bg-gray-200'
                }`}
              />
              <SelectValue placeholder="Selecciona un símbolo" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200 text-gray-800">
            {FERTILITY_SYMBOL_OPTIONS.map((symbol) => (
              <SelectItem key={symbol.value} value={symbol.value} className="cursor-pointer">
                <div className="flex items-center">
                  <span className={`w-3 h-3 rounded-full mr-2 border border-gray-300 ${symbol.color}`} />
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
          <Droplets className="mr-2 h-5 w-5 text-indigo-600" />
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
          className="bg-white/70 border-violet-200 text-gray-800 placeholder-gray-400 focus:ring-violet-500 focus:border-violet-500 text-base"
          disabled={isProcessing}
        />
      </div>
      
      {/* Ignorar */}
      {isEditing && (
        <div className="space-y-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ignored"
              checked={ignored}
              onCheckedChange={setIgnored}
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
    </>
  );
};

export default DataEntryFormFields;
