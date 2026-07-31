/**
 * Root rings — capped primitive vocabulary (50 → 100 → 150 max).
 *
 * See data/fonoran-root-rings.json and docs/fonoran-rulebook.md.
 * Anything not in these rings is compound-only (not a primitive root).
 */

export const ROOT_RING_CAPS = {
  communicative_core: 50,
  extended_core: 100,
  fluent_core: 150,
};

export const LANGUAGE_TIERS = ['communicative_core', 'extended_core', 'fluent_core'];

export const EXPERIENCE_TIERS = [
  'survival_body',
  'space_motion',
  'social',
  'emotion',
  'time',
  'thinking',
  'abstract',
];

export const LANGUAGE_TIER_LABELS = {
  communicative_core: 'Ring 1 — Campfire core (50)',
  extended_core: 'Ring 2 — Everyday (100)',
  fluent_core: 'Ring 3 — Fluency (150 max)',
};

export const EXPERIENCE_TIER_LABELS = {
  survival_body: 'Survival & body',
  space_motion: 'Space & motion',
  social: 'Social',
  emotion: 'Emotion',
  time: 'Time',
  thinking: 'Thinking',
  abstract: 'Abstract',
};

/** Ring 1 — campfire core (exactly 50). */
export const RING_1_IDS = [
  'person', 'self', 'addressee', 'body', 'eat', 'drink', 'food', 'sleep', 'pain', 'sick',
  'hot', 'cold', 'see', 'hear', 'speak', 'touch', 'hand', 'head', 'need', 'want',
  'feel', 'good', 'bad', 'fear', 'love',
  'thing', 'name',
  'move', 'here', 'there', 'place', 'path', 'inside', 'outside', 'near', 'far', 'up', 'down', 'left', 'right',
  'water', 'fire',
  'give', 'take', 'help', 'collective',
  'before', 'now', 'know', 'do',
];

/** Ring 2 — everyday (50 more, 100 cumulative). */
export const RING_2_IDS = [
  'bond', 'parent', 'child', 'conflict', 'angry', 'happy', 'sad', 'calm', 'trust', 'hope',
  'after', 'time', 'think', 'understand', 'make', 'use', 'hold', 'wait',
  'around', 'back', 'front', 'through',
  'air', 'earth', 'sky', 'light', 'dark', 'stone', 'plant', 'tree', 'animal', 'fast',
  'life', 'skin', 'eye', 'bone', 'heart', 'smell', 'taste',
  'big', 'small', 'one', 'many', 'some', 'same', 'true',
  'work',
  // July 2026 frequency swap: the words a first sentence actually contains.
  'day', 'night', 'sun',
];

/** Ring 3 — fluency (up to 50 more, 150 cumulative max). */
export const RING_3_IDS = [
  'equal', 'change', 'cause', 'count', 'part', 'all', 'more', 'less', 'will', 'mark',
  'include',
  'point', 'journey',
  'lonely',
  'strong', 'still', 'flow', 'metal',
  'form', 'source', 'empty', 'bound', 'center',
  // July 2026 register review: operators and basic dimensions, not more nouns.
  'happen', 'new', 'side', 'sound', 'color', 'wet', 'heavy', 'female', 'male',
  // July 2026 frequency swap: corpus-measured everyday words earn seats from
  // idle duplicates (aggression/scared/joy/… were shadowed by angry/fear/happy).
  'rain', 'safe', 'please', 'again', 'soon', 'try', 'share', 'show',
  'tired', 'worried', 'wound', 'shelter', 'meaning',
];

const RING_BY_ID = new Map();
for (const id of RING_1_IDS) RING_BY_ID.set(id, 'communicative_core');
for (const id of RING_2_IDS) RING_BY_ID.set(id, 'extended_core');
for (const id of RING_3_IDS) RING_BY_ID.set(id, 'fluent_core');

/** @deprecated use fluent_core */
export const COMPLETE_ONLY = new Set();

