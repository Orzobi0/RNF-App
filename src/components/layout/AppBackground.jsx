import React from 'react';

const AppBackground = ({ children }) => (
  <div className="relative h-app overflow-hidden app-background">
    <div className="relative z-10 flex h-app flex-col">
      {children}
    </div>
  </div>
);

export default AppBackground;