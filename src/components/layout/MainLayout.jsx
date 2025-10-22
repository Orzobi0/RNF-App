import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const mainClass = hideBottomNav
    ? 'flex-1 w-full overflow-y-auto'
    : 'flex-1 w-full overflow-y-auto pb-[var(--bottom-nav-safe)]';
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <main className={mainClass}>
        {children}
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
