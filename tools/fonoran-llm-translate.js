/**
 * Multilingual LLM semantic compiler: any language → concept frame → Fonoran surface.
 * Uses approved dictionary + grammar; never invents spellings.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  completeJson,
  anthropicTranslatorConfigured,
  anthropicModel,
  ANTHROPIC_TRANSLATOR_API_KEY_ENV,
} from './fonoran-llm-client.js';
import { buildResolveContext } from './fonoran-english-resolve.js';
import { translateFromFrame, translateEnglishLegacy } from './fonoran-translator.js';
import { attachTranslatorPlayback } from './fonoran-playback-build.js';
import { getParticleRuntime } from './fonoran-particles.js';
import {
  cacheKey,
  lookupCachedTranslation,
  writeCachedTranslation,
} from './fonoran-translation-cache.js';
import {
  buildLlmGrammarBrief,
  normalizeFrameParticles,
  checkLlmGrammarViolations,
  stripExistentialThereFromFrame,
} from './fonoran-llm-grammar-brief.js';
import {
  normalizeWePrimaryFrame,
  attachTranslateAlternates,
} from './fonoran-translate-alternates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAMMAR_PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

const FEW_SHOT_SEEDS = [
  'Hello.',
  'I am a person.',
  'The tribe is at war.',
  'All men are created equal.',
  'I feel afraid right now.',
  'What is your name?',
  'Please do not run away.',
  'Are you hurt?',
  'I do not understand your words.',
  'You are safe here.',
  'Are there other people near you?',
  'Who is near you?',
  'I will not hurt you.',
  'Are you alone?',
  'We can help each other.',
  'The bird is above the tree.',
  'I loved them.',
  'Run toward the river.',
];

let promptContextCache = null;
let fewShotCache = null;

function normalizeSourceLang(sourceLang) {
  const lang = String(sourceLang ?? 'auto').trim().toLowerCase();
  return lang || 'auto';
}

/** Compact concept list for the LLM prompt (approved lab entries only). */
async function buildConceptInventoryBlock(lab) {
  const ctx = await buildResolveContext(lab);
  const lines = [];

  for (const [conceptId, spec] of ctx.rootById.entries()) {
    if (!spec?.root) continue;
    lines.push(`${conceptId}: ${spec.gloss ?? conceptId} → ${spec.root}`);
  }
  for (const [conceptId, compound] of ctx.compoundByConceptId.entries()) {
    lines.push(`${conceptId}: ${compound.gloss ?? conceptId} → ${compound.spelling}`);
  }

  return lines.sort((a, b) => a.localeCompare(b)).join('\n');
}

async function buildFewShotExamples(lab) {
  if (fewShotCache) return fewShotCache;
  const examples = [];
  for (const phrase of FEW_SHOT_SEEDS) {
    const legacy = await translateEnglishLegacy(phrase, { lab });
    if (!legacy.surface?.roman) continue;
    examples.push({
      en: phrase,
      roman: legacy.surface.roman,
      slots: summarizeSlotsFromTokens(legacy.tokens ?? []),
    });
  }
  fewShotCache = examples
    .map(ex => `Source (${ex.en}):\n  roman: ${ex.roman}\n  slots: ${JSON.stringify(ex.slots)}`)
    .join('\n\n');
  return fewShotCache;
}

function summarizeSlotsFromTokens(tokens) {
  const slots = { subject: [], event: [], object: [], path: [], time: [], modifiers: [] };
  const roleMap = {
    subject: 'subject',
    event: 'event',
    object: 'object',
    path: 'path',
    time: 'time',
    modifier: 'modifiers',
    concept: 'event',
  };
  for (const t of tokens) {
    if (!t.resolved) continue;
    const bucket = roleMap[t.role] ?? 'modifiers';
    if (t.kind === 'particle') {
      slots[bucket].push(t.fonoran);
    } else if (t.concept_id) {
      slots[bucket].push(t.concept_id);
    }
  }
  return slots;
}

