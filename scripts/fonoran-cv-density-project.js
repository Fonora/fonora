#!/usr/bin/env node
/**
 * CV density thought-experiment projections (read-only; no seed writes).
 *
 *   npm run fonoran:cv-density:project
 *
 * Writes data/fonoran-cv-density-projection.json and prints a summary.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSyllable } from '../tools/fonoran-pronunciation.js';
import {
  buildPrefixSafeInventory,
  findPrefixConflicts,
  isPrefixSafe,
  syllableTemplate,
} from '../tools/fonoran-prefix-safe.js';
import { buildSyllablePool } from '../tools/fonoran-root-sound-assign.js';
import { analyzeAmbiguity, auditScores } from '../tools/fonoran-gen3-readability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/fonoran-cv-density-projection.json');

const RING1_CV_BUDGET_DEFAULT = 12; // particles + deixis-scale closed set

function tpl(sp) {
  return syllableTemplate(sp);
}

function shapeCounts(items, getSpelling) {
  const out = { CV: 0, CVC: 0, other: 0 };
  for (const item of items) {
    out[tpl(getSpelling(item))]++;
  }
  return out;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

const approvedRoots = JSON.parse(await readFile(join(ROOT, 'data/fonoran-approved-roots.json'), 'utf8'));
const candidates = JSON.parse(await readFile(join(ROOT, 'data/fonoran-root-candidates.json'), 'utf8'));
const compounds = JSON.parse(await readFile(join(ROOT, 'data/fonoran-compounds.json'), 'utf8'));
const ringsDoc = JSON.parse(await readFile(join(ROOT, 'data/fonoran-root-rings.json'), 'utf8'));
const phoneticsConfig = JSON.parse(await readFile(join(ROOT, 'data/fonoran-primitive-roots-config.json'), 'utf8'));

const roots = (approvedRoots.roots ?? []).map((r) => ({
  id: r.id,
  spelling: String(r.spelling || '').toLowerCase(),
  concept: r.concept ?? r.id,
  template: tpl(r.spelling),
}));
const byId = Object.fromEntries(roots.map((r) => [r.id, r]));
const taken = roots.map((r) => r.spelling);

// Priority class from candidates
const candById = Object.fromEntries((candidates.candidates ?? []).map((c) => [c.id, c]));
const byPriority = {};
for (const r of roots) {
  const cls = candById[r.id]?.priority_class ?? 'unknown';
  byPriority[cls] ??= { CV: 0, CVC: 0, other: 0, ids: [] };
  byPriority[cls][r.template]++;
  byPriority[cls].ids.push(r.id);
}

// Rings
const ringStats = (ringsDoc.rings ?? []).map((ring) => {
  const ids = ring.concept_ids ?? [];
  const present = ids.map((id) => byId[id]).filter(Boolean);
  const missing = ids.filter((id) => !byId[id]);
  const counts = shapeCounts(present, (r) => r.spelling);
  return {
    ring: ring.ring,
    id: ring.id,
    label: ring.label,
    concept_count: ids.length,
    present: present.length,
    missing,
    ...counts,
    cv_pct: pct(counts.CV, counts.CV + counts.CVC),
    cv_spellings: present.filter((r) => r.template === 'CV').map((r) => `${r.spelling}=${r.id}`),
    cvc_spellings: present.filter((r) => r.template === 'CVC').map((r) => `${r.spelling}=${r.id}`),
  };
});

// Compound join patterns
const joinPatterns = {};
const partShapes = { CV: 0, CVC: 0, other: 0, miss: 0, total: 0 };
const compositionLens = {};
let compoundCharSum = 0;
let compoundCount = 0;

for (const c of compounds.compounds ?? []) {
  const comp = c.preferred?.composition ?? [];
  compositionLens[comp.length] = (compositionLens[comp.length] || 0) + 1;
  const shapes = [];
  for (const id of comp) {
    partShapes.total++;
    const r = byId[id];
    if (!r) {
      partShapes.miss++;
      shapes.push('?');
    } else {
      partShapes[r.template]++;
      shapes.push(r.template);
    }
  }
  const key = shapes.join('+') || '(empty)';
  joinPatterns[key] = (joinPatterns[key] || 0) + 1;

  // Approximate spelling length from root spellings
  const sp = comp.map((id) => byId[id]?.spelling ?? '').join('');
  if (sp) {
    compoundCharSum += sp.length;
    compoundCount++;
  }
}

const topJoins = Object.entries(joinPatterns)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([pattern, count]) => ({ pattern, count }));

// Prefix-safe pool snapshot
const prefixInv = buildPrefixSafeInventory({ approvedRoots, phoneticsConfig });
const pool = buildSyllablePool(phoneticsConfig);
const freeCvcSafe = prefixInv.pool_available.CVC_prefix_safe;
const freeCvBlocked = prefixInv.pool_available.CV_blocked;

// Arbitrary-feeling exclusivity examples: free CV blocked by unrelated CVC family
const exclusivityExamples = (freeCvBlocked || [])
  .slice(0, 12)
  .map((row) => ({
    wanted_cv: row.form,
    blocked_by: row.blocked_by,
    note: `Assigning CV "${row.form}" is blocked while ${row.blocked_by.slice(0, 4).join(', ')}${row.blocked_by.length > 4 ? '…' : ''} exist — not a judgment about the concept's meaning.`,
  }));

// Counterfactual A: relax essential→CV gate — which essentials could take a free prefix-safe CVC?
const essentialIds = (byPriority.essential?.ids ?? []);
const essentialCv = essentialIds
  .map((id) => byId[id])
  .filter((r) => r && r.template === 'CV');

const counterfactualA = {
  description: 'Relax essential→CV assigner gate: each essential CV root could move to a distinct free prefix-safe CVC (pool today), without touching other roots.',
  essential_cv_count: essentialCv.length,
  free_prefix_safe_cvc_available: freeCvcSafe.length,
  free_prefix_safe_cvc: freeCvcSafe,
  essentials_that_could_move_today: Math.min(essentialCv.length, freeCvcSafe.length),
  bottleneck: freeCvcSafe.length < essentialCv.length
    ? `Only ${freeCvcSafe.length} free prefix-safe CVCs; ${essentialCv.length - freeCvcSafe.length} essentials would need new CVC invent / family reshuffle.`
    : 'Enough free CVC slots for all essential CVs (under exclusivity vs current taken set).',
  sample_moves: essentialCv.slice(0, freeCvcSafe.length).map((r, i) => ({
    id: r.id,
    from: r.spelling,
    to: freeCvcSafe[i],
  })),
};

// Counterfactual B: Ring-1 CV budget
const ring1 = ringStats.find((r) => r.ring === 1);
const ring1CvRoots = (ring1?.cv_spellings ?? []).map((s) => {
  const [spelling, id] = s.split('=');
  return { spelling, id };
});
const overBudget = Math.max(0, ring1CvRoots.length - RING1_CV_BUDGET_DEFAULT);
const counterfactualB = {
  description: `Cap Ring 1 at ${RING1_CV_BUDGET_DEFAULT} CV roots (particles/deixis-scale closed set); excess Ring-1 CVs would need CVC alternatives.`,
  ring1_cv_budget: RING1_CV_BUDGET_DEFAULT,
  ring1_cv_today: ring1CvRoots.length,
  ring1_cvc_today: ring1?.CVC ?? 0,
  would_need_cvc_alternatives: overBudget,
  excess_cv_sample: ring1CvRoots.slice(RING1_CV_BUDGET_DEFAULT, RING1_CV_BUDGET_DEFAULT + 15),
  estimated_compound_char_delta_if_excess_gain_one_coda: (() => {
    // Rough: each moved root appears in compounds; +1 char per occurrence of that root id
    const excessIds = new Set(ring1CvRoots.slice(RING1_CV_BUDGET_DEFAULT).map((r) => r.id));
    let occurrences = 0;
    for (const c of compounds.compounds ?? []) {
      for (const id of c.preferred?.composition ?? []) {
        if (excessIds.has(id)) occurrences++;
      }
    }
    // Also count the root itself as a standalone word surface
    const rootSurfaces = excessIds.size;
    return {
      compound_part_occurrences: occurrences,
      approx_extra_chars_across_compounds: occurrences,
      excess_roots: rootSurfaces,
      note: 'Each CV→CVC move adds ~1 character per surface that embeds that root.',
    };
  })(),
};

// Health on current approved roots (roots-only inventory; compounds from preferred spellings if bucket absent)
const inventory = roots.map((r) => ({
  root: r.spelling,
  id: r.id,
  gloss: r.concept,
  coordinates: {},
  repair_steps: 0,
}));
const derivations = (compounds.compounds ?? [])
  .map((c) => {
    const comp = c.preferred?.composition ?? [];
    const spelling = comp.map((id) => byId[id]?.spelling ?? '').join('');
    if (!spelling) return null;
    return { compound: spelling, concept: c.concept };
  })
  .filter(Boolean);
const warnings = analyzeAmbiguity(inventory, derivations);
const scores = auditScores(inventory, derivations, warnings);

const report = {
  version: '1.0-cv-density-projection',
  generated_at: new Date().toISOString(),
  purpose: 'Thought experiment only — no seed writes. Documents CV density vs CVC audibility tradeoffs.',
  baseline: {
    approved_roots: roots.length,
    shapes: shapeCounts(roots, (r) => r.spelling),
    cv_pct: pct(roots.filter((r) => r.template === 'CV').length, roots.length),
    by_priority_class: Object.fromEntries(
      Object.entries(byPriority).map(([cls, v]) => [cls, {
        CV: v.CV,
        CVC: v.CVC,
        other: v.other,
        cv_pct: pct(v.CV, v.CV + v.CVC),
      }]),
    ),
    rings: ringStats.map(({ cv_spellings, cvc_spellings, ...rest }) => ({
      ...rest,
      cv_sample: cv_spellings.slice(0, 12),
      cvc_sample: cvc_spellings.slice(0, 12),
    })),
    compounds: {
      preferred_count: (compounds.compounds ?? []).length,
      part_shapes: partShapes,
      part_cv_pct: pct(partShapes.CV, partShapes.total - partShapes.miss),
      composition_length_hist: compositionLens,
      top_join_patterns: topJoins,
      mean_compound_chars_from_parts: compoundCount
        ? Math.round((compoundCharSum / compoundCount) * 100) / 100
        : null,
    },
    health_from_seeds: {
      learnability: scores.learnability,
      pronounceability: scores.pronounceability,
      memorability: scores.memorability,
      parseability: scores.parseability,
      prefix_overlap_warnings: warnings.filter((w) => w.type === 'prefix_overlap').length,
      high_severity: scores.highSeverityCount,
    },
    prefix_safe_pool: {
      free_CV_prefix_safe: prefixInv.summary.pool_CV_prefix_safe_free,
      free_CV_blocked: prefixInv.summary.pool_CV_blocked_free,
      free_CVC_prefix_safe: prefixInv.summary.pool_CVC_prefix_safe_free,
      free_CVC_blocked: prefixInv.summary.pool_CVC_blocked_free,
      free_CVC_prefix_safe_forms: freeCvcSafe,
    },
    assigner_policy_note: 'tools/fonoran-root-sound-assign.js tierGate: priority ≥92nd percentile hard-prefers CV (CVC penalty 4000); ≥75th penalizes CVC (2500). Essential class is entirely CV today.',
  },
  exclusivity_framing: {
    rule: 'Prefix-family exclusivity: a CV and any longer root starting with that CV cannot both be approved. This is structural (segmentation), not a semantic ban on the concept.',
    examples_of_arbitrary_feeling_blocks: exclusivityExamples,
  },
  counterfactual_A_relax_essential_cv_gate: counterfactualA,
  counterfactual_B_ring1_cv_budget: counterfactualB,
  provisional_policy_to_evaluate: {
    summary: 'Prefer CVC for new non-particle primitives; reserve CV for grammar particles, pronouns, and a small closed ultra-high-frequency set. Resolve prefix-family conflicts by choosing the better of CV vs its CVC family — not by unexplained ban.',
    go_no_go_for_pilot: [
      'Projections show free CVC headroom or a clear reshuffle path for Ring-1 excess CV',
      'Estimated compound length delta stays campfire-friendly (mean compound chars ideally ≤7)',
      'Production ease (RN-32 CVC×0.62) does not collapse pronounceability Health below ~90',
      'Only then consider a 5–10 root non-Ring-1 CV→CVC pilot with Learn/golden refresh',
    ],
  },
};

await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('Wrote data/fonoran-cv-density-projection.json\n');
console.log('=== Baseline ===');
console.log(`  Roots: ${report.baseline.approved_roots}  CV ${report.baseline.shapes.CV} (${report.baseline.cv_pct}%)  CVC ${report.baseline.shapes.CVC}`);
console.log('  By priority:', JSON.stringify(report.baseline.by_priority_class));
for (const r of report.baseline.rings) {
  console.log(`  Ring ${r.ring}: CV ${r.CV} / CVC ${r.CVC} (${r.cv_pct}% CV)  present ${r.present}/${r.concept_count}`);
}
console.log(`  Compound parts: ${report.baseline.compounds.part_cv_pct}% CV`);
console.log(`  Top joins: ${topJoins.slice(0, 4).map((j) => `${j.pattern}×${j.count}`).join('  ')}`);
console.log(`  Health (seeds): Learnability ${scores.learnability}, prefix_overlap ${report.baseline.health_from_seeds.prefix_overlap_warnings}`);
console.log('\n=== Counterfactual A (relax essential→CV) ===');
console.log(`  Essential CVs: ${counterfactualA.essential_cv_count}; free safe CVCs: ${counterfactualA.free_prefix_safe_cvc_available}`);
console.log(`  Could move today: ${counterfactualA.essentials_that_could_move_today}`);
console.log(`  ${counterfactualA.bottleneck}`);
console.log('\n=== Counterfactual B (Ring-1 CV budget) ===');
console.log(`  Ring-1 CV today ${counterfactualB.ring1_cv_today} vs budget ${counterfactualB.ring1_cv_budget} → ${counterfactualB.would_need_cvc_alternatives} would need CVC`);
console.log(`  Approx +chars in compounds: ${counterfactualB.estimated_compound_char_delta_if_excess_gain_one_coda.approx_extra_chars_across_compounds}`);
console.log('\nThought experiment only — seeds unchanged.');
