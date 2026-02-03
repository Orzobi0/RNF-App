import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { format, differenceInDays, startOfDay, parseISO, compareAsc, addDays, isValid } from 'date-fns';

const generateCycleDaysForRecord = (recordIsoDate, cycleStartIsoDate) => {
  if (!recordIsoDate || !cycleStartIsoDate) return 0;
  const rDate = startOfDay(parseISO(recordIsoDate));
  const sDate = startOfDay(parseISO(cycleStartIsoDate));
  return differenceInDays(rDate, sDate) + 1;
};

const normalizeTemp = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(',', '.'));
  return isNaN(num) ? null : num;
};

export const processCycleEntries = (entriesFromView, cycleStartIsoDate) => {
  if (!entriesFromView || !Array.isArray(entriesFromView) || !cycleStartIsoDate) return [];

  const sortedEntries = [...entriesFromView].sort((a, b) => {
    const dateA = a.timestamp ? parseISO(a.timestamp) : (a.iso_date ? parseISO(a.iso_date) : 0);
    const dateB = b.timestamp ? parseISO(b.timestamp) : (b.iso_date ? parseISO(b.iso_date) : 0);
    return compareAsc(dateA, dateB);
  });

  return sortedEntries.map((entry) => {
    const rawTemp = normalizeTemp(entry.temperature_raw);
    const correctedTemp = normalizeTemp(entry.temperature_corrected);
    const entryMeasurements = Array.isArray(entry.measurements) ? entry.measurements : [];
    const getMeasurementTemp = (measurement) => {
      if (!measurement) return null;
      const mRaw = normalizeTemp(measurement.temperature);
      const mCorr = normalizeTemp(measurement.temperature_corrected);
      if (measurement.use_corrected && mCorr !== null) {
        return mCorr;
      }
      if (mRaw !== null) {
        return mRaw;
      }
      if (mCorr !== null) {
        return mCorr;
      }
      return null;
    };

    let chartTemp = normalizeTemp(entry.temperature_chart);
    if (chartTemp == null && entryMeasurements.length) {
      const selectedMeasurement = entryMeasurements.find(
        (m) => m && m.selected && getMeasurementTemp(m) !== null
      );
      const fallbackMeasurement =
        selectedMeasurement || entryMeasurements.find((m) => getMeasurementTemp(m) !== null);
      if (fallbackMeasurement) {
        chartTemp = getMeasurementTemp(fallbackMeasurement);
      }
    }

    if (chartTemp == null) {
      if (entry.use_corrected && correctedTemp !== null) {
        chartTemp = correctedTemp;
      } else if (rawTemp !== null) {
        chartTemp = rawTemp;
      } else if (correctedTemp !== null) {
        chartTemp = correctedTemp;
      }
    }

    return {
      ...entry,
      id: entry.id,
      isoDate: entry.iso_date || (entry.timestamp ? format(parseISO(entry.timestamp), 'yyyy-MM-dd') : null),
      date: entry.timestamp
        ? format(parseISO(entry.timestamp), 'dd/MM')
        : entry.iso_date
        ? format(parseISO(entry.iso_date), 'dd/MM')
        : 'N/A',
      cycleDay: generateCycleDaysForRecord(entry.iso_date || entry.timestamp, cycleStartIsoDate),
      temperature_raw: rawTemp,
      temperature_corrected: correctedTemp,
      use_corrected: !!entry.use_corrected,
      mucusSensation: entry.mucus_sensation,
      mucusAppearance: entry.mucus_appearance,
      fertility_symbol: entry.fertility_symbol,
      observations: entry.observations,
      ignored: entry.ignored,
      measurements: entryMeasurements,
      temperature_chart: chartTemp,
      timestamp: entry.timestamp,
      peak_marker: entry.peak_marker || null,
      had_relations: Boolean(entry.had_relations ?? entry.hadRelations ?? false),
      hadRelations: Boolean(entry.had_relations ?? entry.hadRelations ?? false),
    };
  });
};

