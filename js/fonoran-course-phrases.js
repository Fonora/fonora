/**
 * Browser-side loader for the course phrase dataset.
 *
 * Prefers runtime-compiled roman from GET /api/fonoran/learn/course-phrases
 * (cache-first recompile keyed on lab revision). Falls back to the baked JSON at
 * /data/fonoran-course-phrases.json for offline/static hosting.
 *
 * loadDomainCurriculum() is the primary entry point for the practice modules. It
 * returns a flat list of DomainItems tagged as 'word' or 'phrase'. Within each domain,
 * word items come first so the curriculum teaches vocabulary before sentences.
 */
import { buildMeaningChoices } from '../tools/fonoran-meaning-choices.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { SRS_MASTERED_BOX } from './learn-gamification.js';
import { loadFonoranPracticeEntries, loadFonoranPracticeLab } from './fonoran-practice-words.js';

/**
 * @typedef {{
 *   id: string,
 *   sourceLang: string,
 *   sourceText: string,
 *   type: 'statement' | 'question' | 'request',
 *   complexity: number,
 *   fonoran: { roman: string, tokens: string[], status: string, unresolved?: string[] }
 * }} CoursePhrase
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   level: number,
 *   phrases: CoursePhrase[]
 * }} CourseDomain
 *
 * @typedef {{
 *   id: string,
 *   spelling: string,
 *   meaning: string,
 *   parts: string[],
 *   script: string,
 *   conceptId: string,
 *   tierRank: number,
 *   domainId: string,
 *   domainIndex: number,
 *   complexity: number,
 *   status: string,
 *   itemType: 'word' | 'phrase',
 * }} CourseEntry
 */

/** @type {{ version: string, lab_rev?: string | null, domains: CourseDomain[] } | null} */
let cachedData = null;
/** @type {string | null} */
let cachedLabRev = null;
let pendingLoad = null;
/** @type {Promise<object | null> | null} */
let particlesLoad = null;
/**
 * Built curriculum keyed by the `rules` reference. Every skill panel gets the same
 * rules object from app.js (grammar passes null), so this holds at most two entries
 * and lets the seven Learn modules share one build instead of each refetching
 * particles and re-running buildCourseItems during page setup.
 * @type {Map<object | null, Promise<{ items: CourseEntry[], phraseItems: CourseEntry[], domains: CourseDomain[] } | null>>}
 */
const curriculumByRules = new Map();

/** Clear module-scope course phrase cache (e.g. after lab changes). */
export function invalidateCoursePhrasesCache() {
  cachedData = null;
  cachedLabRev = null;
  pendingLoad = null;
  particlesLoad = null;
  curriculumByRules.clear();
}

/**
 * @returns {Promise<string | null>}
 */
async function currentLabRev() {
  try {
    const bootstrap = await loadFonoranPracticeLab();
    return bootstrap?.health?.bucket_updated_at ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ version: string, lab_rev?: string | null, domains: CourseDomain[] } | null>}
 */
async function loadStaticCoursePhrases() {
  try {
    const res = await fetch('/data/fonoran-course-phrases.json');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ version: string, lab_rev?: string | null, domains: CourseDomain[] } | null>}
 */
async function loadRuntimeCoursePhrases() {
  try {
    const res = await fetch('/api/fonoran/learn/course-phrases');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Load course phrases: runtime API first, static JSON fallback.
 * Cache invalidates when bootstrap lab revision changes.
 *
 * @returns {Promise<{ version: string, lab_rev?: string | null, domains: CourseDomain[] } | null>}
 */
export async function loadCoursePhrasesData() {
  const labRev = await currentLabRev();
  if (cachedData !== null && (labRev == null || cachedLabRev === labRev)) {
    return cachedData;
  }
  // Caching only the result is not enough: the Learn widgets all ask during page
  // setup, before the first answer is back, so each one missed and refetched.
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const runtime = await loadRuntimeCoursePhrases();
    if (runtime?.domains?.length) {
      cachedData = runtime;
      cachedLabRev = runtime.lab_rev ?? labRev;
      return cachedData;
    }

    const baked = await loadStaticCoursePhrases();
    cachedData = baked;
    cachedLabRev = labRev;
    return cachedData;
  })().finally(() => { pendingLoad = null; });

  return pendingLoad;
}

/**
 * Compute Fonora script glyphs for a space-separated roman phrase.
 * Returns the per-token glyphs joined by spaces.
 * @param {string[]} tokens
 * @param {object | null} rules
 * @returns {string}
 */
