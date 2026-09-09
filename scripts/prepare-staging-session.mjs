import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== 'fertiliapp-staging') {
  throw new Error('Refusing non-staging deployment');
}
const destination = '.firebase/session-staging';
fs.mkdirSync(destination, { recursive: true });
for (const [source, output] of [['functions/authSession.js', 'authSession.js'], ['functions/session-staging.cjs', 'index.js']]) {
  fs.copyFileSync(source, path.join(destination, output));
}
// Reuse the reviewed lockfile exactly. Nodemailer is installed but never imported,
// exported or configured by this isolated entry point; no secret declarations.
const original = JSON.parse(fs.readFileSync('functions/package.json'));
const manifest = { ...original, name: 'functions', main: 'index.js', scripts: {} };
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync('functions/package-lock.json', path.join(destination, 'package-lock.json'));
const allowed = new Set(['authSession.js', 'index.js', 'package.json', 'package-lock.json', 'node_modules']);
if (fs.readdirSync(destination).some(name => !allowed.has(name))) {
  throw new Error('Unexpected file in staging function package; inspect before deployment');
}
console.log('Prepared staging package: sessionApi only, Node 22, no SMTP configuration.');
