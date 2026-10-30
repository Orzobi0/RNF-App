// Keep the Android prototype available in staging without an untracked env file.
// Production must never enable the experimental integration.
export const isFemometerPrototypeEnabled = (env) => {
  const flag = env.VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE;
  return env.VITE_APP_ENV === 'staging' && flag !== 'false';
};
