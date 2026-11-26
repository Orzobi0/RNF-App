import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import BottomNav from './BottomNav';
import { WifiOff } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCycleDataContext } from '@/contexts/CycleDataContext';
import { useLocation } from 'react-router-dom';

const CycleAvailability = ({ children }) => {
  const { dataAvailability: state, refreshData } = useCycleDataContext();
  const { pathname } = useLocation();
  // Account controls and native pending readings must remain accessible.
  const needsCycles = !pathname.startsWith('/settings');
  if (!state || state.phase === 'ready' || state.hasData) return children;
  const loading = state.phase === 'loading' || state.phase === 'refreshing';
  const message = loading ? 'Cargando los datos de tu cuenta...'
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

// Presentation only: a routine refresh is not a connectivity incident.
const hasAvailabilityIssue = (state) => Boolean(state?.hasData &&
  (state.knownOffline || state.serverReadFailed === true || state.needsServerConfirmation === true));

export const CycleAvailabilityIndicator = ({ className = '' } = {}) => {
  const { dataAvailability: state, refreshData } = useCycleDataContext();
  if (!hasAvailabilityIssue(state)) return null;
  const loading = state.phase === 'loading' || state.phase === 'refreshing';
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" aria-label="Estado de conexión: mostrando datos almacenados"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-fertiliapp-fuerte focus-visible:outline focus-visible:outline-2 ${className}`}>
        <WifiOff className="h-5 w-5" aria-hidden="true" />
      </button>
    </DialogTrigger>
    <DialogContent className="z-[400] max-h-[80dvh] overflow-y-auto" overlayClassName="z-[399]">
      <DialogTitle>Estado de los datos</DialogTitle>
      <DialogDescription>
        {state.knownOffline ? 'Sin conexión conocida. ' : state.serverReadFailed
          ? 'Firebase no ha podido actualizar los datos. ' : 'Comprobando actualización desde Firebase. '}
        Datos almacenados; podrían no estar actualizados.
      </DialogDescription>
      <button type="button" disabled={loading} onClick={() => { void refreshData(); }}
        className="min-h-11 rounded-xl px-4 text-fertiliapp-fuerte underline disabled:opacity-50">
        {loading ? 'Actualizando...' : 'Reintentar'}
      </button>
    </DialogContent>
  </Dialog>;
};

const STATUS_BAR_COLORS = { default: '#FFF7F9', settings: '#F8FAFC' };
const WEB_THEME_COLOR = '#FFE4E6';
const getStatusBarColor = (pathname) =>
  pathname === '/settings' || pathname.startsWith('/settings/')
    ? STATUS_BAR_COLORS.settings : STATUS_BAR_COLORS.default;

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

const MainLayout = ({ children, hideBottomNav = false, statusBarBackground }) => {
  const { pathname } = useLocation();
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const statusBarColor = isAndroidNative ? (statusBarBackground ?? getStatusBarColor(pathname)) : WEB_THEME_COLOR;
  const currentStatusBarColor = useRef(statusBarColor);
  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-hidden'
    : 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--bottom-nav-safe)]';

  useLayoutEffect(() => {
    currentStatusBarColor.current = statusBarColor;
    updateThemeColor(statusBarColor);
    if (isAndroidNative) window.FertiliAppStatusBar?.setColor?.(statusBarColor);
  }, [statusBarColor, isAndroidNative]);

  useEffect(() => {
    if (!isAndroidNative) return;
    let active = true;
    const apply = async () => {
      try {
        // LIGHT means dark icons on a light surface, including in system dark mode.
        await SystemBars.setStyle({ style: SystemBarsStyle.Light });
        // SystemBars resets decor background; restore the legacy WebView gutter afterwards.
        if (active) window.FertiliAppStatusBar?.setColor?.(currentStatusBarColor.current);
      } catch (error) {
        console.warn('No se pudo configurar SystemBars', error);
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void apply(); };
    void apply();
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [isAndroidNative]);

  return (
    <div className={`relative flex min-h-app flex-col overflow-hidden${isAndroidNative ? ' android-layout' : ''}`}
      style={isAndroidNative ? { '--status-bar-color': statusBarColor } : undefined}>
      {(!hideBottomNav || isAndroidNative) && <div aria-hidden="true"
        className={`status-bar-surface pointer-events-none absolute inset-x-0 top-0 h-[env(safe-area-inset-top)] ${isAndroidNative ? 'z-40' : 'z-20'}`}
        style={{ backgroundColor: statusBarColor }} />}
      <main className={`${mainClass}${isAndroidNative ? ' android-main' : ''}${isAndroidNative && !hideBottomNav ? ' android-page-scroll' : ''}`}>
        <CycleAvailability>{children}</CycleAvailability>
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
