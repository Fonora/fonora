import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'espeak-ng', 'dist');
const dest = join(root, 'vendor', 'espeak-ng');

if (!existsSync(src)) {
  console.warn('espeak-ng not installed; run npm install first.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('Copied espeak-ng WASM bundle to vendor/espeak-ng/');
