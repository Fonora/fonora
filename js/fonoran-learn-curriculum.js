/**
 * Fonoran learning curriculum.
 *
 * Every phrase-capable skill teaches per subject: each of the 20 communication
 * domains first teaches the words its phrases need (only words not already taught
 * by an earlier domain), then the phrases themselves, complexity 1 → 3. Lesson
 * counts are computed from the content, so every translated phrase gets a slot.
 *
 * Sessions mix up to a few due spaced-repetition review items (Leitner boxes,
 * see learn-gamification.js) in with the current lesson's new material.
 *
 * createCurriculum remains for flat pools (grammar drills, ring-only fallback).
 */
import { LANGUAGE_TIERS, LANGUAGE_TIER_LABELS } from '../tools/fonoran-experience-tiers.js';
import { shuffle } from './utils.js';
import {
  advanceSkillLesson,
  getSkillLesson,
  getSkillCurriculumMeta,
  getSkillProgress,
  getMasteryStats,
  isItemDue,
  recordItemResult,
  setSkillCurriculumMeta,
  setSkillLesson,
} from './learn-gamification.js';

export const RING_LABELS = LANGUAGE_TIERS.map((tier) => LANGUAGE_TIER_LABELS[tier] ?? tier);

/** Fraction of a 10-question lesson you must get right to advance. */
export const LESSON_PASS_RATIO = 0.7;

const DEFAULT_LESSON_SIZE = 10;

/** Identifies the current lesson-index layout; bump when lesson boundaries change meaning. */
export const CURRICULUM_LAYOUT_ID = 'domain-v2';

/** Retired layouts always had 5 lessons per domain (3 words + 2 phrases, or 5 phrases). */
const LEGACY_LESSONS_PER_DOMAIN = 5;

/** How many due review items a session may carry alongside new material. */
const REVIEW_SLOTS = 3;

/** @param {{ tierRank?: number, parts?: unknown[], spelling?: string, id?: string }} item */
function ordinal(item) {
  return String(item.spelling ?? item.id ?? '');
}

/**
 * Order items simple → complex: by ring, then by number of parts (roots first),
 * then alphabetically for a stable sequence.
 * @template {{ tierRank?: number, parts?: unknown[], spelling?: string, id?: string }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function orderByDifficulty(items) {
  return [...items].sort(
    (a, b) =>
      (a.tierRank ?? 0) - (b.tierRank ?? 0) ||
      (a.parts?.length ?? 1) - (b.parts?.length ?? 1) ||
      ordinal(a).localeCompare(ordinal(b)),
  );
}

// ─── Spaced-repetition session composition ───────────────────────────────────

/**
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @returns {Record<string, import('./learn-gamification.js').ItemStats>}
 */
function masteryFor(skillId) {
  return getSkillProgress(skillId).mastery ?? {};
}

/**
 * Compose one session: the lesson's new items first, then up to REVIEW_SLOTS due
 * review items from previously practiced material. Padding is due-first, then
 * random from the pool — never duplicates.
 *
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {any[]} lessonSlice items scheduled for this lesson
 * @param {any[]} allEntries full ordered pool (review + padding source)
 * @param {(item: any) => string} keyOf
 * @param {number} size
 * @returns {any[]}
 */
function composeSessionEntries(skillId, lessonSlice, allEntries, keyOf, size) {
  const mastery = masteryFor(skillId);
  const now = Date.now();
  const sliceKeys = new Set(lessonSlice.map(keyOf));
  const dueEntries = allEntries
    .filter((e) => !sliceKeys.has(keyOf(e)) && isItemDue(mastery[keyOf(e)], now))
    .sort((a, b) => (mastery[keyOf(a)]?.due ?? 0) - (mastery[keyOf(b)]?.due ?? 0));

  const reviewCount = Math.min(REVIEW_SLOTS, dueEntries.length);
  const session = lessonSlice.slice(0, Math.max(1, size - reviewCount));
  const chosen = new Set(session.map(keyOf));

  for (const entry of dueEntries) {
    if (session.length >= size) break;
    if (chosen.has(keyOf(entry))) continue;
    session.push(entry);
    chosen.add(keyOf(entry));
  }

  if (session.length < size) {
    const filler = shuffle(allEntries.filter((e) => !chosen.has(keyOf(e))));
    session.push(...filler.slice(0, size - session.length));
  }
  return session;
}

