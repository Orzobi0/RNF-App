
    import React, { createContext, useState, useContext, useEffect } from 'react';
    import { auth } from '@/lib/firebaseClient';
    import {
      onAuthStateChanged,
      signInWithEmailAndPassword,
      createUserWithEmailAndPassword,
      signOut,
    } from 'firebase/auth';

    const AuthContext = createContext(null);

    export const AuthProvider = ({ children }) => {
      const [user, setUser] = useState(null);
      const [loadingAuth, setLoadingAuth] = useState(true);

      useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          if (firebaseUser) {
            setUser({ id: firebaseUser.uid, email: firebaseUser.email });
          } else {
            setUser(null);
          }
          setLoadingAuth(false);
        });
        return () => unsubscribe();
      }, []);

      const login = async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      };

      const register = async (email, password) => {
await createUserWithEmailAndPassword(auth, email, password);
      };

      const logout = async () => {
await signOut(auth);
        setUser(null);
      };

      return (
        <AuthContext.Provider value={{ user, login, register, logout, loadingAuth }}>
          {children}
        </AuthContext.Provider>
      );
    };

    export const useAuth = () => useContext(AuthContext);
  