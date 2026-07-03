/**
 * v3 Compositional Intuition Battery — Tasks A/B/C (no multiple choice).
 * Produces weights for candidate ranking, not MC gloss matching.
 */

import { completeJson } from './fonoran-llm-client.js';
import { PUZZLE_FEEDBACK_TAGS } from './fonoran-playtests.js';
import { PROMPT_VERSION, compositionKey } from './fonoran-llm-aggregate.js';
import {
  materializePlaytestTargets,
  allPersonaIds,
} from './fonoran-llm-playtest.js';

export { PROMPT_VERSION, materializePlaytestTargets, allPersonaIds, compositionKey };

export const BATTERY_VERSION = 'cib-v3';
export const DEFAULT_TASKS = ['A', 'B'];

export const CALIBRATION_CONCEPTS = [
  'tool', 'weapon', 'war', 'tribe', 'community',
  'knowledge', 'exchange', 'memory', 'language', 'teacher',
];

/** Small-scale smoke set before full calibration. */
export const PILOT_CONCEPTS = ['tool', 'weapon', 'tribe'];

const CONCEPT_SYNONYMS = {
  tool: ['tool', 'useful thing', 'implement', 'instrument', 'useful thing for the hand', 'a tool'],
  weapon: ['weapon', 'tool for conflict', 'arm', 'arms', 'fighting tool'],
  war: ['war', 'warfare', 'battle', 'conflict between tribes', 'fighting between groups'],
  tribe: ['tribe', 'clan', 'people group', 'community with shared identity'],
  community: ['community', 'group of people', 'collective of persons'],
  knowledge: ['knowledge', 'knowing', 'what is known'],
  exchange: ['exchange', 'trade', 'giving and taking'],
  memory: ['memory', 'remembering', 'what is remembered'],
  language: ['language', 'speech', 'shared words'],
  teacher: ['teacher', 'one who teaches', 'person who teaches'],

  // --- vocabulary remediation: new primitives + retired-to-compound + gap concepts ---
  food: ['food', 'something to eat', 'meal', 'nourishment', 'a thing to eat'],
  sick: ['sick', 'ill', 'illness', 'unwell', 'disease', 'not healthy'],
  understand: ['understand', 'understanding', 'comprehend', 'grasp', 'get the meaning'],
  child: ['child', 'kid', 'young person', 'young one', 'offspring', 'small person'],
  wait: ['wait', 'waiting', 'stay', 'pause', 'hold on', 'stay until later'],
  pulse: ['pulse', 'beat', 'beating', 'heartbeat', 'rhythm', 'throb'],
  wave: ['wave', 'moving water', 'ripple', 'swell', 'surge'],
  flow: ['flow', 'flowing', 'current', 'stream', 'water moving'],
  source: ['source', 'origin', 'beginning', 'where it begins', 'start'],
  substance: ['substance', 'material', 'matter', 'what it is made of', 'stuff'],
  form: ['form', 'shape', 'outward shape', 'outline', 'figure'],
  will: ['will', 'intention', 'wanting', 'resolve', 'determination', 'future want'],
  cause: ['cause', 'reason', 'what makes it happen', 'origin of the event'],
  equal: ['equal', 'same amount', 'equality', 'even', 'the same'],
  mark: ['mark', 'sign', 'label', 'symbol', 'name on a thing'],
  reach: ['reach', 'reaching', 'extend', 'stretch to', 'extend the hand'],
  strong: ['strong', 'powerful', 'strength', 'mighty', 'powerful body'],
  part: ['part', 'piece', 'portion', 'a piece of', 'component'],
  change: ['change', 'becoming different', 'transform', 'alter', 'not the same'],
  come: ['come', 'coming', 'move here', 'approach', 'come here'],
  later: ['later', 'after now', 'afterward', 'in a while', 'soon after'],
  own: ['own', 'mine', 'possess', "one's own", 'belong to'],
  safe: ['safe', 'safety', 'secure', 'no danger', 'protected'],
};

