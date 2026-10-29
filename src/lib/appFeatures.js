// Keep the Android prototype available in staging without an untracked env file.
// An explicit false still disables it; production requires an explicit opt-in.
export const isFemometerPrototypeEnabled = (env) => {
  const flag = env.VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE;
  return flag === 'true' || (!flag && env.VITE_APP_ENV === 'staging');
};
