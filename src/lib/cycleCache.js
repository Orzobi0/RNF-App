const DB_NAME = 'RNFApp';
const DB_VERSION = 1;
const STORE_NAME = 'cycleData';
const STORAGE_KEY_PREFIX = 'cycle-data:';

const isIndexedDBSupported = () => typeof indexedDB !== 'undefined';
const isLocalStorageSupported = () => typeof localStorage !== 'undefined';

const cloneData = (data) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data));
};

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

const runStoreOperation = async (mode, operation) => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? request?.error);
    };
  });
};

export const getCachedCycleData = async (userId) => {
  if (!userId) return null;

  if (isIndexedDBSupported()) {
    try {
      const result = await runStoreOperation('readonly', (store) => store.get(userId));
      return result ?? null;
    } catch (error) {
      console.error('Failed to retrieve cached cycle data.', error);
    }
  }

  if (isLocalStorageSupported()) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Failed to read cached cycle data from localStorage.', error);
    }
  }

  return null;
};

export const saveCycleDataToCache = async (userId, data) => {
  if (!userId) return;

  const payload = cloneData(data);

  if (isIndexedDBSupported()) {
    try {
      await runStoreOperation('readwrite', (store) => store.put(payload, userId));
      return;
    } catch (error) {
      console.error('Failed to persist cycle data cache.', error);
    }
  }

  if (isLocalStorageSupported()) {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to persist cycle data cache in localStorage.', error);
    }
  }
};

export const clearCycleDataCache = async (userId) => {
  if (!userId) return;

  if (isIndexedDBSupported()) {
    try {
      await runStoreOperation('readwrite', (store) => store.delete(userId));
    } catch (error) {
      console.error('Failed to clear cached cycle data.', error);
    }
  }

  if (isLocalStorageSupported()) {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
    } catch (error) {
      console.error('Failed to clear cached cycle data from localStorage.', error);
    }
  }
};