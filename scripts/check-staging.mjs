import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { STAGING_PROJECT, STAGING_APP_ID, validateFirebaseEnvironment } from '../src/lib/firebaseEnvironment.js';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function checkStaging(build = false) {
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== STAGING_PROJECT) throw new Error('Wrong deployment project');
  const env = loadEnv('staging', path.resolve('environments/staging'), 'VITE_');
  validateFirebaseEnvironment({ ...env, VITE_APP_ENV: 'staging' });
  const rc = json('.firebaserc');
  if (rc.projects.staging !== STAGING_PROJECT || rc.targets[STAGING_PROJECT].hosting.staging.join() !== STAGING_PROJECT) throw new Error('Wrong staging target');
  const config = json('firebase.staging.json');
  if (config.firestore || config.storage || config.hosting.target !== 'staging' || config.hosting.public !== 'dist-staging') throw new Error('Unexpected staging deployment scope');
  if (config.functions.length !== 1 || config.functions[0].source !== '.firebase/session-staging' || config.functions[0].codebase !== 'default') throw new Error('Unexpected function source');
  if (config.hosting.rewrites[0].function.functionId !== 'sessionApi' || config.hosting.rewrites[0].function.region !== 'us-central1') throw new Error('Wrong API rewrite');
  if (build) {
    const manifest = json('dist-staging/staging-build.json');
    if (manifest.projectId !== STAGING_PROJECT || manifest.appId !== STAGING_APP_ID || manifest.mode !== 'staging') throw new Error('Wrong build environment');
    if (!manifest.files['index.html'] || !manifest.files['sw.js']) throw new Error('Incomplete staging build');
    const actual = [];
    const walk = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name !== 'staging-build.json') actual.push(path.relative('dist-staging', file).replaceAll('\\', '/'));
      }
    };
    walk('dist-staging');
    if (actual.length !== Object.keys(manifest.files).length) throw new Error('Build file list changed');
    for (const name of actual) {
      const bytes = fs.readFileSync(path.join('dist-staging', name));
      if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]) throw new Error('Staging build changed; rebuild before deploying');
      if (/\.(js|html|json)$/.test(name) && /771820334247|1:771820334247:|https:\/\/rnf-app(?:-experiment)?\./.test(bytes.toString())) throw new Error('Production identifier or endpoint found in staging build');
    }
  }
  console.log(`Verified target: ${STAGING_PROJECT} (574564111406); staging configuration${build ? ' and build hashes' : ''} OK.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkStaging(process.argv.includes('--build'));