/** New primitives to seed when applying rings. */
export const NEW_ROOT_CONCEPTS = [
  { id: 'work', domain: 'action', description: 'effort done toward a goal', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'include', domain: 'social', description: 'to bring in as part of a group', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'point', domain: 'space', description: 'a sharp aim or exact spot', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'journey', domain: 'space', description: 'the experience of traveling; a path through life', priority_class: 'useful', language_tier: 'fluent_core' },
  { id: 'happen', domain: 'process', description: 'an event takes place; occur', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'new', domain: 'quality', description: 'new; recently come into being', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'side', domain: 'space', description: 'the side of a thing; a flank, face or edge', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'sound', domain: 'element', description: 'sound; what is heard', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'color', domain: 'quality', description: 'color; the visual quality of a surface', priority_class: 'useful', language_tier: 'fluent_core' },
  { id: 'wet', domain: 'element', description: 'wet; soaked with water', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'heavy', domain: 'quality', description: 'heavy; hard to lift', priority_class: 'useful', language_tier: 'fluent_core' },
  { id: 'female', domain: 'being', description: 'female; the she-kind of a living being', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'male', domain: 'being', description: 'male; the he-kind of a living being', priority_class: 'common', language_tier: 'fluent_core' },
  // July 2026 frequency swap: corpus-measured everyday words promoted from
  // compounds. Their old compound spellings are retired, never reassigned.
  { id: 'day', domain: 'time', description: 'a day; the bright span of the cycle', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'night', domain: 'time', description: 'the night; the dark span of the cycle', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'sun', domain: 'element', description: 'the sun; the light of the sky', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'rain', domain: 'element', description: 'rain; water falling from the sky', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'safe', domain: 'quality', description: 'safe; out of danger', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'please', domain: 'social', description: 'please; the softening word of a request', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'again', domain: 'time', description: 'again; one more time', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'soon', domain: 'time', description: 'soon; in a short time from now', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'try', domain: 'action', description: 'to try; to attempt an action', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'share', domain: 'social', description: 'to share; to give part while keeping part', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'show', domain: 'social', description: 'to show; to cause to see', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'tired', domain: 'being', description: 'tired; drained of strength', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'worried', domain: 'emotion', description: 'worried; troubled by what may come', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'wound', domain: 'being', description: 'a wound; an injury on the body', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'shelter', domain: 'space', description: 'shelter; a place that protects', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'meaning', domain: 'process', description: 'meaning; what a word or act points to', priority_class: 'common', language_tier: 'fluent_core' },
];

/** @deprecated use NEW_ROOT_CONCEPTS */
export const GAP_FILL_CONCEPTS = [];

