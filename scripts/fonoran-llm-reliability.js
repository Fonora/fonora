#!/usr/bin/env node
/**
 * Inter-model reliability gate for cib-v4 (RN-30).
 *
 * Compares candidate rankings from two judge models on the same concepts.
 * High Spearman agreement → promotion-eligible; disagreement → split queue.
 *
 * Usage:
 *   npm run fonoran:llm-reliability -- --calibration
 *   npm run fonoran:llm-reliability -- --report
 *   npm run fonoran:llm-reliability -- --run --calibration   # run both models then report
 *
 * Env:
 *   ANTHROPIC_MODEL_JUDGE       primary judge (default claude-fable-5)
 *   ANTHROPIC_MODEL_RELIABILITY secondary judge (default claude-sonnet-5)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readDoc } from '../tools/fonoran-store.js';
import {
  aggregateIntuitionRounds,
  compositionKey,
  pickConsensus,
  PROMPT_VERSION,
  llmThresholds,
} from '../tools/fonoran-llm-aggregate.js';
import { anthropicModelForRole } from '../tools/fonoran-llm-client.js';
import { CALIBRATION_CONCEPTS } from '../tools/fonoran-llm-intuition.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = join(ROOT, 'data/fonoran-llm-reliability.json');

const DEFAULT_PRIMARY = () => anthropicModelForRole('judge');
const DEFAULT_SECONDARY = () =>
  process.env.ANTHROPIC_MODEL_RELIABILITY?.trim() || 'claude-sonnet-4-6';

const MIN_SPEARMAN = Number(process.env.LLM_RELIABILITY_MIN_SPEARMAN ?? 0.6);

function parseArgs(argv) {
  return {
    calibration: argv.includes('--calibration'),
    fresh: argv.includes('--fresh'),
    report: argv.includes('--report') || (!argv.includes('--run') && !argv.includes('--calibration')),
    run: argv.includes('--run'),
    dryRun: argv.includes('--dry-run'),
    concepts: argv.includes('--calibration')
      ? CALIBRATION_CONCEPTS
      : (argv.find(a => a.startsWith('--concepts='))?.split('=')[1] ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
  };
}

/** Spearman rank correlation on aligned keys. */
export function spearmanRankCorrelation(rankA, rankB) {
  const keys = [...new Set([...Object.keys(rankA), ...Object.keys(rankB)])];
  if (keys.length < 2) return { rho: null, n: keys.length };

  const aVals = keys.map(k => rankA[k] ?? -Infinity);
  const bVals = keys.map(k => rankB[k] ?? -Infinity);

  function ranks(vals) {
    const indexed = vals.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v);
    const out = new Array(vals.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
      const avgRank = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) out[indexed[k].i] = avgRank;
      i = j + 1;
    }
    return out;
  }

  const rA = ranks(aVals);
  const rB = ranks(bVals);
  const n = keys.length;
  const meanA = rA.reduce((s, v) => s + v, 0) / n;
  const meanB = rB.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = rA[i] - meanA;
    const db = rB[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  const rho = denom > 0 ? num / denom : null;
  return { rho, n };
}

function weightRankMap(byKey) {
  const out = {};
  for (const [key, stats] of Object.entries(byKey ?? {})) {
    out[key] = stats.intuition_weight ?? stats.cold_recovery_rate ?? stats.recovery_rate ?? 0;
  }
  return out;
}

export function compareModelAggregates(primaryAgg, secondaryAgg, conceptIds) {
  const perConcept = [];
  let eligible = 0;
  let split = 0;

  for (const conceptId of conceptIds) {
    const pMap = weightRankMap(primaryAgg[conceptId]);
    const sMap = weightRankMap(secondaryAgg[conceptId]);
    const { rho, n } = spearmanRankCorrelation(pMap, sMap);

    const primaryConsensus = pickConsensus(primaryAgg, conceptId);
    const secondaryConsensus = pickConsensus(secondaryAgg, conceptId);
    const agreeWinner = primaryConsensus && secondaryConsensus
      && compositionKey(primaryConsensus.composition) === compositionKey(secondaryConsensus.composition);

    const reliable = rho != null && rho >= MIN_SPEARMAN && agreeWinner;
    if (reliable) eligible += 1;
    else split += 1;

    perConcept.push({
      concept_id: conceptId,
      candidate_count: n,
      spearman_rho: rho,
      reliable,
      primary_winner: primaryConsensus?.compositionKey ?? null,
      secondary_winner: secondaryConsensus?.compositionKey ?? null,
      winners_agree: agreeWinner,
    });
  }

  const rhos = perConcept.map(p => p.spearman_rho).filter(r => r != null);
  const meanRho = rhos.length ? rhos.reduce((a, b) => a + b, 0) / rhos.length : null;

  return {
    concept_count: conceptIds.length,
    promotion_eligible: eligible,
    split_queue: split,
    mean_spearman: meanRho,
    min_spearman_threshold: MIN_SPEARMAN,
    per_concept: perConcept.sort((a, b) => (a.spearman_rho ?? -1) - (b.spearman_rho ?? -1)),
  };
}

