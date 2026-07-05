/**
 * Ordered symbol curriculum for Fonora Script Sounds practice.
 */
import { getQuizEntries } from './rules.js';
import { findVowelForCell, isVowelQuizCell } from './vowel-display.js';
import {
  advanceSkillLesson,
  getSkillLesson,
  getMasteryStats,
  getSkillProgress,
  recordItemResult,
  setSkillCurriculumMeta,
} from './learn-gamification.js';
import { LESSON_PASS_RATIO } from './fonoran-learn-curriculum.js';

const DEFAULT_LESSON_SIZE = 10;

/** @typedef {{ id: string, cell: object, moduleId: string, moduleLabel: string, moduleIndex: number }} SymbolItem */

const MODULE_DEFS = [
  { id: 'places', label: 'Places of articulation' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'consonants', label: 'Grid consonants' },
  { id: 'vowels_simple', label: 'Simple vowels' },
  { id: 'vowels_long', label: 'Long vowels & diphthongs' },
];

const SIMPLE_VOWEL_KEYS = new Set(['a', 'e', 'i', 'o', 'u']);
const LONG_VOWEL_KEYS = new Set(['ae', 'ee', 'oh', 'ay', 'eye', 'ow', 'oy']);

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cellKey(cell) {
  return cell.symbols || cell.sound || '';
}

function classifyCell(cell, rules) {
  if (isVowelQuizCell(rules, cell) || findVowelForCell(rules, cell)) {
    const vowelDef = findVowelForCell(rules, cell);
    const key = vowelDef?.key ?? cell.key ?? '';
    if (SIMPLE_VOWEL_KEYS.has(key)) return 'vowels_simple';
    if (LONG_VOWEL_KEYS.has(key)) return 'vowels_long';
    return 'vowels_long';
  }

  const symbols = cell.symbols || '';
  const placeSymbols = new Set((rules.places ?? []).map((p) => p.symbol));
  const modifierSymbols = new Set((rules.modifiers ?? []).map((m) => m.symbol));

  if (symbols.length === 1 && placeSymbols.has(symbols)) return 'places';
  if (symbols.length === 1 && modifierSymbols.has(symbols)) return 'modifiers';
  return 'consonants';
}

/**
 * Build ordered symbol items grouped into teaching modules.
 * @param {object} rules
 * @returns {SymbolItem[]}
 */
export function buildSymbolInventory(rules) {
  const cells = getQuizEntries(rules);
  const buckets = Object.fromEntries(MODULE_DEFS.map((m) => [m.id, []]));

  for (const cell of cells) {
    const moduleId = classifyCell(cell, rules);
    if (!buckets[moduleId]) buckets[moduleId] = [];
    buckets[moduleId].push(cell);
  }

  const ordered = [];
  MODULE_DEFS.forEach((moduleDef, moduleIndex) => {
    const list = buckets[moduleDef.id] ?? [];
    list.sort((a, b) => (a.sound || '').localeCompare(b.sound || ''));
    for (const cell of list) {
      ordered.push({
        id: cellKey(cell),
        cell,
        moduleId: moduleDef.id,
        moduleLabel: moduleDef.label,
        moduleIndex,
      });
    }
  });

  return ordered;
}

/**
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {object} rules
 * @param {{ size?: number }} [opts]
 */
