// src/lib/analytics.js
import { logEvent, setUserId } from 'firebase/analytics';
import { getFirebaseAnalytics } from '@/lib/firebaseClient';

const toSafeText = (value, max = 100) => {
  if (value == null) return '';

  try {
    return String(value).slice(0, max);
  } catch {
    return 'unserializable_value';
  }
};

export const trackEvent = async (name, params = {}) => {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;
// Nota:
// - "Usuarios reales diarios" se puede leer mejor usando `sesion_lista` con user_id.
// - `app_boot` es telemetría técnica, no una métrica principal de uso real.
// - `registro_guardado` es el evento principal para analizar uso funcional.
  logEvent(analytics, name, params);
};

export const setAnalyticsUserId = async (userId) => {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;

  setUserId(analytics, userId ?? null);
};

export const trackException = async (error, extra = {}) => {
  const description =
    error instanceof Error
      ? error.message
      : toSafeText(error);

  await trackEvent('exception', {
    description: toSafeText(description),
    fatal: false,
    ...extra,
  });
};

let globalErrorTrackingInitialized = false;

export const initGlobalErrorTracking = () => {
  if (typeof window === 'undefined' || globalErrorTrackingInitialized) return;
  globalErrorTrackingInitialized = true;

  window.addEventListener('error', (event) => {
    void trackException(event.error ?? event.message ?? 'window_error', {
      error_type: 'js_error',
      source_file: toSafeText(event.filename),
      line_number: Number(event.lineno || 0),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;

    void trackException(reason?.message || reason || 'unhandledrejection', {
      error_type: 'promise_rejection',
    });
  });
};

export const trackLogin = (method = 'unknown') => {
  return trackEvent('login', { method });
};

export const trackSignUp = (method = 'unknown') => {
  return trackEvent('sign_up', { method });
};
export const trackSessionReady = ({
  proveedor = 'unknown',
} = {}) => {
  return trackEvent('sesion_lista', {
    proveedor_autenticacion: proveedor,
    estado_sesion: 'autenticada',
    alcance_metrica: 'usuarios_identificados_diarios',
  });
};

export const trackDailyRecordSaved = ({
  accion = 'crear',
  ambitoCiclo = 'actual',
  tieneTemperatura = false,
  tieneMoco = false,
  tieneRelaciones = false,
  tienePico = false,
  tieneObservaciones = false,
  cantidadMediciones = 0,
} = {}) => {
  return trackEvent('registro_guardado', {
    accion,
    ambito_ciclo: ambitoCiclo,
    tiene_temperatura: tieneTemperatura,
    tiene_moco: tieneMoco,
    tiene_relaciones: tieneRelaciones,
    tiene_pico: tienePico,
    tiene_observaciones: tieneObservaciones,
    cantidad_mediciones: cantidadMediciones,
  });
};

export const trackRecordDeleted = ({
  ambitoCiclo = 'actual',
} = {}) => {
  return trackEvent('registro_eliminado', {
    ambito_ciclo: ambitoCiclo,
  });
};

export const trackRecordSaveError = ({
  accion = 'crear',
  ambitoCiclo = 'actual',
  codigoError = 'unknown',
} = {}) => {
  return trackEvent('error_guardado_registro', {
    accion,
    ambito_ciclo: ambitoCiclo,
    codigo_error: codigoError,
  });
};

export const trackRecordDeleteError = ({
  ambitoCiclo = 'actual',
  codigoError = 'unknown',
} = {}) => {
  return trackEvent('error_eliminado_registro', {
    ambito_ciclo: ambitoCiclo,
    codigo_error: codigoError,
  });
};
