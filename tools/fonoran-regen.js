/**
 * Generator-centric language regeneration — editorial seeds → optimize → build.
 * Shared by CLI scripts and Advanced GUI API routes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { loadCompoundProposals } from './fonoran-compound-proposals.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFonoran } from './fonoran-build.js';
import {
  EDITORIAL_DOCS,
  readDoc,
  readBucketRaw,
  readSeedFileStatus,
  writeDoc,
} from './fonoran-store.js';
import { loadCandidateContext } from './fonoran-expression-candidates.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import {
  deriveAlternatesForCompound,
  loadRootGraph,
  optimizeCompoundInventory,
} from './fonoran-preferred-select.js';
import { runTranslationGapReport } from './fonoran-translation-gaps.js';
import { loadPrimitiveConceptIds, pruneShadowCompounds } from './fonoran-compound-prune.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDemoTrees() {
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );
  return new Map((demoDoc.compounds ?? []).map(d => [d.id, d.tree]));
}

/**
 * Status for the Advanced regen panel.
 *
 * This used to compare the seeds on disk against a Postgres copy of them and warn when the two
 * had drifted. There is one copy now, so the only question left is whether the built dictionary
 * is older than the seeds it was built from, which is answered by a timestamp rather than a diff.
 */
export async function getRegenStatus({ baseDir = ROOT } = {}) {
  const bucket = await readBucketRaw();
  const seedFiles = await readSeedFileStatus(baseDir);
  const labUpdatedAt = bucket?.updated_at ?? null;

  const warnings = [];
  if (!bucket) {
    warnings.push({
      code: 'never_built',
      message: 'The dictionary has not been built from the seeds yet. Run Regenerate.',
    });
  }
  const missingSeeds = Object.entries(seedFiles)
    .filter(([key, s]) => !key.startsWith('_') && !s.present)
    .map(([key]) => key);
  if (missingSeeds.length) {
    warnings.push({
      code: 'missing_seed_files',
      message: `Seed file(s) missing or unreadable: ${missingSeeds.join(', ')}`,
    });
  }

  return {
    lab: {
      updated_at: labUpdatedAt,
      sounds: bucket?.sounds?.length ?? 0,
      compounds: bucket?.compounds?.length ?? 0,
    },
    seed_files: seedFiles,
    seed_paths: EDITORIAL_DOCS,
    warnings,
    ready_to_regenerate: !missingSeeds.length,
  };
}

/** Re-rank compounds with the deterministic four-rules scorer. */
export async function optimizeCompoundsInStore({ lengthOnly = false } = {}) {
  let doc = await readDoc('compounds');
  if (!doc?.compounds) throw new Error('compounds doc missing compounds array');

  const inventory = await readDoc('concept_inventory');
  const primitiveIds = loadPrimitiveConceptIds(inventory);
  const { doc: prunedDoc, pruned: shadowPruned } = pruneShadowCompounds(doc, primitiveIds);
  if (shadowPruned.length) {
    doc = prunedDoc;
    await writeDoc('compounds', doc);
  }

  const [candidateCtx, rootGraph, demoTrees] = await Promise.all([
    loadCandidateContext(),
    loadRootGraph(),
    Promise.resolve(loadDemoTrees()),
  ]);

  const { compounds: optimized, promotions } = optimizeCompoundInventory(doc.compounds, {
    ...rootGraph,
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    demoTrees,
  }, { lengthOnly });

  const finalDefs = optimized.map(r => ({
    concept: r.concept,
    preferred: r.preferred,
  }));
  const finalResolver = buildCompositionResolver(rootGraph.primitiveIds, finalDefs);
  const flatCountFor = comp => finalResolver.flatCount(comp);
  const rankCtx = {
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    flatCountFor,
  };

  const compounds = optimized.map(row => ({
    concept: row.concept,
    preferred: row.preferred,
    preferred_source: row.preferred_source ?? 'heuristic',
    alternates: deriveAlternatesForCompound(row, rankCtx),
    understandability: row.understandability,
    notes: row.notes || 'optimized by fonoran-preferred-select',
  }));

  const out = {
    version: doc.version ?? '2.0-communicative',
    status: doc.status ?? 'canonical',
    philosophy: doc.philosophy,
    description: doc.description,
    compound_count: compounds.length,
    compounds,
  };

  await writeDoc('compounds', out);

  return {
    compounds: compounds.length,
    promotions: promotions.length,
    promotion_details: promotions,
    pruned_shadow_compounds: shadowPruned.length,
    mode: lengthOnly ? 'length-only' : 'four-rules',
  };
}

/**
 * Merge accepted compound proposals into the active compounds store.
 *
 * @returns {Promise<{ promoted: number, skipped: number, already_present: number }>}
 */
