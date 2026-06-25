/**
 * Build curated English root words for the Word Matcher and lexicon.
 * Run: npm run fonoran:roots
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEXICON_PATH = join(ROOT, 'data/fonoran-english-lexicon.json');
const GEN31_PATH = join(ROOT, 'data/fonoran-gen3-1-roots.json');
const OUT_PATH = join(ROOT, 'data/fonoran-english-roots.json');

const DOMAIN_LABELS = {
  interface: 'interface',
  index: 'index',
  emanation: 'emanation',
  junction: 'junction',
  cavity: 'cavity',
  stream: 'stream',
};

/** Additional ideal root words by semantic category. */
const EXPANSION = [
  // index — agency, identity, locus
  { word: 'act', gloss: 'to do; perform', category: 'index' },
  { word: 'actor', gloss: 'one who acts', category: 'index' },
  { word: 'deed', gloss: 'an action done', category: 'index' },
  { word: 'do', gloss: 'perform; carry out', category: 'index' },
  { word: 'self', gloss: 'oneself; identity', category: 'index' },
  { word: 'locus', gloss: 'a located point', category: 'index' },
  { word: 'here', gloss: 'this place', category: 'index' },
  { word: 'there', gloss: 'that place', category: 'index' },
  { word: 'known', gloss: 'established certainty', category: 'index' },
  { word: 'unknown', gloss: 'not established', category: 'index' },
  { word: 'identity', gloss: 'sameness across time', category: 'index' },
  { word: 'will', gloss: 'intention; volition', category: 'index' },
  { word: 'choice', gloss: 'selection among options', category: 'index' },
  { word: 'cause', gloss: 'what brings about', category: 'index' },
  { word: 'effect', gloss: 'what follows from cause', category: 'index' },
  // interface — bounds, edges, surfaces
  { word: 'bound', gloss: 'limit; edge', category: 'interface' },
  { word: 'limit', gloss: 'outer bound', category: 'interface' },
  { word: 'face', gloss: 'outer surface', category: 'interface' },
  { word: 'surface', gloss: 'outer layer', category: 'interface' },
  { word: 'threshold', gloss: 'entry boundary', category: 'interface' },
  { word: 'wall', gloss: 'vertical boundary', category: 'interface' },
  { word: 'door', gloss: 'passage through boundary', category: 'interface' },
  { word: 'skin', gloss: 'outer covering', category: 'interface' },
  { word: 'shell', gloss: 'hard outer layer', category: 'interface' },
  { word: 'rim', gloss: 'outer edge ring', category: 'interface' },
  { word: 'lip', gloss: 'edge of opening', category: 'interface' },
  { word: 'mouth', gloss: 'opening; speech organ', category: 'interface' },
  { word: 'envelope', gloss: 'wrapping boundary', category: 'interface' },
  // emanation — signal, mark, emission
  { word: 'mark', gloss: 'visible sign', category: 'emanation' },
  { word: 'sign', gloss: 'indicator; symbol', category: 'emanation' },
  { word: 'signal', gloss: 'emitted indicator', category: 'emanation' },
  { word: 'word', gloss: 'spoken unit', category: 'emanation' },
  { word: 'name', gloss: 'identifier label', category: 'emanation' },
  { word: 'voice', gloss: 'produced sound', category: 'emanation' },
  { word: 'light', gloss: 'visible emission', category: 'emanation' },
  { word: 'shadow', gloss: 'absence of light', category: 'emanation' },
  { word: 'glow', gloss: 'steady light', category: 'emanation' },
  { word: 'flash', gloss: 'brief emission', category: 'emanation' },
  { word: 'echo', gloss: 'returned sound', category: 'emanation' },
  { word: 'trace', gloss: 'leftover mark', category: 'emanation' },
  // junction — bond, link, weave
  { word: 'bond', gloss: 'connection; tie', category: 'junction' },
  { word: 'link', gloss: 'joined connection', category: 'junction' },
  { word: 'tie', gloss: 'fastened bond', category: 'junction' },
  { word: 'knot', gloss: 'tied junction', category: 'junction' },
  { word: 'join', gloss: 'bring together', category: 'junction' },
  { word: 'split', gloss: 'separate apart', category: 'junction' },
  { word: 'weave', gloss: 'interlaced pattern', category: 'junction' },
  { word: 'mesh', gloss: 'interconnected net', category: 'junction' },
  { word: 'bridge', gloss: 'spanning connection', category: 'junction' },
  { word: 'path', gloss: 'route of passage', category: 'junction' },
  { word: 'road', gloss: 'travel way', category: 'junction' },
  { word: 'cross', gloss: 'intersection point', category: 'junction' },
  // cavity — container, void, hold
  { word: 'hold', gloss: 'contain within', category: 'cavity' },
  { word: 'void', gloss: 'empty interior', category: 'cavity' },
  { word: 'hollow', gloss: 'empty inside', category: 'cavity' },
  { word: 'pit', gloss: 'depressed cavity', category: 'cavity' },
  { word: 'hole', gloss: 'opening into void', category: 'cavity' },
  { word: 'cave', gloss: 'hollow in earth', category: 'cavity' },
  { word: 'room', gloss: 'enclosed space', category: 'cavity' },
  { word: 'pool', gloss: 'held liquid body', category: 'cavity' },
  { word: 'bowl', gloss: 'concave container', category: 'cavity' },
  { word: 'pocket', gloss: 'small held space', category: 'cavity' },
  { word: 'womb', gloss: 'generative cavity', category: 'cavity' },
  // stream — flow, breath, pulse
  { word: 'flow', gloss: 'continuous change', category: 'stream' },
  { word: 'stream', gloss: 'moving current', category: 'stream' },
  { word: 'river', gloss: 'large flowing water', category: 'stream' },
  { word: 'wave', gloss: 'propagating flux', category: 'stream' },
  { word: 'current', gloss: 'directed flow', category: 'stream' },
  { word: 'breath', gloss: 'living air stream', category: 'stream' },
  { word: 'wind', gloss: 'moving air', category: 'stream' },
  { word: 'pulse', gloss: 'rhythmic beat', category: 'stream' },
  { word: 'beat', gloss: 'regular rhythm', category: 'stream' },
  { word: 'drain', gloss: 'outward flow', category: 'stream' },
  { word: 'pour', gloss: 'release in stream', category: 'stream' },
  { word: 'drip', gloss: 'slow falling drops', category: 'stream' },
  // motion
  { word: 'move', gloss: 'change position', category: 'motion' },
  { word: 'go', gloss: 'travel away', category: 'motion' },
  { word: 'come', gloss: 'travel toward', category: 'motion' },
  { word: 'turn', gloss: 'change direction', category: 'motion' },
  { word: 'spin', gloss: 'rotate around axis', category: 'motion' },
  { word: 'roll', gloss: 'rotate by contact', category: 'motion' },
  { word: 'fall', gloss: 'descend by gravity', category: 'motion' },
  { word: 'rise', gloss: 'ascend upward', category: 'motion' },
  { word: 'fly', gloss: 'move through air', category: 'motion' },
  { word: 'swim', gloss: 'move through water', category: 'motion' },
  { word: 'crawl', gloss: 'move low and slow', category: 'motion' },
  { word: 'climb', gloss: 'ascend by effort', category: 'motion' },
  { word: 'reach', gloss: 'extend toward', category: 'motion' },
  { word: 'stretch', gloss: 'extend length', category: 'motion' },
  { word: 'bend', gloss: 'curve from straight', category: 'motion' },
  { word: 'shake', gloss: 'rapid oscillation', category: 'motion' },
  { word: 'throw', gloss: 'propel outward', category: 'motion' },
  { word: 'catch', gloss: 'receive in motion', category: 'motion' },
  { word: 'hit', gloss: 'strike with force', category: 'motion' },
  { word: 'push', gloss: 'apply force away', category: 'motion' },
  { word: 'pull', gloss: 'apply force toward', category: 'motion' },
  // time
  { word: 'time', gloss: 'duration and sequence', category: 'time' },
  { word: 'now', gloss: 'present moment', category: 'time' },
  { word: 'then', gloss: 'that moment', category: 'time' },
  { word: 'day', gloss: 'light cycle unit', category: 'time' },
  { word: 'night', gloss: 'dark cycle unit', category: 'time' },
  { word: 'dawn', gloss: 'day beginning', category: 'time' },
  { word: 'dusk', gloss: 'day ending', category: 'time' },
  { word: 'age', gloss: 'long span of time', category: 'time' },
  { word: 'cycle', gloss: 'returning sequence', category: 'time' },
  { word: 'begin', gloss: 'starting point', category: 'time' },
  { word: 'end', gloss: 'finishing point', category: 'time' },
  { word: 'wait', gloss: 'pause in time', category: 'time' },
  { word: 'soon', gloss: 'near in time', category: 'time' },
  { word: 'late', gloss: 'after expected time', category: 'time' },
  { word: 'early', gloss: 'before expected time', category: 'time' },
  // space
  { word: 'space', gloss: 'extent between things', category: 'space' },
  { word: 'place', gloss: 'located spot', category: 'space' },
  { word: 'near', gloss: 'close in space', category: 'space' },
  { word: 'far', gloss: 'distant in space', category: 'space' },
  { word: 'high', gloss: 'elevated position', category: 'space' },
  { word: 'low', gloss: 'depressed position', category: 'space' },
  { word: 'deep', gloss: 'far inward', category: 'space' },
  { word: 'wide', gloss: 'broad extent', category: 'space' },
  { word: 'narrow', gloss: 'tight extent', category: 'space' },
  { word: 'front', gloss: 'forward face', category: 'space' },
  { word: 'back', gloss: 'rear face', category: 'space' },
  { word: 'top', gloss: 'upper face', category: 'space' },
  { word: 'bottom', gloss: 'lower face', category: 'space' },
  { word: 'middle', gloss: 'central region', category: 'space' },
  { word: 'side', gloss: 'lateral face', category: 'space' },
  // shape
  { word: 'form', gloss: 'articulated shape', category: 'shape' },
  { word: 'shape', gloss: 'outer configuration', category: 'shape' },
  { word: 'round', gloss: 'circular form', category: 'shape' },
  { word: 'flat', gloss: 'level surface', category: 'shape' },
  { word: 'line', gloss: 'extended thin form', category: 'shape' },
  { word: 'point', gloss: 'dimensionless locus', category: 'shape' },
  { word: 'angle', gloss: 'meeting of lines', category: 'shape' },
  { word: 'curve', gloss: 'bent line', category: 'shape' },
  { word: 'loop', gloss: 'closed curve', category: 'shape' },
  { word: 'spiral', gloss: 'coiling curve', category: 'shape' },
  { word: 'block', gloss: 'solid rectangular form', category: 'shape' },
  { word: 'ring', gloss: 'circular band', category: 'shape' },
  // body
  { word: 'body', gloss: 'physical whole', category: 'body' },
  { word: 'head', gloss: 'upper body part', category: 'body' },
  { word: 'hand', gloss: 'grasping limb', category: 'body' },
  { word: 'arm', gloss: 'upper limb', category: 'body' },
  { word: 'leg', gloss: 'lower limb', category: 'body' },
  { word: 'foot', gloss: 'standing extremity', category: 'body' },
  { word: 'eye', gloss: 'seeing organ', category: 'body' },
  { word: 'ear', gloss: 'hearing organ', category: 'body' },
  { word: 'nose', gloss: 'smelling organ', category: 'body' },
  { word: 'heart', gloss: 'central organ', category: 'body' },
  { word: 'lung', gloss: 'breathing organ', category: 'body' },
  { word: 'blood', gloss: 'vital fluid', category: 'body' },
  { word: 'bone', gloss: 'rigid support', category: 'body' },
  { word: 'flesh', gloss: 'soft body tissue', category: 'body' },
  { word: 'tooth', gloss: 'biting structure', category: 'body' },
  { word: 'hair', gloss: 'threadlike growth', category: 'body' },
  // perception
  { word: 'see', gloss: 'perceive by sight', category: 'perception' },
  { word: 'hear', gloss: 'perceive by sound', category: 'perception' },
  { word: 'touch', gloss: 'perceive by contact', category: 'perception' },
  { word: 'smell', gloss: 'perceive by scent', category: 'perception' },
  { word: 'taste', gloss: 'perceive by flavor', category: 'perception' },
  { word: 'feel', gloss: 'sense inwardly', category: 'perception' },
  { word: 'dark', gloss: 'absence of light', category: 'perception' },
  { word: 'bright', gloss: 'strong light', category: 'perception' },
  { word: 'loud', gloss: 'strong sound', category: 'perception' },
  { word: 'quiet', gloss: 'weak sound', category: 'perception' },
  { word: 'warm', gloss: 'moderate heat sense', category: 'perception' },
  { word: 'cold', gloss: 'low heat sense', category: 'perception' },
  { word: 'hot', gloss: 'high heat sense', category: 'perception' },
  { word: 'pain', gloss: 'hurt sensation', category: 'perception' },
  // nature
  { word: 'fire', gloss: 'burning heat', category: 'nature' },
  { word: 'water', gloss: 'liquid substance', category: 'nature' },
  { word: 'earth', gloss: 'ground substance', category: 'nature' },
  { word: 'air', gloss: 'breathable atmosphere', category: 'nature' },
  { word: 'sky', gloss: 'overhead expanse', category: 'nature' },
  { word: 'sun', gloss: 'daylight source', category: 'nature' },
  { word: 'moon', gloss: 'night light body', category: 'nature' },
  { word: 'star', gloss: 'distant light point', category: 'nature' },
  { word: 'rain', gloss: 'falling water', category: 'nature' },
  { word: 'snow', gloss: 'frozen precipitation', category: 'nature' },
  { word: 'ice', gloss: 'frozen water', category: 'nature' },
  { word: 'storm', gloss: 'violent weather', category: 'nature' },
  { word: 'cloud', gloss: 'airborne vapor mass', category: 'nature' },
  { word: 'tree', gloss: 'woody plant', category: 'nature' },
  { word: 'leaf', gloss: 'plant flat part', category: 'nature' },
  { word: 'root', gloss: 'plant anchor', category: 'nature' },
  { word: 'seed', gloss: 'plant origin', category: 'nature' },
  { word: 'stone', gloss: 'hard mineral mass', category: 'nature' },
  { word: 'sand', gloss: 'fine grain mass', category: 'nature' },
  { word: 'mud', gloss: 'wet earth mix', category: 'nature' },
  { word: 'grass', gloss: 'ground cover plant', category: 'nature' },
  { word: 'animal', gloss: 'living moving being', category: 'nature' },
  { word: 'fish', gloss: 'water animal', category: 'nature' },
  { word: 'bird', gloss: 'flying animal', category: 'nature' },
  // society
  { word: 'group', gloss: 'collective of agents', category: 'society' },
  { word: 'kin', gloss: 'family relation', category: 'society' },
  { word: 'law', gloss: 'binding rule', category: 'society' },
  { word: 'rule', gloss: 'governing pattern', category: 'society' },
  { word: 'war', gloss: 'organized conflict', category: 'society' },
  { word: 'peace', gloss: 'absence of conflict', category: 'society' },
  { word: 'trade', gloss: 'exchange of goods', category: 'society' },
  { word: 'gift', gloss: 'given without trade', category: 'society' },
  { word: 'debt', gloss: 'owed obligation', category: 'society' },
  { word: 'trust', gloss: 'reliance on another', category: 'society' },
  { word: 'fear', gloss: 'anticipation of harm', category: 'society' },
  { word: 'hope', gloss: 'anticipation of good', category: 'society' },
  { word: 'love', gloss: 'deep bond feeling', category: 'society' },
  { word: 'hate', gloss: 'deep aversion', category: 'society' },
  { word: 'friend', gloss: 'bonded companion', category: 'society' },
  { word: 'foe', gloss: 'opposed agent', category: 'society' },
  { word: 'chief', gloss: 'leading agent', category: 'society' },
  { word: 'folk', gloss: 'a people group', category: 'society' },
  // object
  { word: 'tool', gloss: 'used implement', category: 'object' },
  { word: 'weapon', gloss: 'harm implement', category: 'object' },
  { word: 'cloth', gloss: 'woven material', category: 'object' },
  { word: 'wood', gloss: 'tree material', category: 'object' },
  { word: 'metal', gloss: 'hard refined material', category: 'object' },
  { word: 'food', gloss: 'eaten substance', category: 'object' },
  { word: 'drink', gloss: 'swallowed liquid', category: 'object' },
  { word: 'fire-pit', gloss: 'contained fire place', category: 'object' },
  { word: 'shelter', gloss: 'protective structure', category: 'object' },
  { word: 'home', gloss: 'dwelling place', category: 'object' },
  { word: 'bed', gloss: 'sleep surface', category: 'object' },
  { word: 'table', gloss: 'flat work surface', category: 'object' },
  { word: 'chair', gloss: 'seat furniture', category: 'object' },
  // origin
  { word: 'source', gloss: 'generative origin', category: 'origin' },
  { word: 'birth', gloss: 'coming into being', category: 'origin' },
  { word: 'death', gloss: 'ceasing to be', category: 'origin' },
  { word: 'grow', gloss: 'increase in size', category: 'origin' },
  { word: 'decay', gloss: 'break down over time', category: 'origin' },
  { word: 'make', gloss: 'bring into form', category: 'origin' },
  { word: 'break', gloss: 'separate into parts', category: 'origin' },
  { word: 'build', gloss: 'assemble into form', category: 'origin' },
  { word: 'destroy', gloss: 'reduce to ruin', category: 'origin' },
  { word: 'create', gloss: 'bring from nothing', category: 'origin' },
  // number
  { word: 'one', gloss: 'single unit', category: 'number' },
  { word: 'two', gloss: 'pair unit', category: 'number' },
  { word: 'three', gloss: 'triple unit', category: 'number' },
  { word: 'four', gloss: 'quadruple unit', category: 'number' },
  { word: 'five', gloss: 'fivefold unit', category: 'number' },
  { word: 'six', gloss: 'sixfold unit', category: 'number' },
  { word: 'seven', gloss: 'sevenfold unit', category: 'number' },
  { word: 'eight', gloss: 'eightfold unit', category: 'number' },
  { word: 'nine', gloss: 'ninefold unit', category: 'number' },
  { word: 'ten', gloss: 'decade unit', category: 'number' },
  { word: 'many', gloss: 'large quantity', category: 'number' },
  { word: 'few', gloss: 'small quantity', category: 'number' },
  { word: 'all', gloss: 'entire quantity', category: 'number' },
  { word: 'none', gloss: 'zero quantity', category: 'number' },
  { word: 'half', gloss: 'fifty percent', category: 'number' },
  { word: 'pair', gloss: 'set of two', category: 'number' },
  { word: 'some', gloss: 'partial quantity', category: 'number' },
  // change / quality
  { word: 'change', gloss: 'become different', category: 'stream' },
  { word: 'same', gloss: 'unchanged identity', category: 'index' },
  { word: 'new', gloss: 'recently arisen', category: 'origin' },
  { word: 'old', gloss: 'long existing', category: 'time' },
  { word: 'good', gloss: 'positive value', category: 'society' },
  { word: 'bad', gloss: 'negative value', category: 'society' },
  { word: 'true', gloss: 'matching reality', category: 'index' },
  { word: 'false', gloss: 'not matching reality', category: 'index' },
  { word: 'big', gloss: 'large size', category: 'shape' },
  { word: 'small', gloss: 'little size', category: 'shape' },
  { word: 'long', gloss: 'extended length', category: 'shape' },
  { word: 'short', gloss: 'limited length', category: 'shape' },
  { word: 'heavy', gloss: 'great weight', category: 'object' },
  { word: 'light-weight', gloss: 'little weight', category: 'object' },
  { word: 'hard', gloss: 'resistant to force', category: 'object' },
  { word: 'soft', gloss: 'yielding to force', category: 'object' },
  { word: 'wet', gloss: 'covered with liquid', category: 'nature' },
  { word: 'dry', gloss: 'lacking liquid', category: 'nature' },
  { word: 'full', gloss: 'completely filled', category: 'cavity' },
  { word: 'empty', gloss: 'completely unfilled', category: 'cavity' },
  { word: 'open', gloss: 'not closed', category: 'interface' },
  { word: 'close', gloss: 'shut; not open', category: 'interface' },
  { word: 'live', gloss: 'having life', category: 'nature' },
  { word: 'die', gloss: 'lose life', category: 'origin' },
  { word: 'sleep', gloss: 'resting unconsciousness', category: 'body' },
  { word: 'wake', gloss: 'end sleep', category: 'body' },
  { word: 'eat', gloss: 'take in food', category: 'body' },
  { word: 'speak', gloss: 'produce speech', category: 'emanation' },
  { word: 'listen', gloss: 'attend to sound', category: 'perception' },
  { word: 'think', gloss: 'mental processing', category: 'index' },
  { word: 'know', gloss: 'hold as certain', category: 'index' },
  { word: 'learn', gloss: 'gain knowledge', category: 'index' },
  { word: 'forget', gloss: 'lose knowledge', category: 'index' },
  { word: 'want', gloss: 'desire to have', category: 'index' },
  { word: 'need', gloss: 'require for survival', category: 'index' },
  { word: 'give', gloss: 'transfer to another', category: 'society' },
  { word: 'take', gloss: 'receive from another', category: 'society' },
  { word: 'find', gloss: 'discover by search', category: 'index' },
  { word: 'lose', gloss: 'no longer have', category: 'index' },
  { word: 'hide', gloss: 'conceal from view', category: 'emanation' },
  { word: 'show', gloss: 'reveal to view', category: 'emanation' },
];

