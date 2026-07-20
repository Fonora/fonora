/**
 * Fonoran → natural-language reverse translator.
 * Normalizes Fonora script or roman input, resolves spellings to concepts/particles,
 * then (optionally) asks the LLM for a fluent reading in the target language.
 */

import {
  completeJson,
  anthropicTranslatorConfigured,
  ANTHROPIC_TRANSLATOR_API_KEY_ENV,
} from './fonoran-llm-client.js';
import { buildResolveContext } from './fonoran-english-resolve.js';
import { getParticleRuntime } from './fonoran-particles.js';
import { fonoraScriptToRoman } from './fonoran-fonora-bridge.js';
import { loadFonoraLanguageRules, attachTranslatorPlayback } from './fonoran-playback-build.js';
import { buildLlmGrammarBrief } from './fonoran-llm-grammar-brief.js';
import { phoneticKeyBold } from './fonoran-pronunciation.js';

const TARGET_LANG_LABELS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ar: 'Arabic',
  zh: 'Mandarin Chinese',
};

const PUNCT_RE = /^[.!?…,;:]+$/;
const WORD_SPLIT_RE = /([.!?…,;:])|\s+/;

/**
 * @param {string} [targetLang]
 */
export function normalizeTargetLang(targetLang) {
  const lang = String(targetLang ?? 'en').trim().toLowerCase();
  return TARGET_LANG_LABELS[lang] ? lang : 'en';
}

/**
 * @param {string} [inputMode]
 * @returns {'fonora'|'roman'}
 */
export function normalizeInputMode(inputMode) {
  const mode = String(inputMode ?? 'roman').trim().toLowerCase();
  return mode === 'fonora' || mode === 'script' ? 'fonora' : 'roman';
}

/**
 * Detect reverse direction from sourceLang values used by the UI.
 * @param {string} [sourceLang]
 */
export function isFonoranSourceLang(sourceLang) {
  const lang = String(sourceLang ?? '').trim().toLowerCase();
  return lang === 'fonoran-roman'
    || lang === 'fonoran-fonora'
    || lang === 'fonoran'
    || lang === 'fonora';
}

/**
 * Map UI sourceLang to inputMode when translating from Fonoran.
 * @param {string} [sourceLang]
 * @param {string} [inputMode]
 */
export function resolveInputMode(sourceLang, inputMode) {
  const lang = String(sourceLang ?? '').trim().toLowerCase();
  if (lang === 'fonoran-fonora' || lang === 'fonora') return 'fonora';
  if (lang === 'fonoran-roman' || lang === 'fonoran') return 'roman';
  return normalizeInputMode(inputMode);
}

/**
 * Normalize raw input to space-separated roman (plus retained punctuation).
 * @param {string} text
 * @param {'fonora'|'roman'} inputMode
 * @param {object} [rules]
 */