export async function promoteAcceptedProposals(_baseDir = ROOT) {
  const proposalsDoc = await loadCompoundProposals();
  if (!proposalsDoc?.proposals?.length) {
    return { promoted: 0, skipped: 0, already_present: 0 };
  }
  const compoundsDoc = (await readDoc('compounds')) ?? { compounds: [] };

  const existingConcepts = new Set((compoundsDoc.compounds ?? []).map(c => c.concept));

  // Group accepted compound proposals by concept; pick the best composition per concept
  const accepted = (proposalsDoc.proposals ?? [])
    .filter(p => p.status === 'accepted' && p.classification === 'compound');

  // Deduplicate: keep first accepted proposal per concept
  const byConceptFirst = new Map();
  for (const p of accepted) {
    const key = p.concept_id ?? p.word;
    if (!key) continue;
    if (!byConceptFirst.has(key)) byConceptFirst.set(key, p);
  }

  let promoted = 0;
  let skipped = 0;
  let alreadyPresent = 0;

  const newEntries = [];
  for (const [concept, prop] of byConceptFirst) {
    if (existingConcepts.has(concept)) {
      alreadyPresent++;
      continue;
    }

    // Use chosen_composition if set, else first valid_composition
    const composition = prop.chosen_composition?.length
      ? prop.chosen_composition
      : (prop.valid_compositions ?? []).filter(Array.isArray)[0];

    if (!composition?.length) {
      skipped++;
      continue;
    }

    newEntries.push({
      concept,
      preferred: {
        composition,
        gloss: prop.gloss ?? concept,
      },
      preferred_source: 'proposal',
      alternates: (prop.valid_compositions ?? [])
        .filter(Array.isArray)
        .filter(c => JSON.stringify(c) !== JSON.stringify(composition))
        .slice(0, 3)
        .map(c => ({ composition: c, status: 'plausible', source: 'proposal' })),
      notes: prop.rationale ? prop.rationale.slice(0, 200) : undefined,
    });
    existingConcepts.add(concept);
    promoted++;
  }

  if (promoted > 0) {
    compoundsDoc.compounds = [...(compoundsDoc.compounds ?? []), ...newEntries];
    compoundsDoc.compound_count = compoundsDoc.compounds.length;
    await writeDoc('compounds', compoundsDoc);
  }

  return { promoted, skipped, already_present: alreadyPresent };
}

/**
 * Add accepted alias proposals as English locale aliases on target concepts.
 *
 * @returns {Promise<{ promoted: number, skipped: number, already_present: number }>}
 */
export async function promoteAcceptedAliases(_baseDir = ROOT) {
  const proposalsDoc = await loadCompoundProposals();
  if (!proposalsDoc?.proposals?.length) {
    return { promoted: 0, skipped: 0, already_present: 0 };
  }
  const accepted = (proposalsDoc.proposals ?? [])
    .filter(p => p.status === 'accepted' && p.classification === 'alias');

  const locale = (await readDoc('localization_en')) ?? { version: '1.0-localization', locale: 'en', entries: {} };
  if (!locale.entries) locale.entries = {};

  let promoted = 0;
  let skipped = 0;
  let alreadyPresent = 0;

  for (const prop of accepted) {
    const targetId = prop.alias_proposal?.existing_concept_id;
    const aliasWord = String(prop.word ?? prop.concept_id ?? '').trim().toLowerCase();
    if (!targetId || !aliasWord) {
      skipped++;
      continue;
    }

    if (!locale.entries[targetId]) {
      locale.entries[targetId] = { label: targetId.replace(/_/g, ' ') };
    }

    const aliases = new Set((locale.entries[targetId].aliases ?? []).map(a => String(a).toLowerCase()));
    if (aliases.has(aliasWord)) {
      alreadyPresent++;
      continue;
    }

    aliases.add(aliasWord);
    locale.entries[targetId].aliases = [...aliases];
    promoted++;
  }

  if (promoted > 0) {
    await writeDoc('localization_en', locale);
  }

  return { promoted, skipped, already_present: alreadyPresent };
}

/**
 * Full generator pipeline: promote accepted proposals into the seeds, re-rank, build.
 *
 * There is no import step. The promote steps write the seeds and the build reads them, which is
 * the whole reason the store was collapsed: the two halves of this function can no longer be
 * looking at different copies of the lexicon.
 */
export async function runRegenerate({
  baseDir = ROOT,
  reRank = true,
  approveAll = true,
} = {}) {
  const steps = [];

  const promoted = await promoteAcceptedProposals(baseDir);
  steps.push({ step: 'promote_proposals', ...promoted });

  const aliasPromoted = await promoteAcceptedAliases(baseDir);
  steps.push({ step: 'promote_aliases', ...aliasPromoted });

  let optimize = null;
  if (reRank) {
    optimize = await optimizeCompoundsInStore();
    steps.push({ step: 'optimize_compounds', ...optimize });
  }

  const build = await buildFonoran({ approveAll });
  steps.push({
    step: 'build',
    roots: build.roots,
    compounds: build.compounds,
    approved: build.approved,
    preserved_compounds: build.preserved_compounds,
    preserved_sounds: build.preserved_sounds,
    dropped: build.dropped?.length ?? 0,
    health: build.health?.scores ?? null,
  });

  return { ok: true, steps, build };
}

/** Run golden translation regression against live lab (read-only). */
export async function runTranslatorRegression({ lab = null } = {}) {
  const report = await runTranslationGapReport({ resetCache: true, lab });
  const graded = report.phrases.filter(p => typeof p.expected === 'string');
  const mismatches = graded.filter(p => !p.matches_golden);
  return {
    ok: mismatches.length === 0,
    total: graded.length,
    mismatches: mismatches.length,
    mismatch_samples: mismatches.slice(0, 8).map(p => ({
      phrase: p.phrase,
      expected: p.expected,
      got: p.roman,
    })),
    quality: report.quality,
    coverage_pct: report.coverage_pct,
    generated_at: report.generated_at,
  };
}
