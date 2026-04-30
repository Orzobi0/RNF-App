import React from 'react';
import { useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import { cn } from '@/lib/utils';

const MainLayout = ({ children, hideBottomNav = false }) => {
  const location = useLocation();

  const mainClass = hideBottomNav
    ? 'relative z-10 flex-1 w-full overflow-hidden'
    : 'relative z-10 flex-1 w-full overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--bottom-nav-safe)]';

  const shouldUseStrongStatusBar =
    location.pathname === '/records' ||
    location.pathname.startsWith('/cycle/') ||
    location.pathname === '/archived-cycles' ||
    location.pathname === '/settings' ||
    location.pathname.startsWith('/settings/');

  return (
    <div className="relative flex min-h-app flex-col overflow-hidden">
      {!hideBottomNav && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)]',
            shouldUseStrongStatusBar ? 'bg-fertiliapp-fuerte' : 'bg-transparent'
          )}
        />
      )}

      <main className={mainClass}>{children}</main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

export default MainLayout;