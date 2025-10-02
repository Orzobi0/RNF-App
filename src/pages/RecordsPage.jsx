import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import RecordsList from '@/components/RecordsList';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Edit, Plus, FileText } from 'lucide-react';
import { format, parseISO, isValid, max, isBefore, isAfter, startOfDay } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { Calendar } from '@/components/ui/calendar';
import { es } from 'date-fns/locale';

const RecordsPage = () => {
  const {
    currentCycle,
    addOrUpdateDataPoint,
    deleteRecord,
    isLoading,
    updateCycleDates,
    checkCycleOverlap,
    forceUpdateCycleStart,
    refreshData,
  } = useCycleData();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => currentCycle?.startDate || '');
  const [startDateError, setStartDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const listContainerRef = useRef(null);
  const hasUserSelectedDateRef = useRef(false);

  useEffect(() => {
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate]);

  const sortedRecordDates = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return [...currentCycle.data]
      .filter((record) => record?.isoDate)
      .sort((a, b) => {
        const dateA = parseISO(a.isoDate);
        const dateB = parseISO(b.isoDate);
        return dateB - dateA;
      })
      .map((record) => record.isoDate);
  }, [currentCycle?.data]);

  useEffect(() => {
    if (!sortedRecordDates.length) {
      setSelectedDate(null);
      return;
    }

    if (!selectedDate || !sortedRecordDates.includes(selectedDate)) {
      setSelectedDate(sortedRecordDates[0]);
    }
  }, [sortedRecordDates, selectedDate]);

  useEffect(() => {
    if (selectedDate && listContainerRef.current && hasUserSelectedDateRef.current) {
      listContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);


  const recordDateObjects = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return currentCycle.data
      .map((record) => {
        if (!record?.isoDate) return null;
        const parsed = parseISO(record.isoDate);
        return isValid(parsed) ? parsed : null;
      })
      .filter(Boolean);
  }, [currentCycle?.data]);

  const recordDateSet = useMemo(() => new Set(sortedRecordDates), [sortedRecordDates]);

  const cycleRange = useMemo(() => {
    if (!currentCycle?.startDate) return null;
    const start = parseISO(currentCycle.startDate);
    if (!isValid(start)) return null;

    let end;

    if (currentCycle?.endDate) {
      end = parseISO(currentCycle.endDate);
    } else {
      const today = startOfDay(new Date());
      const candidates = [start, today];

      if (recordDateObjects.length) {
        candidates.push(max(recordDateObjects));
      }

      end = max(candidates);
    }

    if (!isValid(end)) {
      return { from: start, to: start };
    }

    return { from: start, to: end };
  }, [currentCycle?.startDate, currentCycle?.endDate, recordDateObjects]);

  const calendarModifiers = useMemo(() => {
    const modifiers = {};
    if (cycleRange) {
      modifiers.outsideCycle = (day) =>
        isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to);
      modifiers.insideCycleNoRecord = (day) => {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return false;
        }

        const iso = format(day, 'yyyy-MM-dd');
        return !recordDateSet.has(iso);
      };
    }
    if (recordDateObjects.length) {
      modifiers.hasRecord = recordDateObjects;
    }
    return modifiers;
  }, [cycleRange, recordDateObjects, recordDateSet]);

  const handleCalendarSelect = useCallback(
    (day, modifiers) => {
      if (!day) return;
      const iso = format(day, 'yyyy-MM-dd');
      if (modifiers?.hasRecord || recordDateSet.has(iso)) {
        hasUserSelectedDateRef.current = true;
        setSelectedDate(iso);
      }
    },
    [recordDateSet]
  );

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
  }, []);

  const openStartDateEditor = useCallback(() => {
    setDraftStartDate(currentCycle?.startDate || '');
    setStartDateError('');
    resetStartDateFlow();
    setShowStartDateEditor(true);
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const closeStartDateEditor = useCallback(() => {
    setShowStartDateEditor(false);
    setStartDateError('');
    resetStartDateFlow();
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const handleCancelOverlapStart = useCallback(() => {
    resetStartDateFlow();
  }, [resetStartDateFlow]);

  const handleSaveStartDate = useCallback(async () => {
    if (!draftStartDate) {
      setStartDateError('La fecha de inicio es obligatoria');
      return;
    }

    if (!currentCycle?.id) {
      return;
    }

    setStartDateError('');
    setIsUpdatingStartDate(true);

    try {
      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(currentCycle.id, draftStartDate)
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        setOverlapCycle(overlap);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(currentCycle.id, draftStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error updating start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
    }
  }, [
    draftStartDate,
    currentCycle?.id,
    checkCycleOverlap,
    updateCycleDates,
    refreshData,
    toast,
    closeStartDateEditor,
  ]);

  const handleConfirmOverlapStart = useCallback(async () => {
    if (!currentCycle?.id || !pendingStartDate) {
      resetStartDateFlow();
      return;
    }

    setIsUpdatingStartDate(true);
    setShowOverlapDialog(false);

    try {
      await forceUpdateCycleStart(currentCycle.id, pendingStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error forcing start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
      resetStartDateFlow();
    }
  }, [
    currentCycle?.id,
    pendingStartDate,
    forceUpdateCycleStart,
    refreshData,
    toast,
    closeStartDateEditor,
    resetStartDateFlow,
  ]);



  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
  }, []);

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleDeleteRequest = (recordId) => {
    const record = currentCycle.data.find(r => r.id === recordId);
    setRecordToDelete(record);
  };

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsProcessing(true);
    try {
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading && !currentCycle?.id) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 flex items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">No hay ciclo activo.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      
      <div className="max-w-4xl mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <motion.div
          className="flex flex-col gap-4 mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-start">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-pink-500" />
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-700">Mis Registros</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={openStartDateEditor}
                className="border-pink-200 rounded-full text-pink-600 hover:bg-pink-50"
                disabled={isProcessing || isUpdatingStartDate}
                aria-label="Editar fecha de inicio"
              >
                <Edit className="h-4 w-4" />
                <span className="sr-only">Editar fecha de inicio</span>
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => { setEditingRecord(null); setShowForm(true); }}
                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
                disabled={isProcessing}
                style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
                aria-label="Añadir registro"
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Añadir registro</span>
              </Button>
            </div>
          </div>
        </motion.div>
        {showStartDateEditor && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <CycleDatesEditor
              cycle={currentCycle}
              startDate={draftStartDate}
              endDate={currentCycle.endDate}
              onStartDateChange={(value) => setDraftStartDate(value)}
              onSave={handleSaveStartDate}
              onCancel={closeStartDateEditor}
              isProcessing={isUpdatingStartDate}
              dateError={startDateError}
              includeEndDate={false}
              showOverlapDialog={showOverlapDialog}
              overlapCycle={overlapCycle}
              onConfirmOverlap={handleConfirmOverlapStart}
              onCancelOverlap={handleCancelOverlapStart}
              onClearError={() => setStartDateError('')}
              saveLabel="Guardar cambios"
              title="Editar fecha de inicio"
              description="Actualiza la fecha de inicio del ciclo actual. Los registros se reorganizarán automáticamente."
            />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-5 flex justify-center"
        >
          <Calendar
            mode="single"
            locale={es}
            defaultMonth={
              selectedDate && isValid(parseISO(selectedDate))
                ? parseISO(selectedDate)
                : cycleRange?.to
            }
            selected={selectedDate && isValid(parseISO(selectedDate)) ? parseISO(selectedDate) : undefined}
            onDayClick={handleCalendarSelect}
            modifiers={calendarModifiers}
            className="w-full max-w-md sm:max-w-lg rounded-2xl border border-pink-100 shadow-sm bg-white/60 backdrop-blur-sm p-3 mx-auto [&_button]:text-slate-900 [&_button:hover]:bg-rose-100 [&_button[aria-selected=true]]:bg-rose-500"
            classNames={{
              day_selected:
                'bg-rose-500 text-white hover:bg-rose-500 hover:text-white focus:bg-rose-500 focus:text-white',
              day_today: 'bg-rose-200 text-rose-700 font-semibold',
            }}
            modifiersClassNames={{
              hasRecord:
                "relative font-semibold after:absolute after:bottom-1.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-rose-500 after:content-['']",
              outsideCycle: 'text-slate-300 opacity-50 hover:text-slate-300 hover:bg-transparent',
              insideCycleNoRecord:
                'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
            }}
          />
        </motion.div>


        {/* Records List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          ref={listContainerRef}
        >
          <RecordsList
            records={currentCycle.data}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
            isProcessing={isProcessing}
            selectedDate={selectedDate}
          />
        </motion.div>
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          } else {
            handleCloseForm();
          }
        }}
      >
        <DialogContent hideClose className="bg-white border-pink-100 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
          <DataEntryForm
            onSubmit={handleSave}
            onCancel={handleCloseForm}
            initialData={editingRecord}
            cycleStartDate={currentCycle.startDate}
            cycleEndDate={currentCycle.endDate}
            isProcessing={isProcessing}
            isEditing={!!editingRecord}
            cycleData={currentCycle.data}
            onDateSelect={handleDateSelect}
          />
        </DialogContent>
      </Dialog>

      <DeletionDialog
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar registro"
        confirmLabel="Eliminar registro"
        description={
          recordToDelete
            ? `¿Estás seguro de que quieres eliminar el registro del ${format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy')}? Esta acción no se puede deshacer.`
            : ''
        }
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default RecordsPage;