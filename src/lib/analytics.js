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
  // Dashboard note:
  // - "Usuarios reales diarios" se calcula con eventos autenticados (con user_id).
  // - `app_boot` es solo telemetría técnica y no base de DAU reales.
  // - `auth_session_ready` es el evento base recomendado para usuarios identificados diarios.
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

export const trackDailyRecordSaved = ({
  entryMode = 'manual',
  hasTemperature = false,
  hasSymptoms = false,
  hasMucus = false,
} = {}) => {
  return trackEvent('save_daily_record', {
    entry_mode: entryMode,
    has_temperature: hasTemperature,
    has_symptoms: hasSymptoms,
    has_mucus: hasMucus,
  });
};