
    import React, { createContext, useState, useContext, useEffect } from 'react';
    import { supabase } from '@/lib/supabaseClient';

    const AuthContext = createContext(null);

    export const AuthProvider = ({ children }) => {
      const [user, setUser] = useState(null);
      const [loadingAuth, setLoadingAuth] = useState(true);

      useEffect(() => {
        const getSession = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          setUser(session?.user ?? null);
          setLoadingAuth(false);
        };

        getSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            setUser(session?.user ?? null);
            setLoadingAuth(false);
          }
        );

        return () => {
          authListener?.subscription.unsubscribe();
        };
      }, []);

      const login = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      };

      const register = async (email, password) => {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password
        });
        if (error) throw error;
      };

      const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setUser(null);
      };

      return (
        <AuthContext.Provider value={{ user, login, register, logout, loadingAuth }}>
          {children}
        </AuthContext.Provider>
      );
    };

    export const useAuth = () => useContext(AuthContext);
  