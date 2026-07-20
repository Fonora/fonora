/**
 * Hand-authored Fonoran grammar lessons (Rule 4 basics).
 * Loaded ahead of course-phrase drills so Learn Grammar teaches before it quizzes stories.
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: 'reorder' | 'particles' | 'translate-to-fonoran' | 'translate-to-lang' | 'choose',
 *   tip?: string,
 *   promptLang: string,
 *   answerRoman: string,
 *   promptFonoran: string,
 *   answerLang: string,
 *   parts?: string[],
 *   spelling?: string,
 *   tierRank?: number,
 *   alternates?: string[],
 *   choices?: string[],
 *   itemType?: 'phrase',
 *   domainIndex?: number,
 * }} GrammarLessonExercise
 */

function normalize(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[?？]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} raw
 * @returns {GrammarLessonExercise[]}
 */
export function lessonsDocToExercises(raw) {
  const out = [];
  for (const lesson of raw?.lessons ?? []) {
    for (const ex of lesson.exercises ?? []) {
      out.push({
        ...ex,
        spelling: ex.answerRoman,
        itemType: /** @type {'phrase'} */ ('phrase'),
        domainIndex: 0,
        tierRank: ex.tierRank ?? 0,
      });
    }
  }
  return out;
}

/**
 * @returns {Promise<GrammarLessonExercise[]>}
 */
export async function loadGrammarLessonExercises() {
  try {
    const res = await fetch('/data/fonoran-grammar-lessons.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return lessonsDocToExercises(data);
  } catch {
    return [];
  }
}

/**
 * Accept primary answer or listed alternates (question marks optional).
 * @param {GrammarLessonExercise | { answerRoman?: string, alternates?: string[] }} exercise
 * @param {string} answer
 */
export function grammarLessonAnswerMatches(exercise, answer) {
  const given = normalize(answer);
  if (!given) return false;
  const candidates = [exercise.answerRoman, ...(exercise.alternates ?? [])]
    .filter(Boolean)
    .map(normalize);
  return candidates.includes(given);
}
