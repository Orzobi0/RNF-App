import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
test('Android platform and installed Capacitor packages agree with the lockfile', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  for (const name of ['core', 'android', 'cli', 'app']) {
    const key = `@capacitor/${name}`;
    const version = pkg.dependencies[key];
    assert.match(version, /^8\.\d+\.\d+$/);
    assert.equal(lock.packages[`node_modules/${key}`].version, version);
    assert.equal(JSON.parse(read(`node_modules/${key}/package.json`)).version, version);
  }
  const variables = read('android/variables.gradle');
  assert.match(variables, /minSdkVersion = 26\b/);
  for (const sdk of ['compile', 'target']) assert.match(variables, new RegExp(`${sdk}SdkVersion = 36\\b`));
  const native = read('node_modules/@capacitor/android/capacitor/build.gradle');
  for (const [, name, value] of variables.matchAll(/(\w+Version) = '([^']+)'/g)) {
    if (name === 'coreSplashScreenVersion') {
      assert.equal(value, '1.2.0'); // App template variable, not a core library dependency.
    } else {
      assert.ok(native.includes(`${name} : '${value}'`), `${name}: expected Capacitor default ${value}`);
    }
  }
  assert.match(read('android/app/capacitor.build.gradle'), /sourceCompatibility JavaVersion.VERSION_21/);
  assert.match(read('android/gradle/wrapper/gradle-wrapper.properties'), /gradle-8\.14\.3-bin\.zip/);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /providers\.exec[\s\S]*check-staging-android\.mjs[\s\S]*assertNormalExitValue/);
  assert.match(gradle, /preBuild.dependsOn\('verifyFirebaseEnvironment'\)/);
});
