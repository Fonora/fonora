#!/usr/bin/env node
/**
 * Generate ~100 Fonoran root candidates with phonetic forms for human review.
 * Words first — semantic refinement follows approval.
 *
 * Run: npm run fonoran:root-candidates
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { romanToIpa, parseSyllable } from './fonoran-pronunciation.js';
import { readDoc, writeDoc } from './fonoran-store.js';
import {
  assignRoots,
  buildSyllablePool,
  easeLabel,
  pronunciationEaseScore,
  usefulnessLabel,
} from './fonoran-root-sound-assign.js';
import { derivePriority, priorityWeight, DEFAULT_PRIORITY_CLASS } from './fonoran-priority.js';
import { loadCollisionProfile } from './fonoran-root-collision.js';
import { buildCompoundPartnerMap } from './fonoran-root-boundary-score.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(ROOT, 'data/fonoran-root-candidates.json');

/** Normalize one inventory primitive into the metadata the generator works from. */
function conceptMeta(p, index) {
  const priorityClass = p.priority_class ?? DEFAULT_PRIORITY_CLASS;
  const gloss = p.plain_description ?? p.description ?? p.gloss ?? '';
  return {
    id: p.id,
    gloss,
    domain: p.domain,
    plain_description: p.plain_description ?? p.description ?? p.gloss ?? '',
    primitive_test_note: p.primitive_test_note ?? null,
    suggested_status: p.suggested_status ?? 'primitive',
    priority_class: priorityClass,
    priority_weight: priorityWeight(priorityClass),
    priority: derivePriority(priorityClass, index),
    inventory_index: index,
    collision_profile: null,
  };
}

/** Compound candidates are not eligible for a generated root until promoted. */
function isEligible(meta) {
  return meta.suggested_status !== 'compound_candidate';
}

function buildReason(meta, highLeverage) {
  const lead = (meta.gloss ?? '').split(';')[0].trim();
  if (highLeverage.has(meta.id)) {
    return `${lead} — shows up a lot in compounds, so it needs its own root.`;
  }
  return `${lead} — basic everyday idea that deserves its own root.`;
}

function semanticUsefulness(meta, highLeverage) {
  if (highLeverage.has(meta.id)) return 5;
  switch (meta.priority_class) {
    case 'essential': return 5;
    case 'common': return 4;
    case 'useful': return 3;
    default: return 2;
  }
}

function baseFields(meta) {
  return {
    id: meta.id,
    concept: meta.gloss,
    domain: meta.domain,
    plain_description: meta.plain_description,
    primitive_test_note: meta.primitive_test_note,
    suggested_status: meta.suggested_status,
    priority_class: meta.priority_class,
    priority_weight: meta.priority_weight,
    priority: meta.priority,
  };
}

/** A semantic-only row for a concept that is not eligible for a root yet. */
function semanticOnlyCandidate(meta) {
  const lead = (meta.gloss ?? '').split(';')[0].trim();
  return {
    ...baseFields(meta),
    spelling: null,
    ipa: null,
    reason: `${lead} — probably better as a compound than its own root for now.`,
    pronunciation_ease: null,
    pronunciation_ease_label: null,
    semantic_usefulness: null,
    semantic_usefulness_label: null,
    status: 'pending',
    review: { approved_at: null, rejected_at: null, edited_at: null, note: null },
    generation: { phonetic_cost: null, template: null, tier: null, eligible: false },
    collision_warnings: [],
    boundary_warnings: [],
  };
}

function assignmentToCandidate(assignment, meta, highLeverage) {
  const spelling = assignment.root;
  const s = assignment.scoring ?? {};
  const template = s.template ?? 'CV';
  const cost = s.phonetic_cost;
  const pronScore = pronunciationEaseScore(cost, template);
  const useScore = semanticUsefulness(meta, highLeverage);

  return {
    ...baseFields(meta),
    spelling,
    ipa: romanToIpa(spelling),
    reason: buildReason(meta, highLeverage),
    pronunciation_ease: pronScore,
    pronunciation_ease_label: easeLabel(pronScore),
    semantic_usefulness: useScore,
    semantic_usefulness_label: usefulnessLabel(useScore),
    status: 'pending',
    review: { approved_at: null, rejected_at: null, edited_at: null, note: null },
    generation: {
      phonetic_cost: cost,
      template,
      tier: s.tier ?? null,
      eligible: true,
      distinctiveness_score: s.distinctiveness_score ?? null,
      editorial_collision_score: s.editorial_collision_score ?? null,
      compound_flow_score: s.compound_flow_score ?? null,
      collision_profile: meta.collision_profile ?? null,
    },
    collision_warnings: s.collision_warnings ?? [],
    boundary_warnings: s.boundary_warnings ?? [],
  };
}

