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

const resolveSplitEntryIsoDate = (entry) => {
  if (entry.iso_date && isValid(parseISO(entry.iso_date))) {
    return format(parseISO(entry.iso_date), 'yyyy-MM-dd');
  }
  if (typeof entry.timestamp === 'string' && isValid(parseISO(entry.timestamp))) {
    return format(parseISO(entry.timestamp), 'yyyy-MM-dd');
  }
  const error = new Error('Entry has invalid date');
  error.code = 'split-invalid-entry';
  throw error;
};

const sortCyclesByStartDate = (docs) =>
  docs
    .map((docSnap) => {
      const data = docSnap.data();
      const startIso = data?.start_date;
      const start =
        typeof startIso === 'string' ? startOfDay(parseISO(startIso)) : null;
      return { id: docSnap.id, data, start };
    })
    .filter(({ start }) => start && isValid(start))
    .sort((a, b) => compareAsc(a.start, b.start))
    .map(({ id, data }) => ({ id, data }));

const findNeighbors = (sortedCycles, cycleId) => {
  const currentIndex = sortedCycles.findIndex((cycle) => cycle.id === cycleId);
  if (currentIndex === -1) {
    return { previous: null, current: null, next: null, nextNext: null };
  }
  return {
    previous: currentIndex > 0 ? sortedCycles[currentIndex - 1] : null,
    current: sortedCycles[currentIndex],
    next: currentIndex < sortedCycles.length - 1 ? sortedCycles[currentIndex + 1] : null,
    nextNext: currentIndex < sortedCycles.length - 2 ? sortedCycles[currentIndex + 2] : null,
  };
};

const moveEntriesWithMeasurementsDB = async ({
  userId,
  fromCycleId,
  toCycleId,
  shouldMoveIsoDate,
  toCycleStartIso,
}) => {
  if (!userId || !fromCycleId || !toCycleId || !toCycleStartIso) {
    throw new Error('Missing data for moving entries');
  }

  const sourceEntriesRef = collection(db, `users/${userId}/cycles/${fromCycleId}/entries`);
  const sourceEntriesSnap = await getDocs(sourceEntriesRef);
  const entriesToMove = sourceEntriesSnap.docs
    .map((entryDoc) => {
      const entryData = entryDoc.data();
      const isoDate = resolveSplitEntryIsoDate(entryData);
      return {
        id: entryDoc.id,
        ref: entryDoc.ref,
        data: entryData,
        isoDate,
      };
    })
    .filter((entry) => shouldMoveIsoDate(entry.isoDate));

  if (!entriesToMove.length) {
    return { movedEntries: 0 };
  }

  const targetEntriesRef = collection(db, `users/${userId}/cycles/${toCycleId}/entries`);
  const targetEntriesSnap = await getDocs(targetEntriesRef);
  const targetEntriesByIso = new Map();

  for (const targetDoc of targetEntriesSnap.docs) {
    let iso = null;
    try {
      iso = resolveSplitEntryIsoDate(targetDoc.data());
    } catch (error) {
      continue;
    }
    if (targetEntriesByIso.has(iso)) {
      const error = new Error('New cycle already has multiple entries for the same date');
      error.code = 'split-date-conflict';
      error.conflictDate = iso;
      throw error;
    }
    targetEntriesByIso.set(iso, { id: targetDoc.id, ref: targetDoc.ref, data: targetDoc.data() });
  }

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

  const queueUpdate = async (ref, data) => {
    await ensureBatchCapacity();
    batch.update(ref, data);
    opCount += 1;
  };

  const queueDelete = async (ref) => {
    await ensureBatchCapacity();
    batch.delete(ref);
    opCount += 1;
  };

  const isEmptyValue = (value) =>
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');

  const MERGE_KEYS = [
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
    'timestamp',
  ];

  for (const entry of entriesToMove) {
    const existingTarget = targetEntriesByIso.get(entry.isoDate);
    const newCycleDay = generateCycleDaysForRecord(entry.isoDate, toCycleStartIso);

    if (existingTarget) {
      const updatePayload = { cycle_day: newCycleDay };
      for (const key of MERGE_KEYS) {
        const targetVal = existingTarget.data?.[key];
        const sourceVal = entry.data?.[key];
        if (isEmptyValue(targetVal) && !isEmptyValue(sourceVal)) {
          updatePayload[key] = sourceVal;
        }
      }
      await queueUpdate(existingTarget.ref, updatePayload);

      const measurementsRef = collection(
        db,
        `users/${userId}/cycles/${fromCycleId}/entries/${entry.id}/measurements`
      );
      const measurementsSnap = await getDocs(measurementsRef);
      for (const measurementDoc of measurementsSnap.docs) {
        const destMeasRef = doc(
          collection(
            db,
            `users/${userId}/cycles/${toCycleId}/entries/${existingTarget.id}/measurements`
          )
        );
        await queueSet(destMeasRef, measurementDoc.data());
        await queueDelete(measurementDoc.ref);
      }

      await queueDelete(entry.ref);
      continue;
    }

    const newEntryRef = doc(db, `users/${userId}/cycles/${toCycleId}/entries/${entry.id}`);
    await queueSet(newEntryRef, { ...entry.data, cycle_day: newCycleDay });

    const measurementsRef = collection(
      db,
      `users/${userId}/cycles/${fromCycleId}/entries/${entry.id}/measurements`
    );
    const measurementsSnap = await getDocs(measurementsRef);
    for (const measurementDoc of measurementsSnap.docs) {
      const newMeasurementRef = doc(
        db,
        `users/${userId}/cycles/${toCycleId}/entries/${entry.id}/measurements/${measurementDoc.id}`
      );
      await queueSet(newMeasurementRef, measurementDoc.data());
      await queueDelete(measurementDoc.ref);
    }

    await queueDelete(entry.ref);
  }

  if (opCount > 0) {
    await batch.commit();
  }

  return { movedEntries: entriesToMove.length };
};

