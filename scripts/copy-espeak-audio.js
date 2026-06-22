import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@echogarden', 'espeak-ng-emscripten');
const dest = join(root, 'vendor', 'espeak-audio');

if (!existsSync(src)) {
  console.warn('@echogarden/espeak-ng-emscripten not installed; run npm install first.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of ['espeak-ng.js', 'espeak-ng.data', 'COPYING']) {
  cpSync(join(src, file), join(dest, file));
}
console.log('Copied eSpeak audio WASM bundle to vendor/espeak-audio/');
