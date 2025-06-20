import { useState, useEffect, useCallback } from 'react';
    import { format, startOfDay, parseISO } from 'date-fns';
    import { supabase } from '@/lib/supabaseClient';
    import { useAuth } from '@/contexts/AuthContext';
    import { processCycleEntries, createNewCycleEntry, updateCycleEntry, deleteCycleEntryDB, archiveCycleDB, createNewCycleDB, fetchCycleByIdDB, fetchCurrentCycleDB, fetchArchivedCyclesDB } from '@/lib/cycleDataHandler';

    export const useCycleData = (specificCycleId = null) => {
      const { user } = useAuth();
      const [currentCycle, setCurrentCycle] = useState({ id: null, startDate: format(startOfDay(new Date()), "yyyy-MM-dd"), data: [] });
      const [archivedCycles, setArchivedCycles] = useState([]);
      const [isLoading, setIsLoading] = useState(true);

      const loadCycleData = useCallback(async () => {
        if (!user) {
          setIsLoading(false);
          return;
        }
        setIsLoading(true);

        try {
          let cycleToLoad;

          if (specificCycleId) {
            cycleToLoad = await fetchCycleByIdDB(user.id, specificCycleId);
            if (!cycleToLoad) {
              cycleToLoad = { id: specificCycleId, startDate: format(startOfDay(new Date()), "yyyy-MM-dd"), data: [] };
            }
          } else {
            cycleToLoad = await fetchCurrentCycleDB(user.id);
            if (!cycleToLoad) {
              const newStartDate = format(startOfDay(new Date()), "yyyy-MM-dd");
              const newCycle = await createNewCycleDB(user.id, newStartDate);
              cycleToLoad = { id: newCycle.id, startDate: newCycle.start_date, data: [] };
            }
          }
          
          setCurrentCycle({
            ...cycleToLoad,
            startDate: cycleToLoad.startDate ? format(startOfDay(parseISO(cycleToLoad.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
            data: processCycleEntries(cycleToLoad.data, cycleToLoad.startDate)
          });
          
          const archivedData = await fetchArchivedCyclesDB(user.id);
          setArchivedCycles(archivedData.map(cycle => ({
            ...cycle,
            startDate: cycle.startDate ? format(startOfDay(parseISO(cycle.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
            data: processCycleEntries(cycle.data || [], cycle.startDate)
          })));

        } catch (error) {
          console.error("Error in loadCycleData:", error);
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
        if (!user || !currentCycle.id) {
          console.error("User or currentCycle.id is missing");
          throw new Error("User or currentCycle.id is missing");
        }
        setIsLoading(true);
        try {
          const recordPayload = {
            cycle_id: currentCycle.id, 
            user_id: user.id,                       // ← NECESARIO (NOT NULL)
            timestamp: format(               // la columna real se llama 'timestamp'
              startOfDay(parseISO(newData.isoDate)),
              "yyyy-MM-dd'T'HH:mm:ssXXX"
            ),
            temperature_raw: newData.temperature_raw === '' || newData.temperature_raw === null || newData.temperature_raw === undefined ? null : parseFloat(newData.temperature_raw),
            temperature_corrected: newData.temperature_corrected === '' || newData.temperature_corrected === null || newData.temperature_corrected === undefined ? null : parseFloat(newData.temperature_corrected),
            use_corrected: newData.use_corrected || false,
            mucus_sensation: newData.mucusSensation || null,
            mucus_appearance: newData.mucusAppearance || null,
            fertility_symbol:
              newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,   // 'red' | 'white' | 'green' | 'spot'
            observations: newData.observations || null,
            ignored: editingRecord ? editingRecord.ignored : (newData.ignored || false),
          };
          
          if (editingRecord) {
            await updateCycleEntry(editingRecord.id, recordPayload);
          } else {
            await createNewCycleEntry(recordPayload);
          }
          
          await loadCycleData(); 

        } catch (error) {
          console.error("Error adding/updating data point:", error);
          throw error;
        } finally {
          setIsLoading(false);
        }
      }, [user, currentCycle.id, loadCycleData]);

      const deleteRecord = useCallback(async (recordId) => {
        if (!user || !currentCycle.id) return;
        setIsLoading(true);
        try {
          await deleteCycleEntryDB(recordId, user.id);
          await loadCycleData();
        } catch (error) {
          console.error("Error deleting record:", error);
          throw error;
        } finally {
          setIsLoading(false);
        }
      }, [user, currentCycle.id, loadCycleData]);

      const toggleIgnoreRecord = useCallback(async (cycleIdToUpdate, recordId) => {
        if (!user) return;
        setIsLoading(true);
        try {
          const targetCycle = cycleIdToUpdate === currentCycle.id ? currentCycle : archivedCycles.find(c => c.id === cycleIdToUpdate);
          if (!targetCycle) throw new Error("Cycle not found for toggling ignore state.");

          const recordToUpdate = targetCycle.data.find(r => r.id === recordId);
          if (!recordToUpdate) throw new Error("Record not found for toggling ignore state.");

          const newIgnoredState = !recordToUpdate.ignored;
          await updateCycleEntry(recordId, { ignored: newIgnoredState });
          await loadCycleData();

        } catch (error) {
          console.error("Error toggling ignore state:", error);
          throw error;
        } finally {
          setIsLoading(false);
        }
      }, [user, currentCycle, archivedCycles, loadCycleData]);

  const startNewCycle = useCallback(async (selectedStartDate) => {
    if (!user || !currentCycle.id) return;
    setIsLoading(true);
    try {
      await archiveCycleDB(currentCycle.id, user.id);

      const newStartDate = selectedStartDate
        ? selectedStartDate
        : format(startOfDay(new Date()), "yyyy-MM-dd");
      const newCycle = await createNewCycleDB(user.id, newStartDate);
      setCurrentCycle({ id: newCycle.id, startDate: newCycle.start_date, data: [] });
      await loadCycleData();
    } catch (error) {
      console.error("Error starting new cycle:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle, loadCycleData]);

  const getCycleById = useCallback(async (cycleIdToFetch) => {
    if (!user) return null;
        setIsLoading(true);
        try {
          const cycleData = await fetchCycleByIdDB(user.id, cycleIdToFetch);
          if (!cycleData) return null;

          return {
            ...cycleData,
            startDate: cycleData.startDate ? format(startOfDay(parseISO(cycleData.startDate)), "yyyy-MM-dd") : format(startOfDay(new Date()), "yyyy-MM-dd"),
            data: processCycleEntries(cycleData.data || [], cycleData.startDate)
          };
        } catch (error) {
          console.error("Error fetching cycle by ID:", error);
          return null;
        } finally {
          setIsLoading(false);
        }
      }, [user]);

      return { currentCycle, archivedCycles, addOrUpdateDataPoint, deleteRecord, startNewCycle, isLoading, getCycleById, refreshData: loadCycleData, toggleIgnoreRecord };
    };