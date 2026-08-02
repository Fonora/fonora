/**
 * Compile the grammar lesson seed (English + exercise kind + tip templates) into
 * teachable material, at build time and at Learn runtime.
 *
 * The seed stores no Fonoran. Every answer comes from the same deterministic
 * translator as the course phrases and the golden corpus; tips resolve
 * placeholders from the seeds at compile time:
 *
 *   {particle:<id>}   → current particle form (data/fonoran-grammar-particles.json via policy)
 *   {particles}       → the closed particle class, joined with ' · '
 *   {concept:<id>}    → current lab spelling for a concept
 *
 * A choose exercise's wrong option is either a compiled contrast sentence
 * (`distractor.sourceText`) or a mechanical token transform (`distractor.transform`)
 * that the client applies to the compiled tokens — never a hand-written spelling.
 *
 * An exercise whose sentence (or compiled distractor) hits a translator gap is
 * marked so the client drops it: a lesson must never teach roman the language
 * cannot currently say.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePhrase } from './fonoran-course-phrases-compile.js';
import { particleForms, particleFormById } from './fonoran-language-policy.js';
import { getLab } from './fonoran-sound-bucket.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = join(ROOT, 'data/fonoran-grammar-lessons.json');

/** @returns {Promise<object>} */
export async function loadGrammarLessonSeed() {
  return JSON.parse(await readFile(SEED_PATH, 'utf8'));
}

/**
 * Concept id → current spelling, from the live lab (roots and compounds).
 * @param {object | null} lab
 * @returns {Promise<Map<string, string>>}
 */
async function conceptSpellings(lab) {
  const liveLab = lab ?? await getLab();
  const map = new Map();
  for (const item of [...(liveLab?.sounds ?? []), ...(liveLab?.compounds ?? [])]) {
    if (item.concept_id && item.spelling) map.set(item.concept_id, item.spelling);
  }
  return map;
}

/**
 * Resolve {particle:…} / {concept:…} / {particles} placeholders in a tip template.
 * An unresolvable placeholder returns null: better no tip than a wrong one.
 *
 * @param {string} template
 * @param {Map<string, string>} concepts
 * @returns {string | null}
 */
export function resolveTipTemplate(template, concepts) {
  let ok = true;
  const resolved = String(template ?? '').replace(
    /\{(particles|particle:[^}]+|concept:[^}]+)\}/g,
    (_, token) => {
      if (token === 'particles') return particleForms().join(' · ');
      const [kind, id] = token.split(':');
      const form = kind === 'particle' ? particleFormById(id) : concepts.get(id);
      if (!form) {
        ok = false;
        return '';
      }
      return form;
    },
  );
  return ok ? resolved : null;
}

/**
 * Compile the whole seed into a grammar lessons document.
 *
 * @param {object} seed
 * @param {{ lab?: object }} [opts]
 * @returns {Promise<{ version: string, title: string, lessons: object[] }>}
 */
export async function compileGrammarLessonsDocument(seed, opts = {}) {
  const concepts = await conceptSpellings(opts.lab ?? null);
  const lessons = [];

  for (const lesson of seed?.lessons ?? []) {
    const exercises = [];
    for (const exercise of lesson.exercises ?? []) {
      const fonoran = await compilePhrase(exercise.sourceText, { lab: opts.lab });

      /** @type {object | undefined} */
      let distractor;
      if (exercise.distractor?.sourceText) {
        const compiled = await compilePhrase(exercise.distractor.sourceText, { lab: opts.lab });
        distractor = {
          sourceText: exercise.distractor.sourceText,
          roman: compiled.roman,
          status: compiled.status,
        };
      } else if (exercise.distractor?.transform) {
        distractor = { ...exercise.distractor };
      }

      exercises.push({
        id: exercise.id,
        kind: exercise.kind,
        sourceText: exercise.sourceText,
        ...(exercise.promptLang ? { promptLang: exercise.promptLang } : {}),
        tip: resolveTipTemplate(exercise.tip, concepts),
        fonoran,
        ...(distractor ? { distractor } : {}),
      });
    }
    lessons.push({ id: lesson.id, title: lesson.title, exercises });
  }

  return {
    version: seed?.version ?? '2.0',
    title: seed?.title ?? 'Grammar basics',
    lessons,
  };
}
