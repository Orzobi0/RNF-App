import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,

} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { format, differenceInDays, startOfDay, parseISO, compareAsc } from 'date-fns';

const generateCycleDaysForRecord = (recordIsoDate, cycleStartIsoDate) => {
  if (!recordIsoDate || !cycleStartIsoDate) return 0;
  const rDate = startOfDay(parseISO(recordIsoDate));
  const sDate = startOfDay(parseISO(cycleStartIsoDate));
  return differenceInDays(rDate, sDate) + 1;
};

export const processCycleEntries = (entriesFromView, cycleStartIsoDate) => {
  if (!entriesFromView || !Array.isArray(entriesFromView) || !cycleStartIsoDate) return [];

  const sortedEntries = [...entriesFromView].sort((a, b) => {
    const dateA = a.timestamp ? parseISO(a.timestamp) : (a.iso_date ? parseISO(a.iso_date) : 0);
    const dateB = b.timestamp ? parseISO(b.timestamp) : (b.iso_date ? parseISO(b.iso_date) : 0);
    return compareAsc(dateA, dateB);
  });

  return sortedEntries.map((entry) => ({
    ...entry,
    id: entry.id,
    isoDate: entry.iso_date || (entry.timestamp ? format(parseISO(entry.timestamp), 'yyyy-MM-dd') : null),
    date: entry.timestamp
      ? format(parseISO(entry.timestamp), 'dd/MM')
      : entry.iso_date
      ? format(parseISO(entry.iso_date), 'dd/MM')
      : 'N/A',
    cycleDay: generateCycleDaysForRecord(entry.iso_date || entry.timestamp, cycleStartIsoDate),
    temperature_raw: entry.temperature_raw,
    temperature_corrected: entry.temperature_corrected,
    use_corrected: entry.use_corrected,
    mucusSensation: entry.mucus_sensation,
    mucusAppearance: entry.mucus_appearance,
    fertility_symbol: entry.fertility_symbol,
    observations: entry.observations,
    ignored: entry.ignored,
    temperature_chart: entry.temperature_chart ?? (
      entry.use_corrected
        ? (entry.temperature_corrected ?? entry.temperature_raw)
        : (entry.temperature_raw ?? entry.temperature_corrected)
    ),
    timestamp: entry.timestamp,
  }));
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
    data: entriesData,
  };
};

export const createNewCycleDB = async (userId, startDate) => {
  const cyclesRef = collection(db, `users/${userId}/cycles`);
  const cyclesSnap = await getDocs(cyclesRef);
  const newStart = parseISO(startDate);

  const overlaps = cyclesSnap.docs.some((docSnap) => {
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    return start && newStart >= start && (!end || newStart <= end);
  });

  if (overlaps) {
    throw new Error('Cycle dates overlap with an existing cycle');
  }

  const docRef = await addDoc(collection(db, `users/${userId}/cycles`), {
    user_id: userId,
    start_date: startDate,
    end_date: null,
  });
  return { id: docRef.id, start_date: startDate };
};

export const createNewCycleEntry = async (payload) => {
  const userId = payload.user_id;
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const entryData = {
    timestamp,
    temperature_raw: payload.temperature_raw,
    temperature_corrected: payload.temperature_corrected,
    use_corrected: payload.use_corrected,
    temperature_chart: payload.temperature_chart,
    mucus_sensation: payload.mucus_sensation,
    mucus_appearance: payload.mucus_appearance,
    fertility_symbol: payload.fertility_symbol,
    observations: payload.observations,
    ignored: payload.ignored,
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
    return { id: ref.id };
  }

  if (payload.cycle_id) {
    const ref = await addDoc(collection(db, `users/${userId}/cycles/${payload.cycle_id}/entries`), entryData);
    return { id: ref.id };
  }

  return { id: null };
};

export const updateCycleEntry = async (userId, cycleId, entryId, payload) => {
  const entryRef = doc(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}`);
  const entryToUpdate = {
    temperature_raw: payload.temperature_raw,
    temperature_corrected: payload.temperature_corrected,
    use_corrected: payload.use_corrected,
    temperature_chart: payload.temperature_chart,
    mucus_sensation: payload.mucus_sensation,
    mucus_appearance: payload.mucus_appearance,
    fertility_symbol: payload.fertility_symbol,
    observations: payload.observations,
    ignored: payload.ignored,
  };
  if (payload.timestamp) {
    entryToUpdate.timestamp = payload.timestamp;
  }
  await updateDoc(entryRef, entryToUpdate);
  return { id: entryId };
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

export const updateCycleDatesDB = async (cycleId, userId, startDate, endDate) => {
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
  const overlap = cyclesSnap.docs.some((docSnap) => {
    if (docSnap.id === cycleId) return false;
    const data = docSnap.data();
    const start = data.start_date ? parseISO(data.start_date) : null;
    const end = data.end_date ? parseISO(data.end_date) : null;
    if (!start) return false;
    const endDateComparable = end ?? new Date('9999-12-31');
    const proposedEndComparable = proposedEndDate ?? new Date('9999-12-31');
    return proposedStartDate <= endDateComparable && start <= proposedEndComparable;
  });

  if (overlap) {
    throw new Error('Cycle dates overlap with an existing cycle');
  }

  const updatePayload = {};
  if (startDate !== undefined) updatePayload.start_date = startDate;
  if (endDate !== undefined) updatePayload.end_date = endDate;

  await updateDoc(cycleRef, updatePayload);
  };

export const deleteCycleDB = async (userId, cycleId) => {
  const entriesRef = collection(db, `users/${userId}/cycles/${cycleId}/entries`);
  const entriesSnap = await getDocs(entriesRef);
  await Promise.all(entriesSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, `users/${userId}/cycles/${cycleId}`));
};
