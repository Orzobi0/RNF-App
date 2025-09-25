import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, Thermometer, Droplets, Circle, Eye, Calendar, Clock, Edit3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import computePeakStatuses from '@/lib/computePeakStatuses';

const RecordsList = ({ records, onEdit, onDelete, isProcessing }) => {
  if (!records || records.length === 0) {
    return (
      <motion.div
        className="text-center py-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white/70 backdrop-blur-md rounded-3xl p-8 border border-pink-200/50 shadow-lg mx-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-100 to-rose-100 rounded-full flex items-center justify-center">
            <Eye className="w-8 h-8 text-pink-500" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay registros</h3>
          <p className="text-slate-500">Añade tu primer registro para comenzar.</p>
        </div>
      </motion.div>
    );
  }

  const getSymbolInfo = (symbolValue) => {
    return FERTILITY_SYMBOL_OPTIONS.find(s => s.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0];
  };
const peakStatuses = useMemo(() => computePeakStatuses(records), [records]);
  const peakLabelMap = {
    P: 'Día pico',
    1: 'Post pico 1',
    2: 'Post pico 2',
    3: 'Post pico 3',
  };

  const sortedRecords = [...records].sort((a, b) => {
    return parseISO(b.isoDate) - parseISO(a.isoDate);
  });

  return (
    <motion.div
      className="space-y-3"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: 0.05
          }
        }
      }}
      initial="hidden"
      animate="show"
    >
      {sortedRecords.map((record, index) => {
        const symbolInfo = getSymbolInfo(record.fertility_symbol);
        const selectedMeasurement =
          record.measurements?.find(m => m.selected) ||
          (record.temperature_chart || record.temperature_raw
            ? {
                temperature: record.temperature_chart ?? record.temperature_raw,
                temperature_corrected: record.temperature_corrected ?? null,
                time: record.timestamp ? format(parseISO(record.timestamp), 'HH:mm') : null,
                use_corrected: record.use_corrected ?? false,
              }
            : null);
        const usesCorrected = selectedMeasurement?.use_corrected ?? record.use_corrected ?? false;
        const correctedTemp =
          selectedMeasurement?.temperature_corrected ?? record.temperature_corrected ?? null;
        const rawTemp = selectedMeasurement?.temperature ?? record.temperature_chart ?? record.temperature_raw ?? null;
        const resolvedTemp = usesCorrected && correctedTemp !== null ? correctedTemp : rawTemp ?? correctedTemp;
        const hasTemperature = resolvedTemp !== null;
        const displayTemp = resolvedTemp;
        const showCorrectedIndicator = usesCorrected && correctedTemp !== null;
        const peakStatus = peakStatuses[record.isoDate];
        const peakLabel = peakStatus ? peakLabelMap[peakStatus] || null : null;

        return (
          <motion.div
            key={record.id}
            className="bg-white/80 backdrop-blur-md border border-pink-200/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:bg-white/90 rounded-xl"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
          >
            <div className="p-4">
              {/* Encabezado con fecha y símbolo */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-pink-500 flex-shrink-0" />
                  <span className="font-semibold text-slate-700 text-lg">
                    {format(parseISO(record.isoDate), 'dd/MM/yyyy', { locale: es })}
                  </span>
                  <span className="text-md text-slate-600">Día {record.cycleDay}</span>
                  {peakLabel && (
                    <Badge className="ml-2 bg-rose-100 text-rose-600 border border-rose-200">
                      {peakLabel}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-1 ml-2">
                  {symbolInfo.label !== 'Sin símbolo' && (
                    <span className="text-xs text-slate-600">{symbolInfo.label}</span>
                  )}
                  <div
                    className={`w-6 h-6 rounded-full border ${symbolInfo.color} ${symbolInfo.pattern ? 'pattern-bg' : ''} flex-shrink-0`}
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                  />
                </div>
              </div>

              {/* Temperatura y hora */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-800">
                <div className="flex items-center space-x-1 bg-gradient-to-r from-amber-200 to-orange-200 border border-amber-300/50 p-2 rounded-xl">
                  <Thermometer className="w-3 h-3 text-rose-400" />
                  <span className="font-medium">{hasTemperature ? `${displayTemp}°C` : ''}</span>
                                      {showCorrectedIndicator && (
                    <span
                      className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.65)]"
                      title="Temperatura corregida"
                    />
                  )}
                  {hasTemperature && record.ignored && (
                    <Badge variant="secondary" className="text-xs py-0 px-1 bg-slate-200 text-slate-600">
                      Ignorada
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-1 bg-slate-200 border border-gray-300/50 p-2 rounded-xl">
                  {selectedMeasurement?.time && (
                    <>
                      <Clock className="w-3 h-3 text-gray-600" />
                      <span>{selectedMeasurement.time}</span>
                    </>
                  )}
                </div>
              </div>
              
              {Array.isArray(record.measurements) && record.measurements.length > 1 && (
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  {record.measurements.map((m, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <span>{m.time}</span>
                      <span>{m.temperature}</span>
                      {m.selected && <Badge className="ml-1" variant="secondary">Principal</Badge>}
                    </div>
                  ))}
                </div>
              )}
       
              {/* Sensación y apariencia */}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2 bg-gradient-to-r from-blue-100 to-indigo-100 border border-blue-500/50 p-2 rounded-xl">
                  <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <Droplets className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-semibold text-blue-800 truncate">{record.mucus_sensation || record.mucusSensation || ''}</span>
                </div>
                <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-500/50 p-2 rounded-xl">
                  <div className="w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                    <Circle className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-semibold text-green-800 truncate">{record.mucus_appearance || record.mucusAppearance || ''}</span>
                </div>
              </div>

              {/* Observaciones y acciones */}
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-start text-xs text-slate-600">
                <div className="flex items-center gap-2 bg-gradient-to-r from-violet-100 to-purple-100 border border-violet-500/50 p-2 rounded-xl">
                  <div className="w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                    <Edit3 className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-semibold text-violet-800 truncate">{record.observations || ''}</span>
                </div>
                <div className="flex space-x-1">
                  <Button
                    type="button"
                    onClick={() => onEdit(record)}
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-pink-300 text-pink-600 hover:bg-pink-50 hover:border-pink-400"
                    disabled={isProcessing}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onDelete(record.id)}
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-rose-300 text-rose-600 hover:bg-rose-800 hover:border-rose-800"
                    disabled={isProcessing}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

export default RecordsList;