export const fetchCurrentCycleDB = async (userId) => {
  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cycleSnapshot = await getDocs(cyclesRef);
  if (cycleSnapshot.empty) return null;

  const cycles = cycleSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((c) => c.end_date === null || c.end_date === undefined)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  if (cycles.length > 1) {
    console.warn(`Se detectaron ${cycles.length} ciclos abiertos. Se usará el más reciente.`);
  }
  if (cycles.length === 0) return null;
  const cycleDoc = cycles[0];

  const entriesRef = collection(db, `users/${userId}/cycles/${cycleDoc.id}/entries`);
  const entriesSnap = await getDocs(entriesRef);
  const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    id: cycleDoc.id,
    startDate: cycleDoc.start_date,
    endDate: cycleDoc.end_date,
    ignoredForAutoCalculations: Boolean(cycleDoc.ignored_auto_calculations),
    data: entriesData,
  };
};

export const fetchArchivedCyclesDB = async (userId, currentStartDate) => {
  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const snapshot = await getDocs(cyclesRef);
  const cycles = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((c) =>
      c.end_date !== null && c.end_date !== undefined ||
      (currentStartDate && c.start_date && c.start_date < currentStartDate)
    )
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

  const cyclesWithEntries = await Promise.all(
    cycles.map(async (cycle) => {
      const entriesRef = collection(db, `users/${userId}/cycles/${cycle.id}/entries`);
      const entriesSnap = await getDocs(entriesRef);
      const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return {
        id: cycle.id,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        needsCompletion: !cycle.end_date,
        ignoredForAutoCalculations: Boolean(cycle.ignored_auto_calculations),
        data: entriesData,
      };
    })
  );
  return cyclesWithEntries;
};

export const fetchCycleByIdDB = async (userId, cycleId) => {
  const cycleRef = doc(db, `users/${userId}/cycles/${cycleId}`);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) return null;
  const cycleData = cycleSnap.data();
  const entriesRef = collection(db, `users/${userId}/cycles/${cycleId}/entries`);
  const entriesSnap = await getDocs(entriesRef);
  const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    id: cycleId,
    startDate: cycleData.start_date,
    endDate: cycleData.end_date,
    ignoredForAutoCalculations: Boolean(cycleData.ignored_auto_calculations),
    data: entriesData,
  };
};

export const createNewCycleDB = async (userId, startDate) => {
  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const newStart = parseISO(startDate);

  const overlapDoc = cyclesSnap.docs.find((docSnap) => {
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    if (!start || !newStart) return false;
    const comparableEnd = end ?? new Date('9999-12-31');
    return newStart >= start && newStart <= comparableEnd;
  });

  if (overlapDoc) {
    const overlapInfo = {
      id: overlapDoc.id,
      startDate: overlapDoc.data().start_date,
      endDate: overlapDoc.data().end_date,
    };
    const error = new Error('Cycle dates overlap with an existing cycle');
    error.code = 'cycle-overlap';
    error.conflictCycle = overlapInfo;
    throw error;
  }

  const docRef = await addDoc(collection(db, `users/${userId}/cycles`), {
    user_id: userId,
    start_date: startDate,
    ignored_auto_calculations: false,
    end_date: null,
  });
  return { id: docRef.id, start_date: startDate };
};

export const createNewCycleEntry = async (payload) => {
  const userId = payload.user_id;
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const entryData = {
    timestamp,
    temperature_raw: payload.temperature_raw ?? null,
    temperature_corrected: payload.temperature_corrected ?? null,
    use_corrected: Boolean(payload.use_corrected),
    temperature_chart: payload.temperature_chart ?? null,
    mucus_sensation: payload.mucus_sensation,
    mucus_appearance: payload.mucus_appearance,
    fertility_symbol: payload.fertility_symbol,
    observations: payload.observations,
    had_relations: Boolean(payload.had_relations ?? payload.hadRelations ?? false),
    ignored: payload.ignored,
    peak_marker: payload.peak_marker ?? null,
  };

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const entryDate = parseISO(timestamp);
  const candidateCycles = cyclesSnap.docs.filter((docSnap) => {
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    return start && entryDate >= start && (!end || entryDate <= end);
  });

  let targetCycle = null;
  if (candidateCycles.length > 1) {
    targetCycle = candidateCycles
      .sort((a, b) => {
        const startA = parseISO(a.data().start_date);
        const startB = parseISO(b.data().start_date);
        return startB - startA;
      })[0];
  } else if (candidateCycles.length === 1) {
    targetCycle = candidateCycles[0];
  }

  if (targetCycle) {
    const ref = await addDoc(
      collection(db, `users/${userId}/cycles/${targetCycle.id}/entries`),
      entryData
    );
    if (Array.isArray(payload.measurements) && payload.measurements.length >= 2) {
      const mRef = collection(db, `users/${userId}/cycles/${targetCycle.id}/entries/${ref.id}/measurements`);
      for (const m of payload.measurements) {
        await addDoc(mRef, m);
      }
    }
    return { id: ref.id };
  }

  if (payload.cycle_id) {
    const ref = await addDoc(collection(db, `users/${userId}/cycles/${payload.cycle_id}/entries`), entryData);
    if (Array.isArray(payload.measurements) && payload.measurements.length >= 2) {
      const mRef = collection(db, `users/${userId}/cycles/${payload.cycle_id}/entries/${ref.id}/measurements`);
      for (const m of payload.measurements) {
        await addDoc(mRef, m);
      }
    }
    return { id: ref.id };
  }

  return { id: null };
};

