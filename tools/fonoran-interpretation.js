/**
 * Interpretive layer: map English surface forms to nearest Fonoran concept ids.
 * See docs/fonoran-interpretive-translator.md
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lemmatizeEnglish, POSSESSIVE_DETERMINERS, LEADING_TIME_WORDS } from './fonoran-english-morphology.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_PATH = join(ROOT, 'data/fonoran-interpretation-rules.json');

/** @type {object | null} */
let rulesCache = null;

const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * Possessive determiner -> the reference that carries the possessor in Fonoran.
 * Spellings are never stored here: `my` rides the pronoun_i particle and
 * `your`/`our` resolve through the addressee/collective lexical roots, so a
 * seed respell flows through with no code change. Third person is left out on
 * purpose: there is no approved pronoun for it and inventing one is not this
 * layer's job. The structure parser skips exactly these words (and no others),
 * so a possessor is rendered once, by the translator's re-attachment pass.
 */
export const POSSESSIVE_OWNERS = new Map([
  ['my', { particle_id: 'pronoun_i' }], ['mine', { particle_id: 'pronoun_i' }],
  ['your', { concept_id: 'addressee' }], ['yours', { concept_id: 'addressee' }],
  ['our', { concept_id: 'collective' }], ['ours', { concept_id: 'collective' }],
]);

/**
 * Lexical time / scene-setting concept ids. These are the Time periphery
 * (not tense particles ta/sa). When present they front as scene-setting so
 * complex sentences keep “when/where in time” before the main Actor·Action.
 */
export const TEMPORAL_SCENE_CONCEPT_IDS = new Set([
  ...LEADING_TIME_WORDS,
  'long_ago',
  'before',
  'after',
  'beginning',
  'morning',
  'night',
  'day',
  'yesterday',
  'tomorrow',
]);

/** Topics that ride with a temporal scene (e.g. beginning+world), not Place. */
export const TEMPORAL_SCENE_TOPIC_IDS = new Set(['world']);

/** Stable fronting order for scene-time concepts (unknown ids sort last). */
export const TEMPORAL_SCENE_FRONT_ORDER = [
  'long_ago', 'yesterday', 'before', 'after', 'tomorrow', 'today', 'tonight',
  'now', 'morning', 'night', 'day', 'beginning', 'world',
];

export async function loadInterpretationRules() {
  if (rulesCache) return rulesCache;
  try {
    rulesCache = JSON.parse(await readFile(RULES_PATH, 'utf8'));
  } catch {
    rulesCache = { version: '1.0', spatial_path: {}, classes: {}, idioms: {} };
  }
  return rulesCache;
}

/** Reset cached rules (tests). */
export function resetInterpretationCache() {
  rulesCache = null;
  classIndexCache = null;
  classIndexRules = null;
}

/** @type {Map<string, object> | null} */
let classIndexCache = null;
/** @type {object | null} */
let classIndexRules = null;

function buildClassIndex(rules) {
  if (classIndexCache && classIndexRules === rules) return classIndexCache;
  const byWord = new Map();
  for (const [classId, spec] of Object.entries(rules.classes ?? {})) {
    for (const word of spec.words ?? []) {
      const key = word.toLowerCase();
      if (!byWord.has(key)) {
        byWord.set(key, {
          concept_id: spec.concept_id,
          reason: spec.reason,
          class: classId,
        });
      }
    }
  }
  classIndexCache = byWord;
  classIndexRules = rules;
  return byWord;
}

/**
 * Lemma candidates for a surface form: the word itself plus its dictionary form.
 * Morphology is wink-nlp's job (see fonoran-english-morphology.js); the hand
 * -ed/-en stripping that used to sit here was the exact drift that module warns
 * against, and produced non-words the alias index then had to absorb.
 */
export function lemmaCandidates(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return [];
  return [...new Set([w, lemmatizeEnglish(w)])].filter(Boolean);
}

/**
 * Strip leading articles, possessives, and optional skip words from token list.
 */
export function stripLeadingFunctionWords(tokens, { skip = null } = {}) {
  const out = [...tokens];
  while (out.length) {
    const w = out[0].toLowerCase();
    if (ARTICLES.has(w) || POSSESSIVE_DETERMINERS.has(w) || skip?.has(w)) {
      out.shift();
      continue;
    }
    break;
  }
  return out;
}

