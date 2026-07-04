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
  hope: [['want', 'good', 'after'], ['good', 'after', 'want'], ['after', 'good']],
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
  peace: [['collective', 'conflict', 'empty'], ['empty', 'conflict'], ['collective', 'good']],
  nation: [['tribe', 'bound', 'place'], ['collective', 'place'], ['tribe', 'place']],
  grow: [['life', 'change', 'more'], ['life', 'more'], ['change', 'life']],

  // --- live-only / extended vocabulary ---
  death: [['bound', 'life'], ['empty', 'life'], ['after', 'life']],
  birth: [['source', 'life'], ['change', 'life'], ['life', 'before']],
  breath: [['air', 'flow'], ['flow', 'air'], ['air', 'inside']],
  joy: [['good', 'feel'], ['feel', 'good', 'strong'], ['feel', 'good']],
  sad: [['bad', 'feel'], ['feel', 'bad'], ['feel', 'empty']],
  teach: [['make', 'know'], ['give', 'know'], ['person', 'know', 'give']],
  learn: [['take', 'know'], ['know', 'take'], ['person', 'take', 'know']],
  signal: [['give', 'mark'], ['mark', 'give'], ['speak', 'mark']],
  seed: [['source', 'plant'], ['plant', 'source'], ['small', 'plant']],
  cycle: [['pulse', 'time'], ['time', 'pulse'], ['change', 'time']],
  void: [['empty', 'all'], ['empty', 'thing'], ['empty', 'place']],
  agent: [['do', 'person'], ['person', 'do'], ['make', 'person']],
  container: [['hold', 'thing'], ['thing', 'hold'], ['inside', 'thing']],
  whole: [['all', 'thing'], ['all', 'part'], ['part', 'all']],
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
  sea: [['water', 'whole'], ['water', 'all'], ['water', 'big']],
  rain: [['water', 'down'], ['sky', 'water'], ['water', 'move', 'down']],
  cloud: [['sky', 'water'], ['air', 'water'], ['water', 'up']],
  island: [['earth', 'water'], ['earth', 'inside', 'water'], ['place', 'water']],
  forest: [['many', 'plant', 'place'], ['many', 'tree'], ['tree', 'place']],
  mountain: [['earth', 'up', 'still'], ['earth', 'up'], ['stone', 'up']],
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
  open: [['make', 'path'], ['empty', 'bound'], ['path', 'empty', 'bound']],
  sunrise: [['sun', 'up'], ['light', 'up'], ['sun', 'before']],
  sunset: [['sun', 'down'], ['light', 'down'], ['sun', 'after']],
  moonlight: [['moon', 'light'], ['light', 'moon'], ['night', 'light']],
  morning: [['sun', 'before'], ['light', 'after'], ['before', 'light']],
  winter: [['cold', 'time'], ['time', 'cold'], ['cold', 'after']],
  bridge: [['path', 'water'], ['water', 'path'], ['place', 'water', 'path']],
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
  again: [['do', 'around'], ['around', 'do'], ['same', 'do', 'around']],
  repeat: [['do', 'around', 'same'], ['same', 'do', 'around'], ['do', 'same', 'around']],
  redo: [['make', 'around'], ['do', 'around', 'make'], ['make', 'do', 'around']],
  surround: [['outside', 'around'], ['around', 'outside'], ['path', 'around', 'outside']],
  encircle: [['path', 'around'], ['around', 'path'], ['move', 'around', 'outside']],
  orbit: [['move', 'far', 'around'], ['far', 'move', 'around'], ['move', 'around', 'far']],
  cycle: [['time', 'around'], ['around', 'time'], ['move', 'time', 'around']],
  spiral: [['move', 'around', 'up'], ['up', 'move', 'around'], ['move', 'around', 'more']],
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
  hide: [['self', 'back', 'outside'], ['go', 'back', 'see', 'empty'], ['outside', 'back', 'see']],
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
  tree: [['plant', 'big'], ['big', 'plant'], ['plant', 'up', 'big']],
  metal: [['earth', 'fire', 'stone'], ['stone', 'fire'], ['earth', 'stone', 'hot']],
  child: [['person', 'small'], ['small', 'person'], ['person', 'life', 'small']],
  parent: [['person', 'before'], ['before', 'person'], ['person', 'give', 'life']],
  surface: [['outside', 'bound'], ['bound', 'outside'], ['skin', 'outside']],
  center: [['inside', 'same'], ['same', 'inside'], ['inside', 'all', 'same']],

  // --- hide / I am hiding (direct answer to user's example) ---
  hide: [['self', 'back', 'outside'], ['outside', 'back', 'see'], ['move', 'back', 'see', 'empty']],
  hiding: [['self', 'back', 'outside'], ['see', 'empty', 'self'], ['self', 'outside', 'back']],
  conceal: [['hold', 'back', 'outside'], ['back', 'outside', 'hold'], ['outside', 'hold', 'see']],
  // --- vocabulary survey additions (LLM-generated, all validated against primitive set) ---
  above: [['place', 'up']],
  acceptance: [['still', 'feel']],
  afraid: [['feel', 'fear']],
  age: [['time', 'body']],
  agree: [['speak', 'same']],
  along: [['path', 'near']],
  already: [['before', 'now']],
  always: [['all', 'time']],
  apprentice: [['person', 'know', 'take']],
  arm: [['hand', 'body'], ['give', 'bone']],
  ash: [['fire', 'earth']],
  away: [['move', 'far']],
  axe: [['stone', 'plant'], ['hand', 'make']],
  bag: [['thing', 'inside'], ['empty', 'hold']],
  bandage: [['hold', 'wound'], ['skin', 'hold']],
  basket: [['plant', 'inside'], ['plant', 'hold']],
  beach: [['water', 'bound']],
  beginning: [['before', 'now'], ['one', 'time']],
  bellows: [['air', 'fire'], ['make', 'air']],
  below: [['place', 'down']],
  beside: [['near', 'bound']],
  betray: [['bond', 'bad'], ['give', 'bad', 'back']],
  between: [['bound', 'bound']],
  blame: [['speak', 'bad', 'person']],
  bleeding: [['water', 'wound'], ['move', 'pain']],
  blind: [['see', 'empty'], ['eye', 'dark']],
  blood: [['life', 'water'], ['body', 'water']],
  boast: [['speak', 'self', 'good']],
  boat: [['water', 'move'], ['thing', 'water']],
  bone_tool: [['bone', 'use'], ['bone', 'hand']],
  bored: [['feel', 'empty']],
  bowl: [['empty', 'eat'], ['thing', 'eat']],
  break: [['conflict', 'thing']],
  broken_bone: [['bad', 'bone'], ['pain', 'bone']],
  bruise: [['skin', 'dark'], ['pain', 'dark']],
  call: [['speak', 'far'], ['speak', 'name']],
  carry: [['move', 'hold']],
  carrying: [['hold', 'move'], ['take', 'move']],
  catch: [['take', 'fast']],
  cave: [['stone', 'inside']],
  certain: [['true', 'know']],
  chase: [['front', 'fast', 'move']],
  chest: [['heart', 'outside'], ['breath', 'body']],
  circular_path: [['path', 'around']],
  clay: [['earth', 'water'], ['water', 'earth']],
  clean_water: [['good', 'water'], ['true', 'water']],
  cliff: [['stone', 'down']],
  climb: [['up', 'move']],
  close: [['inside', 'make']],
  cloth: [['plant', 'skin'], ['skin', 'make']],
  coal: [['fire', 'stone'], ['dark', 'fire']],
  cold_exposure: [['cold', 'body'], ['cold', 'pain']],
  confused: [['think', 'dark']],
  cooked_food: [['fire', 'food'], ['hot', 'food']],
  courage: [['do', 'fear']],
  cowardice: [['fear', 'still']],
  crawl: [['down', 'move']],
  cup: [['empty', 'drink'], ['thing', 'drink']],
  curious: [['want', 'know']],
  cut: [['bound', 'make']],
  dangerous_ground: [['place', 'bad']],
  dead_end: [['path', 'bound']],
  deaf: [['hear', 'empty']],
  decay: [['bad', 'life']],
  dehydration: [['empty', 'body'], ['need', 'drink']],
  desert: [['earth', 'empty']],
  despair: [['feel', 'bad', 'far']],
  determination: [['hold', 'do']],
  dew: [['water', 'cold']],
  dig: [['down', 'make']],
  direction: [['path', 'front']],
  disagree: [['speak', 'conflict']],
  disgust: [['bad', 'feel', 'taste']],
  distant_place: [['place', 'far']],
  distraction: [['move', 'think']],
  dizzy: [['head', 'around'], ['think', 'around']],
  doubt: [['think', 'conflict']],
  downward: [['move', 'down']],
  dream: [['sleep', 'think']],
  drop: [['down', 'give']],
  duration: [['hold', 'time']],
  ear: [['hear', 'body'], ['hear', 'head']],
  early: [['before', 'good']],
  edge: [['bound', 'outside']],
  edible: [['good', 'eat'], ['true', 'food']],
  elder: [['person', 'before'], ['person', 'back']],
  ending: [['after', 'now'], ['bound', 'time']],
  envy: [['want', 'same']],
  era: [['big', 'time']],
  eventually: [['far', 'after']],
  exhaustion: [['empty', 'body'], ['need', 'sleep']],
  exile: [['person', 'outside', 'bound']],
  fall: [['down', 'move']],
  far_side: [['bound', 'far']],
  farewell: [['speak', 'far'], ['speak', 'after']],
  finger: [['hand', 'one'], ['touch', 'hand']],
  fire_making: [['make', 'fire'], ['hand', 'fire']],
  fist: [['hand', 'hold'], ['hand', 'around']],
  fix: [['make', 'good']],
  flood: [['water', 'earth'], ['many', 'water']],
  floor: [['earth', 'inside'], ['down', 'bound']],
  flower: [['plant', 'light']],
  focus: [['hold', 'think']],
  fog: [['air', 'water']],
  follow: [['back', 'move']],
  foot: [['move', 'body'], ['down', 'body']],
  forgive: [['feel', 'good', 'after'], ['pain', 'back', 'empty']],
  fresh: [['near', 'make']],
  fresh_water_source: [['place', 'water'], ['good', 'water']],
  fruit: [['plant', 'food']],
  gather: [['move', 'inside']],
  gossip: [['speak', 'person', 'far']],
  grass: [['plant', 'small']],
  grateful: [['feel', 'good', 'give']],
  greeting: [['speak', 'near'], ['speak', 'good']],
  guest: [['person', 'inside'], ['person', 'near']],
  hammer: [['stone', 'make'], ['hand', 'stone']],
  hidden: [['inside', 'dark'], ['still', 'dark']],
  hidden_place: [['place', 'dark']],
  high_ground: [['up', 'place'], ['up', 'earth']],
  high_place: [['place', 'up']],
  hill: [['earth', 'small']],
  hip: [['body', 'around']],
  hook: [['take', 'bound'], ['bound', 'take']],
  hungry: [['want', 'food'], ['need', 'eat']],
  ice: [['cold', 'stone'], ['water', 'still']],
  ignorance: [['empty', 'know']],
  imagine: [['think', 'make']],
  impatience: [['fast', 'want']],
  infection: [['bad', 'inside'], ['pain', 'inside']],
  inner_area: [['inside', 'place']],
  insect: [['animal', 'small']],
  inspiration: [['light', 'think']],
  instant: [['small', 'time']],
  introduce: [['speak', 'name', 'person']],
  inward: [['move', 'inside']],
  itch: [['skin', 'want'], ['touch', 'want']],
  jealous: [['want', 'take']],
  jump: [['up', 'fast', 'move']],
  junction: [['path', 'many']],
  kin: [['person', 'same'], ['collective', 'bond']],
  knee: [['move', 'bone']],
  ladder: [['up', 'path'], ['path', 'up']],
  landmark: [['place', 'know']],
  last: [['near', 'before']],
  late: [['after', 'good']],
  leaf: [['plant', 'skin']],
  lean: [['front', 'still']],
  leg: [['move', 'bone'], ['path', 'body']],
  lever: [['move', 'big'], ['hand', 'move']],
  lie: [['speak', 'bad', 'true']],
  lift: [['up', 'take']],
  lightning: [['sky', 'fire']],
  log: [['plant', 'stone'], ['big', 'plant']],
  lonely: [['feel', 'one']],
  long_ago: [['far', 'before']],
  longing: [['want', 'far']],
  lost: [['path', 'empty'], ['know', 'far']],
  low_place: [['place', 'down']],
  lung: [['air', 'inside'], ['breath', 'inside']],
  mate: [['person', 'love', 'bond']],
  meanwhile: [['same', 'time']],
  mediator: [['person', 'conflict', 'help']],
  medicine: [['plant', 'help'], ['good', 'body']],
  meeting_point: [['place', 'bond']],
  mentor: [['person', 'know', 'give']],
  mortar: [['stone', 'eat'], ['stone', 'make']],
  mushroom: [['plant', 'earth']],
  nail: [['hand', 'stone']],
  nearby: [['place', 'near']],
  needle: [['small', 'through'], ['hand', 'through']],
  negotiate: [['speak', 'give', 'take']],
  nest: [['animal', 'place']],
  net: [['bond', 'many'], ['many', 'bond']],
  never: [['empty', 'time']],
  next: [['near', 'after']],
  nose: [['smell', 'body']],
  nostalgia: [['feel', 'good', 'before']],
  now_moment: [['one', 'now']],
  numb: [['touch', 'empty'], ['feel', 'empty']],
  obsession: [['hold', 'want']],
  old: [['far', 'before']],
  open_space: [['place', 'empty']],
  opposite: [['far', 'bound']],
  order: [['speak', 'do'], ['leader', 'speak']],
  outer_area: [['outside', 'place']],
  outward: [['move', 'outside']],
  overhead: [['up', 'near']],
  partner: [['person', 'bond']],
  pass: [['through', 'move']],
  path_finding: [['know', 'path'], ['see', 'path']],
  patience: [['still', 'want']],
  pause: [['still', 'time']],
  peg: [['small', 'hold'], ['hold', 'stone']],
  permanent: [['still', 'all']],
  phase: [['some', 'time']],
  pity: [['feel', 'bad', 'person']],
  plank: [['make', 'plant']],
  point: [['front', 'hand']],
  poison: [['bad', 'eat'], ['bad', 'inside']],
  pot: [['fire', 'eat'], ['hot', 'hold']],
  pour: [['give', 'water']],
  praise: [['speak', 'good', 'person']],
  predator: [['animal', 'fear'], ['animal', 'bad']],
  press: [['still', 'touch']],
  promise: [['speak', 'bond'], ['speak', 'true']],
  proud: [['good', 'self'], ['feel', 'good', 'self']],
  pull: [['back', 'take']],
  pull_apart: [['conflict', 'take']],
  push: [['front', 'move']],
  raft: [['plant', 'water']],
  rash: [['skin', 'bad']],
  rationing: [['less', 'eat'], ['some', 'food']],
  raw_food: [['food', 'fire'], ['food', 'cold']],
  refuse: [['speak', 'want', 'back'], ['take', 'back']],
  regret: [['bad', 'feel', 'before']],
  relief: [['feel', 'good', 'after']],
  renewal: [['around', 'life']],
  request: [['speak', 'want']],
  rescue: [['help', 'far'], ['give', 'safe']],
  rest: [['still', 'sleep'], ['still', 'body']],
  return_path: [['path', 'back']],
  reunion: [['collective', 'near', 'again'], ['person', 'come', 'back']],
  rhythm: [['around', 'time']],
  ripen: [['good', 'plant']],
  rival: [['person', 'conflict']],
  root: [['plant', 'down']],
  rope: [['plant', 'bond']],
  rumor: [['speak', 'some', 'true']],
  sack: [['big', 'inside'], ['hold', 'many']],
  safe_ground: [['place', 'good']],
  scar: [['wound', 'before'], ['skin', 'before']],
  scatter: [['many', 'give']],
  secret: [['know', 'inside'], ['know', 'one']],
  sequence: [['path', 'time']],
  shadow: [['dark', 'light']],
  shake: [['around', 'move']],
  shame: [['bad', 'self']],
  share: [['give', 'some']],
  shelter: [['bound', 'place'], ['inside', 'place']],
  shield: [['body', 'conflict'], ['hold', 'conflict']],
  shortcut: [['path', 'less']],
  shoulder: [['hold', 'body']],
  shrink: [['less', 'big']],
  sibling: [['person', 'same', 'parent']],
  smoke: [['air', 'fire'], ['dark', 'air']],
  snake: [['animal', 'path']],
  snow: [['cold', 'water'], ['water', 'cold']],
  soon: [['near', 'after']],
  spear: [['far', 'conflict'], ['conflict', 'path']],
  spine: [['back', 'bone'], ['body', 'bone']],
  spread: [['move', 'outside']],
  starvation: [['empty', 'body'], ['need', 'food']],
  stomach: [['eat', 'inside'], ['food', 'inside']],
  stop: [['move', 'still']],
  storm: [['sky', 'conflict']],
  straight_path: [['path', 'one']],
  stranger: [['person', 'far'], ['person', 'outside']],
  strike: [['fast', 'touch']],
  sudden: [['fast', 'change']],
  surprise: [['feel', 'fast', 'know']],
  surrounding: [['around', 'place']],
  suspicion: [['think', 'bad', 'person']],
  swamp: [['earth', 'water']],
  sweat: [['hot', 'water'], ['body', 'hot']],
  swollen: [['body', 'big'], ['skin', 'big']],
  tear: [['eye', 'water'], ['feel', 'water']],
  temporary: [['small', 'time']],
  thank: [['speak', 'good', 'give'], ['speak', 'give', 'back']],
  thirsty: [['want', 'drink'], ['need', 'water']],
  thread: [['plant', 'bond'], ['small', 'bond']],
  throat: [['speak', 'inside'], ['mouth', 'inside']],
  throw: [['fast', 'give']],
  thumb: [['hand', 'big']],
  thunder: [['sky', 'hear']],
  tide: [['water', 'around']],
  tie: [['bond', 'hand']],
  tired: [['body', 'empty'], ['move', 'empty']],
  tongue: [['taste', 'mouth'], ['speak', 'mouth']],
  tooth: [['eat', 'bone'], ['mouth', 'bone']],
  torch: [['fire', 'move'], ['move', 'light']],
  toward: [['move', 'near']],
  transform: [['make', 'same']],
  trap: [['hold', 'animal'], ['bound', 'animal']],
  unconscious: [['sleep', 'bad'], ['empty', 'head']],
  underfoot: [['down', 'near']],
  upward: [['move', 'up']],
  valley: [['earth', 'down']],
  walk: [['still', 'move']],
  wall: [['stone', 'bound'], ['earth', 'bound']],
  warmth: [['hot', 'good'], ['fire', 'feel']],
  warmth_sharing: [['collective', 'hot'], ['give', 'hot']],
  warn: [['speak', 'fear'], ['speak', 'bad']],
  weak: [['body', 'less'], ['move', 'less']],
  wheel: [['around', 'move'], ['move', 'around']],
  window: [['light', 'through'], ['see', 'through']],
  wrist: [['hand', 'bond']],
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

  return {
    metaFor,
    collisionCounts,
    knownByConcept,
    flatCountFor,
    compoundsDoc,
    primitiveIds,
    llmProposalSeeds,
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
