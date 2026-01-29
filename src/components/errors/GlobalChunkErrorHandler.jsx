import { useEffect, useState } from 'react';
import RouteErrorFallback from '@/components/errors/RouteErrorFallback';

const chunkErrorRegex = /(dynamically imported|Loading chunk|ChunkLoadError|Failed to fetch)/i;

function GlobalChunkErrorHandler({ children }) {
  const [globalError, setGlobalError] = useState(null);

  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      const message = event?.reason?.message ?? String(event?.reason);
      if (chunkErrorRegex.test(message)) {
        event?.preventDefault?.();
        setGlobalError(
          event?.reason instanceof Error ? event.reason : new Error(message),
        );
      }
    };

    const handleError = (event) => {
      const message = event?.message ?? String(event?.error?.message ?? event?.error ?? '');
      if (chunkErrorRegex.test(message)) {
        event?.preventDefault?.();
        setGlobalError(
          event?.error instanceof Error ? event.error : new Error(message),
        );
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  if (globalError) {
    return (
      <RouteErrorFallback
        error={globalError}
        resetErrorBoundary={() => setGlobalError(null)}
      />
    );
  }

  return children;
}

export default GlobalChunkErrorHandler;