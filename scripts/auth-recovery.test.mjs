import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontend, hooks, deferred, flush } from './helpers/load-frontend.mjs';
import { withDeadline, createOperationGuard } from '../src/lib/sessionRecovery.js';
import { authActionUrl } from '../src/lib/androidRuntime.js';
import { PREFERENCE_DEFAULTS, normalizeStoredPreferences, normalizePreferencePatch } from '../src/lib/preferences/index.js';

const account = uid => ({ uid, email: uid + '@example.test', providerData: [] });
const snap = data => ({ exists: () => data !== null, data: () => data, metadata: { fromCache: false } });
async function setup(t, options = {}) {
  const h = hooks();
  const auth = { currentUser: options.user ?? null, authStateReady: () => options.initialize?.() ?? options.ready ?? Promise.resolve() };
  const listeners = new Map();
  let observer, before;
  let tokenCalls = 0, restoreCalls = 0, sdkCalls = 0;
  const timers = new Set();
  const emit = user => { before?.(user); auth.currentUser = user; observer?.(user); };
  const storageData = options.storageData ?? new Map();
  const storage = {
    getItem: key => { if (options.storageError) throw Error('restricted'); return storageData.get(key) ?? null; },
    setItem: (key, value) => { if (options.storageError) throw Error('restricted'); storageData.set(key, value); },
    removeItem: key => { if (options.storageError) throw Error('restricted'); storageData.delete(key); },
  };
  const toasts = [];
  const requests = [];
  const bindings = {
    ...h.bindings, auth, db: {}, authPersistenceReady: options.persistence ?? Promise.resolve(),
    isEmbeddedAndroid: () => Boolean(options.embedded),
    authActionUrl: path => authActionUrl(path, Boolean(options.embedded), 'staging', 'http://localhost'),
    SESSION_RECOVERY_TIMEOUT_MS: 12000, createOperationGuard,
    withDeadline: promise => withDeadline(promise, 60),
    setTimeout: fn => { const id = setTimeout(fn, 60); timers.add(id); return id; }, clearTimeout,
    window: { matchMedia: () => ({}), location: { origin: 'http://localhost' }, addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) },
    document: { visibilityState: 'visible', addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) },
    navigator: { storage: { persist: () => new Promise(() => {}), persisted: () => new Promise(() => {}) } },
    localStorage: storage, sessionStorage: storage,
    useToast: () => ({ toast: value => toasts.push(value) }), getAuthErrorMessage: () => '',
    PREFERENCE_DEFAULTS, normalizeStoredPreferences, normalizePreferencePatch,
    trackEvent() {}, trackLogin() {}, trackSignUp() {}, setAnalyticsUserId() {}, trackUserActiveDay() {},
    onIdTokenChanged: (_, fn) => { observer = fn; queueMicrotask(() => fn(auth.currentUser)); return () => { observer = null; }; },
    beforeAuthStateChanged: (_, fn) => { before = fn; return () => { before = null; }; },
    getIdToken: () => { tokenCalls++; return options.token?.() ?? Promise.resolve('token'); },
    signInWithCustomToken: async () => { sdkCalls++; await options.sdk?.(); emit(account('restored')); return { user: auth.currentUser }; },
    signInWithEmailAndPassword: async (_, email) => { await options.login?.(email); emit(account(email)); return { user: auth.currentUser }; },
    createUserWithEmailAndPassword: async (_, email) => { emit(account(email)); return { user: auth.currentUser }; },
    sendEmailVerification: async (_, settings) => options.action?.(settings),
    sendPasswordResetEmail: async (_, email, settings) => options.action?.(settings),
    verifyBeforeUpdateEmail: async (_, email, settings) => options.action?.(settings),
    reload: async user => options.reload?.(user),
    signOut: async () => emit(null),
    doc: (...args) => args.join('/'), deleteField: () => null,
    getDocFromCache: () => options.cache?.() ?? Promise.reject(Error('no-cache')),
    getDoc: () => options.prefs?.() ?? Promise.resolve(snap({})),
    setDoc: async () => {},
    fetch: async (url, init) => {
      requests.push(url);
      if (url === '/api/sessionLogout' && options.logout) return options.logout(init);
      if (url === '/api/sessionLogin' && options.refresh) return options.refresh(init);
      if (url !== '/api/sessionRestore') return { ok: true, json: async () => ({}) };
      restoreCalls++;
      if (options.restore) return options.restore(init);
      return { ok: false, status: 401, json: async () => ({}) };
    },
  };
  const { AuthProvider } = await loadFrontend('src/contexts/AuthContext.jsx', bindings, ['AuthProvider']);
  const state = () => h.render(AuthProvider);
  state(); await flush(); await flush();
  t.after(() => { h.cleanup(); timers.forEach(clearTimeout); });
  return { state, emit, listeners, auth, storageData, toasts, requests, calls: () => ({ tokenCalls, restoreCalls, sdkCalls }) };
}
const okRestore = async () => ({ ok: true, json: async () => ({ customToken: 'test' }) });

