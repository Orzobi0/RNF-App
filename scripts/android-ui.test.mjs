import test from 'node:test';
import assert from 'node:assert/strict';
import { isFemometerPrototypeEnabled } from '../src/lib/appFeatures.js';

test('staging exposes thermometer without a local flag; production remains opt-in', () => {
  assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: 'staging' }), true);
  assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: 'production' }), false);
  assert.equal(isFemometerPrototypeEnabled({}), false);
  for (const environment of ['staging', 'production']) {
    assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: environment, VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE: 'false' }), false);
    assert.equal(isFemometerPrototypeEnabled({ VITE_APP_ENV: environment, VITE_ENABLE_FEMOMETER_BLE_PROTOTYPE: 'true' }), true);
  }
});

test('install instructions are suppressed in native apps even with forceVisible', async () => {
  const { createServer } = await import('vite');
  const { Capacitor } = await import('@capacitor/core');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const server = await createServer({ mode: 'staging', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const original = Capacitor.isNativePlatform;
  try {
    const { default: InstallPrompt } = await server.ssrLoadModule('/src/components/InstallPrompt.jsx');
    Capacitor.isNativePlatform = () => true;
    assert.equal(renderToStaticMarkup(React.createElement(InstallPrompt, { forceVisible: true })), '');
    Capacitor.isNativePlatform = () => false;
    assert.match(renderToStaticMarkup(React.createElement(InstallPrompt, { forceVisible: true })), /Abre el menú del navegador/);
  } finally {
    Capacitor.isNativePlatform = original;
    await server.close();
  }
});
