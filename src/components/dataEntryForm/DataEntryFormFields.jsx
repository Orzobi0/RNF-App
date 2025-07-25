import React from 'react';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Textarea } from '@/components/ui/textarea'; 
    import { Checkbox } from '@/components/ui/checkbox';
    import { Calendar } from "@/components/ui/calendar";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Button } from '@/components/ui/button';
    import { Thermometer, Droplets, Eye, EyeOff, CalendarDays, CheckSquare, Edit, Palette, Clock } from 'lucide-react';
    import { cn } from "@/lib/utils";
    import { format, addDays, startOfDay, parseISO } from "date-fns";
    import { es } from 'date-fns/locale';
    import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import { useEffect, useState } from 'react';


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
      isProcessing, isEditing, initialData, cycleStartDate
    }) => {
      const [open, setOpen] = useState(false);

      useEffect(() => {
        if (isEditing && initialData) {
          // Fecha
          setDate(initialData.timestamp
            ? parseISO(initialData.timestamp)
            : parseISO(initialData.isoDate));
          setTime(initialData.timestamp ? format(parseISO(initialData.timestamp), 'HH:mm') : '');
          // Temperaturas
          setTemperatureRaw(initialData.temperature_raw ?? '');
          setTemperatureCorrected(initialData.temperature_corrected ?? '');
          setUseCorrected(initialData.use_corrected ?? false);
          // Moco
          setMucusSensation(initialData.mucus_sensation ?? '');
          setMucusAppearance(initialData.mucus_appearance ?? '');
          // Símbolo
          setFertilitySymbol(initialData.fertility_symbol ?? 'none');
          // Observaciones
          setObservations(initialData.observations ?? '');
          setIgnored(initialData.ignored ?? false);
        }
      }, [isEditing, initialData]);
      
      const cycleStart = startOfDay(parseISO(cycleStartDate));
      const disabledDateRanges = [
        { before: cycleStart },
        { after: addDays(cycleStart, 45) } 
      ];

      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center text-[#32334d] text-lg">
                <CalendarDays className="mr-2 h-5 w-5 text-pink-400" />
              Fecha del Registro
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal bg-slate-700 border-slate-600 text-slate-50 hover:bg-slate-600 hover:text-slate-50",
                    !date && "text-muted-foreground"
                  )}
                  disabled={isProcessing}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-700 border-slate-600 text-slate-50" align="start">
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
                  className="[&_button]:text-slate-50 [&_button:hover]:bg-slate-600 [&_button[aria-selected=true]]:bg-pink-500"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="temperatureRaw" className="flex items-center text-[#32334d] text-lg">
              <Thermometer className="mr-2 h-5 w-5 text-rose-400" />
              {isEditing ? "Temperatura Original (°C)" : "Temperatura Basal (°C)"} <span className="text-sm text-[#32334d] ml-1">(Opcional)</span>
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
              className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base"
              disabled={isProcessing || (isEditing && initialData?.temperature_raw !== null && initialData?.temperature_raw !== undefined)}
            readOnly={isEditing && initialData?.temperature_raw !== null && initialData?.temperature_raw !== undefined}
          />
          <div className="space-y-2">
            <Label htmlFor="time" className="flex items-center text-[#32334d] text-lg">
              <Clock className="mr-2 h-5 w-5 text-rose-400" />
              Hora de la Temperatura <span className="text-sm text-[#32334d] ml-1">(Opcional)</span>
            </Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base"
              disabled={isProcessing}
            />
          </div>
        </div>

          {isEditing && (
                      <div>
                        <div className="space-y-3 p-4 border border-slate-700 rounded-md bg-slate-200/30">
                          <Label htmlFor="temperatureCorrected" className="flex items-center text-[#32334d] text-md">
                            <Edit className="mr-2 h-4 w-4 text-amber-400" />
                            Temperatura Corregida (°C) <span className="text-sm text-slate-400 ml-1">(Opcional)</span>
                          </Label>
                          <div className="flex items-center space-x-2"></div>              
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
                            className="bg-slate-600 border-slate-500 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base"
                            disabled={isProcessing}
                          />
                          {/* Botón “X” para borrar corrección */}
                            <button
                              type="button"
                              onClick={() => {
                                setTemperatureCorrected('');
                                setUseCorrected(false);
                              }}
                              className="absolute right-2 transform -translate-y-20 text-rose-400  hover:text-rose-400"
                              title="Eliminar corrección"
                              >
                                X
                                </button>
                            </div>
          
                          <div className="flex items-center space-x-2 mt-2">
                            <Checkbox
                              id="useCorrected"
                              checked={useCorrected}
                              onCheckedChange={setUseCorrected}
                              className="data-[state=checked]:bg-pink-500 data-[state=checked]:text-white border-slate-500"
                              disabled={isProcessing || temperatureCorrected === ''}
                            />
                            <Label htmlFor="useCorrected" className="text-sm text-slate-300">
                              Usar corrección en la gráfica
                            </Label>
                          </div>
                           <Button
                            type="button"
                            variant={ignored ? 'outline' : 'destructive'}
                            size="sm"
                            onClick={() => setIgnored(!ignored)}
                            className="mt-2 hover:bg-rose-200/20"
                            disabled={isProcessing}
                          >
                            {ignored ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                            {ignored ? 'Restaurar' : 'Despreciar'}
                          </Button>
                        </div>
                      
                      
                    )}

          <div className="space-y-2">
            <Label htmlFor="fertilitySymbol" className="flex items-center text-[#32334d] text-lg">
                <Palette className="mr-2 h-5 w-5 text-teal-400" />
                Símbolo de Fertilidad
            </Label>
            <Select value={fertilitySymbol} onValueChange={setFertilitySymbol} disabled={isProcessing}>
                <SelectTrigger className="w-full bg-slate-700 border-slate-600 text-slate-50 hover:bg-slate-600 hover:text-slate-50">
                    <SelectValue placeholder="Selecciona un símbolo" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600 text-slate-50">
                    {FERTILITY_SYMBOL_OPTIONS.map(symbol => (
                        <SelectItem key={symbol.value} value={symbol.value} className="hover:bg-slate-600 focus:bg-slate-600">
                           <div className="flex items-center">
                             <span className={`w-4 h-4 rounded-full mr-2 ${symbol.color} ${symbol.pattern ? 'pattern-bg' : ''}`}></span>
                             {symbol.label}
                           </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mucusSensation" className="flex items-center text-[#32334d] text-lg">
              <Droplets className="mr-2 h-5 w-5 text-sky-400" />
              Sensación del Moco Cervical
            </Label>
            <Textarea
              id="mucusSensation"
              value={mucusSensation}
              onChange={(e) => setMucusSensation(e.target.value)}
              placeholder="Describe la sensación (ej: Seca, Húmeda, Mojada)"
              className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base min-h-[80px]"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mucusAppearance" className="flex items-center text-[#32334d] text-lg">
              <Eye className="mr-2 h-5 w-5 text-amber-400" />
              Apariencia del Moco Cervical
            </Label>
             <Textarea
              id="mucusAppearance"
              value={mucusAppearance}
              onChange={(e) => setMucusAppearance(e.target.value)}
              placeholder="Describe la apariencia (ej: Pegajoso, Elástico)"
              className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base min-h-[80px]"
              disabled={isProcessing}
            />
          </div>

           <div className="space-y-2">
            <Label htmlFor="observations" className="flex items-center text-[#32334d] text-lg">
              <CheckSquare className="mr-2 h-5 w-5 text-indigo-400" />
              Observaciones Adicionales
            </Label>
             <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Anota cualquier otra observación relevante (ej: Dolor, medicación)"
              className="bg-slate-700 border-slate-600 text-slate-50 placeholder-slate-400 focus:ring-pink-500 focus:border-pink-500 text-base min-h-[80px]"
              disabled={isProcessing}
            />
          </div>
        </>
      );
    };
    export default DataEntryFormFields;