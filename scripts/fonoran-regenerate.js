#!/usr/bin/env node
/**
 * Generator pipeline: promote accepted proposals into the seeds, re-rank, build.
 *
 * Usage:
 *   npm run fonoran:regenerate
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRegenerate } from '../tools/fonoran-regen.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const result = await runRegenerate({ baseDir: ROOT, approveAll: true });
  for (const step of result.steps) {
    console.log(`✓ ${step.step}`, JSON.stringify(step, null, 0).slice(0, 120));
  }
  console.log('\nRegenerate complete.');
  console.log('Verify: npm run test:translator');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
