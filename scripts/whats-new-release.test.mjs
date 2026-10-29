import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontend, hooks, flush } from './helpers/load-frontend.mjs';

async function setup(t, { future = false, seen = '', restricted = false, synced = true } = {}) {
  const h = hooks();
  const flags = new Map();
  const writes = [];
  const auth = { user: { uid: 'a' }, preferences: { lastSeenWhatsNewVersion: seen },
    preferencesReady: true, preferencesSynced: synced, loadingAuth: false, restoringSession: false,
    savePreferences: async patch => { writes.push(patch); auth.preferences = { ...auth.preferences, ...patch }; },
  };
  const window = { localStorage: {
    getItem: key => { if (restricted) throw Error('restricted'); return flags.get(key); },
    setItem: (key, value) => { if (restricted) throw Error('restricted'); flags.set(key, value); },
    removeItem: key => flags.delete(key),
  }, addEventListener() {}, removeEventListener() {} };
  const api = await loadFrontend('src/contexts/WhatsNewContext.jsx', { ...h.bindings, window, useAuth: () => auth },
    ['WhatsNewProvider', 'WHATS_NEW_VERSION'], s => future ? s.replace("'2026-10-mejoras'", "'future-test'").replace('WHATS_NEW_ANNOUNCEMENT_ENABLED = false', 'WHATS_NEW_ANNOUNCEMENT_ENABLED = true') : s);
  const state = () => h.render(api.WhatsNewProvider);
  t.after(() => h.cleanup());
  return { state, auth, writes, flags, version: api.WHATS_NEW_VERSION };
}
for (const [name, options] of [
  ['old account', { seen: '2026-06-interpretacion' }], ['never opened', {}],
  ['new account', { seen: undefined }], ['offline', { synced: false }],
  ['restricted storage', { restricted: true }],
]) test('silent release: ' + name, async t => {
  const h = await setup(t, options);
  assert.equal(h.version, '2026-10-mejoras');
  assert.equal(h.state().modalSeen, true);
  assert.equal(h.state().hasUnseenSupport, false);
  assert.equal(h.state().hasUnseenChartInterpretation, false);
  h.state().markModalSeen(); await flush();
  assert.equal(h.writes.length, 0);
  assert.equal(h.flags.size, 0);
});
test('future announcement dismisses once even with restricted storage and late sync', async t => {
  const h = await setup(t, { future: true, restricted: true });
  assert.equal(h.state().modalSeen, false);
  assert.equal(h.state().hasUnseenSupport, false);
  h.state().markModalSeen(); await flush();
  h.auth.preferences = { lastSeenWhatsNewVersion: '' };
  assert.equal(h.state().modalSeen, true);
  h.state().markModalSeen(); await flush();
  assert.equal(h.writes.length, 1);
});
test('future announcement respects remote acknowledgement on a second device', async t => {
  const first = await setup(t, { future: true });
  first.state().markModalSeen(); await flush();
  const second = await setup(t, { future: true, seen: first.writes[0].lastSeenWhatsNewVersion });
  assert.equal(second.state().modalSeen, true);
  assert.equal(second.writes.length, 0);
});
test('future announcement waits for remote preferences to avoid a cached false positive', async t => {
  const h = await setup(t, { future: true, synced: false });
  assert.equal(h.state().modalSeen, true);
  h.auth.preferencesSynced = true;
  h.auth.preferences = { lastSeenWhatsNewVersion: 'future-test' };
  assert.equal(h.state().modalSeen, true);
});
