/**
 * Unified Fonoran concept inventory from root candidates.
 * Concepts (not English words) are the semantic authority across UI and translator.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { romanToIpa } from './fonoran-pronunciation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES_PATH = join(ROOT, 'data/fonoran-root-candidates.json');
const APPROVED_PATH = join(ROOT, 'data/fonoran-approved-roots.json');
const SEMANTIC_PATH = join(ROOT, 'data/fonoran-concept-inventory.json');

const STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are', 'be', 'with',
  'any', 'all', 'one', 'not', 'that', 'this', 'from', 'into', 'by', 'as', 'it', 'its',
]);

/** Default English word bank before a concept is saved from the editor. */
export function extraAliasesForId(id) {
  return [...(EXTRA_ALIASES[id] ?? [])];
}

/** Common English aliases → concept id (fuzzy translator + matcher labels). */
const EXTRA_ALIASES = {
  person: ['human', 'someone', 'somebody', 'people', 'man', 'woman', 'men', 'women'],
  self: ['me', 'myself', 'mine', 'oneself'],
  collective: ['group', 'groups', 'community', 'together', 'team'],
  body: ['form', 'physique'],
  life: ['alive', 'living', 'live'],
  death: ['dead', 'die', 'dying'],
  birth: ['born', 'birth'],
  move: ['motion', 'moving', 'go', 'going', 'went', 'travel', 'traveling', 'journey'],
  give: ['gift', 'giving'],
  take: ['taking', 'receive'],
  hold: ['holding', 'keep', 'keeping'],
  use: ['using', 'employ'],
  help: ['helping', 'aid', 'assist'],
  make: ['making', 'create', 'creating'],
  do: ['doing', 'act', 'action'],
  speak: ['say', 'saying', 'said', 'talk', 'talking', 'speech', 'language', 'tell', 'telling', 'told', 'narrate', 'narrating', 'narration', 'story', 'stories', 'recount', 'recounting'],
  see: ['seeing', 'sight', 'look', 'looking'],
  hear: ['hearing', 'listen', 'listening'],
  touch: ['touching', 'feel'],
  know: ['knowing', 'knowledge'],
  think: ['thinking', 'thought'],
  want: ['wanting', 'wish', 'desire'],
  eat: ['eating', 'food'],
  sleep: ['sleeping', 'rest'],
  thing: ['object', 'entity', 'item'],
  substance: ['matter', 'stuff', 'material'],
  form: ['shape', 'appearance'],
  change: ['changing', 'transform', 'become'],
  empty: ['nothing', 'void', 'absence'],
  water: ['liquid', 'drink'],
  fire: ['flame', 'burn', 'burning'],
  earth: ['ground', 'dirt', 'soil', 'land'],
  air: ['atmosphere', 'breath', 'wind'],
  light: ['bright', 'brightness'],
  dark: ['darkness', 'dim'],
  hot: ['heat', 'warm', 'warmth'],
  cold: ['cool', 'chill'],
  stone: ['rock', 'rocks'],
  plant: ['vegetation', 'tree', 'trees', 'grass'],
  animal: ['creature', 'beast'],
  inside: ['within', 'interior', 'inner'],
  outside: ['exterior', 'outer'],
  here: ['nearby'],
  there: ['yonder'],
  near: ['close', 'nearby'],
  far: ['distant', 'away'],
  up: ['above', 'higher'],
  down: ['below', 'lower'],
  path: ['road', 'way', 'route'],
  place: ['location', 'spot', 'somewhere'],
  before: ['prior', 'earlier', 'past', 'yesterday'],
  after: ['later', 'future', 'tomorrow', 'next'],
  now: ['today', 'present'],
  time: ['while', 'duration'],
  one: ['single', 'unity'],
  many: ['multiple', 'plenty', 'several'],
  all: ['every', 'everything', 'whole'],
  some: ['few', 'part'],
  more: ['greater', 'increase'],
  less: ['fewer', 'decrease', 'smaller'],
  fast: ['quick', 'quickly', 'speed'],
  love: ['loving', 'affection', 'care'],
  fear: ['afraid', 'scared', 'dread'],
  joy: ['happy', 'happiness', 'delight', 'glad'],
  pain: ['hurt', 'hurting', 'ache', 'suffering'],
  sad: ['sorrow', 'unhappy', 'grief'],
  good: ['well', 'better', 'best'],
  bad: ['evil', 'harm', 'harmful', 'worse', 'worst'],
  true: ['truth', 'real', 'correct'],
  false: ['lie', 'wrong', 'untrue'],
  equal: ['same', 'balance', 'fair', 'fairness', 'match'],
  bond: ['connection', 'tie', 'link', 'family', 'friend', 'friendship'],
  conflict: ['fight', 'fighting', 'clash', 'enemy'],
  same: ['identical', 'alike'],
  different: ['other', 'another', 'distinct'],
  part: ['piece', 'portion', 'section'],
  whole: ['entire', 'complete', 'full'],
  mark: ['sign', 'symbol', 'write', 'writing'],
  source: ['origin', 'beginning', 'start'],
  container: ['box', 'vessel', 'hold'],
  flow: ['stream', 'river', 'flowing'],
  pulse: ['beat', 'rhythm'],
  still: ['stillness', 'stop', 'stopped'],
  will: ['intent', 'intention', 'purpose'],
  strong: ['strength', 'power', 'force', 'hard'],
  reach: ['extend', 'stretch'],
  wave: ['ripple', 'surge'],
  food: ['meal', 'eat'],
  hand: ['hands', 'grasp'],
  eye: ['eyes', 'sight'],
  skin: ['hide'],
  bone: ['bones', 'skeleton'],
};

