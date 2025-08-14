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
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

    const AuthContext = createContext(null);

    export const AuthProvider = ({ children }) => {
      const [user, setUser] = useState(null);
      const [loadingAuth, setLoadingAuth] = useState(true);
      const [preferences, setPreferences] = useState(null);

      useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser({ id: firebaseUser.uid, uid: firebaseUser.uid, email: firebaseUser.email });
          const prefRef = doc(db, `users/${firebaseUser.uid}/preferences`, 'display');
          const prefSnap = await getDoc(prefRef);
          if (prefSnap.exists()) {
            setPreferences(prefSnap.data());
          } else {
            setPreferences({ theme: 'light', units: 'metric' });
          }
        } else {
          setUser(null);
          setPreferences(null);
        }
      } catch (error) {
        console.error('Failed to load preferences', error);
        setPreferences({ theme: 'light', units: 'metric' });
      } finally {
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

      const login = async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      };

      const register = async (email, password) => {
        await createUserWithEmailAndPassword(auth, email, password);
      };

      const resetPassword = async (email) => {
        await sendPasswordResetEmail(auth, email);
      };

      const logout = async () => {
        await signOut(auth);
        setUser(null);
        setPreferences(null);
      };

      const updateUserEmail = async (newEmail) => {
        if (!auth.currentUser) return;
        await firebaseUpdateEmail(auth.currentUser, newEmail);
        setUser((prev) => (prev ? { ...prev, email: newEmail } : prev));
      };

      const updateUserPassword = async (newPassword) => {
        if (!auth.currentUser) return;
        await firebaseUpdatePassword(auth.currentUser, newPassword);
      };

  const savePreferences = async (prefs) => {
    if (!auth.currentUser) return;
    const prefRef = doc(db, `users/${auth.currentUser.uid}/preferences`, 'display');
    try {
      await setDoc(prefRef, prefs);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to save preferences', error);
    }
  };

      return (
                <AuthContext.Provider value={{ user, login, register, logout, resetPassword, updateEmail: updateUserEmail, updatePassword: updateUserPassword, preferences, savePreferences, loadingAuth }}>
          {children}
        </AuthContext.Provider>
      );
    };

    export const useAuth = () => useContext(AuthContext);
  