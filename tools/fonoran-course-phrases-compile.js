/**
 * Shared course-phrase compile path for build-time and Learn runtime.
 *
 * English prompts stay static; roman is compiled by the same deterministic translator the
 * golden corpus is measured against, so a phrase a lesson teaches is exactly a phrase the
 * language can say. Roman is never stored for long: it recompiles from the live lab whenever
 * the seeds change, so a respelled root reaches lessons without a rebuild.
 *
 * This used to replay frames from the LLM translation cache, which meant lessons could show a
 * surface no rule reproduces, and a phrase absent from the cache was hidden as "pending" even
 * when the translator could say it perfectly well.
 */
import { translateEnglishLegacy } from './fonoran-translator.js';

/**
 * Extract individual roman tokens from a translation result's surface.
 * @param {object} result
 * @returns {string[]}
 */
export function extractTokens(result) {
  const roman = result?.surface?.roman ?? '';
  if (!roman) return [];
  return roman.split(/\s+/).filter(Boolean);
}

/**
 * Rewrite one whole word of a roman surface, leaving spacing and terminal
 * punctuation intact. The form may itself contain a space (a composition whose
 * boundary collided renders as separate parts).
 * @param {string} roman
 * @param {string} form
 * @param {string} replacement
 * @returns {string}
 */
function replaceWholeForm(roman, form, replacement) {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return roman.replace(new RegExp(`(^|\\s)${escaped}(?=[\\s.,!?]|$)`, 'g'), `$1${replacement}`);
}

/**
 * Build a fonoran field for one phrase from a translation result.
 *
 * Lessons teach vocabulary, so a composition the lexicon does not own must read
 * as a gap here even though the Translator is allowed to offer it: an unbracketed
 * runtime composition is indistinguishable from an approved word.
 *
 * @param {object} result
 * @returns {{ roman: string, tokens: string[], status: string, unresolved?: string[], error?: string }}
 */
export function buildFonoranField(result) {
  if (!result || result.ok === false) {
    return {
      roman: '',
      tokens: [],
      status: 'gap',
      error: result?.error ?? 'translation failed',
    };
  }
  const composed = (result.tokens ?? []).filter(t => t?.ad_hoc_composition && t.fonoran);
  let roman = result.surface?.roman ?? '';
  for (const token of composed) {
    roman = replaceWholeForm(roman, token.fonoran, `[${token.concept_id ?? token.english}]`);
  }
  const tokens = roman ? roman.split(/\s+/).filter(Boolean) : [];
  const unresolved = Array.isArray(result.unresolved) ? result.unresolved : [];
  const blocked = unresolved.length > 0 || composed.length > 0;
  const status = roman && !blocked ? 'translated' : blocked ? 'gap' : 'pending';
  return {
    roman,
    tokens,
    status,
    ...(unresolved.length ? { unresolved } : {}),
  };
}

/**
 * Compile one English phrase to Fonoran roman with the deterministic translator.
 *
 * @param {string} sourceText
 * @param {{ lab?: object }} [opts]
 * @returns {Promise<{ roman: string, tokens: string[], status: string, unresolved?: string[], error?: string }>}
 */
export async function compilePhrase(sourceText, opts = {}) {
  const text = String(sourceText ?? '').trim();
  if (!text) {
    return { roman: '', tokens: [], status: 'pending', error: 'empty source' };
  }
  try {
    return buildFonoranField(await translateEnglishLegacy(text, { lab: opts.lab }));
  } catch (err) {
    return {
      roman: '',
      tokens: [],
      status: 'gap',
      error: String(err?.message ?? err),
    };
  }
}

/**
 * Compile a list of phrase objects that already have `sourceText` / `en`.
 *
 * @param {Array<{ id?: string, sourceText?: string, en?: string }>} phrases
 * @param {{ lab?: object }} [opts]
 * @returns {Promise<Array<{ roman: string, tokens: string[], status: string, unresolved?: string[], error?: string }>>}
 */
export async function compileDomainPhrases(phrases, opts = {}) {
  const out = [];
  for (const phrase of phrases ?? []) {
    const sourceText = phrase.sourceText ?? phrase.en ?? '';
    out.push(await compilePhrase(sourceText, opts));
  }
  return out;
}

/**
 * Recompile roman for a baked course-phrases document (domain structure + English).
 *
 * @param {{ version?: string, domains?: object[] }} baked
 * @param {{ lab?: object, labRev?: string | null }} [opts]
 * @returns {Promise<{
 *   version: string,
 *   lab_rev: string | null,
 *   generated_at: string,
 *   total_domains: number,
 *   total_phrases: number,
 *   translated: number,
 *   gap: number,
 *   pending: number,
 *   domains: object[],
 * }>}
 */
export async function compileCoursePhrasesDocument(baked, opts = {}) {
  const domainsIn = baked?.domains ?? [];
  const outputDomains = [];
  let translated = 0;
  let gap = 0;
  let pending = 0;
  let totalPhrases = 0;

  for (const domain of domainsIn) {
    const outputPhrases = [];
    for (const phrase of domain.phrases ?? []) {
      totalPhrases += 1;
      const sourceText = phrase.sourceText ?? phrase.en ?? '';
      const fonoran = await compilePhrase(sourceText, { lab: opts.lab });
      if (fonoran.status === 'translated') translated += 1;
      else if (fonoran.status === 'gap') gap += 1;
      else pending += 1;

      outputPhrases.push({
        id: phrase.id,
        sourceLang: phrase.sourceLang ?? 'en',
        sourceText,
        type: phrase.type,
        complexity: phrase.complexity,
        fonoran,
      });
    }
    outputDomains.push({
      id: domain.id,
      level: domain.level,
      label: domain.label,
      phrases: outputPhrases,
    });
  }

  return {
    version: baked?.version ?? '1.0',
    lab_rev: opts.labRev ?? null,
    generated_at: new Date().toISOString(),
    total_domains: outputDomains.length,
    total_phrases: totalPhrases,
    translated,
    gap,
    pending,
    domains: outputDomains,
  };
}
