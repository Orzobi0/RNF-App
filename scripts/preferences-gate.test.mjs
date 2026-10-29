import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFrontend, hooks } from './helpers/load-frontend.mjs';

async function setup(t, withLayout = false, error = false) {
  const h = hooks();
  const timers = new Map();
  let now = 0, serial = 0, retries = 0, reloads = 0;
  const auth = { preferencesReady: false, preferencesError: error, retryPreferences: () => { retries++; auth.preferencesError = false; } };
  const { PreferencesGate } = await loadFrontend('src/App.jsx', {
    ...h.bindings, lazy: () => null, useAuth: () => auth, MainLayout: 'layout',
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), window: { location: { reload: () => { reloads++; } } },
  }, ['PreferencesGate']);
  const child = { type: 'interpretation' };
  const render = () => {
    // Flush effects and their state updates, as React does before the next interaction.
    const wrapper = () => ({ props: { value: PreferencesGate({ children: child, withLayout }) } });
    h.render(wrapper);
    return h.render(wrapper);
  };
  const advance = ms => {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  };
  const buttons = tree => {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(buttons);
    return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)];
  };
  t.after(() => h.cleanup());
  return { auth, child, render, advance, buttons, cleanup: h.cleanup, timers, counts: () => ({ retries, reloads }) };
}

for (const withLayout of [false, true]) {
  const route = withLayout ? 'ChartPage' : 'Dashboard';
  test(`${route}: quick preferences hide recovery and never bypass the gate`, async t => {
    const h = await setup(t, withLayout);
    assert.notEqual(h.render(), h.child);
    assert.equal(h.buttons(h.render()).length, 0);
    h.advance(1000);
    h.auth.preferencesReady = true;
    assert.equal(h.render(), h.child);
    assert.equal(h.timers.size, 0);
    h.advance(10000);
    assert.equal(h.render(), h.child);
    assert.deepEqual(h.counts(), { retries: 0, reloads: 0 });
  });
  test(`${route}: slow load exposes both actions at eight seconds without automatic requests`, async t => {
    const h = await setup(t, withLayout);
    h.render(); h.advance(7999);
    assert.equal(h.buttons(h.render()).length, 0);
    h.advance(1);
    const tree = h.render();
    assert.notEqual(tree, h.child);
    assert.deepEqual(h.buttons(tree).map(b => b.props.children[0]), ['Reintentar carga', 'Recargar aplicación']);
    assert.deepEqual(h.counts(), { retries: 0, reloads: 0 });
    h.buttons(tree)[1].props.onClick();
    assert.equal(h.counts().reloads, 1);
  });
  test(`${route}: immediate error, repeated clicks, offline failure and successful retry`, async t => {
    const h = await setup(t, withLayout, true);
    const [retry] = h.buttons(h.render());
    assert.ok(retry);
    retry.props.onClick(); retry.props.onClick();
    assert.equal(h.counts().retries, 1);
    let buttons = h.buttons(h.render());
    assert.equal(buttons[0].props.disabled, true);
    assert.equal(buttons[1].props.disabled, undefined);
    assert.notEqual(h.render(), h.child);
    h.auth.preferencesError = true; // Failed offline read completes the background attempt.
    buttons = h.buttons(h.render());
    assert.equal(buttons[0].props.disabled, false);
    buttons[0].props.onClick(); h.render();
    assert.equal(h.counts().retries, 2);
    h.auth.preferencesReady = true;
    assert.equal(h.render(), h.child);
    assert.equal(h.counts().reloads, 0);
  });
}

test('unmount clears the recovery timer', async t => {
  const h = await setup(t);
  h.render(); assert.equal(h.timers.size, 1);
  h.cleanup(); assert.equal(h.timers.size, 0);
});

test('an immediately failed retry remains retryable even when React batches the error transitions', async t => {
  const h = await setup(t, false, true);
  h.auth.retryPreferences = () => { h.auth.preferencesError = true; };
  h.buttons(h.render())[0].props.onClick();
  assert.equal(h.buttons(h.render())[0].props.disabled, false);
  assert.notEqual(h.render(), h.child);
});

test('Dashboard and ChartPage remain wrapped by PreferencesGate', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /<PreferencesGate><DashboardPage\s*\/><\/PreferencesGate>/);
  assert.match(source, /<PreferencesGate withLayout><ChartPage\s*\/><\/PreferencesGate>/);
});