const recalcCycleDayForAllEntriesDB = async (userId, cycleId, cycleStartIso) => {
  if (!userId || !cycleId || !cycleStartIso) return;

  const entriesRef = collection(db, `users/${userId}/cycles/${cycleId}/entries`);
  const entriesSnap = await getDocs(entriesRef);

  let batch = writeBatch(db);
  let opCount = 0;

  const ensureBatchCapacity = async () => {
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const queueUpdate = async (ref, data) => {
    await ensureBatchCapacity();
    batch.update(ref, data);
    opCount += 1;
  };

  for (const entryDoc of entriesSnap.docs) {
    const entryData = entryDoc.data();
    let isoDate = null;
    try {
      isoDate = resolveSplitEntryIsoDate(entryData);
    } catch (error) {
      continue;
    }
    const newCycleDay = generateCycleDaysForRecord(isoDate, cycleStartIso);
    await queueUpdate(entryDoc.ref, { cycle_day: newCycleDay });
  }

  if (opCount > 0) {
    await batch.commit();
  }
};

export const splitCycleAtDate = async (userId, previousCycleId, newCycleId, startDateS) => {
  if (!userId || !previousCycleId || !newCycleId || !startDateS) {
    throw new Error('Missing data for cycle split');
  }

  const startDate = parseISO(startDateS);
  if (!isValid(startDate)) {
    const error = new Error('Invalid split start date');
    error.code = 'split-invalid-date';
    throw error;
  }

  const previousEntriesRef = collection(db, `users/${userId}/cycles/${previousCycleId}/entries`);
  const previousEntriesSnap = await getDocs(previousEntriesRef);
  const entriesToMove = previousEntriesSnap.docs
    .map((entryDoc) => {
      const entryData = entryDoc.data();
      const isoDate = resolveSplitEntryIsoDate(entryData);
      return {
        id: entryDoc.id,
        ref: entryDoc.ref,
        data: entryData,
        isoDate,
      };
    })
    .filter((entry) => parseISO(entry.isoDate) >= startDate);

  if (!entriesToMove.length) {
    return { movedEntries: 0 };
  }

  // 1) Indexar lo que YA exista en el ciclo destino por fecha (isoDate).
  //    - Si hay duplicados por fecha en el destino, eso ya es un estado inconsistente => split-date-conflict.
  const newEntriesRef = collection(db, `users/${userId}/cycles/${newCycleId}/entries`);
  const newEntriesSnap = await getDocs(newEntriesRef);
  const newEntriesByIso = new Map(); // isoDate -> { id, ref, data }

  for (const d of newEntriesSnap.docs) {
    const data = d.data();
    let iso = null;
    try {
      iso = resolveSplitEntryIsoDate(data);
    } catch (e) {
      // Si un entry del destino tiene fecha inválida, no lo usamos para resolver conflictos.
      // Mejor no romper el split por datos “raros” que ya existían.
      continue;
    }
    if (newEntriesByIso.has(iso)) {
      const error = new Error('New cycle already has multiple entries for the same date');
      error.code = 'split-date-conflict';
      error.conflictDate = iso; // 'yyyy-MM-dd'
      throw error;
    }
    newEntriesByIso.set(iso, { id: d.id, ref: d.ref, data });
  }
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

  const queueUpdate = async (ref, data) => {
    await ensureBatchCapacity();
    batch.update(ref, data);
    opCount += 1;
  };
  const queueDelete = async (ref) => {
    await ensureBatchCapacity();
    batch.delete(ref);
    opCount += 1;
  };

  const isEmptyValue = (v) =>
    v === null ||
    v === undefined ||
    (typeof v === 'string' && v.trim() === '');

  const MERGE_KEYS = [
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
    'timestamp',
  ];
  for (const entry of entriesToMove) {
    const existingTarget = newEntriesByIso.get(entry.isoDate);
    const newCycleDay = generateCycleDaysForRecord(entry.isoDate, startDateS);

    // 2) Si ya hay entry en el destino para esa fecha, fusionamos (no petamos).
    if (existingTarget) {
      const updatePayload = { cycle_day: newCycleDay };
      for (const key of MERGE_KEYS) {
        const targetVal = existingTarget.data?.[key];
        const sourceVal = entry.data?.[key];
        if (isEmptyValue(targetVal) && !isEmptyValue(sourceVal)) {
          updatePayload[key] = sourceVal;
        }
      }
      await queueUpdate(existingTarget.ref, updatePayload);

      const measurementsRef = collection(
        db,
        `users/${userId}/cycles/${previousCycleId}/entries/${entry.id}/measurements`
      );
      const measurementsSnap = await getDocs(measurementsRef);
      for (const measurementDoc of measurementsSnap.docs) {
        // Usar ID nuevo para evitar colisiones con mediciones ya existentes en el destino
        const destMeasRef = doc(
          collection(
            db,
            `users/${userId}/cycles/${newCycleId}/entries/${existingTarget.id}/measurements`
          )
        );
        await queueSet(destMeasRef, measurementDoc.data());
        await queueDelete(measurementDoc.ref);
      }

      // Eliminamos el entry del ciclo anterior (su “contenido” ya queda en el destino)
      await queueDelete(entry.ref);
      continue;
    }

    // 3) Caso normal: mover entry completo al destino
    const newEntryRef = doc(db, `users/${userId}/cycles/${newCycleId}/entries/${entry.id}`);
    await queueSet(newEntryRef, { ...entry.data, cycle_day: newCycleDay });

    const measurementsRef = collection(
      db,
      `users/${userId}/cycles/${previousCycleId}/entries/${entry.id}/measurements`
    );
    const measurementsSnap = await getDocs(measurementsRef);
    for (const measurementDoc of measurementsSnap.docs) {
      const newMeasurementRef = doc(
        db,
        `users/${userId}/cycles/${newCycleId}/entries/${entry.id}/measurements/${measurementDoc.id}`
      );
      await queueSet(newMeasurementRef, measurementDoc.data());
      await queueDelete(measurementDoc.ref);
    }

    await queueDelete(entry.ref);
  }

  if (opCount > 0) {
    await batch.commit();
  }

  return { movedEntries: entriesToMove.length };
};

export const startNewCycleDB = async (userId, previousCycleId, startDate) => {
  if (!userId || !startDate) {
    throw new Error('Missing user or start date');
  }

  const newStart = parseISO(startDate);
  if (!isValid(newStart)) {
    throw new Error('Invalid start date');
  }

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const overlapDoc = cyclesSnap.docs.find((docSnap) => {
    if (docSnap.id === previousCycleId) return false;
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    if (!start) return false;
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

  const newCycleRef = doc(collection(db, `users/${userId}/cycles`));
  await setDoc(newCycleRef, {
    user_id: userId,
    start_date: startDate,
    ignored_auto_calculations: false,
    end_date: null,
  });

  if (previousCycleId) {
    await splitCycleAtDate(userId, previousCycleId, newCycleRef.id, startDate);
    const previousRef = doc(db, `users/${userId}/cycles/${previousCycleId}`);
    const dayBefore = format(addDays(startOfDay(newStart), -1), 'yyyy-MM-dd');
    await updateDoc(previousRef, { end_date: dayBefore });
  }

  return { id: newCycleRef.id, start_date: startDate };
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

  const parsedNewEnd = startOfDay(parseISO(newEndDate));
  if (!isValid(parsedNewEnd)) {
    throw new Error('Invalid end date');
  }

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const sortedCycles = sortCyclesByStartDate(cyclesSnap.docs);
  const { current, next, nextNext } = findNeighbors(sortedCycles, currentCycleId);

  if (!current || !next) return;

  const effectiveCurrentStart = currentCycleStartDate || current.data.start_date || null;
  const currentStartDate = effectiveCurrentStart ? startOfDay(parseISO(effectiveCurrentStart)) : null;
  if (currentStartDate && parsedNewEnd < currentStartDate) {
    const error = new Error('End date cannot be earlier than start date');
    error.code = 'cycle-range-invalid';
    throw error;
  }

  const proposedStart = startOfDay(addDays(parsedNewEnd, 1));
  const proposedStartIso = format(proposedStart, 'yyyy-MM-dd');

  if (nextNext?.data?.start_date) {
    const nextNextStart = startOfDay(parseISO(nextNext.data.start_date));
    if (proposedStart >= nextNextStart) {
      const error = new Error('Cycle dates overlap with an existing cycle');
      error.code = 'cycle-overlap';
      error.conflictCycle = {
        id: nextNext.id,
        startDate: nextNext.data.start_date,
        endDate: nextNext.data.end_date,
      };
      throw error;
    }
   }
   if (next.data.end_date) {
    const nextEnd = startOfDay(parseISO(next.data.end_date));
    if (proposedStart > nextEnd) {
      const error = new Error('Cycle end is earlier than start');
      error.code = 'cycle-range-invalid';
      throw error;
    }
  }
const nextStart = startOfDay(parseISO(next.data.start_date));
  if (proposedStart > nextStart) {
    await moveEntriesWithMeasurementsDB({
      userId,
      fromCycleId: next.id,
      toCycleId: currentCycleId,
      shouldMoveIsoDate: (isoDate) => startOfDay(parseISO(isoDate)) < proposedStart,
      toCycleStartIso: effectiveCurrentStart || current.data.start_date,
    });
  } else if (proposedStart < nextStart) {
    await splitCycleAtDate(userId, currentCycleId, next.id, proposedStartIso);
  }

  const nextCycleRef = doc(db, `users/${userId}/cycles/${next.id}`);
  await updateDoc(nextCycleRef, { start_date: proposedStartIso });
  await recalcCycleDayForAllEntriesDB(userId, next.id, proposedStartIso);
};

export const forceUpdateCycleStart = async (userId, currentCycleId, newStartDate) => {
  if (!newStartDate) return;

  const newStart = startOfDay(parseISO(newStartDate));
  if (!isValid(newStart)) {
    throw new Error('Invalid start date');
  }

  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const sortedCycles = sortCyclesByStartDate(cyclesSnap.docs);
  const { previous, current, next } = findNeighbors(sortedCycles, currentCycleId);

  if (!current) return;

  const currentStartIso = current.data.start_date;
  const currentStart = currentStartIso ? startOfDay(parseISO(currentStartIso)) : null;
  const currentEnd = current.data.end_date ? startOfDay(parseISO(current.data.end_date)) : null;

  if (previous?.data?.start_date) {
    const previousStart = startOfDay(parseISO(previous.data.start_date));
    if (newStart <= previousStart) {
      const error = new Error('Cycle dates overlap with an existing cycle');
      error.code = 'cycle-overlap';
      error.conflictCycle = {
        id: previous.id,
        startDate: previous.data.start_date,
        endDate: previous.data.end_date,
      };
      throw error;
    }
  }

  if (next?.data?.start_date) {
    const nextStart = startOfDay(parseISO(next.data.start_date));
    if (newStart >= nextStart) {
      const error = new Error('Cycle dates overlap with an existing cycle');
      error.code = 'cycle-overlap';
      error.conflictCycle = {
        id: next.id,
        startDate: next.data.start_date,
        endDate: next.data.end_date,
      };
      throw error;
    }
  }

  if (currentEnd && newStart > currentEnd) {
    const error = new Error('Cycle start is later than cycle end');
    error.code = 'cycle-range-invalid';
    throw error;
  }

  if (previous) {
    const prevRef = doc(db, `users/${userId}/cycles/${previous.id}`);
    const dayBefore = format(addDays(newStart, -1), 'yyyy-MM-dd');
    await updateDoc(prevRef, { end_date: dayBefore });

    if (currentStart && newStart < currentStart) {
      await moveEntriesWithMeasurementsDB({
        userId,
        fromCycleId: previous.id,
        toCycleId: currentCycleId,
        shouldMoveIsoDate: (isoDate) => startOfDay(parseISO(isoDate)) >= newStart,
        toCycleStartIso: format(newStart, 'yyyy-MM-dd'),
      });
    } else if (currentStart && newStart > currentStart) {
      await moveEntriesWithMeasurementsDB({
        userId,
        fromCycleId: currentCycleId,
        toCycleId: previous.id,
        shouldMoveIsoDate: (isoDate) => startOfDay(parseISO(isoDate)) < newStart,
        toCycleStartIso: previous.data.start_date,
      });
    }
  }
  const currentRef = doc(db, `users/${userId}/cycles/${currentCycleId}`);
  await updateDoc(currentRef, { start_date: format(newStart, 'yyyy-MM-dd') });
  await recalcCycleDayForAllEntriesDB(userId, currentCycleId, format(newStart, 'yyyy-MM-dd'));
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
      error.conflictDate = isoDate;
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
