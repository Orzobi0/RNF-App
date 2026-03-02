import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
    // Con navbar: descuenta safe top + bottom nav (incluye safe bottom).
  // Fullscreen: descuenta solo safe top/bottom sin navbar.
  const mainStyle = {
    minHeight: hideBottomNav
      ? 'var(--content-safe-height-fullscreen)'
      : 'var(--content-safe-height)',
  };

  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)]'
    : 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--bottom-nav-safe)]';

  return (
    <div className="relative flex min-h-app flex-col overflow-hidden">
      <main className={mainClass} style={mainStyle}>{children}</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;

