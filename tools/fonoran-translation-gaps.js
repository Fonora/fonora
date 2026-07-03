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
import { resolveDataPath } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = join(ROOT, 'data/fonoran-translation-tests.json');
const LATEST_PATH = () => resolveDataPath('translation_test_latest');

/** Load the phrase corpus from disk. */
export async function loadTranslationCorpus() {
  return JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
}

/** Persist the golden corpus back to disk (used by --update-golden). */
export async function saveTranslationCorpus(corpus) {
  await writeFile(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  return corpus;
}

/**
 * Re-translate every phrase and rewrite its golden `fon` (and gap/review note)
 * from the current translator output. This is the deliberate "accept new
 * baseline" path behind `--update-golden`; the diff is reviewable in git.
 */
export async function updateGoldenCorpus({ lab = null } = {}) {
  const corpus = await loadTranslationCorpus();
  resetTranslatorCache();
  let updated = 0;
  for (const lvl of corpus.levels) {
    const next = [];
    for (const entry of lvl.phrases) {
      const en = typeof entry === 'string' ? entry : entry.en;
      const r = await translateEnglish(en, lab ? { lab } : {});
      const roman = r.surface?.roman ?? '';
      const grade = gradePhrase(r.tokens ?? []);
      const rec = { en, fon: roman };
      const notes = [];
      if (grade.gaps.length) {
        notes.push(`gap: ${[...new Set(grade.gaps.map(g => g.english))].join(', ')} (needs a root)`);
      }
      if (grade.review.length) {
        notes.push(`review: ${grade.review.map(x => `${x.english}→${x.fonoran}(${x.kind})`).join(', ')}`);
      }
      if (notes.length) rec.note = notes.join(' | ');
      next.push(rec);
      updated += 1;
    }
    lvl.phrases = next;
  }
  await saveTranslationCorpus(corpus);
  return { updated, levels: corpus.levels.length };
}

/** Read the most recent saved full-corpus gap report (null if none yet). */
export async function loadLatestGapReport() {
  try {
    return JSON.parse(await readFile(LATEST_PATH(), 'utf8'));
  } catch {
    return null;
  }
}

/** Persist a full-corpus gap report as the "latest" snapshot. */
export async function saveLatestGapReport(report) {
  await writeFile(LATEST_PATH(), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/**
 * Resolution-quality tiers. A translation can be 100% "covered" (every token
 * resolves to *something*) while still being wrong, so we grade each token:
 *   - pass : confident match (curated alias or a deliberate interpretation rule)
 *   - soft : needs review (distant WordNet hypernym, or a weak/description-derived
 *            alias such as the old `travel -> path` mismatch)
 *   - hard : an honest gap — the word did not resolve at all
 */
export const RESOLUTION_QUALITY = {
  direct: 'pass',
  interpreted: 'pass',
  semantic: 'soft',
  alias_weak: 'soft',
  unknown: 'hard',
};

/** Normalize a token to its resolution kind (unresolved => 'unknown'). */
export function tokenResolutionKind(token) {
  if (!token?.resolved) return 'unknown';
  return token.resolution_kind ?? (token.interpreted ? 'interpreted' : 'direct');
}

/** Content roles that carry meaning (used for concept-collapse reporting). */
const CONTENT_ROLES = new Set(['subject', 'object', 'event', 'predicate', 'modifier', 'verb']);

/** Bucket a phrase's tokens by how each was resolved. */
function classifyTokens(tokens) {
  const counts = { direct: 0, interpreted: 0, semantic: 0, alias_weak: 0, unknown: 0 };
  for (const t of tokens) {
    const k = tokenResolutionKind(t);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * Grade a phrase's tokens against the quality tiers. Returns pass/soft/hard
 * counts plus the specific tokens that need review or are missing, and a single
 * `gate` verdict (worst tier present).
 */
/** Food-like English that should not hypernym-collapse to eat in noun slots. */
const FOOD_LIKE_ENGLISH = /^(seafood|sea food|food|meal|bread|meat|fish)$/i;

/** Noun-like roles where food→eat hypernym collapse is a quality concern. */
const NOUN_LIKE_ROLES = new Set(['object', 'modifier', 'concept', 'path']);

function extraReviewFlags(token) {
  const flags = [];
  const role = token?.role ?? 'concept';
  const reason = String(token?.interpret_reason ?? '');
  if (
    NOUN_LIKE_ROLES.has(role)
    && reason.includes('hypernym:eat')
    && FOOD_LIKE_ENGLISH.test(String(token?.english ?? ''))
  ) {
    flags.push('food-like hypernym collapsed to eat');
  }
  return flags;
}

export function gradePhrase(tokens) {
  const review = [];
  const gaps = [];
  let pass = 0;
  let soft = 0;
  let hard = 0;
  for (const t of tokens ?? []) {
    const kind = tokenResolutionKind(t);
    let tier = RESOLUTION_QUALITY[kind] ?? 'soft';
    const extra = extraReviewFlags(t);
    if (extra.length && tier === 'pass') tier = 'soft';
    if (tier === 'hard') {
      hard += 1;
      gaps.push({ english: t.english, kind });
    } else if (tier === 'soft') {
      soft += 1;
      review.push({
        english: t.english,
        kind,
        concept_id: t.concept_id ?? null,
        fonoran: t.fonoran ?? null,
        ...(extra.length ? { flags: extra } : {}),
      });
    } else {
      pass += 1;
    }
  }
  const gate = hard ? 'hard' : soft ? 'soft' : 'pass';
  return { gate, pass, soft, hard, review, gaps };
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
  // root spelling -> { words:Set<english>, concepts:Set<concept_id> } for the
  // concept-collapse report (distinct content words sharing one root).
  const collapseByRoot = new Map();
  let totalPhrases = 0;
  let cleanPhrases = 0;
  let softPhrases = 0;
  let hardPhrases = 0;
  const qualityTotals = { pass: 0, soft: 0, hard: 0 };

  // Supports both the legacy string corpus and the golden corpus (phrases are
  // {en, fon, note} objects); the loop normalizes each entry below.
  for (const lvl of corpus.levels) {
    if (level != null && lvl.level !== level) continue;
    let lvlPhrases = 0;
    let lvlClean = 0;
    let lvlUnresolved = 0;

    for (const entry of lvl.phrases) {
      const phrase = typeof entry === 'string' ? entry : entry.en;
      const golden = typeof entry === 'string' ? null : entry;
      const r = await translateEnglish(phrase, lab ? { lab } : {});
      const unresolved = r.unresolved ?? [];
      const tokens = r.tokens ?? [];
      const roman = r.surface?.roman ?? '';
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

      const quality = gradePhrase(tokens);
      qualityTotals.pass += quality.pass;
      qualityTotals.soft += quality.soft;
      qualityTotals.hard += quality.hard;
      if (quality.gate === 'hard') hardPhrases += 1;
      else if (quality.gate === 'soft') softPhrases += 1;

      for (const t of tokens) {
        if (!t.resolved || !t.fonoran || !CONTENT_ROLES.has(t.role)) continue;
        const root = t.fonoran;
        if (!collapseByRoot.has(root)) collapseByRoot.set(root, { words: new Set(), concepts: new Set() });
        const bucket = collapseByRoot.get(root);
        bucket.words.add(String(t.english).toLowerCase());
        if (t.concept_id) bucket.concepts.add(t.concept_id);
      }

      const result = {
        level: lvl.level,
        phrase,
        roman,
        unresolved,
        counts: classifyTokens(tokens),
        quality: { gate: quality.gate, pass: quality.pass, soft: quality.soft, hard: quality.hard },
        review: quality.review,
        gaps: quality.gaps,
      };
      if (golden && typeof golden.fon === 'string') {
        result.expected = golden.fon;
        result.matches_golden = golden.fon === roman;
        if (golden.note) result.note = golden.note;
      }
      phraseResults.push(result);
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

  const collapses = [...collapseByRoot.entries()]
    .filter(([, v]) => v.words.size >= 2)
    .map(([root, v]) => ({ root, words: [...v.words].sort(), concepts: [...v.concepts].sort() }))
    .sort((a, b) => b.words.length - a.words.length);

  const report = {
    generated_at: new Date().toISOString(),
    corpus_version: corpus.version ?? null,
    total_phrases: totalPhrases,
    clean_phrases: cleanPhrases,
    coverage_pct: totalPhrases ? Math.round((cleanPhrases / totalPhrases) * 100) : 0,
    distinct_gaps: gaps.length,
    quality: {
      tokens: qualityTotals,
      pass_phrases: totalPhrases - softPhrases - hardPhrases,
      soft_phrases: softPhrases,
      hard_phrases: hardPhrases,
    },
    levels: levelStats,
    gaps,
    collapses,
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
