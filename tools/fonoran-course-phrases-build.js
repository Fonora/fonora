#!/usr/bin/env node
/**
 * Build data/fonoran-course-phrases.json from the 1,000-phrase stranger corpus.
 *
 * Each domain's phrases are sorted complexity-asc → id-asc so the curriculum
 * walks from simple to hard within each module. Translations are pulled from the
 * LLM translation cache (cache-first); unresolvable phrases are marked "gap" and
 * skipped by the curriculum until the lexicon grows.
 *
 * Run:
 *   node tools/fonoran-course-phrases-build.js
 *   node tools/fonoran-course-phrases-build.js --dry-run
 *   node tools/fonoran-course-phrases-build.js --domain first_contact
 *   node tools/fonoran-course-phrases-build.js --limit 20
 *   node tools/fonoran-course-phrases-build.js --force  (re-translate even if cached)
 *   node tools/fonoran-course-phrases-build.js --cache-only  (never call LLM; cache or pending/gap)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../load-env.js';
import { translateViaLlm, translatorLlmConfigured } from './fonoran-llm-translate.js';
import { lookupCachedTranslation } from './fonoran-translation-cache.js';
import { resolveDataPath } from './fonoran-data-paths.js';
import { closeStore } from './fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(ROOT, 'data/fonoran-course-phrases.json');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const cacheOnly = argv.includes('--cache-only');
const domainIdx = argv.indexOf('--domain');
const onlyDomain = domainIdx !== -1 ? argv[domainIdx + 1] : null;
const limitIdx = argv.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : null;

/** @returns {Promise<object>} */
async function loadExistingOutput() {
  try {
    const raw = await readFile(OUTPUT_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @returns {Promise<object>} */
async function loadStrangerCorpus() {
  const path = resolveDataPath('stranger_corpus');
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * Sort phrases within a domain: complexity asc → id asc.
 * @param {object[]} phrases
 */
function sortPhrases(phrases) {
  return [...phrases].sort((a, b) =>
    (a.complexity ?? 1) - (b.complexity ?? 1) ||
    String(a.id ?? '').localeCompare(String(b.id ?? '')),
  );
}

/**
 * Extract individual roman tokens from a translation result's surface.
 * @param {object} result
 * @returns {string[]}
 */
function extractTokens(result) {
  const roman = result?.surface?.roman ?? '';
  if (!roman) return [];
  return roman.split(/\s+/).filter(Boolean);
}

/**
 * Build a fonoran field for one phrase from a translation result.
 * @param {object} result
 * @returns {{ roman: string, tokens: string[], status: string, unresolved?: string[] }}
 */
function buildFonoranField(result) {
  if (!result || result.ok === false) {
    return { roman: '', tokens: [], status: 'gap', error: result?.error ?? 'translation failed' };
  }
  const roman = result.surface?.roman ?? '';
  const tokens = extractTokens(result);
  const unresolved = Array.isArray(result.unresolved) ? result.unresolved : [];
  const status = roman && unresolved.length === 0 ? 'translated' : unresolved.length ? 'gap' : 'pending';
  return {
    roman,
    tokens,
    status,
    ...(unresolved.length ? { unresolved } : {}),
  };
}

async function main() {
  const corpus = await loadStrangerCorpus();
  const existing = await loadExistingOutput();

  /** Build lookup of existing translated phrases (by id) for incremental skipping. */
  const existingById = new Map();
  if (existing?.domains) {
    for (const domain of existing.domains) {
      for (const phrase of domain.phrases ?? []) {
        if (phrase.id) existingById.set(phrase.id, phrase);
      }
    }
  }

  const outputDomains = [];
  let processed = 0;
  let skipped = 0;
  let translated = 0;
  let gap = 0;
  let failed = 0;

  const needsLlm = !dryRun && !cacheOnly && translatorLlmConfigured();

  for (let domainIdx = 0; domainIdx < corpus.domains.length; domainIdx++) {
    const domain = corpus.domains[domainIdx];
    if (onlyDomain && domain.id !== onlyDomain) continue;

    const sortedPhrases = sortPhrases(domain.phrases ?? []);
    const outputPhrases = [];

    for (const phrase of sortedPhrases) {
      if (limit != null && processed >= limit) break;
      processed += 1;

      const existing = existingById.get(phrase.id);

      // Incremental: skip phrases already translated with unchanged source text.
      if (
        !force &&
        existing?.fonoran?.status === 'translated' &&
        existing.sourceText === phrase.en
      ) {
        skipped += 1;
        outputPhrases.push(existing);
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] ${domain.id}: ${phrase.id} — ${phrase.en.slice(0, 60)}`);
        outputPhrases.push({
          id: phrase.id,
          sourceLang: 'en',
          sourceText: phrase.en,
          type: phrase.type,
          complexity: phrase.complexity,
          fonoran: { roman: '', tokens: [], status: 'pending' },
        });
        continue;
      }

      // Check cache before making an LLM call.
      let fonoranField;
      const cached = await lookupCachedTranslation('en', phrase.en);
      if (cached?.result && !force) {
        fonoranField = buildFonoranField(cached.result);
        console.log(`[cache ] ${domain.id}: ${phrase.id} → ${fonoranField.roman || '(gap)'}`);
      } else if (needsLlm) {
        try {
          const result = await translateViaLlm(phrase.en, { sourceLang: 'en' });
          fonoranField = buildFonoranField(result);
          console.log(`[llm   ] ${domain.id}: ${phrase.id} → ${fonoranField.roman || '(gap)'}`);
        } catch (err) {
          fonoranField = { roman: '', tokens: [], status: 'gap', error: String(err?.message ?? err) };
          failed += 1;
          console.error(`[error ] ${domain.id}: ${phrase.id} — ${err?.message ?? err}`);
        }
      } else {
        fonoranField = { roman: '', tokens: [], status: 'pending' };
        const reason = cacheOnly ? 'not in cache' : 'LLM not configured';
        console.log(`[skip  ] ${domain.id}: ${phrase.id} — ${reason}`);
      }

      if (fonoranField.status === 'translated') translated += 1;
      else if (fonoranField.status === 'gap') gap += 1;

      outputPhrases.push({
        id: phrase.id,
        sourceLang: 'en',
        sourceText: phrase.en,
        type: phrase.type,
        complexity: phrase.complexity,
        fonoran: fonoranField,
      });
    }

    outputDomains.push({
      id: domain.id,
      level: domainIdx + 1,
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
    skipped,
    domains: outputDomains,
  };

  if (!dryRun) {
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${OUTPUT_PATH}`);
  }

  console.log(
    `\nDone — processed: ${processed}, translated: ${translated + skipped}, gap: ${gap}, failed: ${failed}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeStore().catch(() => {}));
