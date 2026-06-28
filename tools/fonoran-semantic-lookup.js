/**
 * Deterministic semantic lookup via WordNet (wordpos).
 *
 * Two-layer expansion for English words that don't match the alias index:
 *
 *   Layer 1 — Synonym expansion
 *     WordNet synsets give co-synonyms: "large" → "big", "travel" → "move".
 *     These are tried directly against the Fonoran alias index.
 *
 *   Layer 2 — Hypernym bridge
 *     Walk the is-a chain one level up. Unknown nouns (mountain, river, storm)
 *     are mapped through a curated table: geological_formation → earth,
 *     body_of_water → water, etc. Covers the long tail of concrete nouns with
 *     no direct synonym in the inventory.
 *
 * Results are cached in data/fonoran-semantic-cache.json so repeated lookups
 * are instant and the system stays deterministic (same word → same candidates
 * forever once written to cache).
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
  ['feeling',           ['feel']],
  ['emotion',           ['feel']],

  // Artifacts / tools
  ['artifact',          ['make', 'thing']],
  ['tool',              ['use']],
  ['container',         ['hold']],
  ['food',              ['eat']],
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

// ─── Core lookup ─────────────────────────────────────────────────────────────

/**
 * Return ranked candidate English terms for `word` via WordNet, suitable for
 * trying against the Fonoran alias index.
 *
 * Returns: { synonyms: string[], hypernym_concepts: string[] }
 *   synonyms         — co-synonyms from the same synsets (try against alias index)
 *   hypernym_concepts — Fonoran concept IDs inferred from the hypernym bridge
 *                       (use directly if synonym pass still fails)
 */
export async function expandWord(word) {
  const key = norm(word).replace(/\s+/g, '_');
  const cache = await loadCache();
  if (cache[key]) return cache[key];

  const wp = getWp();
  if (!wp) return { synonyms: [], hypernym_concepts: [] };

  try {
    // Look up across all relevant parts of speech.
    const [nouns, verbs, adjs] = await Promise.all([
      wp.lookupNoun(key).catch(() => []),
      wp.lookupVerb(key).catch(() => []),
      wp.lookupAdjective(key).catch(() => []),
    ]);
    const all = [...nouns, ...verbs, ...adjs];

    // Layer 1: co-synonyms in shared synsets.
    const synonyms = [...new Set(
      all.flatMap(s => s.synonyms ?? [])
        .map(norm)
        .filter(s => s !== key && s !== word && !/\d/.test(s)),
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
          const pNorm = norm(pSyn);
          const bridge = HYPERNYM_BRIDGE.get(pNorm);
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

    const result = { synonyms, hypernym_concepts };
    cache[key] = result;
    _dirty = true;
    await flushCache();
    return result;
  } catch {
    return { synonyms: [], hypernym_concepts: [] };
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
