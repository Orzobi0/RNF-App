import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, authPersistenceReady, db } from '@/lib/firebaseClient';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(null);

const isNavigatorOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [preferences, setPreferences] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    let unsubscribe = null;
    let isMounted = true;

    authPersistenceReady
      .then(() => {
        if (!isMounted) {
          return;
        }

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (!isMounted) {
            return;
          }

          if (firebaseUser) {
            setUser({
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL
            });
            const prefRef = doc(db, `users/${firebaseUser.uid}/preferences`, 'display');
            try {
              const prefSnap = await getDoc(prefRef);
              if (prefSnap.exists()) {
                setPreferences(prefSnap.data());
              } else {
                setPreferences({ theme: 'light', units: 'metric' });
              }
            } catch (error) {
              console.error('Failed to load preferences', error);
              setPreferences({ theme: 'light', units: 'metric' });
            }
          } else {
            setUser(null);
            setPreferences(null);
          }

          setLoadingAuth(false);
        });
      })
      .catch((error) => {
        console.error('Failed to initialize auth persistence listener.', error);
        if (isMounted) {
          setLoadingAuth(false);
        }
      });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
        };
  }, []);

  const login = async (email, password) => {
    await authPersistenceReady;

    if (!isNavigatorOnline()) {
      const offlineError = new Error('Sin conexión a internet.');
      offlineError.code = 'network-offline';
      throw offlineError;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error?.code === 'auth/network-request-failed') {
        const offlineError = new Error(error.message ?? 'Sin conexión a internet.');
        offlineError.code = 'network-offline';
        throw offlineError;
      }

      throw error;
    }
  };

  const register = async (email, password) => {
    await authPersistenceReady;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      toast({ title: 'Error al registrarse', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const resetPassword = async (email) => {
    await authPersistenceReady;
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      toast({ title: 'Error al restablecer contraseña', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const logout = async () => {
    await authPersistenceReady;
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
  const savePreferences = async (prefs) => {
    if (!auth.currentUser) return;
    const prefRef = doc(db, `users/${auth.currentUser.uid}/preferences`, 'display');
    try {
      await setDoc(prefRef, prefs);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to save preferences', error);
      toast({ title: 'Error al guardar preferencias', description: error.message, variant: 'destructive' });
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
        loadingAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
  
