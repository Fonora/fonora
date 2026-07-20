/**
 * Interpretive layer: map English surface forms to nearest Fonoran concept ids.
 * See docs/fonoran-interpretive-translator.md
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPosHint } from './fonoran-semantic-lookup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_PATH = join(ROOT, 'data/fonoran-interpretation-rules.json');

/** @type {object | null} */
let rulesCache = null;

const ARTICLES = new Set(['a', 'an', 'the']);

/** Possessive determiners stripped before nominal lookup (grammar particles TBD). */
export const POSSESSIVES = new Set([
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours',
]);

/** Prepositions that introduce an object landmark after an idiom or clause. */
export const PREP_OBJECT = new Set([
  'with', 'against', 'versus', 'vs', 'toward', 'towards', 'from', 'by',
]);

/** Prepositions that split a trailing NP into head + locative modifier. */
export const NP_BOUNDARY_PREPS = new Set([
  ...PREP_OBJECT,
  'in', 'at', 'on', 'into', 'onto', 'near', 'around', 'through', 'across', 'over', 'under',
  'between', 'among', 'inside', 'outside', 'within', 'without', 'behind', 'beside', 'beyond',
]);

/**
 * Spatial-relation prepositions that carry real positional meaning but have no
 * Fonoran concept root yet. In a locative predicate ("the cat is behind the
 * tree") they must surface as an honest Place-slot gap ([behind]) instead of
 * being swallowed by head-noun reduction. Relations that DO have a concept
 * (over→up, under→down, near, inside, outside, beside→near) are handled by the
 * spatial_path rules and are deliberately excluded here.
 */
export const LOCATIVE_GAP_PREPS = new Set([
  'behind', 'between', 'among', 'beyond', 'around',
]);

/** English futurate auxiliaries (go/goes are locomotion, not future markers). */
const FUTURE_INTENT_MARKERS = new Set(['will', 'shall']);

/** Locomotion verbs outside the locomotion class index. */
const LOCOMOTION_EXTRA = new Set([
  'go', 'goes', 'went', 'going', 'gone',
  'come', 'came', 'comes', 'coming',
  'return', 'returned', 'returns', 'returning',
  'leave', 'left', 'leaves', 'leaving',
]);

/** Calendar words that open a clause as a time adverbial. */
export const LEADING_TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'now', 'tonight']);

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

const TENSE_AUX_FOR_MOTION = new Set([
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
]);

const BE_FORMS = new Set(['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being']);

export async function loadInterpretationRules() {
  if (rulesCache) return rulesCache;
  try {
    rulesCache = JSON.parse(await readFile(RULES_PATH, 'utf8'));
  } catch {
    rulesCache = { version: '1.0', spatial_path: {}, classes: {}, phrase_patterns: [] };
  }
  return rulesCache;
}

/** Reset cached rules (tests). */
export function resetInterpretationCache() {
  rulesCache = null;
  classIndexCache = null;
  classIndexRules = null;
}

function lemmatizeForInterpret(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    if (base.endsWith(base.at(-1)) && !base.endsWith('ing')) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('ed') && w.length > 4) {
    if (w.endsWith('ied')) return `${w.slice(0, -3)}y`;
    if (w.endsWith('ted') || w.endsWith('ded')) return w.slice(0, -1);
    const base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('en') && w.length > 4) {
    const base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
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

export function irregularPastLemma(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w || !rules?.irregular_past) return null;
  return rules.irregular_past[w] ?? null;
}

export function isIrregularPastForm(word, rules) {
  return Boolean(irregularPastLemma(word, rules));
}

/** Lemma candidates for past-tense and past-participle surface forms. */
export function lemmaCandidates(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return [];
  const out = new Set([w]);
  const past = irregularPastLemma(w, rules);
  if (past) out.add(past);
  out.add(lemmatizeForInterpret(w));
  if (w.endsWith('ed') && w.length > 4) {
    out.add(w.slice(0, -1));
    out.add(w.slice(0, -2));
  }
  if (w.endsWith('en') && w.length > 4) {
    out.add(w.slice(0, -2));
    out.add(w.slice(0, -1));
  }
  return [...out].filter(Boolean);
}

/** Surface forms that are passive participles but not -ed/-en (born, sworn, …). */
const PARTICIPLE_LEmmas = new Set(['born', 'sworn', 'forbidden', 'hidden', 'shorn', 'worn']);

export function looksLikeParticiple(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return false;
  if (irregularPastLemma(w, rules)) return true;
  if (PARTICIPLE_LEmmas.has(w)) return true;
  if (rules?.participles?.[w]) return true;
  for (const lemma of lemmaCandidates(w, rules)) {
    if (rules?.participles?.[lemma]) return true;
  }
  if (w.endsWith('ed') || w.endsWith('en')) return true;
  return false;
}

/** Split copula predicate into separate modifier slots (free, equal, dignity, rights). */
export function splitPredicateModifiers(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];

  const segments = [];
  const inMatch = raw.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    segments.push(...splitAndCoordinated(inMatch[1]));
    segments.push(...splitAndCoordinated(inMatch[2]));
  } else {
    segments.push(...splitAndCoordinated(raw));
  }

  return segments.filter(Boolean).map(english => ({ english, role: 'modifier' }));
}

