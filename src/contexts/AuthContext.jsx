import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
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
  signInWithCustomToken,
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
const SESSION_COOKIE_REFRESH_KEY = 'rnf_session_cookie_refreshed_at_v1';
const SESSION_COOKIE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const shouldRefreshSessionCookie = () => {
  try {
    const raw = localStorage.getItem(SESSION_COOKIE_REFRESH_KEY);
    if (!raw) return true;

    const lastRefresh = Number(raw);
    if (!Number.isFinite(lastRefresh)) return true;

    return Date.now() - lastRefresh > SESSION_COOKIE_REFRESH_INTERVAL_MS;
  } catch (error) {
    return true;
  }
};

const markSessionCookieRefreshed = () => {
  try {
    localStorage.setItem(SESSION_COOKIE_REFRESH_KEY, String(Date.now()));
  } catch (error) {
    // Ignore storage errors.
  }
};

const clearSessionCookieRefreshMark = () => {
  try {
    localStorage.removeItem(SESSION_COOKIE_REFRESH_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
};

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

const safeTrack = (name, payload = {}) => {
  try {
    void trackEvent(name, payload);
  } catch (error) {
    // Ignore analytics runtime errors.
  }
};

const getPersistedStorageStatus = async () => {
  if (typeof navigator === 'undefined' || !navigator?.storage?.persisted) {
    return 'unsupported';
  }

  try {
    const persisted = await navigator.storage.persisted();
    return persisted ? 'persisted' : 'not_persisted';
  } catch (error) {
    return 'error';
  }
};

const callSessionApi = async (path, options = {}) => {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const apiError = new Error(payload?.code || `http_${response.status}`);
    apiError.status = response.status;
    apiError.payload = payload;
    throw apiError;
  }

  return payload;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();

  const bootstrapPhaseRef = useRef(true);
  const restoreAttemptedRef = useRef(false);
  const manualLogoutRef = useRef(false);
  const restoreInProgressRef = useRef(false);
  const lastAuthedUidRef = useRef(null);
  const lastActivityAtRef = useRef(Date.now());

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;

    const refreshBackendSession = async (
  firebaseUser,
  phase = 'postlogin',
  { force = false } = {}
) => {
  if (!firebaseUser) return;
  if (!force && !shouldRefreshSessionCookie()) return;

  try {
    const idToken = await getIdToken(firebaseUser, true);
    await callSessionApi('/api/sessionLogin', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });

    markSessionCookieRefreshed();

    safeTrack('auth_backend_session', { fase: phase, resultado: 'ok' });
  } catch (error) {
    console.warn('[auth:sessionLogin]', phase, error);
    safeTrack('auth_backend_session', {
      fase: phase,
      resultado: 'error',
      codigo_error: String(error?.payload?.code || error?.message || 'unknown').slice(0, 80),
    });
  }
};

    const restoreFromBackendSession = async (phase = 'boot') => {
      if (restoreInProgressRef.current || restoreAttemptedRef.current || manualLogoutRef.current) {
        return { restored: false, reason: 'skipped' };
      }

      restoreAttemptedRef.current = true;
      restoreInProgressRef.current = true;
      setRestoringSession(true);

      const contextPayload = {
        fase: phase,
        standalone: getStandaloneMode() ? 'yes' : 'no',
        visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        inactivity_ms: Math.max(0, Date.now() - lastActivityAtRef.current),
        storage_persisted: await getPersistedStorageStatus(),
      };

      try {
        const payload = await callSessionApi('/api/sessionRestore', { method: 'GET' });
        if (!payload?.customToken) {
          safeTrack('auth_session_restore', {
            ...contextPayload,
            backend_cookie: 'present_but_invalid',
            resultado: 'invalid_payload',
          });
          return { restored: false, reason: 'invalid_payload' };
        }

        await signInWithCustomToken(auth, payload.customToken);

        if (auth.currentUser) {
          await refreshBackendSession(auth.currentUser, 'restore_refresh_cookie');
        }

        safeTrack('auth_session_restore', {
          ...contextPayload,
          backend_cookie: 'present',
          resultado: 'ok',
        });
        return { restored: true, reason: 'ok' };
      } catch (error) {
        const isUnauthorized = Number(error?.status) === 401;

        safeTrack('auth_session_restore', {
          ...contextPayload,
          backend_cookie: isUnauthorized ? 'missing_or_invalid' : 'unknown',
          resultado: isUnauthorized ? 'restore_401' : 'restore_error',
          codigo_error: String(error?.payload?.code || error?.message || 'unknown').slice(0, 80),
        });

        return { restored: false, reason: isUnauthorized ? 'restore_401' : 'restore_error' };
      } finally {
        restoreInProgressRef.current = false;
        setRestoringSession(false);
      }
    };

    const revalidateSession = async (phase = 'resume') => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        const result = await restoreFromBackendSession(phase);
        safeTrack('auth_revalidate_result', {
          fase: phase,
          resultado: result.restored ? 'restore_ok' : result.reason,
          tipo: 'no_user',
        });
        return;
      }

      setRestoringSession(true);

      try {
        await getIdToken(currentUser, false);
        await ensurePersistentStorage(phase);
        safeTrack('auth_revalidate_result', {
          fase: phase,
          resultado: 'token_ok',
          tipo: 'user_present',
        });
      } catch (error) {
        const errorCode = String(error?.code || error?.message || 'unknown');
        safeTrack('auth_revalidate_result', {
          fase: phase,
          resultado: errorCode.includes('network') ? 'network_error' : 'token_error',
          tipo: 'user_present',
          codigo_error: errorCode.slice(0, 80),
        });
        console.warn('[auth:revalidate]', phase, error);
      } finally {
        setRestoringSession(false);
      }
    };

    const handleActivity = () => {
      lastActivityAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityAtRef.current = Date.now();
        void revalidateSession('foreground');
      }
    };

    const handlePageShow = () => {
      lastActivityAtRef.current = Date.now();
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
        const previousUid = lastAuthedUidRef.current;

        if (firebaseUser) {
          manualLogoutRef.current = false;
          restoreAttemptedRef.current = false;
          lastAuthedUidRef.current = firebaseUser.uid;

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
          void refreshBackendSession(
  firebaseUser,
  bootstrapPhaseRef.current ? 'boot_user_present' : 'user_present'
);

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
          const phase = bootstrapPhaseRef.current ? 'boot' : manualLogoutRef.current ? 'logout' : 'unexpected_null';

          void setAnalyticsUserId(null);
          setUser(null);
          setPreferences(null);
          lastAuthedUidRef.current = null;

          if (previousUid && phase !== 'logout') {
            const persistedStatus = await getPersistedStorageStatus();
            safeTrack('auth_user_to_null', {
              fase: phase,
              standalone: getStandaloneMode() ? 'yes' : 'no',
              visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
              inactivity_ms: Math.max(0, Date.now() - lastActivityAtRef.current),
              storage_persisted: persistedStatus,
            });
          }

          if (phase === 'boot' || phase === 'unexpected_null') {
  const restoreResult = await restoreFromBackendSession(phase);

  if (restoreResult.restored) {
    return;
  }
}
        }

        bootstrapPhaseRef.current = false;
        setRestoringSession(false);
        setLoadingAuth(false);
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleActivity);
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);

    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const login = async (email, password) => {
    try {
      await authPersistenceReady;
      const credentials = await signInWithEmailAndPassword(auth, email, password);
      try {
  const idToken = await getIdToken(credentials.user, true);
  await callSessionApi('/api/sessionLogin', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });

  markSessionCookieRefreshed();
} catch (error) {
  console.warn('[auth:sessionLogin] login', error);
  safeTrack('auth_backend_session', {
    fase: 'login',
    resultado: 'error',
    codigo_error: String(error?.payload?.code || error?.message || 'unknown').slice(0, 80),
  });
}

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
    manualLogoutRef.current = true;
    restoreAttemptedRef.current = true;

    try {
  await callSessionApi('/api/sessionLogout', { method: 'POST' });
  await signOut(auth);

  clearSessionCookieRefreshMark();

  setUser(null);
  setPreferences(null);
  setRestoringSession(false);
} catch (error) {
  manualLogoutRef.current = false;
  restoreAttemptedRef.current = false;
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