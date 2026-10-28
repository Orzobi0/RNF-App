import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { auth, db, authPersistenceReady } from '@/lib/firebaseClient';
import {
  onIdTokenChanged,
  beforeAuthStateChanged,
  getIdToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  verifyBeforeUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  deleteUser,
  signInWithCustomToken,
  reload,
} from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, getDocFromCache } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { getAuthErrorMessage } from '@/lib/authErrorMessages';
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
  trackUserActiveDay,
} from '@/lib/analytics';

import { SESSION_RECOVERY_TIMEOUT_MS, withDeadline, createOperationGuard } from '@/lib/sessionRecovery';

const AuthContext = createContext(null);

const mapFirebaseUser = (firebaseUser) => ({
  id: firebaseUser.uid,
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  emailVerified: Boolean(firebaseUser.emailVerified),
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
});

const PERSIST_REQUESTED_KEY = 'rnf_storage_persist_requested_v1';
const getStandaloneMode = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
const SESSION_COOKIE_REFRESH_KEY = 'rnf_session_cookie_refreshed_at_v1';
const SESSION_COOKIE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const LOGOUT_MARKER_KEY = 'rnf_explicit_logout_v1';
// Unknown storage state must not authorize cookie restoration.
const cookieRestoreBlocked = () => {
  try {
    if (localStorage.getItem(LOGOUT_MARKER_KEY)) return true;
    // Readable but non-writable storage cannot reliably preserve a future logout.
    const probe = LOGOUT_MARKER_KEY + ':probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return false;
  } catch { return true; }
};
const markExplicitLogout = () => {
  try { localStorage.setItem(LOGOUT_MARKER_KEY, String(Date.now()) + ':' + Math.random()); } catch { /* Fail closed on restore. */ }
};
const clearExplicitLogout = (expectedMarker) => {
  try {
    if (localStorage.getItem(LOGOUT_MARKER_KEY) === expectedMarker) localStorage.removeItem(LOGOUT_MARKER_KEY);
  } catch { /* Explicit login still works. */ }
};

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
    Promise.resolve(trackEvent(name, payload)).catch(() => {});
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
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, SESSION_RECOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method: 'GET', credentials: 'include', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();

  const [sessionError, setSessionError] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesSynced, setPreferencesSynced] = useState(false);
  const [preferencesError, setPreferencesError] = useState(false);
  const manualLogoutRef = useRef(false);
  const lastAuthedUidRef = useRef(null);
  const operations = useRef(createOperationGuard());
  const controls = useRef({});
  const pendingSignIn = useRef(null);
  const pendingLogout = useRef(null);
  const cookieRefreshTasks = useRef(new Set());
  const explicitLogin = useRef(false);
  const preferenceRevision = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let restoreInProgress = null;
    let restoreAttempted = false;
    let bootstrap = true;
    let validation = null;
    let lastValidation = 0;
    let restoreController;
    let sdkRestoreValid = null;
    let preferenceRun = 0;
    const requests = new Set();
    const background = (work) => { Promise.resolve(work).catch(() => {}); };
    const finish = () => {
      if (cancelled) return;
      bootstrap = false;
      setLoadingAuth(false);
      setRestoringSession(false);
    };
    const invalidate = () => {
      operations.current.invalidate();
      restoreController?.abort();
      requests.forEach(controller => controller.abort());
    };
    const refreshBackendSession = async (firebaseUser, phase) => {
      const valid = operations.current.capture();
      const explicitCookieLogin = explicitLogin.current;
      let logoutMarkerAtStart;
      try { logoutMarkerAtStart = localStorage.getItem(LOGOUT_MARKER_KEY); } catch {}
      if (!shouldRefreshSessionCookie()) return;
      const controller = new AbortController();
      requests.add(controller);
      try {
        const idToken = await withDeadline(getIdToken(firebaseUser, false));
        if (!valid() || cancelled || auth.currentUser !== firebaseUser || manualLogoutRef.current) return;
        await callSessionApi('/api/sessionLogin', {
          method: 'POST', body: JSON.stringify({ idToken }), signal: controller.signal,
        });
        if (valid() && !cancelled && auth.currentUser === firebaseUser && !manualLogoutRef.current) {
          markSessionCookieRefreshed();
          if (explicitCookieLogin) clearExplicitLogout(logoutMarkerAtStart);
        }
        safeTrack('auth_backend_session', { fase: phase, resultado: 'ok' });
      } catch {
        safeTrack('auth_backend_session', { fase: phase, resultado: 'error' });
      } finally { requests.delete(controller); }
    };
    const loadPreferences = async (firebaseUser) => {
      const run = ++preferenceRun;
      const revision = preferenceRevision.current;
      const valid = () => !cancelled && run === preferenceRun &&
        auth.currentUser === firebaseUser && revision === preferenceRevision.current;
      const prefRef = doc(db, 'users/' + firebaseUser.uid + '/preferences', 'display');
      let cached = false;
      setPreferencesError(false);
      try {
        const snap = await withDeadline(getDocFromCache(prefRef));
        if (!valid()) return;
        if (snap.exists()) {
          cached = true;
          setPreferences(normalizeStoredPreferences(snap.data()));
          setPreferencesReady(true);
        }
      } catch { /* Cache is optional, including restricted storage. */ }
      if (!valid()) return;
      try {
        const snap = await withDeadline(getDoc(prefRef));
        if (!valid()) return;
        if (!snap.exists() && snap.metadata?.fromCache) throw new Error('preferences-offline');
        setPreferencesSynced(!snap.metadata?.fromCache);
        setPreferences(normalizeStoredPreferences(snap.exists() ? snap.data() : PREFERENCE_DEFAULTS));
        setPreferencesReady(true);
      } catch {
        if (valid()) setPreferencesError(!cached);
      }
    };
    const restoreFromBackendSession = (phase = 'boot') => {
      if (cookieRestoreBlocked()) { finish(); return Promise.resolve(); }
      if (restoreInProgress) return restoreInProgress;
      if (cancelled || manualLogoutRef.current || restoreAttempted || auth.currentUser) return Promise.resolve();
      restoreAttempted = true;
      const valid = operations.current.capture();
      restoreController = new AbortController();
      setSessionError(false);
      setRestoringSession(true);
      const restoreTimer = setTimeout(() => {
        if (!valid() || cancelled || auth.currentUser) return;
        invalidate();
        setSessionError(true);
        finish();
      }, SESSION_RECOVERY_TIMEOUT_MS);
      restoreInProgress = (async () => {
        try {
          const payload = await callSessionApi('/api/sessionRestore', { signal: restoreController.signal });
          if (!valid() || cancelled || manualLogoutRef.current || auth.currentUser) return;
          if (!payload?.customToken) throw new Error('invalid-payload');
          sdkRestoreValid = () => valid() && !cancelled && !manualLogoutRef.current;
          const task = signInWithCustomToken(auth, payload.customToken);
          pendingSignIn.current = task;
          task.finally(() => {
            if (pendingSignIn.current === task) pendingSignIn.current = null;
            sdkRestoreValid = null;
          }).catch(() => {});
          await withDeadline(task);
          safeTrack('auth_session_restore', { fase: phase, resultado: 'ok' });
        } catch (error) {
          if (!valid() || cancelled) return;
          operations.current.invalidate();
          restoreController.abort();
          setSessionError(Number(error?.status) !== 401 && !auth.currentUser);
          safeTrack('auth_session_restore', { fase: phase, resultado: error?.status === 401 ? 'restore_401' : 'restore_error' });
        } finally {
          clearTimeout(restoreTimer);
          restoreInProgress = null;
          if (!cancelled) finish();
        }
      })();
      return restoreInProgress;
    };
    // Veto an obsolete SDK sign-in BEFORE Firebase installs its user.
    const stopBefore = beforeAuthStateChanged(auth, (nextUser) => {
      if (nextUser && manualLogoutRef.current && explicitLogin.current) throw new Error('explicit-logout');
      if (nextUser && sdkRestoreValid && !sdkRestoreValid()) throw new Error('stale-session-restore');
    });
    const revalidateSession = () => {
      if (cancelled || bootstrap || manualLogoutRef.current || validation || Date.now() - lastValidation < 1500) return;
      lastValidation = Date.now();
      const current = auth.currentUser;
      if (!current) return;
      validation = withDeadline(getIdToken(current, false))
        .then(() => {
          safeTrack('auth_revalidate_result', { fase: 'resume', resultado: 'token_ok' });
          background(ensurePersistentStorage('resume'));
        }).catch(() => {
          safeTrack('auth_revalidate_result', { fase: 'resume', resultado: 'token_error' });
        }).finally(() => { validation = null; });
    };
    const retry = async () => {
      if (pendingSignIn.current || restoreInProgress) return;
      invalidate();
      restoreAttempted = false;
      if (auth.currentUser) { finish(); setSessionError(false); return; }
      await restoreFromBackendSession('retry');
    };
    controls.current = {
      invalidate, retry,
      loginScreen: () => { invalidate(); restoreAttempted = true; setSessionError(false); finish(); },
      retryPreferences: () => auth.currentUser && background(loadPreferences(auth.currentUser)),
    };
    const initialTimer = setTimeout(() => {
      if (!bootstrap || cancelled) return;
      invalidate();
      restoreAttempted = true;
      if (!auth.currentUser) setSessionError(true);
      finish();
    }, SESSION_RECOVERY_TIMEOUT_MS);
    const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
      if (cancelled || firebaseUser !== auth.currentUser) return;
      if (firebaseUser) {
        // A fast reopen may still hydrate Firebase before local signOut persisted.
        // Only a confirmed persistent marker (not unavailable storage) revokes that user.
        let loggedOut = false;
        try { loggedOut = Boolean(localStorage.getItem(LOGOUT_MARKER_KEY)); } catch {}
        if (loggedOut && !explicitLogin.current) {
          manualLogoutRef.current = true;
          invalidate();
          setUser(null);
          finish();
          background(withDeadline(signOut(auth)));
          return;
        }
        const changed = lastAuthedUidRef.current !== firebaseUser.uid;
        lastAuthedUidRef.current = firebaseUser.uid;
        setUser(mapFirebaseUser(firebaseUser));
        setSessionError(false);
        finish();
        if (changed) {
          invalidate();
          preferenceRevision.current += 1;
          setPreferences(null);
          setPreferencesReady(false);
          setPreferencesSynced(false);
          background(loadPreferences(firebaseUser));
          background(setAnalyticsUserId(firebaseUser.uid));
          background(trackUserActiveDay({ userId: firebaseUser.uid, proveedor: firebaseUser.providerData?.[0]?.providerId || 'unknown' }));
          background(ensurePersistentStorage('postlogin'));
          const refresh = refreshBackendSession(firebaseUser, 'user_present');
          cookieRefreshTasks.current.add(refresh);
          refresh.finally(() => cookieRefreshTasks.current.delete(refresh)).catch(() => {});
          background(refresh);
        }
      } else {
        if (lastAuthedUidRef.current) {
          invalidate();
          restoreAttempted = false;
          safeTrack('auth_user_to_null', { fase: manualLogoutRef.current ? 'logout' : 'unexpected_null' });
        }
        lastAuthedUidRef.current = null;
        preferenceRun += 1;
        setUser(null);
        setPreferences(null);
        setPreferencesReady(false);
        setPreferencesSynced(false);
        background(setAnalyticsUserId(null));
        if (manualLogoutRef.current) finish();
        else background(restoreFromBackendSession(bootstrap ? 'boot' : 'unexpected_null'));
      }
    });
    const visible = () => { if (document.visibilityState === 'visible') revalidateSession(); };
    const online = () => {
      if (auth.currentUser) {
        revalidateSession();
        background(loadPreferences(auth.currentUser));
      } else if (!manualLogoutRef.current) background(retry());
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', revalidateSession);
    window.addEventListener('online', online);
    background(ensurePersistentStorage('boot'));
    background(getPersistedStorageStatus().then(status => safeTrack('auth_storage_status', { storage_persisted: status })));
    return () => {
      cancelled = true;
      mounted.current = false;
      invalidate();
      clearTimeout(initialTimer);
      unsubscribe();
      if (pendingSignIn.current) pendingSignIn.current.finally(stopBefore).catch(() => {});
      else stopBefore();
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', revalidateSession);
      window.removeEventListener('online', online);
    };
  }, []);

  const login = async (email, password) => {
    try {
      if (pendingLogout.current) await pendingLogout.current;
      controls.current.invalidate?.();
      if (pendingSignIn.current) await withDeadline(pendingSignIn.current.catch(() => {}));
      await withDeadline(authPersistenceReady);
      manualLogoutRef.current = false;
      clearSessionCookieRefreshMark();
      explicitLogin.current = true;
      await signInWithEmailAndPassword(auth, email, password);
      explicitLogin.current = false;
      void trackLogin('email');
    } catch (error) {
      explicitLogin.current = false;
      void trackEvent('auth_error', {
        auth_action: 'login',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });

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
      manualLogoutRef.current = true;
      controls.current.invalidate?.();
      await signOut(auth);
    } catch (error) {
      void trackEvent('auth_error', {
        auth_action: 'register',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });

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

      throw error;
    }
  };

  const refreshCurrentUser = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUser(null);
      return null;
    }

    await reload(currentUser);
    if (!mounted.current || auth.currentUser !== currentUser) return null;
    const nextUser = mapFirebaseUser(currentUser);
    setUser(nextUser);
    return nextUser;
  };

  const resendVerificationEmail = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const error = new Error('auth/no-current-user');
      error.code = 'auth/no-current-user';
      throw error;
    }

    try {
      await reload(currentUser);
      if (!mounted.current || auth.currentUser !== currentUser) return null;
      const nextUser = mapFirebaseUser(currentUser);
      setUser(nextUser);

      if (currentUser.emailVerified) {
        return { ok: true, alreadyVerified: true };
      }

      await sendEmailVerification(currentUser, {
        url: `${window.location.origin}/auth`,
      });

      return { ok: true };
    } catch (error) {
      void trackEvent('auth_error', {
        auth_action: 'resend_verification_email',
        auth_method: 'email',
        error_code: String(error?.code || 'unknown').slice(0, 50),
      });
      throw error;
    }
  };

  const logout = () => {
    if (pendingLogout.current) return pendingLogout.current;
    // Synchronous, before either network or SDK work: survives immediate closing.
    markExplicitLogout();
    manualLogoutRef.current = true;
    controls.current.invalidate?.();
    const task = (async () => {
      try {
        await withDeadline(signOut(auth));
        clearSessionCookieRefreshMark();
        if (mounted.current && !auth.currentUser) {
          setUser(null);
          setPreferences(null);
          setRestoringSession(false);
          setLoadingAuth(false);
          setSessionError(false);
        }
        const controller = new AbortController();
        try {
          await withDeadline((async () => {
            // Drain cancelled refreshes before issuing the cookie deletion.
            await Promise.allSettled([...cookieRefreshTasks.current]);
            if (controller.signal.aborted) throw new Error('logout-timeout');
            await callSessionApi('/api/sessionLogout', { method: 'POST', signal: controller.signal });
          })());
          return { backendCleared: true };
        } catch {
          if (mounted.current) toast({
            title: 'Sesión cerrada en este dispositivo',
            description: 'No se pudo confirmar la limpieza de la sesión del servidor. El acceso automático seguirá desactivado.',
          });
          return { backendCleared: false };
        } finally { controller.abort(); }
      } catch (error) {
        if (mounted.current) toast({
          title: 'Error al cerrar sesión',
          description: getAuthErrorMessage(error, 'No se pudo cerrar sesión. Inténtalo de nuevo.'),
          variant: 'destructive',
        });
        throw error;
      }
    })();
    pendingLogout.current = task;
    task.finally(() => { if (pendingLogout.current === task) pendingLogout.current = null; }).catch(() => {});
    return task;
  };

  const updateUserEmail = async (newEmail) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const error = new Error('auth/no-current-user');
      error.code = 'auth/no-current-user';
      throw error;
    }

    const normalizedEmail = String(newEmail || '').trim();
    if (!normalizedEmail) {
      const error = new Error('auth/invalid-email');
      error.code = 'auth/invalid-email';
      throw error;
    }

    if (normalizedEmail === currentUser.email) {
      return { ok: true, unchanged: true };
    }

    await verifyBeforeUpdateEmail(currentUser, normalizedEmail, {
      url: `${window.location.origin}/settings`,
    });

    return { ok: true, verificationSent: true };
  };

  const updateUserPassword = async (newPassword) => {
    if (!auth.currentUser) return;
    try {
      await firebaseUpdatePassword(auth.currentUser, newPassword);
    } catch (error) {
      throw error;
    }
  };

  const savePreferences = async (prefs = {}, { silent = false } = {}) => {
    if (!auth.currentUser) return;
    if (!preferencesReady) throw new Error('Las preferencias todavía no están disponibles. Reintenta su carga.');
    const savingUser = auth.currentUser;
    preferenceRevision.current += 1;
    const prefRef = doc(db, 'users/' + savingUser.uid + '/preferences', 'display');
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
      if (!mounted.current || auth.currentUser !== savingUser) return;
      setPreferences((previous) => {
        const current = normalizeStoredPreferences(previous ?? PREFERENCE_DEFAULTS);
        return normalizeStoredPreferences({ ...current, ...normalizedPatch });
      });
    } catch (error) {
      console.error('Failed to save preferences', error);
      if (!silent) toast({
        title: 'Error al guardar preferencias',
        description: 'No se pudieron guardar las preferencias. Inténtalo de nuevo.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateProfileInfo = async (profile) => {
    if (!auth.currentUser) return;
    try {
      await updateProfile(auth.currentUser, profile);
      setUser((prev) => (prev ? { ...prev, ...profile } : prev));
    } catch (error) {
      toast({
        title: 'Error al actualizar perfil',
        description: getAuthErrorMessage(error, 'No se pudo actualizar el perfil. Inténtalo de nuevo.'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteAccount = async () => {
    if (!auth.currentUser) return;
    try {
      manualLogoutRef.current = true;
      controls.current.invalidate?.();
      await deleteUser(auth.currentUser);
      setUser(null);
      setPreferences(null);
      setRestoringSession(false);
    } catch (error) {
      toast({
        title: 'Error al eliminar cuenta',
        description: getAuthErrorMessage(error, 'No se pudo eliminar la cuenta. Inténtalo de nuevo.'),
        variant: 'destructive',
      });
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
        refreshCurrentUser,
        resendVerificationEmail,
        updateEmail: updateUserEmail,
        updatePassword: updateUserPassword,
        preferences,
        savePreferences,
        updateProfile: updateProfileInfo,
        deleteAccount,
        loadingAuth,
        restoringSession,
        sessionError,
        retrySession: () => controls.current.retry?.(),
        goToLogin: () => controls.current.loginScreen?.(),
        preferencesReady,
        preferencesSynced,
        preferencesError,
        retryPreferences: () => controls.current.retryPreferences?.(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
