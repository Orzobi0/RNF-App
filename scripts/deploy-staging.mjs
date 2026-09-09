import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkStaging } from './check-staging.mjs';
const [scope, ...extra] = process.argv.slice(2);
if (!['session', 'hosting'].includes(scope) || extra.length) throw new Error('Choose session or hosting; project/config overrides are forbidden');
checkStaging(scope === 'hosting');
const windows = process.platform === 'win32';
const firebase = windows ? path.join(process.env.APPDATA, 'npm/firebase.cmd') : 'firebase';
if (windows && !fs.existsSync(firebase)) throw new Error('Install Firebase CLI before deploying');
function cli(args, capture = false) {
  const result = spawnSync(firebase, args, { shell: windows, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', env: { ...process.env, DEBUG: '' } });
  if (result.error || result.status !== 0) throw new Error('Firebase CLI failed; no subsequent action attempted');
  return capture ? JSON.parse(result.stdout) : undefined;
}
const projects = cli(['projects:list', '--project', 'fertiliapp-staging', '--json'], true);
if (!projects.result?.some(p => p.projectId === 'fertiliapp-staging' && p.projectNumber === '574564111406')) throw new Error('Staging identity not verified');
if (scope === 'session') {
  // Read first; SERVICE_DISABLED stops here instead of implicitly enabling APIs/IAM.
  cli(['functions:list', '--project', 'fertiliapp-staging', '--json'], true);
  await import('./prepare-staging-session.mjs');
  if (!fs.existsSync('.firebase/session-staging/node_modules/firebase-functions')) throw new Error('Run npm ci --prefix .firebase/session-staging before deployment');
} else {
  const functions = cli(['functions:list', '--project', 'fertiliapp-staging', '--json'], true);
  if (!functions.result?.some(f => (f.id === 'sessionApi' || f.name?.endsWith('/sessionApi')) && (f.region === 'us-central1' || f.name?.includes('/locations/us-central1/')))) throw new Error('Deploy and verify sessionApi before Hosting');
}
console.log('Deploying only the selected component to fertiliapp-staging; no rules, data or support function.');
cli(['deploy', '--project', 'fertiliapp-staging', '--config', 'firebase.staging.json', '--only', scope === 'session' ? 'functions:sessionApi' : 'hosting:staging', '--non-interactive']);