/**
 * A review session: due items first (earliest due first), then the weakest
 * boxes, shuffled within equal strength.
 *
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {any[]} pool
 * @param {(item: any) => string} keyOf
 * @param {number} size
 * @returns {any[]}
 */
function reviewSessionEntries(skillId, pool, keyOf, size) {
  const mastery = masteryFor(skillId);
  const now = Date.now();
  const due = pool
    .filter((e) => isItemDue(mastery[keyOf(e)], now))
    .sort((a, b) => (mastery[keyOf(a)]?.due ?? 0) - (mastery[keyOf(b)]?.due ?? 0));
  if (due.length >= size) return due.slice(0, size);

  const dueKeys = new Set(due.map(keyOf));
  // Stable sort over a shuffle: random order within the same box, weakest boxes first.
  const rest = shuffle(pool.filter((e) => !dueKeys.has(keyOf(e))))
    .sort((a, b) => (mastery[keyOf(a)]?.box ?? 0) - (mastery[keyOf(b)]?.box ?? 0));
  return [...due, ...rest.slice(0, size - due.length)];
}

/**
 * @typedef {object} SkillCurriculum
 * @property {any[]} ordered full ordered item list
 * @property {number} totalLessons
 * @property {() => any[]} currentLessonEntries items for the current lesson (padded to a full session)
 * @property {() => string} lessonLabel e.g. "3/24" or "Review"
 * @property {() => string} ringLabel current ring name
 * @property {(item: any, correct: boolean) => void} recordResult
 * @property {(stats: { correct: number, attempts: number }) => { primaryLabel: string, note: string, passed: boolean, ringUp?: boolean, done?: boolean }} complete
 * @property {() => { mastered: number, seen: number, total: number, totalLessons: number, ring: string }} progress
 */

/**
 * Build a curriculum for one skill from an unordered item list.
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {any[]} items
 * @param {{ size?: number, keyOf?: (item: any) => string }} [opts]
 * @returns {SkillCurriculum}
 */
export function createCurriculum(skillId, items, opts = {}) {
  const size = opts.size ?? DEFAULT_LESSON_SIZE;
  const keyOf = opts.keyOf ?? ((item) => item.spelling ?? item.id ?? '');
  const ordered = orderByDifficulty(items);
  const totalLessons = Math.max(1, Math.ceil(ordered.length / size));

  function ringRankForLesson(lessonIndex) {
    if (!ordered.length) return 0;
    const clamped = Math.min(Math.max(lessonIndex, 0), totalLessons - 1);
    const start = clamped * size;
    const slice = ordered.slice(start, start + size);
    let rank = 0;
    for (const item of slice) rank = Math.max(rank, item.tierRank ?? 0);
    return rank;
  }

  function ringLabel() {
    return RING_LABELS[ringRankForLesson(getSkillLesson(skillId))] ?? RING_LABELS[0];
  }

  function currentLessonEntries() {
    if (!ordered.length) return [];
    const lessonIndex = getSkillLesson(skillId);
    if (lessonIndex >= totalLessons) {
      return reviewSessionEntries(skillId, ordered, keyOf, size);
    }
    const start = lessonIndex * size;
    const slice = ordered.slice(start, start + size);
    return composeSessionEntries(skillId, slice, ordered, keyOf, size);
  }

  function lessonLabel() {
    if (!ordered.length) return '';
    const lessonIndex = getSkillLesson(skillId);
    if (lessonIndex >= totalLessons) return 'Review';
    return `${lessonIndex + 1}/${totalLessons}`;
  }

  function recordResult(item, correct) {
    recordItemResult(skillId, keyOf(item), correct);
  }

  function syncMeta() {
    setSkillCurriculumMeta(skillId, {
      total: ordered.length,
      totalLessons,
      ring: ringLabel(),
    });
  }

  function complete(stats) {
    const attempts = stats.attempts ?? 0;
    const correct = stats.correct ?? 0;
    const passed = attempts > 0 && correct / attempts >= LESSON_PASS_RATIO;

    if (!passed) {
      syncMeta();
      return {
        primaryLabel: 'Try this lesson again',
        note: `Answer ${Math.round(LESSON_PASS_RATIO * 100)}% correctly to unlock the next lesson.`,
        passed: false,
      };
    }

    const beforeRing = ringRankForLesson(getSkillLesson(skillId));
    const afterIndex = advanceSkillLesson(skillId);
    syncMeta();

    if (afterIndex >= totalLessons) {
      return {
        primaryLabel: 'Practice again',
        note: 'You have covered every word — keep reviewing to stay sharp.',
        passed: true,
        done: true,
      };
    }

    const afterRing = ringRankForLesson(afterIndex);
    const ringUp = afterRing > beforeRing;
    return {
      primaryLabel: 'Next Lesson',
      note: ringUp ? `New ring unlocked: ${RING_LABELS[afterRing]}.` : '',
      passed: true,
      ringUp,
    };
  }

  function progress() {
    const mastery = getMasteryStats(skillId);
    return { ...mastery, total: ordered.length, totalLessons, ring: ringLabel() };
  }

  // Persist the shape immediately so the Learn home can render progress without the lab.
  syncMeta();

  return {
    ordered,
    totalLessons,
    currentLessonEntries,
    lessonLabel,
    ringLabel,
    recordResult,
    complete,
    progress,
  };
}

