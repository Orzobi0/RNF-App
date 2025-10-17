import React from 'react';
import BottomNav from './BottomNav';
import { useCycleDataContext } from '@/contexts/CycleDataContext.jsx';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const { pendingOperations } = useCycleDataContext();
  const hasPendingSync = Array.isArray(pendingOperations) && pendingOperations.length > 0;

  const mainClass = hideBottomNav
    ? 'flex-grow w-full pt-0 min-h-[100dvh]'
    : 'flex-grow w-full pt-0 pb-[var(--bottom-nav-safe)] min-h-[calc(100dvh-var(--bottom-nav-safe))]';
  return (
    <div className="min-h-[100dvh] flex flex-col">
      {hasPendingSync && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center px-4 py-2">
          Cambios pendientes de sincronizar. Se enviarán automáticamente al recuperar la conexión.
        </div>
      )}
      <main className={mainClass}>
        {children}
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
