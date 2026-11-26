import { Capacitor } from '@capacitor/core';
import React, { useEffect } from 'react';
import BottomNav from './BottomNav';
import { isStaging } from '@/lib/firebaseClient';
import { useCycleDataContext } from '@/contexts/CycleDataContext';
import { useLocation } from 'react-router-dom';

const CycleAvailability = ({ children }) => {
  const { dataAvailability: state, refreshData } = useCycleDataContext();
  const { pathname } = useLocation();
  // Account controls and native pending readings must remain accessible.
  const needsCycles = !pathname.startsWith('/settings');
  if (!state || state.phase === 'ready') return children;
  const loading = state.phase === 'loading' || state.phase === 'refreshing';
  const message = state.hasData
    ? `${state.knownOffline ? 'Sin conexión. ' : state.phase === 'cached' ? 'No se pudo actualizar desde Firebase. ' : ''}Datos almacenados; podrían no estar actualizados.`
    : loading ? 'Cargando los datos de tu cuenta...'
      : state.knownOffline ? 'Sin conexión y sin datos de ciclos disponibles en este dispositivo.'
        : 'No hemos podido consultar Firebase y no hay datos de ciclos disponibles en este dispositivo.';
  return <>
    <div role="status" className="mx-auto max-w-xl px-4 py-2 text-center text-sm text-fertiliapp-fuerte">
      <p>{message}</p>
      {!loading && <button type="button" onClick={() => { void refreshData(); }}
        className="mt-1 min-h-11 rounded-xl px-4 underline">Reintentar</button>}
    </div>
    {(state.hasData || !needsCycles) && children}
  </>;
};

const STATUS_BAR_COLORS = {
  default: '#FFE4E6',
};

const updateThemeColor = (color) => {
  if (typeof document === 'undefined') return;

  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(themeColor);
  }

  themeColor.setAttribute('content', color);
};

const updateNativeStatusBar = (color, darkIcons) => {
  if (typeof window === 'undefined') return;

  window.FertiliAppStatusBar?.setColor?.(color, darkIcons);
};

const MainLayout = ({ children, hideBottomNav = false }) => {
  const statusBarColor = STATUS_BAR_COLORS.default;
  const isAndroidNative =
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android';

  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-hidden'
    : 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--bottom-nav-safe)]';

  useEffect(() => {
    updateThemeColor(statusBarColor);
    updateNativeStatusBar(statusBarColor, true);
  }, [statusBarColor]);

  useEffect(() => {
    return () => {
      updateThemeColor(STATUS_BAR_COLORS.default);
      updateNativeStatusBar(STATUS_BAR_COLORS.default, true);
    };
  }, []);

  return (
    <div className="relative flex min-h-app flex-col overflow-hidden">
      {isStaging && (
        <div className="relative z-30 shrink-0 bg-amber-100 px-3 py-1 text-center text-xs font-semibold text-amber-950">
          Entorno de pruebas
        </div>
      )}
      {!hideBottomNav && (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)]"
    style={{ backgroundColor: statusBarColor }}
  />
)}

      <main
  className={`${mainClass}${isAndroidNative && !hideBottomNav ? ' android-page-scroll' : ''}`}
>
  <CycleAvailability>{children}</CycleAvailability>
</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
