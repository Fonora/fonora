/**
 * Word banks: many English words to one Fonoran concept.
 *
 * A Fonoran word names an idea, not an English headword. The lexicon did not reflect that:
 * 439 of 589 concepts had no English word attached beyond their own id, so the language read
 * as a one-to-one cipher for a small slice of English, and any input word outside that slice
 * was a gap. Meanwhile the same idea got two Fonoran words because English happens to have
 * two, which is why `all`, `collective` and `whole` all claim "all" and "whole" between them.
 *
 * WordNet is already a dependency and ships offline, so the mapping can be derived rather
 * than authored. The catch is that a lookup returns every sense of a word, and taking them
 * all is worse than taking none: `bone` comes back with ivory, pearl and off-white (the
 * colour sense), `air` with tune (the melody sense), `big` with boastful. So the sense has to
 * be chosen, and it is chosen deterministically by scoring each candidate sense against the
 * description the seeds already hold for that concept. `back` is described as "behind; the
 * back side; rear", which selects the spatial sense over the vertebral one on overlap alone.
 *
 * Nothing here invents Fonoran vocabulary. It only attaches English words to concepts that
 * already exist, and it refuses to attach a word that another concept already claims, since
 * an English word owned by two concepts is precisely what stops a translator being
 * deterministic.
 */
import { createRequire } from 'node:module';
import { tokens, sameIdea } from './fonoran-compound-semantics.js';

const require = createRequire(import.meta.url);

/** @type {any} */
let wordposInstance = null;

function wordpos() {
  if (!wordposInstance) {
    const WordPOS = require('wordpos');
    wordposInstance = new WordPOS();
  }
  return wordposInstance;
}

/**
 * WordNet marks adjective senses by appending "(a)" or "(p)" to a lemma. Those are notation,
 * not words anyone types.
 *
 * @param {string} lemma
 */
