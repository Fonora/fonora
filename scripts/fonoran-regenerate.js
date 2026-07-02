#!/usr/bin/env node
/**
 * Generator pipeline: editorial import → LLM optimize → build.
 *
 * Usage:
 *   npm run fonoran:regenerate
 *   npm run fonoran:regenerate -- --use-llm
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRegenerate } from '../tools/fonoran-regen.js';
import { closeStore } from '../tools/fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const applyLlm = process.argv.includes('--use-llm');

try {
  const result = await runRegenerate({ baseDir: ROOT, applyLlm, approveAll: true });
  for (const step of result.steps) {
    console.log(`✓ ${step.step}`, JSON.stringify(step, null, 0).slice(0, 120));
  }
  console.log('\nRegenerate complete.');
  console.log('Verify: npm run test:translator');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeStore();
}
