/**
 * The single read surface for grammar policy: particles, interrogatives, modality,
 * disjunction, and learning rings.
 *
 * Every consumer, browser or Node, imports this instead of keeping its own copy.
 * Before it existed the closed particle list was written out in five or more files,
 * the interrogative and modal tables lived only in the translator, and the Showcase
 * aligner carried a hand-maintained map that had drifted into mapping English "not"
 * onto `ko`, the live root for *to drink*.
 *
 * Deliberately free of `node:fs` so the browser can import it directly, which is the
 * constraint that caused the duplication in the first place. Data arrives through the
 * generated module, rebuilt from the seeds by
 * `npm run fonoran:build:policy` and checked for freshness in `npm test`.
 *
 * Accessors are keyed by CONCEPT ID wherever a caller can manage it, because ids are
 * stable and spellings are not. The `*ByForm` helpers exist for callers walking
 * translator tokens, which only carry the roman.
 */

import { LANGUAGE_POLICY } from '../js/generated/language-policy.js';

/** Raw generated policy. Prefer the named accessors; this is for tooling and tests. */
export const POLICY = LANGUAGE_POLICY;

const normalize = value => String(value ?? '').trim().toLowerCase();

/**
 * Concept id -> spelling, from the generated snapshot.
 *
 * The snapshot is built from the committed seeds, and the committed seeds are the single
 * source of truth for the published language. There is deliberately no runtime override:
 * an earlier version overlaid spellings from the Postgres lab so that admin edits on
 * production would be reflected, but production does not need admin editing, and the
 * override let a database that had drifted from the seeds silently win over them.
 * Spellings change by editing a seed and rebuilding, which is checked by
 * `npm run fonoran:policy:check`.
 */
function resolveForm(conceptId) {
  const id = normalize(conceptId);
  return POLICY.concept_forms[id]
    ?? POLICY.function_words[id]?.form
    ?? POLICY.lexicalized[id]?.form
    ?? POLICY.particles.find(p => p.id === id)?.form
    ?? null;
}

/**
 * The closed particle class, spellings only, present tense excluded because it is a
 * zero form. Anything asserting "the six particles" should count this.
 */
export function particleForms() {
  return POLICY.particles
    .filter(p => p.form)
    .map(p => resolveForm(p.id) ?? p.form);
}

/** Particle id -> spelling, including the present-tense entry whose form is null. */
export function particleFormById(id) {
  const particle = POLICY.particles.find(p => p.id === normalize(id));
  if (!particle) return null;
  return particle.form === null ? null : (resolveForm(particle.id) ?? particle.form);
}

/** Current spelling for any concept the policy references (root, compound, particle, lexicalized). */
export function formForConcept(conceptId) {
  return resolveForm(conceptId);
}

/**
 * English words a speaker actually types, mapped to the concept that carries them.
 * Needed because a function word's own gloss is either its own roman (`mi` glossed
 * "mi") or a technical term ("addressee"), and neither matches typed English.
 */
export function functionWordEnglish(conceptId) {
  return POLICY.function_words[normalize(conceptId)]?.english ?? [];
}

/** Short human label for a poster or learner view, e.g. `addressee` -> "you". */
export function functionWordLabel(conceptId) {
  return POLICY.function_words[normalize(conceptId)]?.label ?? null;
}

/** Roman -> English aliases, for callers walking translator tokens. */
export function functionWordEnglishByForm() {
  const out = new Map();
  for (const [conceptId, entry] of Object.entries(POLICY.function_words)) {
    const form = resolveForm(conceptId) ?? entry.form;
    if (form) out.set(form, entry.english);
  }
  return out;
}

/** Roman -> short label, for callers walking translator tokens. */
export function functionWordLabelsByForm() {
  const out = new Map();
  for (const [conceptId, entry] of Object.entries(POLICY.function_words)) {
    const form = resolveForm(conceptId) ?? entry.form;
    if (form) out.set(form, entry.label);
  }
  return out;
}

