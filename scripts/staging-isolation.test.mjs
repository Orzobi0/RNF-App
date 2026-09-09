import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { STAGING_APP_ID, validateFirebaseEnvironment } from '../src/lib/firebaseEnvironment.js';
const env = {
  VITE_APP_ENV: 'staging',
  VITE_FIREBASE_API_KEY: 'synthetic-test-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'fertiliapp-staging.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'fertiliapp-staging',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '574564111406',
  VITE_FIREBASE_APP_ID: STAGING_APP_ID,
};
test('staging works on its own Hosting origin and localhost', () => {
  for (const host of ['fertiliapp-staging.web.app', 'fertiliapp-staging.firebaseapp.com', 'localhost', 'fertiliapp-staging--pr-1-abc.web.app']) {
    assert.equal(validateFirebaseEnvironment(env, host).project, 'fertiliapp-staging');
  }
});
test('mixed backend configuration fails before Firebase initialization', () => {
  for (const [key, value] of Object.entries({
    VITE_FIREBASE_PROJECT_ID: 'rnf-app',
    VITE_FIREBASE_AUTH_DOMAIN: 'rnf-app.firebaseapp.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '771820334247',
    VITE_FIREBASE_APP_ID: '1:771820334247:web:production',
    VITE_FIREBASE_STORAGE_BUCKET: 'rnf-app.appspot.com',
    VITE_ENABLE_ANALYTICS: 'true',
    VITE_FIREBASE_MEASUREMENT_ID: 'G-PRODUCTION',
    VITE_FIREBASE_API_KEY: '',
  })) assert.throws(() => validateFirebaseEnvironment({ ...env, [key]: value }), key);
});
test('build and Hosting project must agree in both directions', () => {
  assert.throws(() => validateFirebaseEnvironment(env, 'rnf-app.web.app'));
  assert.throws(() => validateFirebaseEnvironment(env, 'rnf-app-experiment.web.app'));
  assert.throws(() => validateFirebaseEnvironment({ ...env, VITE_APP_ENV: 'production', VITE_FIREBASE_PROJECT_ID: 'rnf-app' }, 'fertiliapp-staging.web.app'));
});
test('deploy command rejects project overrides before invoking the CLI', () => {
  const result = spawnSync(process.execPath, ['scripts/deploy-staging.mjs', 'hosting', '--project', 'rnf-app'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /overrides are forbidden/);
});
