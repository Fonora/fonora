/**
 * Phrase-derived grammar exercises: particle spotting, token reorder, translation.
 * Used when translated course phrases are available (domain curriculum).
 */

const GRAMMAR_PARTICLES = new Set(['mi', 'ta', 'sa', 'no', 'ya', 'von']);

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(text) {
  return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @typedef {{
 *   id: string,
 *   kind: 'reorder' | 'particles' | 'translate-to-fonoran' | 'translate-to-lang',
 *   promptLang: string,
 *   answerRoman: string,
 *   promptFonoran: string,
 *   answerLang: string,
 *   parts?: string[],
 *   spelling?: string,
 *   tierRank?: number,
 *   sourceId?: string,
 * }} GrammarPhraseExercise
 */

/**
 * Build grammar exercises from translated course phrase entries.
 * Each phrase yields up to three drills: reorder (if ≥2 tokens), particle spot (if any),
 * and bidirectional translation.
 *
 * @param {import('./fonoran-course-phrases.js').CourseEntry[]} entries
 * @returns {GrammarPhraseExercise[]}
 */
export function buildGrammarPhraseExercises(entries) {
  /** @type {GrammarPhraseExercise[]} */
  const exercises = [];

  for (const entry of entries) {
    const tokens = entry.parts?.length ? entry.parts : entry.spelling.split(/\s+/).filter(Boolean);
    const particles = tokens.filter((t) => GRAMMAR_PARTICLES.has(t));

    if (tokens.length >= 2) {
      const scrambled = shuffle(tokens).join(' · ');
      exercises.push({
        id: `${entry.id}-reorder`,
        kind: 'reorder',
        promptLang: `Put these tokens in order: ${scrambled}`,
        answerRoman: entry.spelling,
        promptFonoran: scrambled,
        answerLang: entry.meaning,
        parts: tokens,
        spelling: entry.spelling,
        tierRank: entry.tierRank,
        sourceId: entry.id,
      });
    }

    if (particles.length) {
      exercises.push({
        id: `${entry.id}-particles`,
        kind: 'particles',
        promptLang: `Type the grammar particles in "${entry.spelling}" (space-separated):`,
        answerRoman: particles.join(' '),
        promptFonoran: entry.spelling,
        answerLang: particles.join(' '),
        parts: tokens,
        spelling: entry.spelling,
        tierRank: entry.tierRank,
        sourceId: entry.id,
      });
    }

    exercises.push({
      id: `${entry.id}-to-fonoran`,
      kind: 'translate-to-fonoran',
      promptLang: entry.meaning,
      answerRoman: entry.spelling,
      promptFonoran: entry.spelling,
      answerLang: entry.meaning,
      parts: tokens,
      spelling: entry.spelling,
      tierRank: entry.tierRank,
      sourceId: entry.id,
    });
  }

  return exercises;
}

/**
 * @param {GrammarPhraseExercise} exercise
 * @param {'to-fonoran' | 'to-lang'} direction
 * @returns {boolean}
 */
export function grammarPhraseExerciseMatches(exercise, direction, answer) {
  const norm = normalize(answer);
  if (exercise.kind === 'translate-to-fonoran' || (exercise.kind === 'reorder' && direction === 'to-fonoran')) {
    return norm === normalize(exercise.answerRoman);
  }
  if (exercise.kind === 'particles') {
    const expected = normalize(exercise.answerRoman).split(' ').sort().join(' ');
    const given = norm.split(' ').filter(Boolean).sort().join(' ');
    return expected === given;
  }
  if (direction === 'to-lang') {
    return norm === normalize(exercise.answerLang);
  }
  return norm === normalize(exercise.answerRoman);
}

/**
 * Pick prompt/label for the current exercise kind and direction.
 * @param {GrammarPhraseExercise} exercise
 * @param {'to-fonoran' | 'to-lang'} direction
 * @returns {{ prompt: string, label: string }}
 */
export function grammarPhrasePrompt(exercise, direction) {
  switch (exercise.kind) {
    case 'reorder':
      return {
        prompt: exercise.promptLang,
        label: 'Your Fonoran answer (roman spelling)',
      };
    case 'particles':
      return {
        prompt: exercise.promptLang,
        label: 'Grammar particles (mi, ta, sa, no…)',
      };
    case 'translate-to-fonoran':
      return direction === 'to-lang'
        ? { prompt: exercise.promptFonoran, label: 'Your translation' }
        : { prompt: exercise.promptLang, label: 'Your Fonoran answer (roman spelling)' };
    default:
      return {
        prompt: direction === 'to-lang' ? exercise.promptFonoran : exercise.promptLang,
        label: direction === 'to-lang' ? 'Your translation' : 'Your Fonoran answer (roman spelling)',
      };
  }
}