for (const mode of ['verifyEmail', 'verifyAndChangeEmail', 'resetPassword']) {
  test(`existing browser action page handles Staging ${mode} without a local app session`, async t => {
    const h = hooks();
    const calls = [];
    const navigate = path => calls.push(['navigate', path]);
    const params = new URLSearchParams({ mode, oobCode: 'synthetic-code', continueUrl: 'https://fertiliapp-staging.web.app/auth' });
    const { AuthActionPage } = await loadFrontend('src/pages/AuthActionPage.jsx', {
      ...h.bindings, auth: { currentUser: null }, useAuth: () => ({}),
      useSearchParams: () => [params], useNavigate: () => navigate,
      window: { location: { origin: 'https://fertiliapp-staging.web.app' }, setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {} },
      applyActionCode: async (_, code) => calls.push(['apply', code]),
      verifyPasswordResetCode: async (_, code) => { calls.push(['verify-reset', code]); return 'synthetic@example.test'; },
      confirmPasswordReset: async (_, code) => calls.push(['confirm-reset', code]),
      getAuthErrorMessage: () => '', motion: { div: 'div' }, Button: 'button', Input: 'input', Label: 'label', Eye: 'eye', EyeOff: 'eye-off',
    }, ['AuthActionPage']);
    h.render(AuthActionPage); await flush(); await flush();
    assert.deepEqual(calls[0], [mode === 'resetPassword' ? 'verify-reset' : 'apply', 'synthetic-code']);
    if (mode !== 'resetPassword') assert.deepEqual(calls[1], ['navigate', mode === 'verifyEmail' ? '/auth?verified=1' : '/auth']);
    else {
      const find = (node, predicate) => {
        if (!node || typeof node !== 'object') return null;
        if (predicate(node)) return node;
        for (const child of [node.props?.children].flat(Infinity)) {
          const result = find(child, predicate);
          if (result) return result;
        }
        return null;
      };
      const render = () => h.render(() => ({ props: { value: AuthActionPage() } }));
      const tree = render();
      for (const id of ['newPassword', 'confirmPassword']) {
        find(tree, node => node.props?.id === id).props.onChange({ target: { value: 'synthetic-test-password' } });
      }
      await find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      await flush();
      assert.deepEqual(calls.slice(1), [['confirm-reset', 'synthetic-code'], ['navigate', '/auth?reset=1']]);
    }
    t.after(() => h.cleanup());
  });
}

