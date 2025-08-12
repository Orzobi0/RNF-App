import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
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
    temperature_chart: entry.temperature_chart,
    timestamp: entry.timestamp,
  }));
};

export const fetchCurrentCycleDB = async (userId) => {
  const cyclesRef = collection(db, 'cycles');
  const q = query(
    cyclesRef,
    where('user_id', '==', userId),
    where('end_date', '==', null),
    orderBy('start_date', 'desc'),
    limit(1)
  );
  const cycleSnapshot = await getDocs(q);
  if (cycleSnapshot.empty) return null;
  const cycleDoc = cycleSnapshot.docs[0];
  const cycleData = cycleDoc.data();

  const entriesRef = collection(db, 'entries');
  const entriesQ = query(
    entriesRef,
    where('cycle_id', '==', cycleDoc.id),
    orderBy('timestamp', 'asc')
  );
  const entriesSnap = await getDocs(entriesQ);
  const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    id: cycleDoc.id,
    startDate: cycleData.start_date,
    endDate: cycleData.end_date,
    data: entriesData,
  };
};

export const fetchArchivedCyclesDB = async (userId) => {
  const cyclesRef = collection(db, 'cycles');
  const q = query(cyclesRef, where('user_id', '==', userId), orderBy('start_date', 'desc'));
  const snapshot = await getDocs(q);
  const cycles = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((c) => c.end_date !== null && c.end_date !== undefined);

  const cyclesWithEntries = await Promise.all(
    cycles.map(async (cycle) => {
      const entriesRef = collection(db, 'entries');
      const entriesQ = query(
        entriesRef,
        where('cycle_id', '==', cycle.id),
        orderBy('timestamp', 'asc')
      );
      const entriesSnap = await getDocs(entriesQ);
      const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return {
        id: cycle.id,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        data: entriesData,
      };
          })
  );
  return cyclesWithEntries;
};

export const fetchCycleByIdDB = async (userId, cycleId) => {
  const cycleRef = doc(db, 'cycles', cycleId);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) return null;
  const cycleData = cycleSnap.data();
  if (cycleData.user_id !== userId) return null;

  const entriesRef = collection(db, 'entries');
  const entriesQ = query(
    entriesRef,
    where('cycle_id', '==', cycleId),
    orderBy('timestamp', 'asc')
  );
  const entriesSnap = await getDocs(entriesQ);
  const entriesData = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    id: cycleId,
    startDate: cycleData.start_date,
    endDate: cycleData.end_date,
    data: entriesData,
  };
};

export const createNewCycleDB = async (userId, startDate) => {
  const docRef = await addDoc(collection(db, 'cycles'), {
    user_id: userId,
    start_date: startDate,
    end_date: null,
  });
  return { id: docRef.id, start_date: startDate };
};

export const createNewCycleEntry = async (payload) => {
  const docRef = await addDoc(collection(db, 'entries'), {
    cycle_id: payload.cycle_id,
    user_id: payload.user_id,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    temperature_raw: payload.temperature_raw,
    temperature_corrected: payload.temperature_corrected,
    use_corrected: payload.use_corrected,
    mucus_sensation: payload.mucus_sensation,
    mucus_appearance: payload.mucus_appearance,
    fertility_symbol: payload.fertility_symbol,
    observations: payload.observations,
    ignored: payload.ignored,
  });
  return { id: docRef.id };
};

export const updateCycleEntry = async (entryId, payload) => {
  const entryRef = doc(db, 'entries', entryId);
  const entryToUpdate = {
    temperature_raw: payload.temperature_raw,
    temperature_corrected: payload.temperature_corrected,
    use_corrected: payload.use_corrected,
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
export const deleteCycleEntryDB = async (entryId) => {
  await deleteDoc(doc(db, 'entries', entryId));
};

export const archiveCycleDB = async (cycleId, userId, endDate) => {
  const cycleRef = doc(db, 'cycles', cycleId);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) throw new Error('Cycle not found');
  const cycleData = cycleSnap.data();
  if (cycleData.user_id !== userId) throw new Error('Unauthorized');
  await updateDoc(cycleRef, { end_date: endDate });
};

export const updateCycleDatesDB = async (cycleId, userId, startDate, endDate) => {
    const cycleRef = doc(db, 'cycles', cycleId);
  const cycleSnap = await getDoc(cycleRef);
  if (!cycleSnap.exists()) throw new Error('Cycle not found');
  const cycleData = cycleSnap.data();
  if (cycleData.user_id !== userId) throw new Error('Unauthorized');
  const updatePayload = {};
  if (startDate !== undefined) updatePayload.start_date = startDate;
  if (endDate !== undefined) updatePayload.end_date = endDate;

  await updateDoc(cycleRef, updatePayload);
};