export async function generateRootCandidates({ preserveReview = true } = {}) {
  const semantic = await readDoc('concept_inventory');
  if (!semantic) throw new Error('Concept inventory not found');
  const phoneticsConfig = await readDoc('phonetics_config');
  if (!phoneticsConfig) throw new Error('Phonetics config not found');

  const productiveIds = new Set(Object.keys(semantic.productive_dimensions ?? {}));
  const highLeverage = new Set([
    'person', 'self', 'thing', 'move', 'change', 'equal', 'strong', 'bond', 'conflict',
    'know', 'give', 'take', 'speak', 'water', 'life', 'empty', 'before', 'after',
    ...productiveIds,
  ]);
  const primitives = semantic.primitives ?? [];
  const metas = primitives.map((p, i) => conceptMeta(p, i));
  const metaById = Object.fromEntries(metas.map(m => [m.id, m]));

  const pool = buildSyllablePool(phoneticsConfig);

  // Primitive roots must be exactly one syllable: CV or CVC.
  // Fail fast if the pool builder somehow produced a multi-syllable or unparseable form.
  const poolViolations = pool.filter(s => {
    const parsed = parseSyllable(s.form);
    return !parsed || parsed.unparsed || !parsed.vowel;
  });
  if (poolViolations.length > 0) {
    throw new Error(
      `Generator pool contains ${poolViolations.length} non-CV/CVC form(s) — ` +
      `CV-CV and multi-syllable roots are not allowed for primitives:\n` +
      poolViolations.map(s => `  ${s.form} (template: ${s.template})`).join('\n')
    );
  }

  let existing = null;
  try {
    existing = await readDoc('root_candidates');
  } catch {
    existing = null;
  }

  const lockedRoots = {};
  const preserved = new Map();
  const reservedForms = [];

  if (preserveReview && existing?.candidates) {
    for (const c of existing.candidates) {
      if (c.status === 'approved') {
        if (c.spelling) lockedRoots[c.id] = c.spelling;
        preserved.set(c.id, c);
      } else if (c.status === 'rejected') {
        preserved.set(c.id, c);
        if (c.spelling) reservedForms.push(c.spelling.toLowerCase());
      }
    }
  }

  // Editorial collision profile + compound partner map drive the new scorers.
  const profileId = phoneticsConfig.collision_profile ?? 'en';
  const collisionProfile = await loadCollisionProfile(profileId);
  for (const m of metas) m.collision_profile = profileId;
  const compoundsDoc = (await readDoc('compounds')) ?? { compounds: [] };
  const partnerMap = buildCompoundPartnerMap(compoundsDoc.compounds ?? []);

  // Concepts the assigner processes: eligible pending concepts + approved
  // (locked) ones so their spelling stays reserved. Rejected rows are preserved
  // and their spellings reserved separately. Sort by derived priority so
  // essential concepts pick from the syllable pool first.
  const assignList = metas
    .filter(m => {
      const pre = preserved.get(m.id);
      if (pre?.status === 'rejected') return false;
      if (pre?.status === 'approved') return true;
      return isEligible(m);
    })
    .sort((a, b) => b.priority - a.priority);

  if (pool.length < assignList.length) {
    throw new Error(`Syllable pool (${pool.length}) smaller than assignable concepts (${assignList.length})`);
  }

  const assignments = assignRoots(assignList, pool, phoneticsConfig, {
    lockedRoots,
    collisionProfile,
    partnerMap,
    reservedForms,
  });
  const assignmentById = Object.fromEntries(assignments.map(a => [a.id, a]));

  // Emit candidates in inventory order for a stable, reviewable file.
  const candidates = primitives.map((p) => {
    const id = p.id;
    const preservedEntry = preserved.get(id);
    if (preservedEntry?.status === 'approved' || preservedEntry?.status === 'rejected') {
      return preservedEntry;
    }
    const meta = metaById[id];
    if (!isEligible(meta)) return semanticOnlyCandidate(meta);
    const assignment = assignmentById[id];
    if (!assignment) return semanticOnlyCandidate(meta);
    return assignmentToCandidate(assignment, meta, highLeverage);
  });

  const summary = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === 'pending').length,
    approved: candidates.filter(c => c.status === 'approved').length,
    rejected: candidates.filter(c => c.status === 'rejected').length,
    compound_candidates: candidates.filter(c => c.suggested_status === 'compound_candidate').length,
  };

  const output = {
    version: '2.0-editorial-workflow',
    status: 'proposal',
    generated_at: new Date().toISOString(),
    collision_profile: profileId,
    philosophy: {
      premise: 'Concepts are canonical. Sounds are editorial proposals until approved.',
      workflow: 'meaning cleanup → primitive test → priority class → sound generation → distinctiveness + collision + boundary scoring → human approval → compounds',
      source_concepts: 'data/fonoran-concept-inventory.json',
    },
    summary,
    candidates,
  };

  await writeDoc('root_candidates', output);
  return output;
}

async function main() {
  const output = await generateRootCandidates();
  console.log(`Root candidates: ${output.summary.total} (${output.summary.pending} pending, ${output.summary.approved} approved, ${output.summary.rejected} rejected)`);
  console.log(`Top five: ${output.candidates.slice(0, 5).map(c => `${c.spelling}=${c.id}`).join(', ')}`);
  console.log(`Written: ${OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