test('embedded boot waits for persistence and SDK hydration before showing login', async t => {
  const persistence = deferred(), ready = deferred();
  const h = await setup(t, { embedded: true, persistence: persistence.promise, ready: ready.promise });
  assert.equal(h.state().loadingAuth, true);
  assert.equal(h.state().sessionError, false);
  persistence.resolve(); await flush();
  assert.equal(h.state().loadingAuth, true);
  ready.resolve(); await flush(); await flush();
  assert.equal(h.state().loadingAuth, false);
  assert.equal(h.state().sessionError, false);
  assert.equal(h.state().user, null);
  h.listeners.get('online')(); await flush();
  assert.deepEqual(h.requests, []);
});

test('embedded persisted user enters directly and logout survives a fast reopen', async t => {
  const h = await setup(t, { embedded: true, user: account('a') });
  assert.equal(h.state().user.uid, 'a');
  assert.equal(h.state().loadingAuth, false);
  const result = await h.state().logout();
  assert.equal(result.localCleared, true);
  assert.equal(result.backendCleared, false);
  assert.equal(h.toasts.length, 0);
  const reopened = await setup(t, { embedded: true, user: account('a'), storageData: h.storageData });
  assert.equal(reopened.state().user, null);
  assert.equal(reopened.auth.currentUser, null);
  await reopened.state().login('b', 'unused'); await flush();
  assert.equal(reopened.state().user.uid, 'b');
  assert.equal(h.storageData.has('rnf_explicit_logout_v1'), false);
  assert.deepEqual([...h.requests, ...reopened.requests], []);
});

test('embedded logout vetoes a pending login and a subsequent login waits safely', async t => {
  const pending = deferred();
  const h = await setup(t, { embedded: true, login: email => email === 'a' ? pending.promise : undefined });
  const a = h.state().login('a', 'unused');
  const rejected = assert.rejects(a, /stale-local-sign-in/);
  await flush();
  const logout = h.state().logout();
  const b = h.state().login('b', 'unused');
  pending.resolve();
  await rejected; await logout; await b; await flush();
  assert.equal(h.state().user.uid, 'b');
  assert.deepEqual(h.requests, []);
});

test('embedded overlapping account logins cannot install an obsolete user', async t => {
  const pending = deferred();
  const h = await setup(t, { embedded: true, login: email => email === 'a' ? pending.promise : undefined });
  const a = h.state().login('a', 'unused');
  const rejected = assert.rejects(a, /stale-local-sign-in/);
  await flush();
  const b = h.state().login('b', 'unused');
  pending.resolve(); await rejected; await b;
  assert.equal(h.state().user.uid, 'b');
});

test('embedded unavailable marker storage does not trigger cookies or block SDK logout', async t => {
  const h = await setup(t, { embedded: true, storageError: true });
  assert.equal(h.state().sessionError, false);
  await h.state().login('a', 'unused');
  await h.state().logout();
  assert.equal(h.auth.currentUser, null);
  assert.deepEqual(h.requests, []);
});

test('embedded SDK storage initialization failure exposes retry without installing a user', async t => {
  let failing = true;
  const h = await setup(t, { embedded: true, initialize: () => failing ? Promise.reject(Error('storage')) : Promise.resolve() });
  assert.equal(h.state().sessionError, true);
  assert.equal(h.state().user, null);
  failing = false;
  await h.state().retrySession(); await flush();
  assert.equal(h.state().sessionError, false);
  await h.state().login('a', 'unused');
  assert.equal(h.state().user.uid, 'a');
  assert.deepEqual(h.requests, []);
});

for (const embedded of [true, false]) test(`verification resend preserves the correct origin (embedded=${embedded})`, async t => {
  const urls = [];
  const h = await setup(t, { embedded, user: account('a'), action: settings => urls.push(settings.url) });
  await h.state().resendVerificationEmail();
  assert.deepEqual(urls, [embedded ? 'https://fertiliapp-staging.web.app/auth' : 'http://localhost/auth']);
});

