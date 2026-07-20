/**
 * Module metadata for Learn progress paths (Fonoran language + Fonora script).
 */

/** @typedef {{ id: string, label: string, description: string, fonoranSkill?: string, fonoraSkill?: string }} DomainModuleMeta */

/** @typedef {{ id: string, label: string, description: string, skillId: string }} ScriptSoundModuleMeta */

/** Lessons per communication domain (words + phrases). */
export const LESSONS_PER_DOMAIN = 5;

/** @type {ScriptSoundModuleMeta[]} */
export const SCRIPT_SOUND_MODULES = [
  {
    id: 'places',
    label: 'Places of articulation',
    skillId: 'script-sounds',
    description:
      'Learn where consonants are formed — lips, teeth, tongue, and throat — using the place glyphs on the Fonora grid.',
  },
  {
    id: 'modifiers',
    label: 'Modifiers',
    skillId: 'script-sounds',
    description:
      'Manner markers that pair with places: voicing, friction, nasal airflow, and other articulation classes.',
  },
  {
    id: 'consonants',
    label: 'Grid consonants',
    skillId: 'script-sounds',
    description:
      'Combine place and manner into full consonant symbols. Decode symbols to sounds and build them from memory.',
  },
  {
    id: 'vowels_simple',
    label: 'Simple vowels',
    skillId: 'script-sounds',
    description:
      'Two-symbol vowel recipes (⚬X) for the core monophthongs — the foundation for reading any Fonora word.',
  },
  {
    id: 'vowels_long',
    label: 'Long vowels & diphthongs',
    skillId: 'script-sounds',
    description:
      'Extended vowels and four-symbol diphthong patterns. Finish the sound inventory before script literacy.',
  },
];

/** @type {Record<string, { description: string, fonoranFocus: string, fonoraFocus: string }>} */
export const DOMAIN_MODULE_COPY = {
  first_contact: {
    description: 'Greetings, names, and establishing who you are when meeting someone new.',
    fonoranFocus: 'Reading & hearing survival phrases for first meetings.',
    fonoraFocus: 'Writing and reading those phrases in Fonora script.',
  },
  immediate_needs: {
    description: 'Food, water, shelter, and urgent requests for help.',
    fonoranFocus: 'Recognise and respond to immediate physical needs.',
    fonoraFocus: 'Transcribe need vocabulary into script from English prompts.',
  },
  pain_injury: {
    description: 'Describing hurt, illness, and asking for medical assistance.',
    fonoranFocus: 'Understand pain and injury vocabulary in context.',
    fonoraFocus: 'Spell injury and health terms in Fonora symbols.',
  },
  fear_danger: {
    description: 'Warning others, expressing fear, and navigating threats.',
    fonoranFocus: 'Parse danger language quickly in listening drills.',
    fonoraFocus: 'Write fear and safety phrases in script.',
  },
  basic_emotion: {
    description: 'Happy, sad, angry, tired — core feelings in simple sentences.',
    fonoranFocus: 'Match emotional vocabulary to English meanings.',
    fonoraFocus: 'Encode emotional states in Fonora script.',
  },
  social_bond: {
    description: 'Friendship, trust, gratitude, and building rapport.',
    fonoranFocus: 'Reading social bonding phrases and particles.',
    fonoraFocus: 'Script literacy for rapport-building language.',
  },
  refusal_boundary: {
    description: 'Saying no, setting limits, and declining politely.',
    fonoranFocus: 'Hear and recognise boundary-setting language.',
    fonoraFocus: 'Write refusals and limits in Fonora script.',
  },
  what_questions: {
    description: 'Asking what something is or what is happening.',
    fonoranFocus: 'Question frames with what-interrogatives.',
    fonoraFocus: 'Script forms for what-questions.',
  },
  who_questions: {
    description: 'Identifying people and asking about identity.',
    fonoranFocus: 'Who-questions in reading and hearing.',
    fonoraFocus: 'Who-question script patterns.',
  },
  where_questions: {
    description: 'Locations, directions to places, and spatial questions.',
    fonoranFocus: 'Spatial and locative question vocabulary.',
    fonoraFocus: 'Where-questions written in script.',
  },
  when_questions: {
    description: 'Time, schedules, and temporal questions.',
    fonoranFocus: 'Temporal question frames and time words.',
    fonoraFocus: 'When-questions in Fonora symbols.',
  },
  direction_motion: {
    description: 'Coming, going, destinations, and verbs of motion.',
    fonoranFocus: 'Motion verbs, bare destinations, and direction concepts (toward/from/away).',
    fonoraFocus: 'Script for direction and movement phrases.',
  },
  possession_trade: {
    description: 'Mine, yours, giving, taking, and simple exchanges.',
    fonoranFocus: 'Possession and trade vocabulary.',
    fonoraFocus: 'Writing possession and exchange in script.',
  },
  food_eating: {
    description: 'Meals, hunger, cooking, and sharing food.',
    fonoranFocus: 'Food vocabulary in phrases and questions.',
    fonoraFocus: 'Food and eating phrases in Fonora script.',
  },
  weather_environment: {
    description: 'Rain, sun, cold, and the world around you.',
    fonoranFocus: 'Environment and weather comprehension.',
    fonoraFocus: 'Weather language transcribed to script.',
  },
  body_health: {
    description: 'Body parts, wellness, and physical state.',
    fonoranFocus: 'Body and health terms in context.',
    fonoraFocus: 'Health vocabulary in Fonora symbols.',
  },
  family_children: {
    description: 'Relatives, parents, children, and home life.',
    fonoranFocus: 'Family terms in reading and listening.',
    fonoraFocus: 'Family phrases written in script.',
  },
  repair_clarify: {
    description: '"I don\'t understand," repeating, and fixing miscommunication.',
    fonoranFocus: 'Repair moves and clarification phrases.',
    fonoraFocus: 'Script for conversational repair.',
  },
  plans_intent: {
    description: 'Future actions, wanting to do something, and intentions.',
    fonoranFocus: 'Intent and plan constructions.',
    fonoraFocus: 'Future and intent phrases in script.',
  },
  closure_gratitude: {
    description: 'Goodbyes, thanks, and ending conversations warmly.',
    fonoranFocus: 'Closing rituals and gratitude expressions.',
    fonoraFocus: 'Warm closures written in Fonora script.',
  },
};

/**
 * @param {string} domainId
 * @param {'fonoran' | 'fonora'} track
 */
export function domainModuleDescription(domainId, track) {
  const copy = DOMAIN_MODULE_COPY[domainId];
  if (!copy) return '';
  const focus = track === 'fonora' ? copy.fonoraFocus : copy.fonoranFocus;
  return `${copy.description} ${focus}`;
}
