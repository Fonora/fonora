/**
 * Fonoran learning curriculum — ring-based (vocabulary) and domain-based (phrase courses).
 *
 * Ring-based curriculum: orders words simple → complex by campfire tier.
 * Domain curriculum: 20 stranger-corpus modules (First contact → Closure & gratitude),
 *   50 phrases each, sliced into 5 lessons of 10 items. Used by all four Fonoran
 *   language skills once data/fonoran-course-phrases.json has been built.
 */
import { LANGUAGE_TIERS, LANGUAGE_TIER_LABELS } from '../tools/fonoran-experience-tiers.js';
import {
  advanceSkillLesson,
  getSkillLesson,
  getMasteryStats,
  recordItemResult,
  setSkillCurriculumMeta,
} from './learn-gamification.js';

export const RING_LABELS = LANGUAGE_TIERS.map((tier) => LANGUAGE_TIER_LABELS[tier] ?? tier);

/** Fraction of a 10-question lesson you must get right to advance. */
export const LESSON_PASS_RATIO = 0.7;

const DEFAULT_LESSON_SIZE = 10;

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

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
      return shuffle(ordered).slice(0, size);
    }
    const start = lessonIndex * size;
    let slice = ordered.slice(start, start + size);
    if (slice.length < size) {
      const inSlice = new Set(slice);
      const filler = shuffle(ordered.filter((item) => !inSlice.has(item)));
      slice = slice.concat(filler.slice(0, size - slice.length));
    }
    return slice;
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
      primaryLabel: 'Next lesson',
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

// ─── Domain-based curriculum (phrase courses) ───────────────────────────────

/**
 * Each domain has 5 lessons split into two phases:
 *   Words   (lessons 0–2, 3 total): individual vocabulary tokens + grammar particles from the domain
 *   Phrases (lessons 3–4, 2 total): full stranger-corpus sentences, complexity 1→3
 *
 * Three word lessons give learners enough vocabulary to recognise most of the tokens
 * that appear in the phrase exercises. Items are sorted by frequency so the most
 * common words (including grammar particles) are always taught first.
 */
const WORD_LESSONS_PER_DOMAIN = 3;
const PHRASE_LESSONS_PER_DOMAIN = 2;
const LESSONS_PER_DOMAIN = WORD_LESSONS_PER_DOMAIN + PHRASE_LESSONS_PER_DOMAIN; // 5

/**
 * Build a domain-based word-then-phrase curriculum.
 *
 * Flat lesson index layout (same localStorage `lessonIndex`):
 *   domainIndex         = Math.floor(lessonIndex / LESSONS_PER_DOMAIN)
 *   withinDomain        = lessonIndex % LESSONS_PER_DOMAIN
 *   isWordPhase         = withinDomain < WORD_LESSONS_PER_DOMAIN
 *
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {import('./fonoran-course-phrases.js').CourseEntry[]} entries  all items (words + phrases), ordered
 * @param {import('./fonoran-course-phrases.js').CourseDomain[]} domains  raw domain list for labels
 * @param {{ size?: number, phrasesOnly?: boolean }} [opts]  set phrasesOnly=true for grammar practice
 * @returns {ReturnType<typeof createCurriculum>}
 */
