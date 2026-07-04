/**
 * Phonetic syllable assignment for Fonoran root candidates.
 * Shortest, easiest sounds go to highest-priority concepts.
 */

import {
  distinctivenessPenalty,
  distinctivenessScore,
  rhymeKey,
  splitRoot,
} from './fonoran-gen3-distinctiveness.js';
import { scoreEditorialCollision, collisionSafetyScore } from './fonoran-root-collision.js';
import { scoreCompoundBoundary, boundaryPenalty } from './fonoran-root-boundary-score.js';

const GRAMMAR_PARTICLE_PHRASES = [
  ['mi'],
  ['mi', 'ta'],
  ['mi', 'na'],
];

export function isExcludedSyllable(form, excluded) {
  const lower = form.toLowerCase();
  return excluded.some(ex => lower === ex || lower.startsWith(ex));
}

export function buildSyllablePool(config) {
  const { phonetics, reserved_particles, excluded_syllables } = config;
  const reserved = new Set(reserved_particles.forms.map(s => s.toLowerCase()));
  const excluded = excluded_syllables.forms.map(s => s.toLowerCase());
  const pool = [];

  const add = (form, template, cost, tier) => {
    const f = form.toLowerCase();
    if (!f || reserved.has(f) || isExcludedSyllable(f, excluded)) return;
    if (pool.some(p => p.form === f)) return;
    pool.push({ form: f, template, phonetic_cost: cost, tier });
  };

  let cost = 1;
  for (const onset of phonetics.preferred_onsets) {
    for (const vowel of phonetics.vowels_by_cost) {
      const vowelCost = phonetics.vowels_by_cost.indexOf(vowel);
      add(onset + vowel, 'CV', cost + vowelCost, vowel === 'a' ? 'preferred-cv-a' : 'preferred-cv');
    }
    cost++;
  }

  cost = 20;
  for (const onset of phonetics.secondary_onsets) {
    for (const vowel of phonetics.vowels_by_cost) {
      const vowelCost = phonetics.vowels_by_cost.indexOf(vowel);
      add(onset + vowel, 'CV', cost + vowelCost, 'secondary-cv');
    }
    cost++;
  }

  cost = 35;
  for (const onset of phonetics.tertiary_onsets) {
    for (const vowel of ['a', 'e', 'u']) {
      add(onset + vowel, 'CV', cost, 'tertiary-cv');
    }
    cost++;
  }

  cost = 50;
  for (const onset of phonetics.coda_onsets) {
    for (const vowel of ['a', 'e']) {
      for (const coda of ['n', 'm', 't', 'k', 's', 'l']) {
        add(onset + vowel + coda, 'CVC', cost, 'cvc');
        cost += 0.1;
      }
    }
  }

  // CV-CV disyllabic forms intentionally excluded.
  // Primitive roots are one syllable only: CV or CVC.
  // Multi-syllable forms are reserved for compounds and derived words.

  pool.sort((a, b) => a.phonetic_cost - b.phonetic_cost || a.form.localeCompare(b.form));
  return pool;
}

function expectedPhoneticCost(priority, minP, maxP) {
  const span = maxP - minP || 1;
  const t = (priority - minP) / span;
  return 1 + (1 - t) * 85;
}

function tierGate(priority, minP, maxP, syllable) {
  const span = maxP - minP || 1;
  const t = (priority - minP) / span;
  if (t >= 0.92 && syllable.template !== 'CV') return 4000;
  if (t >= 0.75 && syllable.template === 'CVC') return 2500;
  return 0;
}

/**
 * Keep premium CV syllables for important concepts. Extended/questionable
 * concepts (low priority weight) are pushed away from preferred CV slots unless
 * nothing else fits — this is a penalty, not a hard block.
 */
function priorityClassGate(priorityWeight, syllable) {
  if (priorityWeight == null) return 0;
  if (priorityWeight <= 40 && (syllable.tier === 'preferred-cv-a' || syllable.tier === 'preferred-cv')) {
    return 1500;
  }
  return 0;
}

/**
 * Distinctiveness multiplier: essential/common concepts spread out harder so
 * unrelated high-frequency roots do not cluster (ba/be/bi/bo, ban/dan/gan…).
 */
function spreadMultiplier(priorityWeight) {
  if (priorityWeight == null) return 1.3;
  if (priorityWeight >= 80) return 1.8;
  if (priorityWeight >= 60) return 1.3;
  return 1;
}

function particleFlowPenalty(root, particles) {
  let penalty = 0;
  for (const phrase of GRAMMAR_PARTICLE_PHRASES) {
    if (root.startsWith(phrase[phrase.length - 1])) penalty += 200;
    if (phrase.some(p => p === root)) penalty += 5000;
    const lastParticle = phrase[phrase.length - 1];
    if (root.endsWith(lastParticle) && root.length > lastParticle.length) penalty += 80;
    const concat = phrase.join('') + root;
    if (/(.)\1{2,}/.test(concat)) penalty += 60;
  }
  return penalty;
}

