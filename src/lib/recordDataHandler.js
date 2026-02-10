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
  const recordRef = doc(db, `users/${userId}/records/${isoDate}`);
  const { measurements, cycle_id, user_id, ...payloadWithoutLegacyFields } = recordPayload || {};

  await setDoc(
    recordRef,
    {
      ...payloadWithoutLegacyFields,
      iso_date: isoDate,
    },
    { merge: true }
  );

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