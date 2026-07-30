#!/usr/bin/env node
/**
 * Build data/fonoran-course-phrases.json from the 1,000-phrase stranger corpus.
 *
 * Each domain's phrases are sorted complexity-asc then id-asc so the curriculum walks from
 * simple to hard within a module. Roman comes from the deterministic translator, and phrases
 * it cannot say are marked "gap" and skipped by the curriculum until the lexicon grows.
 *
 * The committed output is an offline snapshot: the Learn API recompiles roman per lab revision,
 * so this only needs re-running when the English corpus or the domain layout changes.
 *
 * Run:
 *   node tools/fonoran-course-phrases-build.js
 *   node tools/fonoran-course-phrases-build.js --dry-run
 *   node tools/fonoran-course-phrases-build.js --domain first_contact
 *   node tools/fonoran-course-phrases-build.js --limit 20
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPath } from './fonoran-data-paths.js';
import { closeStore } from './fonoran-store.js';
import { compilePhrase } from './fonoran-course-phrases-compile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(ROOT, 'data/fonoran-course-phrases.json');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const domainIdx = argv.indexOf('--domain');
const onlyDomain = domainIdx !== -1 ? argv[domainIdx + 1] : null;
const limitIdx = argv.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : null;

/** @returns {Promise<object>} */
async function loadStrangerCorpus() {
  const path = resolveDataPath('stranger_corpus');
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Sort phrases within a domain: complexity asc then id asc.
 * @param {object[]} phrases
 */
function sortPhrases(phrases) {
  return [...phrases].sort((a, b) =>
    (a.complexity ?? 1) - (b.complexity ?? 1)
    || String(a.id ?? '').localeCompare(String(b.id ?? '')),
  );
}

async function main() {
  const corpus = await loadStrangerCorpus();

  const outputDomains = [];
  let processed = 0;
  let translated = 0;
  let gap = 0;

  for (let domainIndex = 0; domainIndex < corpus.domains.length; domainIndex++) {
    const domain = corpus.domains[domainIndex];
    if (onlyDomain && domain.id !== onlyDomain) continue;

    const outputPhrases = [];
    for (const phrase of sortPhrases(domain.phrases ?? [])) {
      if (limit != null && processed >= limit) break;
      processed += 1;

      const fonoran = dryRun
        ? { roman: '', tokens: [], status: 'pending' }
        : await compilePhrase(phrase.en);

      if (fonoran.status === 'translated') translated += 1;
      else if (fonoran.status === 'gap') gap += 1;

      console.log(
        `[${fonoran.status.padEnd(10)}] ${domain.id}: ${phrase.id} → ${fonoran.roman || '(gap)'}`,
      );

      outputPhrases.push({
        id: phrase.id,
        sourceLang: 'en',
        sourceText: phrase.en,
        type: phrase.type,
        complexity: phrase.complexity,
        fonoran,
      });
    }

    outputDomains.push({
      id: domain.id,
      level: domainIndex + 1,
      label: domain.label,
      phrases: outputPhrases,
    });
  }

  const output = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    total_domains: outputDomains.length,
    total_phrases: outputDomains.reduce((n, d) => n + d.phrases.length, 0),
    translated,
    gap,
    domains: outputDomains,
  };

  if (!dryRun) {
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${OUTPUT_PATH}`);
  }

  console.log(`\nDone — processed: ${processed}, translated: ${translated}, gap: ${gap}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeStore().catch(() => {}));
