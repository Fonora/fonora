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
import { buildResolveContext, loadConceptBridges } from './fonoran-english-resolve.js';
import {
  translateFromFrame,
  translateEnglishLegacy,
  buildSurface,
  buildFrame,
  splitSentences,
} from './fonoran-translator.js';
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
import { splitCoordinatedClauses } from './fonoran-interpretation.js';

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
let bridgeBlockCache = null;

function normalizeSourceLang(sourceLang) {
  const lang = String(sourceLang ?? 'auto').trim().toLowerCase();
  return lang || 'auto';
}

/**
 * Compact concept-bridge block for the prompt: shows the LLM the curated
 * abstract-word → recoverable path map so it prefers a transparent compose path
 * (e.g. sentience → think+self) or an existing concept over an honest gap.
 */
async function buildBridgeBlock() {
  if (bridgeBlockCache) return bridgeBlockCache;
  const bridges = await loadConceptBridges();
  const seen = new Set();
  const lines = [];
  for (const [term, entry] of bridges.entries()) {
    let target = null;
    if (entry.loan) target = `loan:${entry.roman ?? term}`;
    else if (Array.isArray(entry.compose)) target = entry.compose.join('+');
    else if (entry.concept) target = entry.concept;
    if (!target || seen.has(`${term}=${target}`)) continue;
    seen.add(`${term}=${target}`);
    lines.push(`${term} → ${target}`);
  }
  bridgeBlockCache = lines.sort((a, b) => a.localeCompare(b)).join('\n');
  return bridgeBlockCache;
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
  ['unknown', 'person'],
  ['unknown', 'thing'],
  ['unknown', 'place'],
  ['unknown', 'time'],
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

/** True when any slot carries the negation particle (no / internal neg alias). */
function frameHasNegation(frame) {
  for (const items of Object.values(frame?.slots ?? {})) {
    if (!Array.isArray(items)) continue;
    if (items.some(x => {
      const id = String(x ?? '').trim().toLowerCase();
      return id === 'no' || id === 'neg';
    })) return true;
  }
  return false;
}

/**
 * Explicit English verbal negation (not/never/cannot/n't). Excludes bare "no"
 * (quantifiers like nobody/nothing already compose with the particle) and the
 * WH word nohu, which is a lexical unit, not clause negation.
 */
function sourceHasVerbalNegation(text) {
  return /(?:\bnot\b|\bnever\b|\bcannot\b|n't\b)/i.test(String(text ?? ''));
}

/**
 * Deterministic negation repair: polarity is grammar in Fonoran (no antonym
 * roots), so a source with explicit verbal negation whose frame carries no `no`
 * particle has silently flipped meaning (e.g. "I do not know…" → "I know…").
 * Restore it clause-scoped, before the Action (Rule 3).
 */
function restoreDroppedNegation(frame, sourceText) {
  if (!frame?.slots || !sourceHasVerbalNegation(sourceText) || frameHasNegation(frame)) {
    return frame;
  }
  const event = Array.isArray(frame.slots.event) ? frame.slots.event : [];
  return {
    ...frame,
    slots: { ...frame.slots, event: ['no', ...event] },
    reasoning: [
      frame.reasoning,
      '[Grammar repair] Source has explicit negation but frame dropped the no particle — restored before the Action.',
    ].filter(Boolean).join(' '),
    _repaired_negation: true,
  };
}

export async function repairLlmFrame(frame, sourceText, lab = null) {
  let normalized = restoreDroppedNegation(
    normalizeWePrimaryFrame(
      stripExistentialThereFromFrame(
        normalizeFrameParticles(frame),
        sourceText,
      ),
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
  const [grammar, concepts, fewShot, bridges] = await Promise.all([
    loadGrammarSummary(particlesDoc),
    buildConceptInventoryBlock(lab),
    buildFewShotExamples(lab),
    buildBridgeBlock(),
  ]);
  const particleLines = (particlesDoc.particles ?? [])
    .filter(p => p.form)
    .map(p => `${p.form} (${p.id}): ${p.gloss}`)
    .join('\n');

  promptContextCache = { grammar, particleLines, concepts, fewShot, bridges, particlesDoc };
  return promptContextCache;
}

export function resetLlmTranslateCache() {
  promptContextCache = null;
  fewShotCache = null;
  bridgeBlockCache = null;
}

const FRAME_SCHEMA = `{
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
}`;

const SYSTEM_PROMPT = `You are the Fonoran semantic compiler defined in docs/fonoran-grammar.md (Rule 7).
Map source text in ANY language into a language-neutral concept frame using ONLY approved concept ids and the six v1 grammar particles.

## Output format

Single clause → output one JSON OBJECT:
${FRAME_SCHEMA}

Multiple independent clauses → output a JSON ARRAY of frame objects, one per clause:
[frame1, frame2, ...]

Each element in the array uses the exact same schema as the single-frame object above.

## When to use the array format

Split into separate frames whenever the source contains two or more independent propositions that each have their own actor, action, and/or tense — regardless of the source language. Common signals (in any language):

- Causal/result connectives: "that is why", "therefore", "so", "thus", "hence", "c'est pourquoi", "por eso", "deshalb", "因此", "だから", etc.
- Sequential events with a clear boundary: "I did X and then I did Y" (different tenses or actors)
- Adversative contrast with separate predicates: "I wanted X but I got Y"

Do NOT split for:
- Simple noun coordination: "I want food and water"
- Shared-subject action chains with the same tense: "She stood up and walked away"

## Slot semantics (Rule 4 / Rule 7)
- subject = Actor
- event = Action (event, state, or predicate concept)
- object = Target
- path = Place (spatial/motion/locative concepts — lexical, never English prepositions)
- time = Time (ta past, sa future, or time concepts; EMPTY for present)
- modifiers = peripheral modifiers (modifier-before-head chains)

## Mandatory rules
- Compile MEANING, not word-for-word English (Rule 7).
- Never mix concepts from different clauses into one slot set — that produces scrambled output.
- Demonstratives (this/that/these/those) and articles have NO Fonoran form — never emit a concept for them; leave them to inference (Rule 7).
- Particles ONLY: mi, ta, sa, no, ya, von — map neg→no (Rule 3).
- Present tense: leave time slot empty (Rule 3).
- Spatial/relational: lexical concepts (inside, here, there, near, path, source, up, down…) — NOT particles.
- Questions: no question particle; is_question true; WH composition ONLY for who/what/where/when in source (Rule 3).
- Yes/no and existential questions: NO WH composition — state entities/relations directly.
- Existential "Are there…" / "There are…": English dummy there is meaningless — do NOT emit concept there (tak). Compile only the entities/relations (e.g. other + people + near + addressee).
- Deictic there (tak) only when pointing at a place ("over there", "put it there").
- we/us: default subject collective (dan). Use mi + addressee only when source explicitly signals a dyad (each other, you and I, both of us) — never from topic or urgency alone.
- Why/how: not expressible in v1 — put in unresolved[], do not guess.
- Abstract / technical words: prefer a transparent compose path over an existing concept over a gap (Rule 5). Emit either a bridge concept id (e.g. sentience) or an explicit compose path joined with "+" using APPROVED concept ids (e.g. "think+self"). Only fall back to unresolved[] when no root path is recoverable and it is not a proper noun.
- Proper nouns / coined names with no recoverable path (e.g. a place or product name): keep as a marked loanword — emit its concept id if one is pinned in the glossary/bridge list rather than translating or gapping.
- Never invent concept ids OR spellings. Record honest gaps in unresolved[] as SHORT tokens — the single English word (or ≤2-word phrase) that has no v1 form, e.g. "can", "or", "should", "boy". Do NOT put explanations, clause labels, or sentence fragments in unresolved[] (Design Rule 0).`;

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

  // Static prefix (identical every call) → one prompt-cache breakpoint. The system
  // block precedes it and is cached in the same prefix. Only `user` below varies.
  const cachePrefix = `${ctx.grammar}

Particles:
${ctx.particleLines}

Concept inventory (id: gloss → spelling):
${ctx.concepts}

Concept bridges (abstract/technical word → recoverable path; use these ids or a "+"-joined compose path of approved ids):
${ctx.bridges}

Examples (English source → frame):
${ctx.fewShot}`;

  const user = `${langHint}

Source text:
"""
${String(text ?? '').trim()}
"""

Return the JSON frame.`;

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    cachePrefix,
    user,
    temperature: 0,
    maxTokens: 1024,
    apiKeyEnv: ANTHROPIC_TRANSLATOR_API_KEY_ENV,
  });

  if (!result.ok) return result;
  // Array response → multi-clause: one frame per element.
  if (Array.isArray(result.data)) {
    return {
      ok: true,
      frames: result.data.map(f => normalizeFrameParticles(f)),
      raw: result.raw,
      model: anthropicModel(),
      usage: result.usage ?? null,
    };
  }
  return { ok: true, frame: normalizeFrameParticles(result.data), raw: result.raw, model: anthropicModel(), usage: result.usage ?? null };
}

const SIMPLIFY_SYSTEM_PROMPT = `You are the Fonoran "plain meaning" pre-pass (docs/fonoran-grammar.md Rule 7, meaning-extraction stage).
Fonoran is a small concept language built for two strangers at a campfire: it has ~90 roots plus transparent compounds, and no abstract technical vocabulary.
Rewrite the source text into the SIMPLEST possible propositions that a person who only knows basic, concrete concepts could still understand — the same thing a human translator does before glossing.

Rules:
- Split every sentence into short, single-idea clauses.
- Replace abstract / technical / sci-fi words with plain, concrete meaning (e.g. "sentience" → "a mind that thinks for itself"; "the system executes processes" → "the thing does its work"; "real-time input was tunneled in" → "control was sent in from outside, moment by moment").
- Keep the ORIGINAL meaning and intent; do not add new ideas, do not editorialize, do not shorten away meaning.
- Prefer concrete nouns, simple verbs, and short subject-verb-object clauses.
- Keep proper nouns (names of people, places, and products) as-is; do not translate them.
- Preserve negation, tense (past/future), and conditionals ("if").

Output JSON only:
{
  "clauses": ["plain clause 1", "plain clause 2", ...],
  "note": "one short sentence on what you simplified"
}`;

const CLUSTER_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it']);
const CLUSTER_BE_AUX = new Set(['am', 'is', 'are', 'was', 'were']);
const CLUSTER_FINITE_VERBS = new Set([
  'am', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'cannot', 'must', 'should', 'may', 'might', 'shall',
  'want', 'wants', 'wanted', 'need', 'needs', 'needed', 'feel', 'feels', 'felt',
  'think', 'thinks', 'thought', 'know', 'knows', 'knew', 'see', 'sees', 'saw',
  'go', 'goes', 'went', 'like', 'likes', 'liked',
  "don't", "doesn't", "didn't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't",
  // Common transitive/stative verbs and their irregular past forms that frequently
  // appear in multi-clause run-ons but were not counted as finite-verb evidence.
  'love', 'loves', 'loved', 'hate', 'hates', 'hated',
  'buy', 'buys', 'bought', 'sell', 'sells', 'sold',
  'find', 'finds', 'found', 'lose', 'loses', 'lost',
  'tell', 'tells', 'told', 'send', 'sends', 'sent',
  'bring', 'brings', 'brought', 'hold', 'holds', 'held',
  'build', 'builds', 'built', 'keep', 'keeps', 'kept',
  'take', 'takes', 'took', 'give', 'gives', 'gave',
  'make', 'makes', 'made', 'get', 'gets', 'got',
  'come', 'comes', 'came', 'leave', 'leaves', 'left',
  'run', 'runs', 'ran', 'hear', 'hears', 'heard',
  'speak', 'speaks', 'spoke', 'write', 'writes', 'wrote',
  'read', 'reads', 'eat', 'eats', 'ate', 'drink', 'drinks', 'drank',
  'show', 'shows', 'showed', 'meet', 'meets', 'met',
  'catch', 'catches', 'caught', 'live', 'lives', 'lived',
  'try', 'tries', 'tried', 'help', 'helps', 'helped',
  'use', 'uses', 'used', 'own', 'owns', 'owned',
]);

/**
 * Count probable finite clauses in one sentence (no punctuation splitting).
 * Two signals, each strong evidence of a finite clause:
 *   - subject pronoun + finite verb ("i am…", "we need…")
 *   - a be-auxiliary with a NON-pronoun subject ("the fire is dying") — not
 *     double-counted when the pronoun cluster already claimed it.
 * Two or more in one sentence means a probable run-on, which a single concept
 * frame cannot represent.
 */
export function countFiniteClauseClusters(text) {
  const words = String(text ?? '').toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z']/g, ''))
    .filter(Boolean);
  let count = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (CLUSTER_PRONOUNS.has(words[i]) && CLUSTER_FINITE_VERBS.has(words[i + 1])) {
      count += 1;
      i += 1;
    } else if (CLUSTER_BE_AUX.has(words[i]) && !CLUSTER_PRONOUNS.has(words[i - 1])) {
      count += 1;
    }
  }
  return count;
}

