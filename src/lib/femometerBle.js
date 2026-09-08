import { Capacitor, registerPlugin } from '@capacitor/core';

const FemometerBle = registerPlugin('FemometerBle');

const getCapacitorBridge = () => {
  if (typeof window !== 'undefined' && window.Capacitor) {
    return window.Capacitor;
  }
  if (typeof globalThis !== 'undefined' && globalThis.Capacitor) {
    return globalThis.Capacitor;
  }
  return Capacitor;
};

const getAndroidBridge = () => {
  if (typeof window !== 'undefined' && window.androidBridge) {
    return window.androidBridge;
  }
  if (typeof globalThis !== 'undefined' && globalThis.androidBridge) {
    return globalThis.androidBridge;
  }
  return null;
};

let androidBridgeCallbackId = 780000;
const androidBridgePendingCalls = new Map();
let androidBridgeOnMessagePatched = false;

const ensureAndroidBridgeOnMessage = () => {
  const androidBridge = getAndroidBridge();
  if (!androidBridge || androidBridgeOnMessagePatched) return;

  const previousOnMessage = androidBridge.onmessage;
  androidBridge.onmessage = (event) => {
    let result = null;
    try {
      result = typeof event?.data === 'string' ? JSON.parse(event.data) : event?.data;
    } catch {
      result = null;
    }

    const callbackId = result?.callbackId;
    const pending = callbackId ? androidBridgePendingCalls.get(callbackId) : null;
    if (pending) {
      androidBridgePendingCalls.delete(callbackId);
      if (pending.timeout) clearTimeout(pending.timeout);
      if (result?.success) {
        pending.resolve(result.data);
      } else {
        pending.reject(result?.error || result || new Error('Native bridge call failed'));
      }
      return;
    }

    if (typeof previousOnMessage === 'function') {
      previousOnMessage.call(androidBridge, event);
    }
  };
  androidBridgeOnMessagePatched = true;
};

const androidBridgePromise = (pluginName, methodName, options = {}) => {
  const androidBridge = getAndroidBridge();
  if (!androidBridge || typeof androidBridge.postMessage !== 'function') {
    throw createFemometerBleError(
      'NATIVE_BRIDGE_UNAVAILABLE',
      undefined,
      'window.androidBridge.postMessage no está disponible.'
    );
  }

  ensureAndroidBridgeOnMessage();

  return new Promise((resolve, reject) => {
    const callbackId = String(++androidBridgeCallbackId);
    const timeout = setTimeout(() => {
      androidBridgePendingCalls.delete(callbackId);
      reject({
        code: 'NATIVE_BRIDGE_UNAVAILABLE',
        message: `Timeout esperando respuesta nativa de ${pluginName}.${methodName}`,
      });
    }, 20000);

    androidBridgePendingCalls.set(callbackId, { resolve, reject, timeout });
    androidBridge.postMessage(
      JSON.stringify({
        callbackId,
        pluginId: pluginName,
        methodName,
        options,
      })
    );
  });
};

const ERROR_MESSAGES = {
  BLE_NOT_SUPPORTED: 'Este dispositivo no tiene soporte BLE.',
  BLUETOOTH_UNAVAILABLE: 'Bluetooth no está disponible en este dispositivo.',
  BLUETOOTH_DISABLED: 'Bluetooth está apagado. Actívalo y vuelve a intentarlo.',
  PERMISSION_NOT_GRANTED: 'Faltan permisos Bluetooth para usar esta prueba.',
  SCAN_IN_PROGRESS: 'Ya hay una búsqueda en curso.',
  SCAN_FAILED: 'Falló la búsqueda BLE.',
  SCANNER_UNAVAILABLE: 'No se pudo iniciar la búsqueda BLE.',
  DEVICE_ID_REQUIRED: 'Selecciona un termómetro antes de comprobarlo.',
  DEVICE_NOT_FOUND: 'El termómetro seleccionado ya no está disponible. Vuelve a buscarlo.',
  CONNECTION_IN_PROGRESS: 'Ya hay una conexión BLE en curso.',
  CONNECTION_FAILED: 'No se pudo conectar con el termómetro.',
  CONNECTION_TIMEOUT: 'La conexión BLE ha tardado demasiado.',
  CONNECTION_CANCELLED: 'La conexión BLE se ha cancelado.',
  DEVICE_DISCONNECTED: 'El termómetro se desconectó antes de terminar la comprobación.',
  SERVICE_DISCOVERY_FAILED: 'No se pudieron detectar los servicios BLE.',
  SERVICE_DISCOVERY_TIMEOUT: 'La detección de servicios BLE ha tardado demasiado.',
  HEALTH_THERMOMETER_NOT_FOUND: 'No se encontró el servicio de termómetro.',
  TEMPERATURE_MEASUREMENT_NOT_FOUND: 'No se encontró la característica de temperatura.',
  INDICATE_NOT_SUPPORTED: 'La característica de temperatura no expone indicaciones.',
  INDICATION_ENABLE_FAILED: 'No se pudieron activar las indicaciones de temperatura.',
  CCCD_NOT_FOUND: 'No se encontró el descriptor estándar de indicaciones.',
  CCCD_WRITE_FAILED: 'No se pudo activar el descriptor estándar de indicaciones.',
  TEMPERATURE_LISTENER_IN_PROGRESS: 'Ya hay una escucha de temperatura en curso.',
  TEMPERATURE_LISTENER_SETUP_TIMEOUT: 'La preparación de la escucha BLE ha tardado demasiado.',
  UNAVAILABLE_PLATFORM: 'Esta prueba solo está disponible en la app Android.',
  NATIVE_BRIDGE_UNAVAILABLE: 'El puente nativo de Capacitor no está disponible.',
  UNKNOWN: 'No se pudo completar la prueba BLE.',
};

