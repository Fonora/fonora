#!/usr/bin/env node
/**
 * Phase IV: regenerate data/fonoran-compounds.json from semantic-foundation
 * teaching trees + deterministic preferred selection.
 *
 * Run: npm run fonoran:regen-compounds
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { loadCandidateContext } from '../tools/fonoran-expression-candidates.js';
import { buildCompositionResolver } from '../tools/fonoran-composition-resolve.js';
import {
  deriveAlternatesForCompound,
  loadRootGraph,
  optimizeCompoundInventory,
} from '../tools/fonoran-preferred-select.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function normalizeLive(def) {
  return {
    concept: def.concept,
    composition: def.preferred?.composition ?? def.composition ?? [],
    gloss: def.preferred?.gloss ?? def.gloss ?? '',
    notes: def.notes ?? '',
    preferred_source: def.preferred_source ?? 'heuristic',
  };
}

function topologicalSort(entries) {
  const byId = new Map(entries.map(e => [e.concept, e]));
  const sorted = [];
  const done = new Set();

  function visit(id, stack = new Set()) {
    if (done.has(id)) return;
    if (stack.has(id)) return;
    stack.add(id);
    const e = byId.get(id);
    if (e) {
      for (const part of e.composition) {
        if (byId.has(part)) visit(part, stack);
      }
    }
    stack.delete(id);
    done.add(id);
    if (e) sorted.push(e);
  }

  for (const e of entries) visit(e.concept);
  return sorted;
}

function chainNote(tree, depth) {
  if (depth >= 3) return `Phase 4 hierarchy (depth ${depth}): ${tree.join(' → ')}`;
  if (depth === 2) return `Teaching tree (depth 2): ${tree.join(' + ')}`;
  return 'Semantic foundation teaching tree';
}

async function main() {
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );
  const inventoryDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-concept-inventory.json'), 'utf8'),
  );
  const primitiveIds = new Set((inventoryDoc.primitives ?? []).map(p => p.id));
  const liveDoc = await readDoc('compounds');
  const live = (liveDoc?.compounds ?? []).map(normalizeLive);
  const liveById = new Map(live.map(c => [c.concept, c]));
  const demoIds = new Set(demoDoc.compounds.map(d => d.id));
  const demoTrees = new Map((demoDoc.compounds ?? []).map(d => [d.id, d.tree]));

  const entries = [];

  for (const d of demoDoc.compounds) {
    if (primitiveIds.has(d.id)) {
      console.warn(`Skipping demo compound "${d.id}" — id is a primitive root`);
      continue;
    }
    const liveRow = liveById.get(d.id);
    entries.push({
      concept: d.id,
      composition: d.tree,
      gloss: d.gloss,
      notes: chainNote(d.tree, d.depth ?? 1),
      preferred_source: liveRow?.preferred_source ?? 'heuristic',
      alternates: [],
    });
  }

  for (const c of live) {
    if (demoIds.has(c.concept)) continue;
    entries.push({
      concept: c.concept,
      composition: c.composition,
      gloss: c.gloss,
      notes: c.notes || 'Phase IV: constitution-valid live concept retained',
      preferred_source: c.preferred_source ?? 'heuristic',
      alternates: [],
    });
  }

  const sorted = topologicalSort(entries);
  const seedCompounds = sorted.map(e => ({
    concept: e.concept,
    preferred: { composition: e.composition, gloss: e.gloss },
    preferred_source: e.preferred_source,
    alternates: [],
    notes: e.notes,
  }));

  const [candidateCtx, rootGraph] = await Promise.all([
    loadCandidateContext(),
    loadRootGraph(),
  ]);

  const { compounds: optimized, promotions } = optimizeCompoundInventory(seedCompounds, {
    ...rootGraph,
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    demoTrees,
  });

  const finalResolver = buildCompositionResolver(
    rootGraph.primitiveIds,
    optimized.map(r => ({ concept: r.concept, preferred: r.preferred })),
  );
  const rankCtx = {
    metaFor: candidateCtx.metaFor,
    collisionCounts: candidateCtx.collisionCounts,
    flatCountFor: comp => finalResolver.flatCount(comp),
  };

  const compounds = optimized.map(row => ({
    concept: row.concept,
    preferred: row.preferred,
    preferred_source: row.preferred_source ?? 'heuristic',
    alternates: deriveAlternatesForCompound(row, rankCtx),
    understandability: row.understandability,
    notes: row.notes,
  }));

  const out = {
    version: '2.0-communicative',
    status: 'canonical',
    philosophy:
      'Compounds are meaning-attempts, not canonical answers. Each concept keeps a preferred '
      + 'form and alternate understandable forms. understandability is an advisory ranking aid; '
      + 'human guess-the-meaning playtests decide the preferred form (docs/fonoran-constitution.md).',
    description:
      'Phase IV regenerated from semantic-foundation teaching trees '
      + '(data/fonoran-semantic-demo-compounds.json) with deterministic preferred selection.',
    compound_count: compounds.length,
    compounds,
  };

  await writeDoc('compounds', out);
  console.log(
    `Regenerated ${compounds.length} compounds (${demoDoc.compounds.length} from demo, `
    + `${compounds.length - demoDoc.compounds.length} live-only).`,
  );
  console.log(`  Promoted ${promotions.length} preferred form(s) from seed ranking.`);
  for (const p of promotions.slice(0, 15)) {
    console.log(`    ${p.concept}: ${p.from.join('+')} → ${p.to.join('+')}`);
  }
  if (promotions.length > 15) console.log(`    … and ${promotions.length - 15} more`);
}

main().catch(err => { console.error(err); process.exit(1); });