export const updateCycleEntry = async (userId, cycleId, entryId, payload) => {
  const entryRef = doc(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}`);

  const allowedFields = [
    'temperature_raw',
    'temperature_corrected',
    'use_corrected',
    'temperature_chart',
    'mucus_sensation',
    'mucus_appearance',
    'fertility_symbol',
    'observations',
    'had_relations',
    'ignored',
    'peak_marker',
  ];

  const entryToUpdate = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      entryToUpdate[field] = payload[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'timestamp')) {
    entryToUpdate.timestamp = payload.timestamp;
  }
  
  if (Object.keys(entryToUpdate).length === 0) {
    return { id: entryId };
  }

  await updateDoc(entryRef, entryToUpdate);
  if (Array.isArray(payload.measurements) && (payload.measurements.length >= 2 || payload.measurements.length === 0)) {
    const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements`);
    const mSnap = await getDocs(mRef);
    await Promise.all(mSnap.docs.map((d) => deleteDoc(d.ref)));
    if (payload.measurements.length >= 2) {
      for (const m of payload.measurements) {
        await addDoc(mRef, m);
      }
    }
  }
  return { id: entryId };
};

export const fetchEntryMeasurementsDB = async (userId, cycleId, entryId) => {
  try {
    const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements`);
    const mSnap = await getDocs(mRef);
    return mSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
  } catch (error) {
    console.error('Error fetching measurements for entry', entryId, error);
    return [];
  }
};

export const addMeasurement = async (userId, cycleId, entryId, measurement) => {
  const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements`);
  const docRef = await addDoc(mRef, measurement);
  return { id: docRef.id };
};

