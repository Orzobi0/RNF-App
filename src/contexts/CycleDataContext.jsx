import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { format, startOfDay, parseISO, addDays, parse } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  processCycleEntries,
  createNewCycleEntry,
  updateCycleEntry,
  deleteCycleEntryDB,
  archiveCycleDB,
  createNewCycleDB,
  fetchCycleByIdDB,
  fetchCurrentCycleDB,
  fetchArchivedCyclesDB,
  updateCycleDatesDB,
  deleteCycleDB,
  forceUpdateCycleStart as forceUpdateCycleStartDB
} from '@/lib/cycleDataHandler';
import { getCachedCycleData, saveCycleDataToCache, clearCycleDataCache } from '@/lib/cycleCache';

const CycleDataContext = createContext(null);

const defaultCycleState = { id: null, startDate: null, endDate: null, data: [] };

const filterEntriesByEndDate = (entries, endDate) => {
  if (!endDate) return entries;
  const end = startOfDay(parseISO(endDate));
  return entries.filter((entry) => parseISO(entry.isoDate) <= end);
};

const filterEntriesByStartDate = (entries, startDate) => {
  if (!startDate) return entries;
  const start = startOfDay(parseISO(startDate));
  return entries.filter((entry) => parseISO(entry.isoDate) >= start);
};

const normalizeTemp = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(',', '.'));
  return isNaN(num) ? null : num;
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

