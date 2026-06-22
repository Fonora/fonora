import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'vendor', 'onnx');

/** Must match piper-tts-web's bundled onnxruntime-web (see package.json → onnxruntime-web). */
const ONNX_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
];

const ONNX_SRC_CANDIDATES = [
  join(root, 'node_modules', 'onnxruntime-web', 'dist'),
  join(root, 'node_modules', 'piper-tts-web', 'node_modules', 'onnxruntime-web', 'dist'),
];

const src = ONNX_SRC_CANDIDATES.find((dir) => existsSync(join(dir, ONNX_FILES[0])));

if (!src) {
  console.error(
    'onnxruntime-web dist not found. Run npm install — onnxruntime-web must match piper-tts-web (1.20.x).',
  );
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of ONNX_FILES) {
  const from = join(src, file);
  if (!existsSync(from)) {
    console.error(`Missing ONNX Runtime asset: ${from}`);
    process.exit(1);
  }
  cpSync(from, join(dest, file));
  copied += 1;
}

console.log(`Copied ${copied} ONNX Runtime WASM files from ${src} → vendor/onnx/`);
