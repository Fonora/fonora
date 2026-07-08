/**
 * Translation cache — stores successful LLM concept-frame compilations in fonora-data.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPath } from './fonoran-data-paths.js';

const CACHE_KEY = 'translation_cache';

/** @returns {string} */
export function translationCachePath() {
  return resolveDataPath(CACHE_KEY);
}

/** Normalize cache lookup key: lang|text */
export function cacheKey(sourceLang, sourceText) {
  const lang = String(sourceLang ?? 'auto').trim().toLowerCase() || 'auto';
  const text = String(sourceText ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return `${lang}|${text}`;
}

/** @returns {Promise<{ version: string, entries: Record<string, object> }>} */
export async function loadTranslationCache() {
  try {
    const raw = JSON.parse(await readFile(translationCachePath(), 'utf8'));
    return {
      version: raw.version ?? '1.0',
      entries: raw.entries && typeof raw.entries === 'object' ? raw.entries : {},
    };
  } catch {
    return { version: '1.0', entries: {} };
  }
}

/** @param {{ version?: string, entries: Record<string, object> }} doc */
export async function saveTranslationCache(doc) {
  const path = translationCachePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ version: doc.version ?? '1.0', entries: doc.entries ?? {} }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * @param {string} sourceLang
 * @param {string} sourceText
 * @returns {Promise<object | null>}
 */
export async function lookupCachedTranslation(sourceLang, sourceText) {
  const key = cacheKey(sourceLang, sourceText);
  const doc = await loadTranslationCache();
  return doc.entries[key] ?? null;
}

// Serialize cache writes in-process. Each write is a full read-modify-write of
// the cache file, so concurrent callers (e.g. a parallel warm) would otherwise
// clobber each other's entries (last-writer-wins on the whole file). Chaining
// writes guarantees every entry is merged.
let writeChain = Promise.resolve();

/**
 * @param {object} entry
 * @returns {Promise<object>}
 */
export function writeCachedTranslation(entry) {
  const key = cacheKey(entry.sourceLang, entry.sourceText);
  const run = writeChain.then(async () => {
    const doc = await loadTranslationCache();
    doc.entries[key] = {
      ...entry,
      cache_key: key,
      updated_at: new Date().toISOString(),
    };
    await saveTranslationCache(doc);
    return doc.entries[key];
  });
  // Keep the chain alive even if an individual write rejects.
  writeChain = run.then(() => {}, () => {});
  return run;
}

/** CLI entry when run directly. */
export async function runTranslationCacheCli(argv = process.argv.slice(2)) {
  const cmd = argv[0] ?? 'stats';
  const doc = await loadTranslationCache();
  const entries = Object.values(doc.entries);

  if (cmd === 'stats') {
    const validated = entries.filter(e => e.validated).length;
    console.log(JSON.stringify({
      path: translationCachePath(),
      total: entries.length,
      validated,
      pending: entries.length - validated,
    }, null, 2));
    return;
  }

  if (cmd === 'list') {
    const limit = Number(argv[1]) || 20;
    console.log(entries.slice(0, limit).map(e => ({
      key: e.cache_key,
      sourceLang: e.sourceLang,
      sourceText: e.sourceText,
      roman: e.surface?.roman,
      validated: e.validated,
    })));
    return;
  }

  if (cmd === 'prune-unvalidated') {
    const before = entries.length;
    doc.entries = Object.fromEntries(
      Object.entries(doc.entries).filter(([, e]) => e.validated),
    );
    await saveTranslationCache(doc);
    console.log(`Pruned ${before - Object.keys(doc.entries).length} unvalidated entries.`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use: stats | list [n] | prune-unvalidated`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTranslationCacheCli().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