export const updateMeasurement = async (userId, cycleId, entryId, measurementId, data) => {
  const mRef = doc(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements/${measurementId}`);
  await updateDoc(mRef, data);
};

export const selectMeasurement = async (userId, cycleId, entryId, measurementId) => {
  const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements`);
  const mSnap = await getDocs(mRef);
  await Promise.all(
    mSnap.docs.map((d) => updateDoc(d.ref, { selected: d.id === measurementId }))
  );
};
export const deleteCycleEntryDB = async (userId, cycleId, entryId) => {
  await deleteDoc(doc(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}`));
};

export const archiveCycleDB = async (cycleId, userId, endDate) => {
  const cycleRef = doc(db, `users/${userId}/cycles/${cycleId}`);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) throw new Error('Cycle not found');
  await updateDoc(cycleRef, { end_date: endDate });
};

export const updateCycleDatesDB = async (cycleId, userId, startDate, endDate, validateOnly = false) => {
  const cycleRef = doc(db, `users/${userId}/cycles/${cycleId}`);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) throw new Error('Cycle not found');
  
  const currentData = cycleSnap.data();
  const proposedStart = startDate ?? currentData.start_date;
  const proposedEnd = endDate !== undefined ? endDate : currentData.end_date;
  const proposedStartDate = proposedStart ? parseISO(proposedStart) : null;
  const proposedEndDate = proposedEnd ? parseISO(proposedEnd) : null;

  if (proposedStartDate && proposedEndDate && proposedEndDate < proposedStartDate) {
    throw new Error('End date cannot be earlier than start date');
  }

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const overlapDoc = cyclesSnap.docs.find((docSnap) => {
    if (docSnap.id === cycleId) return false;
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    if (!start) return false;
    const endDateComparable = end ?? new Date('9999-12-31');
    const proposedEndComparable = proposedEndDate ?? new Date('9999-12-31');
    return proposedStartDate <= endDateComparable && start <= proposedEndComparable;
  });

  const overlapInfo = overlapDoc
    ? {
        id: overlapDoc.id,
        startDate: overlapDoc.data().start_date,
        endDate: overlapDoc.data().end_date,
      }
    : null;

  if (validateOnly) {
    return { overlap: overlapInfo };
  }

  if (overlapDoc) {
    const error = new Error('Cycle dates overlap with an existing cycle');
    error.code = 'cycle-overlap';
    error.conflictCycle = overlapInfo;
    throw error;
  }

  const updatePayload = {};
  if (startDate !== undefined) updatePayload.start_date = startDate;
  if (endDate !== undefined) updatePayload.end_date = endDate;

  await updateDoc(cycleRef, updatePayload);
  };

  export const updateCycleIgnoreAutoCalculations = async (userId, cycleId, shouldIgnore) => {
  const cycleRef = doc(db, `users/${userId}/cycles/${cycleId}`);
  await updateDoc(cycleRef, { ignored_auto_calculations: shouldIgnore });
};

export const forceShiftNextCycleStart = async (
  userId,
  currentCycleId,
  newEndDate,
  currentCycleStartDate
) => {
  if (!newEndDate) return;

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);

  const currentDoc = cyclesSnap.docs.find((docSnap) => docSnap.id === currentCycleId);
  if (!currentDoc) return;

  const currentData = currentDoc.data();
  const effectiveCurrentStart = currentCycleStartDate || currentData.start_date || null;
  const currentStart = effectiveCurrentStart ? parseISO(effectiveCurrentStart) : null;

  const sortedNextCycles = cyclesSnap.docs
    .filter((docSnap) => docSnap.id !== currentCycleId)
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
    .filter(({ data }) => data.start_date)
    .sort(
      (a, b) => parseISO(a.data.start_date).getTime() - parseISO(b.data.start_date).getTime()
    );

  const comparisonBase = currentStart ?? parseISO(newEndDate);
  const nextCycle = sortedNextCycles.find(({ data }) => {
    try {
      const startDate = parseISO(data.start_date);
      return startDate > comparisonBase;
    } catch (error) {
      console.error('Error parsing next cycle start date', error);
      return false;
    }
  });

  if (!nextCycle) return;

  const nextCycleStart = parseISO(nextCycle.data.start_date);
  const nextCycleEnd = nextCycle.data.end_date ? parseISO(nextCycle.data.end_date) : null;
  const parsedNewEnd = parseISO(newEndDate);

  let proposedStart = addDays(parsedNewEnd, 1);
  if (nextCycleStart && proposedStart < nextCycleStart) {
    proposedStart = nextCycleStart;
  }
  if (nextCycleEnd && proposedStart > nextCycleEnd) {
    proposedStart = nextCycleEnd;
  }

  const newStartIso = format(proposedStart, 'yyyy-MM-dd');

  const nextEntriesRef = collection(db, `users/${userId}/cycles/${nextCycle.id}/entries`);
  const nextEntriesSnap = await getDocs(nextEntriesRef);

  const currentCycleStartIso = effectiveCurrentStart || currentData.start_date;

  await Promise.all(
    nextEntriesSnap.docs.map(async (entryDoc) => {
      const entryData = entryDoc.data();
      const timestamp = entryData.timestamp
        ? parseISO(entryData.timestamp)
        : entryData.iso_date
        ? parseISO(entryData.iso_date)
        : null;

      if (!timestamp) {
        return;
      }

      const entryIsoDate = format(timestamp, 'yyyy-MM-dd');

      if (timestamp < proposedStart) {
        const newData = {
          ...entryData,
          cycle_day: generateCycleDaysForRecord(entryIsoDate, currentCycleStartIso),
        };
        const newEntryRef = doc(
          db,
          `users/${userId}/cycles/${currentCycleId}/entries/${entryDoc.id}`
        );
        await setDoc(newEntryRef, newData);

        const measurementsRef = collection(
          db,
          `users/${userId}/cycles/${nextCycle.id}/entries/${entryDoc.id}/measurements`
        );
        const measurementsSnap = await getDocs(measurementsRef);

        await Promise.all(
          measurementsSnap.docs.map(async (measurementDoc) => {
            const newMeasurementRef = doc(
              db,
              `users/${userId}/cycles/${currentCycleId}/entries/${entryDoc.id}/measurements/${measurementDoc.id}`
            );
            await setDoc(newMeasurementRef, measurementDoc.data());
            await deleteDoc(measurementDoc.ref);
          })
        );

        await deleteDoc(entryDoc.ref);
      } else {
        await updateDoc(entryDoc.ref, {
          cycle_day: generateCycleDaysForRecord(entryIsoDate, newStartIso),
        });
      }
    })
  );

  const nextCycleRef = doc(db, `users/${userId}/cycles/${nextCycle.id}`);
  await updateDoc(nextCycleRef, { start_date: newStartIso });
};

export const forceUpdateCycleStart = async (userId, currentCycleId, newStartDate) => {
  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const newStart = parseISO(newStartDate);

  const previousDoc = cyclesSnap.docs.find((docSnap) => {
    if (docSnap.id === currentCycleId) return false;
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    if (!start || !end) return false;
    return start <= newStart && end >= newStart;
  });

  if (previousDoc) {
    const prevRef = doc(db, `users/${userId}/cycles/${previousDoc.id}`);
    const dayBefore = format(addDays(newStart, -1), 'yyyy-MM-dd');
    await updateDoc(prevRef, { end_date: dayBefore });

    const prevEntriesRef = collection(db, `users/${userId}/cycles/${previousDoc.id}/entries`);
    const prevEntriesSnap = await getDocs(prevEntriesRef);

    await Promise.all(
      prevEntriesSnap.docs.map(async (entryDoc) => {
        const data = entryDoc.data();
        const ts = data.timestamp ? parseISO(data.timestamp) : null;
        if (ts && ts >= newStart) {
          const newData = {
            ...data,
            cycle_day: generateCycleDaysForRecord(format(ts, 'yyyy-MM-dd'), newStartDate),
          };
          const newEntryRef = doc(db, `users/${userId}/cycles/${currentCycleId}/entries/${entryDoc.id}`);
          await setDoc(newEntryRef, newData);

          const measRef = collection(db, `users/${userId}/cycles/${previousDoc.id}/entries/${entryDoc.id}/measurements`);
          const measSnap = await getDocs(measRef);
          await Promise.all(
            measSnap.docs.map(async (mDoc) => {
              const newMeasRef = doc(db, `users/${userId}/cycles/${currentCycleId}/entries/${entryDoc.id}/measurements/${mDoc.id}`);
              await setDoc(newMeasRef, mDoc.data());
              await deleteDoc(mDoc.ref);
            })
          );

          await deleteDoc(entryDoc.ref);
        }
      })
    );
  }

  const currentRef = doc(db, `users/${userId}/cycles/${currentCycleId}`);
  await updateDoc(currentRef, { start_date: newStartDate });
};

export const deleteCycleDB = async (userId, cycleId) => {
  const entriesRef = collection(db, `users/${userId}/cycles/${cycleId}/entries`);
  const entriesSnap = await getDocs(entriesRef);
  await Promise.all(entriesSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, `users/${userId}/cycles/${cycleId}`));
};

export const undoCurrentCycleDB = async (userId, currentCycleId) => {
  if (!userId || !currentCycleId) {
    throw new Error('Missing user or cycle ID');
  }

  const currentCycleRef = doc(db, `users/${userId}/cycles/${currentCycleId}`);
  const currentCycleSnap = await getDoc(currentCycleRef);
  if (!currentCycleSnap.exists()) {
    throw new Error('Cycle not found');
  }

  const currentData = currentCycleSnap.data();
  if (currentData.end_date !== null && currentData.end_date !== undefined) {
    const error = new Error('Cannot undo a non-current cycle');
    error.code = 'undo-not-current';
    throw error;
  }

  if (!currentData.start_date || !isValid(parseISO(currentData.start_date))) {
    const error = new Error('Current cycle has invalid start date');
    error.code = 'undo-not-current';
    throw error;
  }

  const cyclesSnap = await getDocs(collection(db, `users/${userId}/cycles`));
  const dayBefore = format(addDays(parseISO(currentData.start_date), -1), 'yyyy-MM-dd');
  const previousCycles = cyclesSnap.docs
    .filter((docSnap) => docSnap.id !== currentCycleId)
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((cycle) => cycle.end_date === dayBefore)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

  if (!previousCycles.length) {
    const error = new Error('No previous cycle available');
    error.code = 'no-previous-cycle';
    throw error;
  }

  const previousCycle = previousCycles[0];
  if (!previousCycle.start_date || !isValid(parseISO(previousCycle.start_date))) {
    throw new Error('Previous cycle has invalid start date');
  }

  const resolveIsoDate = (entry) => {
    if (entry.iso_date && isValid(parseISO(entry.iso_date))) {
      return format(parseISO(entry.iso_date), 'yyyy-MM-dd');
    }
    if (typeof entry.timestamp === 'string' && isValid(parseISO(entry.timestamp))) {
      return format(parseISO(entry.timestamp), 'yyyy-MM-dd');
    }
    const error = new Error('Entry has invalid date');
    error.code = 'undo-invalid-entry';
    throw error;
  };

  const resolveIsoDateForSet = (entry) => {
    try {
      if (entry.iso_date && isValid(parseISO(entry.iso_date))) {
        return format(parseISO(entry.iso_date), 'yyyy-MM-dd');
      }
      if (typeof entry.timestamp === 'string' && isValid(parseISO(entry.timestamp))) {
        return format(parseISO(entry.timestamp), 'yyyy-MM-dd');
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  const previousEntriesRef = collection(
    db,
    `users/${userId}/cycles/${previousCycle.id}/entries`
  );
  const previousEntriesSnap = await getDocs(previousEntriesRef);
  const existingIsoDates = new Set();
  previousEntriesSnap.docs.forEach((entryDoc) => {
    const isoDate = resolveIsoDateForSet(entryDoc.data());
    if (isoDate) {
      existingIsoDates.add(isoDate);
    }
  });

  const currentEntriesRef = collection(
    db,
    `users/${userId}/cycles/${currentCycleId}/entries`
  );
  const currentEntriesSnap = await getDocs(currentEntriesRef);
  const entriesToMove = currentEntriesSnap.docs.map((entryDoc) => {
    const entryData = entryDoc.data();
    const isoDate = resolveIsoDate(entryData);
    if (existingIsoDates.has(isoDate)) {
      const error = new Error('Entry date conflicts with previous cycle');
      error.code = 'undo-date-conflict';
      throw error;
    }
    existingIsoDates.add(isoDate);
    return { ref: entryDoc.ref, id: entryDoc.id, data: entryData, isoDate };
  });

  let batch = writeBatch(db);
  let opCount = 0;

  const ensureBatchCapacity = async () => {
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const queueSet = async (ref, data) => {
    await ensureBatchCapacity();
    batch.set(ref, data);
    opCount += 1;
  };

  const queueDelete = async (ref) => {
    await ensureBatchCapacity();
    batch.delete(ref);
    opCount += 1;
  };

  const queueUpdate = async (ref, data) => {
    await ensureBatchCapacity();
    batch.update(ref, data);
    opCount += 1;
  };

  for (const entry of entriesToMove) {
    const newEntryRef = doc(
      db,
      `users/${userId}/cycles/${previousCycle.id}/entries/${entry.id}`
    );
    const newCycleDay = generateCycleDaysForRecord(entry.isoDate, previousCycle.start_date);
    await queueSet(newEntryRef, { ...entry.data, cycle_day: newCycleDay });

    const measurementsRef = collection(
      db,
      `users/${userId}/cycles/${currentCycleId}/entries/${entry.id}/measurements`
    );
    const measurementsSnap = await getDocs(measurementsRef);
    for (const measurementDoc of measurementsSnap.docs) {
      const newMeasurementRef = doc(
        db,
        `users/${userId}/cycles/${previousCycle.id}/entries/${entry.id}/measurements/${measurementDoc.id}`
      );
      await queueSet(newMeasurementRef, measurementDoc.data());
      await queueDelete(measurementDoc.ref);
    }

    await queueDelete(entry.ref);
  }

  const previousCycleRef = doc(db, `users/${userId}/cycles/${previousCycle.id}`);
  await queueUpdate(previousCycleRef, { end_date: null });
  await queueDelete(currentCycleRef);

  if (opCount > 0) {
    await batch.commit();
  }
};