export function createDomainCurriculum(skillId, entries, domains, opts = {}) {
  const size = opts.size ?? DEFAULT_LESSON_SIZE;
  const totalLessons = Math.max(1, domains.length * LESSONS_PER_DOMAIN);

  /** Map domainIndex → { words: CourseEntry[], phrases: CourseEntry[] }. */
  const byDomain = new Map();
  for (const entry of entries) {
    const idx = entry.domainIndex ?? 0;
    if (!byDomain.has(idx)) byDomain.set(idx, { words: [], phrases: [] });
    const bucket = byDomain.get(idx);
    if (entry.itemType === 'phrase') bucket.phrases.push(entry);
    else bucket.words.push(entry);
  }

  function currentDomainIndex() {
    const lesson = getSkillLesson(skillId);
    return Math.min(Math.floor(lesson / LESSONS_PER_DOMAIN), domains.length - 1);
  }

  function domainLabel() {
    return domains[currentDomainIndex()]?.label ?? `Module ${currentDomainIndex() + 1}`;
  }

  /** Alias for the shared ring-curriculum interface. */
  function ringLabel() {
    return domainLabel();
  }

  function lessonLabel() {
    const lesson = getSkillLesson(skillId);
    if (lesson >= totalLessons) return 'Review';
    const withinDomain = lesson % LESSONS_PER_DOMAIN;
    if (opts.phrasesOnly) {
      return `${domainLabel()} · ${withinDomain + 1}/${LESSONS_PER_DOMAIN}`;
    }
    const isWordPhase = withinDomain < WORD_LESSONS_PER_DOMAIN;
    const phaseLesson = isWordPhase
      ? withinDomain + 1
      : withinDomain - WORD_LESSONS_PER_DOMAIN + 1;
    const phaseTotal = isWordPhase ? WORD_LESSONS_PER_DOMAIN : PHRASE_LESSONS_PER_DOMAIN;
    const phaseLabel = isWordPhase ? 'Words' : 'Phrases';
    return `${domainLabel()} · ${phaseLabel} ${phaseLesson}/${phaseTotal}`;
  }

  function currentLessonEntries() {
    const lesson = getSkillLesson(skillId);

    // Review mode: shuffle everything.
    if (lesson >= totalLessons) {
      const pool = opts.phrasesOnly ? entries.filter((e) => e.itemType === 'phrase') : entries;
      return shuffle(pool).slice(0, size);
    }

    const domainIdx = Math.floor(lesson / LESSONS_PER_DOMAIN);
    const withinDomain = lesson % LESSONS_PER_DOMAIN;
    const bucket = byDomain.get(domainIdx) ?? { words: [], phrases: [] };
    const isWordPhase = withinDomain < WORD_LESSONS_PER_DOMAIN && !opts.phrasesOnly;

    let pool;
    let phaseLesson;
    if (isWordPhase) {
      pool = bucket.words;
      phaseLesson = withinDomain;
      // If this domain has no word items (e.g. bootstrap offline), fall through to phrases.
      if (!pool.length) {
        pool = bucket.phrases;
        phaseLesson = 0;
      }
    } else {
      pool = bucket.phrases;
      phaseLesson = opts.phrasesOnly ? withinDomain : withinDomain - WORD_LESSONS_PER_DOMAIN;
    }

    const start = phaseLesson * size;
    let slice = pool.slice(start, start + size);
    if (slice.length < size) {
      const inSlice = new Set(slice);
      const filler = shuffle(pool.filter((e) => !inSlice.has(e)));
      slice = slice.concat(filler.slice(0, size - slice.length));
    }
    if (!slice.length) {
      // Last resort: any item from this domain.
      const any = [...bucket.words, ...bucket.phrases];
      return any.length ? shuffle(any).slice(0, size) : shuffle(entries).slice(0, size);
    }
    return slice;
  }

  function recordResult(item, correct) {
    recordItemResult(skillId, item.id ?? item.spelling ?? '', correct);
  }

  function syncMeta() {
    setSkillCurriculumMeta(skillId, {
      total: entries.length,
      totalLessons,
      ring: domainLabel(),
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

    const beforeDomain = currentDomainIndex();
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

    const afterDomain = Math.floor(afterIndex / LESSONS_PER_DOMAIN);
    const domainUp = afterDomain > beforeDomain;
    const withinDomain = afterIndex % LESSONS_PER_DOMAIN;
    const isNowWordPhase = withinDomain < WORD_LESSONS_PER_DOMAIN;

    if (domainUp) {
      const completedModule = domains[beforeDomain]?.label ?? `Module ${beforeDomain + 1}`;
      const nextModuleLabel = domains[afterDomain]?.label ?? `Module ${afterDomain + 1}`;
      return {
        primaryLabel: `Start ${nextModuleLabel}`,
        note: isNowWordPhase
          ? `Starting vocabulary for: ${nextModuleLabel}.`
          : `Vocabulary done — now practicing phrases.`,
        passed: true,
        ringUp: true,
        moduleComplete: true,
        completedModule,
        nextModule: nextModuleLabel,
      };
    }

    return {
      primaryLabel: 'Next lesson',
      note: !opts.phrasesOnly && !isNowWordPhase && withinDomain === WORD_LESSONS_PER_DOMAIN
        ? 'Vocabulary done — now practicing phrases.'
        : '',
      passed: true,
      ringUp: false,
    };
  }

  function progress() {
    const mastery = getMasteryStats(skillId);
    return { ...mastery, total: entries.length, totalLessons, ring: domainLabel() };
  }

  syncMeta();

  return {
    ordered: entries,
    totalLessons,
    currentLessonEntries,
    lessonLabel,
    ringLabel,
    recordResult,
    complete,
    progress,
  };
}
