import fs from 'node:fs/promises';
import sharp from 'sharp';

// Deterministic resampling of the supplied artwork. Original and PWA assets stay intact.
const root = new URL('../android/app/src/main/res/', import.meta.url);
const source = new URL('../resources/icon-staging.png', import.meta.url);
const input = await fs.readFile(source);
for (const [density, scale] of Object.entries({ ldpi: .75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const directory = new URL(`mipmap-${density}/`, root);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, dp, fraction, round] of [
    ['ic_launcher_staging', 48, .68, false],
    ['ic_launcher_staging_round', 48, .68, true],
    // Artwork fits completely inside the 66dp safe circle of a 108dp layer.
    ['ic_launcher_staging_foreground', 108, .42, false],
  ]) {
    const size = Math.round(dp * scale);
    const artwork = await sharp(input).resize(Math.round(size * fraction)).png().toBuffer();
    let result = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
      .composite([{ input: artwork, gravity: 'centre' }]).png().toBuffer();
    if (round) result = await sharp(result).composite([{ input: Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    await fs.writeFile(new URL(`${name}.png`, directory), result);
  }
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@android:color/white" />
    <foreground android:drawable="@mipmap/ic_launcher_staging_foreground" />
</adaptive-icon>
`;
for (const name of ['ic_launcher_staging', 'ic_launcher_staging_round']) {
  await fs.writeFile(new URL(`mipmap-anydpi-v26/${name}.xml`, root), adaptive);
}
