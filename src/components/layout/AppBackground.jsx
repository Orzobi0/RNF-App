import React from 'react';

const AppBackground = ({ children }) => (
  <div className="relative min-h-screen overflow-hidden app-background">
    <div className="pointer-events-none absolute inset-0">
      <div className="wave wave--left-1" />
      <div className="wave wave--left-2" />
      <div className="wave wave--left-3" />
      <div className="wave wave--right-1" />
      <div className="wave wave--right-2" />
      <div className="wave wave--right-3" />
    </div>
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(120% 120% at 0% 0%, rgba(251,113,133,0.12) 0, transparent 55%),
            radial-gradient(110% 110% at 100% 0%, rgba(244,114,182,0.12) 0, transparent 55%)
          `,
        }}
      />
    </div>
    <div className="relative z-10 flex min-h-screen flex-col">
      {children}
    </div>
  </div>
);

export default AppBackground;