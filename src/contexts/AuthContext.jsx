import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, db } from '@/lib/firebaseClient';
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
        const defaultPreferences = { theme: 'light', units: 'metric', manualCpm: null, manualT8: null };
        try {
          const prefSnap = await getDoc(prefRef);
          if (prefSnap.exists()) {
            setPreferences({ ...defaultPreferences, ...prefSnap.data() });
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
      await createUserWithEmailAndPassword(auth, email, password);
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
const savePreferences = async (prefs) => {
  if (!auth.currentUser) return;
  const prefRef = doc(db, `users/${auth.currentUser.uid}/preferences`, 'display');
  try {
    await setDoc(prefRef, prefs, { merge: true });
    setPreferences((previous) => ({ ...(previous ?? {}), ...prefs }));
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
  
