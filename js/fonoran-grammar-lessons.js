/**
 * Grammar basics lesson, materialized from the compiled grammar document.
 *
 * The seed (data/fonoran-grammar-lessons.json) stores only English sentences,
 * exercise kinds, and tip templates. The deterministic translator compiles the
 * roman (server-side, per lab revision — see tools/fonoran-grammar-lessons-compile.js),
 * and this module turns each compiled exercise into drill material procedurally:
 * reorder scrambles the compiled tokens, particle drills intersect them with the
 * closed particle class, and choose options pair the compiled answer with a
 * compiled contrast sentence or a mechanical token transform. No Fonoran spelling
 * is ever written by hand on this path.
 */
import { particleForms } from '../tools/fonoran-language-policy.js';
import { loadCoursePhrasesData } from './fonoran-course-phrases.js';
import { shuffle } from './utils.js';

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
    .replace(/[?？.!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTerminalPunct(text) {
  return String(text ?? '').replace(/[.?!]+$/, '').trim();
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
 * Resolve a compiled choose exercise's wrong option.
 * @param {object} exercise compiled exercise
 * @param {string[]} tokens compiled answer tokens
 * @returns {string | null}
 */
function distractorRoman(exercise, tokens) {
  const distractor = exercise.distractor;
  if (!distractor) return null;
  if (distractor.roman) {
    return distractor.status === 'translated' ? distractor.roman : null;
  }
  if (distractor.transform === 'drop-token') {
    const index = Number(distractor.index);
    if (!Number.isInteger(index) || index < 1 || index > tokens.length) return null;
    return tokens.filter((_, i) => i !== index - 1).join(' ');
  }
  return null;
}

/**
 * Materialize drill exercises from a compiled grammar document.
 * Exercises whose sentence (or required distractor) the translator cannot
 * currently say are dropped — a lesson never teaches stale or bracketed roman.
 *
 * @param {{ lessons?: Array<{ exercises?: object[] }> } | null} grammarDoc
 * @returns {GrammarLessonExercise[]}
 */
export function grammarLessonExercisesFromCompiled(grammarDoc) {
  /** @type {GrammarLessonExercise[]} */
  const out = [];
  const particleSet = new Set(particleForms());

  for (const lesson of grammarDoc?.lessons ?? []) {
    for (const exercise of lesson.exercises ?? []) {
      const roman = exercise.fonoran?.roman ?? '';
      if (exercise.fonoran?.status !== 'translated' || !roman) continue;

      const tokens = exercise.fonoran.tokens ?? roman.split(/\s+/).filter(Boolean);
      const cleanTokens = tokens.map(stripTerminalPunct).filter(Boolean);
      const base = {
        id: exercise.id,
        kind: exercise.kind,
        ...(exercise.tip ? { tip: exercise.tip } : {}),
        promptLang: exercise.promptLang ?? exercise.sourceText,
        answerRoman: roman,
        promptFonoran: roman,
        answerLang: exercise.sourceText,
        parts: tokens,
        spelling: roman,
        alternates: [stripTerminalPunct(roman)],
        tierRank: 0,
        itemType: /** @type {'phrase'} */ ('phrase'),
        domainIndex: 0,
      };

      if (exercise.kind === 'reorder') {
        const scrambled = shuffle(cleanTokens);
        out.push({
          ...base,
          promptLang: `Put these tokens in order: ${scrambled.join(' · ')}`,
          promptFonoran: scrambled.join(' · '),
        });
        continue;
      }

      if (exercise.kind === 'particles') {
        const particles = cleanTokens.filter((t) => particleSet.has(t));
        if (!particles.length) continue;
        out.push({
          ...base,
          promptLang: `Type the grammar particles in "${roman}" (space-separated):`,
          answerRoman: particles.join(' '),
          answerLang: particles.join(' '),
          alternates: [],
        });
        continue;
      }

      if (exercise.kind === 'choose') {
        const wrong = distractorRoman(exercise, tokens);
        if (!wrong || normalize(wrong) === normalize(roman)) continue;
        out.push({
          ...base,
          promptLang: stripMcqPromptOptions(base.promptLang),
          choices: [roman, wrong],
        });
        continue;
      }

      out.push(base);
    }
  }
  return out;
}

/**
 * @returns {Promise<GrammarLessonExercise[]>}
 */
export async function loadGrammarLessonExercises() {
  try {
    const data = await loadCoursePhrasesData();
    return grammarLessonExercisesFromCompiled(data?.grammar ?? null);
  } catch {
    return [];
  }
}

/**
 * Accept primary answer or listed alternates (terminal punctuation optional).
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
