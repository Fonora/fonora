/**
 * Interpretive layer: map English surface forms to nearest Fonoran concept ids.
 * See docs/fonoran-interpretive-translator.md
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** English futurate markers before an infinitive (to is stripped earlier as a particle). */
const FUTURE_INTENT_MARKERS = new Set(['will', 'going', 'go', 'goes', 'shall']);

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

export function looksLikeParticiple(word, rules) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return false;
  if (irregularPastLemma(w, rules)) return true;
  if (w.endsWith('ed') || w.endsWith('en')) return true;
  return false;
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
  const words = tokens.filter(w => {
    const x = w.toLowerCase();
    return !BE_FORMS.has(x) && !ARTICLES.has(x) && !skip?.has(x);
  });
  if (!words.length) return { object: [], modifiers: [] };

  if (PREP_OBJECT.has(words[0]?.toLowerCase())) {
    const np = stripLeadingFunctionWords(words.slice(1), { skip });
    if (np.length) {
      return {
        object: [{ english: np.join(' '), role: 'object' }],
        modifiers: [],
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

/** Leading time phrase: every morning, each day. */
export function matchLeadingTimeAdverbial(tokens) {
  if (tokens.length < 2) return null;
  if (!TIME_DETERMINERS.has(tokens[0]?.toLowerCase())) return null;
  if (!TIME_NOUNS.has(tokens[1]?.toLowerCase())) return null;
  return {
    english: `${tokens[0]} ${tokens[1]}`.toLowerCase(),
    consumed: 2,
  };
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
    if (peelFutureIntent(predParts)) continue;

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
]);

/**
 * Split token list on clause boundaries: and + (the|pronoun|verb).
 */
export function splitIntoClauses(tokens, { pronounWords = null } = {}) {
  const pronouns = pronounWords ?? new Set(['i', 'me', 'you', 'we', 'they', 'he', 'she', 'it']);
  const out = [];
  let cur = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]?.toLowerCase();
    if (t === 'and' && i + 1 < tokens.length) {
      const next = tokens[i + 1]?.toLowerCase();
      if (next === 'the' || pronouns.has(next) || COORD_CLAUSE_VERBS.has(next)) {
        if (cur.length) out.push(cur);
        cur = [];
        continue;
      }
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
export function matchBeConstruction(content, rules) {
  if (!content?.length || content.length < 3) return null;

  for (let i = 1; i < content.length; i += 1) {
    const be = content[i]?.toLowerCase();
    if (!BE_FORMS.has(be)) continue;

    const subjectParts = content.slice(0, i).filter(w => !ARTICLES.has(w.toLowerCase()));
    const afterBe = content.slice(i + 1).filter(w => !ARTICLES.has(w.toLowerCase()));
    if (!subjectParts.length || !afterBe.length) continue;

    const subject = subjectParts.join(' ');
    const head = afterBe[0];
    const trailing = afterBe.slice(1);

    if (peelFutureIntent(afterBe)) continue;

    const headLower = head.toLowerCase();
    if (PREP_OBJECT.has(headLower) || rules?.spatial_path?.[headLower]) continue;

    if (looksLikeParticiple(head, rules)) {
      return {
        subject,
        be,
        event: { english: head, role: 'event' },
        modifiers: trailing.length
          ? [{ english: trailing.join(' '), role: 'modifier' }]
          : [],
      };
    }

    if (afterBe.length >= 1 && !looksLikeParticiple(head, rules)) {
      return {
        subject,
        be,
        event: null,
        modifiers: [{ english: afterBe.join(' '), role: 'modifier' }],
      };
    }
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
 * Peel “going to jump”, “will jump”, “goes to jump” → future intent + main verb phrase.
 * @param {string[]} content
 * @returns {{ before: string[], after: string[] } | null}
 */
export function peelFutureIntent(content) {
  if (!content?.length) return null;
  for (let i = 0; i < content.length; i += 1) {
    if (FUTURE_INTENT_MARKERS.has(content[i]) && i + 1 < content.length) {
      return {
        before: content.slice(0, i),
        after: content.slice(i + 1),
      };
    }
  }
  return null;
}
