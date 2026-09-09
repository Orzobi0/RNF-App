import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runExperimentDeployment, validateExperimentConfig } from './deploy-experiment.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const env = {
  VITE_FIREBASE_API_KEY: 'synthetic-build-only-key',
  VITE_FIREBASE_PROJECT_ID: 'rnf-app',
  VITE_FIREBASE_AUTH_DOMAIN: 'rnf-app.firebaseapp.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '771820334247',
  VITE_FIREBASE_APP_ID: '1:771820334247:web:synthetic',
};
const remote = {
  'projects:list': { result: [{ projectId: 'rnf-app', projectNumber: '771820334247' }] },
  'hosting:sites:list': { result: { sites: [{ name: 'projects/771820334247/sites/rnf-app-experiment', defaultUrl: 'https://rnf-app-experiment.web.app' }] } },
  'functions:list': { result: [{ id: 'sessionApi', region: 'us-central1' }] },
};
function harness(overrides = {}) {
  const commands = [];
  let built = false;
  return {
    commands,
    options: {
      checkLocal: () => validateExperimentConfig(read('.firebaserc'), read('firebase.experiment.json'), env),
      cli: args => {
        commands.push(args);
        assert.equal(args[args.indexOf('--project') + 1], 'rnf-app');
        if (args[0] === 'deploy') assert.equal(built, true);
        return (Object.hasOwn(overrides, args[0]) ? overrides : remote)[args[0]];
      },
      build: () => { built = true; },
    },
  };
}
test('experiment rejects a main-site target, extra backend scope, and mixed Firebase config', () => {
  const rc = read('.firebaserc'), config = read('firebase.experiment.json');
  validateExperimentConfig(rc, config, env);
  const wrongTarget = structuredClone(rc);
  wrongTarget.targets['rnf-app'].hosting.experiment = ['rnf-app'];
  assert.throws(() => validateExperimentConfig(wrongTarget, config, env), /target/);
  assert.throws(() => validateExperimentConfig(rc, { ...config, firestore: {} }, env), /only/);
  for (const key of ['PROJECT_ID', 'AUTH_DOMAIN', 'MESSAGING_SENDER_ID', 'APP_ID', 'STORAGE_BUCKET']) {
    assert.throws(() => validateExperimentConfig(rc, config, { ...env, [`VITE_FIREBASE_${key}`]: 'fertiliapp-staging' }));
  }
});
test('deployment stops on wrong project, missing site, or missing session dependency', async () => {
  for (const [command, response] of [
    ['projects:list', { result: [{ projectId: 'rnf-app', projectNumber: '574564111406' }] }],
    ['hosting:sites:list', { result: { sites: [{ name: 'projects/771820334247/sites/rnf-app' }] } }],
    ['functions:list', { result: [] }],
  ]) {
    const h = harness({ [command]: response });
    await assert.rejects(runExperimentDeployment(h.options), /not verified/);
    assert(!h.commands.some(args => args[0] === 'deploy'));
  }
});
test('check mode only reads Firebase and builds', async () => {
  const h = harness();
  await runExperimentDeployment({ ...h.options, checkOnly: true });
  assert.deepEqual(h.commands.map(args => args[0]), ['projects:list', 'hosting:sites:list', 'functions:list']);
});
test('successful deploy selects only experiment and build failure blocks publication', async () => {
  const h = harness();
  await runExperimentDeployment(h.options);
  assert.deepEqual(h.commands.at(-1), ['deploy', '--project', 'rnf-app', '--config', 'firebase.experiment.json', '--only', 'hosting:experiment', '--non-interactive']);
  const failed = harness();
  await assert.rejects(runExperimentDeployment({ ...failed.options, build: () => { throw new Error('build failed'); } }), /build failed/);
  assert(!failed.commands.some(args => args[0] === 'deploy'));
});
test('extra arguments cannot override project, config or deployment scope', () => {
  const result = spawnSync(process.execPath, ['scripts/deploy-experiment.mjs', '--project', 'fertiliapp-staging'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /overrides are forbidden/);
});
