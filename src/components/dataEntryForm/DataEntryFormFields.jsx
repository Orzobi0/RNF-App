import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Thermometer, Droplets, Eye, EyeOff, CalendarDays, CheckSquare, Edit, Sprout, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';

const DataEntryFormFields = ({
  date, setDate,
  time, setTime,
  temperatureRaw, setTemperatureRaw,
  temperatureCorrected, setTemperatureCorrected,
  useCorrected, setUseCorrected,
  mucusSensation, setMucusSensation,
  mucusAppearance, setMucusAppearance,
  fertilitySymbol, setFertilitySymbol,
  observations, setObservations,
  ignored, setIgnored,
  isProcessing, isEditing, initialData, cycleStartDate, cycleEndDate, recordedDates = []
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isEditing && initialData) {
      setDate(initialData.timestamp ? parseISO(initialData.timestamp) : parseISO(initialData.isoDate));
      setTime(initialData.timestamp ? format(parseISO(initialData.timestamp), 'HH:mm') : '');
      setTemperatureRaw(initialData.temperature_raw ?? '');
      setTemperatureCorrected(initialData.temperature_corrected ?? '');
      setUseCorrected(initialData.use_corrected ?? false);
      setMucusSensation(initialData.mucus_sensation ?? '');
      setMucusAppearance(initialData.mucus_appearance ?? '');
      setFertilitySymbol(initialData.fertility_symbol ?? 'none');
      setObservations(initialData.observations ?? '');
      setIgnored(initialData.ignored ?? false);
    }
  }, [isEditing, initialData]);
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
              classNames={{
              day_hasRecord: 'relative after:block after:w-1.5 after:h-1.5 after:rounded-full after:bg-pink-500 after:mx-auto after:mt-1'
              }}
              className="[&_button]:text-gray-800 [&_button:hover]:bg-pink-100 [&_button[aria-selected=true]]:bg-pink-500"
            />
          </PopoverContent>
        </Popover>
      </div>

     {/* Temperatura y hora */}
      <div className="space-y-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
        <Label htmlFor="temperatureRaw" className="flex items-center text-amber-800 text-sm font-semibold">
          <Thermometer className="mr-2 h-5 w-5 text-orange-500" />
          {isEditing ? 'Temperatura Original (°C)' : 'Temperatura Basal (°C)'} <span className="text-xs text-amber-700 ml-1"></span>
        </Label>
        <Input
          id="temperatureRaw"
          type="number"
          step="0.01"
          min="34.0"
          max="40.0"
          value={temperatureRaw}
          onChange={(e) => setTemperatureRaw(e.target.value)}
          placeholder="Ej: 36.50"
          className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
          disabled={isProcessing || (isEditing && initialData?.temperature_raw !== null && initialData?.temperature_raw !== undefined)}
          readOnly={isEditing && initialData?.temperature_raw !== null && initialData?.temperature_raw !== undefined}
        />
        <div className="space-y-2">
          <Label htmlFor="time" className="flex items-center text-amber-800 text-sm font-semibold">
            <Clock className="mr-2 h-5 w-5 text-orange-500" />
            Hora de la toma <span className="text-xs text-amber-700 ml-1"></span>
          </Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Temperatura corregida */}
      {isEditing && (
        <div className="space-y-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100/50">
          <Label htmlFor="temperatureCorrected" className="flex items-center text-amber-800 text-sm font-semibold">
            <Edit className="mr-2 h-4 w-4 text-orange-500" />
            Temperatura Corregida (°C) <span className="text-xs text-amber-700 ml-1">(Opcional)</span>
          </Label>
          <div className="relative">
            <Input
              id="temperatureCorrected"
              type="number"
              step="0.01"
              min="34.0"
              max="40.0"
              value={temperatureCorrected}
              onChange={(e) => {
                setTemperatureCorrected(e.target.value);
                if (e.target.value !== '') setUseCorrected(true);
              }}
              placeholder="Ej: 36.65"
              className="bg-white/70 border-amber-200 text-gray-800 placeholder-gray-400 focus:ring-orange-500 focus:border-orange-500 text-base"
              disabled={isProcessing}
            />
                        <button
              type="button"
              onClick={() => {
                setTemperatureCorrected('');
                setUseCorrected(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 hover:text-orange-600"
              title="Eliminar corrección"
            >
              X
            </button>
          </div>
                    <div className="flex items-center space-x-2">
            <Checkbox
              id="useCorrected"
              checked={useCorrected}
              onCheckedChange={setUseCorrected}
              className="data-[state=checked]:bg-orange-500 data-[state=checked]:text-white border-amber-400"
              disabled={isProcessing || temperatureCorrected === ''}
            />
            <Label htmlFor="useCorrected" className="text-xs text-amber-700">
              Usar corrección en la gráfica
            </Label>
          </div>
          <Button
            type="button"
            variant={ignored ? 'outline' : 'destructive'}
            size="sm"
            onClick={() => setIgnored(!ignored)}
            className="mt-1 hover:bg-orange-400"
            disabled={isProcessing}
          >
            {ignored ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
            {ignored ? 'Restaurar' : 'Despreciar'}
          </Button>
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
            {FERTILITY_SYMBOL_OPTIONS.map(symbol => (
              <SelectItem key={symbol.value} value={symbol.value} className="hover:bg-slate-50 focus:bg-slate-50">
                <div className="flex items-center">
                  <span className={`w-4 h-4 rounded-full mr-2 ${symbol.color} border ${symbol.pattern ? 'pattern-bg' : ''}`}></span>
                  {symbol.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Sensación del moco */}
      <div className="space-y-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100/50">
        <Label htmlFor="mucusSensation" className="flex items-center text-blue-800 text-sm font-semibold">
          <Droplets className="mr-2 h-5 w-5 text-blue-500" />
          Sensación
        </Label>
        <Textarea
          id="mucusSensation"
          value={mucusSensation}
          onChange={(e) => setMucusSensation(e.target.value)}
          placeholder="(ej: Seca, Húmeda, Mojada)"
          className="bg-white/70 border-blue-200 text-gray-800 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 text-base min-h-[40px]"
          disabled={isProcessing}
        />
      </div>

      {/* Apariencia del moco */}
      <div className="space-y-2 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-3 border border-teal-100/50">
        <Label htmlFor="mucusAppearance" className="flex items-center text-teal-800 text-sm font-semibold">
          <Eye className="mr-2 h-5 w-5 text-teal-400" />
          Apariencia
        </Label>
        <Textarea
          id="mucusAppearance"
          value={mucusAppearance}
          onChange={(e) => setMucusAppearance(e.target.value)}
          placeholder="(ej: Pegajoso, Elástico)"
          className="bg-white/70 border-teal-200 text-gray-800 placeholder-gray-400 focus:ring-teal-500 focus:border-teal-500 text-base min-h-[40px]"
          disabled={isProcessing}
        />
      </div>

     {/* Observaciones */}
      <div className="space-y-2 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-3 border border-violet-100/50">
        <Label htmlFor="observations" className="flex items-center text-violet-800 text-sm font-semibold">
          <CheckSquare className="mr-2 h-5 w-5 text-violet-400" />
          Observaciones
        </Label>
        <Textarea
          id="observations"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="(ej: Dolor, medicación)"
          className="bg-white/70 border-violet-200 text-gray-800 placeholder-gray-400 focus:ring-violet-500 focus:border-violet-500 text-base min-h-[40px]"
          disabled={isProcessing}
        />
      </div>
    </>
  );
};

export default DataEntryFormFields;
