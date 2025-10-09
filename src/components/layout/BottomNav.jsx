import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, BarChart3, Calendar, Archive, User } from 'lucide-react';

const BottomNav = () => {
  const links = [
    { to: '/records', label: 'Mis registros', icon: Calendar },
    { to: '/chart', label: 'Gráfica', icon: BarChart3 },
    { to: '/', label: 'Ciclo actual', icon: Heart },
    { to: '/archived-cycles', label: 'Mis ciclos', icon: Archive },
    { to: '/settings', label: 'Cuenta', icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 pt-2 pb-[env(safe-area-inset-bottom)] min-h-[var(--bottom-nav-safe)]"
    >
      <ul className="mx-auto grid w-full max-w-md grid-cols-5 gap-2 px-2">
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              aria-label={label}
              className="group relative flex w-full flex-col items-center rounded-lg px-2 py-2 text-center transition-[color,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
            >
              {({ isActive }) => (
                <>
                  {/* fondo “pill” activo, no afecta a altura */}
                  <span
                    aria-hidden
                    className={`absolute inset-0 rounded-lg transition-all duration-200 ${
                      isActive ? 'bg-pink-50 ring-1 ring-pink-100 shadow-sm' : 'bg-transparent'
                    }`}
                  />
                  {/* icono: mantenemos contenedor h-7 para conservar altura total previa */}
                  <span className="relative z-10 flex h-7 w-7 items-center justify-center">
                    <Icon
                      className={`h-6 w-6 transition-transform duration-200 ${
                        isActive ? 'text-pink-600 scale-110' : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                    />
                  </span>

                  {/* etiqueta accesible, no visible */}
                  <span className="sr-only">{label}</span>

                  
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default BottomNav;