export function tokensToScript(tokens, rules) {
  if (!rules || !tokens.length) return '';
  return tokens
    .map((tok) => {
      const { phrase } = romanToFonoraScript([tok], rules);
      return phrase || tok;
    })
    .join(' ');
}

/**
 * Adapt a CoursePhrase to the CourseEntry interface used by practice modules.
 * @param {CoursePhrase} phrase
 * @param {number} domainIndex
 * @param {string} domainId
 * @param {object | null} rules
 * @returns {CourseEntry}
 */
function adaptPhrase(phrase, domainIndex, domainId, rules) {
  const tokens = phrase.fonoran?.tokens ?? (phrase.fonoran?.roman ? phrase.fonoran.roman.split(/\s+/).filter(Boolean) : []);
  const script = tokensToScript(tokens, rules);
  return {
    id: phrase.id,
    spelling: phrase.fonoran?.roman ?? '',
    meaning: phrase.sourceText,
    parts: tokens,
    script,
    conceptId: phrase.id,
    tierRank: (phrase.complexity ?? 1) - 1,
    domainId,
    domainIndex,
    complexity: phrase.complexity ?? 1,
    status: phrase.fonoran?.status ?? 'pending',
    itemType: 'phrase',
  };
}

/**
 * Build the flat course item list for the per-subject curriculum (pure — exported
 * for tests; use loadDomainCurriculum from the app).
 *
 * Within each domain the order is:
 *   1. Word items  (itemType: 'word')  — individual lab vocabulary AND grammar particles
 *      whose spellings appear as tokens in that domain's translated phrases, and were not
 *      already taught by an earlier domain (first appearance wins — later domains meet the
 *      word again only through spaced-repetition review). Sorted by frequency in the
 *      domain's phrases, then ring, then part count: most useful and simplest first.
 *   2. Phrase items (itemType: 'phrase') — the full translated stranger-corpus sentences,
 *      sorted complexity 1 → 3.
 *
 * Both item types share the same CourseEntry shape so all practice UIs work unchanged.
 *
 * @param {{ domains: CourseDomain[] }} data course phrases document
 * @param {Array<{ spelling: string, meaning: string, parts: string[], script: string, conceptId?: string, tierRank?: number }>} labEntries
 * @param {{ particles?: Array<{ form?: string, gloss?: string }> } | null} particlesData
 * @param {object | null} rules
 * @returns {{ items: CourseEntry[], phraseItems: CourseEntry[] } | null}
 */
export function buildCourseItems(data, labEntries, particlesData, rules = null) {
  if (!data?.domains?.length) return null;

  // Index lab entries by lowercase spelling for fast token lookup.
  const labBySpelling = new Map();
  for (const entry of labEntries ?? []) {
    const key = entry.spelling.toLowerCase();
    if (!labBySpelling.has(key)) labBySpelling.set(key, entry);
  }

  // Build a particle lookup: form → gloss (for grammar particles not in the lab).
  /** @type {Map<string, string>} */
  const particleGloss = new Map();
  for (const p of particlesData?.particles ?? []) {
    if (p.form && p.gloss) particleGloss.set(p.form.toLowerCase(), p.gloss);
  }

  const allItems = [];
  const allPhraseItems = [];
  /** Words already scheduled by an earlier domain — never re-taught as new material. */
  const taughtSpellings = new Set();

  for (let domainIndex = 0; domainIndex < data.domains.length; domainIndex++) {
    const domain = data.domains[domainIndex];
    const phraseEntries = [];

    // Count token frequency across all translated phrases in this domain.
    /** @type {Map<string, number>} */
    const tokenFreq = new Map();

    for (const phrase of domain.phrases ?? []) {
      if (phrase.fonoran?.status !== 'translated') continue;
      const entry = adaptPhrase(phrase, domainIndex, domain.id, rules);
      phraseEntries.push(entry);
      for (const token of entry.parts) {
        const key = token.toLowerCase().replace(/[.,!?]+$/, '');
        if (!key) continue;
        tokenFreq.set(key, (tokenFreq.get(key) ?? 0) + 1);
      }
    }

    /** @type {Array<{ entry: CourseEntry, freq: number }>} */
    const wordCandidates = [];

    for (const [token, freq] of tokenFreq) {
      if (taughtSpellings.has(token)) continue;

      const lab = labBySpelling.get(token);
      if (lab) {
        taughtSpellings.add(token);
        wordCandidates.push({
          freq,
          entry: {
            id: `w-${lab.spelling}`,
            spelling: lab.spelling,
            meaning: lab.meaning,
            parts: lab.parts,
            script: lab.script,
            conceptId: lab.conceptId ?? lab.spelling,
            tierRank: lab.tierRank ?? 0,
            domainId: domain.id,
            domainIndex,
            complexity: 0,
            status: 'translated',
            itemType: /** @type {'word'} */ ('word'),
          },
        });
        continue;
      }

      // Not in lab — check if it's a grammar particle.
      const gloss = particleGloss.get(token);
      if (gloss) {
        taughtSpellings.add(token);
        const script = tokensToScript([token], rules);
        wordCandidates.push({
          freq,
          entry: {
            id: `p-${token}`,
            spelling: token,
            meaning: gloss,
            parts: [token],
            script,
            conceptId: `particle-${token}`,
            tierRank: 0,
            domainId: domain.id,
            domainIndex,
            complexity: 0,
            status: 'translated',
            itemType: /** @type {'word'} */ ('word'),
          },
        });
      }
    }

    // Most useful first, simplest first: frequency desc, then ring, then part count.
    wordCandidates.sort((a, b) =>
      b.freq - a.freq
      || (a.entry.tierRank ?? 0) - (b.entry.tierRank ?? 0)
      || (a.entry.parts?.length ?? 1) - (b.entry.parts?.length ?? 1)
      || a.entry.spelling.localeCompare(b.entry.spelling));
    const wordEntries = wordCandidates.map((c) => c.entry);

    // Words first (new to the course), then phrases (sorted by complexity from build step).
    allItems.push(...wordEntries, ...phraseEntries);
    allPhraseItems.push(...phraseEntries);
  }

  if (!allItems.length) return null;
  return { items: allItems, phraseItems: allPhraseItems };
}

