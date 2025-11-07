import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

const METRICS_COLLECTION_PATH = 'metrics';
const METRICS_DOCUMENT_ID = 'summary';

export const saveUserMetricsSnapshot = async (userId, data) => {
  if (!userId || !data || typeof data !== 'object') {
    throw new Error('A valid userId and data object are required to save metrics.');
  }

  const metricsRef = doc(db, `users/${userId}/${METRICS_COLLECTION_PATH}`, METRICS_DOCUMENT_ID);
  await setDoc(metricsRef, data, { merge: true });
};

export default saveUserMetricsSnapshot;