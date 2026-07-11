#!/usr/bin/env node
/**
 * v4 Compositional Intuition Battery — batch runner (Tasks A/B/C, no MC).
 *
 * v4: cross-lingual L1 personas (es/zh/ar/hi/sw), blind-grader recovery scoring,
 * judge-model inference (default claude-fable-5), selective Task C (close calls
 * only), and concurrent execution.
 *
 * Run:
 *   npm run fonoran:llm-intuition -- --pilot          # tool, weapon, tribe (smoke)
 *   npm run fonoran:llm-intuition -- --calibration    # 10 reference concepts
 *   npm run fonoran:llm-intuition -- tool             # single concept
 *   npm run fonoran:llm-intuition -- --dry-run --pilot
 *   npm run fonoran:llm-intuition -- --tasks A,B,C --pilot
 *   npm run fonoran:llm-intuition -- --concurrency 6 --resume
 *   ANTHROPIC_MODEL_JUDGE=claude-sonnet-5 npm run fonoran:llm-intuition -- --resume   # reliability arm
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { anthropicConfigured, anthropicModelForRole, estimateCallCost } from '../tools/fonoran-llm-client.js';
import {
  aggregateIntuitionRounds,
  mergePromptAggregates,
  compositionKey,
  llmThresholds,
  PROMPT_VERSION,
} from '../tools/fonoran-llm-aggregate.js';
import {
  batteryPersonaIds,
  batteryLanguages,
  BATTERY_VERSION,
  CALIBRATION_CONCEPTS,
  DEFAULT_TASKS,
  intuitionResumeKey,
  makeIntuitionRoundRecord,
  materializePlaytestTargets,
  PERSONAS,
  PILOT_CONCEPTS,
  primitiveGlossary,
  runTaskA,
  runTaskB,
  runTaskC,
} from '../tools/fonoran-llm-intuition.js';
import {
  ensureTranslations,
  localizeGlossary,
  translateText,
} from '../tools/fonoran-persona-glossaries.js';
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

  const concArg = argv.find(a => a.startsWith('--concurrency='))
    ?? (argv.includes('--concurrency') ? `--concurrency=${argv[argv.indexOf('--concurrency') + 1]}` : null);
  const concurrency = Math.max(1, Number(concArg?.split('=')[1]) || 4);

  // --concepts=a,b,c  scopes the run to an explicit concept list (avoids 1 invocation per id).
  const conceptsArg = argv.find(a => a.startsWith('--concepts='))
    ?? (argv.includes('--concepts') ? `--concepts=${argv[argv.indexOf('--concepts') + 1]}` : null);
  const conceptsList = conceptsArg
    ? conceptsArg.split('=').slice(1).join('=').split(',').map(c => c.trim()).filter(Boolean)
    : null;

  const conceptFilter = argv.find(a => !a.startsWith('--') && !tasks.includes(a.toUpperCase())
    && a !== String(concurrency)) ?? null;

  let concepts = null;
  if (conceptsList?.length) concepts = conceptsList;
  else if (conceptFilter) concepts = [conceptFilter];
  else if (pilot) concepts = PILOT_CONCEPTS;
  else if (calibration) concepts = CALIBRATION_CONCEPTS;

  return { resume, dryRun, tasks, concepts, conceptFilter, concurrency };
}

function buildResumeSet(rounds, model) {
  return new Set((rounds ?? []).map(r => intuitionResumeKey({
    conceptId: r.concept_id,
    composition: r.candidate_composition,
    persona: r.persona,
    task: r.task,
    pair: r.task === 'C' ? r.pair : null,
    promptVersion: r.prompt_version ?? PROMPT_VERSION,
    model: r.model ?? model ?? null,
  })));
}

function planAbJobs(targets, personas, tasks) {
  const jobs = [];
  for (const target of targets) {
    for (const persona of personas) {
      if (tasks.includes('A')) jobs.push({ type: 'A', target, persona });
      if (tasks.includes('B')) jobs.push({ type: 'B', target, persona });
    }
  }
  return jobs;
}

/**
 * Task C is only worth its cost when A+B leave a close call: plan pairwise
 * jobs only for concepts whose top-two intuition weights sit inside the
 * consensus margin, and only for the top-two candidates of those concepts.
 */
function planCloseCallCJobs(targets, personas, aggregates, margin) {
  const byConcept = new Map();
  for (const t of targets) {
    if (!byConcept.has(t.conceptId)) byConcept.set(t.conceptId, []);
    byConcept.get(t.conceptId).push(t);
  }

  const jobs = [];
  for (const [conceptId, conceptTargets] of byConcept) {
    if (conceptTargets.length < 2) continue;
    const byKey = aggregates?.[conceptId];
    if (!byKey) continue;
    const ranked = Object.entries(byKey)
      .map(([key, s]) => ({ key, weight: s.intuition_weight ?? 0 }))
      .sort((a, b) => b.weight - a.weight);
    if (ranked.length < 2) continue;
    if (ranked[0].weight - ranked[1].weight >= margin) continue;

    const topA = conceptTargets.find(t => compositionKey(t.composition) === ranked[0].key);
    const topB = conceptTargets.find(t => compositionKey(t.composition) === ranked[1].key);
    if (!topA || !topB) continue;
    for (const persona of personas) {
      jobs.push({ type: 'C', targetA: topA, targetB: topB, persona, conceptId });
    }
  }
  return jobs;
}