function runIntuitionForModel(model, concepts, { fresh = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      'scripts/fonoran-llm-intuition.js',
      '--concepts', concepts.join(','),
      '--concurrency', '4',
    ];
    if (fresh) args.push('--fresh');
    else args.push('--resume');
    const child = spawn('node', args, {
      cwd: ROOT,
      env: { ...process.env, ANTHROPIC_MODEL_JUDGE: model },
      stdio: 'inherit',
    });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`intuition exit ${code}`))));
  });
}

async function buildReport(conceptIds) {
  const doc = await readDoc('llm_evaluations');
  const rounds = doc?.rounds ?? [];
  const primaryModel = DEFAULT_PRIMARY();
  const secondaryModel = DEFAULT_SECONDARY();

  const primaryAgg = aggregateIntuitionRounds(rounds, {
    promptVersion: PROMPT_VERSION,
    model: primaryModel,
  });
  const secondaryAgg = aggregateIntuitionRounds(rounds, {
    promptVersion: PROMPT_VERSION,
    model: secondaryModel,
  });

  const conceptsWithData = conceptIds.filter(id =>
    primaryAgg[id] && secondaryAgg[id]
    && Object.keys(primaryAgg[id]).length
    && Object.keys(secondaryAgg[id]).length);

  const comparison = compareModelAggregates(primaryAgg, secondaryAgg, conceptsWithData);

  const compoundsDoc = await readDoc('compounds');
  const llmPromotions = (compoundsDoc?.compounds ?? [])
    .filter(c => c.preferred_source === 'llm_consensus')
    .map(c => {
      const conceptId = c.concept;
      const liveKey = compositionKey(c.preferred?.composition ?? c.composition);
      const row = comparison.per_concept.find(p => p.concept_id === conceptId);
      return {
        concept_id: conceptId,
        live_composition: liveKey,
        still_reliable: row?.reliable ?? null,
        spearman_rho: row?.spearman_rho ?? null,
      };
    });

  return {
    generated_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    primary_model: primaryModel,
    secondary_model: secondaryModel,
    comparison,
    llm_consensus_review: llmPromotions,
  };
}

function printReport(report) {
  const c = report.comparison;
  console.log('\nInter-model reliability (cib-v4)');
  console.log(`  Primary:   ${report.primary_model}`);
  console.log(`  Secondary: ${report.secondary_model}`);
  console.log(`  Concepts:  ${c.concept_count} with dual-model data`);
  console.log(`  Mean ρ:    ${c.mean_spearman?.toFixed(3) ?? 'n/a'} (threshold ${c.min_spearman_threshold})`);
  console.log(`  Eligible:  ${c.promotion_eligible} promotion-ready`);
  console.log(`  Split:     ${c.split_queue} disagreement / low agreement`);

  console.log('\nPer-concept (lowest agreement first):');
  for (const row of c.per_concept.slice(0, 15)) {
    const rho = row.spearman_rho != null ? row.spearman_rho.toFixed(2) : 'n/a';
    const flag = row.reliable ? 'OK' : 'SPLIT';
    console.log(`  ${flag} ${row.concept_id}: ρ=${rho} primary=${row.primary_winner ?? '-'} secondary=${row.secondary_winner ?? '-'}`);
  }

  if (report.llm_consensus_review.length) {
    console.log('\nPrior llm_consensus promotions:');
    for (const row of report.llm_consensus_review) {
      const rho = row.spearman_rho != null ? row.spearman_rho.toFixed(2) : 'n/a';
      console.log(`  ${row.concept_id}: ${row.live_composition.replace(/\+/g, ' + ')} reliable=${row.still_reliable} ρ=${rho}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let conceptIds = opts.concepts;
  if (!conceptIds.length) {
    const doc = await readDoc('llm_evaluations');
    conceptIds = [...new Set((doc?.rounds ?? []).map(r => r.concept_id).filter(Boolean))];
  }

  const { computeSeedBankFingerprint } = await import('../tools/fonoran-seed-fingerprint.js');
  const { fingerprint: seedFingerprint } = await computeSeedBankFingerprint();

  if (opts.run && !opts.dryRun) {
    const primary = DEFAULT_PRIMARY();
    const secondary = DEFAULT_SECONDARY();
    console.log(`Running calibration on ${conceptIds.length} concepts…`);
    if (opts.fresh) console.log('  Mode: fresh (discard stale rounds for these concepts)');
    console.log(`  Pass 1: ${primary}`);
    await runIntuitionForModel(primary, conceptIds, { fresh: opts.fresh });
    console.log(`  Pass 2: ${secondary}`);
    await runIntuitionForModel(secondary, conceptIds, { fresh: false });
  } else if (opts.run && opts.dryRun) {
    console.log('Dry run — would run both judge models on:', conceptIds.join(', '));
    return;
  }

  const report = await buildReport(conceptIds);
  report.seed_bank_fingerprint = seedFingerprint;
  report.seed_bank_fingerprint_at = new Date().toISOString();
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  printReport(report);
  console.log(`\nWrote ${REPORT_PATH}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