function splitAndCoordinated(phrase) {
  return String(phrase ?? '')
    .split(/\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Strip leading articles, possessives, and optional skip words from token list.
 */
export function stripLeadingFunctionWords(tokens, { skip = null } = {}) {
  const out = [...tokens];
  while (out.length) {
    const w = out[0].toLowerCase();
    if (ARTICLES.has(w) || POSSESSIVES.has(w) || skip?.has(w)) {
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
 * Parse tokens after an idiom/clause into object vs modifier slots.
 */
export function parseTrailingPhrase(tokens, { skip = null } = {}) {
  const raw = tokens.filter(w => {
    const x = w.toLowerCase();
    return !BE_FORMS.has(x) && !ARTICLES.has(x);
  });
  if (!raw.length) return { object: [], modifiers: [] };

  if (PREP_OBJECT.has(raw[0]?.toLowerCase())) {
    const npRaw = raw.slice(1);
    const npText = npRaw.join(' ');
    const coordParts = npText.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    if (coordParts.length > 1) {
      return {
        object: [{ english: coordParts[0], role: 'object' }],
        modifiers: coordParts.slice(1).map(p => ({ english: p, role: 'modifier' })),
      };
    }
    const np = npRaw.filter(w => !skip?.has(w.toLowerCase()));
    if (np.length) {
      return {
        object: [{ english: np.join(' '), role: 'object' }],
        modifiers: [],
      };
    }
  }

  // Locative predicate: a leading spatial/relational preposition ("is behind
  // the tree", "is above the river") introduces a position relation. Surface the
  // relation in the Place slot — its spatial concept if one exists (above → up),
  // otherwise an honest gap ([behind]) — plus the ground as the object, instead
  // of silently swallowing the preposition via head-noun reduction. Contentless
  // containment preps (in/at/on/into) stay in `skip` and fall through unchanged.
  const leadPrep = raw[0]?.toLowerCase();
  if (raw.length >= 2 && NP_BOUNDARY_PREPS.has(leadPrep) && !skip?.has(leadPrep)) {
    const groundRaw = raw.slice(1).filter(w => !skip?.has(w.toLowerCase()));
    const ground = groundRaw.join(' ');
    return {
      object: ground ? [{ english: ground, role: 'object' }] : [],
      path: [{ english: leadPrep, role: 'path' }],
      modifiers: [],
    };
  }

  const words = raw.filter(w => !skip?.has(w.toLowerCase()));
  if (!words.length) return { object: [], modifiers: [] };

  const prepIdx = words.findIndex((w, idx) => idx > 0 && NP_BOUNDARY_PREPS.has(w.toLowerCase()));
  if (prepIdx > 0) {
    const headPart = parseTrailingPhrase(words.slice(0, prepIdx), { skip });
    const tailPart = parseTrailingPhrase(words.slice(prepIdx), { skip });
    return {
      object: headPart.object,
      path: [...(headPart.path ?? []), ...(tailPart.path ?? [])],
      modifiers: [
        ...headPart.modifiers,
        ...tailPart.object.map(o => ({ ...o, role: 'modifier' })),
        ...tailPart.modifiers,
      ],
    };
  }

  if (words.length >= 2 && words.some(w => w.toLowerCase() === 'and')) {
    const joined = words.join(' ');
    const parts = joined.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return {
        object: [{ english: parts[0], role: 'object' }],
        modifiers: parts.slice(1).map(p => ({ english: p, role: 'modifier' })),
      };
    }
  }

  if (words.length >= 2) {
    return {
      object: [{ english: words.join(' '), role: 'object' }],
      modifiers: [],
    };
  }

  return {
    object: [],
    modifiers: words.map(w => ({ english: w, role: 'modifier' })),
  };
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
  const candidates = [raw, lemmatizeForInterpret(raw)];
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

/** Copula-like verbs: SUBJECT + linking + ADJ. */
export const LINKING_VERBS = new Set([
  'feel', 'feels', 'felt', 'feeling',
  'seem', 'seems', 'seemed',
  'look', 'looks', 'looked',
  'sound', 'sounds', 'sounded',
  'taste', 'tastes', 'tasted',
  'smell', 'smells', 'smelled', 'smelt',
  'appear', 'appears', 'appeared',
]);

const LINKING_CONCEPT = {
  feel: 'feel', feels: 'feel', felt: 'feel', feeling: 'feel',
  seem: 'be', seems: 'be', seemed: 'be',
  look: 'see', looks: 'see', looked: 'see',
  sound: 'speak', sounds: 'speak', sounded: 'speak',
  taste: 'eat', tastes: 'eat', tasted: 'eat',
  smell: 'know', smells: 'know', smelled: 'know', smelt: 'know',
  appear: 'see', appears: 'see', appeared: 'see',
};

/** Desire/modal verbs that take a to-infinitive complement. */
const DESIRE_VERBS = new Set([
  'want', 'wants', 'wanted', 'wanting',
  'wish', 'wishes', 'wished', 'wishing',
  'hope', 'hopes', 'hoped', 'hoping',
  'need', 'needs', 'needed', 'needing',
  'like', 'likes', 'liked', 'liking',
  'plan', 'plans', 'planned', 'planning',
  'try', 'tries', 'tried', 'trying',
]);

/**
 * DESIRE_VERB + to + VERB + NP* → event (desire) + object (infinitive verb) + modifiers (NP).
 */
export function matchDesireInfinitive(tokens, rules) {
  if (!tokens?.length || tokens.length < 3) return null;

  let start = 0;
  const head = tokens[0]?.toLowerCase();
  if (tokens.length >= 4 && !DESIRE_VERBS.has(head)) start = 1;

  const desire = tokens[start]?.toLowerCase();
  if (!DESIRE_VERBS.has(desire)) return null;

  const toIdx = start + 1;
  if (tokens[toIdx]?.toLowerCase() !== 'to') return null;

  const verbIdx = toIdx + 1;
  const infVerb = tokens[verbIdx];
  if (!infVerb || ARTICLES.has(infVerb.toLowerCase())) return null;

  const npParts = tokens.slice(verbIdx + 1);
  let i = 0;
  while (i < npParts.length && ARTICLES.has(npParts[i]?.toLowerCase())) i += 1;
  const npRest = npParts.slice(i);

  const modifiers = [];
  if (npRest.length) {
    const trailing = parseTrailingPhrase(npRest, { skip: null });
    modifiers.push(...trailing.object, ...trailing.modifiers);
  }

  return {
    subject: start > 0 ? { english: tokens[0], role: 'subject' } : null,
    event: { english: tokens[start], role: 'event' },
    object: { english: infVerb, role: 'object' },
    modifiers,
  };
}

/**
 * Assign trailing tokens in naive fallback — per-token modifiers unless a verb appears.
 */
export async function assignFallbackTrailing(tokens, rules, { skip = null } = {}) {
  if (!tokens.length) return { object: [], modifiers: [] };
  const raw = tokens.filter(w => {
    const x = w.toLowerCase();
    return !BE_FORMS.has(x) && !ARTICLES.has(x) && !skip?.has(x);
  });
  if (!raw.length) return { object: [], modifiers: [] };
  if (raw.length === 1) {
    return { object: [], modifiers: [{ english: raw[0], role: 'modifier' }] };
  }
  for (const w of raw) {
    if (await getPosHint(w) === 'verb') {
      return { object: [], modifiers: raw.map(t => ({ english: t, role: 'modifier' })) };
    }
  }
  return { object: [], modifiers: raw.map(t => ({ english: t, role: 'modifier' })) };
}

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

/** Whether a surface form is a locomotion verb (move family). */
export function isLocomotionVerb(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return false;
  if (LOCOMOTION_EXTRA.has(w)) return true;
  const classIndex = buildClassIndex(rules);
  for (const key of lemmaCandidates(w, rules)) {
    if (classIndex.get(key)?.concept_id === 'move') return true;
  }
  return false;
}

function isLikelyInfinitiveVerb(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w || ARTICLES.has(w) || w === 'away' || w === 'from') return false;
  if (BE_FORMS.has(w) || TENSE_AUX_FOR_MOTION.has(w)) return false;
  if (isLocomotionVerb(w, rules)) return true;
  const classIndex = buildClassIndex(rules);
  for (const key of lemmaCandidates(w, rules)) {
    if (classIndex.has(key)) return true;
  }
  return false;
}

function stripSubjectNoise(parts) {
  return parts.filter(w => {
    const x = w?.toLowerCase();
    return x && !BE_FORMS.has(x) && !ARTICLES.has(x) && !TENSE_AUX_FOR_MOTION.has(x);
  });
}

const SUBORDINATORS = new Set([
  'after', 'before', 'when', 'while', 'until', 'since', 'because', 'although', 'if', 'as',
]);

/** Stop landmark NPs at clause boundaries and trailing time adverbs. */
export const CLAUSE_BOUNDARY = new Set([
  'but', 'and', 'or', 'when', 'after', 'before', 'because', 'although', 'if', 'then', 'while', 'until', 'since',
]);

const TRAILING_TIME_IN_NP = new Set(['tomorrow', 'today', 'yesterday', 'tonight', 'now']);

function spatialPrepKeys(rules) {
  return new Set(Object.keys(rules?.spatial_path ?? {}));
}

function looksLikeVerbWord(word, rules) {
  const w = String(word ?? '').toLowerCase();
  if (!w || BE_FORMS.has(w) || TENSE_AUX_FOR_MOTION.has(w)) return false;
  if (isLocomotionVerb(w, rules)) return true;
  if (LINKING_VERBS.has(w)) return true;
  const classIndex = buildClassIndex(rules);
  for (const key of lemmaCandidates(w, rules)) {
    if (classIndex.has(key)) return true;
  }
  if (w.endsWith('ed') && w.length > 3) return true;
  return false;
}

function subjectPartsBeforeVerb(tokens, verbIdx, rules) {
  const parts = stripSubjectNoise(tokens.slice(0, verbIdx));
  if (!parts.length) return parts;
  const lower = parts.map(p => p.toLowerCase());
  if (lower.some(w => SUBORDINATORS.has(w))) return null;
  if (parts.some(w => looksLikeVerbWord(w, rules))) return null;
  return parts;
}

function extractLandmarkNp(tokens, start, { stopPreps = null } = {}) {
  let i = start;
  while (i < tokens.length && ARTICLES.has(tokens[i]?.toLowerCase())) i += 1;
  const parts = [];
  for (; i < tokens.length; i += 1) {
    const w = tokens[i]?.toLowerCase();
    if (CLAUSE_BOUNDARY.has(w)) break;
    if (stopPreps?.has(w)) break;
    if (TRAILING_TIME_IN_NP.has(w) && parts.length) break;
    parts.push(tokens[i]);
  }
  if (!parts.length) return null;
  return { english: parts.join(' '), end: i };
}

function pathEntry(prep, rules) {
  const key = prep?.toLowerCase();
  const spec = rules?.spatial_path?.[key];
  return {
    english: key,
    role: 'path',
    concept_hint: spec?.concept_id ?? null,
    interpret_reason: spec?.reason ?? 'spatial path',
  };
}

function inferMotionTense(tokens, eventWord, rules) {
  for (const t of tokens) {
    const x = t?.toLowerCase();
    if (x === 'will' || x === 'shall') return 'future';
    if (TENSE_AUX_FOR_MOTION.has(x) && (x === 'was' || x === 'were' || x === 'did' || x === 'had')) {
      return 'past';
    }
  }
  const w = String(eventWord ?? '').toLowerCase();
  if (irregularPastLemma(w, rules)) return 'past';
  if (w === 'went' || w === 'came' || w === 'left' || w === 'returned') return 'past';
  if (w.endsWith('ed') && w.length > 3) return 'past';
  return 'present';
}

/**
 * SUBJECT* + locomotion verb + toward NP + from NP.
 */
export function matchMotionTowardFrom(tokens, rules) {
  if (!tokens?.length || tokens.length < 5) return null;
  const preps = spatialPrepKeys(rules);

  for (let verbIdx = 0; verbIdx < tokens.length; verbIdx += 1) {
    const verb = tokens[verbIdx];
    if (!isLocomotionVerb(verb, rules)) continue;

    const prep1 = tokens[verbIdx + 1]?.toLowerCase();
    if (prep1 !== 'toward' && prep1 !== 'towards' && prep1 !== 'to') continue;

    const midLandmark = extractLandmarkNp(tokens, verbIdx + 2);
    if (!midLandmark) continue;
    if (tokens[midLandmark.end]?.toLowerCase() !== 'from') continue;

    const finalLandmark = extractLandmarkNp(tokens, midLandmark.end + 1);
    if (!finalLandmark) continue;

    const subjectParts = subjectPartsBeforeVerb(tokens, verbIdx, rules);
    if (subjectParts === null) continue;

    return {
      subject: subjectParts.length
        ? { english: subjectParts.join(' '), role: 'subject' }
        : null,
      event: { english: verb, role: 'event' },
      path: [pathEntry(prep1, rules), pathEntry('from', rules)],
      object: { english: finalLandmark.english, role: 'object' },
      modifiers: [{ english: midLandmark.english, role: 'modifier' }],
      tense: inferMotionTense(tokens, verb, rules),
    };
  }
  return null;
}

/**
 * SUBJECT* + locomotion verb + spatial prep + landmark NP.
 * Scans raw tokens before function-word stripping so preps stay visible.
 */
export function matchMotionDestination(tokens, rules) {
  if (!tokens?.length || tokens.length < 2) return null;
  const preps = spatialPrepKeys(rules);

  for (let verbIdx = 0; verbIdx < tokens.length; verbIdx += 1) {
    const verb = tokens[verbIdx];
    if (!isLocomotionVerb(verb, rules)) continue;

    let i = verbIdx + 1;
    const prep = tokens[i]?.toLowerCase();
    let pathSlot = null;
    let landmark = null;

    if (prep && preps.has(prep) && prep !== 'away' && prep !== 'from') {
      pathSlot = pathEntry(prep, rules);
      i += 1;
      landmark = extractLandmarkNp(tokens, i);
    } else {
      const deictic = tokens[i]?.toLowerCase();
      if (deictic === 'here' || deictic === 'there') {
        pathSlot = pathEntry('to', rules);
        landmark = { english: deictic, end: i + 1 };
      } else {
        continue;
      }
    }

    if (!landmark) continue;

    const subjectParts = subjectPartsBeforeVerb(tokens, verbIdx, rules);
    if (subjectParts === null) continue;

    const trailingTime = [];
    const trailWord = tokens[landmark.end]?.toLowerCase();
    if (trailWord && TRAILING_TIME_IN_NP.has(trailWord)) {
      trailingTime.push({ english: trailWord, role: 'time' });
    }

    return {
      subject: subjectParts.length
        ? { english: subjectParts.join(' '), role: 'subject' }
        : null,
      event: { english: verb, role: 'event' },
      path: pathSlot,
      object: { english: landmark.english, role: 'object' },
      trailingTime,
      tense: inferMotionTense(tokens, verb, rules),
    };
  }
  return null;
}

/**
 * SUBJECT* + locomotion verb + from + landmark NP → path source.
 */
export function matchMotionFrom(tokens, rules) {
  if (!tokens?.length || tokens.length < 3) return null;

  for (let verbIdx = 0; verbIdx < tokens.length; verbIdx += 1) {
    const verb = tokens[verbIdx];
    if (!isLocomotionVerb(verb, rules)) continue;
    if (tokens[verbIdx + 1]?.toLowerCase() !== 'from') continue;

    const landmark = extractLandmarkNp(tokens, verbIdx + 2);
    if (!landmark) continue;

    const subjectParts = subjectPartsBeforeVerb(tokens, verbIdx, rules);
    if (subjectParts === null) continue;

    return {
      subject: subjectParts.length
        ? { english: subjectParts.join(' '), role: 'subject' }
        : null,
      event: { english: verb, role: 'event' },
      path: pathEntry('from', rules),
      object: { english: landmark.english, role: 'object' },
      tense: inferMotionTense(tokens, verb, rules),
    };
  }
  return null;
}

/**
 * SUBJECT* + locomotion verb + away [from landmark NP].
 */
export function matchMotionAway(tokens, rules) {
  if (!tokens?.length || tokens.length < 2) return null;

  for (let verbIdx = 0; verbIdx < tokens.length; verbIdx += 1) {
    const verb = tokens[verbIdx];
    if (!isLocomotionVerb(verb, rules)) continue;
    if (tokens[verbIdx + 1]?.toLowerCase() !== 'away') continue;

    const paths = [pathEntry('away', rules)];
    let object = null;
    let i = verbIdx + 2;
    if (tokens[i]?.toLowerCase() === 'from') {
      paths.push(pathEntry('from', rules));
      const landmark = extractLandmarkNp(tokens, i + 1);
      if (landmark) object = { english: landmark.english, role: 'object' };
    }

    const subjectParts = subjectPartsBeforeVerb(tokens, verbIdx, rules);
    if (subjectParts === null) continue;

    return {
      subject: subjectParts.length
        ? { english: subjectParts.join(' '), role: 'subject' }
        : null,
      event: { english: verb, role: 'event' },
      path: paths,
      object,
      tense: inferMotionTense(tokens, verb, rules),
    };
  }
  return null;
}

/**
 * SUBJECT* + locomotion verb + object NP + spatial prep + landmark.
 * e.g. followed the animal into the forest.
 */
export function matchMotionTransitiveDestination(tokens, rules) {
  if (!tokens?.length || tokens.length < 4) return null;
  const preps = spatialPrepKeys(rules);

  for (let verbIdx = 0; verbIdx < tokens.length; verbIdx += 1) {
    const verb = tokens[verbIdx];
    if (!isLocomotionVerb(verb, rules)) continue;

    const objectLandmark = extractLandmarkNp(tokens, verbIdx + 1, { stopPreps: preps });
    if (!objectLandmark) continue;

    const prep = tokens[objectLandmark.end]?.toLowerCase();
    if (!prep || !preps.has(prep) || prep === 'away' || prep === 'from') continue;

    const pathLandmark = extractLandmarkNp(tokens, objectLandmark.end + 1);
    if (!pathLandmark) continue;

    const subjectParts = subjectPartsBeforeVerb(tokens, verbIdx, rules);
    if (subjectParts === null) continue;

    return {
      subject: subjectParts.length
        ? { english: subjectParts.join(' '), role: 'subject' }
        : null,
      event: { english: verb, role: 'event' },
      object: { english: objectLandmark.english, role: 'object' },
      path: pathEntry(prep, rules),
      modifiers: [{ english: pathLandmark.english, role: 'modifier' }],
      tense: inferMotionTense(tokens, verb, rules),
    };
  }
  return null;
}

/** Motion phrase: toward+from, away, origin, destination, or transitive+path — first match wins. */
export function matchMotionPhrase(tokens, rules) {
  return matchMotionAway(tokens, rules)
    ?? matchMotionTowardFrom(tokens, rules)
    ?? matchMotionTransitiveDestination(tokens, rules)
    ?? matchMotionFrom(tokens, rules)
    ?? matchMotionDestination(tokens, rules);
}

/**
 * Motion slot pass-through (destination frames set path explicitly).
 */
export function normalizeMotionSlots(slots, rules) {
  return slots;
}

/**
 * SUBJECT* + linking verb + ADJ/PREDICATE → subject + event + modifier.
 * Handles "the air feels cool", "the city seems quiet".
 */
export function matchSubjectLinkingPredicate(content, rules) {
  if (!content?.length || content.length < 3) return null;

  for (let i = 1; i < content.length; i += 1) {
    const verb = content[i]?.toLowerCase();
    if (!LINKING_VERBS.has(verb) && !BE_FORMS.has(verb)) continue;

    const subjectParts = content.slice(0, i).filter(w => !ARTICLES.has(w.toLowerCase()));
    const predParts = content.slice(i + 1).filter(w => !ARTICLES.has(w.toLowerCase()));
    if (!subjectParts.length || !predParts.length) continue;
    if (peelFutureIntent(predParts, rules)) continue;

    const conceptId = LINKING_CONCEPT[verb] ?? null;
    return {
      subject: subjectParts.join(' '),
      event: {
        english: verb,
        role: 'event',
        ...(conceptId ? { concept_hint: conceptId, interpret_reason: 'linking verb' } : {}),
      },
      modifier: { english: predParts.join(' '), role: 'modifier' },
      be: BE_FORMS.has(verb) ? verb : null,
    };
  }
  return null;
}

/** Verbs that begin a new coordinated clause after and. */
const COORD_CLAUSE_VERBS = new Set([
  ...LINKING_VERBS,
  'drink', 'drinks', 'drank', 'drinking',
  'eat', 'eats', 'ate', 'eating',
  'walk', 'walks', 'walked', 'walking',
  'take', 'takes', 'took', 'taking',
  'make', 'makes', 'made', 'making',
  'give', 'gives', 'gave', 'giving',
  'get', 'gets', 'got', 'getting',
  'see', 'sees', 'saw', 'seeing',
  'hear', 'hears', 'heard', 'hearing',
  'know', 'knows', 'knew', 'knowing',
  'think', 'thinks', 'thought', 'thinking',
  'want', 'wants', 'wanted', 'wanting',
  'love', 'loves', 'loved', 'loving',
  'sing', 'sings', 'sang', 'singing',
  'wake', 'wakes', 'woke', 'waking',
  'act', 'acts', 'acted', 'acting',
  'go', 'goes', 'went', 'going', 'leave', 'left', 'leaves', 'leaving',
  'run', 'runs', 'ran', 'running', 'bark', 'barks', 'barked', 'barking',
]);

/**
 * Additional verbs recognized when checking whether a word group IS a clause
 * (looksLikeClause). Kept separate from COORD_CLAUSE_VERBS because many double
 * as nouns (rest, work, help…) and must never act as clause-STARTERS after a
 * conjunction ("I want food and rest" is noun coordination, one clause).
 */
const CLAUSE_BODY_VERBS = new Set([
  'hurt', 'hurts', 'hurting',
  'stand', 'stands', 'stood', 'standing',
  'stay', 'stays', 'stayed', 'staying',
  'stop', 'stops', 'stopped', 'stopping',
  'try', 'tries', 'tried', 'trying',
  'help', 'helps', 'helped', 'helping',
  'live', 'lives', 'lived', 'living',
  'sleep', 'sleeps', 'slept', 'sleeping',
  'come', 'comes', 'came', 'coming',
  'wait', 'waits', 'waited', 'waiting',
  'rest', 'rests', 'rested', 'resting',
  'speak', 'speaks', 'spoke', 'speaking',
  'work', 'works', 'worked', 'working',
  'keep', 'keeps', 'kept', 'keeping',
  'understand', 'understands', 'understood', 'understanding',
  'survive', 'survives', 'survived', 'surviving',
  'finish', 'finishes', 'finished', 'finishing',
  // Common transitive verbs whose irregular past forms are frequent clause markers.
  'buy', 'buys', 'bought', 'buying',
  'like', 'likes', 'liked', 'liking',
  'hate', 'hates', 'hated', 'hating',
  'hold', 'holds', 'held', 'holding',
  'find', 'finds', 'found', 'finding',
  'lose', 'loses', 'lost', 'losing',
  'send', 'sends', 'sent', 'sending',
  'tell', 'tells', 'told', 'telling',
  'sell', 'sells', 'sold', 'selling',
  'feel', 'feels', 'felt', 'feeling',
  'build', 'builds', 'built', 'building',
  'show', 'shows', 'showed', 'shown', 'showing',
  'bring', 'brings', 'brought', 'bringing',
  'catch', 'catches', 'caught', 'catching',
  'meet', 'meets', 'met', 'meeting',
  'read', 'reads', 'reading',
  'write', 'writes', 'wrote', 'written', 'writing',
  'kill', 'kills', 'killed', 'killing',
  'open', 'opens', 'opened', 'opening',
  'close', 'closes', 'closed', 'closing',
  'use', 'uses', 'used', 'using',
  'own', 'owns', 'owned', 'owning',
]);

/** Modals — start a new coordinated clause when followed by a main verb. */
export const MODALS = new Set(['should', 'must', 'may', 'might', 'can', 'could', 'would', 'shall']);

/** Copula/auxiliaries in yes/no questions that precede a pronoun subject. */
const YES_NO_BE_AUX = new Set(['are', 'am', 'is', 'was', 'were']);

/**
 * English dummy "there" in existential frames (Are there… / There are…) — not deictic place.
 * Deictic "there" (= tak) only when pointing at a location, not as a pure existence stub.
 */
export function isExistentialDummyThereEnglish(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\?+$/, '');
  return /^(are|is|was|were|am)\s+there\b/.test(t)
    || /^there\s+(are|is|was|were|am)\b/.test(t);
}

/** Strip leading "Are there" / "There are" dummy scaffolding from token stream. */
export function peelExistentialDummyThere(tokens) {
  if (!tokens?.length || tokens.length < 2) return { tokens, peeled: false };
  const t0 = tokens[0]?.toLowerCase();
  const t1 = tokens[1]?.toLowerCase();
  if (YES_NO_BE_AUX.has(t0) && t1 === 'there') {
    return { tokens: tokens.slice(2), peeled: true };
  }
  if (t0 === 'there' && YES_NO_BE_AUX.has(t1)) {
    return { tokens: tokens.slice(2), peeled: true };
  }
  return { tokens, peeled: false };
}

/**
 * Peel question auxiliary before pronoun: "Are you going" → subject you + [going, …].
 * Does not peel do/did (those carry tense / interrogative) or it/there subjects.
 */
export function peelQuestionAuxiliary(tokens, { pronounWords = null } = {}) {
  const pronouns = pronounWords ?? new Set(['i', 'me', 'you', 'we', 'they', 'he', 'she', 'it']);
  if (tokens.length < 2) return { tokens, peeled: false };
  const aux = tokens[0]?.toLowerCase();
  const subj = tokens[1]?.toLowerCase();
  if (YES_NO_BE_AUX.has(aux) && pronouns.has(subj) && subj !== 'it' && subj !== 'there') {
    return { tokens: tokens.slice(2), peeled: true, subjectWord: tokens[1] };
  }
  return { tokens, peeled: false };
}

/** Auxiliaries/tense carriers that mark a word group as a full clause. */
const CLAUSE_VERB_MARKERS = new Set([
  ...BE_FORMS,
  ...MODALS,
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'cannot',
  'need', 'needs', 'needed', 'needing',
]);

const CLAUSE_SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it']);

/** WH words open a coordinated content-question clause ("…and where is the food?"). */
const CLAUSE_WH_STARTERS = new Set(['who', 'whom', 'what', 'where', 'when']);

/** Connectives that join full clauses; handled structurally (docs/fonoran-grammar.md Rule 3). */
const CLAUSE_CONNECTIVES = new Set(['and', 'but', 'so', 'because']);

const normalizeWord = w => String(w ?? '').toLowerCase().replace(/[^a-z']/g, '');

function looksLikeClause(words) {
  return words.some((w) => {
    const n = normalizeWord(w);
    return CLAUSE_VERB_MARKERS.has(n) || COORD_CLAUSE_VERBS.has(n)
      || CLAUSE_BODY_VERBS.has(n) || n.endsWith("n't");
  });
}

/**
 * Split ONE sentence string on coordinated-clause connectives (and/but/so/because)
 * so each clause compiles as its own frame instead of a run-on
 * ("I am thirsty and I want to drink water" → 2 clauses).
 *
 * Deliberately conservative: splits only when BOTH sides look like full clauses
 * (each contains a verb marker) and the connective is followed by a subject
 * pronoun or a clause-starting verb — so noun coordination ("the water and the
 * food", "you and I are friends") is never torn apart. The connective itself is
 * dropped: conjunctions are structural in Fonoran, never surface particles.
 * @param {string} sentence
 * @returns {string[]}
 */
export function splitCoordinatedClauses(sentence) {
  const text = String(sentence ?? '').trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  if (words.length < 5) return [text];

  // Preserve a trailing terminator so per-clause question detection still works.
  const terminator = /[?!]$/.test(text) ? text.slice(-1) : '';

  const clauses = [];
  let cur = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = normalizeWord(words[i]);
    const next = normalizeWord(words[i + 1]);
    const afterNext = normalizeWord(words[i + 2]);

    const startsClause = CLAUSE_SUBJECT_PRONOUNS.has(next)
      || next === 'the'
      || COORD_CLAUSE_VERBS.has(next)
      || CLAUSE_WH_STARTERS.has(next)
      || (MODALS.has(next) && COORD_CLAUSE_VERBS.has(afterNext));

    if (
      CLAUSE_CONNECTIVES.has(w)
      && i + 1 < words.length
      && startsClause
      && looksLikeClause(cur)
      && looksLikeClause(words.slice(i + 1))
    ) {
      clauses.push(cur);
      cur = [];
      continue;
    }

    cur.push(words[i]);
  }
  if (cur.length) clauses.push(cur);
  if (clauses.length <= 1) return [text];

  return clauses.map((clause, idx) => {
    let out = clause.join(' ').replace(/[,;]\s*$/, '').trim();
    if (terminator && !/[?!.]$/.test(out) && idx < clauses.length - 1) {
      out = `${out}${terminator}`;
    }
    return out;
  }).filter(Boolean);
}

/**
 * Split token list on coordinated clause boundaries: and/but + (the|pronoun|verb).
 */
export function splitIntoClauses(tokens, { pronounWords = null } = {}) {
  const pronouns = pronounWords ?? new Set(['i', 'me', 'you', 'we', 'they', 'he', 'she', 'it']);
  const out = [];
  let cur = [];

  const startsNewClause = (next, afterNext) => {
    if (next === 'the' || pronouns.has(next)) return true;
    if (COORD_CLAUSE_VERBS.has(next)) return true;
    if (MODALS.has(next) && afterNext && COORD_CLAUSE_VERBS.has(afterNext)) return true;
    return false;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]?.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();
    const afterNext = tokens[i + 2]?.toLowerCase();

    if ((t === 'and' || t === 'but') && i + 1 < tokens.length && startsNewClause(next, afterNext)) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }

    cur.push(tokens[i]);
  }
  if (cur.length) out.push(cur);
  return out.length ? out : [tokens];
}

/**
 * SUBJECT* + be + ADJ → subject + modifier (copula + adjective).
 */
export function matchSubjectBeAdj(content, rules) {
  const beHit = matchBeConstruction(content, rules);
  if (!beHit || beHit.event) return null;
  return {
    subject: { english: beHit.subject, role: 'subject' },
    modifier: { english: beHit.modifiers[0]?.english ?? '', role: 'modifier' },
  };
}

/**
 * SUBJECT* + be + (past participle | adjective) (+ trailing modifiers).
 * Scans for any be-form so multi-word subjects and auxiliaries are handled.
 */
/** Passive participle head → nearest event concept. */
const PARTICIPLE_CONCEPT = {
  born: 'birth',
  borne: 'birth',
  endowed: 'give',
};

function beConstructionFromParts(subject, be, afterBe, rules) {
  if (!subject || !afterBe.length) return null;

  const head = afterBe[0];
  const trailing = afterBe.slice(1);

  if (peelFutureIntent(afterBe, rules)) return null;

  const headLower = head.toLowerCase();
  if (PREP_OBJECT.has(headLower) || rules?.spatial_path?.[headLower]) return null;

  // Locative predicate led by a concept-less spatial relation ("is behind the
  // tree", "is between the trees"): route the whole predicate through trailing
  // parsing so the relation lands in the Place slot (an honest gap) instead of
  // being swallowed as a modifier or misread as a participle/verb.
  if (LOCATIVE_GAP_PREPS.has(headLower)) {
    return {
      subject,
      be,
      event: null,
      modifiers: [],
      trailingTokens: afterBe,
    };
  }

  if (looksLikeParticiple(head, rules)) {
    let modifiers = [];
    let prepTrail = [];
    if (trailing.length && PREP_OBJECT.has(trailing[0]?.toLowerCase())) {
      prepTrail = trailing;
    } else if (trailing.length) {
      modifiers = splitPredicateModifiers(trailing.join(' '));
    }
    return {
      subject,
      be,
      event: {
        english: head,
        role: 'event',
        ...(PARTICIPLE_CONCEPT[headLower]
          ? { concept_hint: PARTICIPLE_CONCEPT[headLower], interpret_reason: 'passive participle' }
          : {}),
      },
      modifiers,
      trailingTokens: prepTrail,
    };
  }

  if (afterBe.length >= 1 && !looksLikeParticiple(head, rules)) {
    return {
      subject,
      be,
      event: null,
      modifiers: splitPredicateModifiers(afterBe.join(' ')),
      trailingTokens: [],
    };
  }

  return null;
}

export function matchBeConstruction(content, rules, { priorSubject = null } = {}) {
  if (!content?.length) return null;

  if (priorSubject && BE_FORMS.has(content[0]?.toLowerCase())) {
    const afterBe = content.slice(1).filter(w => !ARTICLES.has(w.toLowerCase()));
    if (afterBe.length) {
      return beConstructionFromParts(priorSubject, content[0].toLowerCase(), afterBe, rules);
    }
  }

  if (content.length < 3) return null;

  for (let i = 1; i < content.length; i += 1) {
    const be = content[i]?.toLowerCase();
    if (!BE_FORMS.has(be)) continue;

    const subjectParts = content.slice(0, i).filter(w => !ARTICLES.has(w.toLowerCase()));
    const afterBe = content.slice(i + 1).filter(w => !ARTICLES.has(w.toLowerCase()));
    if (!subjectParts.length || !afterBe.length) continue;

    const hit = beConstructionFromParts(subjectParts.join(' '), be, afterBe, rules);
    if (hit) return hit;
  }

  return null;
}

/**
 * SUBJECT + VERB + to + (article) + NP → subject + event + object.
 */
export function matchSubjectVerbToNp(content, rules) {
  if (!content?.length || content.length < 4) return null;
  const [subject, verb, to, ...rest] = content;
  if (to?.toLowerCase() !== 'to') return null;
  let i = 0;
  while (i < rest.length && ARTICLES.has(rest[i])) i += 1;
  const objectParts = rest.slice(i);
  if (!objectParts.length) return null;
  return {
    subject: { english: subject, role: 'subject' },
    event: { english: verb, role: 'event' },
    object: { english: objectParts.join(' '), role: 'object' },
  };
}

/**
 * Split a spatial landmark NP: peel leading idioms, then modifier tail.
 */
export function splitLandmarkPhrase(phrase, rules, { skip = null } = {}) {
  const words = String(phrase ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { object: [], modifiers: [] };

  const idiom = matchIdiomPhrase(words, rules);
  if (idiom) {
    const afterWords = idiom.after.filter(w => {
      const x = w.toLowerCase();
      return !ARTICLES.has(x) && !skip?.has(x);
    });
    const spec = idiom.spec;
    const slotKey = spec.slot ?? 'object';
    const entry = {
      english: idiom.phrase,
      role: slotKey,
      concept_hint: spec.concept_id,
      interpret_reason: spec.reason ?? `idiom: ${idiom.phrase}`,
    };
    const tailMods = afterWords.length > 1
      ? afterWords.map(w => ({ english: w, role: 'modifier' }))
      : (afterWords.length
        ? splitPredicateModifiers(afterWords.join(' '))
        : []);
    if (slotKey === 'object') {
      return { object: [entry], modifiers: tailMods };
    }
    return { object: [], modifiers: [entry, ...tailMods] };
  }

  return {
    object: [{ english: words.join(' '), role: 'object' }],
    modifiers: [],
  };
}

/**
 * Match curated multi-word idioms from rules.idioms.
 */
export function matchIdiomPhrase(content, rules) {
  const idioms = rules?.idioms ?? {};
  const keys = Object.keys(idioms).sort((a, b) => b.length - a.length);
  for (const phrase of keys) {
    const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    for (let i = 0; i <= content.length - parts.length; i += 1) {
      const slice = content.slice(i, i + parts.length).map(w => w.toLowerCase());
      if (slice.join(' ') !== phrase) continue;
      const spec = idioms[phrase];
      const before = content.slice(0, i);
      const after = content.slice(i + parts.length);
      return { phrase, spec, before, after };
    }
  }
  return null;
}

/**
 * Detect VERB + spatial prep + (article) + landmark from content words.
 * @param {string[]} content — tokens after articles/aux skipped
 * @param {object} rules
 */
export function matchVerbSpatialLandmark(content, rules) {
  if (!content?.length || content.length < 3) return null;

  const spatialPreps = new Set(
    (rules.phrase_patterns ?? [])
      .flatMap(p => p.spatial_preps ?? [])
      .map(p => p.toLowerCase()),
  );
  for (const key of Object.keys(rules.spatial_path ?? {})) spatialPreps.add(key);

  const verb = content[0];
  const prep = content[1]?.toLowerCase();
  if (!spatialPreps.has(prep)) return null;

  let i = 2;
  while (i < content.length && ARTICLES.has(content[i])) i += 1;
  const landmarkParts = content.slice(i);
  if (!landmarkParts.length) return null;

  const pathSpec = rules.spatial_path?.[prep];
  return {
    event: { english: verb, role: 'event' },
    path: {
      english: prep,
      role: 'path',
      concept_hint: pathSpec?.concept_id ?? null,
      interpret_reason: pathSpec?.reason ?? 'spatial path',
    },
    object: { english: landmarkParts.join(' '), role: 'object' },
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

/**
 * Peel future markers from raw tokens (before SKIP), returning shortened tokens.
 * @param {string[]} tokens
 * @param {object} rules
 */
export function peelFutureFromTokens(tokens, rules) {
  const lower = tokens.map(t => String(t ?? '').toLowerCase());
  for (let i = 0; i < tokens.length; i += 1) {
    if (lower[i] === 'will' || lower[i] === 'shall') {
      return {
        tense: 'future',
        tokens: [...tokens.slice(0, i), ...tokens.slice(i + 1)],
      };
    }
    if (lower[i] === 'going') {
      let j = i + 1;
      if (lower[j] === 'to') j += 1;
      if (j < tokens.length && isLikelyInfinitiveVerb(tokens[j], rules)) {
        return {
          tense: 'future',
          tokens: [...tokens.slice(0, i), ...tokens.slice(j)],
        };
      }
    }
  }
  return { tense: null, tokens };
}

/**
 * Peel “going to jump”, “will jump” → future intent + main verb phrase.
 * Does not peel bare go/goes or going-to-place (motion toward a landmark).
 * @param {string[]} content
 * @param {object} [rules]
 * @returns {{ before: string[], after: string[] } | null}
 */
export function peelFutureIntent(content, rules = null) {
  if (!content?.length) return null;
  for (let i = 0; i < content.length; i += 1) {
    const w = content[i]?.toLowerCase();
    if (FUTURE_INTENT_MARKERS.has(w) && i + 1 < content.length) {
      return {
        before: content.slice(0, i),
        after: content.slice(i + 1),
      };
    }
    if (w === 'going' && rules) {
      let j = i + 1;
      if (content[j]?.toLowerCase() === 'to') j += 1;
      if (j < content.length && isLikelyInfinitiveVerb(content[j], rules)) {
        return {
          before: content.slice(0, i),
          after: content.slice(j),
        };
      }
    }
  }
  return null;
}
