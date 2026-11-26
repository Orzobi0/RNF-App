import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStaging } from './check-staging.mjs';
import fs from 'node:fs';
import { preparationFile, recordPreparation, parseMode } from './check-staging-android.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
// Invalidate even on failure: Android Studio must not package the previous mode.
fs.rmSync(preparationFile, { force: true });
const mode = parseMode(process.argv.slice(2));
checkStaging(true);
const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], {
  stdio: 'inherit', env: { ...process.env, CAPACITOR_ENV: 'staging', CAPACITOR_STAGING_MODE: mode, DEBUG: '' },
});
if (result.error || result.status !== 0) throw new Error('Capacitor staging sync failed');
recordPreparation(mode);
console.log(`Android Staging prepared: ${mode}. Ready for Android Studio.`);
