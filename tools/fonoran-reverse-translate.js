/**
 * Fonoran to English reverse translator.
 *
 * Normalizes Fonora script or roman input and resolves spellings to concepts and particles,
 * producing a lexical gloss. The fluency layer that used to smooth that gloss into an idiomatic
 * sentence was a model call, and it is gone: a reading of Fonoran that no rule can account for
 * is not a reading of Fonoran. What the glosser cannot resolve stays visible as a gap.
 *
 * The gloss names each concept by its id, not by its dictionary definition. Definitions are
 * written to be read alone ("the entity spoken to", "a group seen as one"), so splicing them
 * into a sentence produced text that was neither English nor a faithful gloss. The id is the
 * name the lexicon already uses for the concept, so a word that reads oddly here reads oddly
 * everywhere and is a naming decision to make in the seed rather than to paper over here.
 */

import { buildResolveContext } from './fonoran-english-resolve.js';
import { getParticleRuntime } from './fonoran-particles.js';
import { fonoraScriptToRoman } from './fonoran-fonora-bridge.js';
import { loadFonoraLanguageRules, attachTranslatorPlayback } from './fonoran-playback-build.js';
import { phoneticKeyBold } from './fonoran-pronunciation.js';

const PUNCT_RE = /^[.!?…,;:]+$/;
const WORD_SPLIT_RE = /([.!?…,;:])|\s+/;

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
  ka: 'question',
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

/** The English word for a concept: its id, which the lexicon treats as the concept's name. */
function headwordForConcept(conceptId) {
  return String(conceptId ?? '').trim().replace(/_/g, ' ');
}

/** The concept's dictionary definition, shown beside the headword rather than inside the gloss. */
function definitionForConcept(ctx, conceptId) {
  const id = String(conceptId ?? '').trim();
  if (!id) return '';
  const compound = ctx.compoundByConceptId?.get(id);
  if (compound?.gloss) return String(compound.gloss);
  const root = ctx.rootById?.get(id);
  if (root?.gloss) return String(root.gloss);
  return '';
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
    const gloss = headwordForConcept(conceptId);
    const compound = ctx.compoundByConceptId?.get(conceptId);
    return {
      kind: compound ? 'compound' : 'root',
      resolved: true,
      fonoran: key,
      english: gloss,
      gloss,
      definition: definitionForConcept(ctx, conceptId),
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
 * Translate Fonoran (script or roman) into a natural-language target.
 * @param {string} text
 * @param {{
 *   inputMode?: 'fonora'|'roman',
 *   sourceLang?: string,
 *   lab?: object,
 *   skipCache?: boolean,
 *   devLab?: boolean,
 * }} [options]
 */
export async function translateFromFonoran(text, options = {}) {
  const input = String(text ?? '').trim();
  const inputMode = resolveInputMode(options.sourceLang, options.inputMode);
  const rules = await loadFonoraLanguageRules();

  if (!input) {
    return {
      ok: true,
      direction: 'from-fonoran',
      inputMode,
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
      input,
      error: WRONG_SOURCE_LANG_ERROR,
      code: 'wrong_source_language',
      status: 422,
      engine: 'lexical',
      unresolved: glossed.unresolved,
      hint: { action: 'switch_source', to: 'en' },
    };
  }

  const translation = glossed.literal;
  const literal = glossed.literal;
  const reasoning = 'Lexical gloss from approved spellings and grammar particles.';
  const engine = 'lexical';

  const unresolved = [...new Set(glossed.unresolved ?? [])];
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
    input,
    mode: 'reverse',
    tokens,
    surface,
    translation,
    literal,
    reasoning,
    unresolved,
    engine,
    model: null,
    is_question: isQuestion,
    warnings: normalized.warnings ?? [],
    detected_lang: inputMode === 'fonora' ? 'fonoran-fonora' : 'fonoran-roman',
  };

  await attachTranslatorPlayback(result, rules);
  return result;
}