export const PERSONAS = {
  campfire_stranger: {
    id: 'campfire_stranger',
    label: 'Campfire stranger',
    systemExtra:
      'You are a week-one listener. You forgive opaque spellings if the meaning still feels guessable.',
  },
  literal_root_knower: {
    id: 'literal_root_knower',
    label: 'Literal root-knower',
    systemExtra:
      'You derive meaning ONLY from the roots listed. Do not assume English compound names.',
  },
  skeptical_listener: {
    id: 'skeptical_listener',
    label: 'Skeptical listener',
    systemExtra:
      'You penalize vague "thing + X" compounds. Rate vagueness honestly; lazy glosses score high vagueness.',
  },
  cross_lingual: {
    id: 'cross_lingual',
    label: 'Cross-lingual listener',
    systemExtra:
      'You normally think in Spanish. Avoid English-only idioms when inferring meaning.',
  },
};

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function tokenOverlap(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function inConceptSynonyms(guess, conceptId) {
  const g = normalizeText(guess);
  const group = (CONCEPT_SYNONYMS[conceptId] ?? [conceptId.replace(/_/g, ' ')]).map(normalizeText);
  return group.some(s => g === s || g.includes(s) || s.includes(g));
}

/** Strict v3 meaning match — ignores model would_understand unless text matches. */
export function strictMeaningMatch(inferred, targetGloss, conceptId) {
  const g = normalizeText(inferred);
  const t = normalizeText(targetGloss);
  const c = normalizeText(conceptId?.replace(/_/g, ' '));
  if (!g) return false;
  if (g === t || g === c) return true;
  if (tokenOverlap(g, t) >= 0.6 || tokenOverlap(g, c) >= 0.6) return true;
  if (inConceptSynonyms(g, conceptId)) return true;
  return false;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function personaSystem(persona, task) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const lengthGuidance = task === 'B'
    ? '\nPrefer short, campfire-sayable compounds (2–3 roots). Penalize chains above 3 flattened roots — tag too_long when a construction feels padded for semantic completeness rather than communicative efficiency.'
    : '';
  return [
    'You evaluate Fonoran compound communicative intuition.',
    p.systemExtra,
    lengthGuidance,
    '',
    `Task ${task}. Respond with JSON only. Use tags from: ${PUZZLE_FEEDBACK_TAGS.join(', ')}.`,
    'Keep reasoning to 1-2 sentences.',
  ].join('\n');
}

function formatPrimitiveGlossary(primitiveGlosses) {
  return (primitiveGlosses ?? [])
    .map(r => `- ${r.id}: "${r.gloss}" (${r.spelling})`)
    .join('\n');
}

function formatCompositionReadable(composition, glossById) {
  return composition.map(id => `${id.replace(/_/g, ' ')} (${glossById.get(id) ?? id})`).join(' + ');
}

export function buildTaskAPrompt({ persona, spelling, primitiveGlosses }) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  return {
    system: personaSystem(persona, 'A'),
    user: [
      `Persona: ${p.label}`,
      '',
      'Primitive roots you know (no compound vocabulary):',
      formatPrimitiveGlossary(primitiveGlosses),
      '',
      'A speaker says this Fonoran word (you do NOT see how it is composed):',
      spelling,
      '',
      'What do you think they mean?',
      '',
      'JSON: { "inferred_meaning": string, "confidence": 0-1, "would_understand": boolean, "tags": [], "reasoning": string }',
    ].join('\n'),
  };
}

export function buildTaskBPrompt({
  persona,
  targetGloss,
  composition,
  compositionReadable,
  primitiveGlosses,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  return {
    system: personaSystem(persona, 'B'),
    user: [
      `Persona: ${p.label}`,
      '',
      'Primitive roots you know:',
      formatPrimitiveGlossary(primitiveGlosses),
      '',
      `The speaker wants to express: "${targetGloss}"`,
      `They build it as: ${compositionReadable}`,
      `(composition ids: ${composition.join(' + ')})`,
      '',
      'How naturally does this construction express that meaning?',
      '',
      'JSON: { "inferred_meaning": string, "naturalness": 0-1, "vagueness": 0-1, "would_use_this": boolean, "tags": [], "reasoning": string }',
    ].join('\n'),
  };
}

export function buildTaskCPrompt({
  persona,
  targetGloss,
  candidateA,
  candidateB,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const fmt = (label, c) => [
    `${label}: spelling "${c.spelling}"`,
    `   composition: ${c.composition.join(' + ')}`,
  ].join('\n');

  return {
    system: personaSystem(persona, 'C'),
    user: [
      `Persona: ${p.label}`,
      '',
      `The speaker wants to express: "${targetGloss}"`,
      '',
      'Which expression would a root-knower understand more easily?',
      fmt('A', candidateA),
      fmt('B', candidateB),
      '',
      'JSON: { "preferred": "A" | "B", "margin": 0-1, "reasoning": string }',
    ].join('\n'),
  };
}

function parseTags(raw) {
  return Array.isArray(raw?.tags)
    ? raw.tags.filter(t => PUZZLE_FEEDBACK_TAGS.includes(t))
    : [];
}

export async function runTaskA(opts) {
  const { persona, conceptId, targetGloss, spelling, primitiveGlosses, temperature = 0.2 } = opts;
  const prompt = buildTaskAPrompt({ persona, spelling, primitiveGlosses });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature });
  if (!result.ok) return { ok: false, error: result.error, task: 'A', persona };

  const inferred = String(result.data?.inferred_meaning ?? '').trim();
  const recovered = strictMeaningMatch(inferred, targetGloss, conceptId);
  return {
    ok: true,
    task: 'A',
    persona,
    inferred_meaning: inferred,
    recovered,
    confidence: clamp01(result.data?.confidence),
    tags: parseTags(result.data),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
  };
}

