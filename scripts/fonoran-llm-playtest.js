#!/usr/bin/env node
/**
 * Batch LLM synthetic playtests for build-valid seed candidates.
 *
 * Run:
 *   npm run fonoran:llm-playtest              # full inventory (puzzle protocol)
 *   npm run fonoran:llm-playtest -- tool      # single concept
 *   npm run fonoran:llm-playtest -- --resume  # skip completed rounds
 *   npm run fonoran:llm-playtest -- --dry-run # estimate cost, no API calls
 *   npm run fonoran:llm-playtest -- --protocol revealed  # legacy decomposition-visible
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { anthropicConfigured, anthropicModel, estimateCallCost } from '../tools/fonoran-llm-client.js';
import {
  aggregateRounds,
  buildResumeSet,
  compositionKey,
  PROMPT_VERSION,
  roundResumeKey,
} from '../tools/fonoran-llm-aggregate.js';
import {
  DEFAULT_PROTOCOL,
  allPersonaIds,
  makeRoundRecord,
  materializePlaytestTargets,
  runPlaytestRound,
} from '../tools/fonoran-llm-playtest.js';
import { buildMeaningPoolFromCompounds } from '../tools/fonoran-playtests.js';
import { loadRootGraph } from '../tools/fonoran-preferred-select.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_EVERY = 10;

function loadDemoTrees() {
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );
  return new Map((demoDoc.compounds ?? []).map(d => [d.id, d.tree]));
}

async function buildGlossById() {
  const [inventory, approved, compoundsDoc] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
    readDoc('compounds'),
  ]);
  const glossById = new Map();
  for (const p of inventory?.primitives ?? []) {
    glossById.set(p.id, p.concept ?? p.gloss ?? p.id);
  }
  for (const r of approved?.roots ?? []) {
    glossById.set(r.id, r.concept ?? r.gloss ?? r.id);
  }
  for (const c of compoundsDoc?.compounds ?? []) {
    glossById.set(c.concept, c.preferred?.gloss ?? c.gloss ?? c.concept);
  }
  return glossById;
}

function parseArgs(argv) {
  const resume = argv.includes('--resume');
  const dryRun = argv.includes('--dry-run');
  const protocolArg = argv.find(a => a.startsWith('--protocol='))
    ?? (argv.includes('--protocol') ? `--protocol=${argv[argv.indexOf('--protocol') + 1]}` : null);
  const protocol = protocolArg?.split('=')[1] ?? DEFAULT_PROTOCOL;
  const conceptFilter = argv.find(a => !a.startsWith('--') && a !== protocolArg?.split('=')[1]) ?? null;
  return { resume, dryRun, conceptFilter, protocol };
}

async function main() {
  const { resume, dryRun, conceptFilter, protocol } = parseArgs(process.argv.slice(2));

  const [compoundsDoc, rootGraph, demoTrees, glossById] = await Promise.all([
    readDoc('compounds'),
    loadRootGraph(),
    Promise.resolve(loadDemoTrees()),
    buildGlossById(),
  ]);

  if (!compoundsDoc?.compounds?.length) throw new Error('compounds doc missing');

  const meaningPool = buildMeaningPoolFromCompounds(compoundsDoc.compounds);

  const targets = materializePlaytestTargets(compoundsDoc.compounds, {
    ...rootGraph,
    glossById,
    demoTrees,
  }, { conceptFilter });

  const personas = allPersonaIds();
  const planned = [];
  for (const target of targets) {
    for (const persona of personas) {
      planned.push({ target, persona });
    }
  }

  let doc = await readDoc('llm_evaluations');
  if (!doc?.rounds) {
    doc = {
      version: '1.0-llm-playtests',
      prompt_version: PROMPT_VERSION,
      protocol,
      model: anthropicModel(),
      rounds: [],
      aggregates: {},
    };
  }

  const resumeSet = resume ? buildResumeSet(doc.rounds) : new Set();
  const todo = planned.filter(({ target, persona }) => {
    const key = roundResumeKey({
      concept_id: target.conceptId,
      candidate_composition: target.composition,
      persona,
      prompt_version: PROMPT_VERSION,
    });
    return !resumeSet.has(key);
  });

  const concepts = new Set(targets.map(t => t.conceptId));
  const callsPerRound = protocol === 'puzzle' ? 1.5 : 1;
  console.log(`LLM playtest batch`);
  console.log(`  Protocol: ${protocol} (prompt v${PROMPT_VERSION})`);
  console.log(`  Concepts: ${concepts.size}${conceptFilter ? ` (filter: ${conceptFilter})` : ''}`);
  console.log(`  Build-valid candidates: ${targets.length}`);
  console.log(`  Personas: ${personas.length}`);
  console.log(`  Planned rounds: ${planned.length}`);
  console.log(`  Remaining (after resume): ${todo.length}`);

  const estCost = estimateCallCost() * todo.length * callsPerRound;
  console.log(`  Estimated API calls: ~${Math.round(todo.length * callsPerRound)}`);
  console.log(`  Estimated cost: ~$${estCost.toFixed(2)} (${anthropicModel()})`);

  if (dryRun) {
    console.log('\nDry run — no API calls made.');
    return;
  }

  if (!todo.length) {
    doc.aggregates = aggregateRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
    doc.model = anthropicModel();
    doc.prompt_version = PROMPT_VERSION;
    doc.protocol = protocol;
    await writeDoc('llm_evaluations', doc);
    console.log('\nNothing to run. Aggregates refreshed.');
    return;
  }

  if (!anthropicConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is required (set in .env)');
  }

  let completed = 0;
  let failed = 0;
  let apiCalls = 0;

  for (const { target, persona } of todo) {
    const result = await runPlaytestRound({
      protocol,
      persona,
      conceptId: target.conceptId,
      targetGloss: target.targetGloss,
      spelling: target.spelling,
      composition: target.composition,
      rootGlosses: target.rootGlosses,
      breakdown: target.breakdown,
      meaningPool,
      temperature: 0,
    });

    if (!result.ok) {
      failed += 1;
      console.error(`  FAIL ${target.conceptId} ${compositionKey(target.composition)} ${persona}: ${result.error}`);
      continue;
    }

    apiCalls += result.api_calls ?? 1;

    doc.rounds.push(makeRoundRecord({
      conceptId: target.conceptId,
      composition: target.composition,
      spelling: target.spelling,
      persona,
      result,
      model: anthropicModel(),
      protocol,
    }));

    completed += 1;
    if (completed % LOG_EVERY === 0) {
      doc.aggregates = aggregateRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
      doc.model = anthropicModel();
      doc.prompt_version = PROMPT_VERSION;
      doc.protocol = protocol;
      await writeDoc('llm_evaluations', doc);
      console.log(`  ... ${completed}/${todo.length} rounds (${doc.rounds.length} total stored, ~${apiCalls} API calls)`);
    }
  }

  doc.aggregates = aggregateRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
  doc.model = anthropicModel();
  doc.prompt_version = PROMPT_VERSION;
  doc.protocol = protocol;
  await writeDoc('llm_evaluations', doc);

  console.log(`\nDone. ${completed} rounds completed, ${failed} failed, ~${apiCalls} API calls.`);
  console.log(`  Stored: ${doc.rounds.length} total rounds; v${PROMPT_VERSION} aggregates for ${Object.keys(doc.aggregates).length} concepts`);
}

main().catch(err => { console.error(err); process.exit(1); });