test('embedded failed SDK initialization is gated and retryable without cookie fallback', async t => {
  const ready = deferred();
  const h = await setup(t, { embedded: true, ready: ready.promise });
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(h.state().sessionError, true);
  assert.equal(h.state().user, null);
  ready.resolve(); await flush();
  await h.state().retrySession(); await flush();
  assert.equal(h.state().sessionError, false);
  assert.equal(h.state().loadingAuth, false);
  assert.deepEqual(h.requests, []);
});

test('embedded late preferences and resume reload cannot cross accounts', async t => {
  const remote = deferred(), resumed = deferred(); let reads = 0;
  const h = await setup(t, { embedded: true, user: account('a'), reload: () => resumed.promise,
    prefs: () => ++reads === 1 ? remote.promise : Promise.resolve(snap({ showRelationsRow: true })) });
  h.listeners.get('pageshow')(); await flush();
  await h.state().login('b', 'unused'); await flush();
  resumed.resolve(); remote.resolve(snap({ showRelationsRow: false })); await flush();
  assert.equal(h.state().user.uid, 'b');
  assert.equal(h.state().preferences.showRelationsRow, true);
  assert.deepEqual(h.requests, []);
});

test('embedded email actions use HTTPS Staging and resume refreshes the Firebase user', async t => {
  const urls = [];
  const h = await setup(t, { embedded: true, action: settings => urls.push(settings.url),
    reload: user => { user.emailVerified = true; } });
  await h.state().register('new', 'unused');
  await h.state().resetPassword('new');
  await h.state().login('new', 'unused');
  await h.state().resendVerificationEmail(); // reload finds verified, no second email needed
  await h.state().updateEmail('changed@example.test');
  h.listeners.get('pageshow')(); await flush(); await flush();
  assert.equal(h.state().user.emailVerified, true);
  assert.deepEqual(urls, ['https://fertiliapp-staging.web.app/auth',
    'https://fertiliapp-staging.web.app/auth', 'https://fertiliapp-staging.web.app/settings']);
  assert.deepEqual(h.requests, []);
});

