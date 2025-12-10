import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const mainClass = hideBottomNav
    ? 'flex-1 w-full overflow-y-auto'
    : 'flex-1 w-full overflow-y-auto pb-[var(--bottom-nav-safe)]';

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <main className={`relative z-10 ${mainClass}`}>
        {children}
      </main>
      {!hideBottomNav && (
        <div className="relative z-10">
          <BottomNav />
        </div>
      )}
    </div>
  );
};

export default MainLayout;
