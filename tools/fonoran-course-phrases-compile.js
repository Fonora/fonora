/**
 * Shared course-phrase compile path for build-time and Learn runtime.
 *
 * English prompts stay static; roman is compiled from the translation cache
 * through the live compiler so lexicon policy changes propagate without LLM calls.
 */
import { translateViaLlm } from './fonoran-llm-translate.js';

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
 * Build a fonoran field for one phrase from a translation result.
 * @param {object} result
 * @returns {{ roman: string, tokens: string[], status: string, unresolved?: string[], error?: string }}
 */
export function buildFonoranField(result) {
  if (!result || result.ok === false) {
    const status = result?.cache_miss ? 'pending' : 'gap';
    return {
      roman: '',
      tokens: [],
      status,
      error: result?.error ?? 'translation failed',
    };
  }
  const roman = result.surface?.roman ?? '';
  const tokens = extractTokens(result);
  const unresolved = Array.isArray(result.unresolved) ? result.unresolved : [];
  const status = roman && unresolved.length === 0 ? 'translated' : unresolved.length ? 'gap' : 'pending';
  return {
    roman,
    tokens,
    status,
    ...(unresolved.length ? { unresolved } : {}),
  };
}

/**
 * Compile one English phrase to Fonoran roman via the cache-first translator.
 *
 * @param {string} sourceText
 * @param {{ cacheOnly?: boolean, sourceLang?: string, lab?: object }} [opts]
 * @returns {Promise<{ roman: string, tokens: string[], status: string, unresolved?: string[], error?: string }>}
 */
export async function compilePhrase(sourceText, opts = {}) {
  const text = String(sourceText ?? '').trim();
  if (!text) {
    return { roman: '', tokens: [], status: 'pending', error: 'empty source' };
  }
  const cacheOnly = opts.cacheOnly !== false;
  try {
    const result = await translateViaLlm(text, {
      sourceLang: opts.sourceLang ?? 'en',
      cacheOnly,
      lab: opts.lab,
    });
    return buildFonoranField(result);
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
 * @param {{ cacheOnly?: boolean, sourceLang?: string, lab?: object }} [opts]
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
 * @param {{ cacheOnly?: boolean, lab?: object, labRev?: string | null }} [opts]
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
      const fonoran = await compilePhrase(sourceText, {
        cacheOnly: opts.cacheOnly !== false,
        lab: opts.lab,
      });
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