function glossTokens(gloss) {
  return String(gloss ?? '')
    .toLowerCase()
    .replace(/[;,.]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w));
}

export function aliasesForConcept(candidate) {
  const out = new Set();
  const id = candidate.id;
  out.add(id);
  out.add(id.replace(/_/g, ' '));

  const lead = String(candidate.concept ?? candidate.gloss ?? '').split(';')[0].trim().toLowerCase();
  if (lead) out.add(lead);

  for (const w of glossTokens(candidate.concept ?? candidate.gloss)) out.add(w);

  const stored = candidate.aliases ?? candidate.stored_aliases;
  if (Array.isArray(stored) && stored.length) {
    for (const a of stored) out.add(String(a).toLowerCase());
  } else {
    for (const a of EXTRA_ALIASES[id] ?? []) out.add(a.toLowerCase());
  }

  return [...out].filter(Boolean);
}

export function conceptRecord(candidate, approvedRoot = null, primitive = null) {
  const gloss = primitive?.gloss ?? candidate.concept;
  const domain = primitive?.domain ?? candidate.domain;
  const spelling = approvedRoot?.spelling ?? candidate.spelling;
  const storedAliases = primitive?.aliases ?? null;
  return {
    id: candidate.id,
    concept: gloss,
    domain,
    spelling,
    ipa: approvedRoot?.ipa ?? candidate.ipa ?? romanToIpa(spelling),
    aliases: aliasesForConcept({ id: candidate.id, concept: gloss, aliases: storedAliases }),
    stored_aliases: storedAliases,
    status: candidate.status,
    reason: candidate.reason ?? null,
    pronunciation_ease: candidate.pronunciation_ease ?? null,
    semantic_usefulness: candidate.semantic_usefulness ?? null,
  };
}

export async function loadConceptInventory() {
  let candidatesFile;
  try {
    candidatesFile = JSON.parse(await readFile(CANDIDATES_PATH, 'utf8'));
  } catch {
    return { version: '1.0-concepts', concepts: [], concept_count: 0 };
  }

  let approved = { roots: [] };
  try {
    approved = JSON.parse(await readFile(APPROVED_PATH, 'utf8'));
  } catch {
    approved = { roots: [] };
  }

  const approvedById = Object.fromEntries((approved.roots ?? []).map(r => [r.id, r]));

  let primitiveById = {};
  try {
    const semantic = JSON.parse(await readFile(SEMANTIC_PATH, 'utf8'));
    primitiveById = Object.fromEntries((semantic.primitives ?? []).map(p => [p.id, p]));
  } catch {
    primitiveById = {};
  }

  const concepts = (candidatesFile.candidates ?? []).map(c => conceptRecord(c, approvedById[c.id], primitiveById[c.id]));

  return {
    version: '1.0-concepts',
    source: 'data/fonoran-root-candidates.json',
    generated_at: candidatesFile.generated_at,
    concept_count: concepts.length,
    concepts,
  };
}

