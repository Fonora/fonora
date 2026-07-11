/**
 * Research-backed articulatory ease weights for Fonoran roots and compounds.
 * Weight, never ban (for sounds in the pool). See RN-27 / automated refine loop plan.
 */

import { parseSyllable } from './fonoran-pronunciation.js';
import { rhymeKey, splitRoot } from './fonoran-gen3-distinctiveness.js';

/** Cross-linguistic "very safe" onsets (Fonoran roman). */
export const VERY_SAFE_ONSETS = new Set(['m', 'n', 'p', 'b', 't', 'd', 'k', 'g', 's', 'h', 'w', 'y']);

/** Fairly safe — globally common, slightly below very-safe stops/nasals. */
export const FAIRLY_SAFE_ONSETS = new Set(['f', 'l', 'ch', 'sh']);

/** Difficult — weighted down, never banned. Fonoran `j` = English /dʒ/, not IPA /j/ (that is `y`). */
export const DIFFICULT_ONSETS = new Set(['r', 'j']);

/** Research "possibly avoid" — not in generator pool; block new primitive proposals. */
export const EXCLUDED_ONSET_PATTERNS = ['th', 'dh', 'z', 'v', 'zh', 'ng', 'x', 'gh', 'kh'];

export const DEFAULT_RHYME_TARGETS = {
  stop_a: 0.25,
  stop_e: 0.15,
  glide_h: 0.10,
};

export const PHONETIC_SCORE_PASS = 0.70;

const ONSET_BASE_WEIGHT = {
  m: 1.0, n: 1.0, p: 0.98, b: 0.97, t: 0.97, d: 0.97, k: 0.96, g: 0.96, s: 0.95,
  h: 0.95, w: 0.95, y: 0.95,
  f: 0.85, l: 0.82, ch: 0.80, sh: 0.80,
  r: 0.50, j: 0.48,
};

const VOWEL_WEIGHT = { a: 1.0, e: 0.95, i: 0.93, o: 0.92, u: 0.92 };

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
 * Rhyme family key for saturation tracking.
 * @param {string} spelling
 */
export function rhymeFamily(spelling) {
  const syl = parseSyllable(String(spelling ?? '').toLowerCase());
  if (!syl || syl.unparsed) return 'other';
  const onset = syl.onset || '';
  const vowel = syl.vowel || 'a';
  if (VERY_SAFE_ONSETS.has(onset) && !syl.coda) {
    if (vowel === 'a') return 'stop_a';
    if (vowel === 'e') return 'stop_e';
    return 'stop_iu';
  }
  if (['h', 'w', 'y'].includes(onset) && !syl.coda) return 'glide_h';
  if (FAIRLY_SAFE_ONSETS.has(onset)) return 'fairly_safe';
  if (DIFFICULT_ONSETS.has(onset)) return 'difficult';
  if (syl.coda) return 'cvc';
  return 'other';
}

/**
 * Ease weight for a single root syllable (0..1).
 * @param {string} spelling
 */
export function rootEaseWeight(spelling) {
  const lower = String(spelling ?? '').toLowerCase();
  if (!lower || isExcludedSpelling(lower)) return 0;

  const syl = parseSyllable(lower);
  if (!syl || syl.unparsed) return 0.4;

  const onset = syl.onset || '';
  const vowel = syl.vowel || 'a';
  let w = ONSET_BASE_WEIGHT[onset] ?? 0.65;
  w *= VOWEL_WEIGHT[vowel] ?? 0.9;

  if (syl.coda) w *= 0.62;

  return Math.max(0, Math.min(1, w));
}

/**
 * Saturation penalty from analytics snapshot (0..~0.3).
 * @param {string[]} spellings
 * @param {object|null} analytics
 * @param {object} [targets]
 */
export function saturationPenalty(spellings, analytics, targets = DEFAULT_RHYME_TARGETS) {
  const shares = analytics?.rhyme_family_share ?? {};
  let penalty = 0;
  const familiesUsed = new Set(spellings.map(s => rhymeFamily(s)));

  for (const fam of familiesUsed) {
    const target = targets[fam];
    if (target == null) continue;
    const share = shares[fam] ?? 0;
    if (share > target) {
      penalty += (share - target) * 5;
    }
  }
  return Math.min(0.35, penalty);
}