// ─── Domain layout (computed per subject) ────────────────────────────────────

/**
 * @typedef {object} DomainLayoutEntry
 * @property {number} domainIndex
 * @property {number} wordLessons
 * @property {number} phraseLessons
 * @property {number} lessons wordLessons + phraseLessons
 * @property {number} startLesson flat lesson index where this domain begins
 */

/**
 * @typedef {object} DomainLayout
 * @property {number} size
 * @property {DomainLayoutEntry[]} domains
 * @property {number} totalLessons
 */

/**
 * Compute the lesson layout from the actual content: each domain gets
 * ceil(words / size) word lessons and ceil(phrases / size) phrase lessons,
 * so every teachable item has a lesson slot. Domains with no items get none.
 *
 * @param {Array<{ domainIndex?: number, itemType?: string }>} entries
 * @param {Array<object>} domains
 * @param {{ size?: number, phrasesOnly?: boolean }} [opts]
 * @returns {DomainLayout}
 */
export function computeDomainLayout(entries, domains, opts = {}) {
  const size = opts.size ?? DEFAULT_LESSON_SIZE;
  const counts = (domains ?? []).map(() => ({ words: 0, phrases: 0 }));
  for (const entry of entries ?? []) {
    const idx = entry.domainIndex ?? 0;
    if (!counts[idx]) continue;
    if (entry.itemType === 'phrase') counts[idx].phrases += 1;
    else counts[idx].words += 1;
  }

  let start = 0;
  const layoutDomains = counts.map((c, domainIndex) => {
    const wordLessons = opts.phrasesOnly ? 0 : Math.ceil(c.words / size);
    const phraseLessons = Math.ceil(c.phrases / size);
    const lessons = wordLessons + phraseLessons;
    const out = { domainIndex, wordLessons, phraseLessons, lessons, startLesson: start };
    start += lessons;
    return out;
  });

  return { size, domains: layoutDomains, totalLessons: Math.max(1, start) };
}

/**
 * Resolve a flat lesson index into a domain phase.
 *
 * @param {number} lessonIndex
 * @param {DomainLayout} layout
 * @returns {{ phase: 'words' | 'phrases' | 'review', domainIndex?: number, phaseLesson?: number, phaseTotal?: number }}
 */
export function domainPhaseForLesson(lessonIndex, layout) {
  if (lessonIndex >= layout.totalLessons) return { phase: 'review' };
  for (const d of layout.domains) {
    if (!d.lessons || lessonIndex >= d.startLesson + d.lessons) continue;
    const within = lessonIndex - d.startLesson;
    if (within < d.wordLessons) {
      return {
        phase: 'words',
        domainIndex: d.domainIndex,
        phaseLesson: within,
        phaseTotal: d.wordLessons,
      };
    }
    return {
      phase: 'phrases',
      domainIndex: d.domainIndex,
      phaseLesson: within - d.wordLessons,
      phaseTotal: d.phraseLessons,
    };
  }
  return { phase: 'review' };
}

