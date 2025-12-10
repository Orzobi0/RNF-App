import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/dev/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CycleDataProvider } from '@/contexts/CycleDataContext.jsx';
import AppBackground from '@/components/layout/AppBackground';
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
      <AppBackground>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center space-y-4 px-4">
          <motion.div
            className="h-8 w-8 rounded-full bg-pink-500/80"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <motion.p
            className="font-medium text-fertiliapp-fuerte"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Cargando aplicación...
          </motion.p>
        </div>
      </AppBackground>
    );
  }

  const suspenseFallback = user ? (
    <MainLayout>
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-fertiliapp-fuerte">
        Cargando...
      </div>
    </MainLayout>
  ) : (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center space-y-4 px-4">
      <motion.div
        className="h-8 w-8 rounded-full bg-fertiliapp-fuerte/80"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <motion.p
        className="font-medium text-fertiliapp-fuerte"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Cargando aplicación...
      </motion.p>
    </div>
  );

  return (
    <AppBackground>
      <Suspense fallback={suspenseFallback}>
        <Routes>
          <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
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
                <MainLayout>
                  <RecordsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/archived-cycles"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ArchivedCyclesPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cycle/:cycleId"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <CycleDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
        </Routes>
      </Suspense>
    </AppBackground>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UpdateNotification />
      <AuthProvider>
        <CycleDataProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </CycleDataProvider>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;