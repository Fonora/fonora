/**
 * Experience tiers and the campfire test — the human-experience organization of Fonoran.
 *
 * See docs/fonoran-constitution.md. Roots are organized by how a person experiences the
 * world (not by linguistic category), and gated by the campfire test:
 *
 *   "Two strangers stranded with no common language — could this root realistically come
 *    up during their first week of interaction?"  Yes → communicative core. No → extended.
 *
 * The language grows in three rings:
 *   communicative_core  (~50 roots)  the experiment: how far can two people get with 50?
 *   extended_core       (~100 roots) everyday fluency
 *   complete            (unlimited)  specialized / abstract vocabulary
 *
 * This module is the single source of truth. The migration script and the runtime concept
 * inventory both read from here so the metadata never drifts.
 */

export const EXPERIENCE_TIERS = [
  'survival_body',
  'space_motion',
  'social',
  'emotion',
  'time',
  'thinking',
  'abstract',
];

export const LANGUAGE_TIERS = ['communicative_core', 'extended_core', 'complete'];

export const EXPERIENCE_TIER_LABELS = {
  survival_body: 'Survival & body',
  space_motion: 'Space & motion',
  social: 'Social',
  emotion: 'Emotion',
  time: 'Time',
  thinking: 'Thinking',
  abstract: 'Abstract',
};

export const LANGUAGE_TIER_LABELS = {
  communicative_core: 'Communicative core',
  extended_core: 'Extended core',
  complete: 'Complete language',
};

/** concept id → experience tier (how a person experiences it, not its grammar class). */
const EXPERIENCE_BY_ID = {
  // Survival & body
  person: 'survival_body', self: 'survival_body', body: 'survival_body', life: 'survival_body',
  eat: 'survival_body', drink: 'survival_body', sleep: 'survival_body', pain: 'survival_body',
  hot: 'survival_body', cold: 'survival_body', see: 'survival_body', hear: 'survival_body',
  speak: 'survival_body', touch: 'survival_body', smell: 'survival_body', taste: 'survival_body',
  hand: 'survival_body', eye: 'survival_body', skin: 'survival_body', bone: 'survival_body',
  head: 'survival_body', heart: 'survival_body', mouth: 'survival_body', need: 'survival_body',
  hold: 'survival_body', do: 'survival_body', make: 'survival_body', use: 'survival_body',

  // Space & motion
  move: 'space_motion', up: 'space_motion', down: 'space_motion', inside: 'space_motion',
  outside: 'space_motion', near: 'space_motion', far: 'space_motion', left: 'space_motion',
  right: 'space_motion', here: 'space_motion', there: 'space_motion', path: 'space_motion',
  place: 'space_motion', water: 'space_motion', fire: 'space_motion', earth: 'space_motion',
  air: 'space_motion', sky: 'space_motion', light: 'space_motion', dark: 'space_motion',
  stone: 'space_motion', plant: 'space_motion', tree: 'space_motion', animal: 'space_motion',
  metal: 'space_motion', fast: 'space_motion', flow: 'space_motion', wave: 'space_motion',

  // Social
  give: 'social', take: 'social', help: 'social', collective: 'social', bond: 'social',
  conflict: 'social', parent: 'social', addressee: 'social', name: 'social', mark: 'social',

  // Emotion
  love: 'emotion', fear: 'emotion', feel: 'emotion', want: 'emotion', good: 'emotion',
  bad: 'emotion', happy: 'emotion', sad: 'emotion', angry: 'emotion', calm: 'emotion',
  trust: 'emotion', hope: 'emotion', lonely: 'emotion', proud: 'emotion',

  // Time
  before: 'time', after: 'time', now: 'time', time: 'time',

  // Thinking
  know: 'thinking', think: 'thinking', will: 'thinking',

  // Abstract (admitted last)
  thing: 'abstract', substance: 'abstract', form: 'abstract', change: 'abstract',
  empty: 'abstract', source: 'abstract', pulse: 'abstract', still: 'abstract',
  strong: 'abstract', reach: 'abstract', surface: 'abstract', bound: 'abstract',
  center: 'abstract', equal: 'abstract', true: 'abstract', same: 'abstract',
  part: 'abstract', cause: 'abstract', one: 'abstract', many: 'abstract', all: 'abstract',
  some: 'abstract', more: 'abstract', less: 'abstract',
};

