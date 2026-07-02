#!/usr/bin/env node
/**
 * Import editorial seed JSON from data/ into the active store (no lab bucket).
 *
 * Usage:
 *   npm run fonoran:editorial:import
 *   npm run fonoran:editorial:import -- --from=data/
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importEditorialFromSeedPaths } from '../tools/fonoran-store.js';
import { closeStore } from '../tools/fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fromIdx = process.argv.indexOf('--from');
const baseDir = fromIdx !== -1 ? process.argv[fromIdx + 1] : ROOT;

try {
  const result = await importEditorialFromSeedPaths(baseDir);
  console.log(`Imported ${result.docs} editorial doc(s) from ${baseDir}`);
  for (const key of result.keys) {
    console.log(`  ${key}: ${JSON.stringify(result.counts[key] ?? {})}`);
  }
  console.log('Next: npm run fonoran:build:approved');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeStore();
}
