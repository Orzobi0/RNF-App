
    import React from 'react';
    import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
    import { AuthProvider, useAuth } from '@/contexts/AuthContext';
    import AuthPage from '@/pages/AuthPage';
    import DashboardPage from '@/pages/DashboardPage';
    import ArchivedCyclesPage from '@/pages/ArchivedCyclesPage';
    import CycleDetailPage from '@/pages/CycleDetailPage';
    import MainLayout from '@/components/layout/MainLayout';
    import { Toaster } from '@/components/ui/toaster';

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
          <div className="min-h-screen bg-gradient-to-br from-purple-950 to-gray-900 flex justify-center items-center">
            <div className="text-white text-xl">Cargando aplicación...</div>
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
        <Router>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </Router>
      );
    }

    export default App;
  