export function createSymbolCurriculum(skillId, rules, opts = {}) {
  const size = opts.size ?? DEFAULT_LESSON_SIZE;
  const ordered = buildSymbolInventory(rules);
  const totalLessons = Math.max(1, Math.ceil(ordered.length / size));

  function moduleForLesson(lessonIndex) {
    if (!ordered.length) return MODULE_DEFS[0];
    const clamped = Math.min(Math.max(lessonIndex, 0), totalLessons - 1);
    const start = clamped * size;
    const item = ordered[start] ?? ordered[0];
    return MODULE_DEFS[item?.moduleIndex ?? 0] ?? MODULE_DEFS[0];
  }

  function ringLabel() {
    const lessonIndex = getSkillLesson(skillId);
    if (lessonIndex >= totalLessons) return '';
    return moduleForLesson(lessonIndex).label;
  }

  function lessonLabel() {
    const lessonIndex = getSkillLesson(skillId);
    if (lessonIndex >= totalLessons) return 'Review';
    const module = moduleForLesson(lessonIndex);
    const moduleStartIndex = ordered.findIndex((i) => i.moduleId === module.id);
    const moduleItems = ordered.filter((i) => i.moduleId === module.id);
    const moduleLessons = Math.max(1, Math.ceil(moduleItems.length / size));
    const moduleStartLesson = Math.floor(moduleStartIndex / size);
    const withinModule = Math.min(lessonIndex - moduleStartLesson + 1, moduleLessons);
    return `${module.label} · ${withinModule}/${moduleLessons}`;
  }

  function currentLessonEntries() {
    if (!ordered.length) return [];
    const lessonIndex = getSkillLesson(skillId);
    if (lessonIndex >= totalLessons) {
      const mastery = getSkillProgress(skillId).mastery ?? {};
      const unmastered = ordered.filter((item) => !(mastery[item.id]?.correct > 0));
      const pool = unmastered.length ? unmastered : ordered;
      return shuffle(pool).slice(0, size);
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

  function recordResult(item, correct) {
    recordItemResult(skillId, item.id ?? cellKey(item.cell), correct);
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

    if (passed) {
      const lessonIndex = getSkillLesson(skillId);
      if (lessonIndex < totalLessons) {
        advanceSkillLesson(skillId);
        syncMeta();
        return {
          primaryLabel: 'Next Lesson',
          note: `Passed with ${correct}/${attempts}. Next lesson unlocked.`,
          passed: true,
        };
      }
      syncMeta();
      const { mastered } = getMasteryStats(skillId);
      const remaining = Math.max(0, ordered.length - mastered);
      return {
        primaryLabel: 'Review mode',
        note: remaining
          ? `Passed with ${correct}/${attempts}. ${remaining} sound${remaining === 1 ? '' : 's'} left to master.`
          : `Passed with ${correct}/${attempts}. All ${ordered.length} sounds mastered.`,
        passed: true,
        done: true,
      };
    }

    syncMeta();
    return {
      primaryLabel: 'Keep practicing',
      note: `Score ${correct}/${attempts}. Need ${Math.ceil(LESSON_PASS_RATIO * 100)}% to advance.`,
      passed: false,
    };
  }

  function progress() {
    const { mastered, seen, total } = getMasteryStats(skillId);
    return {
      mastered,
      seen,
      total,
      totalLessons,
      ring: ringLabel(),
    };
  }

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

const DEFAULT_LESSON_SIZE_EXPORT = DEFAULT_LESSON_SIZE;

/**
 * Progress state for each symbol-teaching module on the Fonora path.
 * @param {object} rules
 * @param {import('./learn-gamification.js').LearnSkillId} [skillId]
 */
export function getScriptSoundModuleStates(rules, skillId = 'script-sounds') {
  const ordered = buildSymbolInventory(rules);
  const mastery = getSkillProgress(skillId).mastery ?? {};
  const lessonIndex = getSkillLesson(skillId);
  const size = DEFAULT_LESSON_SIZE_EXPORT;
  const totalLessons = Math.max(1, Math.ceil(ordered.length / size));

  return MODULE_DEFS.map((modDef, modIdx) => {
    const items = ordered.filter((item) => item.moduleId === modDef.id);
    const mastered = items.filter((item) => (mastery[item.id]?.correct ?? 0) > 0).length;
    const moduleStartIndex = ordered.findIndex((item) => item.moduleId === modDef.id);
    const moduleStartLesson = moduleStartIndex >= 0 ? Math.floor(moduleStartIndex / size) : 0;
    const moduleLessons = Math.max(1, Math.ceil(items.length / size));
    const moduleEndLesson = moduleStartLesson + moduleLessons - 1;

    let state = 'locked';
    if (lessonIndex >= moduleStartLesson) {
      if (lessonIndex > moduleEndLesson) state = 'complete';
      else if (lessonIndex >= totalLessons && mastered >= items.length) state = 'complete';
      else state = 'current';
    } else if (modIdx === 0 && lessonIndex === 0) {
      state = 'current';
    }

    const lessonsDone = state === 'complete'
      ? moduleLessons
      : Math.min(moduleLessons, Math.max(0, lessonIndex - moduleStartLesson));

    return {
      id: modDef.id,
      label: modDef.label,
      level: modIdx + 1,
      total: items.length,
      mastered,
      state,
      unit: 'sounds',
      skillId,
      lessonsTotal: moduleLessons,
      lessonsDone,
    };
  });
}
