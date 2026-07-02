#!/usr/bin/env node
/**
 * Deterministic compound optimizer — promote preferred forms from ranked seeds.
 *
 * Run: npm run fonoran:optimize-compounds
 * Then: npm run fonoran:build
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { loadCandidateContext } from '../tools/fonoran-expression-candidates.js';
import { buildCompositionResolver } from '../tools/fonoran-composition-resolve.js';
import { aggregateAllRounds, mergePromptAggregates, PROMPT_VERSION } from '../tools/fonoran-llm-aggregate.js';
import {
  deriveAlternatesForCompound,
  loadRootGraph,
  optimizeCompoundInventory,
} from '../tools/fonoran-preferred-select.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDemoTrees() {
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );
  return new Map((demoDoc.compounds ?? []).map(d => [d.id, d.tree]));
}

async function main() {
  const useLlm = process.argv.includes('--use-llm');
  const lengthOnly = process.argv.includes('--length-only');
  if (useLlm && lengthOnly) {
    console.warn('Warning: --length-only ignores --use-llm (length gate uses heuristic picks only).');
  }
  const doc = await readDoc('compounds');
  if (!doc?.compounds) throw new Error('compounds doc missing compounds array');

  const [candidateCtx, rootGraph, demoTrees, llmDoc] = await Promise.all([
    loadCandidateContext(),
    loadRootGraph(),
    Promise.resolve(loadDemoTrees()),
    useLlm ? readDoc('llm_evaluations') : Promise.resolve(null),
  ]);

  const llmAggregates = useLlm
    ? mergePromptAggregates(llmDoc?.rounds ?? [])
    : null;
  if (useLlm && !Object.keys(llmAggregates ?? {}).length) {
    console.warn('Warning: --use-llm but no LLM aggregates found. Run npm run fonoran:llm-playtest first.');
  }

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
    version: '2.0-communicative',
    status: 'canonical',
    philosophy: doc.philosophy
      ?? 'Compounds are meaning-attempts, not canonical answers. Each concept keeps a preferred '
      + 'form and alternate understandable forms. understandability is an advisory ranking aid; '
      + 'human guess-the-meaning playtests decide the preferred form (docs/fonoran-constitution.md).',
    description:
      'Curated transparent Fonoran compounds with ranked alternates. Preferred forms selected '
      + 'deterministically from ASSOCIATION_SEEDS via fonoran-preferred-select.',
    compound_count: compounds.length,
    compounds,
  };

  await writeDoc('compounds', out);

  const mode = lengthOnly ? 'length-only' : (useLlm ? 'LLM consensus' : 'heuristic');
  console.log(`Optimized ${compounds.length} compounds (${mode}).`);
  console.log(`  Promoted: ${promotions.length}`);
  for (const p of promotions) {
    console.log(
      `    ${p.concept}: ${p.from.join('+')} → ${p.to.join('+')} `
      + `(${p.from_flat}→${p.to_flat} roots, score ${p.from_score}→${p.to_score}, ${p.reason})`,
    );
  }
  console.log('Run npm run fonoran:build to refresh lab spellings.');
}

main().catch(err => { console.error(err); process.exit(1); });
