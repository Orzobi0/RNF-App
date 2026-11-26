import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { parseMode, snapshot, verifyPreparation } from './check-staging-android.mjs';
import { STAGING_APP_ID } from '../src/lib/firebaseEnvironment.js';
import { classifyRuntime, authActionUrl, retireEmbeddedServiceWorker } from '../src/lib/androidRuntime.js';
import { loadFrontend, hooks, flush } from './helpers/load-frontend.mjs';

for (const embedded of [true, false]) test(`service worker entry points preserve web behavior (embedded=${embedded})`, async () => {
  let registered = 0, retired = 0, readyReads = 0, updates = 0;
  const registration = { update: async () => updates++, addEventListener() {}, removeEventListener() {} };
  const serviceWorker = { register: async () => { registered++; return registration; },
    get ready() { readyReads++; return Promise.resolve(registration); },
    addEventListener() {}, removeEventListener() {} };
  const base = {
    isEmbeddedAndroid: () => embedded, navigator: { serviceWorker },
    window: { location: { hostname: 'localhost', origin: 'http://localhost' }, addEventListener() {} },
    document: { getElementById() {}, addEventListener() {}, removeEventListener() {} },
  };
  await loadFrontend('src/main.jsx', { ...base, React: { createElement() {} },
    ReactDOM: { createRoot: () => ({ render() {} }) }, App: {},
    trackEvent() {}, trackException() {}, initGlobalErrorTracking() {}, setInterval() {},
    retireEmbeddedServiceWorker: async () => retired++,
  }, [], source => source.replace("import '@/index.css';", ''));
  await flush();
  assert.equal(registered, embedded ? 0 : 1);
  assert.equal(retired, embedded ? 1 : 0);
  const h = hooks();
  const { ServiceWorkerRouteUpdater } = await loadFrontend('src/App.jsx', {
    ...base, ...h.bindings, useLocation: () => ({ pathname: '/', search: '' }),
  }, ['ServiceWorkerRouteUpdater'], source => source.slice(source.indexOf('function ServiceWorkerRouteUpdater()'), source.indexOf('function AppContent()')));
  h.render(() => ({ props: { value: ServiceWorkerRouteUpdater() } }));
  const ui = hooks();
  const { UpdateNotification } = await loadFrontend('src/components/UpdateNotification.jsx', {
    ...base, ...ui.bindings, Button: 'button',
  }, ['UpdateNotification'], source => source.replace('export default function', 'function'));
  assert.equal(ui.render(() => ({ props: { value: UpdateNotification() } })), null);
  await flush();
  assert.equal(readyReads, embedded ? 0 : 2);
  assert.equal(updates, embedded ? 0 : 2);
  h.cleanup(); ui.cleanup();
});

test('native Android and exact local origin are both required for embedded behavior', () => {
  const native = platform => ({ isNativePlatform: () => true, getPlatform: () => platform });
  for (const origin of ['http://localhost', 'https://localhost']) {
    assert.equal(classifyRuntime(native('android'), origin), 'android-embedded');
    assert.equal(classifyRuntime(native('ios'), origin), 'web');
    assert.equal(classifyRuntime({ isNativePlatform: () => false }, origin), 'web');
  }
  for (const origin of ['https://fertiliapp-staging.web.app', 'http://localhost:5174', 'https://localhost.evil.test']) {
    assert.equal(classifyRuntime(native('android'), origin), 'android-remote');
    assert.equal(authActionUrl('/auth', false, 'staging', origin), `${origin}/auth`);
  }
  assert.equal(authActionUrl('/auth', true, 'staging', 'http://localhost'), 'https://fertiliapp-staging.web.app/auth');
  assert.throws(() => authActionUrl('/auth', true, 'production', 'http://localhost'));
});

