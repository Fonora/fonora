#!/usr/bin/env node
/**
 * Batch warm the translation cache from the stranger corpus (1,000 phrases).
 *
 * Usage:
 *   node scripts/fonoran-translate-cache-warm.js
 *   node scripts/fonoran-translate-cache-warm.js --level 1
 *   node scripts/fonoran-translate-cache-warm.js --dry-run
 *   node scripts/fonoran-translate-cache-warm.js --limit 20
 */
import { loadTranslationCorpus } from '../tools/fonoran-translation-gaps.js';
import { translateViaLlm } from '../tools/fonoran-llm-translate.js';
import { lookupCachedTranslation } from '../tools/fonoran-translation-cache.js';
import { translatorLlmConfigured } from '../tools/fonoran-llm-translate.js';
import { ANTHROPIC_TRANSLATOR_API_KEY_ENV } from '../tools/fonoran-llm-client.js';
import { closeStore } from '../tools/fonoran-store.js';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const levelIdx = argv.indexOf('--level');
const onlyLevel = levelIdx !== -1 ? Number(argv[levelIdx + 1]) : null;
const limitIdx = argv.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : null;

async function main() {
  if (!translatorLlmConfigured()) {
    console.error(`${ANTHROPIC_TRANSLATOR_API_KEY_ENV} not set.`);
    process.exitCode = 1;
    return;
  }

  const corpus = await loadTranslationCorpus('stranger');
  let processed = 0;
  let cached = 0;
  let translated = 0;
  let failed = 0;

  for (const lvl of corpus.levels) {
    if (onlyLevel != null && lvl.level !== onlyLevel) continue;
    for (const entry of lvl.phrases) {
      if (limit != null && processed >= limit) break;
      const phrase = typeof entry === 'string' ? entry : entry.en;
      processed += 1;

      const hit = await lookupCachedTranslation('en', phrase);
      if (hit?.validated) {
        cached += 1;
        console.log(`[cache] L${lvl.level}: ${phrase.slice(0, 60)}`);
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] L${lvl.level}: ${phrase.slice(0, 60)}`);
        continue;
      }

      const result = await translateViaLlm(phrase, { sourceLang: 'en' });
      if (result.ok === false) {
        failed += 1;
        console.error(`[fail] L${lvl.level}: ${phrase.slice(0, 60)} — ${result.error}`);
        continue;
      }

      translated += 1;
      const gaps = result.unresolved?.length ?? 0;
      console.log(`[ok] L${lvl.level}: ${result.surface?.roman ?? '?'}${gaps ? ` (${gaps} gaps)` : ''}`);
    }
    if (limit != null && processed >= limit) break;
  }

  console.log(JSON.stringify({ processed, cached, translated, failed, dryRun }, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeStore());
