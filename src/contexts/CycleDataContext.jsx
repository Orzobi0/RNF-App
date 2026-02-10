import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { format, startOfDay, parseISO, addDays, parse, isValid } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  processCycleEntries,
  createNewCycleEntry,
  updateCycleEntry,
  deleteCycleEntryDB,
  startNewCycleDB,
  fetchCycleByIdDB,
  fetchCurrentCycleDB,
  fetchArchivedCyclesDB,
  fetchEntryMeasurementsDB,
  updateCycleDatesDB,
  updateCycleIgnoreAutoCalculations,
  deleteCycleDB,
  undoCurrentCycleDB,
  forceUpdateCycleStart as forceUpdateCycleStartDB,
  forceShiftNextCycleStart as forceShiftNextCycleStartDB
} from '@/lib/cycleDataHandler';
import {
  deleteRecordDB,
  fetchRecordMeasurementsDB,
  fetchRecordsInRangeDB,
  upsertRecordDB,
} from '@/lib/recordDataHandler';
import { getCachedCycleData, saveCycleDataToCache, clearCycleDataCache } from '@/lib/cycleCache';
import { getFunctions, httpsCallable } from "firebase/functions";
import { readBbtFromHealthConnect } from "@/lib/healthConnectSync";


const CycleDataContext = createContext(null);
const isRecordsDataModelV1 = import.meta.env.VITE_DATA_MODEL === 'records_v1';

const defaultCycleState = {
  id: null,
  startDate: null,
  endDate: null,
  data: [],
  ignoredForAutoCalculations: false,
};

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

