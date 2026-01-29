import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, db } from '@/lib/firebaseClient';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  deleteUser,
} from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';

  const AuthContext = createContext(null);

const COMBINE_MODE_OPTIONS = new Set(['estandar', 'conservador']);

const normalizeCombineMode = (value) => (
  COMBINE_MODE_OPTIONS.has(value) ? value : null
);

const createDefaultFertilityStartConfig = () => ({
  calculators: { cpm: true, t8: true },
  postpartum: false,
  combineMode: 'estandar',
});

const mergeFertilityStartConfig = ({ current, incoming, legacyCombineMode }) => {
  const base = createDefaultFertilityStartConfig();
  const merged = {
    calculators: { ...base.calculators },
    postpartum: base.postpartum,
    combineMode: base.combineMode,
  };
  let combineModeSet = false;

  const applyConfig = (source) => {
    if (!source || typeof source !== 'object') return;
    Object.keys(merged.calculators).forEach((key) => {
      if (typeof source?.calculators?.[key] === 'boolean') {
        merged.calculators[key] = source.calculators[key];
      }
    });

    if (typeof source.postpartum === 'boolean') {
      merged.postpartum = source.postpartum;
    } else if (source.postpartum != null) {
      merged.postpartum = Boolean(source.postpartum);
    }

    const normalizedMode = normalizeCombineMode(source.combineMode);
    if (normalizedMode) {
      merged.combineMode = normalizedMode;
      combineModeSet = true;
    }
  };

  applyConfig(current);
  applyConfig(incoming);

  if (!combineModeSet) {
    const legacyMode = normalizeCombineMode(legacyCombineMode);
    if (legacyMode) {
      merged.combineMode = legacyMode;
    }
  }

  return merged;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        const prefRef = doc(db, `users/${firebaseUser.uid}/preferences`, 'display');
        const defaultPreferences = {
          theme: 'light',
          units: 'metric',
          manualCpm: null,
          manualT8: null,
          manualCpmBase: null,
          manualT8Base: null,
          cpmMode: 'auto',
          t8Mode: 'auto',
          showRelationsRow: true,
          fertilityStartConfig: createDefaultFertilityStartConfig(),
        };
        try {
          const prefSnap = await getDoc(prefRef);
          if (prefSnap.exists()) {
            const {
              combineMode: legacyCombineMode,
              fertilityStartConfig: storedFertilityStartConfig,
              ...restPreferences
            } = prefSnap.data();
            const mergedFertilityStartConfig = mergeFertilityStartConfig({
              current: defaultPreferences.fertilityStartConfig,
              incoming: storedFertilityStartConfig,
              legacyCombineMode,
            });
            setPreferences({
              ...defaultPreferences,
              ...restPreferences,
              fertilityStartConfig: mergedFertilityStartConfig,
            });
          } else {
            setPreferences(defaultPreferences);
          }
        } catch (error) {
          console.error('Failed to load preferences', error);
          setPreferences(defaultPreferences);
        }
      } else {
        setUser(null);
        setPreferences(null);
      }
        setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      toast({ title: 'Error al iniciar sesión', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const register = async (email, password) => {
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const actionCodeSettings = {
        url: `${window.location.origin}/auth`,
      };
      await sendEmailVerification(user, actionCodeSettings);
      await signOut(auth);
    } catch (error) {
      toast({ title: 'Error al registrarse', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      toast({ title: 'Error al restablecer contraseña', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setPreferences(null);
    } catch (error) {
      toast({ title: 'Error al cerrar sesión', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const updateUserEmail = async (newEmail) => {
    if (!auth.currentUser) return;
    try {
      await firebaseUpdateEmail(auth.currentUser, newEmail);
      setUser((prev) => (prev ? { ...prev, email: newEmail } : prev));
    } catch (error) {
      toast({ title: 'Error al actualizar correo', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const updateUserPassword = async (newPassword) => {
    if (!auth.currentUser) return;
    try {
      await firebaseUpdatePassword(auth.currentUser, newPassword);
    } catch (error) {
      toast({ title: 'Error al actualizar contraseña', description: error.message, variant: 'destructive' });
      throw error;
    }
  };
const savePreferences = async (prefs = {}) => {
    if (!auth.currentUser) return;
    const prefRef = doc(db, `users/${auth.currentUser.uid}/preferences`, 'display');
    const {
      combineMode: legacyCombineMode,
      fertilityStartConfig: incomingFertilityStartConfig,
      ...restPrefs
    } = prefs ?? {};
    const hasFertilityUpdate =
      (incomingFertilityStartConfig && typeof incomingFertilityStartConfig === 'object')
      || legacyCombineMode !== undefined;
    const nextFertilityStartConfig = hasFertilityUpdate
      ? mergeFertilityStartConfig({
          current: preferences?.fertilityStartConfig,
          incoming: incomingFertilityStartConfig,
          legacyCombineMode,
        })
      : preferences?.fertilityStartConfig;

    const payload = { ...restPrefs };
    if (hasFertilityUpdate && nextFertilityStartConfig) {
      payload.fertilityStartConfig = nextFertilityStartConfig;
      payload.combineMode = deleteField();
    }

    try {
      await setDoc(prefRef, payload, { merge: true });
      setPreferences((previous) => {
        const current = previous ?? {
          theme: 'light',
          units: 'metric',
          manualCpm: null,
          manualT8: null,
          manualCpmBase: null,
          manualT8Base: null,
          cpmMode: 'auto',
          t8Mode: 'auto',
          showRelationsRow: true,
          fertilityStartConfig: createDefaultFertilityStartConfig(),
        };
        const next = { ...current, ...restPrefs };
        if (hasFertilityUpdate && nextFertilityStartConfig) {
          next.fertilityStartConfig = nextFertilityStartConfig;
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to save preferences', error);
      toast({ title: 'Error al guardar preferencias', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const updateProfileInfo = async (profile) => {
    if (!auth.currentUser) return;
    try {
      await updateProfile(auth.currentUser, profile);
      setUser((prev) => (prev ? { ...prev, ...profile } : prev));
    } catch (error) {
      toast({ title: 'Error al actualizar perfil', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const deleteAccount = async () => {
    if (!auth.currentUser) return;
    try {
      await deleteUser(auth.currentUser);
      setUser(null);
      setPreferences(null);
    } catch (error) {
      toast({ title: 'Error al eliminar cuenta', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        resetPassword,
        updateEmail: updateUserEmail,
        updatePassword: updateUserPassword,
        preferences,
        savePreferences,
        updateProfile: updateProfileInfo,
        deleteAccount,
        loadingAuth,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
  