/**
 * Translate a lesson index recorded under a retired layout (hybrid ring-then-phrases,
 * or fixed 5-lessons-per-domain) into the computed layout (pure).
 *
 * Completed domains carry over one-for-one; position inside the current domain
 * restarts at that domain's first lesson. A finished course stays finished.
 *
 * @param {number} oldIndex
 * @param {number} oldTotalLessons the totalLessons recorded by the retired layout (0 if unknown)
 * @param {DomainLayout} layout
 * @returns {number}
 */
export function migratedLessonIndex(oldIndex, oldTotalLessons, layout) {
  if (!oldIndex || oldIndex <= 0) return 0;
  if (oldTotalLessons > 0 && oldIndex >= oldTotalLessons) return layout.totalLessons;
  const domainCount = layout.domains.length;
  // Hybrid layouts prefixed ring-vocabulary lessons before the per-domain block.
  const oldRingLessons = Math.max(0, (oldTotalLessons || 0) - domainCount * LEGACY_LESSONS_PER_DOMAIN);
  const progressed = Math.max(0, oldIndex - oldRingLessons);
  const domainsCompleted = Math.min(domainCount, Math.floor(progressed / LEGACY_LESSONS_PER_DOMAIN));
  const target = layout.domains[domainsCompleted];
  return target ? target.startLesson : layout.totalLessons;
}

/**
 * One-time migration of a skill's stored lessonIndex onto the computed layout.
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {DomainLayout} layout
 */
function migrateSkillLessonIndex(skillId, layout) {
  const meta = getSkillCurriculumMeta(skillId);
  if (meta.layout === CURRICULUM_LAYOUT_ID) return;
  const oldIndex = getSkillLesson(skillId);
  const next = migratedLessonIndex(oldIndex, meta.totalLessons ?? 0, layout);
  if (next !== oldIndex) setSkillLesson(skillId, next);
}

// ─── Domain-based curriculum (words then phrases, per subject) ───────────────

/**
 * Build the per-subject curriculum: for each domain, its word lessons
 * (vocabulary the domain's phrases need, first-taught here), then its phrase
 * lessons (every translated phrase, complexity 1 → 3).
 *
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {import('./fonoran-course-phrases.js').CourseEntry[]} entries  all items (words + phrases), ordered
 * @param {import('./fonoran-course-phrases.js').CourseDomain[]} domains  raw domain list for labels
 * @param {{ size?: number, phrasesOnly?: boolean }} [opts]  set phrasesOnly=true for phrase-only drills
 * @returns {SkillCurriculum & { layout: DomainLayout }}
 */
