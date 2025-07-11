import React from 'react';
    import DataEntryFormFields from '@/components/dataEntryForm/DataEntryFormFields';
    import DataEntryFormActions from '@/components/dataEntryForm/DataEntryFormActions';
    import { motion } from 'framer-motion';
    import { useDataEntryForm } from '@/hooks/useDataEntryForm';

    const DataEntryForm = ({ onSubmit, initialData, onCancel, cycleStartDate, isProcessing, isEditing = false }) => {

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
          onSubmit={handleSubmit}
          className="space-y-6 bg-[#393C65]/20 backdrop-blur-sm p-6 sm:p-8 rounded-xl shadow-xl w-full max-h-[80vh] overflow-y-auto"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
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