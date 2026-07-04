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
import { translate } from './fonoran-translate.js';
import { resetTranslatorCache } from './fonoran-translator.js';
import { buildResolveContext, suggestGapConcepts } from './fonoran-english-resolve.js';
import { resolveDataPath } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = join(ROOT, 'data/fonoran-translation-tests.json');
const GAP_BASELINE_PATH = join(ROOT, 'data/fonoran-translation-gap-baseline.json');
const LATEST_PATH = () => resolveDataPath('translation_test_latest');
const STRANGER_GAP_PATH = () => resolveDataPath('stranger_gap_report');

/** Resolve corpus file path from key, absolute path, or default golden corpus. */
export function resolveCorpusPath(corpus = 'golden') {
  if (!corpus || corpus === 'golden') return CORPUS_PATH;
  if (corpus === 'stranger') return resolveDataPath('stranger_corpus');
  return corpus;
}

/**
 * Normalize stranger-corpus shape (domains[]) into levels[] for the gap runner.
 * @param {object} raw
 */
export function normalizeCorpusLevels(raw) {
  if (Array.isArray(raw?.levels)) return raw;
  if (!Array.isArray(raw?.domains)) {
    throw new Error('Corpus must have levels[] or domains[]');
  }
  return {
    ...raw,
    levels: raw.domains.map((d, i) => ({
      level: i + 1,
      name: d.label ?? d.id ?? `Domain ${i + 1}`,
      phrases: (d.phrases ?? []).map(p => {
        if (typeof p === 'string') return p;
        const entry = { en: p.en };
        if (p.note) entry.note = p.note;
        if (p.fon) entry.fon = p.fon;
        return entry;
      }),
    })),
  };
}

/** Resolve translate function for gap reports. */
async function runTranslate(phrase, { lab, engine = 'legacy' } = {}) {
  const result = await translate(phrase, { lab, engine, sourceLang: 'en' });
  if (result.ok === false) {
    throw new Error(result.error ?? 'Translation failed');
  }
  return result;
}

/** Load a phrase corpus from disk (golden, stranger key, or absolute path). */
export async function loadTranslationCorpus(corpus = 'golden') {
  const path = resolveCorpusPath(corpus);
  const raw = JSON.parse(await readFile(path, 'utf8'));
  return normalizeCorpusLevels(raw);
}

/**
 * The gap baseline is the tracked set of English words the language does not yet
 * express (honest gaps). It is the growth backbone: curation shrinks it, and the
 * strict runner can fail on any NEW gap that appears beyond it.
 */
export async function loadGapBaseline() {
  try {
    const data = JSON.parse(await readFile(GAP_BASELINE_PATH, 'utf8'));
    return Array.isArray(data.gaps) ? data.gaps : [];
  } catch {
    return null;
  }
}

export async function saveGapBaseline(words) {
  const gaps = [...new Set(words.map(w => String(w).toLowerCase()))].sort();
  await writeFile(
    GAP_BASELINE_PATH,
    `${JSON.stringify({ generated_at: new Date().toISOString(), count: gaps.length, gaps }, null, 2)}\n`,
    'utf8',
  );
  return gaps;
}

/** Compare a report's distinct gaps to the baseline: { new, resolved, baseline }. */
export function diffGapsAgainstBaseline(report, baseline) {
  const current = new Set((report.gaps ?? []).map(g => String(g.word).toLowerCase()));
  const base = new Set((baseline ?? []).map(w => String(w).toLowerCase()));
  const newGaps = [...current].filter(w => !base.has(w)).sort();
  const resolved = [...base].filter(w => !current.has(w)).sort();
  return { new: newGaps, resolved, baseline: [...base].sort() };
}

