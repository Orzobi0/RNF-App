import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, BarChart3, Calendar, Archive, User } from 'lucide-react';

const BottomNav = () => {
  const links = [
    { to: '/records', label: 'Mis registros', icon: Calendar },
    { to: '/chart', label: 'Gráfica', icon: BarChart3 },
    { to: '/', label: 'Ciclo actual', icon: Heart },
    { to: '/archived-cycles', label: 'Mis ciclos', icon: Archive },
    { to: '/settings', label: 'Cuenta', icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white pt-2 pb-[env(safe-area-inset-bottom)] min-h-[var(--bottom-nav-safe)]">
      <ul className="mx-auto grid w-full max-w-md grid-cols-5 gap-2 px-2">
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-xs leading-tight transition-colors duration-200 ${
                  isActive ? 'text-pink-600' : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              <span className="flex h-6 w-6 items-center justify-center">
                <Icon className="h-5 w-5" />
              </span>
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default BottomNav;
