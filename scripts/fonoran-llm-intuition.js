#!/usr/bin/env node
/**
 * v3 Compositional Intuition Battery — batch runner (Tasks A/B/C, no MC).
 *
 * Run:
 *   npm run fonoran:llm-intuition -- --pilot          # tool, weapon, tribe (smoke)
 *   npm run fonoran:llm-intuition -- --calibration    # 10 reference concepts
 *   npm run fonoran:llm-intuition -- tool             # single concept
 *   npm run fonoran:llm-intuition -- --dry-run --pilot
 *   npm run fonoran:llm-intuition -- --tasks A,B,C --pilot
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { anthropicConfigured, anthropicModel, estimateCallCost } from '../tools/fonoran-llm-client.js';
import {
  aggregateIntuitionRounds,
  compositionKey,
  PROMPT_VERSION,
} from '../tools/fonoran-llm-aggregate.js';
import {
  allCandidatePairs,
  allPersonaIds,
  BATTERY_VERSION,
  CALIBRATION_CONCEPTS,
  DEFAULT_TASKS,
  intuitionResumeKey,
  makeIntuitionRoundRecord,
  materializePlaytestTargets,
  PILOT_CONCEPTS,
  primitiveGlossary,
  runTaskA,
  runTaskB,
  runTaskC,
} from '../tools/fonoran-llm-intuition.js';
import { loadRootGraph } from '../tools/fonoran-preferred-select.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_EVERY = 8;

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
  const pilot = argv.includes('--pilot');
  const calibration = argv.includes('--calibration');
  const tasksArg = argv.find(a => a.startsWith('--tasks='))
    ?? (argv.includes('--tasks') ? `--tasks=${argv[argv.indexOf('--tasks') + 1]}` : null);
  const tasks = (tasksArg?.split('=')[1] ?? DEFAULT_TASKS.join(','))
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => ['A', 'B', 'C'].includes(t));

  const flags = new Set(['--resume', '--dry-run', '--pilot', '--calibration', '--tasks']);
  const conceptFilter = argv.find(a => !a.startsWith('--') && !tasks.includes(a.toUpperCase())) ?? null;

  let concepts = null;
  if (conceptFilter) concepts = [conceptFilter];
  else if (pilot) concepts = PILOT_CONCEPTS;
  else if (calibration) concepts = CALIBRATION_CONCEPTS;

  return { resume, dryRun, tasks, concepts, conceptFilter };
}

function buildResumeSet(rounds) {
  return new Set((rounds ?? []).map(r => intuitionResumeKey({
    conceptId: r.concept_id,
    composition: r.candidate_composition,
    persona: r.persona,
    task: r.task,
    pair: r.task === 'C' ? r.pair : null,
    promptVersion: r.prompt_version ?? PROMPT_VERSION,
  })));
}

function planJobs(targets, personas, tasks, includePairwise) {
  const byConcept = new Map();
  for (const t of targets) {
    if (!byConcept.has(t.conceptId)) byConcept.set(t.conceptId, []);
    byConcept.get(t.conceptId).push(t);
  }

  const jobs = [];
  for (const target of targets) {
    for (const persona of personas) {
      if (tasks.includes('A')) jobs.push({ type: 'A', target, persona });
      if (tasks.includes('B')) jobs.push({ type: 'B', target, persona });
    }
  }

  if (includePairwise && tasks.includes('C')) {
    for (const [, conceptTargets] of byConcept) {
      for (const [a, b] of allCandidatePairs(conceptTargets)) {
        for (const persona of personas) {
          jobs.push({ type: 'C', targetA: a, targetB: b, persona, conceptId: a.conceptId });
        }
      }
    }
  }
  return jobs;
}

async function main() {
  const { resume, dryRun, tasks, concepts, conceptFilter } = parseArgs(process.argv.slice(2));

  const [compoundsDoc, rootGraph, demoTrees, glossById] = await Promise.all([
    readDoc('compounds'),
    loadRootGraph(),
    Promise.resolve(loadDemoTrees()),
    buildGlossById(),
  ]);

  const filter = concepts ?? (conceptFilter ? [conceptFilter] : null);
  const targets = materializePlaytestTargets(compoundsDoc.compounds, {
    ...rootGraph,
    glossById,
    demoTrees,
  }, { conceptFilter: filter });

  const personas = allPersonaIds();
  const jobs = planJobs(targets, personas, tasks, true);
  const conceptSet = new Set(targets.map(t => t.conceptId));

  let doc = await readDoc('llm_evaluations');
  if (!doc?.rounds) {
    doc = {
      version: '1.0-llm-playtests',
      prompt_version: PROMPT_VERSION,
      battery: BATTERY_VERSION,
      model: anthropicModel(),
      rounds: [],
      aggregates: {},
    };
  }

  const resumeSet = resume ? buildResumeSet(doc.rounds) : new Set();
  const todo = jobs.filter(job => {
    if (job.type === 'C') {
      const pair = [compositionKey(job.targetA.composition), compositionKey(job.targetB.composition)].sort().join('|vs|');
      return !resumeSet.has(intuitionResumeKey({
        conceptId: job.conceptId,
        composition: null,
        persona: job.persona,
        task: 'C',
        pair,
      }));
    }
    return !resumeSet.has(intuitionResumeKey({
      conceptId: job.target.conceptId,
      composition: job.target.composition,
      persona: job.persona,
      task: job.type,
    }));
  });

  console.log('Compositional Intuition Battery (v3)');
  console.log(`  Battery: ${BATTERY_VERSION} · prompt v${PROMPT_VERSION}`);
  console.log(`  Tasks: ${tasks.join(', ')}`);
  console.log(`  Concepts: ${conceptSet.size}${filter ? ` (${[...conceptSet].join(', ')})` : ' (full inventory)'}`);
  console.log(`  Candidates: ${targets.length}`);
  console.log(`  Personas: ${personas.length}`);
  console.log(`  Planned API calls: ${jobs.length}`);
  console.log(`  Remaining: ${todo.length}`);
  console.log(`  Estimated cost: ~$${(estimateCallCost() * todo.length).toFixed(2)} (${anthropicModel()})`);

  if (dryRun) {
    console.log('\nDry run — no API calls made.');
    return;
  }

  if (!todo.length) {
    doc.aggregates = aggregateIntuitionRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
    doc.prompt_version = PROMPT_VERSION;
    doc.battery = BATTERY_VERSION;
    await writeDoc('llm_evaluations', doc);
    console.log('\nNothing to run. Aggregates refreshed.');
    return;
  }

  if (!anthropicConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is required (set in .env)');
  }

  let completed = 0;
  let failed = 0;

  for (const job of todo) {
    let result;
    let record;

    if (job.type === 'A') {
      const prim = primitiveGlossary(job.target.rootGlosses, rootGraph.primitiveIds);
      result = await runTaskA({
        persona: job.persona,
        conceptId: job.target.conceptId,
        targetGloss: job.target.targetGloss,
        spelling: job.target.spelling,
        primitiveGlosses: prim,
      });
      if (!result.ok) {
        failed += 1;
        console.error(`  FAIL A ${job.target.conceptId} ${compositionKey(job.target.composition)} ${job.persona}: ${result.error}`);
        continue;
      }
      record = makeIntuitionRoundRecord({
        conceptId: job.target.conceptId,
        composition: job.target.composition,
        spelling: job.target.spelling,
        persona: job.persona,
        task: 'A',
        result,
        model: anthropicModel(),
      });
    } else if (job.type === 'B') {
      const prim = primitiveGlossary(job.target.rootGlosses, rootGraph.primitiveIds);
      result = await runTaskB({
        persona: job.persona,
        conceptId: job.target.conceptId,
        targetGloss: job.target.targetGloss,
        composition: job.target.composition,
        glossById,
        primitiveGlosses: prim,
      });
      if (!result.ok) {
        failed += 1;
        console.error(`  FAIL B ${job.target.conceptId} ${compositionKey(job.target.composition)} ${job.persona}: ${result.error}`);
        continue;
      }
      record = makeIntuitionRoundRecord({
        conceptId: job.target.conceptId,
        composition: job.target.composition,
        spelling: job.target.spelling,
        persona: job.persona,
        task: 'B',
        result,
        model: anthropicModel(),
      });
    } else {
      result = await runTaskC({
        persona: job.persona,
        targetGloss: job.targetA.targetGloss,
        candidateA: job.targetA,
        candidateB: job.targetB,
      });
      if (!result.ok) {
        failed += 1;
        console.error(`  FAIL C ${job.conceptId} ${result.pair} ${job.persona}: ${result.error}`);
        continue;
      }
      record = makeIntuitionRoundRecord({
        conceptId: job.conceptId,
        composition: null,
        spelling: null,
        persona: job.persona,
        task: 'C',
        result,
        model: anthropicModel(),
        pair: result.pair,
      });
    }

    doc.rounds.push(record);
    completed += 1;

    if (completed % LOG_EVERY === 0) {
      doc.aggregates = aggregateIntuitionRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
      doc.model = anthropicModel();
      doc.prompt_version = PROMPT_VERSION;
      doc.battery = BATTERY_VERSION;
      await writeDoc('llm_evaluations', doc);
      console.log(`  ... ${completed}/${todo.length} (${doc.rounds.length} stored)`);
    }
  }

  doc.aggregates = aggregateIntuitionRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
  doc.model = anthropicModel();
  doc.prompt_version = PROMPT_VERSION;
  doc.battery = BATTERY_VERSION;
  await writeDoc('llm_evaluations', doc);

  console.log(`\nDone. ${completed} calls ok, ${failed} failed.`);
  console.log(`  Concepts with v3 weights: ${Object.keys(doc.aggregates).length}`);
  for (const id of [...conceptSet].slice(0, 5)) {
    const keys = Object.keys(doc.aggregates[id] ?? {});
    if (!keys.length) continue;
    const top = keys
      .map(k => ({ k, w: doc.aggregates[id][k].intuition_weight }))
      .sort((a, b) => b.w - a.w)[0];
    console.log(`  ${id}: top ${top.k.replace(/\+/g, ' + ')} (weight ${top.w.toFixed(2)})`);
  }
  console.log('\nReport: node tools/fonoran-llm-aggregate.js --report <concept>');
}

main().catch(err => { console.error(err); process.exit(1); });
