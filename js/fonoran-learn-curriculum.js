/**
 * Ring-based Fonoran learning curriculum.
 *
 * A curriculum orders every practice item from simple to complex (roots before
 * compounds, communicative core before extended core before the complete language)
 * and slices it into fixed-size lessons. Progress (which lesson you are on and which
 * items you have mastered) is persisted per skill in localStorage via learn-gamification.
 *
 * The three language rings map directly onto the campfire tiers in
 * tools/fonoran-experience-tiers.js, so no new taxonomy is introduced here.
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
