import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { differenceInDays, format, startOfDay, parseISO, addDays, parse } from 'date-fns';
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
import {
  QUEUED_OPERATION_TYPES,
  createQueuedOperation,
  getQueuedOperations,
  persistQueuedOperations
} from '@/lib/cycleQueue';
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

const hasNetworkConnection = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

const isOfflineFirestoreError = (error) => {
  if (!error) return false;
  const offlineCodes = ['unavailable', 'failed-precondition', 'network-request-failed'];
  return (
    offlineCodes.includes(error.code) ||
    (typeof error.message === 'string' && /offline|network/i.test(error.message))
  );
};

const computeCycleDay = (isoDate, cycleStart) => {
  if (!isoDate || !cycleStart) return null;
  try {
    const recordDay = startOfDay(parseISO(isoDate));
    const startDay = startOfDay(parseISO(cycleStart));
    return differenceInDays(recordDay, startDay) + 1;
  } catch (error) {
    return null;
  }
};

const sortRecordsByDateTime = (records = []) => {
  return [...records].sort((a, b) => {
    const dateA = a?.timestamp
      ? parseISO(a.timestamp)
      : a?.isoDate
      ? parseISO(a.isoDate)
      : null;
    const dateB = b?.timestamp
      ? parseISO(b.timestamp)
      : b?.isoDate
      ? parseISO(b.isoDate)
      : null;

    if (!dateA || !dateB) {
      return 0;
    }
    return dateA.getTime() - dateB.getTime();
  });
};

const buildLocalRecordFromPayload = ({
  recordPayload,
  recordId,
  isoDate,
  cycleStartDate,
  existingRecord
}) => {
  const normalizedIsoDate = isoDate
    ? isoDate
    : recordPayload?.timestamp
    ? format(parseISO(recordPayload.timestamp), 'yyyy-MM-dd')
    : existingRecord?.isoDate ?? null;

  const displayDate = normalizedIsoDate
    ? format(parseISO(normalizedIsoDate), 'dd/MM')
    : existingRecord?.date ?? 'N/A';

  const cycleDay =
    computeCycleDay(normalizedIsoDate, cycleStartDate ?? existingRecord?.cycleStart) ??
    existingRecord?.cycleDay ??
    null;

  return {
    ...existingRecord,
    id: recordId,
    isoDate: normalizedIsoDate,
    date: displayDate,
    cycleDay,
    temperature_raw: recordPayload?.temperature_raw ?? existingRecord?.temperature_raw ?? null,
    temperature_corrected:
      recordPayload?.temperature_corrected ?? existingRecord?.temperature_corrected ?? null,
    use_corrected: recordPayload?.use_corrected ?? existingRecord?.use_corrected ?? false,
    mucusSensation:
      recordPayload?.mucus_sensation ?? existingRecord?.mucusSensation ?? existingRecord?.mucus_sensation ?? null,
    mucusAppearance:
      recordPayload?.mucus_appearance ?? existingRecord?.mucusAppearance ?? existingRecord?.mucus_appearance ?? null,
    fertility_symbol:
      recordPayload?.fertility_symbol ?? existingRecord?.fertility_symbol ?? null,
    observations: recordPayload?.observations ?? existingRecord?.observations ?? null,
    ignored: recordPayload?.ignored ?? existingRecord?.ignored ?? false,
    measurements: recordPayload?.measurements ?? existingRecord?.measurements ?? [],
    temperature_chart: recordPayload?.temperature_chart ?? existingRecord?.temperature_chart ?? null,
    timestamp: recordPayload?.timestamp ?? existingRecord?.timestamp ?? null,
    peak_marker:
      Object.prototype.hasOwnProperty.call(recordPayload || {}, 'peak_marker')
        ? recordPayload?.peak_marker ?? null
        : existingRecord?.peak_marker ?? null
  };
};

