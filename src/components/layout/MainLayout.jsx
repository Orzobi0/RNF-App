import React, { useEffect } from 'react';
import BottomNav from './BottomNav';

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
      {!hideBottomNav && (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)]"
    style={{ backgroundColor: statusBarColor }}
  />
)}

      <main className={mainClass}>{children}</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
