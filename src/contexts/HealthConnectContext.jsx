import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { checkHealthConnectState } from '@/lib/healthConnectSync';

const HealthConnectContext = createContext(null);

export const HealthConnectProvider = ({ children }) => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState(null);

  const refreshPermissions = useCallback(async () => {
    try {
      const state = await checkHealthConnectState();
      setIsAvailable(Boolean(state?.isAvailable));
      setHasPermissions(Boolean(state?.hasPermissions));
      setAvailabilityStatus(state?.availability ?? null);
      return state;
    } catch (error) {
      console.error('Error al comprobar permisos de Health Connect', error);
      setIsAvailable(false);
      setHasPermissions(false);
      setAvailabilityStatus('Unknown');
      return { isAvailable: false, hasPermissions: false, availability: 'Unknown' };
    }
  }, []);

  const value = useMemo(
    () => ({
      isAvailable,
      hasPermissions,
      availabilityStatus,
      refreshPermissions,
    }),
    [isAvailable, hasPermissions, availabilityStatus, refreshPermissions]
  );

  return <HealthConnectContext.Provider value={value}>{children}</HealthConnectContext.Provider>;
};

export const useHealthConnect = () => {
  const context = useContext(HealthConnectContext);
  if (!context) {
    throw new Error('useHealthConnect must be used within a HealthConnectProvider');
  }
  return context;
};

export default HealthConnectContext;