function compoundFlowPenalty(root, usedRoots) {
  let penalty = 0;
  for (const other of usedRoots.slice(-30)) {
    if (root === other) penalty += 5000;
    if (root.endsWith(other) || other.endsWith(root)) penalty += 25;
    const { onset: o1, ending: e1 } = splitRoot(root);
    const { onset: o2, ending: e2 } = splitRoot(other);
    if (e1 === e2 && o1 === o2) penalty += 50;
  }
  return penalty;
}

function pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP, opts = {}) {
  const { collisionProfile = null, partnerMap = null, spellingByConcept = {} } = opts;
  const targetCost = expectedPhoneticCost(concept.priority, minP, maxP);
  const spread = spreadMultiplier(concept.priority_weight);
  const priorityOnsetCap = config.phonetics.max_same_onset_priority ?? 3;
  const ctxBase = {
    usedRoots,
    vowelEndingCounts: rhymeCounts,
    weights: {
      duplicate_root: 10000,
      prefix_overlap: 4000,
      vowel_ending_cap: 600,
      same_onset: Math.round(100 * spread),
      same_rhyme: Math.round(70 * spread),
      one_vowel_diff: Math.round(80 * spread),
      one_onset_diff: Math.round(60 * spread),
      similarity_high: Math.round(90 * spread),
    },
    maxVowelEnding: config.phonetics.max_cv_per_rhyme ?? 4,
    allowedPrefixPairs: [],
  };

  let best = null;
  for (const syllable of syllablePool) {
    if (usedRoots.includes(syllable.form)) continue;

    const collision = scoreEditorialCollision(syllable.form, collisionProfile);
    if (collision.blocked) continue;

    const distinctPenalty = distinctivenessPenalty(syllable.form, ctxBase);
    if (distinctPenalty >= ctxBase.weights.duplicate_root) continue;
    if (distinctPenalty >= ctxBase.weights.prefix_overlap
      && concept.priority > minP + (maxP - minP) * 0.5) continue;

    const costMismatch = Math.abs(syllable.phonetic_cost - targetCost);
    const flowPenalty = particleFlowPenalty(syllable.form, config.reserved_particles.forms)
      + compoundFlowPenalty(syllable.form, usedRoots);

    const boundary = scoreCompoundBoundary(concept.id, syllable.form, partnerMap, spellingByConcept);

    const onset = splitRoot(syllable.form).onset;
    const onsetOverload = Math.max(0, (onsetCounts.get(onset) ?? 0) - (config.phonetics.max_same_onset ?? 5));
    const onsetPriorityOverload = concept.priority_weight >= 80
      ? Math.max(0, (onsetCounts.get(onset) ?? 0) - priorityOnsetCap)
      : 0;
    const rhyme = rhymeKey(syllable.form);
    const rhymeOverload = Math.max(0, (rhymeCounts.get(rhyme) ?? 0) - (config.phonetics.max_cv_per_rhyme ?? 4));

    const totalPenalty = distinctPenalty
      + flowPenalty
      + collision.penalty
      + boundaryPenalty(boundary.warnings.length)
      + tierGate(concept.priority, minP, maxP, syllable)
      + priorityClassGate(concept.priority_weight, syllable)
      + costMismatch * 12
      + onsetOverload * 120
      + onsetPriorityOverload * 200
      + rhymeOverload * 150
      + (syllable.template === 'CVC' ? 30 : 0)
      + (syllable.tier === 'tertiary-cv' ? 40 : 0);

    const candidate = {
      root: syllable.form,
      phonetic_cost: syllable.phonetic_cost,
      template: syllable.template,
      tier: syllable.tier,
      total_penalty: totalPenalty,
      distinct_penalty: distinctPenalty,
      collision,
      boundary,
    };

    if (!best
      || candidate.total_penalty < best.total_penalty
      || (candidate.total_penalty === best.total_penalty && candidate.phonetic_cost < best.phonetic_cost)) {
      best = candidate;
    }
  }

  if (!best) {
    for (const syllable of syllablePool) {
      if (usedRoots.includes(syllable.form)) continue;
      if (scoreEditorialCollision(syllable.form, collisionProfile).blocked) continue;
      const collision = scoreEditorialCollision(syllable.form, collisionProfile);
      const boundary = scoreCompoundBoundary(concept.id, syllable.form, partnerMap, spellingByConcept);
      best = {
        root: syllable.form,
        phonetic_cost: syllable.phonetic_cost,
        template: syllable.template,
        tier: syllable.tier,
        distinct_penalty: 0,
        collision,
        boundary,
        fallback: true,
      };
      break;
    }
  }

  if (best) {
    best.scores = scoringFromBest(best);
  }
  return best;
}

