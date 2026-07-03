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
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import { proposeLlmCandidates } from './fonoran-llm-candidates.js';

/**
 * Hand-seeded communicative strategies: intuitive ways a stranger might try to express a
 * concept from roots. These are *attempts*, deliberately overlapping and non-canonical —
 * exactly the variety the experiment is about. Each entry is a list of compositions.
 */
export const ASSOCIATION_SEEDS = {
  // --- semantic foundation / demo trees ---
  community: [['collective', 'person'], ['many', 'person'], ['bond', 'collective']],
  family: [['person', 'bond'], ['love', 'person'], ['bond', 'near'], ['parent', 'collective']],
  exchange: [['give', 'take'], ['take', 'give'], ['person', 'give', 'take']],
  knowledge: [['know', 'hold'], ['know', 'thing'], ['hold', 'know']],
  memory: [['know', 'hold', 'inside'], ['remember', 'thing'], ['know', 'before', 'inside']],
  remember: [['know', 'before'], ['hold', 'know'], ['know', 'past']],
  forget: [['know', 'empty'], ['no', 'know'], ['empty', 'know']],
  identity: [['self', 'memory'], ['self', 'know'], ['person', 'self', 'memory']],
  name: [['mark', 'self'], ['self', 'mark'], ['speak', 'self']],
  useful: [['good', 'use'], ['thing', 'use'], ['good', 'thing']],
  run: [['move', 'fast'], ['fast', 'move'], ['person', 'move', 'fast']],
  swim: [['move', 'water'], ['water', 'move'], ['person', 'water', 'move']],
  fly: [['move', 'air'], ['air', 'move'], ['sky', 'move']],
  river: [['water', 'flow', 'path'], ['water', 'path'], ['flow', 'water'], ['water', 'move']],
  wind: [['air', 'move'], ['move', 'air'], ['sky', 'move']],
  home: [['place', 'bond'], ['inside', 'place'], ['sleep', 'place'], ['love', 'place']],
  friend: [['person', 'bond', 'good'], ['bond', 'near'], ['help', 'person'], ['good', 'person']],
  enemy: [['person', 'conflict'], ['conflict', 'person'], ['bad', 'person'], ['fear', 'person']],
  road: [['path', 'move'], ['move', 'path'], ['path', 'place']],
  vehicle: [['move', 'thing'], ['thing', 'move'], ['path', 'thing']],
  meal: [['food', 'thing'], ['eat', 'thing'], ['food', 'eat']],
  lamp: [['light', 'thing'], ['thing', 'light'], ['fire', 'thing']],
  tool: [['thing', 'hand', 'useful'], ['thing', 'use'], ['hand', 'thing'], ['useful', 'thing']],
  voice: [['speak', 'breath'], ['breath', 'speak'], ['person', 'speak']],
  thought: [['think', 'inside'], ['inside', 'think'], ['mind', 'inside']],
  hope: [['good', 'want'], ['want', 'good'], ['future', 'good']],
  shared_meaning: [['collective', 'know', 'same'], ['same', 'know', 'collective'], ['speak', 'same']],
  tribe: [['community', 'identity'], ['collective', 'person', 'identity'], ['community', 'bond']],
  war: [['tribe', 'conflict'], ['conflict', 'tribe'], ['collective', 'conflict', 'person']],
  village: [['place', 'community'], ['community', 'place'], ['many', 'person', 'place']],
  language: [['speak', 'shared_meaning'], ['speak', 'collective', 'know'], ['collective', 'speak']],
  money: [['exchange', 'equal', 'thing'], ['give', 'take', 'equal'], ['thing', 'exchange']],
  teacher: [['person', 'knowledge', 'give'], ['teach', 'person'], ['give', 'know', 'person']],
  book: [['thing', 'know', 'hold'], ['mark', 'thing', 'know'], ['speak', 'knowledge']],
  document: [['mark', 'thing', 'know'], ['thing', 'mark'], ['know', 'thing', 'mark']],
  music: [['speak', 'pulse', 'joy'], ['joy', 'speak'], ['pulse', 'good']],
  government: [['community', 'hold', 'strong'], ['collective', 'hold', 'strong'], ['community', 'strong']],
  law: [['bond', 'collective', 'still'], ['collective', 'still'], ['bond', 'hold']],
  religion: [['collective', 'bond', 'source'], ['bond', 'source'], ['collective', 'source']],
  trade: [['exchange', 'person'], ['person', 'exchange'], ['give', 'take', 'person']],
  work: [['person', 'do', 'will'], ['do', 'person'], ['person', 'make']],
  weapon: [['tool', 'conflict'], ['thing', 'conflict'], ['conflict', 'thing']],
  ocean: [['water', 'place', 'many'], ['water', 'big'], ['water', 'all']],
  world: [['earth', 'all'], ['place', 'all', 'life'], ['earth', 'life'], ['whole', 'place', 'earth', 'life']],
  peace: [['collective', 'conflict', 'empty'], ['no', 'conflict'], ['collective', 'good']],
  nation: [['tribe', 'bound', 'place'], ['collective', 'place'], ['tribe', 'place']],
  grow: [['life', 'change', 'more'], ['life', 'more'], ['change', 'life']],

  // --- live-only / extended vocabulary ---
  death: [['bound', 'life'], ['no', 'life'], ['end', 'life']],
  birth: [['source', 'life'], ['new', 'life'], ['life', 'before']],
  breath: [['air', 'flow'], ['flow', 'air'], ['air', 'inside']],
  joy: [['good', 'feel'], ['happy', 'strong'], ['feel', 'good']],
  sad: [['bad', 'feel'], ['no', 'happy'], ['feel', 'bad']],
  teach: [['make', 'know'], ['give', 'know'], ['person', 'know', 'give']],
  learn: [['take', 'know'], ['know', 'take'], ['person', 'take', 'know']],
  signal: [['give', 'mark'], ['mark', 'give'], ['speak', 'mark']],
  seed: [['source', 'plant'], ['plant', 'source'], ['small', 'plant']],
  cycle: [['pulse', 'time'], ['time', 'pulse'], ['change', 'time']],
  void: [['empty', 'all'], ['no', 'thing'], ['empty', 'place']],
  agent: [['do', 'person'], ['person', 'do'], ['make', 'person']],
  container: [['hold', 'thing'], ['thing', 'hold'], ['inside', 'thing']],
  whole: [['all', 'thing'], ['all', 'part'], ['part', 'all']],
  people: [['many', 'person'], ['collective', 'person'], ['person', 'many']],
  leader: [['head', 'person'], ['strong', 'person'], ['speak', 'person']],
  helper: [['help', 'person'], ['person', 'help'], ['good', 'person', 'help']],
  student: [['learn', 'person'], ['person', 'learn'], ['take', 'know', 'person']],
  giant: [['big', 'body'], ['big', 'person'], ['body', 'big']],
  mind: [['think', 'center'], ['think', 'inside'], ['inside', 'think']],
  wisdom: [['know', 'strong'], ['strong', 'know'], ['know', 'much']],
  meaning: [['signal', 'know'], ['know', 'signal'], ['shared_meaning']],
  word: [['mark', 'speak'], ['speak', 'mark'], ['thing', 'speak']],
  lake: [['water', 'still'], ['water', 'place'], ['water', 'hold']],
  sea: [['water', 'whole'], ['water', 'all'], ['water', 'big']],
  rain: [['water', 'down'], ['sky', 'water'], ['water', 'fall']],
  cloud: [['sky', 'water'], ['air', 'water'], ['water', 'up']],
  island: [['earth', 'water'], ['earth', 'inside', 'water'], ['place', 'water']],
  forest: [['many', 'plant', 'place'], ['many', 'tree'], ['tree', 'place']],
  mountain: [['earth', 'up', 'still'], ['earth', 'up'], ['stone', 'up']],
  sun: [['source', 'light', 'hot'], ['light', 'source'], ['sky', 'fire']],
  star: [['light', 'far'], ['sky', 'light', 'small'], ['light', 'small']],
  moon: [['light', 'cold'], ['sky', 'light', 'night'], ['cold', 'light']],
  day: [['before', 'light'], ['sun', 'time'], ['light', 'before']],
  night: [['dark', 'time'], ['time', 'dark'], ['no', 'light', 'time']],
  fever: [['hot', 'body'], ['bad', 'hot', 'body'], ['hot', 'sick']],
  wound: [['pain', 'body'], ['bad', 'skin'], ['bad', 'body']],
  heal: [['make', 'good'], ['good', 'body'], ['help', 'body']],
  journey: [['move', 'path'], ['far', 'move'], ['walk', 'far']],
  city: [['many', 'place'], ['place', 'many'], ['community', 'place']],
  birthplace: [['birth', 'place'], ['place', 'birth'], ['source', 'place']],
  open: [['make', 'path'], ['no', 'bound'], ['path', 'no', 'bound']],
  sunrise: [['sun', 'up'], ['light', 'up'], ['sun', 'before']],
  sunset: [['sun', 'down'], ['light', 'down'], ['sun', 'after']],
  moonlight: [['moon', 'light'], ['light', 'moon'], ['night', 'light']],
  morning: [['sun', 'before'], ['light', 'after'], ['before', 'light']],
  winter: [['cold', 'time'], ['time', 'cold'], ['cold', 'after']],
  bridge: [['path', 'water'], ['water', 'path'], ['place', 'water', 'path']],
  beautiful: [['good', 'see'], ['see', 'good'], ['good', 'body']],
  almost: [['near', 'far'], ['near', 'all'], ['no', 'all']],
  door: [['path', 'bound'], ['bound', 'path'], ['place', 'bound']],
  campfire: [['fire', 'place'], ['fire', 'near'], ['fire', 'person', 'place']],
  fish: [['water', 'animal'], ['water', 'move', 'animal'], ['animal', 'water']],
  bird: [['sky', 'animal'], ['air', 'animal'], ['animal', 'fly']],
  blacksmith: [['metal', 'make', 'person'], ['metal', 'person'], ['make', 'metal']],
  grandparent: [['before', 'parent'], ['parent', 'before'], ['old', 'parent']],
  doctor: [['heal', 'person'], ['good', 'body', 'person'], ['help', 'body', 'person']],
  hunter: [['take', 'animal', 'person'], ['animal', 'take'], ['person', 'take', 'animal']],
  farmer: [['make', 'plant', 'person'], ['plant', 'person'], ['grow', 'plant', 'person']],
  fisherman: [['fish', 'person'], ['person', 'fish'], ['water', 'animal', 'person']],
  knife: [['metal', 'bound'], ['tool', 'bound'], ['metal', 'thing']],
  red: [['fire', 'see'], ['see', 'fire'], ['hot', 'see']],
  gift: [['give', 'thing', 'good'], ['give', 'thing'], ['good', 'give']],
  danger: [['fear', 'place'], ['bad', 'near'], ['near', 'pain']],
  question: [['speak', 'know', 'empty'], ['want', 'know'], ['speak', 'want', 'know']],
  answer: [['speak', 'knowledge'], ['give', 'know'], ['speak', 'know']],

  // --- retired-to-compound roots (vocabulary remediation): formerly primitive roots,
  // now expressed compositionally so the ~50 core can carry the practical load ---
  pulse: [['heart', 'move'], ['body', 'move'], ['move', 'move']],
  wave: [['water', 'move'], ['move', 'water'], ['water', 'up', 'down']],
  flow: [['water', 'path'], ['water', 'move'], ['water', 'move', 'path']],
  source: [['before', 'place'], ['place', 'before'], ['before', 'water']],
  substance: [['thing', 'body'], ['thing', 'inside'], ['body', 'thing']],
  form: [['thing', 'outside'], ['outside', 'thing'], ['see', 'thing']],
  will: [['want', 'before'], ['want', 'strong'], ['self', 'want']],
  cause: [['before', 'make'], ['make', 'before'], ['thing', 'make']],
  equal: [['same', 'more'], ['same', 'same'], ['same', 'thing']],
  mark: [['name', 'thing'], ['thing', 'name'], ['see', 'name']],
  reach: [['hand', 'far'], ['far', 'hand'], ['hand', 'move', 'far']],
  strong: [['body', 'good'], ['good', 'body'], ['body', 'more']],
  part: [['thing', 'inside'], ['inside', 'thing'], ['thing', 'small']],
  change: [['before', 'same'], ['no', 'same'], ['thing', 'before', 'same']],

  // --- new gap compounds surfaced by the beginner-conversation simulation ---
  come: [['move', 'here'], ['here', 'move'], ['move', 'near']],
  later: [['after', 'now'], ['now', 'after'], ['after', 'time']],
  own: [['self', 'take'], ['self', 'thing'], ['take', 'self']],
  safe: [['trust', 'good'], ['good', 'no', 'fear'], ['no', 'fear']],
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
  const flatCountFor = ctx.flatCountFor ?? (() => null);
  const seen = new Set();
  const ranked = [];

  for (const comp of compositions) {
    if (!Array.isArray(comp) || comp.length < 1) continue;
    const key = compositionKey(comp);
    if (seen.has(key)) continue;
    seen.add(key);
    const collisionCount = collisionCounts.get(key) ?? 1;
    const flatCount = flatCountFor(comp);
    const scored = scoreUnderstandability(comp, { metaFor, collisionCount, flatCount });
    ranked.push({
      composition: comp,
      readable: comp.join(' + '),
      understandability: scored.score,
      label: scored.label,
      breakdown: scored.breakdown,
      flat_count: flatCount,
    });
  }

  ranked.sort((a, b) => {
    const scoreDiff = b.understandability - a.understandability;
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    const flatA = a.flat_count ?? 99;
    const flatB = b.flat_count ?? 99;
    return flatA - flatB;
  });
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

  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const resolver = buildCompositionResolver(primitiveIds, compoundsDoc?.compounds ?? []);
  const flatCountFor = comp => resolver.flatCount(comp);

  return {
    metaFor,
    collisionCounts,
    knownByConcept,
    flatCountFor,
    compoundsDoc,
    primitiveIds,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const useLlm = args.includes('--llm');
  const conceptId = args.find(a => !a.startsWith('--'));
  if (!conceptId) {
    console.error('Usage: node tools/fonoran-expression-candidates.js <concept-id> [--llm]');
    process.exit(1);
  }
  const ctx = await loadCandidateContext();
  let extraCompositions = [];
  if (useLlm) {
    const compound = ctx.compoundsDoc?.compounds?.find(c => c.concept === conceptId);
    const gloss = compound?.preferred?.gloss ?? compound?.gloss ?? conceptId;
    extraCompositions = await proposeLlmCandidates(conceptId, {
      gloss,
      primitiveIds: ctx.primitiveIds,
      compoundDefs: ctx.compoundsDoc?.compounds ?? [],
      maxFlattened: 4,
    });
    if (extraCompositions.length) {
      console.log(`LLM proposed ${extraCompositions.length} candidate(s).\n`);
    }
  }
  const ranked = generateCandidates(conceptId, {
    metaFor: ctx.metaFor,
    collisionCounts: ctx.collisionCounts,
    knownComposition: ctx.knownByConcept.get(conceptId),
    flatCountFor: ctx.flatCountFor,
    extraCompositions,
  });
  if (!ranked.length) {
    console.log(`No candidate strategies seeded for "${conceptId}". Add some to ASSOCIATION_SEEDS.`);
    return;
  }
  console.log(`Candidate expressions for "${conceptId}" (ranked by understandability):\n`);
  for (const r of ranked) {
    const flat = r.flat_count != null ? `${r.flat_count} roots` : '? roots';
    console.log(`  ${String(r.understandability).padEnd(5)} ${r.readable.padEnd(28)} ${flat.padEnd(8)} ${r.label}`);
  }
  console.log('\nThe score only ranks. A human guess-the-meaning playtest decides the preferred form.');
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
