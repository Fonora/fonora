#!/usr/bin/env node
/**
 * Expression candidate generator.
 *
 * The OLD model was: English concept → one deterministic decomposition → one canonical
 * compound. The NEW model (docs/fonoran-constitution.md) is:
 *
 *   communicative intent → several simple root-expression candidates
 *     → understandability ranking → preferred + alternate understandable forms
 *
 * For a target concept this produces *several* plausible root combinations (communicative
 * strategies), not one "correct" answer, and ranks them by the advisory understandability
 * score. Humans then playtest to choose the preferred form.
 */

import { readDoc } from './fonoran-store.js';
import { scoreUnderstandability, metaLookupFromRecords } from './fonoran-understandability.js';
import { experienceMetaFor } from './fonoran-experience-tiers.js';

/**
 * Hand-seeded communicative strategies: intuitive ways a stranger might try to express a
 * concept from roots. These are *attempts*, deliberately overlapping and non-canonical —
 * exactly the variety the experiment is about. Each entry is a list of compositions.
 */
export const ASSOCIATION_SEEDS = {
  river: [['water', 'path'], ['flow', 'water'], ['water', 'move'], ['water', 'far']],
  rain: [['water', 'down'], ['sky', 'water'], ['water', 'fall']],
  lake: [['water', 'still'], ['water', 'place'], ['water', 'hold']],
  sea: [['water', 'all'], ['water', 'big'], ['water', 'far']],
  cloud: [['sky', 'water'], ['air', 'water'], ['water', 'up']],
  mountain: [['earth', 'up'], ['stone', 'up'], ['earth', 'big']],
  island: [['earth', 'water'], ['earth', 'inside', 'water']],
  forest: [['many', 'tree'], ['many', 'plant'], ['tree', 'place']],
  food: [['eat', 'thing'], ['eat', 'plant'], ['good', 'eat']],
  home: [['inside', 'place'], ['sleep', 'place'], ['self', 'place'], ['love', 'place']],
  friend: [['bond', 'near'], ['help', 'person'], ['good', 'person'], ['love', 'person']],
  family: [['bond', 'person'], ['love', 'person'], ['parent', 'collective']],
  enemy: [['conflict', 'person'], ['bad', 'person'], ['fear', 'person']],
  leader: [['head', 'person'], ['strong', 'person'], ['speak', 'person']],
  doctor: [['heal', 'person'], ['good', 'body', 'person'], ['help', 'body', 'person']],
  teacher: [['teach', 'person'], ['give', 'know', 'person']],
  child: [['small', 'person'], ['new', 'person']],
  fish: [['water', 'animal'], ['water', 'move', 'animal']],
  bird: [['sky', 'animal'], ['air', 'animal']],
  sun: [['light', 'source'], ['sky', 'fire'], ['light', 'big']],
  moon: [['light', 'cold'], ['sky', 'light', 'night']],
  star: [['light', 'far'], ['sky', 'light', 'small']],
  fever: [['hot', 'body'], ['bad', 'hot', 'body']],
  wound: [['pain', 'body'], ['bad', 'skin']],
  heal: [['make', 'good'], ['good', 'body'], ['help', 'body']],
  tool: [['thing', 'use'], ['hand', 'thing']],
  gift: [['give', 'thing'], ['good', 'give']],
  journey: [['move', 'path'], ['far', 'move'], ['walk', 'far']],
  danger: [['fear', 'place'], ['bad', 'near'], ['near', 'pain']],
  death: [['bound', 'life'], ['no', 'life'], ['end', 'life']],
  birth: [['source', 'life'], ['new', 'life'], ['life', 'before']],
  joy: [['good', 'feel'], ['happy', 'strong']],
  sad: [['bad', 'feel'], ['no', 'happy']],
  remember: [['know', 'before'], ['hold', 'know']],
  question: [['want', 'know'], ['speak', 'want', 'know']],
  answer: [['give', 'know'], ['speak', 'know']],
};