/** Derive the display scores + warnings carried onto a candidate. */
function scoringFromBest(best) {
  const distinctivenessScoreVal = Math.max(0, Math.min(100, Math.round(100 - (best.distinct_penalty ?? 0) / 20)));
  const collision = best.collision ?? { penalty: 0, blocked: false, warnings: [] };
  const boundary = best.boundary ?? { score: 100, warnings: [] };
  return {
    distinctiveness_score: distinctivenessScoreVal,
    editorial_collision_score: collisionSafetyScore(collision.penalty, collision.blocked),
    collision_warnings: collision.warnings ?? [],
    compound_flow_score: boundary.score ?? 100,
    boundary_warnings: boundary.warnings ?? [],
  };
}

export function assignRoots(concepts, syllablePool, config, { lockedRoots = {}, collisionProfile = null, partnerMap = null, reservedForms = [] } = {}) {
  const priorities = concepts.map(c => c.priority);
  const minP = Math.min(...priorities);
  const maxP = Math.max(...priorities);
  const usedRoots = [];
  const rhymeCounts = new Map();
  const onsetCounts = new Map();
  const assignments = [];
  // concept id -> current spelling, fed to compound-boundary scoring as it grows.
  const spellingByConcept = {};

  // Reserve rejected spellings up front so they are never auto-reassigned to
  // another concept (a rejected form must be manually restored to return).
  for (const form of reservedForms) {
    const f = String(form ?? '').toLowerCase();
    if (!f || usedRoots.includes(f)) continue;
    usedRoots.push(f);
    const rhyme = rhymeKey(f);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(f);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);
  }

  // Reserve every locked spelling up front so non-locked concepts (which may be
  // processed earlier in the list) can never collide with an approved root.
  const lockedForms = new Set();
  for (const concept of concepts) {
    const locked = lockedRoots[concept.id];
    if (!locked || lockedForms.has(locked)) continue;
    lockedForms.add(locked);
    usedRoots.push(locked);
    spellingByConcept[concept.id] = locked;
    const rhyme = rhymeKey(locked);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(locked);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);
  }

  const pickOpts = { collisionProfile, partnerMap, spellingByConcept };

  for (const concept of concepts) {
    const locked = lockedRoots[concept.id];
    if (locked) {
      assignments.push({
        id: concept.id,
        gloss: concept.gloss,
        domain: concept.domain,
        priority: concept.priority,
        priority_class: concept.priority_class,
        priority_weight: concept.priority_weight,
        root: locked,
        locked: true,
        scoring: { phonetic_cost: null },
      });
      continue;
    }

    const best = pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP, pickOpts);
    if (!best) throw new Error(`No syllable available for concept: ${concept.id}`);

    usedRoots.push(best.root);
    spellingByConcept[concept.id] = best.root;
    const rhyme = rhymeKey(best.root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(best.root);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);

    assignments.push({
      id: concept.id,
      gloss: concept.gloss,
      domain: concept.domain,
      priority: concept.priority,
      priority_class: concept.priority_class,
      priority_weight: concept.priority_weight,
      root: best.root,
      scoring: {
        phonetic_cost: Math.round(best.phonetic_cost * 10) / 10,
        template: best.template,
        tier: best.tier,
        ...(best.scores ?? {}),
      },
    });
  }

  return assignments;
}

/**
 * Reassign one concept, excluding spellings already taken.
 * @param {object} opts { minP, maxP, collisionProfile, partnerMap, spellingByConcept }
 */
export function regenerateRoot(concept, syllablePool, config, usedRoots, opts = {}) {
  const rhymeCounts = new Map();
  const onsetCounts = new Map();
  for (const root of usedRoots) {
    const rhyme = rhymeKey(root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(root);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);
  }
  const minP = opts.minP ?? concept.priority;
  const maxP = opts.maxP ?? concept.priority;
  const best = pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP, {
    collisionProfile: opts.collisionProfile ?? null,
    partnerMap: opts.partnerMap ?? null,
    spellingByConcept: opts.spellingByConcept ?? {},
  });
  if (!best) throw new Error(`No alternate syllable for: ${concept.id}`);
  return best;
}

export function pronunciationEaseScore(phoneticCost, template) {
  if (phoneticCost == null) return 3;
  if (phoneticCost <= 4 && template === 'CV') return 5;
  if (phoneticCost <= 10 && template === 'CV') return 4;
  if (phoneticCost <= 25) return 3;
  return 2; // CVC
}

export function easeLabel(score) {
  if (score >= 5) return 'very easy';
  if (score >= 4) return 'easy';
  if (score >= 3) return 'moderate';
  if (score >= 2) return 'somewhat difficult';
  return 'difficult';
}

export function usefulnessLabel(score) {
  if (score >= 5) return 'very high';
  if (score >= 4) return 'high';
  if (score >= 3) return 'moderate';
  return 'low';
}

export { pickEasiestSyllable } from './fonoran-phonetic-weights.js';
