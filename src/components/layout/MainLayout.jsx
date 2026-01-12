import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-y-auto'
    : 'relative z-10 flex-1 w-full overflow-y-auto pb-[var(--bottom-nav-safe)]';

  return (
    <div className="relative flex min-h-app flex-col overflow-hidden">
      <main className={mainClass}>{children}</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;

