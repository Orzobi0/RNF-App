import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children }) => {
  return (
      <div className="min-h-[100dvh] flex flex-col">
        <main className="flex-grow w-full pt-0 pb-[var(--bottom-nav-safe)] min-h-[calc(100dvh-var(--bottom-nav-safe))]">
          {children}
        </main>
        <BottomNav />
      </div>
  );
};

export default MainLayout;