export function createDomainCurriculum(skillId, entries, domains, opts = {}) {
  const size = opts.size ?? DEFAULT_LESSON_SIZE;
  const pool = opts.phrasesOnly ? entries.filter((e) => e.itemType === 'phrase') : entries;
  const layout = computeDomainLayout(pool, domains, { size, phrasesOnly: opts.phrasesOnly });
  const { totalLessons } = layout;
  const keyOf = (item) => item.id ?? item.spelling ?? '';

  /** Map domainIndex → { words: CourseEntry[], phrases: CourseEntry[] }. */
  const byDomain = new Map();
  for (const entry of pool) {
    const idx = entry.domainIndex ?? 0;
    if (!byDomain.has(idx)) byDomain.set(idx, { words: [], phrases: [] });
    const bucket = byDomain.get(idx);
    if (entry.itemType === 'phrase') bucket.phrases.push(entry);
    else bucket.words.push(entry);
  }

  migrateSkillLessonIndex(skillId, layout);

  function currentPhase() {
    return domainPhaseForLesson(getSkillLesson(skillId), layout);
  }

  function domainLabelAt(domainIndex) {
    return domains[domainIndex]?.label ?? `Module ${domainIndex + 1}`;
  }

  function domainLabel() {
    const phase = currentPhase();
    if (phase.phase === 'review') {
      return domains.length ? domainLabelAt(domains.length - 1) : '';
    }
    return domainLabelAt(phase.domainIndex ?? 0);
  }

  /** Alias for the shared ring-curriculum interface. */
  function ringLabel() {
    return domainLabel();
  }

  function lessonLabel() {
    const phase = currentPhase();
    if (phase.phase === 'review') return 'Review';
    const label = domainLabelAt(phase.domainIndex ?? 0);
    const n = (phase.phaseLesson ?? 0) + 1;
    const total = phase.phaseTotal ?? 1;
    if (opts.phrasesOnly) return `${label} · ${n}/${total}`;
    const phaseName = phase.phase === 'words' ? 'Words' : 'Phrases';
    return `${label} · ${phaseName} ${n}/${total}`;
  }

  function currentLessonEntries() {
    const phase = currentPhase();

    if (phase.phase === 'review') {
      return reviewSessionEntries(skillId, pool, keyOf, size);
    }

    const bucket = byDomain.get(phase.domainIndex ?? 0) ?? { words: [], phrases: [] };
    const phasePool = phase.phase === 'words' ? bucket.words : bucket.phrases;
    const start = (phase.phaseLesson ?? 0) * size;
    const slice = phasePool.slice(start, start + size);
    if (!slice.length) {
      // Content shrank under a stored index (e.g. lexicon change removed items).
      const any = [...bucket.words, ...bucket.phrases];
      const fallback = any.length ? any : pool;
      return composeSessionEntries(skillId, shuffle(fallback).slice(0, size), pool, keyOf, size);
    }
    return composeSessionEntries(skillId, slice, pool, keyOf, size);
  }

  function recordResult(item, correct) {
    recordItemResult(skillId, keyOf(item), correct);
  }

  function syncMeta() {
    setSkillCurriculumMeta(skillId, {
      total: pool.length,
      totalLessons,
      ring: domainLabel(),
      layout: CURRICULUM_LAYOUT_ID,
    });
  }

  function complete(stats) {
    const attempts = stats.attempts ?? 0;
    const correct = stats.correct ?? 0;
    const passed = attempts > 0 && correct / attempts >= LESSON_PASS_RATIO;

    if (!passed) {
      syncMeta();
      return {
        primaryLabel: 'Try this lesson again',
        note: `Answer ${Math.round(LESSON_PASS_RATIO * 100)}% correctly to unlock the next lesson.`,
        passed: false,
      };
    }

    const before = currentPhase();
    const afterIndex = advanceSkillLesson(skillId);
    syncMeta();

    if (afterIndex >= totalLessons) {
      return {
        primaryLabel: 'Practice again',
        note: 'You have covered all modules — keep reviewing to stay sharp.',
        passed: true,
        done: true,
      };
    }

    const after = domainPhaseForLesson(afterIndex, layout);
    const domainUp = (after.domainIndex ?? 0) > (before.domainIndex ?? 0);

    if (domainUp) {
      const completedModule = domainLabelAt(before.domainIndex ?? 0);
      const nextModuleLabel = domainLabelAt(after.domainIndex ?? 0);
      return {
        primaryLabel: `Start ${nextModuleLabel}`,
        note: after.phase === 'words'
          ? `Starting vocabulary for: ${nextModuleLabel}.`
          : `Starting phrases for: ${nextModuleLabel}.`,
        passed: true,
        ringUp: true,
        moduleComplete: true,
        completedModule,
        nextModule: nextModuleLabel,
      };
    }

    return {
      primaryLabel: 'Next Lesson',
      note: before.phase === 'words' && after.phase === 'phrases'
        ? 'Vocabulary done — now practicing phrases.'
        : '',
      passed: true,
      ringUp: false,
    };
  }

  function progress() {
    const mastery = getMasteryStats(skillId);
    return { ...mastery, total: pool.length, totalLessons, ring: domainLabel() };
  }

  syncMeta();

  return {
    ordered: pool,
    totalLessons,
    layout,
    currentLessonEntries,
    lessonLabel,
    ringLabel,
    recordResult,
    complete,
    progress,
  };
}
