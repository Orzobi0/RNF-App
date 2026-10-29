import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStaging } from './check-staging.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (process.argv.length !== 2) throw new Error('Environment overrides are forbidden');
checkStaging(true);
const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], {
  stdio: 'inherit', env: { ...process.env, CAPACITOR_ENV: 'staging', DEBUG: '' },
});
if (result.error || result.status !== 0) throw new Error('Capacitor staging sync failed');