function filterTodo(jobs, resumeSet) {
  return jobs.filter(job => {
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
}

/** Collect every English text an L1 persona will see, for translation warming. */
function collectTranslatableTexts(targets, rootGraph, glossById) {
  const texts = new Set();
  for (const target of targets) {
    texts.add(target.targetGloss);
    for (const id of target.composition) {
      texts.add(glossById.get(id) ?? id.replace(/_/g, ' '));
    }
    for (const r of primitiveGlossary(target.rootGlosses, rootGraph.primitiveIds)) {
      texts.add(r.gloss);
    }
  }
  return [...texts];
}

function localizedCompositionReadable(cache, lang, composition, glossById) {
  return composition
    .map(id => translateText(cache, lang, glossById.get(id) ?? id.replace(/_/g, ' ')))
    .join(' + ');
}

function makeLocalizer(glossaryCache, glossById, rootGraph) {
  const glossaryByLang = new Map();
  return {
    forPersona(personaId, target) {
      const p = PERSONAS[personaId];
      const lang = p?.lang ?? null;
      const prim = primitiveGlossary(target.rootGlosses, rootGraph.primitiveIds);
      if (!lang) {
        return {
          primitiveGlosses: prim,
          targetGlossLocalized: null,
          compositionReadable: null,
        };
      }
      // Root glossaries are identical across targets for a given lang — cache them.
      const cacheKey = `${lang}|${prim.length}`;
      if (!glossaryByLang.has(cacheKey)) {
        glossaryByLang.set(cacheKey, localizeGlossary(glossaryCache, lang, prim));
      }
      return {
        primitiveGlosses: glossaryByLang.get(cacheKey),
        targetGlossLocalized: translateText(glossaryCache, lang, target.targetGloss),
        compositionReadable: localizedCompositionReadable(glossaryCache, lang, target.composition, glossById),
      };
    },
  };
}

async function runJob(job, { localizer, glossById }) {
  const judgeModel = anthropicModelForRole('judge');
  if (job.type === 'A') {
    const loc = localizer.forPersona(job.persona, job.target);
    const result = await runTaskA({
      persona: job.persona,
      conceptId: job.target.conceptId,
      targetGloss: job.target.targetGloss,
      spelling: job.target.spelling,
      primitiveGlosses: loc.primitiveGlosses,
    });
    if (!result.ok) return { ok: false, job, error: result.error };
    return {
      ok: true,
      job,
      record: makeIntuitionRoundRecord({
        conceptId: job.target.conceptId,
        composition: job.target.composition,
        spelling: job.target.spelling,
        persona: job.persona,
        task: 'A',
        result,
        model: result.model ?? judgeModel,
      }),
    };
  }

  if (job.type === 'B') {
    const loc = localizer.forPersona(job.persona, job.target);
    const result = await runTaskB({
      persona: job.persona,
      conceptId: job.target.conceptId,
      targetGloss: job.target.targetGloss,
      targetGlossLocalized: loc.targetGlossLocalized,
      composition: job.target.composition,
      compositionReadable: loc.compositionReadable,
      glossById,
      primitiveGlosses: loc.primitiveGlosses,
    });
    if (!result.ok) return { ok: false, job, error: result.error };
    return {
      ok: true,
      job,
      record: makeIntuitionRoundRecord({
        conceptId: job.target.conceptId,
        composition: job.target.composition,
        spelling: job.target.spelling,
        persona: job.persona,
        task: 'B',
        result,
        model: result.model ?? judgeModel,
      }),
    };
  }

  const locA = localizer.forPersona(job.persona, job.targetA);
  const locB = localizer.forPersona(job.persona, job.targetB);
  const result = await runTaskC({
    persona: job.persona,
    targetGloss: job.targetA.targetGloss,
    targetGlossLocalized: locA.targetGlossLocalized,
    candidateA: { ...job.targetA, compositionReadable: locA.compositionReadable },
    candidateB: { ...job.targetB, compositionReadable: locB.compositionReadable },
    primitiveGlosses: locA.primitiveGlosses,
  });
  if (!result.ok) return { ok: false, job, error: result.error };
  return {
    ok: true,
    job,
    record: makeIntuitionRoundRecord({
      conceptId: job.conceptId,
      composition: null,
      spelling: null,
      persona: job.persona,
      task: 'C',
      result,
      model: result.model ?? judgeModel,
      pair: result.pair,
    }),
  };
}

function jobLabel(job) {
  if (job.type === 'C') return `C ${job.conceptId} ${job.persona}`;
  return `${job.type} ${job.target.conceptId} ${compositionKey(job.target.composition)} ${job.persona}`;
}

async function runJobs(todo, doc, ctx, concurrency) {
  let completed = 0;
  let failed = 0;
  const judgeModel = anthropicModelForRole('judge');

  for (let i = 0; i < todo.length; i += concurrency) {
    const batch = todo.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(job => runJob(job, ctx).catch(err => ({
      ok: false, job, error: err?.message ?? String(err),
    }))));

    for (const res of results) {
      if (!res.ok) {
        failed += 1;
        console.error(`  FAIL ${jobLabel(res.job)}: ${res.error}`);
        continue;
      }
      doc.rounds.push(res.record);
      completed += 1;
    }

    if (completed > 0 && (completed % LOG_EVERY < concurrency)) {
      doc.aggregates = mergePromptAggregates(doc.rounds);
      doc.model = judgeModel;
      doc.prompt_version = PROMPT_VERSION;
      doc.battery = BATTERY_VERSION;
      await writeDoc('llm_evaluations', doc);
      console.log(`  ... ${Math.min(i + concurrency, todo.length)}/${todo.length} (${doc.rounds.length} stored)`);
    }
  }

  return { completed, failed };
}

async function main() {
  const { resume, dryRun, tasks, concepts, conceptFilter, concurrency } = parseArgs(process.argv.slice(2));

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

  const personas = batteryPersonaIds();
  const abJobs = planAbJobs(targets, personas, tasks);
  const conceptSet = new Set(targets.map(t => t.conceptId));
  const judgeModel = anthropicModelForRole('judge');
  const { minMargin } = llmThresholds();

  let doc = await readDoc('llm_evaluations');
  if (!doc?.rounds) {
    doc = {
      version: '1.0-llm-playtests',
      prompt_version: PROMPT_VERSION,
      battery: BATTERY_VERSION,
      model: judgeModel,
      rounds: [],
      aggregates: {},
    };
  }

  const resumeSet = resume ? buildResumeSet(doc.rounds, judgeModel) : new Set();
  const abTodo = filterTodo(abJobs, resumeSet);

  // Each A/B call is followed by a blind-grader call, so ~2× API calls.
  const graderMultiplier = 2;
  const estCalls = abTodo.length * graderMultiplier;

  console.log('Compositional Intuition Battery (v4)');
  console.log(`  Battery: ${BATTERY_VERSION} · prompt v${PROMPT_VERSION}`);
  console.log(`  Judge model: ${judgeModel}`);
  console.log(`  Tasks: ${tasks.join(', ')}${tasks.includes('C') ? ' (C = close calls only)' : ''}`);
  console.log(`  Concepts: ${conceptSet.size}${filter ? ` (${[...conceptSet].join(', ')})` : ' (full inventory)'}`);
  console.log(`  Candidates: ${targets.length}`);
  console.log(`  Personas: ${personas.length} (${personas.join(', ')})`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Planned A/B calls: ${abJobs.length} (+ graders ≈ ${abJobs.length * graderMultiplier} total)`);
  console.log(`  Remaining A/B: ${abTodo.length} (≈ ${estCalls} calls with graders)`);
  console.log(`  Estimated cost: ~$${(estimateCallCost({ model: judgeModel }) * estCalls).toFixed(2)} (${judgeModel})`);

  if (dryRun) {
    console.log('\nDry run — no API calls made.');
    return;
  }

  if (!anthropicConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is required (set in .env)');
  }

  // Warm persona glossary translations before any battery call.
  const langs = batteryLanguages();
  const texts = collectTranslatableTexts(targets, rootGraph, glossById);
  console.log(`\nWarming glossary translations (${langs.length} languages × ${texts.length} texts)…`);
  const glossaryCache = await ensureTranslations(langs, texts);
  const localizer = makeLocalizer(glossaryCache, glossById, rootGraph);
  const ctx = { localizer, glossById };

  let completed = 0;
  let failed = 0;

  if (abTodo.length) {
    const res = await runJobs(abTodo, doc, ctx, concurrency);
    completed += res.completed;
    failed += res.failed;
  }

  // Refresh aggregates before planning selective Task C.
  doc.aggregates = mergePromptAggregates(doc.rounds);

  if (tasks.includes('C')) {
    const v4Aggregates = aggregateIntuitionRounds(doc.rounds, { promptVersion: PROMPT_VERSION });
    const cJobs = planCloseCallCJobs(targets, personas, v4Aggregates, minMargin);
    const cTodo = filterTodo(cJobs, resume ? buildResumeSet(doc.rounds, judgeModel) : new Set());
    console.log(`\nTask C (close calls): ${cJobs.length} planned, ${cTodo.length} remaining.`);
    if (cTodo.length) {
      const res = await runJobs(cTodo, doc, ctx, concurrency);
      completed += res.completed;
      failed += res.failed;
    }
  }

  doc.aggregates = mergePromptAggregates(doc.rounds);
  doc.model = judgeModel;
  doc.prompt_version = PROMPT_VERSION;
  doc.battery = BATTERY_VERSION;
  await writeDoc('llm_evaluations', doc);

  console.log(`\nDone. ${completed} calls ok, ${failed} failed.`);
  console.log(`  Concepts with weights: ${Object.keys(doc.aggregates).length}`);
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
