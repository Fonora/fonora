#!/usr/bin/env node
/**
 * Build js/generated/language-policy.js from the canonical seeds.
 *
 * WHY THIS EXISTS
 *
 * The browser imports modules directly out of `tools/` (see language/word-composer.js,
 * language/lab-filters.js, js/app.js), so those modules cannot read the filesystem.
 * Historically that left one option: inline the language data as a JavaScript literal
 * and hand-maintain it. That is exactly how the Showcase aligner came to map English
 * "not" onto `ko` (the live root for *to drink*) and onto `ban` (a form that exists
 * nowhere in the seeds) while having no entry at all for `no`, the real negation
 * particle.
 *
 * Codegen removes the choice. Spellings are resolved from the seeds here, once, and
 * emitted as a plain module that both Node and the browser import synchronously.
 * `--check` re-derives and compares, so a stale generated file fails CI instead of
 * shipping.
 *
 * WHAT IS POLICY AND WHAT IS DERIVED
 *
 * `data/fonoran-grammar-policy.json` owns policy, keyed by CONCEPT ID: which concept
 * carries which grammatical function, and which English words map onto it. It never
 * contains a spelling. Spellings come from the roots, the particles, and compound
 * compositions, which is why respelling a root propagates everywhere without edits.
 *
 * Usage:
 *   node scripts/fonoran-build-language-policy.js            # write
 *   node scripts/fonoran-build-language-policy.js --check    # verify freshness (CI)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/js/generated/language-policy.js`;
const readJson = rel => JSON.parse(readFileSync(`${ROOT}/${rel}`, 'utf8'));

const policy = readJson('data/fonoran-grammar-policy.json');
const particles = readJson('data/fonoran-grammar-particles.json').particles ?? [];
const bucket = readJson('data/fonoran-sound-bucket.json');
const compounds = readJson('data/fonoran-compounds.json').compounds ?? [];
const rings = readJson('data/fonoran-root-rings.json');

const rootSpelling = new Map();
for (const entry of bucket.sounds ?? bucket.entries ?? bucket.words ?? []) {
  if (entry.concept_id) rootSpelling.set(entry.concept_id, entry.spelling);
}
const particleForm = new Map(particles.map(p => [p.id, p.form ?? null]));
const compoundByConcept = new Map(compounds.map(c => [c.concept, c]));
const lexicalized = policy.lexicalized ?? {};

const unresolved = [];

/**
 * Concept id -> current spelling. Order matters: a particle id wins over a root of
 * the same name, and compounds/lexicalized forms are assembled from their parts so
 * they cannot drift from the roots they are built out of.
 *
 * Returns null for the present-tense particle, which is correctly a zero form.
 */
function spellingFor(conceptId, seen = new Set()) {
  if (seen.has(conceptId)) return null; // guards a malformed self-referential composition
  seen.add(conceptId);

  if (particleForm.has(conceptId)) return particleForm.get(conceptId);
  if (rootSpelling.has(conceptId)) return rootSpelling.get(conceptId);

  const composition = compoundByConcept.get(conceptId)?.preferred?.composition
    ?? lexicalized[conceptId]?.composition;
  if (Array.isArray(composition) && composition.length) {
    const parts = composition.map(part => spellingFor(part, seen));
    if (parts.every(Boolean)) return parts.join('');
  }
  return null;
}

/** Resolve, recording anything that fails so the build can report instead of emitting a hole. */
function require_(conceptId, context) {
  const form = spellingFor(conceptId);
  if (!form) unresolved.push(`${context}: ${conceptId}`);
  return form;
}

const stripComments = obj => Object.fromEntries(
  Object.entries(obj).filter(([k]) => !k.startsWith('_')),
);

// Function words: emit both directions. `english` drives "which token does this typed
// word point at"; `byForm` is the convenience an aligner wants when walking tokens.
//
// Compile triggers are owned by the particle inventory (particles[].triggers); the
// policy lists only alignment extras — words that reach the form through other
// machinery ("was" -> tense_past). They are merged here so no English word is
// declared in two seed files.
const particleTriggers = new Map(
  particles.map(p => [p.id, (p.triggers ?? []).map(t => String(t).toLowerCase())]),
);
const functionWords = {};
for (const [conceptId, english] of Object.entries(stripComments(policy.function_word_english))) {
  const form = spellingFor(conceptId);
  if (!form) { unresolved.push(`function_word_english: ${conceptId}`); continue; }
  const merged = [...english];
  for (const trigger of particleTriggers.get(conceptId) ?? []) {
    if (!merged.includes(trigger)) merged.push(trigger);
  }
  functionWords[conceptId] = {
    form,
    english: merged,
    label: stripComments(policy.function_word_labels)[conceptId] ?? conceptId,
  };
}

const whComposition = {};
for (const [word, ids] of Object.entries(stripComments(policy.wh_composition))) {
  whComposition[word] = {
    concepts: ids,
    forms: ids.map(id => require_(id, `wh_composition[${word}]`)),
  };
}

