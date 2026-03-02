import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Heart, BarChart3, Calendar, Archive, User } from 'lucide-react';

const BottomNav = () => {
  const location = useLocation();

  const links = [
    { to: '/records', label: 'Mis registros', icon: Calendar },
    { to: '/chart', label: 'Gráfica', icon: BarChart3 },
    { to: '/', label: 'Ciclo actual', icon: Heart },
    {
      to: '/archived-cycles',
      label: 'Mis ciclos',
      icon: Archive,
      isActive: (pathname) => pathname.startsWith('/archived-cycles') || pathname.startsWith('/cycle/')
    },
    { to: '/settings', label: 'Cuenta', icon: User },
  ];

  return (
  <nav
    className="fixed bottom-0 left-0 right-0 z-50 border-fertiliapp-suave bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/90 pb-[env(safe-area-inset-bottom)]"
    aria-label="Navegación inferior"
  >
    {/* Barra visible con altura fija (igual en Android y iPhone) */}
    <div className="mx-auto w-full max-w-md h-[var(--bottom-nav-height)] pt-2">
      <ul className="grid h-full w-full grid-cols-5 items-center gap-2 px-2">
        {links.map(({ to, label, icon: Icon, isActive: computeActive }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              aria-label={label}
              className="group relative flex w-full flex-col items-center rounded-lg px-2 py-2 text-center transition-[color,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
            >
              {({ isActive }) => {
                const customActive = computeActive ? computeActive(location.pathname) : false;
                const active = customActive || isActive;

                return (
                  <>
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-3xl transition-all duration-200 ${
                        active
                          ? 'bg-fertiliapp-suave/80 ring-1 ring-fertiliapp-suave shadow-sm'
                          : 'bg-transparent'
                      }`}
                    />
                    <span className="relative z-10 flex h-7 w-7 items-center justify-center">
                      <Icon
                        className={`h-6 w-6 transition-transform duration-200 ${
                          active
                            ? 'text-fertiliapp-fuerte scale-110'
                            : 'text-gray-400 group-hover:text-gray-600'
                        }`}
                      />
                    </span>
                    <span className="sr-only">{label}</span>
                  </>
                );
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  </nav>
);
};


export default BottomNav;
