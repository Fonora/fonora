/**
 * Generator-centric language regeneration — editorial seeds → optimize → build.
 * Shared by CLI scripts and Advanced GUI API routes.
 */

import { readFileSync } from 'node:fs';
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
 * Full generator pipeline: editorial import → optional LLM optimize → build.
 */
export async function runRegenerate({
  baseDir = ROOT,
  applyLlm = true,
  approveAll = true,
} = {}) {
  const steps = [];

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
