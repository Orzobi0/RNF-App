import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const mainClass = hideBottomNav
    ? 'relative z-10 h-app w-full overflow-y-auto'
    : 'relative z-10 w-full overflow-y-auto h-[calc(var(--app-vh,1vh)*100 - var(--bottom-nav-safe))]';

  return (
    <div className="relative flex min-h-viewport flex-col overflow-hidden">
      <main className={mainClass}>
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
