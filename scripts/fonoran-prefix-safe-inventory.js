#!/usr/bin/env node
/**
 * Regenerate algorithmically prefix-safe CV / CVC inventory.
 *
 *   npm run fonoran:prefix-safe
 *   npm run fonoran:prefix-safe -- --check   # exit 1 if committed JSON is stale or pairs exist
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrefixSafeInventory } from '../tools/fonoran-prefix-safe.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/fonoran-prefix-safe-roots.json');
const checkOnly = process.argv.includes('--check');

const approvedRoots = JSON.parse(await readFile(join(ROOT, 'data/fonoran-approved-roots.json'), 'utf8'));
const phoneticsConfig = JSON.parse(await readFile(join(ROOT, 'data/fonoran-primitive-roots-config.json'), 'utf8'));

const inventory = buildPrefixSafeInventory({ approvedRoots, phoneticsConfig });
const json = `${JSON.stringify(inventory, null, 2)}\n`;

if (checkOnly) {
  let existing = null;
  try {
    existing = await readFile(OUT, 'utf8');
  } catch {
    console.error(`Missing ${OUT}. Run: npm run fonoran:prefix-safe`);
    process.exit(1);
  }
  const prev = JSON.parse(existing);
  // Compare without generated_at so clock skew does not fail CI.
  const strip = (obj) => {
    const { generated_at: _g, ...rest } = obj;
    return rest;
  };
  const stale = JSON.stringify(strip(prev)) !== JSON.stringify(strip(inventory));
  if (stale) {
    console.error('data/fonoran-prefix-safe-roots.json is stale. Run: npm run fonoran:prefix-safe');
    process.exit(1);
  }
  if (inventory.prefix_pairs.length) {
    console.error(`prefix_overlap pairs present (${inventory.prefix_pairs.length}). Learnability will drop.`);
    for (const p of inventory.prefix_pairs.slice(0, 20)) {
      console.error(`  ${p.shorter} → ${p.longer}`);
    }
    process.exit(1);
  }
  console.log(`✓ prefix-safe inventory current — 0 pairs, ${inventory.summary.approved_CV_prefix_safe} CV + ${inventory.summary.approved_CVC_prefix_safe} CVC approved-safe`);
  process.exit(0);
}

await writeFile(OUT, json, 'utf8');

const s = inventory.summary;
console.log('Wrote data/fonoran-prefix-safe-roots.json');
console.log(`  Approved roots:           ${s.approved_roots}`);
console.log(`  Prefix pairs:             ${s.prefix_pairs}`);
console.log(`  Approved CV prefix-safe:  ${s.approved_CV_prefix_safe}`);
console.log(`  Approved CVC prefix-safe: ${s.approved_CVC_prefix_safe}`);
console.log(`  Free pool CV safe:        ${s.pool_CV_prefix_safe_free}  (blocked: ${s.pool_CV_blocked_free})`);
console.log(`  Free pool CVC safe:       ${s.pool_CVC_prefix_safe_free}  (blocked: ${s.pool_CVC_blocked_free})`);
if (s.pool_CVC_prefix_safe_free) {
  console.log(`  Free CVC safe forms:      ${inventory.pool_available.CVC_prefix_safe.join(' ')}`);
}
if (s.pool_CV_prefix_safe_free === 0) {
  console.log('  Note: no free CV in the generator pool is prefix-safe against current CVCs.');
  console.log('        New short roots need a free onset/vowel, or CVC siblings must move first.');
}