/** Build translator lookup: alias → concept entry with fonoran spelling. */
export function buildConceptAliasIndex(concepts, lab = null) {
  const index = new Map();

  const register = (alias, entry) => {
    const key = String(alias ?? '').trim().toLowerCase();
    if (!key || index.has(key)) return;
    index.set(key, entry);
  };

  const baseFor = (c) => ({
    english: c.id,
    concept_id: c.id,
    gloss: c.concept,
    fonoran: c.spelling,
    kind: 'primitive',
    parts: [c.spelling],
    source: 'concept',
    domain: c.domain,
  });

  // Strong aliases (concept id + curated/stored synonyms) claim keys first so an
  // incidental gloss word (e.g. "time" inside before's gloss) can never shadow the
  // real concept (time).
  const strongAliases = (c) => {
    const out = [c.id, c.id.replace(/_/g, ' ')];
    const stored = c.stored_aliases;
    if (Array.isArray(stored) && stored.length) out.push(...stored.map(a => String(a).toLowerCase()));
    else out.push(...(EXTRA_ALIASES[c.id] ?? []).map(a => a.toLowerCase()));
    return out;
  };
  // Weak aliases derived from the gloss text: only fill gaps left by strong ones.
  const weakAliases = (c) => {
    const lead = String(c.concept ?? '').split(';')[0].trim().toLowerCase();
    return [lead, ...glossTokens(c.concept)];
  };

  for (const c of concepts) {
    const base = baseFor(c);
    for (const alias of strongAliases(c)) register(alias, { ...base, matched_alias: alias });
  }
  for (const c of concepts) {
    const base = baseFor(c);
    for (const alias of weakAliases(c)) register(alias, { ...base, matched_alias: alias });
  }

  for (const sound of lab?.sounds ?? []) {
    const meaning = String(sound.meaning ?? '').trim().toLowerCase();
    if (!meaning || !sound.spelling) continue;
    const hit = concepts.find(c => c.id === sound.concept_id)
      || concepts.find(c => c.concept.toLowerCase() === meaning)
      || concepts.find(c => c.id === meaning);
    register(meaning, {
      english: hit?.id ?? meaning,
      concept_id: sound.concept_id ?? hit?.id ?? null,
      gloss: sound.meaning,
      fonoran: sound.spelling,
      kind: 'primitive',
      parts: [sound.spelling],
      source: 'lab',
      state: sound.state,
    });
    if (sound.concept_id) {
      for (const alias of hit?.aliases ?? [sound.concept_id]) {
        register(alias, {
          english: sound.concept_id,
          concept_id: sound.concept_id,
          gloss: sound.meaning,
          fonoran: sound.spelling,
          kind: 'primitive',
          parts: [sound.spelling],
          source: 'lab',
          state: sound.state,
        });
      }
    }
  }

  return index;
}

export function isConceptMatchedInLab(concept, lab) {
  if (!lab?.sounds?.length) return concept.status === 'approved';
  const gloss = concept.concept?.trim().toLowerCase();
  const id = concept.id?.toLowerCase();
  return lab.sounds.some(s => {
    if (s.state === 'rejected') return false;
    if (!s.meaning?.trim()) return false;
    if (s.concept_id === concept.id) return true;
    if (s.spelling === concept.spelling) return true;
    const m = s.meaning.trim().toLowerCase();
    return m === gloss || m === id;
  }) || concept.status === 'approved';
}

export function isSpellingMatchedInLab(spelling, lab) {
  const s = lab?.sounds?.find(x => x.spelling === spelling && x.state !== 'rejected');
  return Boolean(s?.meaning?.trim());
}
