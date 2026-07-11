/**
 * Spoken confusability and boundary-quality scoring for Fonoran compounds.
 *
 * Uses phoneme-feature distance (place/manner/voicing for consonants,
 * height/backness for vowels) — not orthographic Levenshtein — to flag
 * compound surfaces that may be hard to distinguish by ear.
 *
 * See RN-30 / synthetic-only validity strategy.
 */

import { parseSyllable } from './fonoran-pronunciation.js';
import { levenshtein } from './fonoran-gen3-distinctiveness.js';
import { checkCompoundBoundary } from './fonoran-gen3-readability.js';

/** @typedef {{ type: 'C'|'V', key: string, place?: string, manner?: string, voicing?: string, height?: string, backness?: string }} PhonemeFeat */

const CONSONANT_PLACE = {
  p: 'bilabial', b: 'bilabial', m: 'bilabial',
  t: 'alveolar', d: 'alveolar', n: 'alveolar', s: 'alveolar', l: 'alveolar', r: 'alveolar',
  k: 'velar', g: 'velar', ng: 'velar',
  f: 'labiodental', v: 'labiodental',
  ch: 'postalveolar', sh: 'postalveolar', j: 'postalveolar',
  h: 'glottal', w: 'labiovelar', y: 'palatal',
  th: 'dental', dh: 'dental', z: 'alveolar', x: 'velar',
};

const CONSONANT_MANNER = {
  p: 'stop', b: 'stop', t: 'stop', d: 'stop', k: 'stop', g: 'stop',
  m: 'nasal', n: 'nasal', ng: 'nasal',
  f: 'fricative', v: 'fricative', s: 'fricative', z: 'fricative',
  h: 'fricative', th: 'fricative', dh: 'fricative',
  ch: 'affricate', sh: 'fricative', j: 'affricate', x: 'fricative',
  l: 'liquid', r: 'liquid', w: 'glide', y: 'glide',
};

const VOICED = new Set(['b', 'd', 'g', 'v', 'z', 'dh', 'j', 'm', 'n', 'ng', 'l', 'r', 'w', 'y']);

const VOWEL_HEIGHT = {
  a: 'low', ae: 'low',
  e: 'mid', oh: 'mid', ay: 'mid',
  i: 'high', ee: 'high', eye: 'high',
  o: 'mid', u: 'high', ow: 'high', oy: 'mid',
};

const VOWEL_BACKNESS = {
  a: 'central', ae: 'front',
  e: 'front', i: 'front', ee: 'front', eye: 'front', ay: 'front',
  o: 'back', u: 'back', oh: 'back', ow: 'back', oy: 'back',
};

/** Same articulatory place — confusable at speed even when not identical. */
const SAME_PLACE_PAIRS = [
  ['m', 'n'], ['p', 'b'], ['t', 'd'], ['k', 'g'], ['f', 'v'], ['s', 'z'], ['ch', 'sh'],
];

const NEAR_PAIR_THRESHOLD = 0.12;
const BOUNDARY_PENALTY_SCALE = 0.12;

/**
 * @param {string} phoneme
 * @returns {PhonemeFeat|null}
 */
export function phonemeFeatures(phoneme) {
  const key = String(phoneme ?? '').toLowerCase();
  if (!key) return null;
  if (VOWEL_HEIGHT[key] != null) {
    return {
      type: 'V',
      key,
      height: VOWEL_HEIGHT[key],
      backness: VOWEL_BACKNESS[key] ?? 'central',
    };
  }
  if (CONSONANT_PLACE[key]) {
    return {
      type: 'C',
      key,
      place: CONSONANT_PLACE[key],
      manner: CONSONANT_MANNER[key] ?? 'other',
      voicing: VOICED.has(key) ? 'voiced' : 'voiceless',
    };
  }
  return { type: 'C', key, place: 'other', manner: 'other', voicing: 'unknown' };
}

/**
 * @param {PhonemeFeat|null} a
 * @param {PhonemeFeat|null} b
 * @returns {number} 0 = identical, 1 = maximally different
 */