const isMeasurementValid = (measurement) => {
  if (!measurement) return false;
  const raw = measurement.temperature;
  const corrected = measurement.temperature_corrected;
  const rawString = raw === null || raw === undefined ? '' : String(raw).trim();
  const correctedString =
    corrected === null || corrected === undefined ? '' : String(corrected).trim();
  return rawString !== '' || correctedString !== '';
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

const normalizeCycleRange = (startDate, endDate) => {
  const normalizedStart = normalizeDate(startDate);
  const normalizedEnd = normalizeDate(endDate);

  if (normalizedStart && normalizedEnd && parseISO(normalizedEnd) < parseISO(normalizedStart)) {
    return { startDate: normalizedEnd, endDate: normalizedStart };
  }

  return { startDate: normalizedStart, endDate: normalizedEnd };
};

const getTodayIso = () => format(startOfDay(new Date()), 'yyyy-MM-dd');

const hydrateCycleWithRecords = async (userId, cycleData) => {
  const { startDate, endDate } = normalizeCycleRange(cycleData?.startDate, cycleData?.endDate);
  const records = startDate
    ? await fetchRecordsInRangeDB(userId, startDate, endDate ?? getTodayIso())
    : [];
  const processed = processCycleEntries(records, startDate);
  const filteredStart = filterEntriesByStartDate(processed, startDate);
  const filtered = filterEntriesByEndDate(filteredStart, endDate);

  return {
    ...cycleData,
    startDate,
    endDate,
    data: filtered,
  };
};

const buildEntryForState = ({
  payload,
  entryId,
  isoDate,
  cycleStartDate,
  existingEntry,
}) => {
  const entryForProcessing = {
    id: entryId,
    iso_date: isoDate,
    timestamp: payload.timestamp,
    temperature_raw: payload.temperature_raw ?? null,
    temperature_corrected: payload.temperature_corrected ?? null,
    use_corrected: Boolean(payload.use_corrected),
    temperature_chart: payload.temperature_chart ?? null,
    mucus_sensation: payload.mucus_sensation ?? null,
    mucus_appearance: payload.mucus_appearance ?? null,
    fertility_symbol: payload.fertility_symbol ?? null,
    observations: payload.observations ?? null,
    had_relations: payload.had_relations ?? false,
    ignored: payload.ignored ?? false,
    peak_marker: payload.peak_marker ?? null,
    measurements:
      payload.measurements ??
      (Array.isArray(existingEntry?.measurements) ? existingEntry.measurements : []),
  };

  const processed = cycleStartDate
    ? processCycleEntries([entryForProcessing], cycleStartDate)
    : [];

  if (!processed.length) {
    return {
      ...existingEntry,
      ...entryForProcessing,
      isoDate,
      measurements: entryForProcessing.measurements,
      measurementsLoaded: Array.isArray(payload.measurements)
        ? true
        : existingEntry?.measurementsLoaded,
    };
  }

  return {
    ...existingEntry,
    ...processed[0],
    measurements: entryForProcessing.measurements,
    measurementsLoaded: Array.isArray(payload.measurements)
      ? true
      : existingEntry?.measurementsLoaded,
  };
};

const sortEntriesByTimestamp = (entries) =>
  [...entries].sort((a, b) => {
    const dateA = a.timestamp ? parseISO(a.timestamp) : a.isoDate ? parseISO(a.isoDate) : 0;
    const dateB = b.timestamp ? parseISO(b.timestamp) : b.isoDate ? parseISO(b.isoDate) : 0;
    return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
  });

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
      const isOffline =
  typeof navigator !== 'undefined' && navigator.onLine === false;

      // Si ya tenemos algo cargado (por caché o porque ya se cargó antes), y no hay red,
      // no intentamos Firestore. Así abre rápido y sin “ruido”.
      if (isOffline && (cachedDataApplied || hasLoadedRef.current)) {
        if (!silent) setIsLoading(false);
        return;
      }

      try {
        const cycleToLoad = await fetchCurrentCycleDB(user.uid);

        let currentCycleData = defaultCycleState;
        if (cycleToLoad) {
          if (isRecordsDataModelV1) {
            currentCycleData = await hydrateCycleWithRecords(user.uid, cycleToLoad);
          } else {
            const { startDate, endDate } = normalizeCycleRange(
              cycleToLoad.startDate,
              cycleToLoad.endDate
            );
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
        }

        const archivedData = await fetchArchivedCyclesDB(user.uid, cycleToLoad ? cycleToLoad.startDate : null);
        const archivedCyclesData = await Promise.all(
          archivedData.map(async (cycle) => {
            if (isRecordsDataModelV1) {
              const hydratedCycle = await hydrateCycleWithRecords(user.uid, cycle);
              return {
                ...hydratedCycle,
                startDate: hydratedCycle.startDate ?? getTodayIso(),
                needsCompletion: cycle.needsCompletion,
              };
            }

            const { startDate: aStart, endDate: aEnd } = normalizeCycleRange(
              cycle.startDate,
              cycle.endDate
            );
            const processed = processCycleEntries(cycle.data || [], aStart);
            const filteredStart = filterEntriesByStartDate(processed, aStart);
            const filtered = filterEntriesByEndDate(filteredStart, aEnd);
            return {
              ...cycle,
              startDate: aStart ?? getTodayIso(),
              endDate: aEnd,
              needsCompletion: cycle.needsCompletion,
              data: filtered
            };
          })
        );

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

  const updateEntryState = useCallback((cycleId, entryId, payload, isoDate, { remove = false } = {}) => {
    const applyUpdate = (cycle) => {
      if (!cycle || cycle.id !== cycleId) return cycle;

      const currentData = Array.isArray(cycle.data) ? cycle.data : [];

      if (remove) {
        return { ...cycle, data: currentData.filter((entry) => entry.id !== entryId) };
      }

      const existingEntry = currentData.find((entry) => entry.id === entryId) || null;
      const updatedEntry = buildEntryForState({
        payload,
        entryId,
        isoDate,
        cycleStartDate: cycle.startDate,
        existingEntry,
      });

      const nextData = existingEntry
        ? currentData.map((entry) => (entry.id === entryId ? updatedEntry : entry))
        : sortEntriesByTimestamp([...currentData, updatedEntry]);

      return { ...cycle, data: nextData };
    };

    setCurrentCycle((prevCycle) => applyUpdate(prevCycle));
    setArchivedCycles((prevCycles) => prevCycles.map((cycle) => applyUpdate(cycle)));
  }, []);

  const updateEntryMeasurementsState = useCallback((cycleId, entryId, measurements) => {
    const applyUpdate = (cycle) => {
      if (!cycle || cycle.id !== cycleId) return cycle;
      const currentData = Array.isArray(cycle.data) ? cycle.data : [];
      const nextData = currentData.map((entry) =>
        entry.id === entryId
          ? { ...entry, measurements, measurementsLoaded: true }
          : entry
      );
      return { ...cycle, data: nextData };
    };

    setCurrentCycle((prevCycle) => applyUpdate(prevCycle));
    setArchivedCycles((prevCycles) => prevCycles.map((cycle) => applyUpdate(cycle)));
  }, []);

  const addOrUpdateDataPoint = useCallback(
    async (newData, editingRecord, targetCycleId = null) => {
      const cycleIdToUse = targetCycleId ?? currentCycle.id;
      if (!user?.uid || !cycleIdToUse) {
        console.error('User or cycle id is missing');
        throw new Error('User or cycle id is missing');
      }

      setIsLoading(true);

      try {
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
          if (isRecordsDataModelV1) {
            await upsertRecordDB(user.uid, existingPeakRecord.isoDate, { peak_marker: null });
          } else {
            await updateCycleEntry(user.uid, cycleIdToUse, existingPeakRecord.id, {
              peak_marker: null,
            });
          }
        }

        const measurementsList = Array.isArray(newData.measurements) ? newData.measurements : [];
        const validMeasurements = measurementsList.filter(isMeasurementValid);
        const selectedMeasurement =
          validMeasurements.find((measurement) => measurement?.selected) || validMeasurements[0] || null;
        const measurementWithTime =
          measurementsList.find(
            (measurement) =>
              measurement?.time && String(measurement.time).trim() !== ''
          ) || selectedMeasurement;
        const fallbackTime = (() => {
          if (measurementWithTime?.time && String(measurementWithTime.time).trim() !== '') {
            return measurementWithTime.time;
          }
          if (targetRecord?.timestamp) {
            try {
              return format(parseISO(targetRecord.timestamp), 'HH:mm');
            } catch (error) {
              return format(new Date(), 'HH:mm');
            }
          }
          return format(new Date(), 'HH:mm');
        })();
        const recordDateTime = parse(`${newData.isoDate} ${fallbackTime}`, 'yyyy-MM-dd HH:mm', new Date());

        const rawTemp = normalizeTemp(selectedMeasurement?.temperature);
        const correctedTemp = normalizeTemp(selectedMeasurement?.temperature_corrected);
        const useCorrected = !!selectedMeasurement?.use_corrected && correctedTemp !== null;
        const chartTemp = useCorrected ? correctedTemp : rawTemp;

        const peakMarkerProvided = Object.prototype.hasOwnProperty.call(
          newData,
          'peak_marker'
        );

        const hasTemperatureData = validMeasurements.some((measurement) => {
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
        const hadRelationsValue = Boolean(
          newData.had_relations ?? newData.hadRelations ?? false
        );
        const isPeakMarked = newData.peak_marker === 'peak';

        const isPayloadEmpty =
          !hasTemperatureData &&
          mucusSensationValue === '' &&
          mucusAppearanceValue === '' &&
          !hasFertilitySymbol &&
          observationsValue === '' &&
          !hadRelationsValue &&
          !isPeakMarked;

        const hadMultipleMeasurements =
          !!targetRecord?.measurementsLoaded &&
          Array.isArray(targetRecord?.measurements) &&
          targetRecord.measurements.length >= 2;

        const shouldPersistMeasurements = validMeasurements.length >= 2;
        const shouldClearMeasurements = hadMultipleMeasurements && validMeasurements.length < 2;

        const measurementsPayload = Array.isArray(newData.measurements)
          ? shouldPersistMeasurements
            ? validMeasurements
            : shouldClearMeasurements
              ? []
              : undefined
          : undefined;
        const recordPayload = {
          cycle_id: cycleIdToUse,
          user_id: user.uid,
          timestamp: format(recordDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          measurements: measurementsPayload,
          mucus_sensation: newData.mucusSensation || null,
          mucus_appearance: newData.mucusAppearance || null,
          fertility_symbol: newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,
          observations: newData.observations || null,
          had_relations: hadRelationsValue,
          ignored: targetRecord ? (newData.ignored ?? targetRecord.ignored) : newData.ignored || false,
          peak_marker: peakMarkerProvided
            ? newData.peak_marker ?? null
            : targetRecord?.peak_marker ?? null,
          temperature_raw: rawTemp,
          temperature_corrected: correctedTemp,
          use_corrected: useCorrected,
          temperature_chart: chartTemp
        };

        let savedEntryId = targetRecord?.id ?? null;
        if (targetRecord) {
          const isRemovingPeak =
            peakMarkerProvided && targetRecord?.peak_marker === 'peak' && !isPeakMarked;
          if (isPayloadEmpty && isRemovingPeak) {
            if (isRecordsDataModelV1) {
              await deleteRecordDB(user.uid, targetRecord.isoDate ?? targetRecord.id);
            } else {
              await deleteCycleEntryDB(user.uid, cycleIdToUse, targetRecord.id);
            }
            updateEntryState(cycleIdToUse, targetRecord.id, recordPayload, newData.isoDate, {
              remove: true,
            });
          } else {
            if (isRecordsDataModelV1) {
              await upsertRecordDB(user.uid, newData.isoDate, recordPayload, measurementsPayload);
            } else {
              await updateCycleEntry(user.uid, cycleIdToUse, targetRecord.id, recordPayload);
            }
            updateEntryState(
              cycleIdToUse,
              isRecordsDataModelV1 ? newData.isoDate : targetRecord.id,
              recordPayload,
              newData.isoDate
            );
          }
        } else {
          if (isPayloadEmpty) {
            return;
          }
          if (isRecordsDataModelV1) {
            await upsertRecordDB(user.uid, newData.isoDate, recordPayload, measurementsPayload);
            savedEntryId = newData.isoDate;
          } else {
            const created = await createNewCycleEntry(recordPayload);
            savedEntryId = created?.id ?? null;
          }
          if (savedEntryId) {
            updateEntryState(cycleIdToUse, savedEntryId, recordPayload, newData.isoDate);
          }
        }

        loadCycleData({ silent: true }).catch((error) =>
          console.error('Background cycle data refresh failed after save:', error)
        );
      } catch (error) {
        console.error('Error adding/updating data point:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle, archivedCycles, loadCycleData, updateEntryState]
  );

  const getMeasurementsForEntry = useCallback(
    async (cycleId, entryId) => {
      if (!user?.uid || !cycleId || !entryId) return [];
      const measurements = isRecordsDataModelV1
        ? await fetchRecordMeasurementsDB(user.uid, entryId)
        : await fetchEntryMeasurementsDB(user.uid, cycleId, entryId);
      updateEntryMeasurementsState(cycleId, entryId, measurements);
      return measurements;
    },
    [user, updateEntryMeasurementsState]
  );

  const deleteRecord = useCallback(
    async (recordId, targetCycleId = null) => {
      const cycleIdToUse = targetCycleId ?? currentCycle.id;
      if (!user?.uid || !cycleIdToUse) return;

      setIsLoading(true);
      try {
        if (isRecordsDataModelV1) {
          await deleteRecordDB(user.uid, recordId);
        } else {
          await deleteCycleEntryDB(user.uid, cycleIdToUse, recordId);
        }
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
        if (isRecordsDataModelV1) {
          await upsertRecordDB(user.uid, recordToUpdate.isoDate ?? recordId, {
            ignored: newIgnoredState,
          });
        } else {
          await updateCycleEntry(user.uid, cycleIdToUpdate, recordId, { ignored: newIgnoredState });
        }

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

  const setCycleIgnoreForAutoCalculations = useCallback(
    async (cycleIdToUpdate, shouldIgnore) => {
      if (!user?.uid || !cycleIdToUpdate) {
        return;
      }

      const previousCurrentCycle = currentCycle;
      const previousArchivedCycles = archivedCycles;

      const updateCycle = (cycle) => {
        if (!cycle || cycle.id !== cycleIdToUpdate) {
          return cycle;
        }

        if (cycle.ignoredForAutoCalculations === shouldIgnore) {
          return cycle;
        }

        return { ...cycle, ignoredForAutoCalculations: shouldIgnore };
      };

      setCurrentCycle((prevCycle) => updateCycle(prevCycle));
      setArchivedCycles((prevCycles) => prevCycles.map((cycle) => updateCycle(cycle)));

      try {
        await updateCycleIgnoreAutoCalculations(user.uid, cycleIdToUpdate, shouldIgnore);

        loadCycleData({ silent: true }).catch((error) =>
          console.error(
            'Background cycle data refresh failed after updating ignore configuration:',
            error
          )
        );
      } catch (error) {
        console.error('Error updating cycle ignore configuration:', error);
        setCurrentCycle(previousCurrentCycle);
        setArchivedCycles(previousArchivedCycles);
        toast({
          title: 'Error',
          description: 'No se pudo actualizar la configuración del ciclo.',
          variant: 'destructive',
        });
        throw error;
      }
    },
    [user, currentCycle, archivedCycles, loadCycleData, toast]
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

        const newStartDate = format(startDateObj, 'yyyy-MM-dd');
        const newCycle = await startNewCycleDB(user.uid, currentCycle.id, newStartDate);
        setCurrentCycle({
          id: newCycle.id,
          startDate: newCycle.start_date,
          endDate: null,
          data: [],
          ignoredForAutoCalculations: false,
        });
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error starting new cycle:', error);
        const formatDMY = (iso) => {
          try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; }
        };

        const description = (() => {
          if (error?.code === 'cycle-overlap') {
            const c = error?.conflictCycle;
            if (!c) return 'Las fechas coinciden con otro ciclo.';
            const s = c.startDate ? formatDMY(c.startDate) : 'sin fecha de inicio';
            const e = c.endDate ? formatDMY(c.endDate) : 'en curso';
            return `Las fechas coinciden con el ciclo del ${s} al ${e}.`;
          }
          if (error?.code === 'split-date-conflict') {
            const d = error?.conflictDate ? formatDMY(error.conflictDate) : 'esa fecha';
            return `No se pudo dividir el ciclo porque el ciclo nuevo ya tiene más de un registro en ${d}. Esto suele venir de datos duplicados (por ejemplo, creados desde otra sesión o por un estado inconsistente).`;
          }
          if (error?.code === 'split-invalid-entry') {
            return 'No se pudo dividir el ciclo porque hay registros con fecha inválida en el ciclo anterior.';
          }
          if (error?.code === 'split-invalid-date') {
            return 'La fecha elegida para iniciar el ciclo no es válida.';
          }
          return 'No se pudo iniciar el nuevo ciclo.';
        })();

        toast({ title: 'Error', description, variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle, loadCycleData, toast]
  );

  const buildOverlapDescription = useCallback((conflictCycle) => {
    if (!conflictCycle) {
      return 'Las fechas coinciden con otro ciclo.';
    }

    const { startDate, endDate } = conflictCycle;

    const formatDate = (date) => {
      if (!date) return null;
      try {
        return format(parseISO(date), 'dd/MM/yyyy');
      } catch (error) {
        console.error('Failed to format overlap date', error);
        return date;
      }
    };

    const formattedStart = formatDate(startDate) ?? 'sin fecha de inicio';
    const formattedEnd = endDate ? formatDate(endDate) : 'en curso';

    return `Las fechas coinciden con el ciclo del ${formattedStart} al ${formattedEnd}.`;
  }, []);

  const getErrorDescription = useCallback(
    (error, fallbackMessage) => {
      const conflictCycle = error?.conflictCycle ?? error?.details?.conflictCycle;

      if (error?.code === 'cycle-overlap') {
        return buildOverlapDescription(conflictCycle);
      }

      if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message;
      }

      return fallbackMessage;
    },
    [buildOverlapDescription]
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
        try {
          await updateCycleDatesDB(newCycle.id, user.uid, undefined, endDate);
        } catch (updateError) {
          try {
            await deleteCycleDB(user.uid, newCycle.id);
          } catch (cleanupError) {
            console.error('Failed to clean up cycle after overlap error:', cleanupError);
          }
          throw updateError;
        }
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error adding archived cycle:', error);
        const description = getErrorDescription(error, 'No se pudo crear el ciclo.');
        toast({ title: 'Error', description, variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCycleData, toast, getErrorDescription]
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
  const undoCurrentCycle = useCallback(
    async (cycleIdToUndo) => {
      if (!user?.uid || !cycleIdToUndo) return;

      setIsLoading(true);
      try {
        await undoCurrentCycleDB(user.uid, cycleIdToUndo);
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error undoing current cycle:', error);
        const description = (() => {
          switch (error.code) {
            case 'no-previous-cycle':
              return 'No hay un ciclo previo compatible para deshacer.';
            case 'undo-not-current':
              return 'Solo se puede deshacer el ciclo actual.';
            case 'undo-invalid-entry':
              return 'Hay registros con fecha inválida en el ciclo actual.';
            case 'undo-date-conflict':
              if (typeof error?.conflictDate === 'string') {
    try {
      const conflict = parseISO(error.conflictDate);
      if (isValid(conflict)) {
        return `El día ${format(conflict, 'dd/MM')} tiene un registro en el ciclo anterior.`;
      }
    } catch (e) {
      // ignorar y caer al mensaje genérico
    }
  }
              return 'El ciclo anterior ya tiene registros en una de las fechas.';
            default:
              return 'No se pudo deshacer el ciclo.';
          }
        })();
        toast({ title: 'Error', description, variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCycleData, toast]
  );

  const checkCycleOverlap = useCallback(
    async (cycleIdToCheck, newStartDate, newEndDate) => {
      if (!user?.uid) return null;
      try {
        const result = await updateCycleDatesDB(
          cycleIdToCheck,
          user.uid,
          newStartDate,
          newEndDate,
          true
        );
        return result.overlap;
      } catch (error) {
        console.error('Error checking cycle overlap:', error);
        return null;
      }
    },
    [user]
  );

  const updateCycleDates = useCallback(
    async (cycleIdToUpdate, newStartDate, newEndDate) => {
      if (!user?.uid) return;

      const cycleToUpdate =
        currentCycle?.id === cycleIdToUpdate
          ? currentCycle
          : archivedCycles.find((cycle) => cycle.id === cycleIdToUpdate);
      const currentStartDate = cycleToUpdate?.startDate ?? null;
      const currentEndDate = cycleToUpdate?.endDate ?? null;
      const hasStartChange = newStartDate !== undefined && newStartDate !== currentStartDate;
      const hasEndChange = newEndDate !== undefined && newEndDate !== currentEndDate;

      setIsLoading(true);
      try {
        if (hasStartChange && newStartDate) {
          await forceUpdateCycleStartDB(user.uid, cycleIdToUpdate, newStartDate);
          }
        if (hasEndChange && newEndDate) {
          const startForCalc = hasStartChange ? newStartDate : currentStartDate;
          await forceShiftNextCycleStartDB(user.uid, cycleIdToUpdate, newEndDate, startForCalc);
        }
        if (hasStartChange || hasEndChange) {
          await updateCycleDatesDB(
            cycleIdToUpdate,
            user.uid,
            hasStartChange ? newStartDate : undefined,
            hasEndChange ? newEndDate : undefined
          );
        }
        await loadCycleData({ silent: true });
      } catch (error) {
        console.error('Error updating cycle dates:', error);
        const description = getErrorDescription(error, 'No se pudieron actualizar las fechas.');
        toast({ title: 'Error', description, variant: 'destructive' });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentCycle, archivedCycles, loadCycleData, toast, getErrorDescription]
  );

  const forceUpdateCycleStart = useCallback(
    (cycleIdToUpdate, newStartDate) =>
      updateCycleDates(cycleIdToUpdate, newStartDate, undefined),
    [updateCycleDates]
  );

  const forceShiftNextCycleStart = useCallback(
    (cycleIdToUpdate, newEndDate, newStartDate) =>
      updateCycleDates(cycleIdToUpdate, newStartDate, newEndDate),
    [updateCycleDates]
  );

  const getCycleById = useCallback(
    async (cycleIdToFetch) => {
      if (!user?.uid) return null;

      setIsLoading(true);
      try {
        const cycleData = await fetchCycleByIdDB(user.uid, cycleIdToFetch);
        if (!cycleData) return null;

        if (isRecordsDataModelV1) {
          const hydratedCycle = await hydrateCycleWithRecords(user.uid, cycleData);
          return {
            ...hydratedCycle,
            startDate: hydratedCycle.startDate ?? getTodayIso(),
          };
        }

        const { startDate, endDate } = normalizeCycleRange(
          cycleData.startDate,
          cycleData.endDate
        );
        const processed = processCycleEntries(cycleData.data || [], startDate);
        const filteredStart = filterEntriesByStartDate(processed, startDate);
        const filtered = filterEntriesByEndDate(filteredStart, endDate);

        return {
          ...cycleData,
          startDate: startDate ?? getTodayIso(),
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

  const syncHealthConnectTemperatures = useCallback(async () => {
    if (!user?.uid) throw new Error("NO_USER");
    if (!currentCycle?.id || !currentCycle?.startDate) throw new Error("NO_CURRENT_CYCLE");

    setIsLoading(true);
    try {
      const items = await readBbtFromHealthConnect({ startDate: currentCycle.startDate });

      if (!items.length) {
        toast({ title: "Sin registros", description: "No se encontraron temperaturas en Health Connect." });
        return;
      }

      const functions = getFunctions(); // si usas región, aquí: getFunctions(app, "europe-west1")
      const syncFn = httpsCallable(functions, "syncBasalBodyTemperature");

      const resp = await syncFn({
        cycleId: currentCycle.id,
        items,
      });

      const data = resp?.data;
      toast({
        title: "Sincronización hecha",
        description: `Nuevos: ${data?.createdMeasurements ?? 0} · Ya estaban: ${data?.skippedMeasurements ?? 0} · Rechazados: ${data?.rejected ?? 0}`,
      });

      await loadCycleData({ silent: true });
      return data;
    } catch (e) {
      console.error(e);
      const toReadableError = (error) =>
        typeof error === "string" ? error : error?.message ?? JSON.stringify(error);
      const message = toReadableError(e);
      if (message.includes("HEALTH_CONNECT_NotInstalled") || message.includes("HEALTH_CONNECT_NotSupported")) {
        toast({
          title: "Health Connect no disponible",
          description: "Instala Health Connect para poder sincronizar tus registros.",
          variant: "destructive",
        });
        return null;
      }
      if (message.includes("HEALTH_CONNECT_ONLY_IN_APP")) {
        toast({
          title: "Solo en la app Android",
          description: "La sincronización está disponible únicamente en la app Android.",
          variant: "destructive",
        });
        return null;
      }
      if (message.includes("HEALTH_CONNECT_PERMISSION_DENIED")) {
        toast({
          title: "Permisos requeridos",
          description: "Debes conceder permisos de Health Connect para sincronizar.",
          variant: "destructive",
        });
        return null;
      }
      if (message.includes("HEALTH_CONNECT_INVALID_START_DATE")) {
        toast({
          title: "Fecha de inicio inválida",
          description: "No se pudo leer la fecha de inicio del ciclo actual.",
          variant: "destructive",
        });
        return null;
      }
      toast({
        title: "Error al sincronizar",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCycle, loadCycleData, toast]);


  const value = {
    currentCycle,
    archivedCycles,
    syncHealthConnectTemperatures,
    addOrUpdateDataPoint,
    deleteRecord,
    startNewCycle,
    updateCycleDates,
    forceUpdateCycleStart,
    forceShiftNextCycleStart,
    checkCycleOverlap,
    isLoading,
    getCycleById,
    refreshData,
    toggleIgnoreRecord,
    setCycleIgnoreForAutoCalculations,
    addArchivedCycle,
    deleteCycle,
    getMeasurementsForEntry,
    undoCurrentCycle
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