/**
 * @param {string[]} flatSpellings — atomic root spellings in order
 * @param {object} [opts]
 * @param {object|null} [opts.analytics]
 * @param {number} [opts.boundaryPenalty] — extra penalty from soft boundary issues
 */
export function computePhoneticScore(flatSpellings, opts = {}) {
  const spellings = (flatSpellings ?? []).filter(Boolean);
  if (!spellings.length) {
    return { score: 0, avgEase: 0, rhymeSpreadBonus: 0, saturationPenalty: 0, families: [] };
  }

  if (spellings.some(isExcludedSpelling)) {
    return { score: 0, avgEase: 0, rhymeSpreadBonus: 0, saturationPenalty: 1, families: [], excluded: true };
  }

  const weights = spellings.map(rootEaseWeight);
  const avgEase = weights.reduce((a, b) => a + b, 0) / weights.length;
  const families = [...new Set(spellings.map(rhymeFamily))];
  const rhymeSpreadBonus = families.length >= 2 ? 0.05 : 0;
  const satPen = saturationPenalty(spellings, opts.analytics);
  const boundaryPen = opts.boundaryPenalty ?? 0;

  const score = Math.max(0, Math.min(1, avgEase + rhymeSpreadBonus - satPen - boundaryPen));

  return {
    score,
    avgEase,
    rhymeSpreadBonus,
    saturationPenalty: satPen,
    boundaryPenalty: boundaryPen,
    families,
    weights,
  };
}

/**
 * Pick easiest syllable from pool for new primitive proposals.
 * @param {Array<{ form: string, phonetic_cost?: number }>} syllablePool
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.usedForms]
 * @param {object|null} [opts.analytics]
 */
export function pickEasiestSyllable(syllablePool, opts = {}) {
  const used = new Set(opts.usedForms ?? []);
  let best = null;

  for (const syllable of syllablePool ?? []) {
    const form = syllable.form?.toLowerCase();
    if (!form || used.has(form)) continue;
    if (isExcludedSpelling(form)) continue;

    const { score } = computePhoneticScore([form], { analytics: opts.analytics });
    const syl = parseSyllable(form);
    const cvBonus = syl?.coda ? 0 : 0.02;

    const total = score + cvBonus - (syllable.phonetic_cost ?? 50) * 0.001;

    if (!best || total > best.total) {
      best = { form, score, total, syllable };
    }
  }

  return best;
}

/**
 * Phonetic guidance for LLM generation prompts (gap analyzer, vocab survey).
 * Steers the proposer toward easy-sound, distinct compounds up front instead
 * of relying on the downstream gate to throw proposals away.
 */
export function phoneticPromptBrief() {
  return [
    'Phonetic rules (compounds are judged on SPOKEN ease and distinctness):',
    `- Every root is one syllable. Onsets by cross-linguistic ease: very safe = ${[...VERY_SAFE_ONSETS].join(' ')}; fairly safe = ${[...FAIRLY_SAFE_ONSETS].join(' ')}; difficult (avoid when an alternative exists) = ${[...DIFFICULT_ONSETS].join(' ')}.`,
    '- A compound is the roots spoken back-to-back with no pause. Two identical consonants meeting at a join (e.g. bem + mam) are INVALID — pick a different root order or composition.',
    '- Prefer 2-root compounds; every extra syllable makes the word harder to follow by ear.',
    '- Prefer compositions whose roots differ clearly in sound (different onsets and vowels), so a listener can hear where one root ends and the next begins.',
  ].join('\n');
}

/**
 * Onset letter counts → tier shares for analytics.
 * @param {Record<string, number>} onsetFrequency
 */
export function computeOnsetTierShare(onsetFrequency) {
  let very = 0;
  let fairly = 0;
  let difficult = 0;
  let total = 0;

  for (const [onset, count] of Object.entries(onsetFrequency ?? {})) {
    total += count;
    if (VERY_SAFE_ONSETS.has(onset)) very += count;
    else if (FAIRLY_SAFE_ONSETS.has(onset)) fairly += count;
    else if (DIFFICULT_ONSETS.has(onset)) difficult += count;
  }

  if (!total) return { very_safe: 0, fairly_safe: 0, difficult: 0 };

  return {
    very_safe: very / total,
    fairly_safe: fairly / total,
    difficult: difficult / total,
  };
}