test('authenticated boot ignores hanging storage, cookie and preference work', async t => {
  const h = await setup(t, { user: account('a'), prefs: () => new Promise(() => {}) });
  assert.equal(h.state().user.uid, 'a');
  assert.equal(h.state().loadingAuth, false);
  assert.equal(h.state().restoringSession, false);
  assert.equal(h.state().preferencesReady, false);
});
for (const name of ['no session or cookie', 'invalid cookie 401']) test(name, async t => {
  const h = await setup(t);
  assert.equal(h.state().user, null);
  assert.equal(h.state().sessionError, false);
  assert.equal(h.state().loadingAuth, false);
  assert.equal(h.calls().restoreCalls, 1);
});
test('cookie restore installs user and unblocks UI', async t => {
  const h = await setup(t, { restore: okRestore });
  assert.equal(h.state().user.uid, 'restored');
  assert.equal(h.state().loadingAuth, false);
});
test('unresponsive backend is aborted and exposes retry', async t => {
  let aborted = false;
  const h = await setup(t, { restore: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); })) });
  await new Promise(r => setTimeout(r, 85));
  assert.equal(aborted, true);
  assert.equal(h.state().sessionError, true);
  assert.equal(h.state().restoringSession, false);
});
test('network failure can recover on online event', async t => {
  let online = false;
  const h = await setup(t, { restore: () => online ? okRestore() : Promise.reject(Error('network')) });
  assert.equal(h.state().sessionError, true);
  online = true; h.listeners.get('online')(); await flush(); await flush();
  assert.equal(h.state().user.uid, 'restored');
});
test('pageshow and visibilitychange coalesce, preserving valid user on network failure', async t => {
  const token = deferred();
  const h = await setup(t, { user: account('a'), token: () => token.promise });
  const before = h.calls().tokenCalls;
  h.listeners.get('pageshow')(); h.listeners.get('visibilitychange')();
  assert.equal(h.calls().tokenCalls - before, 1);
  assert.equal(h.state().restoringSession, false);
  token.reject(Error('network')); await flush();
  assert.equal(h.state().user.uid, 'a');
});
test('logout during backend restore prevents SDK login', async t => {
  const response = deferred();
  const h = await setup(t, { restore: () => response.promise });
  await h.state().logout(); response.resolve(await okRestore()); await flush();
  assert.equal(h.state().user, null);
  assert.equal(h.calls().sdkCalls, 0);
});
test('logout vetoes an already pending uncancellable SDK restore', async t => {
  const sdk = deferred();
  const h = await setup(t, { restore: okRestore, sdk: () => sdk.promise });
  await h.state().logout(); sdk.resolve(); await flush(); await flush();
  assert.equal(h.auth.currentUser, null);
});
test('another account login makes the old restore response obsolete', async t => {
  const response = deferred();
  const h = await setup(t, { restore: () => response.promise });
  await h.state().login('b', 'unused'); response.resolve(await okRestore()); await flush();
  assert.equal(h.state().user.uid, 'b');
  assert.equal(h.calls().sdkCalls, 0);
});
test('cached preferences are ready before Firestore and late reads cannot overwrite edits', async t => {
  const remote = deferred();
  const h = await setup(t, { user: account('a'), cache: () => Promise.resolve(snap({ showRelationsRow: false })), prefs: () => remote.promise });
  assert.equal(h.state().preferencesReady, true);
  assert.equal(h.state().preferences.showRelationsRow, false);
  await h.state().savePreferences({ showRelationsRow: true });
  remote.resolve(snap({ showRelationsRow: false })); await flush();
  assert.equal(h.state().preferences.showRelationsRow, true);
});
test('failed preferences stay gated, never write defaults, and can retry', async t => {
  let failed = true;
  const h = await setup(t, { user: account('a'), storageError: true, prefs: () => failed ? Promise.reject(Error('offline')) : Promise.resolve(snap({})) });
  assert.equal(h.state().preferencesError, true);
  assert.equal(h.state().preferencesReady, false);
  assert.equal(h.state().loadingAuth, false);
  await assert.rejects(h.state().savePreferences({ showRelationsRow: true }));
  failed = false; h.state().retryPreferences(); await flush(); await flush();
  assert.equal(h.state().preferencesReady, true);
});
test('late preferences from previous account are discarded', async t => {
  const remote = deferred(); let count = 0;
  const h = await setup(t, { user: account('a'), prefs: () => ++count === 1 ? remote.promise : Promise.resolve(snap({ showRelationsRow: true })) });
  await h.state().login('b', 'unused'); await flush();
  remote.resolve(snap({ showRelationsRow: false })); await flush();
  assert.equal(h.state().user.uid, 'b');
  assert.equal(h.state().preferences.showRelationsRow, true);
});

test('SDK restore completing after timeout is vetoed', async t => {
  const sdk = deferred();
  const h = await setup(t, { restore: okRestore, sdk: () => sdk.promise });
  await new Promise(r => setTimeout(r, 85));
  assert.equal(h.state().sessionError, true);
  sdk.resolve(); await flush(); await flush();
  assert.equal(h.auth.currentUser, null);
});
test('external account switch during SDK restore cannot be overwritten', async t => {
  const sdk = deferred();
  const h = await setup(t, { restore: okRestore, sdk: () => sdk.promise });
  h.emit(account('external'));
  sdk.resolve(); await flush(); await flush();
  assert.equal(h.state().user.uid, 'external');
});

