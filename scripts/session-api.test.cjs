const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const express = require('../.firebase/session-staging/node_modules/express');
const admin = require('../.firebase/session-staging/node_modules/firebase-admin');
const exported = require('../.firebase/session-staging');

test('isolated session package uses staging Admin SDK and exports no other functions', () => {
  assert.deepEqual(Object.keys(exported), ['sessionApi']);
  assert.equal(admin.app().options.projectId, 'fertiliapp-staging');
  assert.equal(exported.sessionApi.__endpoint.platform, 'gcfv2');
  assert.equal(exported.sessionApi.__endpoint.secretEnvironmentVariables, undefined);
});

test('staging entry point refuses production runtime before initialization', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./.firebase/session-staging')"], {
    encoding: 'utf8', env: {...process.env, GCLOUD_PROJECT: 'rnf-app'},
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot run in another project/);
});

test('session endpoints handle missing credentials without remote Auth calls', async () => {
  const app = express();
  app.use(express.json());
  app.use(exported.sessionApi);
  const server = await new Promise(resolve => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['sessionRestore', 'sessionMe']) {
      const result = await fetch(`${base}/api/${route}`);
      assert.equal(result.status, 401);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await result.json(), {ok: false, code: 'missing_session'});
    }
    const login = await fetch(`${base}/api/sessionLogin`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    assert.equal(login.status, 400);
    assert.deepEqual(await login.json(), {ok: false, code: 'missing_id_token'});
    const logout = await fetch(`${base}/api/sessionLogout`, {method: 'POST'});
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /__session=;.*HttpOnly; Secure; SameSite=Lax; Max-Age=0/);
    const unknown = await fetch(`${base}/api/unknown`);
    assert.equal(unknown.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Admin SDK rejects a token addressed to production', async () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({alg:'RS256',kid:'synthetic'})}.${encode({aud:'rnf-app',iss:'https://securetoken.google.com/rnf-app',sub:'synthetic',iat:1,exp:9999999999})}.synthetic`;
  await assert.rejects(admin.auth().verifyIdToken(token), /incorrect.*aud|aud.*claim/i);
});
