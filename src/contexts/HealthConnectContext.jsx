import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getHealthConnectStatus } from '@/lib/healthConnectSync';

const HealthConnectContext = createContext(null);

export const HealthConnectProvider = ({ children }) => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const refreshPermissions = useCallback(async () => {
    if (!isAndroidApp) {
      setIsAvailable(false);
      setHasPermissions(false);
      return { isAvailable: false, hasPermissions: false, availability: 'NotAndroid' };
    }

    setIsChecking(true);
    try {
      const status = await getHealthConnectStatus();
      setIsAvailable(Boolean(status.isAvailable));
      setHasPermissions(Boolean(status.hasPermissions));
      return status;
    } catch (error) {
      console.error('Error al comprobar Health Connect', error);
      setIsAvailable(false);
      setHasPermissions(false);
      return { isAvailable: false, hasPermissions: false, availability: 'Error' };
    } finally {
      setIsChecking(false);
    }
  }, [isAndroidApp]);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  return (
    <HealthConnectContext.Provider
      value={{
        isAvailable,
        hasPermissions,
        refreshPermissions,
        isChecking,
        isAndroidApp,
      }}
    >
      {children}
    </HealthConnectContext.Provider>
  );
};

export const useHealthConnect = () => {
  const context = useContext(HealthConnectContext);
  if (!context) {
    throw new Error('useHealthConnect must be used within a HealthConnectProvider');
  }
  return context;
};

export default HealthConnectContext;