const applyQueuedOperationToCycles = (currentCycle, archivedCycles, operation) => {
  if (!operation) {
    return { currentCycle, archivedCycles };
  }

  const applyToCycle = (cycle) => {
    if (!cycle) return cycle;
    const data = Array.isArray(cycle.data) ? [...cycle.data] : [];

    switch (operation.type) {
      case QUEUED_OPERATION_TYPES.CREATE: {
        if (!operation.localRecord) return cycle;
        const filtered = data.filter((record) => record.id !== operation.localRecord.id);
        filtered.push(operation.localRecord);
        const sanitized = operation.localRecord.peak_marker === 'peak'
          ? filtered.map((record) =>
              record.id !== operation.localRecord.id && record.peak_marker === 'peak'
                ? { ...record, peak_marker: null }
                : record
            )
          : filtered;
        return { ...cycle, data: sortRecordsByDateTime(sanitized) };
      }
      case QUEUED_OPERATION_TYPES.UPDATE: {
        if (!operation.localRecord) return cycle;
        const updated = data.some((record) => record.id === operation.localRecord.id)
          ? data.map((record) => (record.id === operation.localRecord.id ? operation.localRecord : record))
          : [...data, operation.localRecord];
        const sanitized = operation.localRecord.peak_marker === 'peak'
          ? updated.map((record) =>
              record.id !== operation.localRecord.id && record.peak_marker === 'peak'
                ? { ...record, peak_marker: null }
                : record
            )
          : updated;
        return { ...cycle, data: sortRecordsByDateTime(sanitized) };
      }
      case QUEUED_OPERATION_TYPES.DELETE: {
        const targetId = operation.payload?.recordId ?? operation.payload?.localId;
        if (!targetId) return cycle;
        return { ...cycle, data: data.filter((record) => record.id !== targetId) };
      }
      case QUEUED_OPERATION_TYPES.TOGGLE_IGNORE: {
        const targetId = operation.payload?.recordId;
        if (!targetId) return cycle;
        return {
          ...cycle,
          data: data.map((record) =>
            record.id === targetId ? { ...record, ignored: operation.payload?.ignored ?? false } : record
          )
        };
      }
      default:
        return cycle;
    }
  };

  const isCurrentCycleTarget = currentCycle?.id && currentCycle.id === operation.cycleId;

  if (isCurrentCycleTarget) {
    return {
      currentCycle: applyToCycle(currentCycle),
      archivedCycles
    };
  }

  const updatedArchived = archivedCycles.map((cycle) =>
    cycle.id === operation.cycleId ? applyToCycle(cycle) : cycle
  );

  return {
    currentCycle,
    archivedCycles: updatedArchived
  };
};

const applyPendingOperationsToCycles = (currentCycle, archivedCycles, operations = []) => {
  return operations.reduce(
    (acc, operation) => applyQueuedOperationToCycles(acc.currentCycle, acc.archivedCycles, operation),
    { currentCycle, archivedCycles }
  );
};