/**
 * Heuristic gate for the plain-meaning pre-pass. Fires on: long input, abstract
 * vocabulary, or a sentence that looks like an unpunctuated multi-clause run-on
 * (2+ pronoun+finite-verb clusters in one sentence). The pre-pass LLM then
 * segments by MEANING — the deterministic splitter only handles clean surface
 * patterns, and meaning-level segmentation must not depend on English quirks.
 */
export function shouldAutoSimplify(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 16) return true;
  if (/\b(sentien|conscious|autonom|comput|execut|instantiat|propagat|infrastructure|interface|boundary|abstract|cognit|algorithm)\w*/i.test(s)) return true;
  // Run-on: 2+ finite clauses in one sentence that the deterministic
  // connective splitter cannot separate — needs meaning-level segmentation.
  return splitSentences(s).some(sentence =>
    countFiniteClauseClusters(sentence) >= 2 && splitCoordinatedClauses(sentence).length < 2);
}

/**
 * Conceptual simplification pre-pass: rewrite abstract source text into plain,
 * Fonoran-expressible propositions before frame compilation. Returns a pivot the
 * UI can surface ("Plain meaning") so the translator stays a language tool, not
 * a black box. On any failure it returns null and the caller compiles the
 * original text unchanged.
 * @param {string} text
 * @param {{ sourceLang?: string }} [options]
 */
