/**
 * Generate Fonoran grammar exercises dynamically from the live lab dictionary and the
 * grammar particle inventory. Sentences follow the documented skeleton
 * (Actor · Action · Target) so they stay grammatical, and each exercise is tagged with a
 * tierRank so the curriculum can order them from simple to complex.
 */
import { experienceMetaFor, LANGUAGE_TIERS } from '../tools/fonoran-experience-tiers.js';

/** Verbs safe to use intransitively: "I <verb>." */
const INTRANSITIVE_VERBS = ['sleep', 'move', 'see', 'hear', 'speak', 'eat', 'drink', 'wait', 'think', 'know', 'feel'];

/** Location/state roots: "I am <here>." */
const LOCATIONS = ['here', 'there', 'inside', 'outside', 'near', 'far', 'up', 'down'];

/** Hand-picked verb + object pairs that make sense: "I <verb> <object>." */
const TRANSITIVE_PAIRS = [
  ['see', 'person'], ['see', 'fire'], ['see', 'water'], ['see', 'path'], ['see', 'animal'],
  ['hear', 'person'], ['hear', 'animal'],
  ['want', 'food'], ['want', 'water'],
  ['eat', 'food'], ['drink', 'water'],
  ['give', 'food'], ['give', 'water'], ['give', 'name'],
  ['take', 'food'], ['take', 'water'], ['take', 'hand'],
  ['hold', 'hand'], ['hold', 'child'],
  ['make', 'fire'], ['make', 'food'], ['make', 'path'],
  ['use', 'hand'], ['use', 'fire'],
  ['need', 'water'], ['need', 'food'], ['need', 'help'],
  ['help', 'person'], ['help', 'child'], ['help', 'parent'],
  ['know', 'name'], ['know', 'person'], ['know', 'path'],
  ['feel', 'pain'], ['feel', 'fear'],
];

/** Plural quantity: "Many <noun>." */
const MANY_NOUNS = ['person', 'thing', 'child', 'animal', 'tree', 'stone', 'place'];

const VERB_EN = {
  sleep: 'sleep', move: 'move', see: 'see', hear: 'hear', speak: 'speak', eat: 'eat',
  drink: 'drink', wait: 'wait', think: 'think', know: 'know', feel: 'feel', want: 'want',
  help: 'help', give: 'give', take: 'take', make: 'make', use: 'use', hold: 'hold', need: 'need',
};

const LOCATION_EN = {
  here: 'here', there: 'there', inside: 'inside', outside: 'outside',
  near: 'near', far: 'far', up: 'up', down: 'down',
};

const OBJECT_EN = {
  person: 'a person', fire: 'fire', water: 'water', path: 'a path', animal: 'an animal',
  food: 'food', name: 'a name', hand: 'a hand', child: 'a child', parent: 'a parent',
  pain: 'pain', fear: 'fear', help: 'help', thing: 'a thing', head: 'a head', place: 'a place',
};

const MANY_EN = {
  person: 'people', thing: 'things', child: 'children', animal: 'animals',
  tree: 'trees', stone: 'stones', place: 'places',
};

function conceptRank(conceptId) {
  const rank = LANGUAGE_TIERS.indexOf(experienceMetaFor(conceptId).language_tier);
  return rank < 0 ? LANGUAGE_TIERS.length - 1 : rank;
}

/** @param {any} particles */
function pronounForm(particles) {
  const list = particles?.particles ?? [];
  const found = list.find((p) => p.id === 'pronoun_i');
  return found?.form || 'mi';
}

/**
 * @param {object} lab
 * @param {object|null} particles
 * @returns {import('./fonoran-grammar-practice.js').GrammarExercise[]}
 */
export function buildGrammarExercises(lab, particles) {
  const spellingByConcept = new Map();
  for (const sound of lab?.sounds ?? []) {
    if (!sound.concept_id || !sound.spelling || sound.state === 'rejected') continue;
    if (!spellingByConcept.has(sound.concept_id)) spellingByConcept.set(sound.concept_id, sound.spelling);
  }

  const mi = pronounForm(particles);
  const exercises = [];
  let n = 0;

  const add = (english, tokens, concepts) => {
    const answerRoman = tokens.join(' ');
    const tierRank = concepts.reduce((max, c) => Math.max(max, conceptRank(c)), 0);
    exercises.push({
      id: `gen-${n++}`,
      promptLang: english,
      answerRoman,
      promptFonoran: answerRoman,
      answerLang: english,
      parts: tokens,
      spelling: answerRoman,
      tierRank,
    });
  };

  for (const verb of INTRANSITIVE_VERBS) {
    const sp = spellingByConcept.get(verb);
    if (sp && VERB_EN[verb]) add(`I ${VERB_EN[verb]}.`, [mi, sp], [verb]);
  }

  for (const loc of LOCATIONS) {
    const sp = spellingByConcept.get(loc);
    if (sp && LOCATION_EN[loc]) add(`I am ${LOCATION_EN[loc]}.`, [mi, sp], [loc]);
  }

  for (const [verb, noun] of TRANSITIVE_PAIRS) {
    const spV = spellingByConcept.get(verb);
    const spN = spellingByConcept.get(noun);
    if (spV && spN && VERB_EN[verb] && OBJECT_EN[noun]) {
      add(`I ${VERB_EN[verb]} ${OBJECT_EN[noun]}.`, [mi, spV, spN], [verb, noun]);
    }
  }

  const manySp = spellingByConcept.get('many');
  if (manySp) {
    for (const noun of MANY_NOUNS) {
      const spN = spellingByConcept.get(noun);
      if (spN && MANY_EN[noun]) add(`Many ${MANY_EN[noun]}.`, [manySp, spN], ['many', noun]);
    }
  }

  return exercises;
}
