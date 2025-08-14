// hooks/useCycleData.js
import { useState, useEffect, useCallback } from 'react';
import { format, startOfDay, parseISO, addDays, parse } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { processCycleEntries, createNewCycleEntry, updateCycleEntry, deleteCycleEntryDB, archiveCycleDB, createNewCycleDB, fetchCycleByIdDB, fetchCurrentCycleDB, fetchArchivedCyclesDB, updateCycleDatesDB, deleteCycleDB } from '@/lib/cycleDataHandler';

const filterEntriesByEndDate = (entries, endDate) => {
  if (!endDate) return entries;
  const end = startOfDay(parseISO(endDate));
  return entries.filter((entry) => parseISO(entry.isoDate) <= end);
};

const normalizeDate = (date) => {
  if (!date) return null;
  if (typeof date === 'string') {
    return format(startOfDay(parseISO(date)), 'yyyy-MM-dd');
  }
  if (typeof date.toDate === 'function') {
    return format(startOfDay(date.toDate()), 'yyyy-MM-dd');
  }
  return format(startOfDay(new Date(date)), 'yyyy-MM-dd');
};

export const useCycleData = (specificCycleId = null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentCycle, setCurrentCycle] = useState({ id: null, startDate: null, data: [] });
  const [archivedCycles, setArchivedCycles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCycleData = useCallback(async () => {
    if (!user?.uid) {
      console.log('No user found, skipping cycle data load');
      setIsLoading(false);
      return;
    }
    
    console.log('Loading cycle data for user:', user.uid);
    setIsLoading(true);

    try {
      let cycleToLoad;

      if (specificCycleId) {
        console.log('Loading specific cycle:', specificCycleId);
        cycleToLoad = await fetchCycleByIdDB(user.uid, specificCycleId); // ← CAMBIO: user.uid en lugar de user.id
        if (!cycleToLoad) {
          cycleToLoad = { id: specificCycleId, startDate: format(startOfDay(new Date()), "yyyy-MM-dd"), data: [] };
        }
      } else {
        console.log('Loading current cycle');
        cycleToLoad = await fetchCurrentCycleDB(user.uid); // ← CAMBIO: user.uid en lugar de user.id
      }
      
      console.log('Cycle loaded:', cycleToLoad);


      if (cycleToLoad) {
        const startDate = normalizeDate(cycleToLoad.startDate);
        const endDate = normalizeDate(cycleToLoad.endDate);

        setCurrentCycle({
          ...cycleToLoad,
          startDate,
          endDate,
          data: processCycleEntries(cycleToLoad.data, startDate)
        });
      } else {
        setCurrentCycle({ id: null, startDate: null, data: [] });
      }
      
      console.log('Loading archived cycles');
      const archivedData = await fetchArchivedCyclesDB(user.uid, cycleToLoad ? cycleToLoad.startDate : null); // ← CAMBIO: user.uid en lugar de user.id
      setArchivedCycles(archivedData.map(cycle => {
        const aStart = normalizeDate(cycle.startDate);
        const aEnd = normalizeDate(cycle.endDate);
        const processed = processCycleEntries(cycle.data || [], aStart);
        const filtered = filterEntriesByEndDate(processed, aEnd);
        return {
          ...cycle,
          startDate: aStart ?? format(startOfDay(new Date()), "yyyy-MM-dd"),
          endDate: aEnd,
          needsCompletion: cycle.needsCompletion,
          data: filtered
        };
      }));

    } catch (error) {
      console.error("Error in loadCycleData:", error);
      // Si hay error de permisos, mostrar mensaje más claro
      if (error.code === 'permission-denied') {
        console.error('Firebase permissions error. Check Firestore rules.');
      }
      setCurrentCycle({ id: null, startDate: null, data: [] });
      setArchivedCycles([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, specificCycleId]);

  useEffect(() => {
    loadCycleData();
  }, [loadCycleData]);

  const addOrUpdateDataPoint = useCallback(async (newData, editingRecord) => {
    if (!user?.uid || !currentCycle.id) {
      console.error("User or currentCycle.id is missing");
      throw new Error("User or currentCycle.id is missing");
    }
    
    console.log('Adding/updating data point:', newData, 'editing:', editingRecord);
    setIsLoading(true);
    
    try {
      const timeString = newData.time && newData.time.trim() !== ''
        ? newData.time
        : format(new Date(), 'HH:mm');
      const recordDateTime = parse(
        `${newData.isoDate} ${timeString}`,
        'yyyy-MM-dd HH:mm',
        new Date()
      );
 
      const tempRaw = newData.temperature_raw === '' || newData.temperature_raw === null || newData.temperature_raw === undefined ? null : parseFloat(newData.temperature_raw);
      const tempCorrected = newData.temperature_corrected === '' || newData.temperature_corrected === null || newData.temperature_corrected === undefined ? null : parseFloat(newData.temperature_corrected);
      const useCorrected = newData.use_corrected || false;
      const temperatureChart = useCorrected
        ? (tempCorrected ?? tempRaw)
        : (tempRaw ?? tempCorrected);

      const recordPayload = {
        cycle_id: currentCycle.id,
        user_id: user.uid, // ← CAMBIO: user.uid en lugar de user.id
        timestamp: format(recordDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        temperature_raw: tempRaw,
        temperature_corrected: tempCorrected,
        use_corrected: useCorrected,
        temperature_chart: temperatureChart,
        mucus_sensation: newData.mucusSensation || null,
        mucus_appearance: newData.mucusAppearance || null,
        fertility_symbol:
          newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,
        observations: newData.observations || null,
        ignored: editingRecord ? (newData.ignored ?? editingRecord.ignored) : (newData.ignored || false),
      };
      
      if (editingRecord) {
        console.log('Updating existing record:', editingRecord.id);
        await updateCycleEntry(user.uid, currentCycle.id, editingRecord.id, recordPayload);
      } else {
        console.log('Creating new record');
        await createNewCycleEntry(recordPayload);
      }
      
      console.log('Data point saved successfully');
      await loadCycleData(); 

    } catch (error) {
      console.error("Error adding/updating data point:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle.id, loadCycleData]);

  const deleteRecord = useCallback(async (recordId) => {
    if (!user?.uid || !currentCycle.id) return;
    
    console.log('Deleting record:', recordId);
    setIsLoading(true);
    try {
      await deleteCycleEntryDB(user.uid, currentCycle.id, recordId); // ← CAMBIO: user.uid en lugar de user.id
      await loadCycleData();
      console.log('Record deleted successfully');
    } catch (error) {
      console.error("Error deleting record:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle.id, loadCycleData]);

  const toggleIgnoreRecord = useCallback(async (cycleIdToUpdate, recordId) => {
    if (!user?.uid) return;
    
    console.log('Toggling ignore for record:', recordId, 'in cycle:', cycleIdToUpdate);
    setIsLoading(true);
    try {
      const targetCycle = cycleIdToUpdate === currentCycle.id ? currentCycle : archivedCycles.find(c => c.id === cycleIdToUpdate);
      if (!targetCycle) throw new Error("Cycle not found for toggling ignore state.");

      const recordToUpdate = targetCycle.data.find(r => r.id === recordId);
      if (!recordToUpdate) throw new Error("Record not found for toggling ignore state.");

      const newIgnoredState = !recordToUpdate.ignored;
      await updateCycleEntry(user.uid, cycleIdToUpdate, recordId, { ignored: newIgnoredState });
      await loadCycleData();

      console.log('Record ignore status toggled successfully');
    } catch (error) {
      console.error("Error toggling ignore state:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle, archivedCycles, loadCycleData]);

  const startNewCycle = useCallback(async (selectedStartDate) => {
    if (!user?.uid) return;
 
    console.log('Starting new cycle with date:', selectedStartDate);
    setIsLoading(true);
    try {
      const startDateObj = selectedStartDate
        ? startOfDay(parseISO(selectedStartDate))
        : startOfDay(new Date());

      if (currentCycle.id) {
        const archiveEndDate = format(addDays(startDateObj, -1), "yyyy-MM-dd");
        await archiveCycleDB(currentCycle.id, user.uid, archiveEndDate); // ← CAMBIO: user.uid en lugar de user.id
      }

      const newStartDate = format(startDateObj, "yyyy-MM-dd");
      const newCycle = await createNewCycleDB(user.uid, newStartDate); // ← CAMBIO: user.uid en lugar de user.id
      setCurrentCycle({ id: newCycle.id, startDate: newCycle.start_date, data: [] });
      await loadCycleData();
      console.log('New cycle started successfully');
    } catch (error) {
      console.error("Error starting new cycle:", error);
      toast({ title: "Error", description: "No se pudo archivar el ciclo.", variant: "destructive" });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle, loadCycleData, toast]);
  const addArchivedCycle = useCallback(async (startDate, endDate) => {
    if (!user?.uid) return;
    if (!endDate) {
      toast({ title: 'Error', description: 'La fecha de fin es obligatoria.', variant: 'destructive' });
      return;
    }

    console.log('Adding archived cycle:', startDate, endDate);
    setIsLoading(true);
    try {
      const newCycle = await createNewCycleDB(user.uid, startDate);
      await updateCycleDatesDB(newCycle.id, user.uid, undefined, endDate);
      await loadCycleData();
      console.log('Archived cycle added successfully');
    } catch (error) {
      console.error('Error adding archived cycle:', error);
            const description =
        error.message && error.message.includes('overlap')
          ? 'Las fechas coinciden con otro ciclo.'
          : 'No se pudo crear el ciclo.';
      toast({ title: 'Error', description, variant: 'destructive' });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, loadCycleData, toast]);

    const deleteCycle = useCallback(async (cycleId) => {
    if (!user?.uid) return;

    console.log('Deleting cycle:', cycleId);
    setIsLoading(true);
    try {
      await deleteCycleDB(user.uid, cycleId);
      await loadCycleData();
      console.log('Cycle deleted successfully');
    } catch (error) {
      console.error('Error deleting cycle:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el ciclo.', variant: 'destructive' });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, loadCycleData, toast]);


  const updateCycleDates = useCallback(
    async (cycleIdToUpdate, newStartDate, newEndDate) => {
      if (!user?.uid) return;
      
      console.log('Updating cycle dates:', cycleIdToUpdate, newStartDate, newEndDate);
      setIsLoading(true);
      try {
        await updateCycleDatesDB(cycleIdToUpdate, user.uid, newStartDate, newEndDate); // ← CAMBIO: user.uid en lugar de user.id
        await loadCycleData();
        console.log('Cycle dates updated successfully');
      } catch (error) {
        console.error("Error updating cycle dates:", error);
        toast({ title: "Error", description: "No se pudieron actualizar las fechas.", variant: "destructive" });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCycleData, toast]
  );

  const getCycleById = useCallback(async (cycleIdToFetch) => {
    if (!user?.uid) return null;
    
    console.log('Fetching cycle by ID:', cycleIdToFetch);
    setIsLoading(true);
    try {
      const cycleData = await fetchCycleByIdDB(user.uid, cycleIdToFetch); // ← CAMBIO: user.uid en lugar de user.id
      if (!cycleData) return null;

      const startDate = normalizeDate(cycleData.startDate);
      const endDate = normalizeDate(cycleData.endDate);
      const processed = processCycleEntries(cycleData.data || [], startDate);
      const filtered = filterEntriesByEndDate(processed, endDate);

      
      const result = {
        ...cycleData,
        startDate: startDate ?? format(startOfDay(new Date()), "yyyy-MM-dd"),
        endDate,
        data: filtered
      };
      
      console.log('Cycle fetched successfully:', result);
      return result;
    } catch (error) {
      console.error("Error fetching cycle by ID:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return { 
    currentCycle, 
    archivedCycles, 
    addOrUpdateDataPoint, 
    deleteRecord, 
    startNewCycle,
    updateCycleDates,
    isLoading,
    getCycleById,
    refreshData: loadCycleData,
    toggleIgnoreRecord,
    addArchivedCycle,
    deleteCycle
  };
};