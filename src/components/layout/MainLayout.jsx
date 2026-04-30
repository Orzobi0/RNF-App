import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';

const STATUS_BAR_COLORS = {
  default: '#FFE4E6',
  strong: '#D85C70',
};

const usesStrongStatusBar = (pathname) =>
  pathname === '/records' ||
  pathname.startsWith('/cycle/') ||
  pathname === '/archived-cycles' ||
  pathname === '/settings' ||
  pathname.startsWith('/settings/') ||
  pathname === '/chart' ||
  pathname.startsWith('/chart/');

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
  const location = useLocation();
  const shouldUseStrongStatusBar = useMemo(
    () => usesStrongStatusBar(location.pathname),
    [location.pathname]
  );
  const statusBarColor = shouldUseStrongStatusBar
    ? STATUS_BAR_COLORS.strong
    : STATUS_BAR_COLORS.default;

  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-hidden'
    : 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--bottom-nav-safe)]';

  const topBlendStyle = !hideBottomNav
  ? {
      backgroundImage: `linear-gradient(${statusBarColor}, ${statusBarColor})`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'top left',
      backgroundSize: '100% calc(env(safe-area-inset-top) + 10px)',
    }
  : undefined;

  useEffect(() => {
    updateThemeColor(statusBarColor);
    updateNativeStatusBar(statusBarColor, !shouldUseStrongStatusBar);
  }, [shouldUseStrongStatusBar, statusBarColor]);

  useEffect(() => {
    return () => {
      updateThemeColor(STATUS_BAR_COLORS.default);
      updateNativeStatusBar(STATUS_BAR_COLORS.default, true);
    };
  }, []);

  return (
    <div className="relative flex min-h-app flex-col overflow-hidden">
      {!hideBottomNav && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-[-1px] z-30 h-[calc(env(safe-area-inset-top)+10px)]"
          style={{ backgroundColor: statusBarColor }}
        />
      )}

      <main className={mainClass} style={topBlendStyle}>{children}</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
