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
import { getAcceptedCompositionSeeds } from './fonoran-compound-proposals.js';
import { evaluateCampfireComposition } from './fonoran-campfire-composition.js';
import { DIFFICULT_ONSETS } from './fonoran-phonetic-weights.js';

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
  remember: [['know', 'before'], ['hold', 'know'], ['know', 'before', 'inside']],
  forget: [['know', 'empty'], ['empty', 'know'], ['empty', 'know']],
  // Prefer transparent human-recoverable trees (four rules). Intermediate compounds
  // (memory, knowledge, …) remain valid but primitive stacks are preferred first.
  identity: [['self', 'know'], ['self', 'same'], ['person', 'self', 'know'], ['self', 'memory']],
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
  lamp: [['light', 'hold'], ['fire', 'hold'], ['light', 'use']],
  tool: [['hand', 'use'], ['hand', 'thing'], ['thing', 'use'], ['use', 'thing']],
  voice: [['speak', 'breath'], ['breath', 'speak'], ['person', 'speak']],
  thought: [['think', 'inside'], ['inside', 'think'], ['mind', 'inside']],
  hope: [['want', 'good', 'after'], ['good', 'after', 'want'], ['after', 'good']],
  shared_meaning: [['collective', 'know', 'same'], ['same', 'know', 'collective'], ['speak', 'same']],
  tribe: [['community', 'bond'], ['collective', 'person', 'bond'], ['community', 'same'], ['community', 'identity']],
  war: [['tribe', 'conflict'], ['conflict', 'tribe'], ['collective', 'conflict', 'person']],
  village: [['place', 'community'], ['community', 'place'], ['many', 'person', 'place']],
  language: [['collective', 'speak'], ['speak', 'know', 'same'], ['speak', 'collective'], ['speak', 'shared_meaning']],
  money: [['equal', 'exchange'], ['give', 'take', 'equal'], ['exchange', 'equal', 'thing']],
  teacher: [['give', 'know', 'person'], ['person', 'give', 'know'], ['speak', 'give', 'person'], ['person', 'knowledge', 'give']],
  book: [['mark', 'know'], ['know', 'mark'], ['speak', 'mark', 'know'], ['knowledge', 'thing']],
  document: [['mark', 'know'], ['speak', 'mark'], ['know', 'mark'], ['mark', 'thing', 'know']],
  music: [['speak', 'pulse', 'joy'], ['joy', 'speak'], ['pulse', 'good']],
  government: [['collective', 'rule'], ['community', 'rule'], ['collective', 'hold', 'rule'], ['community', 'hold', 'strong']],
  law: [['collective', 'rule'], ['rule', 'collective'], ['collective', 'path'], ['bond', 'collective', 'rule']],
  religion: [['collective', 'bond', 'hope'], ['bond', 'sky'], ['collective', 'bond', 'good'], ['collective', 'bond', 'source']],
  trade: [['exchange', 'person'], ['person', 'exchange'], ['give', 'take', 'person']],
  // work is a Ring-2 primitive — seed kept only for legacy references
  work: [['person', 'do'], ['do', 'person'], ['person', 'make']],
  weapon: [['tool', 'conflict'], ['hand', 'conflict'], ['conflict', 'thing']],
  ocean: [['water', 'place', 'many'], ['water', 'big'], ['water', 'all']],
  world: [['earth', 'all'], ['earth', 'place'], ['place', 'all'], ['earth', 'life']],
  peace: [['collective', 'conflict', 'empty'], ['empty', 'conflict'], ['collective', 'good']],
  nation: [['collective', 'place'], ['community', 'place'], ['collective', 'bound', 'place'], ['tribe', 'place']],
  grow: [['life', 'change', 'more'], ['life', 'more'], ['change', 'life']],

  // --- live-only / extended vocabulary ---
  death: [['bound', 'life'], ['empty', 'life'], ['after', 'life']],
  birth: [['source', 'life'], ['change', 'life'], ['life', 'before']],
  breath: [['air', 'flow'], ['flow', 'air'], ['air', 'inside']],
  joy: [['good', 'feel'], ['feel', 'good', 'strong'], ['feel', 'good']],
  sad: [['bad', 'feel'], ['feel', 'bad'], ['feel', 'empty']],
  teach: [['give', 'know'], ['make', 'know'], ['person', 'know', 'give']],
  learn: [['take', 'know'], ['know', 'take'], ['person', 'take', 'know']],
  signal: [['speak', 'mark'], ['mark', 'see'], ['give', 'speak', 'mark']],
  seed: [['source', 'plant'], ['plant', 'source'], ['small', 'plant']],
  cycle: [['pulse', 'time'], ['time', 'pulse'], ['change', 'time']],
  void: [['empty', 'all'], ['empty', 'place'], ['empty', 'thing']],
  agent: [['do', 'person'], ['person', 'do'], ['make', 'person']],
  container: [['hold', 'inside'], ['inside', 'hold'], ['hand', 'hold']],
  whole: [['all', 'place'], ['all', 'many'], ['many', 'all']],
  people: [['many', 'person'], ['collective', 'person'], ['person', 'many']],
  leader: [['head', 'person'], ['strong', 'person'], ['speak', 'person']],
  helper: [['help', 'person'], ['person', 'help'], ['good', 'person', 'help']],
  student: [['learn', 'person'], ['person', 'learn'], ['take', 'know', 'person']],
  giant: [['big', 'body'], ['big', 'person'], ['body', 'big']],
  mind: [['think', 'center'], ['think', 'inside'], ['inside', 'think']],
  wisdom: [['know', 'strong'], ['strong', 'know'], ['know', 'more']],
  meaning: [['signal', 'know'], ['know', 'signal'], ['shared_meaning']],
  word: [['mark', 'speak'], ['speak', 'mark'], ['thing', 'speak']],
  lake: [['water', 'still'], ['water', 'place'], ['water', 'hold']],
  sea: [['water', 'all'], ['water', 'whole'], ['water', 'big']],
  seafood: [['food', 'fish'], ['food', 'sea'], ['food', 'water', 'animal']],
  rain: [['sky', 'water'], ['air', 'water'], ['sky', 'water', 'move']],
  cloud: [['sky', 'water'], ['air', 'water'], ['sky', 'water', 'still']],
  island: [['earth', 'water'], ['earth', 'inside', 'water'], ['place', 'water']],
  forest: [['many', 'plant', 'place'], ['many', 'tree'], ['tree', 'place']],
  mountain: [['stone', 'big', 'still'], ['earth', 'big', 'still'], ['earth', 'big']],
  sun: [['source', 'light', 'hot'], ['light', 'source'], ['sky', 'fire']],
  star: [['light', 'far'], ['sky', 'light', 'small'], ['light', 'small']],
  moon: [['light', 'cold'], ['sky', 'light', 'night'], ['cold', 'light']],
  day: [['before', 'light'], ['sun', 'time'], ['light', 'before']],
  night: [['dark', 'time'], ['time', 'dark'], ['empty', 'light', 'time']],
  fever: [['hot', 'body'], ['bad', 'hot', 'body'], ['body', 'hot', 'bad']],
  wound: [['pain', 'body'], ['bad', 'skin'], ['bad', 'body']],
  heal: [['make', 'good'], ['good', 'body'], ['help', 'body']],
  journey: [['move', 'path'], ['far', 'move'], ['move', 'far']],
  city: [['many', 'place'], ['place', 'many'], ['community', 'place']],
  birthplace: [['birth', 'place'], ['place', 'birth'], ['source', 'place']],
  open: [['make', 'path'], ['path', 'empty'], ['move', 'path', 'empty'], ['empty', 'bound']],
  sunrise: [['sun', 'before'], ['sky', 'fire', 'before'], ['light', 'before']],
  sunset: [['sun', 'after'], ['sky', 'fire', 'after'], ['light', 'after']],
  moonlight: [['moon', 'light'], ['light', 'moon'], ['night', 'light']],
  morning: [['sun', 'before'], ['light', 'after'], ['before', 'light']],
  winter: [['cold', 'time'], ['time', 'cold'], ['cold', 'after']],
  bridge: [['path', 'hold', 'water'], ['path', 'water'], ['hold', 'path', 'water']],
  beautiful: [['good', 'see'], ['see', 'good'], ['good', 'body']],
  almost: [['near', 'far'], ['near', 'all'], ['less', 'all']],
  door: [['path', 'bound'], ['bound', 'path'], ['place', 'bound']],
  campfire: [['fire', 'place'], ['fire', 'near'], ['fire', 'person', 'place']],
  fish: [['water', 'animal'], ['water', 'move', 'animal'], ['animal', 'water']],
  bird: [['sky', 'animal'], ['air', 'animal'], ['animal', 'fly']],
  blacksmith: [['metal', 'make', 'person'], ['metal', 'person'], ['make', 'metal']],
  grandparent: [['before', 'parent'], ['parent', 'before'], ['before', 'before', 'parent']],
  doctor: [['heal', 'person'], ['good', 'body', 'person'], ['help', 'body', 'person']],
  hunter: [['take', 'animal', 'person'], ['animal', 'take'], ['person', 'take', 'animal']],
  farmer: [['make', 'plant', 'person'], ['plant', 'person'], ['grow', 'plant', 'person']],
  fisherman: [['fish', 'person'], ['person', 'fish'], ['water', 'animal', 'person']],
  knife: [['metal', 'bound'], ['tool', 'bound'], ['metal', 'thing']],
  red: [['fire', 'see'], ['see', 'fire'], ['hot', 'see']],
  gift: [['give', 'thing', 'good'], ['give', 'thing'], ['good', 'give']],
  danger: [['fear', 'place'], ['bad', 'near'], ['near', 'pain']],
  question: [['speak', 'know', 'empty'], ['want', 'know'], ['speak', 'want', 'know']],
  answer: [['speak', 'know'], ['give', 'know'], ['speak', 'know', 'give'], ['speak', 'knowledge']],

  // --- retired-to-compound roots (vocabulary remediation): formerly primitive roots,
  // now expressed compositionally so the ~50 core can carry the practical load ---
  pulse: [['heart', 'move'], ['body', 'move'], ['move', 'move']],
  wave: [['water', 'move'], ['move', 'water'], ['water', 'move', 'fast']],
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
  // part is a Ring-3 primitive — seed kept only for legacy references
  part: [['thing', 'inside'], ['inside', 'thing'], ['small', 'inside']],
  change: [['before', 'same'], ['less', 'same'], ['thing', 'before', 'same']],

  // --- new gap compounds surfaced by the beginner-conversation simulation ---
  come: [['move', 'here'], ['here', 'move'], ['move', 'near']],
  later: [['after', 'now'], ['now', 'after'], ['after', 'time']],
  own: [['self', 'take'], ['self', 'thing'], ['take', 'self']],
  safe: [['good', 'empty', 'fear'], ['empty', 'fear'], ['bond', 'good']],

  // --- around-powered vocabulary (the circular/cyclical spatial primitive) ---
  // `around` = zo: the most generative missing concept
  spin: [['move', 'around'], ['around', 'move'], ['body', 'move', 'around']],
  rotate: [['move', 'around'], ['thing', 'move', 'around'], ['around', 'move']],
  return: [['move', 'around', 'here'], ['move', 'back', 'here'], ['move', 'here', 'around']],
  again: [['same', 'do'], ['do', 'around'], ['around', 'do'], ['same', 'do', 'around']],
  repeat: [['same', 'do'], ['do', 'same'], ['same', 'do', 'around'], ['around', 'do']],
  redo: [['make', 'around'], ['do', 'around', 'make'], ['make', 'do', 'around']],
  surround: [['outside', 'around'], ['around', 'outside'], ['path', 'around', 'outside']],
  encircle: [['path', 'around'], ['around', 'path'], ['move', 'around', 'outside']],
  orbit: [['move', 'far', 'around'], ['far', 'move', 'around'], ['move', 'around', 'far']],
  cycle: [['time', 'around'], ['around', 'time'], ['move', 'time', 'around']],
  spiral: [['move', 'around', 'more'], ['around', 'move', 'more'], ['move', 'around', 'time']],
  wrap: [['hold', 'around'], ['around', 'hold'], ['outside', 'hold', 'around']],
  revolution: [['move', 'around', 'place'], ['place', 'move', 'around'], ['collective', 'change', 'around']],
  circle: [['path', 'around'], ['around', 'path'], ['move', 'around', 'same']],
  loop: [['path', 'around', 'same'], ['around', 'path', 'same'], ['move', 'around', 'here']],
  once_more: [['do', 'around', 'one'], ['one', 'do', 'around'], ['around', 'do', 'one']],

  // --- front/back-powered orientation vocabulary ---
  // `front` = te, `back` = fi
  behind: [['back', 'place'], ['place', 'back'], ['outside', 'back']],
  ahead: [['front', 'place'], ['place', 'front'], ['path', 'front']],
  forward: [['move', 'front'], ['front', 'move'], ['path', 'front', 'move']],
  backward: [['move', 'back'], ['back', 'move'], ['path', 'back', 'move']],
  avoid: [['move', 'back', 'fear'], ['path', 'around', 'bad'], ['back', 'move', 'bad']],
  face: [['turn', 'front'], ['front', 'toward'], ['body', 'front', 'give']],
  approach: [['move', 'front', 'near'], ['near', 'move', 'front'], ['move', 'near', 'front']],
  retreat: [['move', 'back', 'fear'], ['back', 'move', 'fast'], ['move', 'back', 'bad']],
  turn: [['move', 'around', 'front'], ['around', 'front'], ['body', 'around', 'move']],
  hide: [['move', 'back', 'see'], ['self', 'back', 'see'], ['outside', 'back', 'see']],
  reverse: [['move', 'back', 'same'], ['back', 'do', 'same'], ['do', 'back', 'path']],
  left_side: [['front', 'around', 'one'], ['around', 'front', 'one'], ['body', 'front', 'around']],
  right_side: [['front', 'back', 'around'], ['around', 'front', 'back'], ['body', 'front', 'back']],

  // --- through-powered traversal vocabulary ---
  // `through` = bu
  cross: [['move', 'through'], ['through', 'move'], ['move', 'through', 'path']],
  enter: [['move', 'through', 'inside'], ['inside', 'move', 'through'], ['through', 'inside']],
  exit: [['move', 'through', 'outside'], ['outside', 'move', 'through'], ['through', 'outside']],
  pierce: [['push', 'through'], ['through', 'bound'], ['bound', 'through']],
  tunnel: [['path', 'through', 'earth'], ['earth', 'path', 'through'], ['through', 'earth', 'path']],
  transparent: [['see', 'through'], ['through', 'see'], ['light', 'through']],
  passage: [['path', 'through'], ['through', 'path'], ['move', 'through', 'bound']],
  filter: [['take', 'through'], ['through', 'take', 'some'], ['some', 'through', 'bound']],

  // --- newly derivable from demoted primitives ---
  happy: [['feel', 'good'], ['good', 'feel'], ['feel', 'good', 'strong']],
  angry: [['feel', 'bad'], ['bad', 'feel', 'strong'], ['feel', 'conflict']],
  calm: [['feel', 'still'], ['still', 'feel'], ['feel', 'good', 'still']],
  trust: [['know', 'good', 'bond'], ['bond', 'good', 'know'], ['feel', 'good', 'bond']],
  sick: [['body', 'bad'], ['bad', 'body'], ['body', 'pain', 'bad']],
  understand: [['know', 'through'], ['through', 'know'], ['know', 'inside', 'through']],
  wait: [['still', 'time'], ['time', 'still'], ['here', 'still', 'after']],
  tree: [['plant', 'big'], ['big', 'plant'], ['earth', 'plant', 'big']],
  metal: [['earth', 'fire', 'stone'], ['stone', 'fire'], ['earth', 'stone', 'hot']],
  child: [['person', 'small'], ['small', 'person'], ['person', 'life', 'small']],
  parent: [['person', 'before'], ['before', 'person'], ['person', 'give', 'life']],
  surface: [['outside', 'bound'], ['bound', 'outside'], ['skin', 'outside']],
  center: [['inside', 'same'], ['same', 'inside'], ['inside', 'all', 'same']],

  // --- hide / I am hiding (direct answer to user's example) ---
  hide: [['move', 'back', 'see'], ['self', 'back', 'see'], ['outside', 'back', 'see']],
  hiding: [['self', 'back', 'see'], ['see', 'empty', 'self'], ['self', 'outside', 'back']],
  conceal: [['hold', 'back', 'outside'], ['back', 'outside', 'hold'], ['outside', 'hold', 'see']],

  // --- zero-seed gap fills (body parts, dialogue repair, survival) ---
  // Body parts absent from ASSOCIATION_SEEDS entirely
  head: [['think', 'body'], ['body', 'think'], ['body', 'sky']],
  eye: [['see', 'body'], ['see', 'head'], ['light', 'body']],
  mouth: [['speak', 'body'], ['eat', 'body'], ['speak', 'head']],
  skin: [['outside', 'body'], ['body', 'outside'], ['touch', 'body']],
  bone: [['hard', 'body'], ['body', 'stone'], ['inside', 'body']],
  teeth: [['eat', 'stone'], ['mouth', 'stone'], ['stone', 'eat']],

  // Dialogue repair and common social concepts
  please: [['want', 'good'], ['give', 'good'], ['good', 'want']],
  sorry: [['feel', 'bad'], ['know', 'bad'], ['bad', 'feel', 'self']],
  laugh: [['feel', 'good', 'speak'], ['speak', 'good', 'body'], ['good', 'speak', 'body']],
  try: [['do', 'want'], ['want', 'do'], ['move', 'want']],
  show: [['give', 'see'], ['see', 'give'], ['speak', 'see']],
  plan: [['think', 'before'], ['before', 'think'], ['know', 'before', 'do']],
  sit: [['body', 'earth', 'still'], ['still', 'earth', 'body'], ['earth', 'body', 'still']],
  stand: [['body', 'still', 'big'], ['big', 'body', 'still'], ['still', 'body', 'big']],
  breathe: [['air', 'inside'], ['inside', 'air'], ['body', 'air', 'move']],
  boil: [['water', 'hot'], ['hot', 'water'], ['water', 'fire', 'hot']],
  borrow: [['take', 'after', 'give'], ['take', 'give', 'after'], ['give', 'take', 'near']],
  mistake: [['do', 'bad'], ['know', 'bad'], ['speak', 'bad', 'true']],
  ready: [['good', 'before'], ['before', 'do'], ['want', 'do', 'now']],
  worried: [['feel', 'fear'], ['fear', 'feel'], ['feel', 'bad', 'after']],
  relieved: [['feel', 'good'], ['empty', 'fear'], ['fear', 'empty', 'feel']],
  slowly: [['move', 'less'], ['less', 'fast'], ['move', 'still']],
  clearly: [['speak', 'true'], ['true', 'speak'], ['know', 'speak', 'good']],
  maybe: [['know', 'empty'], ['some', 'true'], ['true', 'some']],
  other: [['person', 'far'], ['far', 'same'], ['different', 'same']],
  closer: [['move', 'near'], ['near', 'more'], ['move', 'more', 'near']],
  long: [['far', 'bound'], ['path', 'big'], ['place', 'far', 'bound']],
  belong: [['inside', 'bond'], ['bond', 'place'], ['self', 'inside', 'collective']],
  staying: [['still', 'place'], ['hold', 'place'], ['still', 'inside']],
  // inflection variants — alias to base concept; kept for input coverage
  belongs: [['inside', 'bond'], ['bond', 'place'], ['self', 'inside', 'collective']],
  raindrops: [['sky', 'water', 'small'], ['sky', 'water', 'many'], ['water', 'small', 'sky']],
  raindrop: [['sky', 'water', 'small'], ['water', 'small', 'sky'], ['water', 'small', 'one']],
  // meta
  fonoran: [['speak', 'collective', 'know'], ['language', 'collective'], ['collective', 'speak', 'same']],
  still_raw: [['still', 'body'], ['body', 'still'], ['body', 'still', 'here']],
  what: [['know', 'empty'], ['thing', 'know', 'empty'], ['speak', 'want', 'know']],

  // --- vocabulary survey additions (LLM-generated, all validated against primitive set) ---
  above: [['sky', 'place'], ['place', 'sky'], ['sky', 'near']],
  acceptance: [['still', 'feel'], ['feel', 'still'], ['good', 'still']],
  afraid: [['feel', 'fear'], ['fear', 'feel'], ['fear', 'body']],
  age: [['time', 'body'], ['body', 'before'], ['body', 'time']],
  agree: [['speak', 'same'], ['same', 'speak'], ['know', 'same']],
  along: [['path', 'near'], ['near', 'path'], ['move', 'path']],
  already: [['before', 'now'], ['now', 'before'], ['good', 'now']],
  always: [['all', 'time'], ['time', 'all'], ['all', 'now']],
  apprentice: [['person', 'know', 'take'], ['know', 'take', 'person'], ['take', 'know', 'person']],
  arm: [['hand', 'body'], ['body', 'hand'], ['hand', 'move', 'body']],
  ash: [['fire', 'earth'], ['earth', 'fire'], ['fire', 'after']],
  away: [['move', 'far'], ['far', 'move'], ['move', 'outside']],
  axe: [['hand', 'stone'], ['stone', 'conflict'], ['take', 'stone']],
  bag: [['hold', 'inside'], ['take', 'inside'], ['bound', 'inside']],
  bandage: [['hold', 'wound'], ['skin', 'hold']],
  basket: [['plant', 'inside'], ['plant', 'hold']],
  beach: [['water', 'bound'], ['bound', 'water'], ['earth', 'water', 'bound']],
  beginning: [['before', 'now'], ['one', 'time']],
  bellows: [['air', 'fire'], ['make', 'air']],
  below: [['earth', 'place'], ['place', 'earth'], ['near', 'earth']],
  beside: [['near', 'bound'], ['bound', 'near'], ['near', 'outside']],
  betray: [['bond', 'bad'], ['give', 'bad', 'back']],
  between: [['bound', 'bound'], ['inside', 'bound'], ['path', 'bound']],
  blame: [['speak', 'bad', 'person'], ['bad', 'speak', 'person'], ['speak', 'person', 'bad']],
  bleeding: [['water', 'wound'], ['move', 'pain']],
  blind: [['see', 'empty'], ['eye', 'dark']],
  blood: [['body', 'water'], ['life', 'body'], ['body', 'life', 'water']],
  boast: [['speak', 'self', 'good'], ['good', 'self', 'speak'], ['self', 'good', 'speak']],
  boat: [['water', 'move'], ['hold', 'water'], ['thing', 'water', 'move']],
  bone_tool: [['stone', 'use'], ['hand', 'stone'], ['stone', 'hand']],
  bored: [['feel', 'empty'], ['empty', 'feel'], ['want', 'empty']],
  bowl: [['hold', 'eat'], ['inside', 'eat'], ['hold', 'inside', 'eat']],
  break: [['conflict', 'bound'], ['conflict', 'thing'], ['thing', 'conflict']],
  broken_bone: [['body', 'pain', 'bad'], ['pain', 'body', 'inside'], ['bad', 'body', 'inside']],
  bruise: [['skin', 'dark'], ['pain', 'dark']],
  call: [['speak', 'far'], ['speak', 'name']],
  carry: [['move', 'hold'], ['hold', 'move'], ['take', 'move']],
  carrying: [['hold', 'move'], ['take', 'move']],
  catch: [['take', 'fast'], ['fast', 'take'], ['hold', 'fast']],
  cave: [['stone', 'inside'], ['inside', 'stone'], ['earth', 'inside']],
  certain: [['true', 'know'], ['know', 'true'], ['know', 'good']],
  chase: [['front', 'fast', 'move'], ['fast', 'front', 'move'], ['move', 'fast', 'front']],
  chest: [['heart', 'outside'], ['breath', 'body']],
  circular_path: [['path', 'around'], ['around', 'path'], ['move', 'around', 'path']],
  clay: [['earth', 'water'], ['water', 'earth']],
  clean_water: [['good', 'water'], ['true', 'water']],
  cliff: [['stone', 'big', 'outside'], ['big', 'stone', 'outside'], ['stone', 'still', 'outside']],
  climb: [['move', 'sky'], ['sky', 'move'], ['body', 'sky', 'move']],
  close: [['inside', 'make'], ['inside', 'bound'], ['bound', 'path']],
  cloth: [['plant', 'skin'], ['bound', 'plant']],
  coal: [['fire', 'stone'], ['dark', 'fire']],
  cold_exposure: [['cold', 'body'], ['cold', 'pain']],
  confused: [['think', 'dark'], ['dark', 'think'], ['know', 'empty']],
  cooked_food: [['fire', 'food'], ['hot', 'food']],
  courage: [['do', 'fear'], ['fear', 'do'], ['move', 'fear']],
  cowardice: [['fear', 'still'], ['still', 'fear'], ['fear', 'move', 'back']],
  crawl: [['body', 'move', 'still'], ['move', 'body', 'less'], ['body', 'still', 'move']],
  cup: [['hold', 'drink'], ['inside', 'drink'], ['hold', 'inside', 'drink']],
  curious: [['want', 'know'], ['know', 'want'], ['think', 'want']],
  cut: [['stone', 'make'], ['use', 'bound'], ['stone', 'bound'], ['conflict', 'bound']],
  dangerous_ground: [['place', 'bad'], ['bad', 'place'], ['fear', 'place']],
  dead_end: [['path', 'bound'], ['bound', 'path'], ['path', 'empty']],
  deaf: [['hear', 'empty'], ['empty', 'hear'], ['hear', 'dark']],
  decay: [['bad', 'life'], ['life', 'bad'], ['change', 'bad']],
  dehydration: [['empty', 'body'], ['need', 'drink']],
  desert: [['earth', 'empty'], ['empty', 'earth'], ['earth', 'hot', 'empty']],
  despair: [['feel', 'bad', 'far'], ['bad', 'feel', 'far'], ['feel', 'empty', 'bad']],
  determination: [['hold', 'do'], ['do', 'hold'], ['want', 'hold']],
  dew: [['water', 'cold'], ['cold', 'water'], ['water', 'before', 'cold']],
  dig: [['take', 'earth'], ['hand', 'earth'], ['hand', 'take', 'earth']],
  direction: [['path', 'front'], ['front', 'path'], ['path', 'know']],
  disagree: [['speak', 'conflict'], ['conflict', 'speak'], ['speak', 'conflict', 'same']],
  disgust: [['bad', 'feel', 'taste'], ['taste', 'bad', 'feel'], ['feel', 'bad', 'eat']],
  distant_place: [['place', 'far'], ['far', 'place'], ['place', 'before']],
  distraction: [['move', 'think'], ['think', 'outside'], ['want', 'outside']],
  dizzy: [['head', 'around'], ['think', 'around']],
  doubt: [['think', 'conflict'], ['know', 'conflict'], ['think', 'empty']],
  downward: [['move', 'earth'], ['earth', 'move'], ['path', 'earth']],
  dream: [['sleep', 'think'], ['think', 'sleep'], ['inside', 'think', 'sleep']],
  drop: [['give', 'earth'], ['earth', 'give'], ['move', 'earth', 'give']],
  duration: [['hold', 'time'], ['time', 'hold'], ['time', 'still']],
  ear: [['hear', 'body'], ['hear', 'head']],
  early: [['before', 'good'], ['good', 'before'], ['before', 'light']],
  edge: [['bound', 'outside'], ['outside', 'bound'], ['stone', 'bound', 'outside']],
  edible: [['good', 'eat'], ['true', 'food']],
  elder: [['person', 'before'], ['person', 'back']],
  ending: [['after', 'now'], ['bound', 'time']],
  envy: [['want', 'same'], ['same', 'want'], ['want', 'take', 'same']],
  era: [['big', 'time'], ['time', 'big'], ['many', 'time']],
  eventually: [['far', 'after'], ['after', 'far'], ['after', 'time', 'far']],
  exhaustion: [['empty', 'body'], ['need', 'sleep']],
  exile: [['person', 'outside', 'bound'], ['outside', 'person', 'bound'], ['person', 'bound', 'outside']],
  fall: [['body', 'earth'], ['move', 'earth'], ['earth', 'body']],
  far_side: [['bound', 'far'], ['far', 'bound'], ['outside', 'far']],
  farewell: [['speak', 'far'], ['speak', 'after']],
  finger: [['hand', 'one'], ['touch', 'hand']],
  fire_making: [['make', 'fire'], ['hand', 'fire']],
  fist: [['hand', 'hold'], ['hand', 'around']],
  fix: [['make', 'good'], ['good', 'make'], ['make', 'same']],
  flood: [['water', 'earth'], ['many', 'water']],
  floor: [['earth', 'inside'], ['earth', 'bound'], ['hold', 'earth', 'inside']],
  flower: [['plant', 'light'], ['light', 'plant'], ['plant', 'good']],
  focus: [['hold', 'think'], ['think', 'hold'], ['hold', 'know']],
  fog: [['air', 'water'], ['water', 'air'], ['dark', 'air']],
  follow: [['back', 'move'], ['move', 'back'], ['path', 'back']],
  foot: [['move', 'body'], ['path', 'body'], ['body', 'path', 'move']],
  forgive: [['feel', 'good', 'after'], ['pain', 'back', 'empty']],
  fresh: [['near', 'make'], ['good', 'now'], ['make', 'now']],
  fresh_water_source: [['place', 'water'], ['good', 'water']],
  fruit: [['plant', 'food'], ['food', 'plant'], ['eat', 'plant']],
  gather: [['move', 'inside'], ['inside', 'move'], ['take', 'many']],
  gossip: [['speak', 'person', 'far'], ['speak', 'far', 'person'], ['far', 'speak', 'person']],
  grass: [['plant', 'small'], ['small', 'plant'], ['earth', 'plant', 'small']],
  grateful: [['feel', 'good', 'give'], ['good', 'give', 'feel'], ['feel', 'give', 'good']],
  greeting: [['speak', 'near'], ['speak', 'good']],
  guest: [['person', 'inside'], ['person', 'near']],
  hammer: [['hand', 'stone'], ['use', 'stone'], ['hold', 'stone']],
  hidden: [['inside', 'dark'], ['still', 'dark']],
  hidden_place: [['place', 'dark'], ['dark', 'place'], ['inside', 'dark']],
  high_ground: [['sky', 'place'], ['earth', 'sky'], ['place', 'sky']],
  high_place: [['place', 'sky'], ['sky', 'place'], ['sky', 'near']],
  hill: [['earth', 'small'], ['earth', 'small', 'still'], ['stone', 'earth', 'small']],
  hip: [['body', 'around'], ['around', 'body'], ['body', 'bound', 'around']],
  hook: [['take', 'bound'], ['bound', 'take']],
  hungry: [['want', 'food'], ['need', 'eat']],
  ice: [['cold', 'stone'], ['water', 'still']],
  ignorance: [['empty', 'know'], ['know', 'empty'], ['empty', 'think']],
  imagine: [['think', 'see'], ['think', 'inside'], ['see', 'think'], ['think', 'make']],
  impatience: [['fast', 'want'], ['want', 'fast'], ['want', 'now']],
  infection: [['bad', 'inside'], ['pain', 'inside']],
  inner_area: [['inside', 'place'], ['place', 'inside'], ['inside', 'bound']],
  insect: [['animal', 'small'], ['small', 'animal'], ['animal', 'small', 'plant']],
  inspiration: [['light', 'think'], ['think', 'light'], ['good', 'think']],
  instant: [['small', 'time'], ['time', 'small'], ['now', 'one']],
  introduce: [['speak', 'name', 'person'], ['name', 'speak', 'person'], ['speak', 'person', 'name']],
  inward: [['move', 'inside'], ['inside', 'move'], ['path', 'inside']],
  itch: [['skin', 'want'], ['touch', 'want']],
  jealous: [['want', 'take'], ['take', 'want'], ['want', 'same', 'take']],
  jump: [['body', 'air', 'fast'], ['fast', 'air', 'body'], ['move', 'air', 'fast']],
  junction: [['path', 'many'], ['many', 'path'], ['place', 'path', 'many']],
  kin: [['person', 'same'], ['collective', 'bond']],
  knee: [['body', 'bound', 'move'], ['move', 'body', 'bound'], ['bound', 'move', 'body']],
  ladder: [['path', 'sky'], ['sky', 'path'], ['path', 'move', 'sky']],
  landmark: [['place', 'know'], ['know', 'place'], ['see', 'place']],
  last: [['near', 'before'], ['before', 'near'], ['one', 'after']],
  late: [['after', 'good'], ['good', 'after'], ['after', 'now']],
  leaf: [['plant', 'skin'], ['skin', 'plant'], ['plant', 'outside']],
  lean: [['front', 'still'], ['still', 'front'], ['body', 'front']],
  leg: [['path', 'body'], ['body', 'path'], ['move', 'body', 'long']],
  lever: [['move', 'big'], ['hand', 'move']],
  lie: [['speak', 'bad', 'true'], ['bad', 'speak', 'true'], ['speak', 'true', 'bad']],
  lift: [['hand', 'sky'], ['sky', 'hand'], ['hand', 'move', 'sky']],
  lightning: [['sky', 'fire'], ['fire', 'sky'], ['sky', 'fast', 'fire']],
  log: [['plant', 'stone'], ['big', 'plant']],
  lonely: [['feel', 'one'], ['one', 'feel'], ['feel', 'far', 'person']],
  long_ago: [['far', 'before'], ['before', 'far'], ['time', 'far', 'before']],
  longing: [['want', 'far'], ['far', 'want'], ['want', 'before']],
  lost: [['path', 'empty'], ['know', 'far']],
  low_place: [['place', 'earth'], ['earth', 'place'], ['earth', 'near']],
  lung: [['air', 'inside'], ['breath', 'inside']],
  mate: [['person', 'love', 'bond'], ['love', 'bond', 'person'], ['bond', 'love', 'person']],
  meanwhile: [['same', 'time'], ['time', 'same'], ['same', 'now']],
  mediator: [['person', 'conflict', 'help'], ['help', 'conflict', 'person'], ['conflict', 'help', 'person']],
  medicine: [['plant', 'help'], ['good', 'body']],
  meeting_point: [['place', 'bond'], ['bond', 'place'], ['place', 'near', 'bond']],
  mentor: [['person', 'know', 'give'], ['give', 'know', 'person'], ['know', 'give', 'person']],
  mortar: [['stone', 'hold'], ['stone', 'bound'], ['hand', 'stone']],
  mushroom: [['plant', 'earth'], ['earth', 'plant'], ['plant', 'earth', 'small']],
  nail: [['hand', 'stone'], ['stone', 'bound'], ['hold', 'stone']],
  nearby: [['place', 'near'], ['near', 'place'], ['near', 'here']],
  needle: [['hand', 'through'], ['small', 'hand', 'through'], ['small', 'through']],
  negotiate: [['speak', 'give', 'take'], ['give', 'take', 'speak'], ['speak', 'take', 'give']],
  nest: [['animal', 'place'], ['place', 'animal'], ['inside', 'animal']],
  net: [['hold', 'many'], ['take', 'bond', 'many'], ['hold', 'bond', 'many'], ['bond', 'many']],
  never: [['empty', 'time'], ['time', 'empty'], ['all', 'time', 'empty']],
  next: [['near', 'after'], ['after', 'near'], ['near', 'time']],
  nose: [['smell', 'body'], ['body', 'smell'], ['smell', 'head']],
  nostalgia: [['feel', 'good', 'before'], ['good', 'before', 'feel'], ['before', 'good', 'feel']],
  now_moment: [['one', 'now'], ['now', 'one'], ['small', 'time']],
  numb: [['touch', 'empty'], ['feel', 'empty']],
  obsession: [['hold', 'want'], ['want', 'hold'], ['hold', 'think', 'want']],
  old: [['far', 'before'], ['before', 'far'], ['body', 'before']],
  open_space: [['place', 'empty'], ['empty', 'place'], ['place', 'big', 'empty']],
  opposite: [['far', 'bound'], ['bound', 'far'], ['bound', 'outside']],
  order: [['speak', 'do'], ['leader', 'speak']],
  outer_area: [['outside', 'place'], ['place', 'outside'], ['outside', 'bound']],
  outward: [['move', 'outside'], ['outside', 'move'], ['path', 'outside']],
  overhead: [['sky', 'near'], ['near', 'sky'], ['sky', 'place']],
  partner: [['person', 'bond'], ['bond', 'person'], ['near', 'bond', 'person']],
  pass: [['through', 'move'], ['move', 'through'], ['path', 'through']],
  path_finding: [['know', 'path'], ['see', 'path']],
  patience: [['still', 'want'], ['want', 'still'], ['still', 'hold']],
  pause: [['still', 'time'], ['time', 'still'], ['still', 'now']],
  peg: [['small', 'hold'], ['hold', 'stone']],
  permanent: [['still', 'all'], ['all', 'still'], ['still', 'time', 'all']],
  phase: [['some', 'time'], ['time', 'some'], ['before', 'time', 'some']],
  pity: [['feel', 'bad', 'person'], ['bad', 'person', 'feel'], ['feel', 'pain', 'person']],
  plank: [['plant', 'bound'], ['plant', 'hand'], ['plant', 'stone']],
  point: [['front', 'hand'], ['hand', 'front'], ['small', 'front']],
  poison: [['bad', 'eat'], ['bad', 'inside']],
  pot: [['fire', 'eat'], ['hot', 'hold']],
  pour: [['give', 'water'], ['water', 'give'], ['water', 'move', 'give']],
  praise: [['speak', 'good', 'person'], ['good', 'speak', 'person'], ['speak', 'person', 'good']],
  predator: [['animal', 'fear'], ['animal', 'bad']],
  press: [['still', 'touch'], ['touch', 'still'], ['hand', 'still']],
  promise: [['speak', 'bond'], ['speak', 'true']],
  proud: [['good', 'self'], ['feel', 'good', 'self']],
  pull: [['back', 'take'], ['take', 'back'], ['hand', 'take', 'back']],
  pull_apart: [['conflict', 'take'], ['take', 'conflict'], ['take', 'far']],
  push: [['front', 'move'], ['move', 'front'], ['hand', 'front']],
  raft: [['plant', 'water'], ['water', 'plant'], ['move', 'plant', 'water']],
  rash: [['skin', 'bad'], ['bad', 'skin'], ['skin', 'pain']],
  rationing: [['less', 'eat'], ['some', 'food']],
  raw_food: [['food', 'fire'], ['food', 'cold']],
  refuse: [['speak', 'want', 'back'], ['take', 'back']],
  regret: [['bad', 'feel', 'before'], ['feel', 'bad', 'before'], ['before', 'bad', 'feel']],
  relief: [['feel', 'good', 'after'], ['good', 'after', 'feel'], ['after', 'good', 'feel']],
  renewal: [['around', 'life'], ['life', 'around'], ['change', 'good', 'life']],
  request: [['speak', 'want'], ['want', 'speak'], ['give', 'want', 'speak']],
  rescue: [['help', 'far'], ['give', 'safe']],
  rest: [['still', 'sleep'], ['still', 'body']],
  return_path: [['path', 'back'], ['back', 'path'], ['move', 'back', 'path']],
  reunion: [['collective', 'near', 'again'], ['person', 'come', 'back']],
  rhythm: [['around', 'time'], ['time', 'around'], ['move', 'around', 'time']],
  ripen: [['good', 'plant'], ['plant', 'good'], ['plant', 'time', 'good']],
  rival: [['person', 'conflict'], ['conflict', 'person'], ['fear', 'conflict', 'person']],
  root: [['plant', 'earth'], ['earth', 'plant'], ['plant', 'inside', 'earth']],
  rope: [['use', 'plant'], ['hand', 'plant'], ['plant', 'use'], ['plant', 'hold']],
  rumor: [['speak', 'some', 'true'], ['some', 'speak', 'true'], ['speak', 'far', 'some']],
  sack: [['big', 'inside'], ['hold', 'many']],
  safe_ground: [['place', 'good'], ['good', 'place'], ['empty', 'fear', 'place']],
  scar: [['wound', 'before'], ['skin', 'before']],
  scatter: [['many', 'give'], ['give', 'many'], ['give', 'outside']],
  secret: [['know', 'inside'], ['know', 'one']],
  sequence: [['path', 'time'], ['time', 'path'], ['before', 'path']],
  shadow: [['dark', 'light'], ['light', 'dark'], ['dark', 'place', 'light']],
  shake: [['around', 'move'], ['move', 'around'], ['body', 'around', 'fast']],
  shame: [['bad', 'self'], ['self', 'bad'], ['feel', 'bad', 'self']],
  share: [['give', 'some'], ['some', 'give'], ['give', 'collective', 'some']],
  shelter: [['bound', 'place'], ['inside', 'place']],
  shield: [['body', 'conflict'], ['hold', 'conflict']],
  shortcut: [['path', 'less'], ['less', 'path'], ['path', 'fast']],
  shoulder: [['hold', 'body'], ['body', 'hold'], ['body', 'hand', 'hold']],
  shrink: [['less', 'big'], ['big', 'less'], ['change', 'small']],
  sibling: [['person', 'same', 'parent'], ['same', 'parent', 'person'], ['person', 'parent', 'same']],
  smoke: [['air', 'fire'], ['dark', 'air']],
  snake: [['animal', 'path'], ['path', 'animal'], ['animal', 'move', 'path']],
  snow: [['cold', 'water'], ['water', 'cold']],
  soon: [['near', 'after'], ['now', 'after'], ['after', 'near', 'time']],
  spear: [['far', 'conflict'], ['conflict', 'path']],
  spine: [['body', 'back'], ['back', 'body'], ['body', 'inside', 'back']],
  spread: [['move', 'outside'], ['outside', 'move'], ['give', 'outside']],
  starvation: [['empty', 'body'], ['need', 'food']],
  stomach: [['eat', 'inside'], ['food', 'inside']],
  stop: [['move', 'still'], ['still', 'move'], ['move', 'empty']],
  storm: [['sky', 'conflict'], ['conflict', 'sky'], ['sky', 'bad', 'conflict']],
  straight_path: [['path', 'one'], ['one', 'path'], ['path', 'front', 'one']],
  stranger: [['person', 'far'], ['person', 'outside']],
  strike: [['fast', 'touch'], ['touch', 'fast'], ['conflict', 'fast']],
  sudden: [['fast', 'change'], ['change', 'fast'], ['fast', 'now']],
  surprise: [['feel', 'fast', 'know'], ['fast', 'know', 'feel'], ['know', 'fast', 'feel']],
  surrounding: [['around', 'place'], ['place', 'around'], ['outside', 'around']],
  suspicion: [['think', 'bad', 'person'], ['bad', 'think', 'person'], ['think', 'person', 'bad']],
  swamp: [['earth', 'water'], ['water', 'earth'], ['earth', 'water', 'many']],
  sweat: [['hot', 'water'], ['body', 'hot']],
  swollen: [['body', 'big'], ['skin', 'big']],
  tear: [['eye', 'water'], ['feel', 'water']],
  temporary: [['small', 'time'], ['time', 'small'], ['time', 'change']],
  thank: [['speak', 'good', 'give'], ['speak', 'give', 'back']],
  thirsty: [['want', 'drink'], ['need', 'water']],
  thread: [['small', 'use'], ['plant', 'use'], ['use', 'plant'], ['small', 'bond']],
  throat: [['speak', 'inside'], ['mouth', 'inside']],
  throw: [['fast', 'give'], ['give', 'fast'], ['hand', 'fast', 'give']],
  thumb: [['hand', 'big'], ['big', 'hand'], ['hand', 'one', 'big']],
  thunder: [['sky', 'hear'], ['hear', 'sky'], ['sky', 'conflict', 'hear']],
  tide: [['water', 'around'], ['around', 'water'], ['water', 'move', 'around']],
  tie: [['hold', 'bond'], ['move', 'bond'], ['bond', 'hold'], ['give', 'bound']],
  tired: [['body', 'empty'], ['move', 'empty']],
  tongue: [['mouth', 'taste'], ['speak', 'mouth'], ['body', 'taste']],
  tooth: [['eat', 'stone'], ['mouth', 'stone'], ['stone', 'eat']],
  torch: [['fire', 'move'], ['move', 'light']],
  toward: [['move', 'near'], ['near', 'move'], ['path', 'near']],
  transform: [['make', 'same'], ['change', 'same'], ['same', 'change']],
  trap: [['hold', 'animal'], ['bound', 'animal']],
  unconscious: [['sleep', 'bad'], ['empty', 'head']],
  underfoot: [['earth', 'near'], ['near', 'earth'], ['path', 'earth']],
  upward: [['move', 'sky'], ['sky', 'move'], ['path', 'sky']],
  valley: [['earth', 'inside'], ['inside', 'earth'], ['water', 'earth', 'inside']],
  walk: [['still', 'move'], ['move', 'still'], ['body', 'path']],
  wall: [['stone', 'bound'], ['earth', 'bound']],
  warmth: [['hot', 'good'], ['fire', 'feel']],
  warmth_sharing: [['collective', 'hot'], ['give', 'hot']],
  warn: [['speak', 'fear'], ['speak', 'bad']],
  weak: [['body', 'less'], ['move', 'less']],
  wheel: [['around', 'move'], ['move', 'around']],
  window: [['see', 'hold'], ['hold', 'see'], ['light', 'hold'], ['hold', 'through']],
  wrist: [['hand', 'bond'], ['bond', 'hand'], ['hand', 'bound']],
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
  const difficultRootIds = ctx.difficultRootIds ?? new Set();
  const seen = new Set();
  const ranked = [];

  for (const comp of compositions) {
    if (!Array.isArray(comp) || comp.length < 1) continue;
    const key = compositionKey(comp);
    if (seen.has(key)) continue;
    seen.add(key);
    const collisionCount = collisionCounts.get(key) ?? 1;
    const flatCount = flatCountFor(comp);
    const campfire = evaluateCampfireComposition(conceptId, comp);
    const scored = scoreUnderstandability(comp, {
      metaFor,
      collisionCount,
      flatCount,
      conceptId,
      campfireScore: campfire.score,
    });
    // Tiny penalty (0.005) for using difficult-onset roots (r/j) so clean alternatives win ties.
    const phoneticPenalty = comp.some(r => difficultRootIds.has(r)) ? 0.005 : 0;
    ranked.push({
      composition: comp,
      readable: comp.join(' + '),
      understandability: Math.max(0, scored.score - phoneticPenalty),
      label: scored.label,
      breakdown: scored.breakdown,
      flat_count: flatCount,
      campfire_score: campfire.score,
      campfire_issues: campfire.issues,
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
 * Validate that every concept ID referenced in ASSOCIATION_SEEDS exists in
 * the allowed concept set (primitives + compounds). Returns a list of
 * { seedConcept, component, usedIn } for each phantom reference.
 *
 * Run via the compound audit script or `npm run fonoran:compound-audit`.
 */
export function validateSeedIntegrity(primitiveIds, compoundDefs) {
  const allowedIds = new Set(primitiveIds ?? []);
  for (const def of compoundDefs ?? []) {
    if (def.concept) allowedIds.add(def.concept);
  }

  const violations = [];
  for (const [concept, strategies] of Object.entries(ASSOCIATION_SEEDS)) {
    for (const strategy of strategies) {
      for (const id of strategy) {
        if (!allowedIds.has(id)) {
          violations.push({ seedConcept: concept, component: id, strategy: strategy.join('+') });
        }
      }
    }
  }
  return violations;
}

/**
 * Generate ranked candidate expressions for a concept by merging:
 *   - any known preferred/existing composition,
 *   - hand-seeded communicative strategies,
 *   - accepted LLM-generated proposals (from fonoran-compound-proposals),
 *   - caller-supplied extra attempts.
 */
export function generateCandidates(conceptId, ctx = {}) {
  const pool = [];
  if (ctx.knownComposition?.length) pool.push(ctx.knownComposition);
  for (const seed of ASSOCIATION_SEEDS[conceptId] ?? []) pool.push(seed);
  // Merge accepted LLM proposals: these were validated at creation time
  for (const comp of ctx.llmProposalSeeds?.get(conceptId) ?? []) pool.push(comp);
  for (const extra of ctx.extraCompositions ?? []) pool.push(extra);
  return rankCandidates(conceptId, pool, ctx);
}

/** Node-only: build ranking context (meta lookup + collision counts) from the data files. */
export async function loadCandidateContext() {
  const [inventory, approved, compoundsDoc, llmProposalSeeds] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
    readDoc('compounds'),
    getAcceptedCompositionSeeds().catch(() => new Map()),
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

  // Build set of root IDs with difficult (r/j) onsets for phonetic tiebreaking.
  const difficultRootIds = new Set(
    (approved?.roots ?? []).filter(r => DIFFICULT_ONSETS.has(r.spelling?.[0])).map(r => r.id),
  );

  return {
    metaFor,
    collisionCounts,
    knownByConcept,
    flatCountFor,
    compoundsDoc,
    primitiveIds,
    llmProposalSeeds,
    difficultRootIds,
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
    const llmResult = await proposeLlmCandidates(conceptId, {
      gloss,
      primitiveIds: ctx.primitiveIds,
      compoundDefs: ctx.compoundsDoc?.compounds ?? [],
      maxFlattened: 4,
      rejectComposition: compound?.preferred?.composition ?? compound?.composition,
    });
    extraCompositions = llmResult.compositions ?? [];
    if (extraCompositions.length) {
      console.log(`LLM proposed ${extraCompositions.length} candidate(s).\n`);
    } else if (llmResult.error) {
      console.log(`LLM error: ${llmResult.error}\n`);
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
