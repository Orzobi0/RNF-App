import React from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { Heart, ChartSpline, Calendar, Archive, User } from 'lucide-react';

const BottomNav = () => {
  const cycleMatch = useMatch('/cycle/:cycleId');
  const chartCycleMatch = useMatch('/chart/:cycleId');
  const contextCycleId = cycleMatch?.params?.cycleId || chartCycleMatch?.params?.cycleId;
  const hasArchivedCycleContext = Boolean(contextCycleId);

  const links = [
    {
      to: contextCycleId ? `/cycle/${contextCycleId}` : '/records',
      label: hasArchivedCycleContext ? 'Registros del ciclo archivado' : 'Mis registros',
      icon: Calendar,
      showArchivedBadge: hasArchivedCycleContext,
    },
    {
      to: contextCycleId ? `/chart/${contextCycleId}` : '/chart',
      label: hasArchivedCycleContext ? 'Gráfica del ciclo archivado' : 'Gráfica',
      icon: ChartSpline,
      showArchivedBadge: hasArchivedCycleContext,
    },
    { to: '/', label: 'Ciclo actual', icon: Heart, activeFill: true },
    { to: '/archived-cycles', label: 'Mis ciclos', icon: Archive },
    { to: '/settings', label: 'Cuenta', icon: User },
  ];

return (
  <nav
  className="fixed -bottom-px left-0 right-0 z-50 h-[calc(var(--bottom-nav-safe)+1px)] overflow-hidden rounded-t-3xl border-fertiliapp-suave bg-white shadow-[0_-8px_24px_rgba(244,114,182,0.12)]"
  aria-label="Navegación inferior"
>
    {/* Fondo sólido para cubrir también la safe area del iPhone */}
    <div className="absolute inset-0 bg-white" aria-hidden="true" />

    {/* Capa visual */}
    <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
      {/* Barra visible */}
      <div className="h-[var(--bottom-nav-height)] pt-3.5">
        <ul className="grid h-full w-full grid-cols-5 items-start gap-2 px-2">
          {links.map(({ to, label, icon: Icon, showArchivedBadge, activeFill }) => (
            <li key={to} className="flex">
              <NavLink
                to={to}
                aria-label={label}
                className="group relative flex w-full flex-col items-center rounded-lg px-2 py-1 text-center transition-[color,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
              >
                {({ isActive }) => {
                  return (
                    <>
                      <span
  className={`relative z-10 flex h-9 w-[3.35rem] items-center justify-center rounded-full transition-all duration-200 ${
    isActive
      ? 'bg-rose-50/95 text-fertiliapp-fuerte ring-1 ring-rose-200/80 shadow-[0_4px_12px_rgba(216,92,112,0.14)]'
      : 'bg-transparent text-slate-400 group-hover:text-slate-500'
  }`}
>
  <Icon
    strokeWidth={isActive ? 2.35 : 2}
    className={`h-6 w-6 transition-transform duration-200 ${
      isActive ? 'scale-105' : 'group-hover:scale-105'
    } ${activeFill && isActive ? 'fill-current' : 'fill-none'}`}
  />
                        {showArchivedBadge && (
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-white shadow-[0_1px_3px_rgba(244,114,182,0.18)] ${
                              isActive
                                ? 'border-fertiliapp-suave'
                                : 'border-gray-200'
                            }`}
                          >
                            <Archive
                              className={`h-2.5 w-2.5 ${
                                isActive ? 'text-fertiliapp-fuerte' : 'text-gray-400'
                              }`}
                            />
                          </span>
                        )}
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

      {/* Safe area pintada, sin transparencia */}
      <div aria-hidden className="h-[var(--safe-bottom-clamped)] bg-white" />
    </div>
  </nav>
);
};


export default BottomNav;
