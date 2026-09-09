import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { validateFirebaseEnvironment } from '../src/lib/firebaseEnvironment.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const PROJECT = 'rnf-app';
const NUMBER = '771820334247';
const SITE = 'rnf-app-experiment';
const CONFIG = 'firebase.experiment.json';
const json = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

export function validateExperimentConfig(rc, config, env) {
  validateFirebaseEnvironment({ ...env, VITE_APP_ENV: 'production' });
  if (env.VITE_FIREBASE_AUTH_DOMAIN !== `${PROJECT}.firebaseapp.com` ||
      env.VITE_FIREBASE_MESSAGING_SENDER_ID !== NUMBER ||
      !env.VITE_FIREBASE_APP_ID.startsWith(`1:${NUMBER}:web:`) ||
      (env.VITE_FIREBASE_STORAGE_BUCKET && ![
        `${PROJECT}.appspot.com`, `${PROJECT}.firebasestorage.app`,
      ].includes(env.VITE_FIREBASE_STORAGE_BUCKET))) throw new Error('Mixed experiment backend configuration');
  const targets = rc.targets?.[PROJECT]?.hosting?.experiment;
  if (!Array.isArray(targets) || targets.length !== 1 || targets[0] !== SITE) throw new Error('Wrong experiment Hosting target');
  const hosting = config.hosting;
  if (Object.keys(config).join() !== 'hosting' || !hosting || Array.isArray(hosting) ||
      Object.keys(hosting).some(key => !['target', 'public', 'ignore', 'headers', 'rewrites'].includes(key)) ||
      hosting.target !== 'experiment' || hosting.public !== 'dist' ||
      JSON.stringify(hosting.rewrites) !== JSON.stringify([
        { source: '/api/**', function: { functionId: 'sessionApi', region: 'us-central1' } },
        { source: '**', destination: '/index.html' },
      ])) throw new Error('Experiment configuration must contain only its Hosting site and sessionApi rewrite');
}

// Dependency injection lets tests exercise failure paths without accessing Firebase.
export async function runExperimentDeployment({ checkLocal, cli, build, checkOnly = false }) {
  checkLocal();
  const projects = cli(['projects:list', '--project', PROJECT, '--json'], true);
  if (!projects.result?.some(p => p.projectId === PROJECT && String(p.projectNumber) === NUMBER)) throw new Error('Production project identity not verified');
  const sites = cli(['hosting:sites:list', '--project', PROJECT, '--json'], true);
  if (!sites.result?.sites?.some(s =>
    [`projects/${PROJECT}/sites/${SITE}`, `projects/${NUMBER}/sites/${SITE}`].includes(s.name) &&
    s.defaultUrl === `https://${SITE}.web.app`)) throw new Error('Experiment site not verified in the production project');
  const functions = cli(['functions:list', '--project', PROJECT, '--json'], true);
  if (!functions.result?.some(f =>
    (f.id === 'sessionApi' || f.name?.endsWith('/sessionApi')) &&
    (f.region === 'us-central1' || f.name?.includes('/locations/us-central1/')))) throw new Error('Production sessionApi dependency not verified');
  await build();
  checkLocal();
  console.log(`Verified: ${PROJECT} (${NUMBER}), Hosting ${SITE}, production backend.`);
  if (checkOnly) {
    console.log('Check complete. Nothing deployed.');
    return;
  }
  console.log('Publishing experiment frontend; it uses real production Auth, data and Functions.');
  cli(['deploy', '--project', PROJECT, '--config', CONFIG, '--only', 'hosting:experiment', '--non-interactive']);
}

function buildFingerprint() {
  const files = {};
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in experiment build');
      if (entry.isDirectory()) walk(file);
      else files[path.relative(path.join(root, 'dist'), file).replaceAll('\\', '/')] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  };
  walk(path.join(root, 'dist'));
  if (!files['index.html'] || !files['sw.js'] || !files['manifest.json'] || files['staging-build.json']) throw new Error('Missing production build or staging output found');
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Only --check is accepted; project/config overrides are forbidden');
  process.chdir(root);
  const windows = process.platform === 'win32';
  const firebase = windows ? path.join(process.env.APPDATA, 'npm/firebase.cmd') : 'firebase';
  let fingerprint;
  const checkLocal = () => {
    for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
      if (process.env[key] && process.env[key] !== PROJECT) throw new Error('Conflicting deployment project in environment');
    }
    validateExperimentConfig(json('.firebaserc'), json(CONFIG), loadEnv('production', root, 'VITE_'));
    if (fingerprint && buildFingerprint() !== fingerprint) throw new Error('Experiment build changed before deployment');
  };
  const cli = (args, capture = false) => {
    const result = spawnSync(firebase, args, { cwd: root, shell: windows, encoding: 'utf8',
      stdio: capture ? 'pipe' : 'inherit', env: { ...process.env, DEBUG: '' } });
    if (result.error || result.status !== 0) throw new Error('Firebase CLI failed; no subsequent action attempted');
    return capture ? JSON.parse(result.stdout) : undefined;
  };
  const build = () => {
    // Always rebuild; never publish a stale dist left by a staging or older build.
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'production'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, DEBUG: '' },
    });
    if (result.error || result.status !== 0) throw new Error('Production build failed; nothing deployed');
    fingerprint = buildFingerprint();
  };
  await runExperimentDeployment({ checkLocal, cli, build, checkOnly: args[0] === '--check' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
