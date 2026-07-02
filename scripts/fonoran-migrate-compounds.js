#!/usr/bin/env node
/**
 * Migrate compounds — refresh alternates; optionally promote preferred via optimizer.
 *
 * Run: node scripts/fonoran-migrate-compounds.js
 *      node scripts/fonoran-migrate-compounds.js --promote-preferred
 */

import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { scoreUnderstandability, metaLookupFromRecords } from '../tools/fonoran-understandability.js';
import { experienceMetaFor } from '../tools/fonoran-experience-tiers.js';
import { ASSOCIATION_SEEDS } from '../tools/fonoran-expression-candidates.js';
import { buildCompositionResolver } from '../tools/fonoran-composition-resolve.js';
import {
  deriveAlternatesForCompound,
  loadRootGraph,
  optimizeCompoundInventory,
} from '../tools/fonoran-preferred-select.js';
import { loadCandidateContext } from '../tools/fonoran-expression-candidates.js';

function key(comp) {
  return (comp ?? []).join('+');
}

function statusFromScore(score) {
  if (score >= 0.5) return 'plausible';
  return 'confusing';
}

async function migrateAlternatesOnly(doc, inventory, approved) {
  const fromRecords = metaLookupFromRecords([
    ...(inventory?.primitives ?? []),
    ...(approved?.roots ?? []),
  ]);
  const metaFor = id => fromRecords(id) ?? experienceMetaFor(id);
  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const resolver = buildCompositionResolver(primitiveIds, doc.compounds);
  const flatCountFor = comp => resolver.flatCount(comp);

  const collisionCounts = new Map();
  for (const c of doc.compounds) {
    const pref = c.preferred?.composition ?? c.composition;
    if (pref) collisionCounts.set(key(pref), (collisionCounts.get(key(pref)) ?? 0) + 1);
  }

  const rankCtx = { metaFor, collisionCounts, flatCountFor };

  return doc.compounds.map(c => {
    const preferredComposition = c.preferred?.composition ?? c.composition ?? [];
    const gloss = c.preferred?.gloss ?? c.gloss ?? '';
    const prefScore = scoreUnderstandability(preferredComposition, {
      metaFor,
      collisionCount: collisionCounts.get(key(preferredComposition)) ?? 1,
      flatCount: flatCountFor(preferredComposition),
    });

    const row = {
      concept: c.concept,
      preferred: { composition: preferredComposition, gloss },
      preferred_source: c.preferred_source ?? 'heuristic',
      alternates: c.alternates ?? [],
      notes: c.notes,
      understandability: prefScore.score,
    };

    return {
      concept: row.concept,
      preferred: row.preferred,
      preferred_source: row.preferred_source,
      alternates: deriveAlternatesForCompound(row, rankCtx),
      understandability: row.understandability,
      notes: row.notes ?? 'preferred is the seed recipe; alternates are heuristic until playtested',
    };
  });
}

async function main() {
  const promotePreferred = process.argv.includes('--promote-preferred');
  const [doc, inventory, approved] = await Promise.all([
    readDoc('compounds'),
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
  ]);
  if (!doc?.compounds) throw new Error('compounds doc missing compounds array');

  let compounds;
  let promotions = [];

  if (promotePreferred) {
    const [candidateCtx, rootGraph] = await Promise.all([
      loadCandidateContext(),
      loadRootGraph(),
    ]);
    const result = optimizeCompoundInventory(doc.compounds, {
      ...rootGraph,
      metaFor: candidateCtx.metaFor,
      collisionCounts: candidateCtx.collisionCounts,
      demoTrees: new Map(),
    });
    promotions = result.promotions;
    const finalResolver = buildCompositionResolver(
      rootGraph.primitiveIds,
      result.compounds.map(r => ({ concept: r.concept, preferred: r.preferred })),
    );
    const rankCtx = {
      metaFor: candidateCtx.metaFor,
      collisionCounts: candidateCtx.collisionCounts,
      flatCountFor: comp => finalResolver.flatCount(comp),
    };
    compounds = result.compounds.map(row => ({
      concept: row.concept,
      preferred: row.preferred,
      preferred_source: row.preferred_source ?? 'heuristic',
      alternates: deriveAlternatesForCompound(row, rankCtx),
      understandability: row.understandability,
      notes: row.notes,
    }));
  } else {
    compounds = await migrateAlternatesOnly(doc, inventory, approved);
  }

  const out = {
    version: '2.0-communicative',
    status: 'canonical',
    philosophy:
      'Compounds are meaning-attempts, not canonical answers. Each concept keeps a preferred '
      + 'form and alternate understandable forms. understandability is an advisory ranking aid; '
      + 'human guess-the-meaning playtests decide the preferred form (docs/fonoran-constitution.md).',
    description:
      'Curated transparent Fonoran compounds with ranked alternates. Components reference ids '
      + 'in data/fonoran-concept-inventory.json (primitive roots) OR other compounds in this file.',
    compound_count: compounds.length,
    compounds,
  };
  await writeDoc('compounds', out);
  console.log(`Migrated ${compounds.length} compounds to ranked preferred + alternates.`);
  if (promotePreferred) {
    console.log(`  Promoted ${promotions.length} preferred form(s).`);
    for (const p of promotions) {
      console.log(`    ${p.concept}: ${p.from.join('+')} → ${p.to.join('+')}`);
    }
  } else {
    const withAlts = compounds.filter(c => c.alternates.length).length;
    console.log(`  ${withAlts} concepts now carry alternate understandable forms.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