test('logout waits for backend acknowledgement and blocks restore after reopening', async t => {
  const reply = deferred();
  const h = await setup(t, { user: account('a'), logout: () => reply.promise });
  let finished = false;
  const task = h.state().logout().then(result => { finished = true; return result; });
  await flush();
  assert.equal(h.auth.currentUser, null);
  assert.equal(finished, false);
  const reopened = await setup(t, { storageData: h.storageData, restore: okRestore });
  assert.equal(reopened.calls().restoreCalls, 0);
  assert.equal(reopened.state().loadingAuth, false);
  reply.resolve({ ok: true, json: async () => ({}) });
  assert.equal((await task).backendCleared, true);
  const again = await setup(t, { storageData: h.storageData, restore: okRestore });
  assert.equal(again.calls().restoreCalls, 0);
});
test('slow logout is bounded, cancels fetch and retains the durable marker', async t => {
  let aborted = false;
  const h = await setup(t, { user: account('a'), logout: ({ signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); });
  }) });
  assert.equal((await h.state().logout()).backendCleared, false);
  assert.equal(aborted, true);
  assert.equal(h.auth.currentUser, null);
  const reopened = await setup(t, { storageData: h.storageData, restore: okRestore });
  assert.equal(reopened.calls().restoreCalls, 0);
});
test('backend error keeps local logout safe, reports incomplete cleanup and survives reopening', async t => {
  const h = await setup(t, { user: account('a'), logout: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assert.equal((await h.state().logout()).backendCleared, false);
  assert.equal(h.toasts.length, 1);
  const reopened = await setup(t, { user: account('a'), storageData: h.storageData, restore: okRestore });
  assert.equal(reopened.auth.currentUser, null);
  assert.equal(reopened.calls().restoreCalls, 0);
});
test('concurrent cookie refresh is aborted and drained before logout request', async t => {
  const events = [];
  const h = await setup(t, { user: account('a'), refresh: ({ signal }) => new Promise((_, reject) => {
    events.push('refresh');
    signal.addEventListener('abort', () => { events.push('abort'); reject(Error('aborted')); });
  }), logout: async () => { events.push('logout'); return { ok: true, json: async () => ({}) }; } });
  await h.state().logout();
  assert.deepEqual(events, ['refresh', 'abort', 'logout']);
});
test('new explicit login waits for cookie cleanup and removes restore suppression only on success', async t => {
  const reply = deferred();
  const h = await setup(t, { user: account('a'), logout: () => reply.promise });
  const logout = h.state().logout();
  await flush();
  const login = h.state().login('b', 'unused');
  await flush();
  assert.equal(h.auth.currentUser, null);
  reply.resolve({ ok: true, json: async () => ({}) });
  await logout; await login; await flush();
  assert.equal(h.auth.currentUser.uid, 'b');
  assert.equal(h.storageData.has('rnf_explicit_logout_v1'), false);
});
test('unavailable storage fails closed for cookie restore without blocking valid Firebase users', async t => {
  const h = await setup(t, { storageError: true, restore: okRestore });
  assert.equal(h.calls().restoreCalls, 0);
  assert.equal(h.state().loadingAuth, false);
  await h.state().login('a', 'unused');
  assert.equal(h.state().user.uid, 'a');
});

test('a failed cookie refresh after explicit login cannot re-enable an old cookie', async t => {
  const storageData = new Map([['rnf_explicit_logout_v1', '1']]);
  const h = await setup(t, { storageData, refresh: async () => { throw Error('offline'); } });
  await h.state().login('b', 'unused'); await flush();
  assert.equal(h.state().user.uid, 'b');
  const reopened = await setup(t, { storageData, restore: okRestore });
  assert.equal(reopened.calls().restoreCalls, 0);
});

test('a background refresh from another live tab cannot clear a newer logout marker', async t => {
  const refresh = deferred();
  const h = await setup(t, { user: account('a'), refresh: () => refresh.promise });
  h.storageData.set('rnf_explicit_logout_v1', 'newer-logout');
  refresh.resolve({ ok: true, json: async () => ({}) }); await flush();
  assert.equal(h.storageData.get('rnf_explicit_logout_v1'), 'newer-logout');
  const reopened = await setup(t, { storageData: h.storageData, restore: okRestore });
  assert.equal(reopened.calls().restoreCalls, 0);
});