/** Load the golden CI corpus from disk. */
export async function loadGoldenCorpus() {
  return loadTranslationCorpus('golden');
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
export async function updateGoldenCorpus({ lab = null, engine = 'legacy' } = {}) {
  const corpus = await loadGoldenCorpus();
  resetTranslatorCache();
  let updated = 0;
  const allGaps = new Set();
  for (const lvl of corpus.levels) {
    const next = [];
    for (const entry of lvl.phrases) {
      const en = typeof entry === 'string' ? entry : entry.en;
      const r = await runTranslate(en, { lab, engine });
      const roman = r.surface?.roman ?? '';
      const grade = gradePhrase(r.tokens ?? []);
      const rec = { en, fon: roman };
      const notes = [];
      if (grade.gaps.length) {
        for (const g of grade.gaps) allGaps.add(String(g.english).toLowerCase());
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
  // The accepted baseline of honest gaps moves with the golden corpus.
  const gaps = await saveGapBaseline([...allGaps]);
  return { updated, levels: corpus.levels.length, gaps: gaps.length };
}

/** Read the most recent saved full-corpus gap report (null if none yet). */
export async function loadLatestGapReport() {
  try {
    return JSON.parse(await readFile(LATEST_PATH(), 'utf8'));
  } catch {
    return null;
  }
}

/** Persist a stranger-corpus gap report snapshot. */
export async function saveStrangerGapReport(report) {
  await writeFile(STRANGER_GAP_PATH(), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

/** Load the stranger-corpus gap report (null if none yet). */
export async function loadStrangerGapReport() {
  try {
    return JSON.parse(await readFile(STRANGER_GAP_PATH(), 'utf8'));
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
      gaps.push({
        english: t.english,
        kind,
        role: t.role ?? 'concept',
        reason: t.gap_reason ?? null,
        ...(t.suggestion ? { suggestion: t.suggestion } : {}),
      });
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
 * @param {string} [options.corpus] - 'golden' | 'stranger' | absolute path
 */
export async function runTranslationGapReport({
  level = null,
  lab = null,
  resetCache = false,
  suggest = false,
  corpus = 'golden',
  engine = 'legacy',
} = {}) {
  const corpusDoc = await loadTranslationCorpus(corpus);
  if (resetCache) resetTranslatorCache();

  const gap = new Map();
  const gapPhrases = new Map();
  const gapRole = new Map();
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
  for (const lvl of corpusDoc.levels) {
    if (level != null && lvl.level !== level) continue;
    let lvlPhrases = 0;
    let lvlClean = 0;
    let lvlUnresolved = 0;

    for (const entry of lvl.phrases) {
      const phrase = typeof entry === 'string' ? entry : entry.en;
      const golden = typeof entry === 'string' ? null : entry;
      const r = await runTranslate(phrase, { lab, engine });
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
      for (const g of quality.gaps) {
        const key = String(g.english).toLowerCase();
        if (!gapRole.has(key)) gapRole.set(key, g.role ?? 'concept');
      }
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

  let gaps = [...gap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({
      word,
      count,
      role: gapRole.get(word) ?? 'concept',
      samples: gapPhrases.get(word) ?? [],
    }));

  // Offline curation assistant: attach ranked, human-reviewable concept
  // suggestions (WordNet WSD + POS) to each distinct gap. Off by default so the
  // strict/CI paths stay fast; enabled for the human-facing report.
  if (suggest && gaps.length) {
    const ctx = await buildResolveContext(lab);
    gaps = await Promise.all(gaps.map(async (g) => ({
      ...g,
      suggestions: await suggestGapConcepts(g.word, g.role, ctx).catch(() => []),
    })));
  }

  const collapses = [...collapseByRoot.entries()]
    .filter(([, v]) => v.words.size >= 2)
    .map(([root, v]) => ({ root, words: [...v.words].sort(), concepts: [...v.concepts].sort() }))
    .sort((a, b) => b.words.length - a.words.length);

  const report = {
    generated_at: new Date().toISOString(),
    corpus: corpus === 'golden' ? 'golden' : corpus === 'stranger' ? 'stranger' : corpus,
    corpus_version: corpusDoc.version ?? null,
    engine,
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

  // Persist full-corpus runs as the canonical snapshot for the lab / stranger report.
  if (level == null) {
    try {
      if (corpus === 'stranger') {
        await saveStrangerGapReport(report);
      } else {
        await saveLatestGapReport(report);
      }
    } catch {
      // Non-fatal: a read-only environment just won't cache the latest run.
    }
  }

  return report;
}