export const isFemometerBleAndroidNative = () => {
  const bridge = getCapacitorBridge();
  const isNative =
    typeof bridge.isNativePlatform === 'function'
      ? bridge.isNativePlatform()
      : Boolean(bridge.getPlatform && bridge.getPlatform() !== 'web');
  return isNative && bridge.getPlatform?.() === 'android';
};

export const isFemometerBlePrototypeEnabled = () =>
  import.meta.env.VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE === 'true';

const getErrorCode = (error) => {
  const rawCode = error?.code || error?.errorCode;
  if (rawCode) return rawCode;
  if (ERROR_MESSAGES[error?.errorMessage]) return error.errorMessage;
  return 'UNKNOWN';
};

const getTechnicalMessage = (error) => {
  const values = [
    error?.message,
    error?.errorMessage,
    error?.errorCode,
    error?.code,
  ].filter(Boolean);
  return values.length > 0 ? values.join(' | ') : ERROR_MESSAGES.UNKNOWN;
};

const createFemometerBleError = (code, originalError, technicalMessage) => ({
  code,
  errorCode: originalError?.errorCode,
  errorMessage: originalError?.errorMessage,
  nativeCode: originalError?.code,
  message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN,
  technicalMessage: technicalMessage ?? getTechnicalMessage(originalError),
  originalError,
});

export const normalizeFemometerBleError = (error) => {
  console.error('[FemometerBle]', error);

  const code = getErrorCode(error);
  return createFemometerBleError(code, error);
};

const assertAndroidNative = () => {
  if (!isFemometerBleAndroidNative()) {
    throw createFemometerBleError(
      'UNAVAILABLE_PLATFORM',
      undefined,
      'Capacitor platform is not native Android.'
    );
  }
};

const callFemometerBle = async (method, payload) => {
  assertAndroidNative();
  try {
    const bridge = getCapacitorBridge();
    if (typeof bridge.nativePromise === 'function') {
      return await bridge.nativePromise('FemometerBle', method, payload || {});
    }
    if (typeof bridge.toNative === 'function') {
      return await new Promise((resolve, reject) => {
        bridge.toNative('FemometerBle', method, payload || {}, { resolve, reject });
      });
    }
    if (getAndroidBridge()) {
      return await androidBridgePromise('FemometerBle', method, payload || {});
    }
    return await FemometerBle[method](payload);
  } catch (error) {
    throw normalizeFemometerBleError(error);
  }
};

export const requestBluetoothPermissions = async () => {
  const result = await callFemometerBle('requestBluetoothPermissions');
  if (result?.granted === false) {
    throw createFemometerBleError(
      'PERMISSION_NOT_GRANTED',
      result,
      `Permisos no concedidos: ${JSON.stringify(result.permissionStates || {})}`
    );
  }
  return result;
};

export const scanForFemometer = async () => {
  const result = await callFemometerBle('scan');
  return Array.isArray(result?.devices) ? result.devices : [];
};

export const connectAndInspectFemometer = async (deviceId) =>
  callFemometerBle('connectAndInspect', { deviceId });

export const startFemometerTemperatureListener = async (deviceId) =>
  callFemometerBle('startTemperatureListener', { deviceId });

export const stopFemometerTemperatureListener = async () =>
  callFemometerBle('stopTemperatureListener');

export const addFemometerTemperatureListener = async (callback) => {
  assertAndroidNative();
  const bridge = getCapacitorBridge();
  const eventName = 'femometerTemperatureIndication';

  if (typeof bridge.nativeCallback === 'function') {
    const callbackId = bridge.nativeCallback(
      'FemometerBle',
      'addListener',
      { eventName },
      callback
    );
    return {
      remove: async () => {
        if (typeof bridge.nativePromise === 'function') {
          await bridge.nativePromise('FemometerBle', 'removeListener', { eventName, callbackId });
        } else if (typeof bridge.toNative === 'function') {
          await new Promise((resolve, reject) => {
            bridge.toNative(
              'FemometerBle',
              'removeListener',
              { eventName, callbackId },
              { resolve, reject }
            );
          });
        }
      },
    };
  }

  if (typeof FemometerBle.addListener === 'function') {
    return FemometerBle.addListener(eventName, callback);
  }

  throw createFemometerBleError(
    'NATIVE_BRIDGE_UNAVAILABLE',
    undefined,
    'No hay puente nativo disponible para registrar eventos FemometerBle.'
  );
};

export const disconnectFemometer = async () => {
  if (!isFemometerBleAndroidNative()) return;
  try {
    await callFemometerBle('disconnect');
  } catch (error) {
    throw normalizeFemometerBleError(error);
  }
};