const modalComposition = {};
for (const [sense, ids] of Object.entries(stripComments(policy.modal_composition))) {
  modalComposition[sense] = {
    concepts: ids,
    forms: ids.map(id => require_(id, `modal_composition[${sense}]`)),
  };
}

// Quantity dimensions are aspirational: several ids name concepts the language does
// not have yet. Emit only the ones that exist rather than failing the build.
const quantityDimensions = (policy.wh_quantity_dimensions?.ids ?? [])
  .map(id => ({ concept: id, form: spellingFor(id) }))
  .filter(entry => entry.form);

const disjunctionForm = require_(policy.disjunction.marker_concept, 'disjunction.marker_concept');

const ringByConcept = {};
for (const ring of rings.rings ?? []) {
  for (const conceptId of ring.concept_ids ?? []) ringByConcept[conceptId] = ring.id;
}

// Every concept the policy names, with its current spelling. Callers need this to
// resolve parts of a lexicalized form or a WH pair without shipping the whole lexicon,
// which stays the lab's job.
const conceptForms = {};
const noteConcept = (conceptId) => {
  if (!conceptId || conceptForms[conceptId] !== undefined) return;
  const form = spellingFor(conceptId);
  if (form) conceptForms[conceptId] = form;
};
for (const ids of Object.values(policy.wh_composition)) if (Array.isArray(ids)) ids.forEach(noteConcept);
for (const ids of Object.values(policy.modal_composition)) if (Array.isArray(ids)) ids.forEach(noteConcept);
for (const def of Object.values(stripComments(lexicalized))) (def.composition ?? []).forEach(noteConcept);
Object.keys(stripComments(policy.wh_dimension_english ?? {})).forEach(noteConcept);
Object.keys(functionWords).forEach(noteConcept);
noteConcept(policy.disjunction.marker_concept);

const generated = {
  policy_version: policy.version,
  concept_forms: conceptForms,
  function_words: functionWords,
  wh_composition: whComposition,
  wh_blocked: stripComments(policy.wh_blocked ?? {}),
  wh_dimension_english: stripComments(policy.wh_dimension_english ?? {}),
  wh_quantity_dimensions: quantityDimensions,
  modal_composition: modalComposition,
  modal_unmarked: stripComments(policy.modal_unmarked ?? {}),
  modal_blocked: stripComments(policy.modal_blocked ?? {}),
  disjunction: {
    marker_concept: policy.disjunction.marker_concept,
    marker_form: disjunctionForm,
    english: policy.disjunction.english,
    conjunction_english: policy.disjunction.conjunction_english,
  },
  lexicalized: Object.fromEntries(
    Object.entries(stripComments(lexicalized)).map(([id, def]) => [
      id,
      {
        form: spellingFor(id),
        composition: def.composition,
        part_forms: (def.composition ?? []).map(part => spellingFor(part)),
        gloss: def.gloss,
      },
    ]),
  ),
  particles: particles.map(p => ({ id: p.id, form: p.form ?? null })),
  ring_by_concept: ringByConcept,
  ring_caps: rings.caps ?? {},
};

if (unresolved.length) {
  console.error('Cannot build language policy: concept ids do not resolve to a spelling.');
  for (const line of unresolved) console.error(`  ${line}`);
  console.error('\nEither the policy names a concept the seeds do not have, or a seed was removed.');
  process.exit(1);
}

const banner = `/**
 * GENERATED FILE. DO NOT EDIT.
 *
 * Built from the canonical seeds by scripts/fonoran-build-language-policy.js:
 *   data/fonoran-grammar-policy.json    policy, keyed by concept id
 *   data/fonoran-grammar-particles.json particle inventory
 *   data/fonoran-sound-bucket.json      root spellings
 *   data/fonoran-compounds.json         compound compositions
 *   data/fonoran-root-rings.json        learning rings and caps
 *
 * Spellings here are DERIVED. To change one, change the seed and rebuild:
 *   npm run fonoran:build:policy
 *
 * Editing this file by hand will be reverted by the next build and will fail
 * \`npm test\`, which re-derives it and compares.
 */
`;

const body = `${banner}\nexport const LANGUAGE_POLICY = Object.freeze(${JSON.stringify(generated, null, 2)});\n\nexport default LANGUAGE_POLICY;\n`;

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('js/generated/language-policy.js is missing. Run: npm run fonoran:build:policy');
    process.exit(1);
  }
  if (current !== body) {
    console.error('js/generated/language-policy.js is STALE relative to the seeds.');
    console.error('A seed changed without rebuilding. Run: npm run fonoran:build:policy');
    process.exit(1);
  }
  console.log('✓ language policy current — generated module matches the seeds.');
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
const wordCount = Object.keys(functionWords).length;
const whCount = Object.keys(whComposition).length;
const modalCount = Object.keys(modalComposition).length;
console.log(`Wrote js/generated/language-policy.js — ${wordCount} function words, ${whCount} WH forms, ${modalCount} modal senses, ${Object.keys(ringByConcept).length} ring assignments.`);
