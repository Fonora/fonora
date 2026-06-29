/**
 * Shared Fonoran translation-gap analysis.
 *
 * Runs the English phrase corpus (data/fonoran-translation-tests.json) through
 * the translator and reports where the language is missing roots/compounds.
 * Used by both the CLI (scripts/fonoran-translation-gaps.js) and the lab GUI
 * (POST /api/fonoran/translation-tests/run).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateEnglish, resetTranslatorCache } from './fonoran-translator.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = join(ROOT, 'data/fonoran-translation-tests.json');
const LATEST_PATH = join(ROOT, 'data/fonoran-translation-test-latest.json');

/** Load the phrase corpus from disk. */
export async function loadTranslationCorpus() {
  return JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
}

/** Read the most recent saved full-corpus gap report (null if none yet). */
export async function loadLatestGapReport() {
  try {
    return JSON.parse(await readFile(LATEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Persist a full-corpus gap report as the "latest" snapshot. */
export async function saveLatestGapReport(report) {
  await writeFile(LATEST_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/** Bucket a phrase's tokens by how each was resolved. */
function classifyTokens(tokens) {
  const counts = { direct: 0, semantic: 0, interpreted: 0, unknown: 0 };
  for (const t of tokens) {
    const k = t.resolved ? (t.resolution_kind ?? 'direct') : 'unknown';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * Run the corpus through the translator and build a structured gap report.
 *
 * @param {object} [options]
 * @param {number|null} [options.level] - run a single level only
 * @param {object|null} [options.lab]   - warm lab bucket (server passes getLab())
 * @param {boolean} [options.resetCache] - reset translator cache first (CLI)
 */
export async function runTranslationGapReport({ level = null, lab = null, resetCache = false } = {}) {
  const corpus = await loadTranslationCorpus();
  if (resetCache) resetTranslatorCache();

  const gap = new Map();
  const gapPhrases = new Map();
  const levelStats = [];
  const phraseResults = [];
  let totalPhrases = 0;
  let cleanPhrases = 0;

  for (const lvl of corpus.levels) {
    if (level != null && lvl.level !== level) continue;
    let lvlPhrases = 0;
    let lvlClean = 0;
    let lvlUnresolved = 0;

    for (const phrase of lvl.phrases) {
      const r = await translateEnglish(phrase, lab ? { lab } : {});
      const unresolved = r.unresolved ?? [];
      totalPhrases += 1;
      lvlPhrases += 1;
      if (unresolved.length === 0) { cleanPhrases += 1; lvlClean += 1; }
      lvlUnresolved += unresolved.length;

      for (const w of unresolved) {
        const key = String(w).toLowerCase();
        gap.set(key, (gap.get(key) ?? 0) + 1);
        if (!gapPhrases.has(key)) gapPhrases.set(key, []);
        if (gapPhrases.get(key).length < 3) gapPhrases.get(key).push(phrase);
      }

      phraseResults.push({
        level: lvl.level,
        phrase,
        roman: r.surface?.roman ?? '',
        unresolved,
        counts: classifyTokens(r.tokens ?? []),
      });
    }

    levelStats.push({
      level: lvl.level,
      name: lvl.name,
      phrases: lvlPhrases,
      clean: lvlClean,
      coverage: lvlPhrases ? Math.round((lvlClean / lvlPhrases) * 100) : 0,
      unresolved_words: lvlUnresolved,
    });
  }

  const gaps = [...gap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count, samples: gapPhrases.get(word) ?? [] }));

  const report = {
    generated_at: new Date().toISOString(),
    corpus_version: corpus.version ?? null,
    total_phrases: totalPhrases,
    clean_phrases: cleanPhrases,
    coverage_pct: totalPhrases ? Math.round((cleanPhrases / totalPhrases) * 100) : 0,
    distinct_gaps: gaps.length,
    levels: levelStats,
    gaps,
    phrases: phraseResults,
  };

  // Persist full-corpus runs as the canonical "latest" report shown in the lab.
  if (level == null) {
    try {
      await saveLatestGapReport(report);
    } catch {
      // Non-fatal: a read-only environment just won't cache the latest run.
    }
  }

  return report;
}
