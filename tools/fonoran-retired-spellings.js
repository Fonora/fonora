/**
 * Retired spellings, read from data/fonoran-retired-spellings.json.
 *
 * Three places need this list and they must never disagree: the resolver, so a
 * cached frame carrying an old spelling still resolves; root generation, so the pool
 * can never hand a retired form to a new concept; and the invariant checker, so a
 * reappearance fails CI. It previously existed only as a hardcoded map in the
 * resolver, which is how `fa` was retired from `one` and then approved for `child`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data/fonoran-retired-spellings.json');

/** @type {Array<{ form: string, concept: string | null, reason: string, retired_at: string }> | null} */
let cache = null;

/**
 * @returns {Array<{ form: string, concept: string | null, reason: string, retired_at: string }>}
 */
export function loadRetiredSpellings() {
  if (cache) return cache;
  try {
    const doc = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    cache = (doc.retired ?? []).map(e => ({
      form: String(e.form ?? '').toLowerCase(),
      concept: e.concept ?? null,
      reason: e.reason ?? '',
      retired_at: e.retired_at ?? '',
    })).filter(e => e.form);
  } catch {
    // A missing seed must not break resolution: retirement is a compatibility aid.
    cache = [];
  }
  return cache;
}

/**
 * Retired spelling → the concept it was retired from, for backwards-compatible lookup.
 * @returns {Record<string, string>}
 */
export function retiredSpellingConceptIds() {
  const map = {};
  for (const entry of loadRetiredSpellings()) {
    if (entry.concept) map[entry.form] = String(entry.concept);
  }
  return map;
}

/** @param {string} form */
export function isRetiredSpelling(form) {
  const lower = String(form ?? '').toLowerCase();
  return loadRetiredSpellings().some(e => e.form === lower);
}

/** Test seam: drop the cached seed. */
export function clearRetiredSpellingCache() {
  cache = null;
}
