import React from 'react';
import BottomNav from './BottomNav';

const MainLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow container mx-auto px-4 sm:px-6 pt-4 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
};

export default MainLayout;