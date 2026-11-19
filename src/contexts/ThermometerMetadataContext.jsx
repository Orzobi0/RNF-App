import { isBleVisualLabEnabled } from '@/lib/bleVisualLab';
import { Capacitor } from '@capacitor/core';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { createThermometerMetadataStore, mergeThermometerFields } from '@/lib/thermometerMetadata';

const empty = { devices: {}, error: null, patch: () => {}, get: () => ({}) };
const Context = createContext(empty);
export const useThermometerMetadata = () => useContext(Context);
export function ThermometerMetadataProvider({ children }) {
  const { user } = useAuth();
  return user?.uid ? <MetadataOwner key={user.uid} userId={user.uid}>{children}</MetadataOwner> : <Context.Provider value={empty}>{children}</Context.Provider>;
}
function MetadataOwner({ userId, children }) {
  const store = useRef(null);
  const [state, setState] = useState({ devices: {}, error: null });
  useEffect(() => {
    let alive = true;
    const preview = isBleVisualLabEnabled(import.meta.env, globalThis.location, Capacitor.isNativePlatform());
    const preferences = collection(db, 'users', userId, 'preferences');
    try {
      store.current = createThermometerMetadataStore({ userId: preview ? `visual-lab:${userId}` : userId, storage: localStorage, changed: next => { if (alive) setState(next); }, remote: preview ? { subscribe: () => () => {}, merge: async (_, fields) => fields } : {
        subscribe: (next, fail) => onSnapshot(query(preferences, where('kind', '==', 'thermometer')), { includeMetadataChanges: true }, snapshot => next(snapshot.docs.map(item => [item.data().deviceKey, item.data().fields ?? {}]), !snapshot.metadata.fromCache), fail),
        merge: (deviceKey, fields) => runTransaction(db, async transaction => {
          if (!alive) throw new Error('Cuenta cerrada');
          const target = doc(preferences, `thermometer_${encodeURIComponent(deviceKey)}`);
          const current = await transaction.get(target);
          if (!alive) throw new Error('Cuenta cerrada');
          const merged = mergeThermometerFields(current.data()?.fields, fields);
          transaction.set(target, { kind: 'thermometer', deviceKey, fields: merged });
          return merged;
        }),
      } });
      void store.current.flush();
    } catch { setState({ devices: {}, error: 'No se pueden conservar los nombres y ajustes en este móvil.' }); }
    const online = () => void store.current?.flush();
    window.addEventListener('online', online);
    return () => { alive = false; window.removeEventListener('online', online); store.current?.dispose(); store.current = null; };
  }, [userId]);
  const patch = (...args) => { if (!store.current) throw new Error('Los metadatos todavía no están disponibles.'); store.current.patch(...args); };
  return <Context.Provider value={{ ...state, patch, get: id => store.current?.get(id) ?? {} }}>{children}</Context.Provider>;
}
