/**
 * OFFLINE curation assistant built on WordNet (wordpos). This is NOT part of the
 * runtime translate path — the translator is concept-first and never guesses. It
 * proposes alias/concept candidates for a HUMAN to approve into
 * localizations/en.json (see the gap report and concept editor).
 *
 * Word-sense disambiguation:
 *   - Synsets are filtered by the part of speech matching the slot role (e.g. a
 *     preposition like "behind" in a path role yields no verb/noun sense worth
 *     bridging → honest gap, never a stray noun sense like "buttocks" → can).
 *   - Candidates are ranked by WordNet sense order (most frequent sense first).
 *
 *   Layer 1 — Synonym expansion: co-synonyms from POS-matched synsets, tried
 *             against the alias index by the caller.
 *   Layer 2 — Hypernym bridge: walk the is-a chain one level up and map through
 *             a curated table (geological_formation → earth, body_of_water →
 *             water, …) for the long tail of concrete nouns.
 *
 * Results are cached in data/fonoran-semantic-cache.json (keyed by word + POS)
 * so repeated lookups are instant and deterministic.
 */

import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dir, '../data/fonoran-semantic-cache.json');

// ─── Hypernym bridge ────────────────────────────────────────────────────────
// Maps WordNet synset words (nouns/verbs from the is-a chain) to one or more
// Fonoran concept IDs ranked from most-to-least specific.  Keep this table
// small; new entries only for whole semantic domains that are missing.
const HYPERNYM_BRIDGE = new Map([
  // Terrain / geography
  ['natural_elevation', ['earth', 'big', 'up']],
  ['elevation',         ['earth', 'up']],
  ['geological_formation', ['earth']],
  ['landform',          ['earth']],
  ['geographical_area', ['place']],
  ['region',            ['place']],
  ['location',          ['place']],

  // Water bodies
  ['body_of_water',     ['water', 'place']],
  ['waterway',          ['water', 'path']],
  ['stream',            ['water', 'move']],

  // Weather / atmosphere
  ['atmospheric_phenomenon', ['air', 'flow']],
  ['weather',           ['air']],
  ['storm',             ['air', 'flow']],
  ['storminess',        ['air', 'bad']],

  // Living things
  ['person',            ['person']],
  ['individual',        ['person']],
  ['human',             ['person']],
  ['animal',            ['live', 'move']],
  ['organism',          ['live']],
  ['living_thing',      ['live']],
  ['plant',             ['live', 'grow']],
  ['flora',             ['live', 'grow']],

  // Communication / narration
  ['speaker',           ['speak', 'person']],
  ['talker',            ['speak', 'person']],
  ['utterer',           ['speak', 'person']],
  ['narrator',          ['speak', 'person']],
  ['storyteller',       ['speak', 'person']],

  // Social roles / workers (generic fallback → person)
  ['official',          ['person']],
  ['functionary',       ['person']],
  ['worker',            ['person']],
  ['employee',          ['person']],
  ['professional',      ['person']],
  ['expert',            ['know', 'person']],

  // Actions / events
  ['motion',            ['move']],
  ['movement',          ['move']],
  ['travel',            ['move', 'far']],
  ['act',               ['do']],
  ['action',            ['do']],
  ['activity',          ['do']],
  ['event',             ['happen']],

  // Communication
  ['communication',     ['speak', 'language']],
  ['language',          ['language', 'speak']],

  // Mental / cognitive
  ['cognition',         ['think']],
  ['thought',           ['think']],
  ['knowledge',         ['know']],
  ['reason',            ['think']],
  ['feeling',           ['feel']],
  ['emotion',           ['feel']],

  // Artifacts / tools
  ['artifact',          ['make', 'thing']],
  ['tool',              ['use']],
  ['container',         ['hold']],
  ['food',              ['food', 'eat']],
  ['shelter',           ['protect', 'place']],
  ['dwelling',          ['place', 'protect']],

  // Substance / matter
  ['substance',         ['thing']],
  ['matter',            ['thing']],
  ['natural_object',    ['thing']],
  ['object',            ['thing']],
]);

// ─── wordpos setup (CJS module, loaded lazily) ───────────────────────────────
let _wp = null;
function getWp() {
  if (_wp) return _wp;
  try {
    const require = createRequire(import.meta.url);
    const WordPOS = require('wordpos');
    _wp = new WordPOS({ profile: false });
    return _wp;
  } catch {
    return null;
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────
let _cache = null;
let _dirty = false;

async function loadCache() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(await readFile(CACHE_PATH, 'utf8')); }
  catch { _cache = {}; }
  return _cache;
}

async function flushCache() {
  if (!_dirty || !_cache) return;
  await writeFile(CACHE_PATH, JSON.stringify(_cache, null, 2));
  _dirty = false;
}

function norm(w) { return String(w).toLowerCase().replace(/_/g, ' ').trim(); }

/**
 * Slot role → WordNet parts of speech for word-sense disambiguation. A word is
 * only expanded through the senses that match its grammatical role, so a
 * preposition in a path role (behind, front) yields nothing to bridge and stays
 * an honest gap instead of collapsing to an unrelated noun sense.
 */
