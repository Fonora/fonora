/**
 * Source-language parsers: the boundary between "understanding the source
 * language" and "speaking Fonoran".
 *
 * The architecture (CLAUDE.md, the diagram) is: a third-party parser owns the
 * source language, produces a language-neutral meaning, and the one Fonoran
 * engine renders it. This module is that boundary made concrete. `sourceLang`
 * selects a parser here; it is no longer a binary "Fonoran or not" question.
 * Adding Spanish is registering a Spanish parser — never adding Spanish rules
 * to the engine.
 *
 * ## The parser contract
 *
 * A parser is a module that exports:
 *
 *   - `lang`                      — BCP-47-ish language code it owns (e.g. 'en').
 *                                   Selects the localization seed the resolver
 *                                   keys the lexicon on (localizations/<lang>.json)
 *   - `morphology`                — `{ lemmatize, inflectedLemma, lemmaCandidates }`,
 *                                   the hooks the resolver uses to reduce this
 *                                   language's surface forms to dictionary forms
 *   - `splitSentences(text)`      — text → sentence strings
 *   - `isQuestionSentence(s)`     — was this sentence asked, in the source
 *                                   language's own marking?
 *   - `compileSlots(sentence, { isQuestion, rules, aliasIndex })`
 *                                 — one sentence → the neutral slot structure
 *                                   below. Owns its own tokenization.
 *
 * ## The neutral meaning (slot structure)
 *
 * `emptySlots()` is the shape. Six role arrays — subject (Actor), time, event
 * (Action), path (Place), object (Target), modifiers — whose entries carry:
 *
 *   - `english`      — the source surface form, for lexicon lookup and honest
 *                      gap reporting (field name is historical; it is "source
 *                      surface", whatever the language)
 *   - `role`         — which slot it fills
 *   - `concept_hint` / `interpret_reason` — a curated nearest-concept nudge
 *   - `particle_id`  — a grammar FACT by id (tense_past, logic_not, pronoun_i…)
 *   - `possessor`    — a { particle_id } or { concept_id } reference
 *   - `surface`      — the form as written when it differs from the lemma
 *
 * A parser may name grammar facts (by particle id) and concepts (by id). It
 * must never emit a Fonoran spelling: spellings live in the seeds and are
 * attached by the engine, so a respell flows through every parser unchanged.
 */

import * as english from './fonoran-source-english.js';

/** Installed parsers by language code. Literal keys: see module-cycle note below. */
const REGISTRY = new Map([
  ['en', english],
]);

/**
 * The parser for a source language, or null when none is installed.
 * '', 'auto', and undefined resolve to English while it is the only parser;
 * an explicit unknown language returns null so the caller can answer honestly
 * instead of silently reading it as English.
 */
export function getSourceParser(sourceLang) {
  const lang = String(sourceLang ?? '').trim().toLowerCase();
  if (!lang || lang === 'auto') return REGISTRY.get('en');
  return REGISTRY.get(lang) ?? null;
}

/** Language codes with an installed parser. */
export function supportedSourceLangs() {
  return [...REGISTRY.keys()];
}

// The two helpers below are function declarations on purpose: the English
// parser imports them from here while this module imports the English parser,
// and hoisted declarations are what makes that cycle safe to evaluate.

/** The neutral slot structure every parser produces and the engine consumes. */
export function emptySlots() {
  return {
    subject: [],
    time: [],
    event: [],
    path: [],
    object: [],
    modifiers: [],
  };
}

/** Merge one slot set into another, in place. */
export function appendSlots(target, source) {
  for (const key of ['subject', 'time', 'event', 'path', 'object', 'modifiers']) {
    target[key].push(...source[key]);
  }
}
