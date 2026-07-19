/**
 * Deterministic four-rules compound regeneration.
 *
 * Ranks ASSOCIATION_SEEDS + current preferred forms by campfire recoverability,
 * understandability heuristics, flattened length (≤4), phonetic ease, and
 * audible-boundary quality. Skips human/playtest/locked rows. No LLM calls.
 *
 * Prefer: npm run fonoran:regen:four-rules -- --dry-run
 * Apply:  npm run fonoran:regen:four-rules -- --apply
 */

import { readDoc, writeDoc } from './fonoran-store.js';
import { loadCandidateContext } from './fonoran-expression-candidates.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import {
  deriveAlternatesForCompound,
  isCompoundEditoriallyLocked,
  loadRootGraph,
  optimizeCompoundInventory,
} from './fonoran-preferred-select.js';
import { loadPrimitiveConceptIds, pruneShadowCompounds } from './fonoran-compound-prune.js';
import { evaluateCampfireComposition } from './fonoran-campfire-composition.js';

function compositionKey(comp) {
  return (comp ?? []).join('+');
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    dryRun: true,
    force: true,
    concepts: null,
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') {
      opts.apply = true;
      opts.dryRun = false;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
      opts.apply = false;
    } else if (a === '--no-force') {
      opts.force = false;
    } else if (a.startsWith('--concepts=')) {
      opts.concepts = a.slice('--concepts='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      opts.limit = Number(a.slice('--limit='.length)) || Infinity;
    }
  }
  return opts;
}

/**
 * @param {string[]} argv
 */
export async function runFourRulesRegen(argv = []) {
  const opts = parseArgs(argv);
  const [compoundsDoc, inventoryDoc, candidateCtx, rootGraph] = await Promise.all([
    readDoc('compounds'),
    readDoc('concept_inventory'),
    loadCandidateContext(),
    loadRootGraph(),
  ]);

  const primitiveIds = loadPrimitiveConceptIds(inventoryDoc);
  const { doc: prunedDoc, pruned } = pruneShadowCompounds(
    compoundsDoc ?? { compounds: [] },
    primitiveIds,
  );

  const rows = (prunedDoc.compounds ?? []).filter(c => c.state !== 'rejected');
  const forceConcepts = opts.concepts?.length ? new Set(opts.concepts) : null;
  const lockedCount = rows.filter(r => isCompoundEditoriallyLocked(r)).length;

  // Full inventory must stay in one pass so hierarchical flatCount / spelling
  // validation see sibling compounds. --concepts scopes force-promote only.
  const { compounds: optimized, promotions } = optimizeCompoundInventory(rows, {
    ...rootGraph,
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    difficultRootIds: candidateCtx.difficultRootIds,
  }, {
    force: opts.force && !forceConcepts,
    forceConcepts,
    useLlm: false,
    scoreMargin: 0,
  });

  const finalResolver = buildCompositionResolver(
    rootGraph.primitiveIds,
    optimized.map(r => ({ concept: r.concept, preferred: r.preferred })),
  );
  const rankCtx = {
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    flatCountFor: comp => finalResolver.flatCount(comp),
    difficultRootIds: candidateCtx.difficultRootIds,
  };

  const optimizedById = new Map(optimized.map(r => [r.concept, r]));
  const compounds = rows.map((orig) => {
    const row = optimizedById.get(orig.concept) ?? orig;

    // Keep prior preferred as an alternate when demoted (meaning-attempts).
    const alternates = deriveAlternatesForCompound(row, rankCtx);
    const prefKey = compositionKey(row.preferred?.composition);
    const priorKey = compositionKey(orig.preferred?.composition ?? orig.composition);
    if (
      priorKey
      && priorKey !== prefKey
      && !alternates.some(a => compositionKey(a.composition) === priorKey)
    ) {
      const campfire = evaluateCampfireComposition(orig.concept, orig.preferred?.composition ?? []);
      alternates.unshift({
        composition: orig.preferred?.composition ?? orig.composition ?? [],
        gloss: orig.preferred?.gloss ?? orig.gloss ?? '',
        understandability: orig.understandability ?? null,
        label: 'prior preferred',
        status: campfire.pass ? 'plausible' : 'confusing',
        source: 'demoted_heuristic',
      });
      if (alternates.length > 4) alternates.length = 4;
    }

    return {
      concept: row.concept,
      preferred: row.preferred,
      preferred_source: isCompoundEditoriallyLocked(orig)
        ? (orig.preferred_source ?? 'playtest')
        : (row.preferred_source ?? 'heuristic'),
      ...(orig.locked === true ? { locked: true } : {}),
      alternates,
      understandability: row.understandability,
      notes: orig.notes ?? row.notes ?? '',
    };
  });

  let changed = promotions.map(p => ({
    concept: p.concept,
    from: (p.from ?? []).join('+'),
    to: (p.to ?? []).join('+'),
    reason: p.reason,
    from_score: p.from_score,
    to_score: p.to_score,
  }));
  if (forceConcepts) changed = changed.filter(c => forceConcepts.has(c.concept));
  if (Number.isFinite(opts.limit)) changed = changed.slice(0, opts.limit);

  const report = {
    mode: opts.apply ? 'apply' : 'dry-run',
    force: opts.force,
    total: compounds.length,
    locked_skipped: lockedCount,
    shadow_primitives_pruned: pruned.length,
    promotions: changed.length,
    changed: changed.slice(0, 80),
  };

  console.log('Four-rules compound regeneration');
  console.log(`  Mode: ${report.mode} (force=${report.force})`);
  console.log(`  Compounds: ${report.total}`);
  console.log(`  Locked (skipped): ${report.locked_skipped}`);
  console.log(`  Shadow primitives pruned: ${report.shadow_primitives_pruned}`);
  console.log(`  Promotions: ${report.promotions}`);
  for (const c of changed.slice(0, 25)) {
    console.log(`    ${c.concept}: ${c.from} → ${c.to} (${c.reason})`);
  }
  if (changed.length > 25) console.log(`    … and ${changed.length - 25} more`);

  if (!opts.apply) {
    console.log('\nDry run only — re-run with --apply to write data/fonoran-compounds.json');
    return { ...report, wrote: false, compounds };
  }

  const out = {
    version: prunedDoc.version ?? '2.0-communicative',
    status: 'canonical',
    philosophy:
      'Compounds are meaning-attempts, not canonical answers. Each concept keeps a preferred '
      + 'form and alternate understandable forms. Ranking uses the four constitution rules '
      + '(universal phonetics, audible distinction, lego recoverability ≤4 roots, no double '
      + 'consonants) plus campfire heuristics — not LLM validators.',
    description:
      'Regenerated by fonoran:regen:four-rules from ASSOCIATION_SEEDS + deterministic '
      + 'preferred selection. Human/playtest locks preserved.',
    compound_count: compounds.length,
    regenerated_at: new Date().toISOString(),
    compounds,
  };

  await writeDoc('compounds', out);
  console.log(`\nWrote ${compounds.length} compounds to editorial seeds.`);
  return { ...report, wrote: true, compounds };
}