export const ROLE_POS = {
  event: ['v'],
  verb: ['v'],
  subject: ['n'],
  object: ['n'],
  path: ['n'],
  time: ['n'],
  modifier: ['a', 's', 'v'],
  concept: ['n', 'v', 'a', 's'],
};

/** Role-aware disambiguation when both food and eat are bridge targets. */
export function pickHypernymConcept(concepts, role) {
  if (!concepts?.length) return null;
  if (concepts.includes('food') && concepts.includes('eat')) {
    const nounRoles = new Set(['object', 'modifier', 'concept', 'path', 'subject']);
    return nounRoles.has(role) ? 'food' : 'eat';
  }
  return concepts[0];
}

// ─── Core lookup (offline curation assistant) ────────────────────────────────

/** Which WordNet POS buckets a role admits (defaults to all). */
function posForRole(role) {
  return new Set(ROLE_POS[role] ?? ['n', 'v', 'a', 's']);
}

/**
 * Propose ranked candidate English terms + bridged concept ids for `word`,
 * disambiguated by the slot `role`. Intended for OFFLINE curation only.
 *
 * Returns: { pos, synonyms: string[], hypernym_concepts: string[] }
 *   synonyms          — co-synonyms from POS-matched synsets (sense-ranked)
 *   hypernym_concepts — Fonoran concept IDs from the hypernym bridge
 */
export async function expandWord(word, { role = null } = {}) {
  const posSet = role ? posForRole(role) : new Set(['n', 'v', 'a', 's']);
  const posKey = [...posSet].sort().join('');
  const key = `${norm(word).replace(/\s+/g, '_')}::${posKey}`;
  const cache = await loadCache();
  if (cache[key]) return cache[key];

  const wp = getWp();
  if (!wp) return { pos: [...posSet], synonyms: [], hypernym_concepts: [] };

  try {
    // Look up only the parts of speech admitted by the role. WordNet returns
    // synsets ordered by sense frequency, so earlier entries rank higher.
    const buckets = [];
    if (posSet.has('n')) buckets.push(...await wp.lookupNoun(norm(word)).catch(() => []));
    if (posSet.has('v')) buckets.push(...await wp.lookupVerb(norm(word)).catch(() => []));
    if (posSet.has('a') || posSet.has('s')) buckets.push(...await wp.lookupAdjective(norm(word)).catch(() => []));
    const all = buckets;

    // Layer 1: co-synonyms in shared synsets (sense-ranked, dedup preserves order).
    const synonyms = [...new Set(
      all.flatMap(s => s.synonyms ?? [])
        .map(norm)
        .filter(s => s !== norm(word) && !/\d/.test(s)),
    )];

    // Layer 2: hypernym bridge — walk '@' (hypernym) ptrs one level up.
    const hypernym_concepts = [];
    const seenConcepts = new Set();
    for (const synset of all) {
      const hyperPtrs = (synset.ptrs ?? []).filter(p => p.pointerSymbol === '@');
      for (const ptr of hyperPtrs) {
        const parent = await wp.seek(ptr.synsetOffset, ptr.pos).catch(() => null);
        if (!parent) continue;
        for (const pSyn of parent.synonyms ?? []) {
          const bridge = HYPERNYM_BRIDGE.get(norm(pSyn));
          if (bridge) {
            for (const cid of bridge) {
              if (!seenConcepts.has(cid)) {
                seenConcepts.add(cid);
                hypernym_concepts.push(cid);
              }
            }
          }
        }
      }
    }

    const result = { pos: [...posSet], synonyms, hypernym_concepts };
    cache[key] = result;
    _dirty = true;
    await flushCache();
    return result;
  } catch {
    return { pos: [...posSet], synonyms: [], hypernym_concepts: [] };
  }
}

/**
 * Rough POS hint for frame-parser slot disambiguation (noun vs verb).
 * @returns {Promise<'noun'|'verb'|'adj'|null>}
 */
export async function getPosHint(word) {
  const wp = getWp();
  if (!wp) return null;
  const key = norm(word).replace(/\s+/g, '_');
  try {
    const [nouns, verbs, adjs] = await Promise.all([
      wp.lookupNoun(key).catch(() => []),
      wp.lookupVerb(key).catch(() => []),
      wp.lookupAdjective(key).catch(() => []),
    ]);
    if (verbs.length && nouns.length === 0) return 'verb';
    if (nouns.length && verbs.length === 0) return 'noun';
    if (adjs.length && nouns.length === 0 && verbs.length === 0) return 'adj';
    if (verbs.length > nouns.length) return 'verb';
    if (nouns.length > verbs.length) return 'noun';
    return null;
  } catch {
    return null;
  }
}

/**
 * Quick CLI test: node tools/fonoran-semantic-lookup.js mountain travel healer
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const words = process.argv.slice(2).length ? process.argv.slice(2) : ['mountain', 'travel', 'healer', 'large'];
  for (const w of words) {
    const r = await expandWord(w);
    console.log(`${w}:`);
    console.log(`  synonyms:  ${r.synonyms.slice(0, 10).join(', ') || '(none)'}`);
    console.log(`  → concept: ${r.hypernym_concepts.join(', ') || '(none)'}`);
  }
}
