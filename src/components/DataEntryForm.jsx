import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import DataEntryFormFields from '@/components/dataEntryForm/DataEntryFormFields';
import DataEntryFormActions from '@/components/dataEntryForm/DataEntryFormActions';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { XCircle, Edit3 } from 'lucide-react';
import { useDataEntryForm } from '@/hooks/useDataEntryForm';
import useBackClose from '@/hooks/useBackClose';
import { parseISO } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { ensureHealthConnectPermissions } from '@/lib/healthConnectSync';
import { useCycleData } from '@/hooks/useCycleData';
import { useHealthConnect } from '@/contexts/HealthConnectContext.jsx';
import { useNavigate } from 'react-router-dom';

const DataEntryForm = ({
  onSubmit,
  initialData,
  onCancel,
  cycleStartDate,
  cycleEndDate,
  isProcessing,
  isEditing = false,
  cycleData = [],
  onDateSelect,
  defaultIsoDate,
  focusedField,
  initialSectionKey = null,
  onOpenNewCycle,
  formDraft = null,
}) => {
  const formRef = useRef(null);
  useBackClose(Boolean(onCancel), onCancel);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { syncHealthConnectTemperatures } = useCycleData();
  const { isAvailable, hasPermissions, refreshPermissions, isAndroidApp } = useHealthConnect();
  const [syncingHealthConnect, setSyncingHealthConnect] = useState(false);
  const normalizeFocusedField = useCallback((field) => {
  switch (field) {
    case 'sensation':
      return 'mucusSensation';
    case 'appearance':
      return 'mucusAppearance';
    case 'symbol':
      return 'fertilitySymbol';
    default:
      return field;
  }
}, []);

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

  useEffect(() => {
  if (!focusedField) {
    return;
  }

  const form = formRef.current;
  if (!form) {
    return;
  }

  const normalizedField = normalizeFocusedField(focusedField);
  let frameId = null;
  let attempts = 0;

  const tryFocus = () => {
    const focusTarget = form.querySelector(`[data-field="${normalizedField}"]`);

    if (focusTarget) {
      if (typeof focusTarget.scrollIntoView === 'function') {
        focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
      return;
    }

    attempts += 1;
    if (attempts < 8) {
      frameId = requestAnimationFrame(tryFocus);
    }
  };

  frameId = requestAnimationFrame(tryFocus);

  return () => {
    if (frameId) {
      cancelAnimationFrame(frameId);
    }
  };
}, [focusedField, normalizeFocusedField, initialSectionKey]);


  const {
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
    handleSubmit,
    submitCurrentState,
    buildDraftPayload,
    applyDraftPayload,
  } = useDataEntryForm(
    onSubmit,
    initialData,
    isEditing,
    cycleStartDate,
    cycleEndDate,
    cycleData,
    onDateSelect,
    defaultIsoDate,
  );
  useEffect(() => {
    if (!formDraft) {
      return;
    }

    applyDraftPayload(formDraft);
  }, [applyDraftPayload, formDraft]);

  const recordedDates = useMemo(
    () => cycleData.map((r) => parseISO(r.isoDate)),
    [cycleData]
  );

  const handleSyncTemperature = async () => {
    if (syncingHealthConnect || isProcessing) return;

    if (!isAndroidApp) {
      toast({
        title: 'Disponible solo en Android',
        description: 'Health Connect funciona únicamente en la app Android.',
        variant: 'destructive',
      });
      return;
    }

    if (!isAvailable) {
      toast({
        title: 'Health Connect no disponible',
        description: 'Instala Health Connect para sincronizar tus temperaturas.',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    let granted = hasPermissions;
    if (!granted) {
      try {
        granted = await ensureHealthConnectPermissions();
      } catch (error) {
        const message = String(error?.message || error);
        toast({
          title: 'Health Connect: error pidiendo permisos',
          description: message,
          variant: 'destructive',
        });
      } finally {
        await refreshPermissions();
      }
    }

    if (!granted) {
      toast({
        title: 'Permisos requeridos',
        description: 'Activa Health Connect en ajustes para sincronizar.',
      });
      navigate('/settings');
      return;
    }

    setSyncingHealthConnect(true);
    try {
      await syncHealthConnectTemperatures();
    } finally {
      setSyncingHealthConnect(false);
    }
  };

  const handleOpenNewCycle = useCallback(
    (selectedIsoDate) => {
      if (typeof onOpenNewCycle !== 'function') {
        return;
      }

      onOpenNewCycle(selectedIsoDate, buildDraftPayload());
    },
    [buildDraftPayload, onOpenNewCycle]
  );

  return (
    <motion.form
  ref={formRef}
  onSubmit={handleSubmit}
  className="flex h-[92dvh] max-h-[92dvh] min-h-0 w-full flex-col rounded-3xl border-2 border-white bg-fertiliapp-secundario p-3 shadow-[0_24px_70px_rgba(15,23,42,0.22),0_10px_30px_rgba(244,114,182,0.22)] backdrop-blur-xl sm:p-4 overflow-hidden"
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
>
  <div className="mb-3 flex items-center justify-between shrink-0">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-fertiliapp-fuerte rounded-full flex items-center justify-center shadow-lg">
        <Edit3 className="w-4 h-4 text-white" />
      </div>
      <h2 className="text-xl font-bold text-fertiliapp-fuerte">
        {isEditing ? 'Editar Registro' : 'Añadir Registro'}
      </h2>
    </div>
    {onCancel && (
      <Button
        type="button"
        onClick={onCancel}
        variant="ghost"
        size="icon"
        className="text-gray-400 hover:text-fertiliapp-fuerte hover:bg-pink-50 rounded-full"
      >
        <XCircle className="h-5 w-5" />
      </Button>
    )}
  </div>

  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
    <DataEntryFormFields
      date={date}
      setDate={setDate}
      measurements={measurements}
      addMeasurement={addMeasurement}
      updateMeasurement={updateMeasurement}
      removeMeasurement={removeMeasurement}
      confirmMeasurement={confirmMeasurement}
      selectMeasurement={selectMeasurement}
      mucusSensation={mucusSensation}
      setMucusSensation={setMucusSensation}
      mucusAppearance={mucusAppearance}
      setMucusAppearance={setMucusAppearance}
      fertilitySymbol={fertilitySymbol}
      setFertilitySymbol={setFertilitySymbol}
      observations={observations}
      setObservations={setObservations}
      hadRelations={hadRelations}
      setHadRelations={setHadRelations}
      ignored={ignored}
      setIgnored={setIgnored}
      peakTag={peakTag}
      setPeakTag={setPeakTag}
      existingPeakIsoDate={existingPeakIsoDate}
      isProcessing={isProcessing}
      isEditing={isEditing}
      initialData={initialData}
      cycleStartDate={cycleStartDate}
      cycleEndDate={cycleEndDate}
      recordedDates={recordedDates}
      submitCurrentState={submitCurrentState}
      initialSectionKey={initialSectionKey}
      onSyncTemperature={handleSyncTemperature}
      isSyncingTemperature={syncingHealthConnect}
      canSyncTemperature={Boolean(isAndroidApp && isAvailable)}
      onOpenNewCycle={handleOpenNewCycle}
    />
  </div>

  <DataEntryFormActions
    onCancel={onCancel}
    isProcessing={isProcessing}
    isEditing={isEditing}
  />
</motion.form>
  );
};

export default DataEntryForm;