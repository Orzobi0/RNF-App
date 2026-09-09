export const STAGING_PROJECT = 'fertiliapp-staging';
export const STAGING_APP_ID = '1:574564111406:web:e49df0e56568b3a4f4fbbf';

// Shared by Vite and the browser: reject mixed configuration before initialization.
export function validateFirebaseEnvironment(env, hostname = '') {
  const staging = env.VITE_APP_ENV === 'staging';
  const project = env.VITE_FIREBASE_PROJECT_ID;
  const required = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'MESSAGING_SENDER_ID', 'APP_ID'];
  for (const key of required) {
    if (!env[`VITE_FIREBASE_${key}`]) throw new Error(`Missing Firebase configuration: ${key}`);
  }
  if (staging) {
    if (project !== STAGING_PROJECT ||
        env.VITE_FIREBASE_AUTH_DOMAIN !== `${STAGING_PROJECT}.firebaseapp.com` ||
        env.VITE_FIREBASE_MESSAGING_SENDER_ID !== '574564111406' ||
        env.VITE_FIREBASE_APP_ID !== STAGING_APP_ID ||
        (env.VITE_FIREBASE_STORAGE_BUCKET && ![
          `${STAGING_PROJECT}.appspot.com`, `${STAGING_PROJECT}.firebasestorage.app`,
        ].includes(env.VITE_FIREBASE_STORAGE_BUCKET)) ||
        env.VITE_ENABLE_ANALYTICS === 'true' || env.VITE_FIREBASE_MEASUREMENT_ID) {
      throw new Error('Staging Firebase configuration is not isolated.');
    }
  } else if (project !== 'rnf-app') {
    throw new Error('Use the staging build for fertiliapp-staging.');
  }
  const hosted = /\.(web\.app|firebaseapp\.com)$/.test(hostname);
  if (hosted) {
    const allowed = staging
      ? [`${STAGING_PROJECT}.web.app`, `${STAGING_PROJECT}.firebaseapp.com`]
      : ['rnf-app.web.app', 'rnf-app.firebaseapp.com', 'rnf-app-experiment.web.app', 'rnf-app-experiment.firebaseapp.com'];
    // Preview channels stay in the same Firebase Hosting site.
    const preview = staging && hostname.startsWith(`${STAGING_PROJECT}--`) && hostname.endsWith('.web.app');
    if (!allowed.includes(hostname) && !preview) throw new Error('Firebase project does not match the Hosting origin.');
  }
  return { staging, project };
}
