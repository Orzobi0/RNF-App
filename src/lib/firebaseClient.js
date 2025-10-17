// src/lib/firebaseClient.js
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

let authInstance = null;

let resolveAuthReady;
let rejectAuthReady;
export const authPersistenceReady = new Promise((resolve, reject) => {
  resolveAuthReady = resolve;
  rejectAuthReady = reject;
});

const initializeClientAuth = () => {
  if (authInstance) {
    return authInstance;
  }

  if (typeof window === 'undefined') {
    authInstance = getAuth(app);
    resolveAuthReady(authInstance);
    return authInstance;
  }

  try {
    authInstance = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
    resolveAuthReady(authInstance);
  } catch (error) {
    if (error?.code === 'auth/already-initialized') {
      authInstance = getAuth(app);
      resolveAuthReady(authInstance);
    } else {
      console.warn(
        'IndexedDB or local storage persistence unavailable. Falling back to in-memory persistence.',
        error
      );
      try {
        authInstance = initializeAuth(app, { persistence: [inMemoryPersistence] });
        console.warn(
          'Firebase Auth is running with in-memory persistence. The session will not survive a reload.'
        );
        resolveAuthReady(authInstance);
      } catch (fallbackError) {
        console.error('Failed to initialize Firebase Auth persistence.', fallbackError);
        rejectAuthReady(fallbackError);
      }
    }
  }
  
  return authInstance;
};

export const auth = initializeClientAuth();

export const getFirebaseAuth = () => authInstance ?? getAuth(app);
