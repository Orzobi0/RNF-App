import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, db, authPersistenceReady } from '@/lib/firebaseClient';
import {
  onIdTokenChanged,
  getIdToken,
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
import { deleteField, doc, getDoc, setDoc, getDocFromCache } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import {
  PREFERENCE_DEFAULTS,
  normalizeStoredPreferences,
  normalizePreferencePatch,
} from '@/lib/preferences';
import {
  trackEvent,
  trackLogin,
  trackSignUp,
  setAnalyticsUserId,
  trackSessionReady,
} from '@/lib/analytics';

const AuthContext = createContext(null);

const PERSIST_REQUESTED_KEY = 'rnf_storage_persist_requested_v1';
const getStandaloneMode = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;

const ensurePersistentStorage = async (phase) => {
  if (typeof navigator === 'undefined' || !navigator?.storage?.persist) return;

  const attemptedKey = `rnf_storage_persist_attempted_${phase}_v1`;
  try {
    if (sessionStorage.getItem(attemptedKey) === '1') return;
    sessionStorage.setItem(attemptedKey, '1');
  } catch (storageError) {
    // Ignore session storage errors.
  }

  let granted = false;

  if (navigator.storage.persisted) {
    try {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) {
        granted = true;
        try {
          localStorage.setItem(PERSIST_REQUESTED_KEY, '1');
        } catch (storageError) {
          // Ignore local storage errors.
        }
        if (import.meta.env.DEV) {
          console.info('[storage:persist]', {
            phase,
            granted,
            origin: window.location.origin,
            standalone: getStandaloneMode(),
          });
        }
        return;
      }
    } catch (storageError) {
      // Ignore persisted check errors.
    }
  }

  try {
    if (localStorage.getItem(PERSIST_REQUESTED_KEY) === '1') {
      localStorage.removeItem(PERSIST_REQUESTED_KEY);
    }
  } catch (storageError) {
    // Ignore local storage errors.
  }

  try {
    granted = Boolean(await navigator.storage.persist());
    if (granted) {
      try {
        localStorage.setItem(PERSIST_REQUESTED_KEY, '1');
      } catch (storageError) {
        // Ignore local storage errors.
      }
    }
  } catch (storageError) {
    granted = false;
  }

  if (import.meta.env.DEV || granted === false) {
    console.info('[storage:persist]', {
      phase,
      granted,
      origin: window.location.origin,
      standalone: getStandaloneMode(),
    });
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;

    const revalidateSession = async (phase = 'resume') => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setRestoringSession(false);
        return;
      }

      setRestoringSession(true);

      try {
        await getIdToken(currentUser, false);
        await ensurePersistentStorage(phase);
      } catch (error) {
        console.warn('[auth:revalidate]', phase, error);
        // No hagas logout aquí por un fallo transitorio
      } finally {
        setRestoringSession(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void revalidateSession('foreground');
      }
    };

    const handlePageShow = () => {
      void revalidateSession('pageshow');
    };

    const init = async () => {
      try {
        await authPersistenceReady;
      } catch (error) {
        // Si falla, seguimos igual.
      }

      try {
        await ensurePersistentStorage('boot');
      } catch (storageError) {
        // No es crítico si falla.
      }

      if (cancelled) return;

      unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          void setAnalyticsUserId(firebaseUser.uid);
          void trackSessionReady({
            proveedor: firebaseUser.providerData?.[0]?.providerId || 'unknown',
          });

          setUser({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });

          try {
            await ensurePersistentStorage('postlogin');
          } catch (storageError) {
            // No es crítico si falla.
          }

          const prefRef = doc(db, `users/${firebaseUser.uid}/preferences`, 'display');
          const defaultPreferences = normalizeStoredPreferences(PREFERENCE_DEFAULTS);

          try {
            try {
              const cacheSnap = await getDocFromCache(prefRef);
              if (cacheSnap.exists()) {
                setPreferences(normalizeStoredPreferences(cacheSnap.data()));
              }
            } catch (cacheError) {
              // Ignore cache errors; we'll try the network next.
            }

            const prefSnap = await getDoc(prefRef);
            if (prefSnap.exists()) {
              setPreferences(normalizeStoredPreferences(prefSnap.data()));
            } else {
              setPreferences(defaultPreferences);
            }
          } catch (error) {
            console.error('Failed to load preferences', error);
            setPreferences(defaultPreferences);
          }
        } else {
          void setAnalyticsUserId(null);
          setUser(null);
          setPreferences(null);
        }

        setRestoringSession(false);
        setLoadingAuth(false);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      void trackLogin('email');
    } catch (error) {
      void trackEvent('auth_error', {
        auth_action: 'login',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });

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
      void trackSignUp('email');
      await signOut(auth);
    } catch (error) {
      void trackEvent('auth_error', {
        auth_action: 'register',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });

      toast({ title: 'Error al registrarse', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/auth`,
      });

      void trackEvent('password_reset_request', {
        auth_method: 'email',
      });
    } catch (error) {
      void trackEvent('auth_error', {
        auth_action: 'reset_password',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });

      toast({ title: 'Error al restablecer contraseña', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setPreferences(null);
      setRestoringSession(false);
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
    const currentPreferences = normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS);
    const { normalizedPatch, hasFertilityUpdate } = normalizePreferencePatch(
      prefs,
      currentPreferences
    );

    const payload = { ...normalizedPatch };
    if (hasFertilityUpdate && normalizedPatch.fertilityStartConfig) {
      payload.combineMode = deleteField();
    }

    try {
      await setDoc(prefRef, payload, { merge: true });
      setPreferences((previous) => {
        const current = normalizeStoredPreferences(previous ?? PREFERENCE_DEFAULTS);
        return normalizeStoredPreferences({ ...current, ...normalizedPatch });
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
      setRestoringSession(false);
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
        restoringSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);