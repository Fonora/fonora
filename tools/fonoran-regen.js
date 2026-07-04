/**
 * Generator-centric language regeneration — editorial seeds → optimize → build.
 * Shared by CLI scripts and Advanced GUI API routes.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFonoran } from './fonoran-build.js';
import {
  EDITORIAL_DOCS,
  importEditorialFromSeedPaths,
  readDoc,
  readDocStatus,
  readBucketRaw,
  readSeedFileStatus,
  getEditorialSeedsImportedAt,
  resolveStorageMode,
  writeDoc,
} from './fonoran-store.js';
import { loadCandidateContext } from './fonoran-expression-candidates.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import { mergePromptAggregates } from './fonoran-llm-aggregate.js';
import {
  deriveAlternatesForCompound,
  loadRootGraph,
  optimizeCompoundInventory,
} from './fonoran-preferred-select.js';
import { runTranslationGapReport } from './fonoran-translation-gaps.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDemoTrees() {
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );
  return new Map((demoDoc.compounds ?? []).map(d => [d.id, d.tree]));
}

/** Stale if lab was updated after the last editorial seed import. */
function computeRegenWarnings({ labUpdatedAt, importedAt }) {
  const warnings = [];
  if (!importedAt && labUpdatedAt) {
    warnings.push({
      code: 'never_imported_seeds',
      message: 'Editorial seeds have never been loaded into Postgres. Rebuild may use stale data.',
    });
  }
  if (importedAt && labUpdatedAt) {
    const labTs = new Date(labUpdatedAt).getTime();
    const impTs = new Date(importedAt).getTime();
    if (labTs > impTs + 1000) {
      warnings.push({
        code: 'lab_newer_than_seeds',
        message: 'Dictionary was rebuilt after the last editorial seed import. Run Regenerate to sync from git seeds.',
      });
    }
  }
  return warnings;
}

/** Status for Advanced regen panel. */
export async function getRegenStatus({ baseDir = ROOT } = {}) {
  const bucket = await readBucketRaw();
  const storeDocs = await readDocStatus();
  const seedFiles = await readSeedFileStatus(baseDir);
  const importedAt = await getEditorialSeedsImportedAt();
  const labUpdatedAt = bucket?.updated_at ?? null;
  const warnings = computeRegenWarnings({ labUpdatedAt, importedAt });

  const llmStore = storeDocs.llm_evaluations?.counts?.rounds ?? 0;
  const llmSeed = seedFiles.llm_evaluations?.counts?.rounds ?? 0;
  const compoundsStore = storeDocs.compounds?.counts?.compounds ?? 0;
  const compoundsSeed = seedFiles.compounds?.counts?.compounds ?? 0;

  return {
    storage_mode: resolveStorageMode(),
    lab: {
      updated_at: labUpdatedAt,
      sounds: bucket?.sounds?.length ?? 0,
      compounds: bucket?.compounds?.length ?? 0,
    },
    editorial_imported_at: importedAt,
    store_docs: storeDocs,
    seed_files: seedFiles,
    seed_paths: EDITORIAL_DOCS,
    drift: {
      llm_rounds: { store: llmStore, seed: llmSeed, match: llmStore === llmSeed },
      compounds: { store: compoundsStore, seed: compoundsSeed, match: compoundsStore === compoundsSeed },
    },
    warnings,
    ready_to_regenerate: warnings.every(w => w.code !== 'never_imported_seeds') || resolveStorageMode() === 'json',
  };
}

/** Apply LLM rankings from stored eval doc to compounds inventory. */
export async function optimizeCompoundsInStore({ useLlm = true, lengthOnly = false } = {}) {
  const doc = await readDoc('compounds');
  if (!doc?.compounds) throw new Error('compounds doc missing compounds array');

  const [candidateCtx, rootGraph, demoTrees, llmDoc] = await Promise.all([
    loadCandidateContext(),
    loadRootGraph(),
    Promise.resolve(loadDemoTrees()),
    useLlm && !lengthOnly ? readDoc('llm_evaluations') : Promise.resolve(null),
  ]);

  const llmAggregates = useLlm && !lengthOnly
    ? mergePromptAggregates(llmDoc?.rounds ?? [])
    : null;

  const { compounds: optimized, promotions } = optimizeCompoundInventory(doc.compounds, {
    ...rootGraph,
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    demoTrees,
    llmAggregates,
  }, { useLlm: lengthOnly ? false : useLlm, lengthOnly });

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
    mode: lengthOnly ? 'length-only' : (useLlm ? 'llm_consensus' : 'heuristic'),
    llm_rounds: llmDoc?.rounds?.length ?? 0,
  };
}

/**
 * Merge accepted proposals from fonoran-compound-proposals.json into
 * fonoran-compounds.json on disk so the editorial import picks them up.
 *
 * - Skips proposals whose concept is already defined in compounds.json
 * - Skips proposals where no valid composition is available
 * - When a concept has multiple accepted proposals, uses the first valid_composition
 *   (or chosen_composition if set)
 * - Writes the updated fonoran-compounds.json back to disk
 *
 * @param {string} baseDir  repo root
 * @returns {{ promoted: number, skipped: number, already_present: number }}
 */
export function promoteAcceptedProposals(baseDir = ROOT) {
  const proposalsPath = join(baseDir, 'data/fonoran-compound-proposals.json');
  const compoundsPath = join(baseDir, 'data/fonoran-compounds.json');

  if (!existsSync(proposalsPath) || !existsSync(compoundsPath)) {
    return { promoted: 0, skipped: 0, already_present: 0 };
  }

  const proposalsDoc = JSON.parse(readFileSync(proposalsPath, 'utf8'));
  const compoundsDoc = JSON.parse(readFileSync(compoundsPath, 'utf8'));

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
    writeFileSync(compoundsPath, JSON.stringify(compoundsDoc, null, 2) + '\n', 'utf8');
  }

  return { promoted, skipped, already_present: alreadyPresent };
}

/**
 * Full generator pipeline: editorial import → optional LLM optimize → build.
 */
export async function runRegenerate({
  baseDir = ROOT,
  applyLlm = true,
  approveAll = true,
} = {}) {
  const steps = [];

  const promoted = promoteAcceptedProposals(baseDir);
  steps.push({ step: 'promote_proposals', ...promoted });

  const editorial = await importEditorialFromSeedPaths(baseDir);
  steps.push({ step: 'editorial_import', ...editorial });

  let optimize = null;
  if (applyLlm) {
    optimize = await optimizeCompoundsInStore({ useLlm: true });
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