export async function simplifyForFonoran(text, options = {}) {
  const input = String(text ?? '').trim();
  if (!input || !anthropicTranslatorConfigured()) return null;
  const sourceLang = normalizeSourceLang(options.sourceLang);
  const langHint = sourceLang === 'auto'
    ? 'Detect the source language; write the plain clauses in English.'
    : `Source language code: ${sourceLang}. Write the plain clauses in English.`;

  const result = await completeJson({
    system: SIMPLIFY_SYSTEM_PROMPT,
    user: `${langHint}\n\nSource text:\n"""\n${input}\n"""\n\nReturn the JSON.`,
    temperature: 0,
    maxTokens: 1024,
    apiKeyEnv: ANTHROPIC_TRANSLATOR_API_KEY_ENV,
  });

  if (!result.ok || !Array.isArray(result.data?.clauses)) return null;
  const clauses = result.data.clauses.map(c => String(c ?? '').trim()).filter(Boolean);
  if (!clauses.length) return null;
  return {
    clauses,
    text: clauses.join('. ').replace(/\.\.+/g, '.'),
    note: String(result.data.note ?? '').trim() || null,
  };
}

/** Validate LLM frame concept ids, particles, and grammar rules from fonoran-grammar.md. */
export async function validateLlmFrame(frame, lab = null, sourceText = '') {
  const ctx = await buildResolveContext(lab);
  const particles = await getParticleRuntime();
  const allowedParticles = new Set(['mi', 'ta', 'sa', 'no', 'ya', 'von']);
  for (const p of particles.data?.particles ?? []) {
    if (p.form) allowedParticles.add(p.form);
  }

  // A "+"-joined compose path is valid when every id is an approved concept.
  const composeResolvable = (id) => id.includes('+')
    && id.split('+').every(part => ctx.rootById.has(part) || ctx.compoundByConceptId.has(part) || ctx.spellingByConceptId?.has(part));

  const unknown = [];
  const slots = frame?.slots ?? {};
  for (const [role, items] of Object.entries(slots)) {
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const id = String(raw ?? '').trim().toLowerCase();
      if (!id) continue;
      if (id === 'neg') continue;
      // Lexicalized WH word (nohu) — resolved by the translator, not the lab inventory.
      if (id === 'unknown') continue;
      if (allowedParticles.has(id)) continue;
      if (ctx.rootById.has(id) || ctx.compoundByConceptId.has(id)) continue;
      if (ctx.spellingByConceptId?.has(id)) continue;
      if (ctx.bridges?.has(id)) continue;
      if (composeResolvable(id)) continue;
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
 * Translate via LLM concept frame (+ cache). Operates on whatever text it is
 * given (original, or the simplified pivot when the pre-pass ran).
 * @param {string} text
 * @param {{ sourceLang?: string, lab?: object, skipCache?: boolean }} options
 */
async function translateViaLlmCore(text, options = {}) {
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

  // Cache-only mode (deterministic CI / offline): never call the API. A miss is
  // an explicit "needs warming" signal, not a live translation.
  if (options.cacheOnly) {
    return {
      ok: false,
      error: `cache-miss: "${input}" is not warmed in the translation cache (run the warm CLI with an API key).`,
      engine: 'cache-only',
      cache_miss: true,
      input,
      status: 422,
    };
  }

  const llm = await compileFrameViaLlm(input, options);
  if (!llm.ok) {
    return { ok: false, error: llm.error, engine: 'llm', status: llm.status ?? 503 };
  }

  // Multi-clause path: LLM returned an array of frames (one per clause).
  if (llm.frames) {
    const segResults = [];
    for (const rawFrame of llm.frames) {
      const clauseFrame = await repairLlmFrame(rawFrame, input, options.lab);
      const clauseResult = await translateFromFrame(clauseFrame, {
        lab: options.lab,
        input,
        sourceLang: clauseFrame.detected_lang ?? sourceLang,
      });
      segResults.push({
        ...clauseResult,
        engine: 'llm',
        model: llm.model,
        reasoning: clauseFrame.reasoning ?? null,
        detected_lang: clauseFrame.detected_lang ?? sourceLang,
        llm_frame: clauseFrame,
        unresolved: clauseResult.unresolved ?? [],
      });
    }
    // Use frame indices as segment labels; the real source text is tracked on the merged result.
    const segments = llm.frames.map((_, i) => `clause ${i + 1}`);
    const merged = await mergeSentenceResults(segResults, segments, { input });
    return finalizeWithAlternates(
      { ...merged, engine: 'llm', model: llm.model },
      llm.frames[0],
      input,
      options,
    );
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

/**
 * Compose several single-sentence results into one multi-sentence result.
 * Each sentence keeps its own well-formed grammar; a sentence-boundary marker is
 * inserted between them so the surface reads as discrete sentences instead of one
 * run-on frame (the failure mode that made long passages hard to follow).
 * Surface, frame, and playback are rebuilt from the merged token stream so every
 * downstream consumer stays consistent.
 * @param {object[]} results  ordered single-sentence results
 * @param {string[]} segments source sentence/clause per result
 * @param {{ input: string }} ctx
 */
export async function mergeSentenceResults(results, segments, { input }) {
  const tokens = [];
  const slots = { subject: [], time: [], event: [], path: [], object: [], modifiers: [] };
  const unresolved = [];
  const interpretations = [];
  const reasonings = [];
  const sentences = [];
  const frames = [];
  let anyLlm = false;

  results.forEach((r, i) => {
    const segTokens = Array.isArray(r.tokens) ? r.tokens : [];
    // No period terminators: Fonoran writing carries no sentence punctuation
    // except the question `?` (Rule 3). Sentence boundaries stay available to
    // consumers via `sentences[]`; the printed surface is just the words.
    tokens.push(...segTokens);

    const segSlots = r.semantic?.slots ?? {};
    for (const key of Object.keys(slots)) {
      if (Array.isArray(segSlots[key])) slots[key].push(...segSlots[key]);
    }
    for (const w of r.unresolved ?? []) unresolved.push(String(w).toLowerCase());
    for (const it of r.interpretations ?? []) interpretations.push(it);
    if (r.reasoning) reasonings.push(r.reasoning);
    if (r.engine === 'llm') anyLlm = true;
    frames.push(r.llm_frame ?? null);
    sentences.push({
      input: segments[i],
      roman: r.surface?.roman ?? '',
      unresolved: r.unresolved ?? [],
      frame: r.llm_frame ?? null,
    });
  });

  const surface = buildSurface(tokens);
  // Multi-sentence tidy: drop the space before sentence/question terminators.
  // Scoped to this new path only; the single-sentence surface is left byte-for-
  // byte identical so golden/probe expectations are unaffected.
  surface.roman = surface.roman.replace(/\s+([.?!])/g, '$1');

  const merged = {
    input,
    mode: 'discourse',
    tokens,
    surface,
    semantic: { skeleton: results[0]?.semantic?.skeleton ?? null, slots },
    frame: buildFrame(tokens),
    interpretations,
    unresolved: [...new Set(unresolved)],
    reasoning: reasonings.join(' ') || null,
    engine: anyLlm ? 'llm' : 'cached',
    sentences,
    llm_frames: frames,
  };
  return attachTranslatorPlayback(merged);
}

/**
 * Translate via LLM with an optional conceptual-simplification pre-pass and
 * per-sentence segmentation.
 *
 * `simplify`: true (force), false (never), or 'auto' (heuristic on abstract/long
 * input). When active, the source text is rewritten into plain, Fonoran-
 * expressible propositions before compilation; the pivot is returned as
 * `simplified` so the UI can show "Plain meaning".
 *
 * Segmentation: multi-sentence input (or a multi-clause plain-meaning pivot) is
 * compiled ONE sentence per concept frame and rendered as discrete Fonoran
 * sentences. This keeps each sentence's grammar well-formed instead of collapsing
 * a whole passage into a single run-on frame.
 * @param {string} text
 * @param {{ sourceLang?: string, lab?: object, skipCache?: boolean, cacheOnly?: boolean, simplify?: boolean|'auto' }} options
 */
export async function translateViaLlm(text, options = {}) {
  const input = String(text ?? '').trim();
  const sourceLang = normalizeSourceLang(options.sourceLang);

  const wantSimplify = options.simplify === true
    || (options.simplify === 'auto' && shouldAutoSimplify(input));

  let simplified = null;
  if (input && wantSimplify) {
    simplified = await simplifyForFonoran(input, { sourceLang });
  }

  const compileText = simplified?.text || input;
  // Sentence split, then coordinated-clause split (and/but/so/because joining
  // two full clauses): each clause compiles as its OWN frame. Prevents run-on
  // frames like "I am thirsty and I want to drink water" collapsing into one
  // scrambled slot set (conjunctions are structural, Rule 3).
  const segments = (simplified?.clauses?.length ? simplified.clauses : splitSentences(compileText))
    .flatMap(s => splitCoordinatedClauses(s))
    .map(s => String(s ?? '').trim())
    .filter(Boolean);

  // Single sentence/clause: compile as one frame (unchanged behavior).
  if (segments.length <= 1) {
    const result = await translateViaLlmCore(compileText, options);
    if (!result || result.ok === false) return result;
    result.input = input;
    if (simplified) {
      result.simplified = simplified;
      result.source_text = compileText;
    }
    return result;
  }

  // Multi-sentence: one frame per sentence, then compose discrete sentences.
  const segResults = [];
  for (const seg of segments) {
    const r = await translateViaLlmCore(seg, options);
    if (!r || r.ok === false) {
      // Propagate the first hard failure / cache-miss, tagged with the full input.
      if (r) {
        r.input = input;
        r.segment = seg;
      }
      return r;
    }
    segResults.push(r);
  }

  const merged = await mergeSentenceResults(segResults, segments, { input });
  if (simplified) {
    merged.simplified = simplified;
    merged.source_text = compileText;
  }
  return merged;
}
