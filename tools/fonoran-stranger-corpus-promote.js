#!/usr/bin/env node
/**
 * Promote the stranger corpus into the golden CI regression file (v3.0).
 *
 * Run:
 *   node tools/fonoran-stranger-corpus-promote.js
 *   node tools/fonoran-stranger-corpus-promote.js --dry-run
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPath } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_PATH = join(ROOT, 'data/fonoran-translation-tests.json');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const strangerPath = resolveDataPath('stranger_corpus');
  const raw = JSON.parse(await readFile(strangerPath, 'utf8'));

  if (!Array.isArray(raw.domains) || !raw.domains.length) {
    throw new Error(`Expected domains[] in ${strangerPath}`);
  }

  const levels = raw.domains.map((d, i) => ({
    level: i + 1,
    name: d.label ?? d.id,
    phrases: (d.phrases ?? []).map(p => ({
      en: p.en,
      ...(p.note ? { note: p.note } : {}),
      ...(p.fon ? { fon: p.fon } : {}),
    })),
  }));

  const total = levels.reduce((n, l) => n + l.phrases.length, 0);
  const corpus = {
    version: '3.0',
    description:
      'Golden English→Fonoran regression corpus (stranger-first, 1,000 phrases). ' +
      'Each phrase has expected `fon` where committed; honest gaps tracked in gap baseline. ' +
      'Source: external/fonora-data/data/fonoran-stranger-corpus.json',
    promoted_at: new Date().toISOString(),
    source: 'fonoran-stranger-corpus.json',
    levels,
  };

  console.log(`Promoting ${total} phrases across ${levels.length} levels → ${GOLDEN_PATH}`);

  if (dryRun) {
    console.log('Dry run — no files written.');
    return;
  }

  await writeFile(GOLDEN_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  console.log('Done. Next steps:');
  console.log('  node scripts/fonoran-translation-gaps.js --update-gap-baseline');
  console.log('  node scripts/fonoran-translation-gaps.js --update-golden  # when ready to lock fon output');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