export function phonemeFeatureDistance(a, b) {
  if (!a || !b) return 1;
  if (a.key === b.key) return 0;
  if (a.type !== b.type) return 0.85;

  if (a.type === 'V') {
    let d = 0;
    if (a.height !== b.height) d += 0.45;
    if (a.backness !== b.backness) d += 0.35;
    return Math.min(1, d);
  }

  let d = 0;
  if (a.place !== b.place) d += 0.4;
  else d += 0.15; // same place, different phoneme (m/n, t/d)
  if (a.manner !== b.manner) d += 0.25;
  if (a.voicing !== b.voicing) d += 0.15;
  return Math.min(1, d);
}

/**
 * Expand a root spelling into an ordered phoneme feature sequence.
 * @param {string} spelling
 * @returns {PhonemeFeat[]}
 */
export function spellingToPhonemes(spelling) {
  const syl = parseSyllable(String(spelling ?? '').toLowerCase());
  if (!syl || syl.unparsed) {
    return String(spelling ?? '').split('').map(c => phonemeFeatures(c)).filter(Boolean);
  }
  const out = [];
  if (syl.onset) out.push(phonemeFeatures(syl.onset));
  if (syl.vowel) out.push(phonemeFeatures(syl.vowel));
  if (syl.coda) out.push(phonemeFeatures(syl.coda));
  return out;
}

/**
 * Ordered phoneme sequence for a compound surface (roots concatenated).
 * @param {string[]} rootSpellings
 */
export function compoundPhonemeSequence(rootSpellings) {
  return (rootSpellings ?? []).flatMap(s => spellingToPhonemes(s));
}

/**
 * Normalized edit distance on phoneme feature vectors.
 * @param {PhonemeFeat[]} seqA
 * @param {PhonemeFeat[]} seqB
 */
