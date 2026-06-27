#!/usr/bin/env node
/**
 * Fonoran full-project reset — true blank slate across every layer.
 *
 * Unlike the in-app "Reset Lab" (which only empties the live word inventory),
 * this clears ALL persisted language state so a following `npm run fonoran:build`
 * starts with nothing reviewed or approved:
 *   1. Lab            (data/fonoran-sound-bucket.json)      → empty
 *   2. Review queue   (data/fonoran-root-candidates.json)   → empty
 *   3. Canonical roots(data/fonoran-approved-roots.json)    → empty
 *
 * Run: npm run fonoran:reset
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedBucket } from './fonoran-sound-bucket.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES_PATH = join(ROOT, 'data/fonoran-root-candidates.json');
const CANONICAL_PATH = join(ROOT, 'data/fonoran-approved-roots.json');

export async function resetProject() {
  const now = new Date().toISOString();

  // 1. Lab → empty.
  await seedBucket();

  // 2. Review queue → empty.
  await writeFile(CANDIDATES_PATH, JSON.stringify({
    version: '1.0-root-workflow',
    status: 'proposal',
    generated_at: now,
    summary: { total: 0, pending: 0, approved: 0, rejected: 0 },
    candidates: [],
  }, null, 2) + '\n');

  // 3. Canonical approved roots → empty.
  await writeFile(CANONICAL_PATH, JSON.stringify({
    version: '1.0-approved-roots',
    updated_at: now,
    philosophy: 'Only human-approved roots from Root Review are canonical.',
    root_count: 0,
    roots: [],
  }, null, 2) + '\n');

  return { lab: 'empty', review: 'empty', canonical: 'empty' };
}

async function main() {
  await resetProject();
  console.log('Fonoran project reset — blank slate.');
  console.log('  Lab (Dictionary):     empty');
  console.log('  Review (Concepts):    empty');
  console.log('  Canonical roots:      empty');
  console.log('Next: `npm run fonoran:build` (review manually) or `npm run fonoran:build:approved` (pre-approved).');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
