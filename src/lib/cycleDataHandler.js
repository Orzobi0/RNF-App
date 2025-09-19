import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,

} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { format, differenceInDays, startOfDay, parseISO, compareAsc, addDays } from 'date-fns';

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
    if (chartTemp == null && Array.isArray(entry.measurements)) {
      const selectedMeasurement = entry.measurements.find(
        (m) => m && m.selected && getMeasurementTemp(m) !== null
      );
      const fallbackMeasurement =
        selectedMeasurement || entry.measurements.find((m) => getMeasurementTemp(m) !== null);
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
      measurements: entry.measurements || [],
      temperature_chart: chartTemp,
      timestamp: entry.timestamp,
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
  const entriesData = await Promise.all(
    entriesSnap.docs.map(async (d) => {
      let measurements = [];
      try {
        const mRef = collection(db, `users/${userId}/cycles/${cycleDoc.id}/entries/${d.id}/measurements`);
        const mSnap = await getDocs(mRef);
        measurements = mSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
      } catch (error) {
        console.error('Error fetching measurements for entry', d.id, error);
      }
      return { id: d.id, ...d.data(), measurements };
    })
  );

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
      const entriesData = await Promise.all(
        entriesSnap.docs.map(async (d) => {
          let measurements = [];
          try {
            const mRef = collection(db, `users/${userId}/cycles/${cycle.id}/entries/${d.id}/measurements`);
            const mSnap = await getDocs(mRef);
            measurements = mSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
          } catch (error) {
            console.error('Error fetching measurements for entry', d.id, error);
          }
          return { id: d.id, ...d.data(), measurements };
        })
      );
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
  const entriesData = await Promise.all(
    entriesSnap.docs.map(async (d) => {
      let measurements = [];
      try {
        const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${d.id}/measurements`);
        const mSnap = await getDocs(mRef);
        measurements = mSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
      } catch (error) {
        console.error('Error fetching measurements for entry', d.id, error);
      }
      return { id: d.id, ...d.data(), measurements };
    })
  );

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
  const selected = payload.measurements?.find((m) => m.selected);
  const entryData = {
    timestamp,
    temperature_raw: selected?.temperature ?? null,
    temperature_corrected: selected?.temperature_corrected ?? null,
    use_corrected: false,
    temperature_chart: selected
      ? selected.temperature_corrected ?? selected.temperature
      : null,
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
        if (payload.measurements && payload.measurements.length) {
      const mRef = collection(db, `users/${userId}/cycles/${targetCycle.id}/entries/${ref.id}/measurements`);
      for (const m of payload.measurements) {
        await addDoc(mRef, m);
      }
    }
    return { id: ref.id };
  }

  if (payload.cycle_id) {
    const ref = await addDoc(collection(db, `users/${userId}/cycles/${payload.cycle_id}/entries`), entryData);
        if (payload.measurements && payload.measurements.length) {
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
    'ignored',
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
    if (payload.measurements) {
    const mRef = collection(db, `users/${userId}/cycles/${cycleId}/entries/${entryId}/measurements`);
    const mSnap = await getDocs(mRef);
    await Promise.all(mSnap.docs.map((d) => deleteDoc(d.ref)));
    for (const m of payload.measurements) {
      await addDoc(mRef, m);
    }
  }
  return { id: entryId };
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

  if (validateOnly) {
    if (overlapDoc) {
      const data = overlapDoc.data();
      return { overlap: { id: overlapDoc.id, startDate: data.start_date, endDate: data.end_date } };
    }
    return { overlap: null };
  }

  if (overlapDoc) {
    throw new Error('Cycle dates overlap with an existing cycle');
  }

  const updatePayload = {};
  if (startDate !== undefined) updatePayload.start_date = startDate;
  if (endDate !== undefined) updatePayload.end_date = endDate;

  await updateDoc(cycleRef, updatePayload);
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
    return end >= newStart;
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
