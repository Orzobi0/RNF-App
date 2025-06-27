import React from 'react';
    import { Button } from '@/components/ui/button';
    import { Edit3, Trash2, XCircle, Check } from 'lucide-react';
    import { motion } from 'framer-motion';
    import { ScrollArea } from "@/components/ui/scroll-area";
    import { format, parseISO } from 'date-fns';
    import { es } from 'date-fns/locale';
    import { getSymbolAppearance } from '@/config/fertilitySymbols';

const RecordsList = ({ records, onEdit, onDelete, onClose, isArchiveView = false, isProcessing }) => {
      if (!records || records.length === 0) {
        return (
          <motion.div
            className="text-center text-[#6B7280] p-8 bg-white rounded-xl shadow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-xl mb-4">No hay registros para mostrar.</p>
            {onClose && !isArchiveView && (
              <Button onClick={onClose} variant="outline" className="border-[#393C65] hover:bg-[#E27DBF]/10 text-[#393C65]">
                <XCircle className="mr-2 h-5 w-5" />
                Cerrar
              </Button>
            )}
          </motion.div>
        );
      }

      const sortedRecords = [...records].sort((a, b) => {
        const dateA = a.timestamp ? parseISO(a.timestamp) : (a.isoDate ? parseISO(a.isoDate) : 0);
        const dateB = b.timestamp ? parseISO(b.timestamp) : (b.isoDate ? parseISO(b.isoDate) : 0);
        return dateA - dateB;
      });


      return (
        <motion.div
          className="bg-white p-4 sm:p-6 rounded-xl border border-[#E5E7EB] shadow"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-[#393C65]">
              {isArchiveView ? "Registros del Ciclo" : "Mis Registros"}
            </h2>
            {onClose && !isArchiveView && (
              <Button onClick={onClose} variant="ghost" size="icon" className="text-[#393C65] hover:text-[#E27DBF] hover:bg-[#E27DBF]/10">
                <XCircle className="h-6 w-6" />
              </Button>
            )}
          </div>
          <ScrollArea className="h-[400px] pr-4">
            <ul className="space-y-4">
              {sortedRecords.map((record) => {
                const symbolInfo = getSymbolAppearance(record.fertility_symbol);
                const dateToFormat = record.timestamp || record.isoDate;
                  const timeToFormat = record.timestamp ? format(parseISO(record.timestamp), 'HH:mm') : null;
                return (
                   <motion.li
                    key={record.id || dateToFormat}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white border border-[#E5E7EB] rounded-[10px]"
                    style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex-grow mb-3 sm:mb-0">
                        <p className="text-lg font-medium text-[#1F2937]">
                      {dateToFormat ? format(parseISO(dateToFormat), "dd/MM/yyyy", { locale: es }) : 'Fecha no disponible'} (Día {record.cycleDay || 'N/A'})
                                            </p>
                        {record.temperature_raw != null && (
                            <p className="text-sm text-[#6B7280]">
                              <span className="font-semibold">Original:</span> {record.temperature_raw.toFixed(2)}°C
                              {timeToFormat && (
                                <span className="ml-2 text-xs text-[#9CA3AF]">{timeToFormat}</span>
                              )}
                              {/* si existe corregida y usamos la original, muestro el check */}
                              {record.temperature_corrected != null && !record.use_corrected && (
                                <Check className="inline h-4 w-4 text-[#E27DBF] ml-1" />
                              )}
                            </p>
                          )}

                       {record.temperature_corrected != null && (
                          <p className="text-sm text-[#6B7280]">
                            <span className="font-semibold">
                                Corregida:
                                </span>{' '}
                                {record.temperature_corrected.toFixed(2)}°C
                                                                {timeToFormat && (
                                  <span className="ml-2 text-xs text-[#9CA3AF]">{timeToFormat}</span>
                                )}
                                {record.use_corrected && <Check className="inline h-4 w-4 text-emerald-400 ml-1" />}
                          </p>
                        )}

                      
                      <div className="flex items-center mt-1">
                         {symbolInfo && symbolInfo.value !== 'none' && (
                            <span className={`w-4 h-4 rounded-full mr-2 ${symbolInfo.color} ${symbolInfo.pattern ? 'pattern-bg' : ''}`}></span>
                         )}
                         <p className={`text-sm ${symbolInfo ? symbolInfo.textColor : 'text-[#6B7280]'}`}>{symbolInfo ? symbolInfo.label : 'Sin Símbolo'}</p>
                      </div>
                      <p className="text-sm text-[#6B7280] mt-1">
                        <span className="font-semibold">Sensación:</span> {record.mucus_sensation || 'N/A'}
                      </p>
                      <p className="text-sm text-[#6B7280]">
                        <span className="font-semibold">Apariencia:</span> {record.mucus_appearance || 'N/A'}
                      </p>
                      {record.observations && (
                        <p className="text-sm text-[#6B7280] mt-1 italic">
                          <span className="font-semibold">Observaciones:</span> {record.observations}
                        </p>
                      )}
                      {record.ignored && (
                        <p className="text-xs text-rose-400 mt-1">(Registro despreciado)</p>
                      )}
                    </div>
                    {!isArchiveView && onEdit && onDelete && (
                      <div className="flex space-x-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(record)}
                          className="border-sky-500 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                          disabled={isProcessing}
                        >
                          <Edit3 className="mr-1 h-4 w-4" /> Editar
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(record.id)}
                          className="bg-rose-600 hover:bg-rose-700"
                          disabled={isProcessing}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                        </Button>
                      </div>
                    )}
                    {isArchiveView && onEdit && onDelete && (
                      <div className="flex space-x-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(record)}
                          className="border-sky-500 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                          disabled={isProcessing}
                        >
                          <Edit3 className="mr-1 h-4 w-4" /> Editar
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(record.id)}
                          className="bg-rose-600 hover:bg-rose-700"
                          disabled={isProcessing}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                        </Button>
                      </div>
                     )}
                  </motion.li>
                )
              })}
            </ul>
          </ScrollArea>
        </motion.div>
      );
    };

    export default RecordsList;