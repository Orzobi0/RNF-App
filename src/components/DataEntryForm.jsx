import React, { useRef, useEffect } from 'react';
import DataEntryFormFields from '@/components/dataEntryForm/DataEntryFormFields';
import DataEntryFormActions from '@/components/dataEntryForm/DataEntryFormActions';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';
import { useDataEntryForm } from '@/hooks/useDataEntryForm';

    const DataEntryForm = ({ onSubmit, initialData, onCancel, cycleStartDate, isProcessing, isEditing = false }) => {
      const formRef = useRef(null);

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
      } = useDataEntryForm(onSubmit, initialData, isEditing, cycleStartDate);

      return (
        <motion.form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-6 bg-white p-4 sm:p-6 rounded-xl border border-[#E5E7EB] shadow w-full max-h-[80dvh] overflow-y-auto"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-[#292a46]">
              {isEditing ? 'Editar Registro' : 'Añadir Registro'}
            </h2>
            {onCancel && (
              <Button
                type="button"
                onClick={onCancel}
                variant="ghost"
                size="icon"
                className="text-[#393C65] hover:text-[#E27DBF] hover:bg-[#E27DBF]/10"
              >
                <XCircle className="h-6 w-6" />
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