const WH_COMPOSITION_PREFIXES = [
  ['no', 'know', 'person'],
  ['no', 'know', 'thing'],
  ['no', 'know', 'place'],
  ['no', 'know', 'time'],
  ['neg', 'know', 'person'],
  ['neg', 'know', 'thing'],
  ['neg', 'know', 'place'],
  ['neg', 'know', 'time'],
];

/** True when source text is a content question (who/what/where/when). */
export function hasWhContentWord(text) {
  return /\b(who|whom|what|where|when)\b/i.test(String(text ?? ''));
}

/** True when any slot opens with a WH-composition prefix. */
export function frameUsesWhComposition(frame) {
  const slots = frame?.slots ?? {};
  for (const items of Object.values(slots)) {
    if (!Array.isArray(items)) continue;
    const ids = items.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
    for (const pattern of WH_COMPOSITION_PREFIXES) {
      if (ids.length >= pattern.length && pattern.every((p, i) => ids[i] === p || (p === 'neg' && ids[i] === 'no'))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Repair LLM frames that violate fonoran-grammar.md (WH on yes/no, etc.).
 * Falls back to rule-based slot mapping from translateEnglishLegacy.
 */
async function repairFromLegacySlots(frame, sourceText, lab, reason) {
  const text = String(sourceText ?? '').trim();
  const legacyInput = frame?.is_question && !text.endsWith('?') ? `${text}?` : text;
  const legacy = await translateEnglishLegacy(legacyInput, { lab });

  return {
    ...frame,
    slots: summarizeSlotsFromTokens(legacy.tokens ?? []),
    unresolved: [...new Set([...(frame.unresolved ?? []), ...(legacy.unresolved ?? [])])],
    reasoning: [
      frame.reasoning,
      `[Grammar repair] ${reason} → rule-based slots (${legacy.surface?.roman ?? ''}).`,
    ].filter(Boolean).join(' '),
    _repaired_from: 'legacy_slots',
  };
}

export async function repairLlmFrame(frame, sourceText, lab = null) {
  let normalized = normalizeWePrimaryFrame(
    stripExistentialThereFromFrame(
      normalizeFrameParticles(frame),
      sourceText,
    ),
    sourceText,
  );
  const grammar = checkLlmGrammarViolations(normalized, sourceText);

  const whMisuse = normalized?.is_question
    && !hasWhContentWord(sourceText)
    && frameUsesWhComposition(normalized);

  const removedParticle = grammar.violations.some(v => v.kind === 'removed_particle');

  if (whMisuse) {
    return repairFromLegacySlots(
      normalized,
      sourceText,
      lab,
      'Yes/no question must not use WH composition (Rule 3)',
    );
  }

  if (removedParticle) {
    return repairFromLegacySlots(
      normalized,
      sourceText,
      lab,
      'Removed v1 particle in frame (Rule 3)',
    );
  }

  return normalized;
}

async function finalizeWithAlternates(result, frame, input, options) {
  if (!result || result.error || !frame) return result;
  return attachTranslateAlternates(result, frame, {
    lab: options.lab,
    input,
    sourceLang: result.detected_lang ?? frame.detected_lang ?? options.sourceLang,
  });
}

async function loadGrammarSummary(particlesDoc) {
  return buildLlmGrammarBrief(particlesDoc);
}

async function buildPromptContext(lab) {
  if (promptContextCache) return promptContextCache;
  const particlesRaw = await readFile(GRAMMAR_PARTICLES_PATH, 'utf8').catch(() => '{}');
  const particlesDoc = JSON.parse(particlesRaw);
  const [grammar, concepts, fewShot] = await Promise.all([
    loadGrammarSummary(particlesDoc),
    buildConceptInventoryBlock(lab),
    buildFewShotExamples(lab),
  ]);
  const particleLines = (particlesDoc.particles ?? [])
    .filter(p => p.form)
    .map(p => `${p.form} (${p.id}): ${p.gloss}`)
    .join('\n');

  promptContextCache = { grammar, particleLines, concepts, fewShot, particlesDoc };
  return promptContextCache;
}

export function resetLlmTranslateCache() {
  promptContextCache = null;
  fewShotCache = null;
}

const SYSTEM_PROMPT = `You are the Fonoran semantic compiler defined in docs/fonoran-grammar.md (Rule 7).
Map source text in ANY language into a language-neutral concept frame using ONLY approved concept ids and the six v1 grammar particles.

Output JSON only with this schema:
{
  "slots": {
    "subject": [],
    "event": [],
    "object": [],
    "path": [],
    "time": [],
    "modifiers": []
  },
  "is_question": false,
  "detected_lang": "en",
  "unresolved": [],
  "reasoning": "one sentence citing which grammar rules you applied"
}

Slot semantics (Rule 4 / Rule 7):
- subject = Actor
- event = Action (event, state, or predicate concept)
- object = Target
- path = Place (spatial/motion/locative concepts — lexical, never English prepositions)
- time = Time (ta past, sa future, or time concepts; EMPTY for present)
- modifiers = peripheral modifiers (modifier-before-head chains)

Mandatory rules:
- Compile MEANING, not word-for-word English (Rule 7).
- Particles ONLY: mi, ta, sa, no, ya, von — map neg→no (Rule 3).
- Present tense: leave time slot empty (Rule 3).
- Spatial/relational: lexical concepts (inside, here, there, near, path, source, up, down…) — NOT particles.
- Questions: no question particle; is_question true; WH composition ONLY for who/what/where/when in source (Rule 3).
- Yes/no and existential questions: NO WH composition — state entities/relations directly.
- Existential "Are there…" / "There are…": English dummy there is meaningless — do NOT emit concept there (tak). Compile only the entities/relations (e.g. other + people + near + addressee).
- Deictic there (tak) only when pointing at a place ("over there", "put it there").
- we/us: default subject collective (dan). Use mi + addressee only when source explicitly signals a dyad (each other, you and I, both of us) — never from topic or urgency alone.
- Why/how: not expressible in v1 — put in unresolved[], do not guess.
- Never invent concept ids; honest gaps in unresolved[] (Design Rule 0).`;

/**
 * Ask LLM for a concept frame.
 * @param {string} text
 * @param {{ sourceLang?: string, lab?: object }} options
 */
export function translatorLlmConfigured() {
  return anthropicTranslatorConfigured();
}

export async function compileFrameViaLlm(text, options = {}) {
  if (!anthropicTranslatorConfigured()) {
    return { ok: false, error: `${ANTHROPIC_TRANSLATOR_API_KEY_ENV} not set` };
  }

  const sourceLang = normalizeSourceLang(options.sourceLang);
  const ctx = await buildPromptContext(options.lab);
  const langHint = sourceLang === 'auto'
    ? 'Detect the source language and set detected_lang.'
    : `Source language code: ${sourceLang}. Set detected_lang to "${sourceLang}".`;

  const user = `${ctx.grammar}

Particles:
${ctx.particleLines}

Concept inventory (id: gloss → spelling):
${ctx.concepts}

Examples (English source → frame):
${ctx.fewShot}

${langHint}

Source text:
"""
${String(text ?? '').trim()}
"""

Return the JSON frame.`;

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0,
    maxTokens: 1024,
    apiKeyEnv: ANTHROPIC_TRANSLATOR_API_KEY_ENV,
  });

  if (!result.ok) return result;
  return { ok: true, frame: normalizeFrameParticles(result.data), raw: result.raw, model: anthropicModel() };
}

/** Validate LLM frame concept ids, particles, and grammar rules from fonoran-grammar.md. */
export async function validateLlmFrame(frame, lab = null, sourceText = '') {
  const ctx = await buildResolveContext(lab);
  const particles = await getParticleRuntime();
  const allowedParticles = new Set(['mi', 'ta', 'sa', 'no', 'ya', 'von']);
  for (const p of particles.data?.particles ?? []) {
    if (p.form) allowedParticles.add(p.form);
  }

  const unknown = [];
  const slots = frame?.slots ?? {};
  for (const [role, items] of Object.entries(slots)) {
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const id = String(raw ?? '').trim().toLowerCase();
      if (!id) continue;
      if (id === 'neg') continue;
      if (allowedParticles.has(id)) continue;
      if (ctx.rootById.has(id) || ctx.compoundByConceptId.has(id)) continue;
      if (ctx.spellingByConceptId?.has(id)) continue;
      unknown.push({ role, id });
    }
  }

  const grammar = checkLlmGrammarViolations(frame, sourceText);

  return {
    valid: unknown.length === 0 && !(frame?.unresolved?.length) && grammar.violations.length === 0,
    unknownConcepts: unknown,
    grammarViolations: grammar.violations,
  };
}

/**
 * Translate via LLM concept frame (+ cache).
 * @param {string} text
 * @param {{ sourceLang?: string, lab?: object, skipCache?: boolean }} options
 */
export async function translateViaLlm(text, options = {}) {
  const input = String(text ?? '').trim();
  const sourceLang = normalizeSourceLang(options.sourceLang);

  if (!input) {
    return {
      input: '',
      mode: 'empty',
      tokens: [],
      surface: { roman: '', parts: [], pronunciation: { sayLine: '', englishLine: '' } },
      semantic: null,
      frame: null,
      interpretations: [],
      unresolved: [],
      engine: 'llm',
    };
  }

  if (!options.skipCache) {
    const cached = await lookupCachedTranslation(sourceLang, input);
    if (cached?.frame) {
      const frame = await repairLlmFrame(cached.frame, input, options.lab);
      const refreshed = await translateFromFrame(frame, {
        lab: options.lab,
        input,
        sourceLang: cached.result?.detected_lang ?? cached.frame.detected_lang ?? sourceLang,
      });
      return finalizeWithAlternates({
        ...(cached.result ?? {}),
        ...refreshed,
        engine: 'cached',
        cache_key: cacheKey(sourceLang, input),
        reasoning: cached.result?.reasoning ?? cached.frame.reasoning ?? null,
        detected_lang: cached.result?.detected_lang ?? cached.frame.detected_lang ?? sourceLang,
        llm_frame: frame,
      }, frame, input, options);
    }
    if (cached?.result) {
      const frame = cached.frame
        ? await repairLlmFrame(cached.frame, input, options.lab)
        : null;
      const withPlayback = frame
        ? await translateFromFrame(frame, {
          lab: options.lab,
          input,
          sourceLang: cached.result?.detected_lang ?? cached.frame.detected_lang ?? sourceLang,
        })
        : await attachTranslatorPlayback({ ...cached.result });
      return finalizeWithAlternates(
        { ...cached.result, ...withPlayback, engine: 'cached', cache_key: cacheKey(sourceLang, input) },
        frame,
        input,
        options,
      );
    }
  }

  const llm = await compileFrameViaLlm(input, options);
  if (!llm.ok) {
    return { ok: false, error: llm.error, engine: 'llm', status: llm.status ?? 503 };
  }

  const frame = await repairLlmFrame(llm.frame, input, options.lab);
  const result = await translateFromFrame(frame, {
    lab: options.lab,
    input,
    sourceLang: frame.detected_lang ?? sourceLang,
  });

  const validation = await validateLlmFrame(frame, options.lab, input);
  const enriched = {
    ...result,
    engine: 'llm',
    model: llm.model,
    reasoning: frame.reasoning ?? null,
    detected_lang: frame.detected_lang ?? sourceLang,
    llm_frame: frame,
    validation,
  };

  if (validation.valid && enriched.unresolved.length === 0) {
    await writeCachedTranslation({
      sourceLang: enriched.detected_lang ?? sourceLang,
      sourceText: input,
      frame,
      surface: enriched.surface,
      result: enriched,
      engine: 'llm',
      model: llm.model,
      validated: true,
      created_at: new Date().toISOString(),
    });
  } else if (enriched.unresolved.length || !validation.valid) {
    await writeCachedTranslation({
      sourceLang: enriched.detected_lang ?? sourceLang,
      sourceText: input,
      frame,
      surface: enriched.surface,
      result: enriched,
      engine: 'llm',
      model: llm.model,
      validated: false,
      created_at: new Date().toISOString(),
    });
  }

  return finalizeWithAlternates(enriched, frame, input, options);
}
