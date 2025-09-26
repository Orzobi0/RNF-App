// src/lib/firebaseClient.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const configureAuthPersistence = async () => {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch (error) {
    console.warn('IndexedDB persistence unavailable, falling back to local storage.', error);
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (fallbackError) {
      console.error('Failed to configure Firebase Auth persistence.', fallbackError);
    }
  }
};

if (typeof window !== 'undefined') {
  configureAuthPersistence().catch((error) => {
    console.error('Unexpected error configuring Firebase Auth persistence.', error);
  });
}
