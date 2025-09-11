import React, { useRef, useEffect } from 'react';
import DataEntryFormFields from '@/components/dataEntryForm/DataEntryFormFields';
import DataEntryFormActions from '@/components/dataEntryForm/DataEntryFormActions';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle, Edit3 } from 'lucide-react';
import { useDataEntryForm } from '@/hooks/useDataEntryForm';
import useBackClose from '@/hooks/useBackClose';

const DataEntryForm = ({ onSubmit, initialData, onCancel, cycleStartDate, cycleEndDate, isProcessing, isEditing = false, cycleData = [], onDateSelect }) => {
      const formRef = useRef(null);
      useBackClose(Boolean(onCancel), onCancel);

      useEffect(() => {
        const form = formRef.current;
        if (!form) return;
        const handleFocus = (e) => {
          if (e.target && 'scrollIntoView' in e.target) {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          }
        };
        form.addEventListener('focusin', handleFocus);
        return () => form.removeEventListener('focusin', handleFocus);
      }, []);

      const {
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
        handleSubmit,
      } = useDataEntryForm(onSubmit, initialData, isEditing, cycleStartDate, cycleEndDate, cycleData, onDateSelect);

      return (
        <motion.form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4 bg-gradient-to-br from-white/98 to-rose-50/95 backdrop-blur-xl p-4 sm:p-6 rounded-3xl border-2 border-rose-200 shadow-[0_4px_20px_rgba(244,114,182,0.25)] w-full"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full flex items-center justify-center shadow-lg">
              <Edit3 className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              {isEditing ? 'Editar Registro' : 'Añadir Registro'}
            </h2>
          </div>
            {onCancel && (
              <Button
                type="button"
                onClick={onCancel}
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-full"
              >
                <XCircle className="h-5 w-5" />
              </Button>
            )}
          </div>
          <DataEntryFormFields
            date={date} setDate={setDate}
            time={time} setTime={setTime}
            temperatureRaw={temperatureRaw} setTemperatureRaw={setTemperatureRaw}
            temperatureCorrected={temperatureCorrected} setTemperatureCorrected={setTemperatureCorrected}
            useCorrected={useCorrected} setUseCorrected={setUseCorrected}
            mucusSensation={mucusSensation} setMucusSensation={setMucusSensation}
            mucusAppearance={mucusAppearance} setMucusAppearance={setMucusAppearance}
            fertilitySymbol={fertilitySymbol} setFertilitySymbol={setFertilitySymbol}
            observations={observations} setObservations={setObservations}
            ignored={ignored} setIgnored={setIgnored}
            isProcessing={isProcessing}
            isEditing={isEditing}
            initialData={initialData}
            cycleStartDate={cycleStartDate}
            cycleEndDate={cycleEndDate}
          />
          <DataEntryFormActions
            onCancel={onCancel}
            isProcessing={isProcessing}
            isEditing={isEditing}
          />
        </motion.form>
      );
    };

    export default DataEntryForm;