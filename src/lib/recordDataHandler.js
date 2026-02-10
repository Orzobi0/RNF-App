import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { getDoc } from 'firebase/firestore';


const toRecordDoc = (docSnap) => ({
  id: docSnap.id,
  iso_date: docSnap.id,
  ...docSnap.data(),
});

export const fetchRecordsInRangeDB = async (userId, startIso, endIso) => {
  const recordsRef = collection(db, `users/${userId}/records`);
  const recordsQuery = query(
    recordsRef,
    where(documentId(), '>=', startIso),
    where(documentId(), '<=', endIso),
    orderBy(documentId(), 'asc')
  );
  const snapshot = await getDocs(recordsQuery);
  return snapshot.docs.map(toRecordDoc);
};

export const upsertRecordDB = async (
  userId,
  isoDate,
  recordPayload,
  measurementsPayload
) => {
    console.log('[records_v1] upsertRecordDB', { userId, isoDate, hasMeasurements: Array.isArray(measurementsPayload) ? measurementsPayload.length : measurementsPayload });

  const recordRef = doc(db, `users/${userId}/records/${isoDate}`);
  const { measurements, cycle_id, user_id, ...payloadWithoutLegacyFields } = recordPayload || {};

  try {
    await setDoc(
    
    recordRef,
    {
      ...payloadWithoutLegacyFields,
      iso_date: isoDate,
    },
    { merge: true }
  );
  
  } catch (e) {
  console.error('[records_v1] setDoc FAILED', e);
  throw e;
}
console.log('[records_v1] setDoc OK', { path: recordRef.path });

const snap = await getDoc(recordRef);
console.log('[records_v1] after setDoc getDoc', {
  exists: snap.exists(),
  fromCache: snap.metadata.fromCache,
  hasPendingWrites: snap.metadata.hasPendingWrites,
  data: snap.data(),
});


  if (measurementsPayload === undefined) {
    return { id: isoDate };
  }

  const measurementsRef = collection(db, `users/${userId}/records/${isoDate}/measurements`);
  const previousMeasurements = await getDocs(measurementsRef);

  if (!previousMeasurements.empty) {
    const batch = writeBatch(db);
    previousMeasurements.docs.forEach((measurementDoc) => {
      batch.delete(measurementDoc.ref);
    });
    await batch.commit();
  }

  if (Array.isArray(measurementsPayload) && measurementsPayload.length >= 2) {
    await Promise.all(measurementsPayload.map((measurement) => addDoc(measurementsRef, measurement)));
  }

  return { id: isoDate };
};

export const fetchRecordMeasurementsDB = async (userId, isoDate) => {
  const measurementsRef = collection(db, `users/${userId}/records/${isoDate}/measurements`);
  const snapshot = await getDocs(measurementsRef);
  return snapshot.docs.map((measurementDoc) => ({ id: measurementDoc.id, ...measurementDoc.data() }));
};

export const deleteRecordDB = async (userId, isoDate) => {
  const measurementsRef = collection(db, `users/${userId}/records/${isoDate}/measurements`);
  const snapshot = await getDocs(measurementsRef);
  if (!snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((measurementDoc) => {
      batch.delete(measurementDoc.ref);
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, `users/${userId}/records/${isoDate}`));
};