/**
 * The communicative core (~50): the roots two strangers most plausibly reach for in
 * week one. This is the set the "50-root challenge" measures.
 */
const COMMUNICATIVE_CORE = new Set([
  // survival & body
  'person', 'self', 'body', 'eat', 'drink', 'sleep', 'pain', 'hot', 'cold', 'see', 'hear',
  'speak', 'hand', 'eye', 'mouth',
  // space & motion
  'move', 'up', 'down', 'inside', 'outside', 'near', 'far', 'left', 'right', 'water', 'fire',
  'earth', 'sky', 'tree', 'animal',
  // social
  'give', 'take', 'help', 'collective',
  // emotion
  'love', 'fear', 'feel', 'want', 'good', 'bad', 'happy', 'angry', 'calm', 'trust', 'hope',
  // time
  'before', 'after', 'now',
  // thinking
  'know', 'think',
]);

/**
 * Concepts that fail the campfire test: abstract or computational ideas nobody needs in a
 * first week of survival communication. They stay in the language (complete ring) but are
 * not part of the core. The user explicitly flagged signal/pulse/transfer-style concepts.
 */
const COMPLETE_ONLY = new Set([
  'pulse', 'wave', 'flow', 'source', 'substance', 'form', 'will', 'cause', 'equal', 'mark',
  'reach', 'still', 'strong', 'same', 'part', 'surface', 'bound', 'center', 'change', 'empty',
  'true', 'thing',
]);

const CAMPFIRE_REASONS = {
  communicative_core: 'Two strangers would plausibly need this in their first week.',
  extended_core: 'Useful for everyday fluency, but not first-week survival.',
  complete: 'Abstract or specialized; not something strangers reach for early.',
};

export function experienceTierFor(id) {
  return EXPERIENCE_BY_ID[id] ?? 'abstract';
}

export function languageTierFor(id) {
  if (COMMUNICATIVE_CORE.has(id)) return 'communicative_core';
  if (COMPLETE_ONLY.has(id)) return 'complete';
  return 'extended_core';
}

/**
 * Full experience metadata for a concept id.
 * @returns {{ experience_tier: string, language_tier: string, campfire: { pass: boolean, reason: string } }}
 */
export function experienceMetaFor(id) {
  const language_tier = languageTierFor(id);
  const pass = language_tier !== 'complete';
  return {
    experience_tier: experienceTierFor(id),
    language_tier,
    campfire: { pass, reason: CAMPFIRE_REASONS[language_tier] },
  };
}

/**
 * New concepts added to fill emotion / social / body / space gaps in the communicative
 * core (the inventory previously underweighted emotion especially). The build assigns
 * each a CV/CVC spelling automatically; humans approve in Review.
 */
export const GAP_FILL_CONCEPTS = [
  { id: 'drink', domain: 'action', description: 'to drink', priority_class: 'essential' },
  { id: 'sky', domain: 'element', description: 'the sky above', priority_class: 'common' },
  { id: 'tree', domain: 'element', description: 'a tree', priority_class: 'common' },
  { id: 'left', domain: 'space', description: 'the left side', priority_class: 'common' },
  { id: 'right', domain: 'space', description: 'the right side', priority_class: 'common' },
  { id: 'happy', domain: 'emotion', description: 'feeling glad and content', priority_class: 'essential' },
  { id: 'angry', domain: 'emotion', description: 'feeling mad or hostile', priority_class: 'common' },
  { id: 'calm', domain: 'emotion', description: 'feeling settled and at peace', priority_class: 'common' },
  { id: 'trust', domain: 'emotion', description: 'to believe someone is safe and reliable', priority_class: 'common' },
  { id: 'hope', domain: 'emotion', description: 'to wish and expect something good', priority_class: 'common' },
];

/** Build a full inventory primitive record for a gap-fill concept. */
export function gapFillPrimitive(def) {
  const meta = experienceMetaFor(def.id);
  return {
    id: def.id,
    domain: def.domain,
    description: def.description,
    priority_class: def.priority_class,
    suggested_status: 'primitive',
    plain_description: def.description,
    experience_tier: meta.experience_tier,
    language_tier: meta.language_tier,
    campfire_pass: meta.campfire.pass,
    campfire_reason: meta.campfire.reason,
  };
}
