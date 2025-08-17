import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import ArchivedCyclesPage from '@/pages/ArchivedCyclesPage';
import CycleDetailPage from '@/pages/CycleDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import MainLayout from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/toaster';
import { motion } from 'framer-motion';

    function ProtectedRoute({ children }) {
      const { user } = useAuth();
      if (!user) {
        return <Navigate to="/auth" replace />;
      }
      return children;
    }

    function AppContent() {
      const { user, loadingAuth } = useAuth();

      if (loadingAuth) {
        return (
                    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 space-y-4">
            <motion.div
              className="w-8 h-8 rounded-full bg-pink-500/80"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <motion.p
              className="text-pink-600 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Cargando aplicación...
            </motion.p>
          </div>
        );
      }

      return (
        <Routes>
          <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <MainLayout><DashboardPage /></MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route
            path="/archived-cycles"
            element={
              <ProtectedRoute>
                <MainLayout><ArchivedCyclesPage /></MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout><SettingsPage /></MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cycle/:cycleId"
            element={
              <ProtectedRoute>
                <MainLayout><CycleDetailPage /></MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
        </Routes>
      );
    }

    function App() {
      return (
        <BrowserRouter>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      );
    }

    export default App;
  