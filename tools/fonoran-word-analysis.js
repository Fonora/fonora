/**
 * Shared word analysis for API and Word Manager UI.
 */

import {
  checkCompoundBoundary,
  segmentCompound,
  pronounceabilityScore,
  rootSimilarity,
} from './fonoran-gen3-readability.js';
import { parseSyllable, isValidSyllable } from './fonoran-pronunciation.js';

/**
 * @param {object} opts
 * @param {string} opts.type - root | compound
 * @param {string} [opts.spelling]
 * @param {string[]} [opts.components]
 * @param {string} [opts.meaning]
 * @param {object} [opts.lab]
 * @param {object} [opts.candidate]
 */
export function analyzeWord(opts) {
  const type = opts.type ?? 'compound';
  const spelling = (opts.spelling ?? '').trim().toLowerCase();
  const components = (opts.components ?? []).map(c => String(c).trim().toLowerCase()).filter(Boolean);

  if (type === 'root') {
    return analyzeRoot({ spelling, meaning: opts.meaning, lab: opts.lab, candidate: opts.candidate });
  }
  return analyzeCompound({ spelling, components, lab: opts.lab });
}

function reviewParseInventory(lab) {
  const sounds = lab?.sounds ?? [];
  return sounds
    .filter(s => s.state === 'approved' || s.state === 'needs_review' || s.state === 'draft')
    .map(s => (s.spelling ?? '').trim().toLowerCase())
    .filter(Boolean);
}

function analyzeRoot({ spelling, meaning, lab, candidate }) {
  const warnings = [];
  if (!spelling) {
    return {
      type: 'root',
      spelling,
      valid: false,
      pronounceability: 1,
      learnability: 1,
      memorability: 1,
      parseability: 5,
      boundaryWarnings: [],
      segmentationAmbiguity: [],
      collisionWarnings: warnings,
      syllableValid: false,
    };
  }

  const syllable = parseSyllable(spelling);
  const syllableValid = isValidSyllable(spelling);
  if (!syllableValid) {
    warnings.push({ type: 'invalid_syllable', message: 'Spelling is not a valid Fonoran syllable (CV/CVC).' });
  }

  const pron = pronounceabilityScore(spelling);
  const pronounceability = Math.max(1, Math.min(5, Math.round(pron.score / 20)));

  const inventory = reviewParseInventory(lab);
  for (const other of inventory) {
    if (other === spelling) continue;
    const sim = rootSimilarity(spelling, other);
    if (sim >= 0.85) {
      warnings.push({ type: 'lookalike', message: `Similar to existing root "${other}" (${Math.round(sim * 100)}%).` });
    }
    if (other.startsWith(spelling) || spelling.startsWith(other)) {
      warnings.push({ type: 'prefix', message: `Prefix overlap with "${other}".` });
    }
  }

  const gen = candidate?.generation ?? {};
  const learnability = candidate?.semantic_usefulness ?? candidate?.pronunciation_ease ?? pronounceability;
  const memorability = gen.distinctiveness_score != null
    ? Math.max(1, Math.min(5, Math.round(gen.distinctiveness_score / 20)))
    : pronounceability;

  return {
    type: 'root',
    spelling,
    meaning: meaning ?? candidate?.concept ?? null,
    valid: syllableValid,
    pronounceability: candidate?.pronunciation_ease ?? pronounceability,
    learnability: Math.max(1, Math.min(5, learnability)),
    memorability,
    parseability: 5,
    compoundFlow: gen.compound_flow_score ?? null,
    boundaryWarnings: candidate?.boundary_warnings ?? [],
    segmentationAmbiguity: [],
    collisionWarnings: [...warnings, ...(candidate?.collision_warnings ?? [])],
    syllableValid,
    syllable,
  };
}

function analyzeCompound({ spelling, components, lab }) {
  const partSpellings = components.length
    ? components
    : (spelling ? [spelling] : []);
  const inventory = reviewParseInventory(lab);
  const segmentations = spelling ? segmentCompound(spelling, inventory) : [];
  const parseScore = !spelling ? 1
    : segmentations.length === 0 ? 1
      : segmentations.length === 1 ? 5
        : segmentations.length === 2 ? 3
          : 2;
  const pronScore = spelling
    ? Math.max(1, Math.min(5, Math.round(pronounceabilityScore(spelling).score / 20)))
    : 1;

  const boundaryResult = partSpellings.length >= 2
    ? checkCompoundBoundary(partSpellings)
    : { valid: true, violations: [] };

  return {
    type: 'compound',
    spelling,
    components: partSpellings,
    pronounceability: pronScore,
    parseability: parseScore,
    learnability: pronScore,
    memorability: parseScore,
    boundaryWarnings: boundaryResult.violations ?? [],
    segmentationAmbiguity: segmentations.length > 1
      ? segmentations.slice(0, 8).map(s => s.join('+'))
      : [],
    collisionWarnings: [],
    segmentations: segmentations.slice(0, 8),
  };
}

export function analysisDelta(current, proposed) {
  if (!current || !proposed) return null;
  const keys = ['pronounceability', 'parseability', 'learnability', 'memorability'];
  /** @type {Record<string, number>} */
  const delta = {};
  for (const k of keys) {
    if (current[k] != null && proposed[k] != null) {
      delta[k] = proposed[k] - current[k];
    }
  }
  return delta;
}