function cleanLemma(lemma) {
  return String(lemma ?? '')
    .toLowerCase()
    .replace(/\([a-z]+\)$/, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Which parts of speech a concept's domain can take, so a substance is not defined by the
 * verb that acts on it. Without this, `water` (domain element) resolved to "irrigate" and
 * `air` to "aerate", because WordNet's frequency order puts those senses first and the seed
 * description is too short to outvote them. The domain is already on every primitive.
 */
const DOMAIN_POS = {
  being: ['n'],
  body: ['n'],
  element: ['n'],
  ontology: ['n'],
  social: ['n'],
  relationships: ['n'],
  communication: ['n', 'v'],
  cognition: ['n', 'v'],
  abstract: ['n'],
  emotion: ['n', 'a', 's'],
  action: ['v'],
  process: ['v', 'n'],
  quality: ['a', 's'],
  evaluation: ['a', 's'],
  quantity: ['a', 's', 'n'],
  space: ['n', 'r', 'a', 's'],
  time: ['n', 'r', 'a', 's'],
};

/**
 * @param {string | null | undefined} domain
 * @returns {string[] | null} allowed POS tags, or null to allow any
 */
export function posForDomain(domain) {
  if (!domain) return null;
  return DOMAIN_POS[String(domain).toLowerCase()] ?? null;
}

/**
 * Compounds carry no domain field, only a gloss, and without a part of speech they hit the
 * same trap the primitives did. The glosses turn out to be written to a consistent shape:
 * 169 of 454 open with an article and 64 with "to", which states the part of speech plainly
 * enough to use. Read it rather than guessing from the composition, whose head is not marked.
 *
 * @param {string} gloss
 * @returns {string[] | null}
 */
export function posForGloss(gloss) {
  const first = String(gloss ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (['a', 'an', 'the', 'one'].includes(first)) return ['n'];
  if (first === 'to') return ['v'];
  // A gerund opening ("moving toward a lower place", "feeling empty inside") reads as either
  // the act or the state, so allow both rather than forcing a choice the gloss does not make.
  if (/(ing)$/.test(first)) return ['v', 'n', 'a', 's'];
  if (['at', 'in', 'on', 'near', 'behind'].includes(first)) return ['r', 'n'];
  return null;
}

/**
 * How well does a WordNet sense match what the seeds say this concept means?
 *
 * Overlap on content words, counted once per distinct match so a definition that repeats a
 * word does not outscore a definition that covers more of the description.
 *
 * @param {{ def: string, synonyms: string[] }} sense
 * @param {string[]} descriptionTokens
 * @returns {number}
 */
function senseScore(sense, descriptionTokens) {
  const senseTokens = new Set([
    ...tokens(sense.def ?? ''),
    ...(sense.synonyms ?? []).flatMap(s => tokens(cleanLemma(s))),
  ]);
  let hits = 0;
  for (const want of new Set(descriptionTokens)) {
    for (const have of senseTokens) {
      if (sameIdea(want, have)) {
        hits += 1;
        break;
      }
    }
  }
  return descriptionTokens.length ? hits / new Set(descriptionTokens).size : 0;
}

/**
 * Choose the WordNet sense that matches a concept's own description.
 *
 * @param {string} surface the English word for the concept
 * @param {string} description what the seeds say the concept means
 * @param {{ minScore?: number }} [opts]
 */
export async function selectSense(surface, description, opts = {}) {
  const minScore = opts.minScore ?? 0.15;
  const all = await wordpos().lookup(surface).catch(() => []);
  if (!all.length) return { sense: null, score: 0, reason: 'no WordNet sense', senses: 0 };

  const allowed = opts.pos ?? null;
  const senses = allowed?.length ? all.filter(s => allowed.includes(s.pos)) : all;
  if (!senses.length) {
    return {
      sense: null,
      score: 0,
      reason: `no ${allowed.join('/')} sense among ${all.length} found`,
      senses: all.length,
    };
  }

  const descriptionTokens = tokens(description);
  if (!descriptionTokens.length) {
    // With nothing to match against, WordNet's own frequency order is the only signal, and
    // taking it silently is how "off-white" would end up meaning bone. Say so instead.
    return { sense: null, score: 0, reason: 'concept has no description to match against', senses: senses.length };
  }

  const ranked = senses
    .map(s => ({ sense: s, score: senseScore(s, descriptionTokens) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < minScore) {
    return {
      sense: null,
      score: best?.score ?? 0,
      reason: `no sense matches the description (best ${((best?.score ?? 0) * 100).toFixed(0)}%)`,
      senses: senses.length,
    };
  }
  // Ties are common, because a short description like "a bone" matches every anatomical
  // sense equally. Refusing them threw away four proposals in five. WordNet orders senses by
  // frequency of use, so the first of the tied senses is the ordinary reading rather than a
  // guess, and it stays deterministic because that order is fixed in the database. Flagged so
  // a reviewer can see which banks leaned on the ordering rather than on the description.
  const topScore = best.score;
  const tied = ranked.filter(r => r.score === topScore);
  const chosen = tied.length > 1
    ? tied.reduce((first, r) => (senses.indexOf(r.sense) < senses.indexOf(first.sense) ? r : first))
    : best;
  return {
    sense: chosen.sense,
    score: chosen.score,
    reason: null,
    senses: senses.length,
    tie_broken: tied.length > 1,
    tied_senses: tied.length,
  };
}

/**
 * Propose a word bank for one concept.
 *
 * @param {{ id: string, surface?: string, description: string }} concept
 * @param {Map<string, string>} claimedBy English word -> the concept that already owns it
 * @param {{ minScore?: number }} [opts]
 */
export async function proposeWordBank(concept, claimedBy, opts = {}) {
  const id = String(concept.id);
  const surface = String(concept.surface ?? id).replace(/_/g, ' ');
  const chosen = await selectSense(surface, concept.description ?? '', {
    ...opts,
    pos: opts.pos ?? posForDomain(concept.domain),
  });
  if (!chosen.sense) {
    return {
      concept: id,
      surface,
      accepted: [],
      conflicts: [],
      skipped: chosen.reason,
      score: chosen.score,
      senses_considered: chosen.senses,
    };
  }

  const accepted = [];
  const conflicts = [];
  for (const lemma of chosen.sense.synonyms ?? []) {
    const word = cleanLemma(lemma);
    if (!word || word === surface.toLowerCase()) continue;
    const owner = claimedBy.get(word);
    if (owner && owner !== id) {
      // Two concepts wanting one English word is a ruling for a human: either the concepts
      // are the same idea and should merge, or the word belongs to one of them.
      conflicts.push({ word, claimed_by: owner });
      continue;
    }
    accepted.push(word);
  }
  return {
    concept: id,
    surface,
    definition: chosen.sense.def ?? '',
    score: chosen.score,
    senses_considered: chosen.senses,
    tie_broken: chosen.tie_broken ?? false,
    accepted,
    conflicts,
    skipped: null,
  };
}

/**
 * @param {Array<{ id: string, surface?: string, description: string }>} concepts
 * @param {Map<string, string>} claimedBy
 * @param {{ minScore?: number }} [opts]
 */
export async function proposeAllWordBanks(concepts, claimedBy, opts = {}) {
  const out = [];
  for (const concept of concepts) {
    out.push(await proposeWordBank(concept, claimedBy, opts));
  }
  return out;
}
