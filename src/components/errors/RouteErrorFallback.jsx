import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppBackground from '@/components/layout/AppBackground';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';

const chunkErrorRegex = /(dynamically imported|Loading chunk|ChunkLoadError|Failed to fetch)/i;

const RouteErrorFallback = ({ error, resetErrorBoundary }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const errorMessage = error?.message ? error.message : String(error);
  const isChunkError = chunkErrorRegex.test(errorMessage);

  const title = isOffline && isChunkError
    ? 'Pantalla no disponible sin conexión'
    : 'No se pudo cargar la pantalla';
  const description = isOffline && isChunkError
    ? 'Esta pantalla no está disponible sin conexión porque no se había cargado antes.'
    : 'Ocurrió un error al cargar esta pantalla. Puedes volver atrás, ir al inicio o reintentar.';

  const handleBack = () => {
    resetErrorBoundary();
    navigate(-1);
  };

  const handleHome = () => {
    resetErrorBoundary();
    navigate('/');
  };

  const content = (
    <div className="flex min-h-app flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-white/85 p-6 shadow-lg backdrop-blur-md">
        <h1 className="text-2xl font-semibold text-fertiliapp-fuerte">{title}</h1>
        <p className="text-sm text-gray-600">{description}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={handleBack}>
            Volver
          </Button>
          <Button type="button" variant="secondary" onClick={handleHome}>
            Ir a inicio
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
        {!isOffline && (
          <details className="text-left text-xs text-gray-500">
            <summary className="cursor-pointer font-medium text-gray-600">Detalles técnicos</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-gray-100 p-3 text-[0.7rem] text-gray-600">
              {errorMessage}
            </pre>
          </details>
        )}
      </div>
    </div>
  );

  if (user) {
    return <MainLayout>{content}</MainLayout>;
  }

  return <AppBackground>{content}</AppBackground>;
};

export default RouteErrorFallback;