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
 * Strip trailing "A) … / B) …" lines from choose prompts.
 * Choices render as clickable buttons — they must not repeat in the question text.
 * @param {string} prompt
 */
export function stripMcqPromptOptions(prompt) {
  const text = String(prompt ?? '');
  if (!text) return '';
  const withoutLines = text
    .split(/\r?\n/)
    .filter((line) => !/^[A-D]\)\s+\S/i.test(line.trim()))
    .join('\n')
    .trim();
  // Also drop inline "A) … B) …" tails on a single line.
  return withoutLines
    .replace(/\s+[A-D]\)\s+.+$/i, '')
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
      const promptLang =
        ex.kind === 'choose' ? stripMcqPromptOptions(ex.promptLang) : ex.promptLang;
      out.push({
        ...ex,
        promptLang,
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
    const res = await fetch('/data/fonoran-grammar-lessons.json', { cache: 'no-store' });
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
