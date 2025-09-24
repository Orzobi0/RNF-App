import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CycleDataProvider } from '@/contexts/CycleDataContext.jsx';
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ArchivedCyclesPage = lazy(() => import('@/pages/ArchivedCyclesPage'));
const CycleDetailPage = lazy(() => import('@/pages/CycleDetailPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ChartPage = lazy(() => import('@/pages/ChartPage'));
const RecordsPage = lazy(() => import('@/pages/RecordsPage'));
import MainLayout from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/toaster';
import { motion } from 'framer-motion';
import InstallPrompt from '@/components/InstallPrompt';
import UpdateNotification from '@/components/UpdateNotification';

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
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 space-y-4">
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
    <Suspense fallback={<div className="p-4 text-center">Cargando...</div>}>
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
        path="/chart/:cycleId?"
        element={
          <ProtectedRoute>
            <ChartPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/records"
        element={
          <ProtectedRoute>
            <MainLayout><RecordsPage /></MainLayout>
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
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
    <InstallPrompt />
      <UpdateNotification />
      <AuthProvider>
        <CycleDataProvider>
          <AppContent />
        </CycleDataProvider>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;