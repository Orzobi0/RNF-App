import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';

test('Gradle selects only Staging icons and retains production references and Gradle 9 execution', async () => {
  const gradle = await fs.readFile('android/app/build.gradle', 'utf8');
  const manifest = await fs.readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(gradle, /fertiliAppIcon: stagingFirebase \? '@mipmap\/ic_launcher_staging' : '@mipmap\/ic_launcher'/);
  assert.match(gradle, /fertiliAppRoundIcon: stagingFirebase \? '@mipmap\/ic_launcher_staging_round' : '@mipmap\/ic_launcher_round'/);
  assert.match(gradle, /providers\.exec/);
  assert.match(gradle, /result\.get\(\)\.assertNormalExitValue\(\)/);
  assert.match(manifest, /android:icon="\$\{fertiliAppIcon\}"/);
  assert.match(manifest, /android:roundIcon="\$\{fertiliAppRoundIcon\}"/);
  assert.match(gradle, /FertiliApp Pruebas/);
  assert.match(gradle, /com\.fertiliapp\.fertiliapp\.staging/);
});

test('all six densities preserve the yellow badge within round and adaptive safe areas', async () => {
  for (const [density, scale] of Object.entries({ ldpi: .75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    for (const [name, dp, radius] of [['ic_launcher_staging', 48, .5],
      ['ic_launcher_staging_round', 48, .5], ['ic_launcher_staging_foreground', 108, 33 / 108]]) {
      const { data, info } = await sharp(`android/app/src/main/res/mipmap-${density}/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, Math.round(dp * scale)); assert.equal(info.height, info.width);
      let yellow = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        if (data[i] > 180 && data[i + 1] > 140 && data[i + 2] < 100 && data[i + 3] > 200) {
          yellow++;
          assert.ok(Math.hypot(x + .5 - info.width / 2, y + .5 - info.height / 2) < radius * info.width,
            `${name}/${density}: badge clipped`);
        }
      }
      assert.ok(yellow > 10, `${name}/${density}: missing badge`);
    }
  }
  for (const name of ['ic_launcher_staging', 'ic_launcher_staging_round']) {
    const xml = await fs.readFile(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`, 'utf8');
    assert.match(xml, /@mipmap\/ic_launcher_staging_foreground/);
    assert.match(xml, /@android:color\/white/);
  }
});