export const CycleDataProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentCycle, setCurrentCycle] = useState(defaultCycleState);
  const [archivedCycles, setArchivedCycles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOperations, setPendingOperationsState] = useState([]);
  const hasLoadedRef = useRef(false);
  const lastUserIdRef = useRef(null);
  const currentCycleRef = useRef(defaultCycleState);
  const archivedCyclesRef = useRef([]);
  const pendingOperationsRef = useRef([]);
  const queueProcessingRef = useRef(false);

  useEffect(() => {
    currentCycleRef.current = currentCycle;
  }, [currentCycle]);

  useEffect(() => {
    archivedCyclesRef.current = archivedCycles;
  }, [archivedCycles]);

  useEffect(() => {
    pendingOperationsRef.current = pendingOperations;
  }, [pendingOperations]);

  const updatePendingOperations = useCallback((updater) => {
    setPendingOperationsState((prev) => {
      const nextValue = typeof updater === 'function' ? updater(prev) : updater;
      pendingOperationsRef.current = nextValue;
      return nextValue;
    });
  }, []);

  const queueOperationLocally = useCallback(
    (operation, message) => {
      const baseCurrent = currentCycleRef.current;
      const baseArchived = archivedCyclesRef.current;

      const { currentCycle: nextCurrentCycle, archivedCycles: nextArchivedCycles } =
        applyQueuedOperationToCycles(baseCurrent, baseArchived, operation);

      setCurrentCycle(nextCurrentCycle);
      setArchivedCycles(nextArchivedCycles);

      const nextQueue = [...pendingOperationsRef.current, operation];
      updatePendingOperations(nextQueue);

      if (user?.uid) {
        persistQueuedOperations(user.uid, nextQueue, {
          currentCycle: nextCurrentCycle,
          archivedCycles: nextArchivedCycles
        }).catch((error) => console.error('Failed to persist queued operations.', error));
      }

      if (message) {
        toast({ title: 'Trabajando sin conexión', description: message });
      }

      return { nextCurrentCycle, nextArchivedCycles, nextQueue };
    },
    [toast, updatePendingOperations, user?.uid]
  );
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
            const queueFromCache = Array.isArray(cached.pendingOperations)
              ? cached.pendingOperations
              : await getQueuedOperations(user.uid);

            const { currentCycle: cachedCurrent, archivedCycles: cachedArchived } =
              applyPendingOperationsToCycles(
                cached.currentCycle ?? defaultCycleState,
                cached.archivedCycles ?? [],
                queueFromCache ?? []
              );

            setCurrentCycle(cachedCurrent ?? defaultCycleState);
            setArchivedCycles(cachedArchived ?? []);
            updatePendingOperations(queueFromCache ?? []);
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

        const pendingQueue = pendingOperationsRef.current ?? [];
        const { currentCycle: hydratedCurrentCycle, archivedCycles: hydratedArchivedCycles } =
          applyPendingOperationsToCycles(currentCycleData, archivedCyclesData, pendingQueue);

        setCurrentCycle(hydratedCurrentCycle);
        setArchivedCycles(hydratedArchivedCycles);

        await saveCycleDataToCache(user.uid, {
          currentCycle: hydratedCurrentCycle,
          archivedCycles: hydratedArchivedCycles,
          pendingOperations: pendingQueue
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
              const queued = Array.isArray(cached.pendingOperations)
                ? cached.pendingOperations
                : await getQueuedOperations(user.uid);
              const { currentCycle: cachedCurrent, archivedCycles: cachedArchived } =
                applyPendingOperationsToCycles(
                  cached.currentCycle ?? defaultCycleState,
                  cached.archivedCycles ?? [],
                  queued ?? []
                );
              setCurrentCycle(cachedCurrent ?? defaultCycleState);
              setArchivedCycles(cachedArchived ?? []);
              updatePendingOperations(queued ?? []);
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
  const processPendingQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;
    if (!user?.uid) return;
    const queued = pendingOperationsRef.current;
    if (!queued?.length) return;
    if (!hasNetworkConnection()) return;

    queueProcessingRef.current = true;
    let remainingQueue = [...queued];
    let processedAny = false;

    try {
      for (const operation of queued) {
        try {
          switch (operation.type) {
            case QUEUED_OPERATION_TYPES.CREATE:
              await createNewCycleEntry(operation.payload?.recordPayload);
              break;
            case QUEUED_OPERATION_TYPES.UPDATE:
              await updateCycleEntry(
                user.uid,
                operation.cycleId,
                operation.payload?.recordId,
                operation.payload?.recordPayload ?? {}
              );
              break;
            case QUEUED_OPERATION_TYPES.DELETE:
              await deleteCycleEntryDB(user.uid, operation.cycleId, operation.payload?.recordId);
              break;
            case QUEUED_OPERATION_TYPES.TOGGLE_IGNORE:
              await updateCycleEntry(user.uid, operation.cycleId, operation.payload?.recordId, {
                ignored: operation.payload?.ignored ?? false
              });
              break;
            default:
              break;
          }
          remainingQueue = remainingQueue.filter((item) => item.id !== operation.id);
          processedAny = true;
        } catch (error) {
          if (isOfflineFirestoreError(error)) {
            break;
          }

          console.error('Failed to process queued operation.', error);
          toast({
            title: 'Error de sincronización',
            description: 'No se pudo sincronizar un cambio pendiente. Se omitirá de la cola.',
            variant: 'destructive'
          });
          remainingQueue = remainingQueue.filter((item) => item.id !== operation.id);
          processedAny = true;
        }
      }
    } finally {
      queueProcessingRef.current = false;
    }

    if (remainingQueue.length !== queued.length) {
      updatePendingOperations(remainingQueue);
      if (user?.uid) {
        persistQueuedOperations(user.uid, remainingQueue, {
          currentCycle: currentCycleRef.current,
          archivedCycles: archivedCyclesRef.current
        }).catch((error) => console.error('Failed to update queued operations cache.', error));
      }
    }

    if (processedAny) {
      await loadCycleData({ silent: true });
    }
  }, [loadCycleData, toast, updatePendingOperations, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!pendingOperations.length) return;
    processPendingQueue().catch((error) => console.error('Queue processing failed.', error));
  }, [pendingOperations, processPendingQueue, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      processPendingQueue().catch((error) => console.error('Queue processing failed on reconnect.', error));
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [processPendingQueue, user?.uid]);

  const resetState = useCallback(() => {
    setCurrentCycle(defaultCycleState);
    setArchivedCycles([]);
    setPendingOperationsState([]);
    setIsLoading(false);
    hasLoadedRef.current = false;
    pendingOperationsRef.current = [];
    queueProcessingRef.current = false;
  }, []);



  useEffect(() => {
    if (!user?.uid) {
      resetState();
      return;
    }

    loadCycleData().catch((error) => console.error('Initial cycle data load failed:', error));
  }, [user?.uid, loadCycleData, resetState]);

  const addOrUpdateDataPoint = useCallback(
    async (newData, editingRecord, targetCycleId = null) => {
      const resolvedCurrent = currentCycleRef.current;
      const resolvedArchived = archivedCyclesRef.current;
      const cycleIdToUse = targetCycleId ?? resolvedCurrent?.id;

      if (!user?.uid || !cycleIdToUse) {
        console.error('User or cycle id is missing');
        throw new Error('User or cycle id is missing');
      }

      setIsLoading(true);

      const selectedMeasurement =
        newData.measurements?.find((measurement) => measurement?.selected) ??
        newData.measurements?.[0];
      const timeString =
        selectedMeasurement?.time && selectedMeasurement.time.trim() !== ''
          ? selectedMeasurement.time
          : format(new Date(), 'HH:mm');
      const recordDateTime = parse(`${newData.isoDate} ${timeString}`, 'yyyy-MM-dd HH:mm', new Date());

      const targetCycle =
        cycleIdToUse === resolvedCurrent?.id
          ? resolvedCurrent
          : resolvedArchived.find((cycle) => cycle.id === cycleIdToUse);

      let targetRecord = editingRecord;
      if (!targetRecord && targetCycle) {
        targetRecord = targetCycle.data?.find((record) => record.isoDate === newData.isoDate);
      }
      if (targetRecord && String(targetRecord.id).startsWith('placeholder-')) {
        targetRecord = null;
      }

      const existingPeakRecord = targetCycle?.data?.find((record) => record?.peak_marker === 'peak') ?? null;
      const needsPeakReset =
        newData.peak_marker === 'peak' && existingPeakRecord && existingPeakRecord.id !== targetRecord?.id;

      const rawTemp = normalizeTemp(selectedMeasurement?.temperature);
      const correctedTemp = normalizeTemp(selectedMeasurement?.temperature_corrected);
      const useCorrected = !!selectedMeasurement?.use_corrected && correctedTemp !== null;
      const chartTemp = useCorrected ? correctedTemp : rawTemp;

      const peakMarkerProvided = Object.prototype.hasOwnProperty.call(newData, 'peak_marker');
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

      const mucusSensationValue = trimValue(newData.mucusSensation ?? newData.mucus_sensation ?? '');
      const mucusAppearanceValue = trimValue(newData.mucusAppearance ?? newData.mucus_appearance ?? '');
      const observationsValue = trimValue(newData.observations ?? '');
      const fertilitySymbolValue = newData.fertility_symbol ?? newData.fertilitySymbol ?? null;
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

      if (!targetRecord && isPayloadEmpty) {
        setIsLoading(false);
        return;
      }

      const recordPayload = {
        cycle_id: cycleIdToUse,
        user_id: user.uid,
        timestamp: format(recordDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        measurements: newData.measurements,
        mucus_sensation: newData.mucusSensation || null,
        mucus_appearance: newData.mucusAppearance || null,
        fertility_symbol: newData.fertility_symbol === 'none' ? null : newData.fertility_symbol,
        observations: newData.observations || null,
        ignored: targetRecord ? (newData.ignored ?? targetRecord.ignored) : Boolean(newData.ignored),
        peak_marker: peakMarkerProvided
          ? newData.peak_marker ?? null
          : targetRecord?.peak_marker ?? null,
        temperature_raw: rawTemp,
        temperature_corrected: correctedTemp,
        use_corrected: useCorrected,
        temperature_chart: chartTemp
      };

      const operationsToQueue = [];

      if (needsPeakReset && existingPeakRecord) {
        operationsToQueue.push(
          createQueuedOperation(
            QUEUED_OPERATION_TYPES.UPDATE,
            cycleIdToUse,
            {
              recordId: existingPeakRecord.id,
              localId: existingPeakRecord.id,
              isoDate: existingPeakRecord.isoDate,
              recordPayload: { peak_marker: null }
            },
            { ...existingPeakRecord, peak_marker: null }
          )
        );
        }

        if (targetRecord) {
        const isRemovingPeak = peakMarkerProvided && targetRecord?.peak_marker === 'peak' && !isPeakMarked;

        if (isPayloadEmpty && isRemovingPeak) {
          operationsToQueue.push(
            createQueuedOperation(QUEUED_OPERATION_TYPES.DELETE, cycleIdToUse, {
              recordId: targetRecord.id,
              localId: targetRecord.id,
              isoDate: targetRecord.isoDate
            })
          );
        } else {
          const localRecord = buildLocalRecordFromPayload({
            recordPayload,
            recordId: targetRecord.id,
            isoDate: newData.isoDate,
            cycleStartDate: targetCycle?.startDate,
            existingRecord: targetRecord
          });

        operationsToQueue.push(
            createQueuedOperation(
              QUEUED_OPERATION_TYPES.UPDATE,
              cycleIdToUse,
              {
                recordId: targetRecord.id,
                localId: targetRecord.id,
                isoDate: newData.isoDate,
                recordPayload
              },
              localRecord
            )
          );
        }
      } else {
        const placeholderId = `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const localRecord = buildLocalRecordFromPayload({
          recordPayload,
          recordId: placeholderId,
          isoDate: newData.isoDate,
          cycleStartDate: targetCycle?.startDate ?? resolvedCurrent?.startDate,
          existingRecord: null
        });

        operationsToQueue.push(
          createQueuedOperation(
            QUEUED_OPERATION_TYPES.CREATE,
            cycleIdToUse,
            {
              recordId: null,
              localId: placeholderId,
              isoDate: newData.isoDate,
              recordPayload
            },
            localRecord
          )
        );
        }

      const enqueueOperations = () => {
        operationsToQueue.forEach((operation, index) =>
          queueOperationLocally(
            operation,
            index === operationsToQueue.length - 1
              ? 'Guardamos tu registro y lo sincronizaremos cuando vuelva la conexión.'
              : null
          )
        );
        };

      if (!hasNetworkConnection()) {
        enqueueOperations();
        setIsLoading(false);
        return;
      }

      try {
        if (needsPeakReset && existingPeakRecord) {
          await updateCycleEntry(user.uid, cycleIdToUse, existingPeakRecord.id, { peak_marker: null });
        }

        if (targetRecord) {
          const isRemovingPeak = peakMarkerProvided && targetRecord?.peak_marker === 'peak' && !isPeakMarked;
          if (isPayloadEmpty && isRemovingPeak) {
            await deleteCycleEntryDB(user.uid, cycleIdToUse, targetRecord.id);
          } else {
            await updateCycleEntry(user.uid, cycleIdToUse, targetRecord.id, recordPayload);
          }
        } else {
          await createNewCycleEntry(recordPayload);
        }

        await loadCycleData({ silent: true });
      } catch (error) {
        if (isOfflineFirestoreError(error)) {
          enqueueOperations();
          return;
        }

        console.error('Error adding/updating data point:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [queueOperationLocally, loadCycleData, user?.uid]
  );

  const deleteRecord = useCallback(
    async (recordId, targetCycleId = null) => {
      const resolvedCurrent = currentCycleRef.current;
      const resolvedArchived = archivedCyclesRef.current;
      const cycleIdToUse = targetCycleId ?? resolvedCurrent?.id;

      if (!user?.uid || !cycleIdToUse) return;

      const targetCycle =
        cycleIdToUse === resolvedCurrent?.id
          ? resolvedCurrent
          : resolvedArchived.find((cycle) => cycle.id === cycleIdToUse);

      const recordToDelete = targetCycle?.data?.find((record) => record.id === recordId);
      if (!recordToDelete) {
        console.error('Record not found for deletion.');
        return;
      }

      const queuedOperation = createQueuedOperation(QUEUED_OPERATION_TYPES.DELETE, cycleIdToUse, {
        recordId,
        localId: recordId,
        isoDate: recordToDelete.isoDate
      });

      setIsLoading(true);

      if (!hasNetworkConnection()) {
        queueOperationLocally(
          queuedOperation,
          'El registro se eliminará cuando recuperes la conexión.'
        );
        setIsLoading(false);
        return;
      }

      try {
        await deleteCycleEntryDB(user.uid, cycleIdToUse, recordId);
        await loadCycleData({ silent: true });
      } catch (error) {
        if (isOfflineFirestoreError(error)) {
          queueOperationLocally(
            queuedOperation,
            'El registro se eliminará cuando recuperes la conexión.'
          );
          return;
        }

        console.error('Error deleting record:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [queueOperationLocally, loadCycleData, user?.uid]
  );

  const toggleIgnoreRecord = useCallback(
    async (cycleIdToUpdate, recordId) => {
      if (!user?.uid) return;

      const resolvedCurrent = currentCycleRef.current;
      const resolvedArchived = archivedCyclesRef.current;

      const isCurrentCycle = cycleIdToUpdate === resolvedCurrent?.id;
      const targetCycle = isCurrentCycle
        ? resolvedCurrent
        : resolvedArchived.find((cycle) => cycle.id === cycleIdToUpdate);

      if (!targetCycle) {
        throw new Error('Cycle not found for toggling ignore state.');
      }

      const recordToUpdate = targetCycle.data?.find((record) => record.id === recordId);
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

      const previousIgnoredState = recordToUpdate.ignored;
      const revertIgnoredState = () => applyIgnoredState(previousIgnoredState);

      const queuedOperation = createQueuedOperation(
        QUEUED_OPERATION_TYPES.TOGGLE_IGNORE,
        cycleIdToUpdate,
        {
          recordId,
          ignored: newIgnoredState
        },
        { ...recordToUpdate, ignored: newIgnoredState }
      );

      applyIgnoredState(newIgnoredState);

      if (!hasNetworkConnection()) {
        queueOperationLocally(
          queuedOperation,
          'Cambio guardado sin conexión. Se sincronizará al volver a tener internet.'
        );
        return;
      }

      try {
        await updateCycleEntry(user.uid, cycleIdToUpdate, recordId, { ignored: newIgnoredState });
        loadCycleData({ silent: true }).catch((error) =>
          console.error('Background cycle data refresh failed after toggling ignore state:', error)
        );
      } catch (error) {
        if (isOfflineFirestoreError(error)) {
          queueOperationLocally(
            queuedOperation,
            'Cambio guardado sin conexión. Se sincronizará al volver a tener internet.'
          );
          return;
        }

        console.error('Error toggling ignore state:', error);
        revertIgnoredState();
        throw error;
      }
    },
    [queueOperationLocally, loadCycleData, user?.uid]
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
    deleteCycle,
    pendingOperations
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