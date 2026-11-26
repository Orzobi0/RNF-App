import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkStaging } from './check-staging.mjs';
import { STAGING_APP_ID, STAGING_PROJECT } from '../src/lib/firebaseEnvironment.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const preparationFile = path.join(root, '.firebase/android-staging-prepared.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function parseMode(args) {
  if (args.length === 0) return 'remote';
  if (args.length !== 1 || !['remote', 'embedded'].includes(args[0])) {
    throw new Error('Choose remote or embedded; environment overrides are forbidden');
  }
  return args[0];
}

function tree(directory) {
  const files = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in Android assets');
      if (entry.isDirectory()) walk(file);
      else files[path.relative(directory, file).replaceAll('\\', '/')] = hash(fs.readFileSync(file));
    }
  }
  walk(directory);
  return files;
}

// Also used by fixture tests: no builds, syncs or native tools are invoked here.
export function snapshot(mode, directory = root) {
  parseMode([mode]);
  const assets = path.join(directory, 'android/app/src/main/assets');
  const config = readJson(path.join(assets, 'capacitor.config.json'));
  if (config.appId !== 'com.fertiliapp.fertiliapp.staging' || config.webDir !== 'dist-staging' ||
      (mode === 'remote' ? config.server?.url !== 'https://fertiliapp-staging.web.app' :
        Object.hasOwn(config.server || {}, 'url'))) {
    throw new Error('Android configuration does not match the selected Staging mode');
  }
  const source = tree(path.join(directory, 'dist-staging'));
  const copied = tree(path.join(assets, 'public'));
  const manifest = readJson(path.join(assets, 'public/staging-build.json'));
  if (manifest.projectId !== STAGING_PROJECT || manifest.appId !== STAGING_APP_ID || manifest.mode !== 'staging') {
    throw new Error('Wrong Firebase environment in Android assets');
  }
  for (const [name, digest] of Object.entries(source)) {
    if (copied[name] !== digest) throw new Error(`Stale Android asset: ${name}`);
  }
  for (const name of Object.keys(copied)) {
    if (!Object.hasOwn(source, name) && !['cordova.js', 'cordova_plugins.js'].includes(name) && !name.startsWith('plugins/')) {
      throw new Error(`Unexpected Android asset: ${name}`);
    }
  }
  return { mode, source, assets: tree(assets) };
}

export function recordPreparation(mode) {
  checkStaging(true);
  const state = snapshot(mode);
  fs.mkdirSync(path.dirname(preparationFile), { recursive: true });
  fs.writeFileSync(preparationFile, JSON.stringify(state, null, 2));
}

export function verifyPreparation(state, directory = root) {
  if (JSON.stringify(snapshot(state.mode, directory)) !== JSON.stringify(state)) {
    throw new Error('Android preparation changed; run the chosen sync:staging:android command again');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkStaging(true);
  if (!fs.existsSync(preparationFile)) throw new Error('Prepare Android with sync:staging:android:remote or sync:staging:android:embedded first');
  const state = readJson(preparationFile);
  if (process.env.CAPACITOR_STAGING_MODE && process.env.CAPACITOR_STAGING_MODE !== state.mode) {
    throw new Error('CAPACITOR_STAGING_MODE differs from the prepared mode');
  }
  verifyPreparation(state);
  console.log(`Verified Android Staging mode: ${state.mode}`);
}
