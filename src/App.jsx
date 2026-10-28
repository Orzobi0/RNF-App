import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/dev/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CycleDataProvider } from '@/contexts/CycleDataContext.jsx';
import { WhatsNewProvider } from '@/contexts/WhatsNewContext.jsx';
import AppBackground from '@/components/layout/AppBackground';
import RouteErrorBoundary from '@/components/errors/RouteErrorBoundary';
import RouteErrorFallback from '@/components/errors/RouteErrorFallback';
import GlobalChunkErrorHandler from '@/components/errors/GlobalChunkErrorHandler';
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AuthActionPage = lazy(() => import('@/pages/AuthActionPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ArchivedCyclesPage = lazy(() => import('@/pages/ArchivedCyclesPage'));
const CycleDetailPage = lazy(() => import('@/pages/CycleDetailPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const PreferencesPage = lazy(() => import('@/pages/PreferencesPage'));
const ContactSupportPage = lazy(() => import('@/pages/ContactSupportPage'));
const ChartPage = lazy(() => import('@/pages/ChartPage'));
const RecordsPage = lazy(() => import('@/pages/RecordsPage'));
import MainLayout from '@/components/layout/MainLayout';
import { Toaster } from '@/components/ui/toaster';
import { motion } from 'framer-motion';
import UpdateNotification from '@/components/UpdateNotification';
import WhatsNewModal from '@/components/WhatsNewModal';
import ViewportHeightFix from "@/components/ViewportHeightFix";

function ProtectedRoute({ children }) {
  const { user, loadingAuth, restoringSession } = useAuth();

  if (loadingAuth || restoringSession) {
    return (
      <AppBackground>
        <div className="flex min-h-app flex-col items-center justify-center space-y-4 px-4">
          <motion.div
            className="h-8 w-8 rounded-full bg-fertiliapp"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <motion.p className="font-medium text-fertiliapp-fuerte">
            Recuperando sesión...
          </motion.p>
        </div>
      </AppBackground>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

function PreferencesGate({ children, withLayout = false }) {
  const { preferencesReady, preferencesError, retryPreferences } = useAuth();
  if (preferencesReady) return children;
  const content = (
      <div className="mx-auto max-w-md p-6 text-center text-fertiliapp-fuerte" role="status">
        <p>{preferencesError ? 'No hemos podido cargar tus preferencias.' : 'Cargando tus preferencias...'}</p>
        <p className="mt-2 text-sm">Esperamos a tus ajustes para mostrar la interpretación correctamente.</p>
        {preferencesError && <button className="mt-4 rounded-xl bg-white px-5 py-3" onClick={retryPreferences}>Reintentar</button>}
      </div>
  );
  return withLayout ? <MainLayout>{content}</MainLayout> : content;
}

function ServiceWorkerRouteUpdater() {
  const location = useLocation();
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const now = Date.now();

    // Evita comprobar en exceso si la usuaria navega rápido
    if (now - lastCheckRef.current < 20000) return;
    lastCheckRef.current = now;

    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;

        await registration.update();

        // Si ya hay una versión esperando, la activamos
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      } catch {
        // ignore
      }
    };

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  return null;
}

function AppContent() {
  const { user, loadingAuth, restoringSession, sessionError, retrySession, goToLogin } = useAuth();
  const location = useLocation();

  if (loadingAuth || restoringSession) {
    return (
      <AppBackground>
        <div className="flex min-h-app flex-col items-center justify-center space-y-4 px-4">
          <motion.div
            className="h-8 w-8 rounded-full bg-fertiliapp"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <motion.p
            className="font-medium text-fertiliapp-fuerte"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Recuperando sesión...
          </motion.p>
        </div>
      </AppBackground>
    );
  }

  if (sessionError && !user) {
    return (
      <AppBackground>
        <div className="flex min-h-app items-center justify-center px-5">
          <div className="max-w-sm space-y-4 text-center text-fertiliapp-fuerte" role="alert">
            <h1 className="text-xl font-semibold">No hemos podido recuperar tu sesión</h1>
            <p>Puede deberse a la conexión o a un error temporal. Vuelve a intentarlo.</p>
            <button className="w-full rounded-xl bg-white px-5 py-3 font-medium" onClick={retrySession}>Reintentar</button>
            <button className="w-full px-5 py-3 underline" onClick={goToLogin}>Ir a inicio de sesión</button>
          </div>
        </div>
      </AppBackground>
    );
  }

  const suspenseFallback = user ? (
    <MainLayout>
      <div className="flex min-h-app items-center justify-center p-4 text-fertiliapp-fuerte">
        Cargando...
      </div>
    </MainLayout>
  ) : (
    <div className="flex min-h-app flex-col items-center justify-center space-y-4 px-4">
      <motion.div
        className="h-8 w-8 rounded-full bg-fertiliapp"
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
const routeErrorBoundaryKey = location.pathname.startsWith('/cycle/')
  ? '/cycle'
  : location.pathname.startsWith('/chart/')
  ? '/chart'
  : location.pathname;
  return (
    <AppBackground>
      <WhatsNewModal />
      <Suspense fallback={suspenseFallback}>
        <GlobalChunkErrorHandler>
          <RouteErrorBoundary key={routeErrorBoundaryKey} FallbackComponent={RouteErrorFallback}>
            <Routes>
              <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
              <Route path="/auth/action" element={<AuthActionPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <PreferencesGate><DashboardPage /></PreferencesGate>
                    </MainLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chart/:cycleId?"
                element={
                  <ProtectedRoute>
                    <PreferencesGate withLayout><ChartPage /></PreferencesGate>
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
                path="/settings/preferences"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <PreferencesGate><PreferencesPage /></PreferencesGate>
                    </MainLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/support"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ContactSupportPage />
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
          </RouteErrorBoundary>
        </GlobalChunkErrorHandler>
      </Suspense>
    </AppBackground>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ViewportHeightFix />
      <ServiceWorkerRouteUpdater />
      <UpdateNotification />
      <AuthProvider>
        <WhatsNewProvider>
          <CycleDataProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </CycleDataProvider>
        </WhatsNewProvider>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}


export default App;
