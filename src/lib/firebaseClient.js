// src/lib/firebaseClient.js
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
} from 'firebase/firestore';
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

// Export: permite esperar la persistencia antes de hidratar Auth en React
export const authPersistenceReady =
  typeof window !== 'undefined'
    ? configureAuthPersistence()
    : Promise.resolve();

if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((error) => {
    if (error.code === 'failed-precondition') {
      enableIndexedDbPersistence(db).catch((singleTabError) => {
        if (singleTabError.code === 'failed-precondition') {
          console.warn(
            'Firestore persistence could not be enabled because multiple tabs are open and multi-tab persistence failed.'
          );
        } else if (singleTabError.code === 'unimplemented') {
          console.warn('Firestore persistence is not available in this environment.', singleTabError);
        } else {
          console.error('Failed to enable Firestore offline persistence.', singleTabError);
        }
      });
    } else if (error.code === 'unimplemented') {
      console.warn('Firestore persistence is not available in this environment.', error);
    } else {
      console.error('Unexpected error enabling multi-tab persistence for Firestore.', error);
    }
  });

  authPersistenceReady.catch((error) => {
    console.error('Unexpected error configuring Firebase Auth persistence.', error);
  });
}
