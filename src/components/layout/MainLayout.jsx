import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const mainClass = hideBottomNav
    ? 'flex-grow w-full pt-0 min-h-[100dvh]'
    : 'flex-grow w-full pt-0 pb-[var(--bottom-nav-safe)] min-h-[calc(100dvh-var(--bottom-nav-safe))]';
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <main className={mainClass}>
        {children}
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;