function addWord(words, seen, word, gloss, category) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w || seen.has(w)) return;
  seen.add(w);
  words.push({
    word: w,
    gloss: String(gloss ?? w).trim(),
    category: String(category ?? 'other').trim(),
  });
}

async function loadSeedRoots() {
  try {
    const lex = JSON.parse(await readFile(LEXICON_PATH, 'utf8'));
    return lex.words?.filter(w => w.source === 'roots') ?? [];
  } catch {
    return [];
  }
}

export async function buildEnglishRoots() {
  const words = [];
  const seen = new Set();

  for (const item of await loadSeedRoots()) {
    addWord(words, seen, item.word, item.gloss, item.category);
  }

  const gen31 = JSON.parse(await readFile(GEN31_PATH, 'utf8'));
  for (const item of gen31.inventory ?? []) {
    const gloss = item.gloss?.split(';')[0]?.trim() ?? item.id;
    const domain = item.coordinates?.D ?? 'primitive';
    const category = DOMAIN_LABELS[domain] ?? domain;
    addWord(words, seen, item.id, gloss, category);
  }

  for (const item of EXPANSION) {
    addWord(words, seen, item.word, item.gloss, item.category);
  }

  words.sort((a, b) => a.word.localeCompare(b.word));
  const categories = [...new Set(words.map(w => w.category))].sort();

  return {
    version: '1.0',
    description: 'Curated English words suitable as Fonoran root meanings.',
    generated_at: new Date().toISOString(),
    word_count: words.length,
    categories,
    words,
  };
}

export async function writeEnglishRoots() {
  const roots = await buildEnglishRoots();
  await writeFile(OUT_PATH, JSON.stringify(roots, null, 2) + '\n');
  console.log(`Wrote ${roots.word_count} English roots to ${OUT_PATH}`);
  return roots;
}

if (process.argv[1]?.endsWith('fonoran-english-roots-build.js')) {
  writeEnglishRoots().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