test('retire only the app local worker without clearing caches or reloading', async () => {
  const removed = [];
  const registration = (scope, scriptURL) => ({ scope, active: { scriptURL }, unregister: async () => removed.push(scriptURL) });
  await retireEmbeddedServiceWorker({ getRegistrations: async () => [
    registration('http://localhost/', 'http://localhost/sw.js'),
    registration('http://localhost/other/', 'http://localhost/other/sw.js'),
    registration('https://fertiliapp-staging.web.app/', 'https://fertiliapp-staging.web.app/sw.js'),
  ] }, 'http://localhost');
  assert.deepEqual(removed, ['http://localhost/sw.js']);
});

const compiled = ts.transpileModule(fs.readFileSync('capacitor.config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function config(env = {}) {
  const context = { exports: {}, process: { env } };
  vm.runInNewContext(compiled, context);
  return context.exports.default;
}

test('remote default and embedded selection keep Staging app ID and webDir', () => {
  for (const mode of ['remote', 'embedded']) {
    const value = config({ CAPACITOR_STAGING_MODE: mode });
    assert.equal(value.appId, 'com.fertiliapp.fertiliapp.staging');
    assert.equal(value.webDir, 'dist-staging');
    assert.equal(Object.hasOwn(value.server, 'url'), mode === 'remote');
  }
  assert.equal(config().server.url, 'https://fertiliapp-staging.web.app');
  assert.equal(config({ CAPACITOR_ENV: 'production' }).server.url, 'https://rnf-app.web.app');
  assert.throws(() => config({ CAPACITOR_ENV: 'production', CAPACITOR_STAGING_MODE: 'embedded' }));
  assert.throws(() => config({ CAPACITOR_STAGING_MODE: 'typo' }));
  assert.throws(() => config({ CAPACITOR_ENV: 'experiment' }));
  assert.equal(parseMode([]), 'remote');
  assert.throws(() => parseMode(['embedded', '--project', 'rnf-app']));
});

test('prepared assets reject environment/mode mixtures and stale or extra files', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-android-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'dist-staging');
  const assets = path.join(directory, 'android/app/src/main/assets');
  const publicDir = path.join(assets, 'public');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const manifest = { projectId: 'fertiliapp-staging', appId: STAGING_APP_ID, mode: 'staging' };
  fs.writeFileSync(path.join(source, 'staging-build.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(source, 'index.html'), 'synthetic staging');
  fs.cpSync(source, publicDir, { recursive: true });
  const writeConfig = value => fs.writeFileSync(path.join(assets, 'capacitor.config.json'), JSON.stringify(value));
  for (const mode of ['remote', 'embedded']) {
    writeConfig(config({ CAPACITOR_STAGING_MODE: mode }));
    const state = snapshot(mode, directory);
    verifyPreparation(state, directory);
    assert.throws(() => snapshot(mode === 'remote' ? 'embedded' : 'remote', directory));
    fs.writeFileSync(path.join(publicDir, 'index.html'), 'production or stale');
    assert.throws(() => verifyPreparation(state, directory), /Stale/);
    fs.cpSync(source, publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'extra.js'), 'old chunk');
    assert.throws(() => verifyPreparation(state, directory), /Unexpected/);
    fs.unlinkSync(path.join(publicDir, 'extra.js'));
    fs.writeFileSync(path.join(source, 'index.html'), 'new web build');
    fs.cpSync(source, publicDir, { recursive: true });
    assert.throws(() => verifyPreparation(state, directory), /preparation changed/);
    fs.writeFileSync(path.join(source, 'index.html'), 'synthetic staging');
    fs.cpSync(source, publicDir, { recursive: true });
  }
  writeConfig(config({ CAPACITOR_ENV: 'production' }));
  assert.throws(() => snapshot('remote', directory), /configuration/);
  writeConfig(config());
  manifest.projectId = 'rnf-app';
  fs.writeFileSync(path.join(source, 'staging-build.json'), JSON.stringify(manifest));
  fs.cpSync(source, publicDir, { recursive: true });
  assert.throws(() => snapshot('remote', directory), /Firebase environment/);
});