/**
 * English WH-word -> the concept ids it compiles to, e.g. who -> [unknown, person].
 * Each pairs the unknown probe with a DIMENSION, never a value on a scale: "how many" asks
 * for the quantity axis, not for the value "many".
 */
export function whComposition() {
  return Object.fromEntries(
    Object.entries(POLICY.wh_composition).map(([word, entry]) => [word, entry.concepts]),
  );
}

/** English WH-word -> its rendered Fonoran, e.g. why -> "nohu gak". */
export function whSurface(word) {
  const entry = POLICY.wh_composition[normalize(word)];
  if (!entry) return null;
  const forms = entry.concepts.map((id, i) => resolveForm(id) ?? entry.forms[i]);
  return forms.every(Boolean) ? forms.join(' ') : null;
}

/** Interrogatives deliberately not expressible, mapped to the reason. Never guess past this. */
export function whBlocked() {
  return { ...POLICY.wh_blocked };
}

/** Dimension concept -> the single English WH-word its `unknown X` pair collapses into. */
export function whDimensionEnglish() {
  return { ...POLICY.wh_dimension_english };
}

/** Quantity dimension concepts that exist today, as a Set of spellings. */
export function whQuantityDimensionForms() {
  return new Set(POLICY.wh_quantity_dimensions.map(e => resolveForm(e.concept) ?? e.form));
}

/**
 * Quantity dimension concepts as a Set of concept ids. This is what callers walking
 * translator tokens want, because a token's `english` field carries the concept id
 * ("many"), not the spelling.
 */
export function whQuantityDimensionConcepts() {
  return new Set(POLICY.wh_quantity_dimensions.map(entry => entry.concept));
}

/**
 * Concept id of the unknown probe, as it appears in a token's `english` field.
 * Callers match on this rather than on `nohu`, so a respell cannot break them.
 */
export function unknownProbeConcept() {
  return Object.keys(POLICY.lexicalized)[0] ?? 'unknown';
}

/** The lexicalized unknown probe: spelling plus the parts it decomposes into. */
export function unknownWord() {
  const entry = POLICY.lexicalized.unknown;
  if (!entry) return null;
  const parts = entry.composition.map((id, i) => resolveForm(id) ?? entry.part_forms[i]);
  return {
    form: (parts.every(Boolean) ? parts.join('') : null) ?? entry.form,
    parts: parts.filter(Boolean),
    concepts: entry.composition,
    gloss: entry.gloss,
  };
}

/** Modal sense -> concept ids chained in the Action slot, e.g. ability -> [know]. */
export function modalComposition() {
  return Object.fromEntries(
    Object.entries(POLICY.modal_composition).map(([sense, entry]) => [sense, entry.concepts]),
  );
}

/** Modal sense -> its Fonoran marker, e.g. necessity -> "les". */
export function modalMarker(sense) {
  const entry = POLICY.modal_composition[normalize(sense)];
  if (!entry) return null;
  const forms = entry.concepts.map((id, i) => resolveForm(id) ?? entry.forms[i]);
  return forms.every(Boolean) ? forms.join(' ') : null;
}

/** Senses that correctly take NO marker (requests, proposals, inability), with the reason. */
export function modalUnmarked() {
  return { ...POLICY.modal_unmarked };
}

/** Modal senses left as honest gaps, with the reason each is not approximated. */
export function modalBlocked() {
  return { ...POLICY.modal_blocked };
}

/**
 * Disjunction: the concept that closes a coordinated group, its spelling, and the
 * English connectives it stands in for. Conjunction is bare juxtaposition, so it has
 * no marker.
 */
export function disjunction() {
  const d = POLICY.disjunction;
  return { ...d, marker_form: resolveForm(d.marker_concept) ?? d.marker_form };
}

/** Ring id a concept belongs to (`communicative_core`, `extended_core`, `fluent_core`). */
export function ringFor(conceptId) {
  return POLICY.ring_by_concept[normalize(conceptId)] ?? null;
}

/** Cumulative root caps per ring, from the Constitution's 150 ceiling. */
export function ringCaps() {
  return { ...POLICY.ring_caps };
}
