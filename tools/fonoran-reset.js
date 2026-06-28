#!/usr/bin/env node
/**
 * Fonoran full-project reset — true blank slate across every layer.
 *
 * Unlike the in-app "Reset Lab" (which only empties the live word inventory),
 * this clears ALL persisted language state so a following `npm run fonoran:build`
 * starts with nothing reviewed or approved:
 *   1. Lab            → empty
 *   2. Review queue   → empty
 *   3. Canonical roots → empty
 *
 * Run: npm run fonoran:reset
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedBucket } from './fonoran-sound-bucket.js';
import { writeDoc } from './fonoran-store.js';

export async function resetProject() {
  const now = new Date().toISOString();

  await seedBucket();

  await writeDoc('root_candidates', {
    version: '1.0-root-workflow',
    status: 'proposal',
    generated_at: now,
    summary: { total: 0, pending: 0, approved: 0, rejected: 0 },
    candidates: [],
  });

  await writeDoc('approved_roots', {
    version: '1.0-approved-roots',
    updated_at: now,
    philosophy: 'Only human-approved roots from Root Review are canonical.',
    root_count: 0,
    roots: [],
  });

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
