// hooks/useCycleData.js
import { useState, useEffect, useCallback } from 'react';
import { format, startOfDay, parseISO, addDays, parse } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { processCycleEntries, createNewCycleEntry, updateCycleEntry, deleteCycleEntryDB, archiveCycleDB, createNewCycleDB, fetchCycleByIdDB, fetchCurrentCycleDB, fetchArchivedCyclesDB, updateCycleDatesDB } from '@/lib/cycleDataHandler';

const filterEntriesByEndDate = (entries, endDate) => {
  if (!endDate) return entries;
  const end = startOfDay(parseISO(endDate));
  return entries.filter((entry) => parseISO(entry.isoDate) <= end);
};

export const useCycleData = (specificCycleId = null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentCycle, setCurrentCycle] = useState({ id: null, startDate: format(startOfDay(new Date()), "yyyy-MM-dd"), data: [] });
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
        if (!cycleToLoad) {
          console.log('No current cycle found, creating new one');
          const newStartDate = format(startOfDay(new Date()), "yyyy-MM-dd");
          const newCycle = await createNewCycleDB(user.uid, newStartDate); // ← CAMBIO: user.uid en lugar de user.id
          cycleToLoad = { id: newCycle.id, startDate: newCycle.start_date, data: [] };
        }
      }
      
      console.log('Cycle loaded:', cycleToLoad);
      
      setCurrentCycle({
        ...cycleToLoad,
        startDate: cycleToLoad.startDate ? format(startOfDay(parseISO(cycleToLoad.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
        data: processCycleEntries(cycleToLoad.data, cycleToLoad.startDate)
      });
      
      console.log('Loading archived cycles');
      const archivedData = await fetchArchivedCyclesDB(user.uid); // ← CAMBIO: user.uid en lugar de user.id
      setArchivedCycles(archivedData.map(cycle => {
        const processed = processCycleEntries(cycle.data || [], cycle.startDate);
        const filtered = filterEntriesByEndDate(processed, cycle.endDate);
        return {
          ...cycle,
          startDate: cycle.startDate ? format(startOfDay(parseISO(cycle.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
          endDate: cycle.endDate ? format(startOfDay(parseISO(cycle.endDate)), "yyyy-MM-dd") : null,
          data: filtered
        };
      }));

    } catch (error) {
      console.error("Error in loadCycleData:", error);
      // Si hay error de permisos, mostrar mensaje más claro
      if (error.code === 'permission-denied') {
        console.error('Firebase permissions error. Check Firestore rules.');
      }
      setCurrentCycle({ id: null, startDate: format(startOfDay(new Date()), "yyyy-MM-dd"), data: [] });
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
      const recordPayload = {
        cycle_id: currentCycle.id,
        user_id: user.uid, // ← CAMBIO: user.uid en lugar de user.id
        timestamp: format(recordDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        temperature_raw: newData.temperature_raw === '' || newData.temperature_raw === null || newData.temperature_raw === undefined ? null : parseFloat(newData.temperature_raw),
        temperature_corrected: newData.temperature_corrected === '' || newData.temperature_corrected === null || newData.temperature_corrected === undefined ? null : parseFloat(newData.temperature_corrected),
        use_corrected: newData.use_corrected || false,
        mucus_sensation: newData.mucusSensation || null,
        mucus_appearance: newData.mucusAppearance || null,
        fertility_symbol:
          newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,
        observations: newData.observations || null,
        ignored: editingRecord ? (newData.ignored ?? editingRecord.ignored) : (newData.ignored || false),
      };
      
      if (editingRecord) {
        console.log('Updating existing record:', editingRecord.id);
        await updateCycleEntry(editingRecord.id, recordPayload);
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
      await deleteCycleEntryDB(recordId, user.uid); // ← CAMBIO: user.uid en lugar de user.id
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
      await updateCycleEntry(recordId, { ignored: newIgnoredState });
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
    if (!user?.uid || !currentCycle.id) return;
    
    console.log('Starting new cycle with date:', selectedStartDate);
    setIsLoading(true);
    try {
      const startDateObj = selectedStartDate
        ? startOfDay(parseISO(selectedStartDate))
        : startOfDay(new Date());
      const archiveEndDate = format(addDays(startDateObj, -1), "yyyy-MM-dd");

      await archiveCycleDB(currentCycle.id, user.uid, archiveEndDate); // ← CAMBIO: user.uid en lugar de user.id

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

      const processed = processCycleEntries(cycleData.data || [], cycleData.startDate);
      const filtered = filterEntriesByEndDate(processed, cycleData.endDate);
      
      const result = {
        ...cycleData,
        startDate: cycleData.startDate ? format(startOfDay(parseISO(cycleData.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
        endDate: cycleData.endDate ? format(startOfDay(parseISO(cycleData.endDate)), "yyyy-MM-dd") : null,
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
    toggleIgnoreRecord 
  };
};