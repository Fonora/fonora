/**
 * Persona glossary translations for the cib-v4 cross-lingual intuition battery.
 *
 * The L1 personas (es/zh/ar/hi/sw) must see root glosses and target glosses in
 * their own language, not English. Translations are generated once per
 * (language, English text) pair with the proposer model and cached on disk in
 * data/fonoran-persona-glossaries.json, so re-runs and resumes never re-pay
 * for translation.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeJson } from './fonoran-llm-client.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = join(ROOT, 'data/fonoran-persona-glossaries.json');
const BATCH_SIZE = 25;

const LANGUAGE_NAMES = {
  es: 'Spanish',
  zh: 'Mandarin Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  sw: 'Swahili',
};

export function loadGlossaryCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return { version: 1, generated_at: null, languages: {} };
  }
}

export function saveGlossaryCache(cache) {
  cache.generated_at = new Date().toISOString();
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

/** Look up a cached translation; falls back to the English original. */
export function translateText(cache, lang, text) {
  const t = cache?.languages?.[lang]?.[text];
  return typeof t === 'string' && t.trim() ? t : text;
}

async function translateBatch(lang, texts) {
  const langName = LANGUAGE_NAMES[lang] ?? lang;
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  // Glossary translation is a simple structured task — use the proposer model
  // (Sonnet). Fable adaptive-thinking can return empty text on large batches.
  const result = await completeJson({
    role: 'proposer',
    temperature: 0,
    maxTokens: 4096,
    system: [
      `You translate short English glosses into ${langName} for a language-learning experiment.`,
      'Each gloss names a basic concept (e.g. "person", "water", "to move toward").',
      'Translate each gloss into the most natural, everyday word or short phrase a native',
      `${langName} speaker would use for that concept. Keep translations short.`,
      '',
      'Respond with JSON only: { "translations": ["...", "..."] }',
      'The array must have exactly one entry per numbered input, in the same order.',
    ].join('\n'),
    user: numbered,
  });
  if (!result.ok) throw new Error(`Glossary translation failed (${lang}): ${result.error}`);
  const out = result.data?.translations;
  if (!Array.isArray(out) || out.length !== texts.length) {
    throw new Error(`Glossary translation shape mismatch (${lang}): expected ${texts.length}, got ${out?.length ?? 'none'}`);
  }
  return out.map(t => String(t ?? '').trim());
}

/**
 * Ensure translations exist for every text in every requested language.
 * Only missing (language, text) pairs hit the API; everything else is cached.
 *
 * @param {string[]} langs  e.g. ['es', 'zh']
 * @param {string[]} texts  English glosses to translate
 * @returns {Promise<object>} the (possibly updated) cache
 */
export async function ensureTranslations(langs, texts) {
  const cache = loadGlossaryCache();
  const unique = [...new Set(texts.map(t => String(t ?? '').trim()).filter(Boolean))];
  let dirty = false;

  for (const lang of langs) {
    cache.languages[lang] ??= {};
    const missing = unique.filter(t => !cache.languages[lang][t]);
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const translated = await translateBatch(lang, batch);
      batch.forEach((text, idx) => {
        if (translated[idx]) cache.languages[lang][text] = translated[idx];
      });
      dirty = true;
      console.log(`  [glossary] ${lang}: translated ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}`);
    }
  }

  if (dirty) saveGlossaryCache(cache);
  return cache;
}

/** Localize a primitive glossary ({id, gloss, spelling}[]) for one language. */
export function localizeGlossary(cache, lang, primitiveGlosses) {
  return (primitiveGlosses ?? []).map(r => ({
    ...r,
    gloss: translateText(cache, lang, r.gloss),
  }));
}