export const CycleDataProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentCycle, setCurrentCycle] = useState(defaultCycleState);
  const [archivedCycles, setArchivedCycles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const lastUserIdRef = useRef(null);

  const resetState = useCallback(() => {
    setCurrentCycle(defaultCycleState);
    setArchivedCycles([]);
    setIsLoading(false);
    hasLoadedRef.current = false;
  }, []);

  const loadCycleData = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.uid) {
        const previousUserId = lastUserIdRef.current;
        lastUserIdRef.current = null;
        if (previousUserId) {
          clearCycleDataCache(previousUserId).catch((error) =>
            console.error('Failed to clear cached cycle data on sign-out.', error)
          );
        }
        resetState();
        return;
      }

      lastUserIdRef.current = user.uid;

      let cachedDataApplied = false;

      if (!hasLoadedRef.current) {
        try {
          const cached = await getCachedCycleData(user.uid);
          if (cached) {
            setCurrentCycle(cached.currentCycle ?? defaultCycleState);
            setArchivedCycles(cached.archivedCycles ?? []);
            hasLoadedRef.current = true;
            cachedDataApplied = true;
            if (!silent) {
              setIsLoading(false);
            }
          }
        } catch (cacheError) {
          console.error('Failed to hydrate cycle data from cache.', cacheError);
        }
      }

      const shouldShowLoading = !silent && !cachedDataApplied && !hasLoadedRef.current;
      if (shouldShowLoading) {
        setIsLoading(true);
      }

      try {
        const cycleToLoad = await fetchCurrentCycleDB(user.uid);

        let currentCycleData = defaultCycleState;
        if (cycleToLoad) {
          const startDate = normalizeDate(cycleToLoad.startDate);
          const endDate = normalizeDate(cycleToLoad.endDate);
          const processed = processCycleEntries(cycleToLoad.data, startDate);
          const filteredStart = filterEntriesByStartDate(processed, startDate);
          const filtered = filterEntriesByEndDate(filteredStart, endDate);

          currentCycleData = {
            ...cycleToLoad,
            startDate,
            endDate,
            data: filtered
          };
        }

        const archivedData = await fetchArchivedCyclesDB(user.uid, cycleToLoad ? cycleToLoad.startDate : null);
        const archivedCyclesData = archivedData.map((cycle) => {
          const aStart = normalizeDate(cycle.startDate);
          const aEnd = normalizeDate(cycle.endDate);
          const processed = processCycleEntries(cycle.data || [], aStart);
          const filteredStart = filterEntriesByStartDate(processed, aStart);
          const filtered = filterEntriesByEndDate(filteredStart, aEnd);
          return {
            ...cycle,
            startDate: aStart ?? format(startOfDay(new Date()), 'yyyy-MM-dd'),
            endDate: aEnd,
            needsCompletion: cycle.needsCompletion,
            data: filtered
          };
        });

        setCurrentCycle(currentCycleData);
        setArchivedCycles(archivedCyclesData);

        await saveCycleDataToCache(user.uid, {
          currentCycle: currentCycleData,
          archivedCycles: archivedCyclesData
        });

        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Error in loadCycleData:', error);
        if (error.code === 'permission-denied') {
          console.error('Firebase permissions error. Check Firestore rules.');
        }
        if (!cachedDataApplied) {
          try {
            const cached = await getCachedCycleData(user.uid);
            if (cached) {
              setCurrentCycle(cached.currentCycle ?? defaultCycleState);
              setArchivedCycles(cached.archivedCycles ?? []);
              hasLoadedRef.current = true;
            } else {
              setCurrentCycle(defaultCycleState);
              setArchivedCycles([]);
              hasLoadedRef.current = false;
            }
          } catch (cacheError) {
            console.error('Failed to recover cycle data from cache after error.', cacheError);
            setCurrentCycle(defaultCycleState);
            setArchivedCycles([]);
            hasLoadedRef.current = false;
          }
        }
      } finally {
        if (shouldShowLoading) {
          setIsLoading(false);
        }
      }
    },
    [user, resetState]
  );

  useEffect(() => {
    if (!user?.uid) {
      resetState();
      return;
    }

    loadCycleData().catch((error) => console.error('Initial cycle data load failed:', error));
  }, [user?.uid, loadCycleData, resetState]);

  const addOrUpdateDataPoint = useCallback(
    async (newData, editingRecord, targetCycleId = null) => {
      const cycleIdToUse = targetCycleId ?? currentCycle.id;
      if (!user?.uid || !cycleIdToUse) {
        console.error('User or cycle id is missing');
        throw new Error('User or cycle id is missing');
      }

      setIsLoading(true);

      try {
        const selectedMeasurement = newData.measurements.find((m) => m.selected) || newData.measurements[0];
        const timeString =
          selectedMeasurement && selectedMeasurement.time && selectedMeasurement.time.trim() !== ''
            ? selectedMeasurement.time
            : format(new Date(), 'HH:mm');
        const recordDateTime = parse(`${newData.isoDate} ${timeString}`, 'yyyy-MM-dd HH:mm', new Date());

        const targetCycle =
          cycleIdToUse === currentCycle.id
            ? currentCycle
            : archivedCycles.find((cycle) => cycle.id === cycleIdToUse);

        let targetRecord = editingRecord;
        if (!targetRecord && targetCycle) {
          targetRecord = targetCycle.data.find((r) => r.isoDate === newData.isoDate);
        }
        if (targetRecord && String(targetRecord.id).startsWith('placeholder-')) {
          targetRecord = null;
        }
        const existingPeakRecord =
          targetCycle?.data?.find((record) => record?.peak_marker === 'peak') || null;

        if (
          newData.peak_marker === 'peak' &&
          existingPeakRecord &&
          existingPeakRecord.id !== targetRecord?.id
        ) {
          await updateCycleEntry(user.uid, cycleIdToUse, existingPeakRecord.id, {
            peak_marker: null,
          });
        }

        const rawTemp = normalizeTemp(selectedMeasurement.temperature);
        const correctedTemp = normalizeTemp(selectedMeasurement.temperature_corrected);
        const useCorrected = !!selectedMeasurement.use_corrected && correctedTemp !== null;
        const chartTemp = useCorrected ? correctedTemp : rawTemp;

        const peakMarkerProvided = Object.prototype.hasOwnProperty.call(
          newData,
          'peak_marker'
        );

        const measurementsList = Array.isArray(newData.measurements) ? newData.measurements : [];
        const hasTemperatureData = measurementsList.some((measurement) => {
          if (!measurement) return false;
          const measurementRaw = normalizeTemp(measurement.temperature);
          const measurementCorrected = normalizeTemp(measurement.temperature_corrected);
          return measurementRaw !== null || measurementCorrected !== null;
        });

        const trimValue = (value) => {
          if (value === null || value === undefined) return '';
          return String(value).trim();
        };

        const mucusSensationValue = trimValue(
          newData.mucusSensation ?? newData.mucus_sensation ?? ''
        );
        const mucusAppearanceValue = trimValue(
          newData.mucusAppearance ?? newData.mucus_appearance ?? ''
        );
        const observationsValue = trimValue(newData.observations ?? '');
        const fertilitySymbolValue =
          newData.fertility_symbol ?? newData.fertilitySymbol ?? null;
        const hasFertilitySymbol =
          fertilitySymbolValue !== null &&
          fertilitySymbolValue !== undefined &&
          fertilitySymbolValue !== '' &&
          fertilitySymbolValue !== 'none';
        const isPeakMarked = newData.peak_marker === 'peak';

        const isPayloadEmpty =
          !hasTemperatureData &&
          mucusSensationValue === '' &&
          mucusAppearanceValue === '' &&
          !hasFertilitySymbol &&
          observationsValue === '' &&
          !isPeakMarked;

        const recordPayload = {
          cycle_id: cycleIdToUse,
          user_id: user.uid,
          timestamp: format(recordDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          measurements: newData.measurements,
          mucus_sensation: newData.mucusSensation || null,
          mucus_appearance: newData.mucusAppearance || null,
          fertility_symbol: newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,
          observations: newData.observations || null,
          ignored: targetRecord ? (newData.ignored ?? targetRecord.ignored) : newData.ignored || false,
          peak_marker: peakMarkerProvided
            ? newData.peak_marker ?? null
            : targetRecord?.peak_marker ?? null,
          temperature_raw: rawTemp,
          temperature_corrected: correctedTemp,
          use_corrected: useCorrected,
          temperature_chart: chartTemp
        };

        if (targetRecord) {
          const isRemovingPeak =
            peakMarkerProvided && targetRecord?.peak_marker === 'peak' && !isPeakMarked;
          if (isPayloadEmpty && isRemovingPeak) {
            await deleteCycleEntryDB(user.uid, cycleIdToUse, targetRecord.id);
          } else {
            await updateCycleEntry(user.uid, cycleIdToUse, targetRecord.id, recordPayload);
          }
        } else {
          if (isPayloadEmpty) {
            return;
          }
          await createNewCycleEntry(recordPayload);
        }

        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error adding/updating data point:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle, archivedCycles, loadCycleData]
  );

  const deleteRecord = useCallback(
    async (recordId, targetCycleId = null) => {
      const cycleIdToUse = targetCycleId ?? currentCycle.id;
      if (!user?.uid || !cycleIdToUse) return;

      setIsLoading(true);
      try {
        await deleteCycleEntryDB(user.uid, cycleIdToUse, recordId);
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error deleting record:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle.id, loadCycleData]
  );

  const toggleIgnoreRecord = useCallback(
    async (cycleIdToUpdate, recordId) => {
      if (!user?.uid) return;

      const isCurrentCycle = cycleIdToUpdate === currentCycle.id;
      const targetCycle = isCurrentCycle ? currentCycle : archivedCycles.find((cycle) => cycle.id === cycleIdToUpdate);

      if (!targetCycle) {
        throw new Error('Cycle not found for toggling ignore state.');
      }

      const recordToUpdate = targetCycle.data?.find((r) => r.id === recordId);
      if (!recordToUpdate) {
        throw new Error('Record not found for toggling ignore state.');
      }

      const newIgnoredState = !recordToUpdate.ignored;

      const applyIgnoredState = (ignoredValue) => {
        if (isCurrentCycle) {
          setCurrentCycle((prevCycle) => {
            if (prevCycle.id !== cycleIdToUpdate) return prevCycle;
            return {
              ...prevCycle,
              data: prevCycle.data.map((record) => (record.id === recordId ? { ...record, ignored: ignoredValue } : record))
            };
          });
        } else {
          setArchivedCycles((prevCycles) =>
            prevCycles.map((cycle) => {
              if (cycle.id !== cycleIdToUpdate) return cycle;
              return {
                ...cycle,
                data: (cycle.data || []).map((record) => (record.id === recordId ? { ...record, ignored: ignoredValue } : record))
              };
            })
          );
        }
      };

      try {
        applyIgnoredState(newIgnoredState);
        await updateCycleEntry(user.uid, cycleIdToUpdate, recordId, { ignored: newIgnoredState });

        loadCycleData({ silent: true }).catch((error) =>
          console.error('Background cycle data refresh failed after toggling ignore state:', error)
        );
      } catch (error) {
        console.error('Error toggling ignore state:', error);
        applyIgnoredState(!newIgnoredState);
        throw error;
      }
    },
    [user, currentCycle, archivedCycles, loadCycleData]
  );

  const startNewCycle = useCallback(
    async (selectedStartDate) => {
      if (!user?.uid) return;

      setIsLoading(true);
      try {
        const startDateObj = selectedStartDate ? startOfDay(parseISO(selectedStartDate)) : startOfDay(new Date());

        if (currentCycle.id && selectedStartDate) {
          const currentStart = startOfDay(parseISO(currentCycle.startDate));
          if (startDateObj <= currentStart) {
            toast({
              title: 'Fecha inválida',
              description: 'La fecha de inicio del nuevo ciclo debe ser posterior al inicio del ciclo actual.',
              variant: 'destructive'
            });
            setIsLoading(false);
            return;
          }
        }

        if (currentCycle.id) {
          const archiveEndDate = format(addDays(startDateObj, -1), 'yyyy-MM-dd');
          await archiveCycleDB(currentCycle.id, user.uid, archiveEndDate);
        }

        const newStartDate = format(startDateObj, 'yyyy-MM-dd');
        const newCycle = await createNewCycleDB(user.uid, newStartDate);
        setCurrentCycle({ id: newCycle.id, startDate: newCycle.start_date, endDate: null, data: [] });
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error starting new cycle:', error);
        try {
          if (currentCycle.id) {
            await updateCycleDatesDB(currentCycle.id, user.uid, undefined, null);
          }
        } catch (e) {
          console.error('Rollback failed:', e);
        }
        toast({ title: 'Error', description: 'No se pudo iniciar el nuevo ciclo.', variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle, loadCycleData, toast]
  );

  const addArchivedCycle = useCallback(
    async (startDate, endDate) => {
      if (!user?.uid) return;
      if (!endDate) {
        toast({ title: 'Error', description: 'La fecha de fin es obligatoria.', variant: 'destructive' });
        return;
      }

      setIsLoading(true);
      try {
        const newCycle = await createNewCycleDB(user.uid, startDate);
        await updateCycleDatesDB(newCycle.id, user.uid, undefined, endDate);
        await loadCycleData({ silent: true });
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
    },
    [user, loadCycleData, toast]
  );

  const deleteCycle = useCallback(
    async (cycleId) => {
      if (!user?.uid) return;

      setIsLoading(true);
      try {
        await deleteCycleDB(user.uid, cycleId);
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error deleting cycle:', error);
        toast({ title: 'Error', description: 'No se pudo eliminar el ciclo.', variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCycleData, toast]
  );

  const checkCycleOverlap = useCallback(
    async (cycleIdToCheck, newStartDate) => {
      if (!user?.uid) return null;
      try {
        const result = await updateCycleDatesDB(cycleIdToCheck, user.uid, newStartDate, undefined, true);
        return result.overlap;
      } catch (error) {
        console.error('Error checking cycle overlap:', error);
        return null;
      }
    },
    [user]
  );

  const updateCycleDates = useCallback(
    async (cycleIdToUpdate, newStartDate, newEndDate, force = false) => {
      if (!user?.uid) return;

      setIsLoading(true);
      try {
        if (force && newStartDate) {
          await forceUpdateCycleStartDB(user.uid, cycleIdToUpdate, newStartDate);
          if (newEndDate !== undefined) {
            await updateCycleDatesDB(cycleIdToUpdate, user.uid, undefined, newEndDate);
          }
        } else {
          await updateCycleDatesDB(cycleIdToUpdate, user.uid, newStartDate, newEndDate);
        }
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error updating cycle dates:', error);
        const description =
          error.message && error.message.includes('overlap')
            ? 'Las fechas coinciden con otro ciclo.'
            : 'No se pudieron actualizar las fechas.';
        toast({ title: 'Error', description, variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCycleData, toast]
  );

  const forceUpdateCycleStart = useCallback(
    (cycleIdToUpdate, newStartDate) => updateCycleDates(cycleIdToUpdate, newStartDate, undefined, true),
    [updateCycleDates]
  );

  const getCycleById = useCallback(
    async (cycleIdToFetch) => {
      if (!user?.uid) return null;

      setIsLoading(true);
      try {
        const cycleData = await fetchCycleByIdDB(user.uid, cycleIdToFetch);
        if (!cycleData) return null;

        const startDate = normalizeDate(cycleData.startDate);
        const endDate = normalizeDate(cycleData.endDate);
        const processed = processCycleEntries(cycleData.data || [], startDate);
        const filteredStart = filterEntriesByStartDate(processed, startDate);
        const filtered = filterEntriesByEndDate(filteredStart, endDate);

        return {
          ...cycleData,
          startDate: startDate ?? format(startOfDay(new Date()), 'yyyy-MM-dd'),
          endDate,
          data: filtered
        };
      } catch (error) {
        console.error('Error fetching cycle by ID:', error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const refreshData = useCallback(
    ({ silent = true } = {}) => loadCycleData({ silent }),
    [loadCycleData]
  );

  const value = {
    currentCycle,
    archivedCycles,
    addOrUpdateDataPoint,
    deleteRecord,
    startNewCycle,
    updateCycleDates,
    forceUpdateCycleStart,
    checkCycleOverlap,
    isLoading,
    getCycleById,
    refreshData,
    toggleIgnoreRecord,
    addArchivedCycle,
    deleteCycle
  };

  return <CycleDataContext.Provider value={value}>{children}</CycleDataContext.Provider>;
};

export const useCycleDataContext = () => {
  const context = useContext(CycleDataContext);
  if (!context) {
    throw new Error('useCycleDataContext must be used within a CycleDataProvider');
  }
  return context;
};

export default CycleDataContext;