/**
 * Load course content as a flat DomainItem list organised for the word-then-phrase
 * curriculum (see buildCourseItems for the ordering contract).
 *
 * @param {object | null} rules  encoding rules from /api/fonoran/bootstrap
 * @returns {Promise<{ items: CourseEntry[], phraseItems: CourseEntry[], domains: CourseDomain[] } | null>}
 */
export async function loadDomainCurriculum(rules = null) {
  const cached = curriculumByRules.get(rules);
  if (cached) return cached;

  const load = (async () => {
    if (!particlesLoad) {
      particlesLoad = fetch('/data/fonoran-grammar-particles.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    const [data, labEntries, particlesData] = await Promise.all([
      loadCoursePhrasesData(),
      loadFonoranPracticeEntries(rules).catch(() => []),
      particlesLoad,
    ]);

    const built = buildCourseItems(data, labEntries, particlesData, rules);
    if (!built) return null;
    return { ...built, domains: data.domains };
  })();

  curriculumByRules.set(rules, load);
  // Don't pin a transient failure: a null/rejected build retries on the next call.
  load.then(
    (result) => { if (result === null) curriculumByRules.delete(rules); },
    () => { curriculumByRules.delete(rules); },
  );
  return load;
}

/**
 * Build four meaning choices for an MCQ exercise on a CourseEntry.
 * Distractors are drawn from other entries in the same domain first, then globally.
 *
 * @param {CourseEntry} entry
 * @param {CourseEntry[]} pool  full ordered pool (all translated entries)
 * @returns {string[]}
 */
export function meaningChoicesForCourseEntry(entry, pool) {
  const sameDomain = pool
    .filter((p) => p.domainIndex === entry.domainIndex && p.id !== entry.id)
    .map((p) => p.meaning);
  const other = pool
    .filter((p) => p.domainIndex !== entry.domainIndex)
    .map((p) => p.meaning);
  const distractorPool = [...sameDomain, ...other];
  return buildMeaningChoices(entry.meaning, distractorPool, 4);
}

/**
 * Check whether a typed roman spelling matches a CourseEntry's expected Fonoran.
 * Comparison is case-insensitive with whitespace normalisation.
 *
 * @param {string} answer
 * @param {CourseEntry} entry
 * @returns {boolean}
 */
export function spellingMatchesCourseEntry(answer, entry) {
  const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(answer) === normalize(entry.spelling);
}

/**
 * Count mastered phrases within a domain from a skill's mastery map.
 * Mastered = the item's spaced-repetition box has reached SRS_MASTERED_BOX.
 * @param {Record<string, { seen?: number, correct?: number, box?: number }>} mastery
 * @param {string[]} phraseIds
 * @returns {number}
 */
export function countDomainMastered(mastery, phraseIds) {
  let mastered = 0;
  for (const id of phraseIds) {
    if ((mastery[id]?.box ?? 0) >= SRS_MASTERED_BOX) mastered += 1;
  }
  return mastered;
}