const EXPERIENCE_BY_ID = {
  person: 'survival_body', self: 'survival_body', body: 'survival_body', life: 'survival_body',
  eat: 'survival_body', drink: 'survival_body', sleep: 'survival_body', pain: 'survival_body',
  hot: 'survival_body', cold: 'survival_body', see: 'survival_body', hear: 'survival_body',
  speak: 'survival_body', touch: 'survival_body', smell: 'survival_body', taste: 'survival_body',
  hand: 'survival_body', eye: 'survival_body', skin: 'survival_body', bone: 'survival_body',
  head: 'survival_body', heart: 'survival_body', need: 'survival_body',
  tired: 'survival_body', wound: 'survival_body', safe: 'survival_body', try: 'survival_body',
  hold: 'survival_body', do: 'survival_body', make: 'survival_body', use: 'survival_body',
  food: 'survival_body', sick: 'survival_body', work: 'survival_body',
  move: 'space_motion', up: 'space_motion', down: 'space_motion', inside: 'space_motion',
  outside: 'space_motion', near: 'space_motion', far: 'space_motion', left: 'space_motion',
  right: 'space_motion', here: 'space_motion', there: 'space_motion', path: 'space_motion',
  place: 'space_motion', water: 'space_motion', fire: 'space_motion', earth: 'space_motion',
  air: 'space_motion', sky: 'space_motion', light: 'space_motion', dark: 'space_motion',
  stone: 'space_motion', plant: 'space_motion', tree: 'space_motion', animal: 'space_motion',
  metal: 'space_motion', fast: 'space_motion', flow: 'space_motion', wait: 'space_motion',
  around: 'space_motion', back: 'space_motion', front: 'space_motion', through: 'space_motion',
  point: 'space_motion', journey: 'space_motion',
  side: 'space_motion', sound: 'space_motion',
  sun: 'space_motion', rain: 'space_motion', shelter: 'space_motion',
  wet: 'survival_body', heavy: 'survival_body',
  female: 'social', male: 'social',
  give: 'social', take: 'social', help: 'social', collective: 'social', bond: 'social',
  conflict: 'social', parent: 'social', addressee: 'social', name: 'social', mark: 'social',
  child: 'social', include: 'social',
  please: 'social', share: 'social', show: 'social',
  love: 'emotion', fear: 'emotion', feel: 'emotion', want: 'emotion', good: 'emotion',
  bad: 'emotion', happy: 'emotion', sad: 'emotion', angry: 'emotion', calm: 'emotion',
  trust: 'emotion', hope: 'emotion', lonely: 'emotion', worried: 'emotion',
  before: 'time', after: 'time', now: 'time', time: 'time',
  day: 'time', night: 'time', soon: 'time', again: 'time',
  know: 'thinking', think: 'thinking', will: 'thinking', understand: 'thinking',
  meaning: 'thinking',
  thing: 'abstract', form: 'abstract', change: 'abstract',
  empty: 'abstract', source: 'abstract', still: 'abstract', strong: 'abstract',
  bound: 'abstract', center: 'abstract',
  equal: 'abstract', true: 'abstract', same: 'abstract', part: 'abstract',
  cause: 'abstract', one: 'abstract', many: 'abstract', all: 'abstract',
  some: 'abstract', more: 'abstract', less: 'abstract', big: 'abstract', small: 'abstract',
  happen: 'abstract', new: 'abstract', color: 'abstract',
};

const CAMPFIRE_REASONS = {
  communicative_core: 'Ring 1: two strangers would plausibly need this in their first week.',
  extended_core: 'Ring 2: everyday fluency beyond the campfire core.',
  fluent_core: 'Ring 3: broad fluency within the 150-root cap.',
};

export function experienceTierFor(id) {
  return EXPERIENCE_BY_ID[id] ?? 'abstract';
}

export function languageTierFor(id) {
  return RING_BY_ID.get(id) ?? null;
}

export function isAllowedPrimitive(id) {
  return RING_BY_ID.has(id);
}

/**
 * @returns {{ experience_tier: string, language_tier: string, campfire: { pass: boolean, reason: string } } | null}
 */
export function experienceMetaFor(id) {
  const language_tier = languageTierFor(id);
  if (!language_tier) return null;
  return {
    experience_tier: experienceTierFor(id),
    language_tier,
    campfire: {
      pass: language_tier === 'communicative_core',
      reason: CAMPFIRE_REASONS[language_tier],
    },
  };
}

export function buildPrimitiveRecord(def) {
  const meta = experienceMetaFor(def.id) ?? {
    experience_tier: experienceTierFor(def.id),
    language_tier: def.language_tier,
    campfire: {
      pass: def.language_tier === 'communicative_core',
      reason: CAMPFIRE_REASONS[def.language_tier] ?? CAMPFIRE_REASONS.fluent_core,
    },
  };
  return {
    id: def.id,
    tier: 'core',
    domain: def.domain,
    description: def.description,
    priority_class: def.priority_class ?? 'common',
    suggested_status: 'primitive',
    plain_description: def.description,
    experience_tier: meta.experience_tier,
    language_tier: meta.language_tier,
    campfire_pass: meta.campfire.pass,
    campfire_reason: meta.campfire.reason,
  };
}

/** @deprecated */
export function gapFillPrimitive(def) {
  return buildPrimitiveRecord(def);
}

export function ringSummary() {
  return {
    ring_1: RING_1_IDS.length,
    ring_2: RING_2_IDS.length,
    ring_3: RING_3_IDS.length,
    total_assigned: RING_BY_ID.size,
    cap: ROOT_RING_CAPS.fluent_core,
  };
}