export function sequencePhoneticDistance(seqA, seqB) {
  if (!seqA.length && !seqB.length) return 0;
  const m = seqA.length;
  const n = seqB.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = phonemeFeatureDistance(seqA[i - 1], seqB[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  const raw = dp[m][n];
  const denom = Math.max(m, n, 1);
  return raw / denom;
}

/**
 * Similarity score 0..1 (1 = maximally distinct).
 */
export function compoundDistinctnessScore(surfaceA, surfaceB) {
  if (!surfaceA || !surfaceB || surfaceA === surfaceB) return 1;
  const dist = sequencePhoneticDistance(
    spellingToPhonemes(surfaceA),
    spellingToPhonemes(surfaceB),
  );
  return Math.max(0, Math.min(1, 1 - dist));
}

function trailingLeadingPhonemes(left, right) {
  const leftSyl = parseSyllable(String(left ?? '').toLowerCase());
  const rightSyl = parseSyllable(String(right ?? '').toLowerCase());
  const trailing = leftSyl?.coda
    ? phonemeFeatures(leftSyl.coda)
    : (leftSyl?.vowel ? phonemeFeatures(leftSyl.vowel) : null);
  const leading = rightSyl?.onset
    ? phonemeFeatures(rightSyl.onset)
    : (rightSyl?.vowel ? phonemeFeatures(rightSyl.vowel) : null);
  return { trailing, leading };
}

function isSamePlacePair(a, b) {
  if (!a?.key || !b?.key) return false;
  return SAME_PLACE_PAIRS.some(([x, y]) =>
    (a.key === x && b.key === y) || (a.key === y && b.key === x));
}

/**
 * Soft boundary-quality score for a root sequence (0..1, higher = clearer joins).
 * Penalizes vowel–vowel joins and same-place consonant pairs at boundaries.
 * @param {string[]} rootSpellings
 */
export function computeBoundaryQuality(rootSpellings) {
  const parts = (rootSpellings ?? []).filter(Boolean);
  if (parts.length < 2) {
    return { score: 1, penalty: 0, issues: [] };
  }

  const boundary = checkCompoundBoundary(parts);
  if (!boundary.valid) {
    return { score: 0, penalty: 1, issues: boundary.violations.map(v => v.reason) };
  }

  let penalty = 0;
  const issues = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const { trailing, leading } = trailingLeadingPhonemes(parts[i], parts[i + 1]);
    if (trailing?.type === 'V' && leading?.type === 'V') {
      penalty += 0.22;
      issues.push(`vowel-vowel join: ${parts[i]}|${parts[i + 1]}`);
    }
    if (trailing?.type === 'C' && leading?.type === 'C' && isSamePlacePair(trailing, leading)) {
      penalty += 0.14;
      issues.push(`same-place consonants: ${trailing.key}+${leading.key}`);
    }
    if (trailing?.type === 'C' && leading?.type === 'V') {
      penalty -= 0.03; // CVC·CV rhythm — reward slightly
    }
  }

  penalty = Math.max(0, Math.min(0.55, penalty));
  return {
    score: Math.max(0, 1 - penalty),
    penalty,
    issues,
  };
}

/**
 * Minimum distinctness vs all other surfaces in the inventory.
 * @param {string} surface
 * @param {string[]} allSurfaces
 */
export function minDistinctnessFromInventory(surface, allSurfaces) {
  let minScore = 1;
  for (const other of allSurfaces) {
    if (other === surface) continue;
    const score = compoundDistinctnessScore(surface, other);
    if (score < minScore) minScore = score;
  }
  return minScore;
}

/**
 * Find near-confusable compound pairs in an inventory.
 * @param {Array<{ concept: string, surface: string }>} entries
 * @param {number} [threshold]
 */
export function findNearConfusablePairs(entries, threshold = NEAR_PAIR_THRESHOLD) {
  const pairs = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (!a.surface || !b.surface || a.surface === b.surface) continue;
      const dist = sequencePhoneticDistance(
        spellingToPhonemes(a.surface),
        spellingToPhonemes(b.surface),
      );
      if (dist <= threshold) {
        pairs.push({
          a: a.concept,
          b: b.concept,
          surfaceA: a.surface,
          surfaceB: b.surface,
          distance: dist,
          distinctness: 1 - dist,
        });
      }
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}

/**
 * Combined soft penalty for proposal gate / phonetic scoring.
 * @param {string[]} rootSpellings
 * @param {object} [opts]
 * @param {string[]} [opts.existingSurfaces]
 * @param {string} [opts.surface]
 */
export function confusabilityPenalty(rootSpellings, opts = {}) {
  const boundary = computeBoundaryQuality(rootSpellings);
  let penalty = boundary.penalty * BOUNDARY_PENALTY_SCALE;

  const surface = opts.surface ?? rootSpellings.join('');
  if (opts.existingSurfaces?.length && surface) {
    const minDistinct = minDistinctnessFromInventory(surface, opts.existingSurfaces);
    if (minDistinct < 0.55) {
      penalty += (0.55 - minDistinct) * 0.25;
    }
  }

  return {
    penalty: Math.min(0.35, penalty),
    boundary,
    minDistinctness: opts.existingSurfaces?.length
      ? minDistinctnessFromInventory(surface, opts.existingSurfaces)
      : null,
  };
}

/**
 * Full confusability audit over live compounds.
 * @param {object[]} compounds  rows with concept + preferred composition
 * @param {Record<string, string>} rootById
 * @param {object} resolver  composition resolver with flatRoots
 */
export function auditCompoundConfusability(compounds, rootById, resolver) {
  const entries = [];
  const boundaryIssues = [];

  for (const c of compounds ?? []) {
    const composition = c.preferred?.composition ?? c.composition ?? [];
    const flatIds = resolver.flatRoots(composition) ?? [];
    const spellings = flatIds.map(id => rootById[id]).filter(Boolean);
    if (!spellings.length) continue;
    const surface = spellings.join('');
    const boundary = computeBoundaryQuality(spellings);
    if (boundary.issues.length) {
      boundaryIssues.push({
        concept: c.concept,
        surface,
        score: boundary.score,
        issues: boundary.issues,
      });
    }
    entries.push({ concept: c.concept, surface, flatCount: flatIds.length, boundary });
  }

  const nearPairs = findNearConfusablePairs(entries);
  const surfaces = entries.map(e => e.surface);

  return {
    compound_count: entries.length,
    near_pair_count: nearPairs.length,
    near_pairs: nearPairs.slice(0, 50),
    boundary_issues: boundaryIssues.sort((a, b) => a.score - b.score).slice(0, 40),
    avg_boundary_score: entries.length
      ? entries.reduce((s, e) => s + e.boundary.score, 0) / entries.length
      : 0,
    surfaces,
  };
}

export { NEAR_PAIR_THRESHOLD, BOUNDARY_PENALTY_SCALE };
