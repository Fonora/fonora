/**
 * Synthetic LLM playtests — evaluate seed candidates with fixed personas.
 * LLMs test candidates; they do not invent new compositions.
 *
 * Protocol `puzzle` (default): mirrors Puzzle Conversation — cold spelling + MC,
 * then one repair turn with breakdown. Protocol `revealed` is the legacy decomposition-visible test.
 */

import { completeJson } from './fonoran-llm-client.js';
import {
  PUZZLE_FEEDBACK_TAGS,
  buildMeaningChoices,
  scoreMultipleChoice,
} from './fonoran-playtests.js';
import { PROMPT_VERSION, compositionKey } from './fonoran-llm-aggregate.js';
import { ASSOCIATION_SEEDS } from './fonoran-expression-candidates.js';
import {
  createBuildValidationContext,
  topologicalSortCompounds,
  validateComposition,
} from './fonoran-preferred-select.js';

export { PROMPT_VERSION };

export const DEFAULT_PROTOCOL = 'puzzle';

export const PERSONAS = {
  campfire_stranger: {
    id: 'campfire_stranger',
    label: 'Campfire stranger',
    personaNote:
      'You are a week-one listener at a campfire. You know the roots from earlier study but '
      + 'have never heard this compound before. Guess from the word alone.',
  },
  literal_root_knower: {
    id: 'literal_root_knower',
    label: 'Literal root-knower',
    personaNote:
      'You know Fonoran roots but NOT English names for compounds. Infer meaning from what you hear.',
  },
  skeptical_listener: {
    id: 'skeptical_listener',
    label: 'Skeptical listener',
    personaNote:
      'You penalize vague compounds that feel like lazy glosses rather than lived meanings.',
  },
  cross_lingual: {
    id: 'cross_lingual',
    label: 'Cross-lingual listener',
    personaNote:
      'You normally think in Spanish; Fonoran roots are new. Avoid English idiom when guessing.',
  },
};

const PERSONA_IDS = Object.keys(PERSONAS);

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAnswer(targetGloss, conceptId) {
  return String(targetGloss ?? conceptId?.replace(/_/g, ' ') ?? '').trim();
}

function formatBreakdownLines(breakdown) {
  return (breakdown ?? [])
    .map(part => {
      if (part.atomic?.length) {
        const atoms = part.atomic.map(a => `${a.spelling}="${a.gloss}"`).join(', ');
        return `- ${part.id} (${part.spelling}): ${part.gloss} [${atoms}]`;
      }
      return `- ${part.id} (${part.spelling}): ${part.gloss}`;
    })
    .join('\n');
}

function puzzleSystemMessage() {
  return [
    'You are a listener in a Fonoran Puzzle Conversation playtest.',
    'Pick the meaning you think the speaker intended.',
    '',
    'Respond with JSON only:',
    '{',
    '  "choice": string,  // MUST be exactly one of the listed options',
    '  "confidence": number between 0 and 1,',
    `  "tags": string[] from [${PUZZLE_FEEDBACK_TAGS.map(t => `"${t}"`).join(', ')}],`,
    '  "reasoning": string',
    '}',
    '',
    'Rules:',
    '- "choice" must match one option character-for-character.',
    '- Keep reasoning brief (1-2 sentences).',
  ].join('\n');
}

function revealedSystemMessage() {
  return [
    'You are participating in a Fonoran playtest with full decomposition visible.',
    'Respond with JSON only:',
    '{',
    '  "recovered": boolean,',
    '  "guess": string,',
    '  "confidence": number between 0 and 1,',
    `  "tags": string[] from [${PUZZLE_FEEDBACK_TAGS.map(t => `"${t}"`).join(', ')}],`,
    '  "reasoning": string',
    '}',
  ].join('\n');
}

function formatChoicesList(choices) {
  return choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
}