export function normalizeFonoranInput(text, inputMode, rules = null) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return { roman: '', inputMode, warnings: [], words: [] };
  }

  if (inputMode === 'fonora') {
    if (!rules) {
      return { roman: '', inputMode, warnings: ['Fonora script rules not loaded'], words: [] };
    }
    const decoded = fonoraScriptToRoman(raw, rules);
    const roman = String(decoded.roman ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      roman,
      inputMode: 'fonora',
      warnings: decoded.warnings ?? [],
      words: decoded.words ?? [],
      symbols: decoded.symbols ?? '',
    };
  }

  const roman = raw
    .replace(/[·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { roman, inputMode: 'roman', warnings: [], words: [] };
}

function tokenizeRoman(roman) {
  return String(roman ?? '')
    .split(WORD_SPLIT_RE)
    .map(p => String(p ?? '').trim())
    .filter(Boolean);
}

/** Short display glosses for the closed particle class. */
const PARTICLE_SHORT_GLOSS = {
  mi: 'I',
  ta: 'past',
  sa: 'future',
  no: 'not',
  ya: 'yes',
  von: 'if',
};

function shortGloss(text, fallback = '') {
  const raw = String(text ?? '').trim();
  if (!raw) return fallback;
  return raw.split(/[;|]/)[0].trim() || fallback;
}

function particleByForm(particles) {
  const map = new Map();
  for (const p of particles?.data?.particles ?? []) {
    if (!p.form) continue;
    map.set(String(p.form).toLowerCase(), p);
  }
  return map;
}

function glossForConcept(ctx, conceptId) {
  const id = String(conceptId ?? '').trim();
  if (!id) return '';
  const compound = ctx.compoundByConceptId?.get(id);
  if (compound?.gloss) return String(compound.gloss);
  const root = ctx.rootById?.get(id);
  if (root?.gloss) return String(root.gloss);
  return id.replace(/_/g, ' ');
}

/**
 * Resolve one roman spelling against particles + lab spellings.
 * @param {string} spelling
 * @param {object} ctx
 * @param {Map<string, object>} byForm
 */
export function resolveRomanSpelling(spelling, ctx, byForm) {
  const key = String(spelling ?? '').trim().toLowerCase();
  if (!key) {
    return {
      kind: 'empty',
      resolved: false,
      fonoran: '',
      english: '',
      gloss: '',
      role: 'concept',
      concept_id: null,
    };
  }

  if (PUNCT_RE.test(key)) {
    return {
      kind: 'punctuation',
      resolved: true,
      fonoran: spelling,
      english: spelling,
      gloss: spelling,
      role: 'punctuation',
      concept_id: null,
      resolution_kind: 'direct',
    };
  }

  const particle = byForm.get(key);
  if (particle) {
    const gloss = PARTICLE_SHORT_GLOSS[particle.form]
      || shortGloss(particle.gloss, particle.id);
    return {
      kind: 'particle',
      resolved: true,
      fonoran: particle.form,
      english: gloss,
      gloss,
      role: particle.role || 'particle',
      concept_id: particle.id,
      resolution_kind: 'direct',
      particle_id: particle.id,
      parts: [particle.form],
      pronunciation: {
        sayLine: phoneticKeyBold(particle.form),
        englishLine: '',
      },
    };
  }

  const conceptId = ctx.spellingByConceptId?.get(key) ?? null;
  if (conceptId) {
    const gloss = shortGloss(glossForConcept(ctx, conceptId), conceptId);
    const compound = ctx.compoundByConceptId?.get(conceptId);
    return {
      kind: compound ? 'compound' : 'root',
      resolved: true,
      fonoran: key,
      english: gloss,
      gloss,
      role: 'concept',
      concept_id: conceptId,
      resolution_kind: 'direct',
      parts: compound?.parts ?? [key],
      pronunciation: {
        sayLine: phoneticKeyBold(key),
        englishLine: '',
      },
    };
  }

  return {
    kind: 'unknown',
    resolved: false,
    fonoran: key,
    english: key,
    gloss: key,
    role: 'concept',
    concept_id: null,
    resolution_kind: 'unknown',
    pronunciation: {
      sayLine: phoneticKeyBold(key),
      englishLine: '',
    },
  };
}

/**
 * Lexically gloss a roman Fonoran phrase.
 * @param {string} roman
 * @param {object} ctx
 * @param {object} particles
 */
export function glossRomanPhrase(roman, ctx, particles) {
  const byForm = particleByForm(particles);
  const parts = tokenizeRoman(roman);
  const tokens = [];
  const unresolved = [];

  for (const part of parts) {
    const token = resolveRomanSpelling(part, ctx, byForm);
    tokens.push(token);
    if (!token.resolved && token.kind !== 'empty') unresolved.push(token.fonoran);
  }

  const literal = tokens
    .filter(t => t.kind !== 'empty')
    .map(t => (t.kind === 'punctuation' ? t.fonoran : (t.gloss || t.english || t.fonoran)))
    .join(' ')
    .replace(/\s+([.!?…,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return { tokens, unresolved, literal };
}

/** Common non-Fonoran function words — strong signal the source language is wrong. */
const NATURAL_LANG_FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'when', 'while', 'was', 'were', 'is', 'are', 'am',
  'been', 'of', 'for', 'from', 'with', 'upon', 'into', 'onto', 'that', 'this',
  'these', 'those', 'it', 'he', 'she', 'they', 'we', 'you', 'i', 'my', 'your', 'his', 'her',
  'their', 'not', 'yes', 'do', 'did', 'does', 'have', 'has', 'had', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'about', 'after', 'before', 'because', 'if',
  'el', 'la', 'los', 'las', 'de', 'que', 'en', 'un', 'una', 'le', 'les', 'des', 'et', 'est',
  'die', 'der', 'das', 'und', 'ist',
]);

/**
 * True when roman input is almost certainly natural language pasted into the
 * Fonoran→ reverse path (every word unresolved as a Fonoran spelling).
 * Avoids dumping English word-by-word as honest gaps.
 *
 * @param {{ tokens?: object[], unresolved?: string[] }} glossed
 */
export function looksLikeWrongSourceLanguage(glossed) {
  const tokens = (glossed?.tokens ?? []).filter(t => t && t.kind !== 'empty' && t.kind !== 'punctuation');
  if (tokens.length < 3) return false;
  const unresolved = tokens.filter(t => !t.resolved);
  const unresolvedRatio = unresolved.length / tokens.length;
  if (unresolvedRatio < 0.7) return false;
  const functionHits = tokens.filter(t => NATURAL_LANG_FUNCTION_WORDS.has(String(t.fonoran ?? '').toLowerCase())).length;
  // Either mostly unresolved with ≥2 function-word hits, or nearly everything unresolved.
  return functionHits >= 2 || unresolvedRatio >= 0.9;
}

const WRONG_SOURCE_LANG_ERROR =
  'This looks like natural language, not Fonoran. Switch the source language to English (or Auto-detect) to translate into Fonoran.';

/**
 * Ask the LLM for a fluent reverse reading.
 * @param {{ roman: string, tokens: object[], literal: string, targetLang: string, isQuestion?: boolean }} payload
 */
const REVERSE_SYSTEM_PROMPT = `You are a Fonoran → natural-language interpreter.
You receive a Fonoran phrase that has already been lexically resolved into particles and concept glosses.
Produce a fluent, natural reading in the requested target language.

Rules:
- Compile MEANING from the glossed tokens and Fonoran grammar — do not invent extra content.
- Particles: mi = I/speaker; ta = past; sa = future; no = not; ya = yes; von = if. Present tense has no particle.
- Word order follows Fonoran skeleton (Actor · Action · Target/Place · Time); rearrange into natural target-language order.
- Unknown / unresolved tokens are honest gaps — keep them visible (e.g. wrap in «…») rather than guessing.
- Questions ending in "?" (or marked is_question) should read as questions.
- Prefer a short everyday sentence over a word-for-word gloss when the meaning is clear.
- Never invent Fonoran spellings or claim a gap is resolved.

Return JSON only:
{
  "translation": "fluent sentence in the target language",
  "literal": "optional tighter gloss if helpful, else same as translation",
  "reasoning": "one sentence on how you read the structure",
  "unresolved": ["any tokens you still could not interpret"]
}`;

async function fluentReverseViaLlm(payload) {
  if (!anthropicTranslatorConfigured()) {
    return {
      ok: false,
      error: `${ANTHROPIC_TRANSLATOR_API_KEY_ENV} not set`,
      status: 503,
    };
  }

  const langLabel = TARGET_LANG_LABELS[payload.targetLang] || 'English';
  const glossLines = (payload.tokens ?? [])
    .filter(t => t.kind !== 'empty')
    .map((t) => {
      if (t.kind === 'punctuation') return `PUNCT ${t.fonoran}`;
      if (t.kind === 'particle') return `PARTICLE ${t.fonoran} = ${t.gloss}`;
      if (!t.resolved) return `UNKNOWN ${t.fonoran}`;
      return `LEX ${t.fonoran} (${t.concept_id ?? '?'}) = ${t.gloss}`;
    })
    .join('\n');

  const grammar = buildLlmGrammarBrief();
  const user = `Target language: ${langLabel} (${payload.targetLang})
is_question: ${payload.isQuestion ? 'true' : 'false'}

Fonoran roman:
"""
${payload.roman}
"""

Resolved tokens:
${glossLines}

Lexical gloss (fallback):
${payload.literal}

Return the JSON object.`;

  const result = await completeJson({
    system: REVERSE_SYSTEM_PROMPT,
    cachePrefix: grammar,
    user,
    temperature: 0,
    maxTokens: 512,
    apiKeyEnv: ANTHROPIC_TRANSLATOR_API_KEY_ENV,
  });

  if (!result.ok) return result;
  const data = result.data ?? {};
  const translation = String(data.translation ?? '').trim();
  if (!translation) {
    return { ok: false, error: 'LLM returned empty reverse translation', status: 502 };
  }
  return {
    ok: true,
    model: result.model,
    translation,
    literal: String(data.literal ?? translation).trim() || translation,
    reasoning: String(data.reasoning ?? '').trim() || null,
    unresolved: Array.isArray(data.unresolved)
      ? data.unresolved.map(x => String(x).trim()).filter(Boolean)
      : [],
  };
}

/**
 * Translate Fonoran (script or roman) into a natural-language target.
 * @param {string} text
 * @param {{
 *   inputMode?: 'fonora'|'roman',
 *   sourceLang?: string,
 *   targetLang?: string,
 *   lab?: object,
 *   skipCache?: boolean,
 *   devLab?: boolean,
 *   engine?: string,
 * }} [options]
 */
export async function translateFromFonoran(text, options = {}) {
  const input = String(text ?? '').trim();
  const inputMode = resolveInputMode(options.sourceLang, options.inputMode);
  const targetLang = normalizeTargetLang(options.targetLang);
  const rules = await loadFonoraLanguageRules();

  if (!input) {
    return {
      ok: true,
      direction: 'from-fonoran',
      inputMode,
      targetLang,
      input: '',
      mode: 'empty',
      tokens: [],
      surface: { roman: '', pronunciation: { sayLine: '', englishLine: '' } },
      translation: '',
      unresolved: [],
      engine: 'lexical',
    };
  }

  const normalized = normalizeFonoranInput(input, inputMode, rules);
  if (!normalized.roman) {
    return {
      ok: false,
      direction: 'from-fonoran',
      inputMode,
      targetLang,
      input,
      error: normalized.warnings?.[0] || 'Could not normalize Fonoran input',
      status: 422,
      engine: 'lexical',
    };
  }

  const ctx = await buildResolveContext(options.lab, { devLab: Boolean(options.devLab) });
  const particles = await getParticleRuntime();
  const glossed = glossRomanPhrase(normalized.roman, ctx, particles);
  const isQuestion = /[?？]\s*$/.test(normalized.roman) || /[?？]\s*$/.test(input);

  if (inputMode === 'roman' && looksLikeWrongSourceLanguage(glossed)) {
    return {
      ok: false,
      direction: 'from-fonoran',
      inputMode,
      targetLang,
      input,
      error: WRONG_SOURCE_LANG_ERROR,
      code: 'wrong_source_language',
      status: 422,
      engine: 'lexical',
      unresolved: glossed.unresolved,
      hint: { action: 'switch_source', to: 'en' },
    };
  }

  let translation = glossed.literal;
  let literal = glossed.literal;
  let reasoning = 'Lexical gloss from approved spellings and grammar particles.';
  let engine = 'lexical';
  let model = null;
  let llmUnresolved = [];

  const wantLlm = (options.engine ?? 'llm') !== 'legacy'
    && (options.engine ?? 'llm') !== 'lexical';

  if (wantLlm && anthropicTranslatorConfigured()) {
    const llm = await fluentReverseViaLlm({
      roman: normalized.roman,
      tokens: glossed.tokens,
      literal: glossed.literal,
      targetLang,
      isQuestion,
    });
    if (llm.ok) {
      translation = llm.translation;
      literal = llm.literal || glossed.literal;
      reasoning = llm.reasoning || reasoning;
      engine = 'llm';
      model = llm.model ?? null;
      llmUnresolved = llm.unresolved ?? [];
    } else if (options.engine === 'llm') {
      // Explicit llm request with no usable fallback key path — still return lexical.
      reasoning = `${reasoning} (LLM unavailable: ${llm.error})`;
    }
  } else if (wantLlm && !anthropicTranslatorConfigured()) {
    reasoning = `${reasoning} (LLM key not set — showing lexical gloss.)`;
  }

  const unresolved = [...new Set([...(glossed.unresolved ?? []), ...llmUnresolved])];
  const tokens = glossed.tokens.map(t => ({
    ...t,
    pronunciation: t.pronunciation ?? {
      sayLine: t.kind === 'punctuation' ? '' : phoneticKeyBold(t.fonoran),
      englishLine: '',
    },
  }));

  const surface = {
    roman: normalized.roman,
    pronunciation: {
      sayLine: tokens
        .filter(t => t.kind !== 'punctuation' && t.fonoran)
        .map(t => t.pronunciation?.sayLine || String(t.fonoran).toUpperCase())
        .join(' · '),
      englishLine: '',
    },
  };

  const result = {
    ok: true,
    direction: 'from-fonoran',
    inputMode,
    targetLang,
    target_lang_label: TARGET_LANG_LABELS[targetLang] || 'English',
    input,
    mode: 'reverse',
    tokens,
    surface,
    translation,
    literal,
    reasoning,
    unresolved,
    engine,
    model,
    is_question: isQuestion,
    warnings: normalized.warnings ?? [],
    detected_lang: inputMode === 'fonora' ? 'fonoran-fonora' : 'fonoran-roman',
  };

  await attachTranslatorPlayback(result, rules);
  return result;
}

export { TARGET_LANG_LABELS };
