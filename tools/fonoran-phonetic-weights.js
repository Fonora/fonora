/**
 * Research-backed articulatory ease weights for Fonoran roots and compounds.
 * Primitive roots: r/j onsets are hard-banned (rulebook rule 4).
 * Compounds inherit clean roots; difficult onsets are tie-break penalties only.
 */

import { parseSyllable } from './fonoran-pronunciation.js';
import { splitRoot } from './fonoran-gen3-distinctiveness.js';

/** Cross-linguistic "very safe" onsets (Fonoran roman). */
export const VERY_SAFE_ONSETS = new Set(['m', 'n', 'p', 'b', 't', 'd', 'k', 'g', 's', 'h', 'w', 'y']);

/** Fairly safe — globally common, slightly below very-safe stops/nasals. */
export const FAIRLY_SAFE_ONSETS = new Set(['f', 'l', 'ch', 'sh']);

/** Banned for primitive roots. Fonoran `j` = English /dʒ/, not IPA /j/ (that is `y`). */
export const DIFFICULT_ONSETS = new Set(['r', 'j']);

/** Research "possibly avoid" — not in generator pool; block new primitive proposals. */
export const EXCLUDED_ONSET_PATTERNS = ['th', 'dh', 'z', 'v', 'zh', 'ng', 'x', 'gh', 'kh'];

/**
 * @param {string} spelling
 * @returns {'very_safe'|'fairly_safe'|'difficult'|'unknown'}
 */
export function onsetResearchTier(spelling) {
  const syl = parseSyllable(String(spelling ?? '').toLowerCase());
  if (!syl || syl.unparsed) return 'unknown';
  const onset = syl.onset || splitRoot(spelling).onset;
  if (VERY_SAFE_ONSETS.has(onset)) return 'very_safe';
  if (FAIRLY_SAFE_ONSETS.has(onset)) return 'fairly_safe';
  if (DIFFICULT_ONSETS.has(onset)) return 'difficult';
  return 'unknown';
}

/**
 * @param {string} spelling
 * @returns {boolean}
 */
export function isExcludedSpelling(spelling) {
  const lower = String(spelling ?? '').toLowerCase();
  if (!lower) return false;
  for (const pat of EXCLUDED_ONSET_PATTERNS) {
    if (lower.startsWith(pat) || lower.includes(pat)) return true;
  }
  return false;
}

/**
 * Primitive root spellings must not use excluded patterns or difficult (r/j) onsets.
 * @param {string} spelling
 * @returns {boolean}
 */
export function isBannedPrimitiveSpelling(spelling) {
  if (isExcludedSpelling(spelling)) return true;
  return onsetResearchTier(spelling) === 'difficult';
}