/** Turn 1 — cold word only, no breakdown (matches human puzzle first view). */
export function buildColdPrompt({
  persona,
  spelling,
  choices,
  phase = 'guess',
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const user = [
    `Persona: ${p.label}`,
    p.personaNote,
    '',
    'A speaker says this Fonoran word:',
    spelling,
    '',
    'What meaning did they intend? Pick exactly one option:',
    formatChoicesList(choices),
    '',
    'You do NOT see the root breakdown yet.',
  ].join('\n');
  return { system: puzzleSystemMessage(), user, phase };
}

/** Turn 2 — repair after wrong MC (matches human puzzle repair turn). */
export function buildRepairPrompt({
  persona,
  spelling,
  composition,
  breakdown,
  choices,
  wrongChoice,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const readable = composition.join(' + ');
  const user = [
    `Persona: ${p.label}`,
    p.personaNote,
    '',
    `You previously guessed "${wrongChoice}" for the Fonoran word:`,
    spelling,
    '',
    'That was not quite right. Here is the literal breakdown — try again.',
    '',
    `Direct composition: ${readable}`,
    'Breakdown:',
    formatBreakdownLines(breakdown),
    '',
    'Pick exactly one meaning:',
    formatChoicesList(choices),
  ].join('\n');
  return { system: puzzleSystemMessage(), user, phase: 'repair' };
}

/** Legacy protocol — full decomposition visible upfront. */
export function buildRevealedPrompt({
  persona,
  conceptId,
  spelling,
  composition,
  rootGlosses,
  breakdown,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const readable = composition.join(' + ');
  const rootLines = (rootGlosses ?? [])
    .map(r => `- ${r.id}: "${r.gloss}" (${r.spelling})`)
    .join('\n');

  const user = [
    `Persona: ${p.label}`,
    p.personaNote,
    '',
    'Known roots:',
    rootLines,
    '',
    'Fonoran expression:',
    `- Spelling: ${spelling}`,
    `- Direct composition: ${readable}`,
    '',
    'Breakdown:',
    formatBreakdownLines(breakdown),
    '',
    'What meaning did the speaker intend?',
    `(Target concept id for scoring only — do not peek: ${conceptId})`,
  ].join('\n');

  return { system: revealedSystemMessage(), user };
}

function parseMcResult(raw, answer, choices) {
  const choice = String(raw?.choice ?? raw?.guess ?? '').trim();
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.filter(t => PUZZLE_FEEDBACK_TAGS.includes(t))
    : [];
  const reasoning = String(raw?.reasoning ?? '').trim();
  const recovered = scoreMultipleChoice(choice, answer, choices);
  return { recovered, guess: choice, confidence, tags, reasoning };
}

function parseRevealedResult(raw, targetGloss, conceptId) {
  const guess = String(raw?.guess ?? '').trim();
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.filter(t => PUZZLE_FEEDBACK_TAGS.includes(t))
    : [];
  const reasoning = String(raw?.reasoning ?? '').trim();
  const llmRecovered = Boolean(raw?.recovered);
  const recovered = llmRecovered && strictGuessMatchesTarget(guess, targetGloss, conceptId);
  return { recovered, guess, confidence, tags, reasoning, llm_recovered: llmRecovered };
}

/** Stricter matching for legacy revealed protocol only. */
export function strictGuessMatchesTarget(guess, targetGloss, conceptId) {
  const g = normalizeText(guess);
  const t = normalizeText(targetGloss);
  const c = normalizeText(conceptId?.replace(/_/g, ' '));
  if (!g) return false;
  if (g === t || g === c) return true;
  if (t.length > 6 && (g.includes(t) || t.includes(g))) return true;
  return false;
}

async function runPuzzleProtocolRound(opts) {
  const {
    persona,
    conceptId,
    targetGloss,
    spelling,
    composition,
    breakdown,
    meaningPool,
    temperature = 0,
  } = opts;

  const answer = resolveAnswer(targetGloss, conceptId);
  const choices = buildMeaningChoices(answer, meaningPool, 4);
  if (choices.length < 2) {
    return { ok: false, error: 'Insufficient meaning choices', persona, composition };
  }

  const cold = buildColdPrompt({ persona, spelling, choices });
  const turn1 = await completeJson({
    system: cold.system,
    user: cold.user,
    temperature,
  });
  if (!turn1.ok) {
    return { ok: false, error: turn1.error, persona, composition };
  }

  const first = parseMcResult(turn1.data, answer, choices);
  if (first.recovered) {
    return {
      ok: true,
      protocol: 'puzzle',
      persona,
      composition,
      ...first,
      repair_turns: 0,
      choices,
      answer,
      api_calls: 1,
      usage: turn1.usage ?? null,
    };
  }

  const repair = buildRepairPrompt({
    persona,
    spelling,
    composition,
    breakdown,
    choices,
    wrongChoice: first.guess || '(no choice)',
  });
  const turn2 = await completeJson({
    system: repair.system,
    user: repair.user,
    temperature,
  });
  if (!turn2.ok) {
    return { ok: false, error: turn2.error, persona, composition };
  }

  const second = parseMcResult(turn2.data, answer, choices);
  return {
    ok: true,
    protocol: 'puzzle',
    persona,
    composition,
    ...second,
    repair_turns: 1,
    first_guess: first.guess,
    choices,
    answer,
    api_calls: 2,
    usage: turn2.usage ?? null,
  };
}

async function runRevealedProtocolRound(opts) {
  const {
    persona,
    conceptId,
    targetGloss,
    spelling,
    composition,
    rootGlosses,
    breakdown,
    temperature = 0,
  } = opts;

  const prompt = buildRevealedPrompt({
    persona,
    conceptId,
    spelling,
    composition,
    rootGlosses,
    breakdown,
  });

  const result = await completeJson({
    system: prompt.system,
    user: prompt.user,
    temperature,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, persona, composition };
  }

  const parsed = parseRevealedResult(result.data, targetGloss, conceptId);
  return {
    ok: true,
    protocol: 'revealed',
    persona,
    composition,
    ...parsed,
    repair_turns: 0,
    api_calls: 1,
    usage: result.usage ?? null,
  };
}

/**
 * Run one persona × one candidate playtest round.
 * @param {object} opts
 * @param {'puzzle'|'revealed'} [opts.protocol]
 * @param {string[]} [opts.meaningPool]  distractor pool for puzzle protocol
 */
export async function runPlaytestRound(opts) {
  const protocol = opts.protocol ?? DEFAULT_PROTOCOL;
  if (protocol === 'revealed') return runRevealedProtocolRound(opts);
  return runPuzzleProtocolRound(opts);
}

function glossForId(id, glossById) {
  return glossById.get(id) ?? id.replace(/_/g, ' ');
}

function buildRootBreakdown(composition, buildCtx, glossById) {
  const parts = [];
  for (const id of composition) {
    const resolved = buildCtx.resolvedById.get(id);
    if (!resolved) continue;
    if (resolved.roots.length === 1) {
      parts.push({
        id,
        spelling: resolved.roots[0],
        gloss: glossForId(id, glossById),
        kind: buildCtx.primitiveIdSet.has(id) ? 'root' : 'compound',
      });
      continue;
    }
    parts.push({
      id,
      spelling: resolved.spelling,
      gloss: glossForId(id, glossById),
      kind: 'compound',
      atomic: resolved.roots.map(spelling => ({ spelling, gloss: spelling })),
    });
  }
  return parts;
}

function normalizeCompoundRow(c) {
  return {
    concept: c.concept,
    composition: c.preferred?.composition ?? c.composition ?? [],
    gloss: c.preferred?.gloss ?? c.gloss ?? '',
    preferred_source: c.preferred_source ?? 'heuristic',
  };
}

export function materializePlaytestTargets(compounds, ctx, options = {}) {
  const rows = compounds.map(normalizeCompoundRow);
  const sorted = topologicalSortCompounds(rows);
  const buildCtx = createBuildValidationContext({
    rootById: ctx.rootById,
    rootSpellings: ctx.rootSpellings,
    primitiveIds: ctx.primitiveIds,
  });
  const glossById = ctx.glossById ?? new Map();
  const conceptFilter = options.conceptFilter ? new Set([].concat(options.conceptFilter)) : null;
  const targets = [];

  for (const row of sorted) {
    if (conceptFilter && !conceptFilter.has(row.concept)) continue;

    for (const prior of sorted) {
      if (prior.concept === row.concept) break;
      const comp = prior.composition;
      if (comp?.length) buildCtx.recordCompound(prior.concept, comp);
    }

    buildCtx.clearCompound(row.concept);

    const seedCandidates = ASSOCIATION_SEEDS[row.concept] ?? [];
    const demoCandidate = ctx.demoTrees?.get?.(row.concept);
    const candidates = demoCandidate
      ? [...seedCandidates, demoCandidate]
      : [...seedCandidates];

    const seen = new Set();
    for (const composition of candidates) {
      const key = compositionKey(composition);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const validation = validateComposition(row.concept, composition, buildCtx);
      if (!validation.valid) continue;

      const rootGlosses = [...buildCtx.primitiveIdSet]
        .map(id => ({
          id,
          spelling: buildCtx.resolvedById.get(id)?.roots?.[0] ?? ctx.rootById[id] ?? id,
          gloss: glossForId(id, glossById),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      const breakdown = buildRootBreakdown(composition, buildCtx, glossById);

      targets.push({
        conceptId: row.concept,
        targetGloss: row.gloss || row.concept.replace(/_/g, ' '),
        composition: [...composition],
        spelling: validation.spelling,
        rootGlosses,
        breakdown,
        flat_count: validation.flat_count,
      });
    }
  }

  return targets;
}

export function allPersonaIds() {
  return [...PERSONA_IDS];
}

export function makeRoundRecord({
  conceptId,
  composition,
  spelling,
  persona,
  result,
  model,
  protocol = DEFAULT_PROTOCOL,
  promptVersion = PROMPT_VERSION,
}) {
  return {
    id: `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    concept_id: conceptId,
    candidate_composition: composition,
    shown_spelling: spelling,
    persona,
    protocol,
    recovered: result.recovered,
    repair_turns: result.repair_turns ?? 0,
    confidence: result.confidence,
    guess: result.guess,
    first_guess: result.first_guess ?? null,
    choices: result.choices ?? null,
    tags: result.tags ?? [],
    reasoning: result.reasoning ?? '',
    source: 'llm_playtest',
    prompt_version: promptVersion,
    model,
  };
}
