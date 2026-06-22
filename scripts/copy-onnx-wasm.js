import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'vendor', 'onnx');

if (!existsSync(src)) {
  console.warn('onnxruntime-web not installed; run npm install first.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.mjs',
]) {
  const from = join(src, file);
  if (existsSync(from)) {
    cpSync(from, join(dest, file));
  }
}
console.log('Copied ONNX Runtime WASM bundle to vendor/onnx/');
