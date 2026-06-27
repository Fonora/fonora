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

  cost = 70;
  for (const o1 of phonetics.preferred_onsets) {
    for (const o2 of phonetics.preferred_onsets) {
      if (o1 === o2) continue;
      add(o1 + 'a' + o2 + 'a', 'CV-CV', cost, 'disyllabic');
      add(o1 + 'a' + o2 + 'e', 'CV-CV', cost + 1, 'disyllabic');
      cost += 0.3;
    }
  }

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
  if (t >= 0.75 && (syllable.template === 'CV-CV' || syllable.template === 'CVC')) return 2500;
  if (t >= 0.55 && syllable.template === 'CV-CV') return 3500;
  if (t >= 0.35 && syllable.template === 'CV-CV') return 2000;
  return 0;
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

function pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP) {
  const targetCost = expectedPhoneticCost(concept.priority, minP, maxP);
  const ctxBase = {
    usedRoots,
    vowelEndingCounts: rhymeCounts,
    weights: {
      duplicate_root: 10000,
      prefix_overlap: 4000,
      vowel_ending_cap: 600,
      same_onset: 100,
      same_rhyme: 70,
      one_vowel_diff: 80,
      one_onset_diff: 60,
      similarity_high: 90,
    },
    maxVowelEnding: config.phonetics.max_cv_per_rhyme ?? 4,
    allowedPrefixPairs: [],
  };

  let best = null;
  for (const syllable of syllablePool) {
    if (usedRoots.includes(syllable.form)) continue;

    const distinctPenalty = distinctivenessPenalty(syllable.form, ctxBase);
    if (distinctPenalty >= ctxBase.weights.duplicate_root) continue;
    if (distinctPenalty >= ctxBase.weights.prefix_overlap
      && concept.priority > minP + (maxP - minP) * 0.5) continue;

    const costMismatch = Math.abs(syllable.phonetic_cost - targetCost);
    const flowPenalty = particleFlowPenalty(syllable.form, config.reserved_particles.forms)
      + compoundFlowPenalty(syllable.form, usedRoots);

    const onset = splitRoot(syllable.form).onset;
    const onsetOverload = Math.max(0, (onsetCounts.get(onset) ?? 0) - (config.phonetics.max_same_onset ?? 5));
    const rhyme = rhymeKey(syllable.form);
    const rhymeOverload = Math.max(0, (rhymeCounts.get(rhyme) ?? 0) - (config.phonetics.max_cv_per_rhyme ?? 4));

    const totalPenalty = distinctPenalty
      + flowPenalty
      + tierGate(concept.priority, minP, maxP, syllable)
      + costMismatch * 12
      + onsetOverload * 120
      + rhymeOverload * 150
      + (syllable.template === 'CVC' ? 30 : 0)
      + (syllable.template === 'CV-CV' ? 50 : 0)
      + (syllable.tier === 'tertiary-cv' ? 40 : 0);

    const candidate = {
      root: syllable.form,
      phonetic_cost: syllable.phonetic_cost,
      template: syllable.template,
      tier: syllable.tier,
      total_penalty: totalPenalty,
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
      best = { root: syllable.form, phonetic_cost: syllable.phonetic_cost, template: syllable.template, tier: syllable.tier, fallback: true };
      break;
    }
  }

  return best;
}

export function assignRoots(concepts, syllablePool, config, { lockedRoots = {} } = {}) {
  const priorities = concepts.map(c => c.priority);
  const minP = Math.min(...priorities);
  const maxP = Math.max(...priorities);
  const usedRoots = [];
  const rhymeCounts = new Map();
  const onsetCounts = new Map();
  const assignments = [];

  // Reserve every locked spelling up front so non-locked concepts (which may be
  // processed earlier in the list) can never collide with an approved root.
  const lockedForms = new Set();
  for (const concept of concepts) {
    const locked = lockedRoots[concept.id];
    if (!locked || lockedForms.has(locked)) continue;
    lockedForms.add(locked);
    usedRoots.push(locked);
    const rhyme = rhymeKey(locked);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(locked);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);
  }

  for (const concept of concepts) {
    const locked = lockedRoots[concept.id];
    if (locked) {
      assignments.push({
        id: concept.id,
        gloss: concept.gloss,
        domain: concept.domain,
        priority: concept.priority,
        root: locked,
        locked: true,
        scoring: { phonetic_cost: null },
      });
      continue;
    }

    const best = pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP);
    if (!best) throw new Error(`No syllable available for concept: ${concept.id}`);

    usedRoots.push(best.root);
    const rhyme = rhymeKey(best.root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(best.root);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);

    assignments.push({
      id: concept.id,
      gloss: concept.gloss,
      domain: concept.domain,
      priority: concept.priority,
      root: best.root,
      scoring: {
        phonetic_cost: Math.round(best.phonetic_cost * 10) / 10,
        template: best.template,
        tier: best.tier,
      },
    });
  }

  return assignments;
}

/** Reassign one concept, excluding spellings already taken. */
export function regenerateRoot(concept, syllablePool, config, usedRoots) {
  const rhymeCounts = new Map();
  const onsetCounts = new Map();
  for (const root of usedRoots) {
    const rhyme = rhymeKey(root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { onset } = splitRoot(root);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);
  }
  const minP = concept.priority;
  const maxP = concept.priority;
  const best = pickBestSyllable(concept, syllablePool, config, usedRoots, rhymeCounts, onsetCounts, minP, maxP);
  if (!best) throw new Error(`No alternate syllable for: ${concept.id}`);
  return best.root;
}

export function pronunciationEaseScore(phoneticCost, template) {
  if (phoneticCost == null) return 3;
  if (phoneticCost <= 4 && template === 'CV') return 5;
  if (phoneticCost <= 10 && template === 'CV') return 4;
  if (phoneticCost <= 25) return 3;
  if (template === 'CVC') return 2;
  return 1;
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