export async function runTaskB(opts) {
  const {
    persona,
    conceptId,
    targetGloss,
    composition,
    glossById,
    primitiveGlosses,
    temperature = 0.2,
  } = opts;
  const compositionReadable = formatCompositionReadable(composition, glossById);
  const prompt = buildTaskBPrompt({
    persona,
    targetGloss,
    composition,
    compositionReadable,
    primitiveGlosses,
  });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature });
  if (!result.ok) return { ok: false, error: result.error, task: 'B', persona };

  const inferred = String(result.data?.inferred_meaning ?? '').trim();
  const composition_recovery = strictMeaningMatch(inferred, targetGloss, conceptId);
  return {
    ok: true,
    task: 'B',
    persona,
    inferred_meaning: inferred,
    composition_recovery,
    naturalness: clamp01(result.data?.naturalness),
    vagueness: clamp01(result.data?.vagueness),
    tags: parseTags(result.data),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
  };
}

export async function runTaskC(opts) {
  const { persona, targetGloss, candidateA, candidateB, temperature = 0.2 } = opts;
  const prompt = buildTaskCPrompt({ persona, targetGloss, candidateA, candidateB });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature });
  if (!result.ok) return { ok: false, error: result.error, task: 'C', persona };

  const pref = String(result.data?.preferred ?? '').trim().toUpperCase();
  const preferredKey = pref === 'A' ? compositionKey(candidateA.composition)
    : pref === 'B' ? compositionKey(candidateB.composition) : null;

  return {
    ok: true,
    task: 'C',
    persona,
    preferred: pref === 'A' || pref === 'B' ? pref : null,
    preferred_key: preferredKey,
    margin: clamp01(result.data?.margin),
    pair: [compositionKey(candidateA.composition), compositionKey(candidateB.composition)].sort().join('|vs|'),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
  };
}

export function primitiveGlossary(rootGlosses, primitiveIds) {
  const prim = new Set(primitiveIds ?? []);
  return (rootGlosses ?? []).filter(r => prim.has(r.id));
}

export function allCandidatePairs(targetsForConcept) {
  const pairs = [];
  for (let i = 0; i < targetsForConcept.length; i++) {
    for (let j = i + 1; j < targetsForConcept.length; j++) {
      pairs.push([targetsForConcept[i], targetsForConcept[j]]);
    }
  }
  return pairs;
}

export function intuitionResumeKey({
  conceptId,
  composition,
  persona,
  task,
  pair = null,
  promptVersion = PROMPT_VERSION,
}) {
  const compPart = task === 'C' && pair ? `pair:${pair}` : compositionKey(composition);
  return [conceptId, compPart, persona, task, promptVersion].join('|');
}

export function makeIntuitionRoundRecord({
  conceptId,
  composition,
  spelling,
  persona,
  task,
  result,
  model,
  pair = null,
}) {
  const base = {
    id: `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    concept_id: conceptId,
    candidate_composition: composition ?? null,
    shown_spelling: spelling ?? null,
    persona,
    task,
    pair: pair ?? null,
    source: 'llm_intuition',
    prompt_version: PROMPT_VERSION,
    battery: BATTERY_VERSION,
    model,
    tags: result.tags ?? [],
    reasoning: result.reasoning ?? '',
  };

  if (task === 'A') {
    return {
      ...base,
      inferred_meaning: result.inferred_meaning,
      recovered: result.recovered,
      confidence: result.confidence,
    };
  }
  if (task === 'B') {
    return {
      ...base,
      inferred_meaning: result.inferred_meaning,
      composition_recovery: result.composition_recovery,
      naturalness: result.naturalness,
      vagueness: result.vagueness,
    };
  }
  return {
    ...base,
    preferred: result.preferred,
    preferred_key: result.preferred_key,
    margin: result.margin,
    pair: result.pair,
  };
}