/** Nominal phrase for lookup: drop leading function words, join remainder. */
export function nominalPhraseFromTokens(tokens, opts = {}) {
  return stripLeadingFunctionWords(tokens, opts).join(' ');
}

/** Nominal phrase from string. */
export function nominalPhrase(phrase, opts = {}) {
  const parts = String(phrase ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return nominalPhraseFromTokens(parts, opts);
}

/** Head noun: last content word after stripping function words. */
export function headNounToken(tokens, opts = {}) {
  const stripped = stripLeadingFunctionWords(tokens, opts);
  return stripped.at(-1) ?? null;
}

/**
 * @param {string} english
 * @param {string} [role]
 * @param {object} [rules]
 * @returns {{ concept_id: string, reason: string, class?: string } | null}
 */
export function interpretToConcept(english, role, rules) {
  const raw = String(english ?? '').trim().toLowerCase();
  if (!raw || !rules) return null;

  const spatial = rules.spatial_path?.[raw];
  if (spatial && (role === 'path' || role === 'modifier' || role === 'object')) {
    return { concept_id: spatial.concept_id, reason: spatial.reason, class: 'spatial_path' };
  }

  const classIndex = buildClassIndex(rules);
  const candidates = [raw, lemmatizeEnglish(raw)];
  for (const key of candidates) {
    const hit = classIndex.get(key);
    if (hit && (role === 'event' || role === 'concept' || !role)) return hit;
  }

  return null;
}

/**
 * Like interpretToConcept but tries class/spatial rules even when role would normally block them.
 */
export function interpretToConceptRelaxed(english, role, rules) {
  const direct = interpretToConcept(english, role, rules);
  if (direct) return direct;

  const raw = String(english ?? '').trim().toLowerCase();
  if (!raw || !rules) return null;

  const asConcept = interpretToConcept(raw, 'concept', rules);
  if (asConcept) return asConcept;

  const spatial = rules.spatial_path?.[raw];
  if (spatial) {
    return { concept_id: spatial.concept_id, reason: spatial.reason, class: 'spatial_path' };
  }

  const classIndex = buildClassIndex(rules);
  for (const key of lemmaCandidates(raw, rules)) {
    const hit = classIndex.get(key);
    if (hit) return hit;
  }

  return null;
}

/** Determiners that begin time adverbials: every morning, each day. */
export const TIME_DETERMINERS = new Set(['every', 'each', 'all', 'this', 'that', 'one']);

const TIME_NOUNS = new Set([
  'morning', 'evening', 'night', 'day', 'week', 'month', 'year',
  'hour', 'hours', 'minute', 'minutes', 'second', 'seconds',
  'dawn', 'dusk', 'noon', 'midnight', 'afternoon', 'weekend',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

/** Merge phrasal particles: wake + up → wake up. */
export function mergePhrasalTokens(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]?.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();
    if (next === 'up' && (t === 'wake' || t === 'wakes' || t === 'woke' || t === 'waking' || t === 'gets')) {
      out.push(`${tokens[i]} up`);
      i += 2;
      continue;
    }
    out.push(tokens[i]);
    i += 1;
  }
  return out;
}

/** Leading time phrase: yesterday; every morning, each day. */
export function matchLeadingTimeAdverbial(tokens) {
  if (!tokens.length) return null;
  const head = tokens[0]?.toLowerCase();
  if (LEADING_TIME_WORDS.has(head)) {
    return { english: head, consumed: 1 };
  }
  if (tokens.length === 1) {
    const parts = head.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && TIME_DETERMINERS.has(parts[0]) && TIME_NOUNS.has(parts[1])) {
      return { english: head, consumed: 1 };
    }
    return null;
  }
  if (!TIME_DETERMINERS.has(head)) return null;
  if (!TIME_NOUNS.has(tokens[1]?.toLowerCase())) return null;
  return {
    english: `${tokens[0]} ${tokens[1]}`.toLowerCase(),
    consumed: 2,
  };
}

/**
 * Strip leading articles from a landmark phrase for lookup.
 * @param {string} phrase
 */
export function landmarkPhrase(phrase) {
  const parts = String(phrase ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  while (parts.length && ARTICLES.has(parts[0])) parts.shift();
  return parts.join(' ');
}

