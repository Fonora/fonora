/**
 * Root rings — capped primitive vocabulary (50 → 100 → 150 max).
 *
 * See data/fonoran-root-rings.json and docs/fonoran-constitution.md.
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
  'life', 'skin', 'eye', 'bone', 'heart', 'smell', 'taste', 'mouth',
  'big', 'small', 'one', 'many', 'some', 'same', 'true',
  'rule', 'straight', 'work',
];

/** Ring 3 — fluency (up to 50 more, 150 cumulative max). */
export const RING_3_IDS = [
  'equal', 'change', 'cause', 'part', 'all', 'more', 'less', 'will', 'mark',
  'justice', 'include', 'exclude',
  'motion', 'point', 'travel', 'journey',
  'lonely', 'proud', 'scared', 'aggression', 'joy', 'depression', 'timid',
  'strong', 'still', 'reach', 'flow', 'metal',
  'form', 'substance', 'source', 'empty', 'surface', 'bound', 'center',
];

const RING_BY_ID = new Map();
for (const id of RING_1_IDS) RING_BY_ID.set(id, 'communicative_core');
for (const id of RING_2_IDS) RING_BY_ID.set(id, 'extended_core');
for (const id of RING_3_IDS) RING_BY_ID.set(id, 'fluent_core');

/** @deprecated use fluent_core */
export const COMPLETE_ONLY = new Set();

/** New primitives to seed when applying rings. */
export const NEW_ROOT_CONCEPTS = [
  { id: 'rule', domain: 'social', description: 'a pattern to follow; how things must be done', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'straight', domain: 'space', description: 'a direct line without bend', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'work', domain: 'action', description: 'effort done toward a goal', priority_class: 'common', language_tier: 'extended_core' },
  { id: 'justice', domain: 'social', description: 'fair treatment; equal rules for all', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'include', domain: 'social', description: 'to bring in as part of a group', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'exclude', domain: 'social', description: 'to keep out of a group', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'motion', domain: 'space', description: 'movement itself; something in motion', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'point', domain: 'space', description: 'a sharp aim or exact spot', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'travel', domain: 'space', description: 'going from one place to another', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'journey', domain: 'space', description: 'the experience of traveling; a path through life', priority_class: 'useful', language_tier: 'fluent_core' },
  { id: 'scared', domain: 'emotion', description: 'feeling afraid; pulled back by fear', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'aggression', domain: 'emotion', description: 'hostile force; attacking energy', priority_class: 'extended', language_tier: 'fluent_core' },
  { id: 'joy', domain: 'emotion', description: 'deep gladness; joyful feeling', priority_class: 'common', language_tier: 'fluent_core' },
  { id: 'depression', domain: 'emotion', description: 'heavy sadness; spirit pressed down', priority_class: 'extended', language_tier: 'fluent_core' },
  { id: 'timid', domain: 'emotion', description: 'shy fear; hesitation from fear', priority_class: 'extended', language_tier: 'fluent_core' },
];

/** @deprecated use NEW_ROOT_CONCEPTS */
export const GAP_FILL_CONCEPTS = [];

const EXPERIENCE_BY_ID = {
  person: 'survival_body', self: 'survival_body', body: 'survival_body', life: 'survival_body',
  eat: 'survival_body', drink: 'survival_body', sleep: 'survival_body', pain: 'survival_body',
  hot: 'survival_body', cold: 'survival_body', see: 'survival_body', hear: 'survival_body',
  speak: 'survival_body', touch: 'survival_body', smell: 'survival_body', taste: 'survival_body',
  hand: 'survival_body', eye: 'survival_body', skin: 'survival_body', bone: 'survival_body',
  head: 'survival_body', heart: 'survival_body', mouth: 'survival_body', need: 'survival_body',
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
  motion: 'space_motion', point: 'space_motion', travel: 'space_motion', journey: 'space_motion',
  straight: 'space_motion',
  give: 'social', take: 'social', help: 'social', collective: 'social', bond: 'social',
  conflict: 'social', parent: 'social', addressee: 'social', name: 'social', mark: 'social',
  child: 'social', rule: 'social', justice: 'social', include: 'social', exclude: 'social',
  love: 'emotion', fear: 'emotion', feel: 'emotion', want: 'emotion', good: 'emotion',
  bad: 'emotion', happy: 'emotion', sad: 'emotion', angry: 'emotion', calm: 'emotion',
  trust: 'emotion', hope: 'emotion', lonely: 'emotion', proud: 'emotion', scared: 'emotion',
  aggression: 'emotion', joy: 'emotion', depression: 'emotion', timid: 'emotion',
  before: 'time', after: 'time', now: 'time', time: 'time',
  know: 'thinking', think: 'thinking', will: 'thinking', understand: 'thinking',
  thing: 'abstract', substance: 'abstract', form: 'abstract', change: 'abstract',
  empty: 'abstract', source: 'abstract', still: 'abstract', strong: 'abstract',
  reach: 'abstract', surface: 'abstract', bound: 'abstract', center: 'abstract',
  equal: 'abstract', true: 'abstract', same: 'abstract', part: 'abstract',
  cause: 'abstract', one: 'abstract', many: 'abstract', all: 'abstract',
  some: 'abstract', more: 'abstract', less: 'abstract', big: 'abstract', small: 'abstract',
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