function compositionKey(comp) {
  return comp.join('+');
}

/**
 * Score and rank a set of candidate compositions for a concept.
 * @param {string} conceptId
 * @param {string[][]} compositions
 * @param {object} ctx { metaFor, collisionCounts: Map<string,number> }
 */
export function rankCandidates(conceptId, compositions, ctx = {}) {
  const metaFor = ctx.metaFor ?? (id => experienceMetaFor(id));
  const collisionCounts = ctx.collisionCounts ?? new Map();
  const seen = new Set();
  const ranked = [];

  for (const comp of compositions) {
    if (!Array.isArray(comp) || comp.length < 1) continue;
    const key = compositionKey(comp);
    if (seen.has(key)) continue;
    seen.add(key);
    const collisionCount = collisionCounts.get(key) ?? 1;
    const scored = scoreUnderstandability(comp, { metaFor, collisionCount });
    ranked.push({
      composition: comp,
      readable: comp.join(' + '),
      understandability: scored.score,
      label: scored.label,
      breakdown: scored.breakdown,
    });
  }

  ranked.sort((a, b) => b.understandability - a.understandability);
  return ranked;
}

/**
 * Generate ranked candidate expressions for a concept by merging:
 *   - any known preferred/existing composition,
 *   - hand-seeded communicative strategies,
 *   - caller-supplied extra attempts.
 */
export function generateCandidates(conceptId, ctx = {}) {
  const pool = [];
  if (ctx.knownComposition?.length) pool.push(ctx.knownComposition);
  for (const seed of ASSOCIATION_SEEDS[conceptId] ?? []) pool.push(seed);
  for (const extra of ctx.extraCompositions ?? []) pool.push(extra);
  return rankCandidates(conceptId, pool, ctx);
}

/** Node-only: build ranking context (meta lookup + collision counts) from the data files. */
export async function loadCandidateContext() {
  const [inventory, approved, compoundsDoc] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
    readDoc('compounds'),
  ]);
  const records = [...(inventory?.primitives ?? []), ...(approved?.roots ?? [])];
  const fromRecords = metaLookupFromRecords(records);
  const metaFor = id => fromRecords(id) ?? experienceMetaFor(id);

  // Count how often each exact composition is claimed across the dictionary.
  const collisionCounts = new Map();
  const knownByConcept = new Map();
  for (const c of compoundsDoc?.compounds ?? []) {
    const preferred = c.preferred?.composition ?? c.composition;
    if (!preferred) continue;
    knownByConcept.set(c.concept, preferred);
    const all = [preferred, ...(c.alternates ?? []).map(a => a.composition)];
    for (const comp of all) {
      if (!comp) continue;
      const key = comp.join('+');
      collisionCounts.set(key, (collisionCounts.get(key) ?? 0) + 1);
    }
  }
  return { metaFor, collisionCounts, knownByConcept };
}

async function main() {
  const conceptId = process.argv[2];
  if (!conceptId) {
    console.error('Usage: node tools/fonoran-expression-candidates.js <concept-id>');
    process.exit(1);
  }
  const ctx = await loadCandidateContext();
  const ranked = generateCandidates(conceptId, {
    metaFor: ctx.metaFor,
    collisionCounts: ctx.collisionCounts,
    knownComposition: ctx.knownByConcept.get(conceptId),
  });
  if (!ranked.length) {
    console.log(`No candidate strategies seeded for "${conceptId}". Add some to ASSOCIATION_SEEDS.`);
    return;
  }
  console.log(`Candidate expressions for "${conceptId}" (ranked by understandability):\n`);
  for (const r of ranked) {
    console.log(`  ${String(r.understandability).padEnd(5)} ${r.readable.padEnd(28)} ${r.label}`);
  }
  console.log('\nThe score only ranks. A human guess-the-meaning playtest decides the preferred form.');
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
