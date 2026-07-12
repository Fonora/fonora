/**
 * LLM evaluation pipeline — status + background job runner for the Admin wizard.
 * Wraps the same CLI entry points documented in RN-30.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { readDoc } from './fonoran-store.js';
import { resolveDataPath } from './fonoran-data-paths.js';
import {
  PILOT_CONCEPTS,
  CALIBRATION_CONCEPTS,
  SPOT_CHECK_CONCEPTS,
  BATTERY_VERSION,
  PROMPT_VERSION,
} from './fonoran-llm-intuition.js';
import { anthropicConfigured, anthropicModelForRole } from './fonoran-llm-client.js';
import { pickConsensus, llmThresholds } from './fonoran-llm-aggregate.js';
import { auditCompoundConfusability } from './fonoran-compound-confusability.js';
import { auditCompoundCampfireQuality } from './fonoran-campfire-composition.js';
import { loadRootSemanticFields } from './fonoran-root-semantic-fields.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import {
  computeSeedBankFingerprint,
  isLlmEvalStale,
  isReportStale,
} from './fonoran-seed-fingerprint.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELIABILITY_PATH = join(ROOT, 'data/fonoran-llm-reliability.json');
const CONFUSABILITY_PATH = join(ROOT, 'data/fonoran-compound-confusability.json');
const SEED_QUALITY_PATH = join(ROOT, 'data/fonoran-seed-quality-audit.json');
const LOG_TAIL_MAX = 24_000;

/** @type {Map<string, object>} */
const jobs = new Map();
/** @type {string | null} */
let activeJobId = null;

const STEP_DEFS = [
  {
    id: 'pilot',
    phase: 'evaluate',
    title: 'Pilot smoke test',
    concepts: PILOT_CONCEPTS,
    cost: 'low',
    estimate: '~$1–3 · 3 concepts · a few minutes',
    command: 'npm run fonoran:llm-intuition -- --pilot',
    verify: [
      'Job finishes with exit code 0 (no API errors in the log).',
      'Status shows 3/3 pilot concepts evaluated (tool, weapon, tribe).',
      'Skim winners for tool and weapon — do they sound like sensible compounds?',
    ],
    next: 'Run calibration only after pilot passes.',
    runnable: true,
    argv: ['scripts/fonoran-llm-intuition.js', '--pilot'],
  },
  {
    id: 'calibration',
    phase: 'evaluate',
    title: 'Calibration batch',
    concepts: CALIBRATION_CONCEPTS,
    cost: 'medium',
    estimate: '~$5–15 · 10 concepts · 10–20 minutes',
    command: 'npm run fonoran:llm-intuition -- --calibration --resume',
    verify: [
      'Status shows 10/10 calibration concepts evaluated.',
      'Open winners below — do concepts you know (tool, tribe, language) pick forms you agree with?',
      'If several winners feel wrong, stop here and tune prompts before the full run.',
    ],
    next: 'Run reliability check, then confusability audit.',
    runnable: true,
    argv: ['scripts/fonoran-llm-intuition.js', '--calibration', '--resume'],
    requires: ['pilot'],
  },
  {
    id: 'reliability',
    phase: 'evaluate',
    title: 'Inter-model reliability',
    concepts: CALIBRATION_CONCEPTS,
    cost: 'medium',
    estimate: '~$5–15 · re-scores calibration on 2nd judge',
    command: 'npm run fonoran:llm-reliability:run',
    verify: [
      'Mean Spearman ρ should be ≥ 0.6 (shown in summary).',
      'Check per-concept table: reliable concepts have agreeing winners.',
      'Split queue (disagreement) is normal — do not promote those without human review.',
    ],
    next: 'If ρ is low, investigate before full inventory.',
    runnable: true,
    argv: ['scripts/fonoran-llm-reliability.js', '--run', '--calibration'],
    requires: ['calibration'],
  },
  {
    id: 'confusability',
    phase: 'evaluate',
    title: 'Confusability audit',
    cost: 'free',
    estimate: 'Instant · no API calls',
    command: 'npm run fonoran:compound-confusability',
    verify: [
      'Review near-confusable pairs — surfaces should not sound identical when spoken.',
      'Flag any pair with distinctness under ~70% for human review.',
      'Boundary score average should stay healthy (see summary).',
    ],
    next: 'Run seed quality audit — fix campfire failures before full inventory.',
    runnable: true,
    inline: true,
  },
  {
    id: 'seed_quality',
    phase: 'evaluate',
    title: 'Seed quality audit',
    cost: 'free',
    estimate: 'Instant · no API calls',
    command: 'npm run fonoran:seed-quality-audit',
    verify: [
      '≥92% of preferred compositions pass campfire semantic-role rules.',
      'Zero hard failures (e.g. stone+make for a named tool).',
      'Fix failures in Tools → Words or ASSOCIATION_SEEDS before LLM full run.',
    ],
    next: 'Continue to review when the gate passes.',
    runnable: true,
    inline: true,
  },
  {
    id: 'review',
    phase: 'review',
    title: 'Your judgment call',
    verify: [
      'Pilot and calibration completed without errors.',
      'Reliability mean ρ ≥ 0.6 OR you accept the risk for an experimental run.',
      'At least 3 calibration winners match your campfire intuition.',
      'Check the box below when you are ready for the full inventory.',
    ],
    next: 'Check the box, then run full inventory in the next step.',
    manual: true,
  },
  {
    id: 'full',
    phase: 'review',
    title: 'Full inventory',
    cost: 'high',
    estimate: '~$150–300 · ~12k A/B jobs · hours (optional; heuristic ship needs no LLM)',
    command: 'npm run fonoran:llm-intuition -- --resume',
    verify: [
      'Counts only primary-judge rounds (not reliability secondary-judge data).',
      'Concept coverage approaches total compound count in status.',
      'No sustained API failures in the job log.',
      'Spot-check 5 random winners in the dictionary after promote.',
    ],
    next: 'Push fonora-data, then promote locally.',
    runnable: true,
    argv: ['scripts/fonoran-llm-intuition.js', '--resume'],
    requires: ['calibration', 'seed_quality'],
    needs_review_ack: true,
  },
  {
    id: 'git_data',
    phase: 'ship',
    title: 'Push fonora-data',
    verify: [
      'In external/fonora-data: commit fonoran-llm-evaluations.json (+ reliability if run).',
      'git push origin main on the fonora-data repo.',
      'In fonora repo: git add external/fonora-data && commit submodule bump.',
    ],
    commands: [
      'cd external/fonora-data && git add data/fonoran-llm-evaluations.json data/fonoran-llm-reliability.json',
      'cd external/fonora-data && git commit -m "Update LLM evaluation results"',
      'cd external/fonora-data && git push origin main',
      'git add external/fonora-data && git commit -m "Bump fonora-data for LLM evaluations"',
    ],
    next: 'Push fonora when compounds change too.',
    manual: true,
  },
  {
    id: 'promote',
    phase: 'ship',
    title: 'Promote winners locally',
    command: 'npm run fonoran:regenerate -- --use-llm',
    verify: [
      'Run regenerate with LLM optimizer — may update data/fonoran-compounds.json.',
      'npm test and npm run test:translator both pass.',
      'Commit compounds.json in fonora if it changed.',
    ],
    next: 'Merge PR, then deploy to prod.',
    manual: true,
    action: 'regenerate',
  },
  {
    id: 'prod',
    phase: 'ship',
    title: 'Deploy to production',
    verify: [
      'Merge staging → main and push to GitHub.',
      'git push heroku main:main -a fonora',
      'In /tools#advanced: Regenerate dictionary from git seeds (type REGENERATE).',
      'Run translation tests from Advanced. Smoke-test /language translator and #puzzle?missed.',
    ],
    next: 'Download snapshot backup after milestone vocab changes.',
    manual: true,
    action: 'scroll_regenerate',
  },
];

function jobId() {
  return `lp-${randomBytes(6).toString('hex')}`;
}

function conceptsWithRounds(rounds, conceptList = null, seedFingerprint = null) {
  const ids = new Set();
  for (const r of rounds ?? []) {
    if (!r.concept_id) continue;
    if (seedFingerprint && r.seed_bank_fingerprint !== seedFingerprint) continue;
    if (conceptList && !conceptList.includes(r.concept_id)) continue;
    ids.add(r.concept_id);
  }
  return ids;
}

/** LLM intuition steps that support --fresh / --resume. */
const LLM_INTUITION_STEPS = new Set(['pilot', 'calibration', 'full']);

/** True when this step still needs a --fresh run on the current seed bank. */
function stepNeedsFreshRun(stepId, { pilotDone, calDone, reliabilityStale }) {
  if (stepId === 'pilot') {
    return PILOT_CONCEPTS.some(c => !pilotDone.has(c));
  }
  if (stepId === 'calibration') {
    return CALIBRATION_CONCEPTS.some(c => !calDone.has(c));
  }
  if (stepId === 'reliability') {
    return reliabilityStale;
  }
  return false;
}

function buildStepArgv(step, ctx) {
  const argv = [...(step.argv ?? [])].filter(a => a !== '--resume' && a !== '--fresh');
  const useFresh = stepNeedsFreshRun(step.id, ctx);
  const useResume = !useFresh && (step.id === 'calibration' || step.id === 'full');
  if (useResume) argv.push('--resume');
  if (useFresh) argv.push('--fresh');
  if (ctx.spotCheck && step.id === 'full') {
    argv.push(`--concepts=${SPOT_CHECK_CONCEPTS.join(',')}`);
  }
  return argv;
}

function formatStepCommand(step, ctx) {
  if (!step.argv?.length) return step.command ?? null;
  const argv = buildStepArgv(step, ctx);
  if (step.id === 'pilot') {
    return `npm run fonoran:llm-intuition -- --pilot${argv.includes('--fresh') ? ' --fresh' : ''}`;
  }
  if (step.id === 'calibration') {
    const mode = argv.includes('--fresh') ? '--fresh' : '--resume';
    return `npm run fonoran:llm-intuition -- --calibration ${mode}`;
  }
  if (step.id === 'full') {
    const mode = argv.includes('--fresh') ? '--fresh' : '--resume';
    const conceptsFlag = argv.find(a => a.startsWith('--concepts='));
    return conceptsFlag
      ? `npm run fonoran:llm-intuition -- ${mode} ${conceptsFlag}`
      : `npm run fonoran:llm-intuition -- ${mode}`;
  }
  if (step.id === 'reliability') {
    return `npm run fonoran:llm-reliability:run${argv.includes('--fresh') ? ' -- --fresh' : ''}`;
  }
  return step.command ?? null;
}

function stepSatisfied(status) {
  return status.state === 'complete';
}

async function readConfusabilityReport() {
  try {
    const raw = await readFile(CONFUSABILITY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveConfusabilityReport(report, seedFingerprint) {
  await writeFile(CONFUSABILITY_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    seed_bank_fingerprint: seedFingerprint,
    ...report,
  }, null, 2) + '\n');
}

async function readReliabilityReport() {
  try {
    const raw = await readFile(RELIABILITY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function runSeedQualityAudit() {
  const [compoundsDoc, fields] = await Promise.all([
    readDoc('compounds'),
    loadRootSemanticFields(),
  ]);
  const live = (compoundsDoc?.compounds ?? []).filter(c => c.state !== 'rejected');
  return auditCompoundCampfireQuality(live, { fields });
}

async function readSeedQualityReport() {
  try {
    const raw = await readFile(SEED_QUALITY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSeedQualityReport(report) {
  await writeFile(SEED_QUALITY_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    ...report,
  }, null, 2) + '\n');
}

async function runConfusabilityAudit() {
  const [compoundsDoc, approved] = await Promise.all([
    readDoc('compounds'),
    readDoc('approved_roots'),
  ]);
  const rootById = Object.fromEntries((approved?.roots ?? []).map(r => [r.id, r.spelling]));
  const primitiveIds = (approved?.roots ?? []).map(r => r.id);
  const resolver = buildCompositionResolver(primitiveIds, compoundsDoc?.compounds ?? []);
  return auditCompoundConfusability(compoundsDoc?.compounds ?? [], rootById, resolver);
}

function stepStatus(step, ctx) {
  const {
    evalDoc,
    reliability,
    confusability,
    seedQuality,
    pilotDone,
    calDone,
    fullConceptsPrimary,
    secondaryOnlyCount,
    seedFingerprint,
    llmEvalStale,
    confusabilityStale,
    reliabilityStale,
  } = ctx;

  let status;

  if (step.id === 'pilot') {
    const n = PILOT_CONCEPTS.filter(c => pilotDone.has(c)).length;
    if (n >= PILOT_CONCEPTS.length) status = { state: 'complete', detail: `${n}/${PILOT_CONCEPTS.length} concepts` };
    else if (n > 0) status = { state: 'partial', detail: `${n}/${PILOT_CONCEPTS.length} concepts` };
    else status = { state: 'pending', detail: llmEvalStale ? 'Seeds changed — run fresh pilot' : 'Not started' };
  } else if (step.id === 'calibration') {
    const n = CALIBRATION_CONCEPTS.filter(c => calDone.has(c)).length;
    if (n >= CALIBRATION_CONCEPTS.length) status = { state: 'complete', detail: `${n}/${CALIBRATION_CONCEPTS.length} concepts` };
    else if (n > 0) status = { state: 'partial', detail: `${n}/${CALIBRATION_CONCEPTS.length} concepts` };
    else status = {
      state: 'pending',
      detail: pilotDone.size >= PILOT_CONCEPTS.length ? 'Ready to run' : 'Complete pilot first',
    };
  } else if (step.id === 'reliability') {
    if (!reliability) status = { state: 'pending', detail: 'Not run' };
    else {
      const rho = reliability.comparison?.mean_spearman;
      const ok = rho != null && rho >= (reliability.comparison?.min_spearman_threshold ?? 0.6);
      status = {
        state: ok ? 'complete' : 'warning',
        detail: rho != null
          ? (ok ? `mean ρ ${rho.toFixed(2)}` : `mean ρ ${rho.toFixed(2)} — below ${reliability.comparison?.min_spearman_threshold ?? 0.6} threshold`)
          : 'Report present',
      };
    }
  } else if (step.id === 'confusability') {
    if (!confusability) status = { state: 'pending', detail: 'Not run' };
    else if (confusabilityStale) {
      status = {
        state: 'stale',
        detail: `Seeds changed — re-run audit (was: ${confusability.near_pair_count} near pairs)`,
      };
    } else {
      status = {
        state: 'complete',
        detail: `${confusability.near_pair_count} near pairs · avg boundary ${(confusability.avg_boundary_score * 100).toFixed(0)}%`,
      };
    }
  } else if (step.id === 'seed_quality') {
    if (!seedQuality) status = { state: 'pending', detail: 'Not run' };
    else {
      const pct = (seedQuality.pass_rate * 100).toFixed(0);
      if (seedQuality.gate_pass) {
        status = { state: 'complete', detail: `${pct}% pass · ${seedQuality.failure_count} failures` };
      } else {
        status = {
          state: 'warning',
          detail: `${pct}% pass · ${seedQuality.failure_count} hard failures — fix before full run`,
        };
      }
    }
  } else if (step.id === 'full') {
    const total = evalDoc?.compounds_total ?? null;
    const n = fullConceptsPrimary.size;
    const primaryBeyondCal = [...fullConceptsPrimary].filter(c => !CALIBRATION_CONCEPTS.includes(c)).length;
    const suffix = total ? `/${total}` : '';
    if (total && n >= total * 0.95) {
      status = { state: 'complete', detail: `${n}${suffix} concepts (primary judge)` };
    } else if (primaryBeyondCal > 0) {
      status = { state: 'partial', detail: `${n}${suffix} concepts (primary judge)` };
    } else {
      const orphanNote = secondaryOnlyCount > 0
        ? ` · ${secondaryOnlyCount} have secondary-judge-only data (ignored)`
        : '';
      status = {
        state: 'pending',
        detail: `Not started · ${n}${suffix} on primary judge${orphanNote}`,
      };
    }
  } else if (step.id === 'review') {
    const pilotOk = PILOT_CONCEPTS.every(c => pilotDone.has(c));
    const calOk = CALIBRATION_CONCEPTS.every(c => calDone.has(c));
    const rel = reliability?.comparison?.mean_spearman;
    const relOk = rel == null || rel >= 0.6;
    const relFresh = !reliabilityStale;
    if (calOk && pilotOk && relFresh) {
      status = { state: relOk ? 'ready' : 'warning', detail: relOk ? 'Ready for full run' : `ρ ${rel?.toFixed(2)} below threshold` };
    } else if (!pilotOk) {
      status = { state: 'blocked', detail: 'Complete pilot first' };
    } else if (!calOk) {
      status = { state: 'blocked', detail: 'Finish calibration first' };
    } else if (reliabilityStale) {
      status = { state: 'blocked', detail: 'Re-run reliability on current seeds' };
    } else {
      status = { state: 'blocked', detail: 'Finish calibration first' };
    }
  } else {
    status = { state: 'manual', detail: 'Follow checklist' };
  }

  if (step.id === 'reliability' && reliabilityStale && status.state === 'complete') {
    status = { state: 'stale', detail: `Seeds changed — re-run reliability (was: ${status.detail})` };
  }

  return status;
}

function buildWinnersSummary(evalDoc, seedFingerprint) {
  const aggregates = evalDoc?.aggregates ?? {};
  const rounds = evalDoc?.rounds ?? [];
  const { minMargin } = llmThresholds();
  const out = [];
  for (const conceptId of CALIBRATION_CONCEPTS) {
    const hasFresh = rounds.some(r =>
      r.concept_id === conceptId && r.seed_bank_fingerprint === seedFingerprint);
    if (!hasFresh) {
      out.push({
        concept_id: conceptId,
        winner: '—',
        weight: null,
        close_call: false,
        stale: true,
      });
      continue;
    }
    const byKey = aggregates[conceptId];
    if (!byKey) continue;
    const pick = pickConsensus(aggregates, conceptId);
    const gap = pick?.runner_up && pick.intuition_weight != null && pick.runner_up.intuition_weight != null
      ? pick.intuition_weight - pick.runner_up.intuition_weight
      : null;
    out.push({
      concept_id: conceptId,
      winner: pick ? pick.compositionKey.replace(/\+/g, ' + ') : '—',
      weight: pick?.intuition_weight ?? null,
      close_call: gap != null && gap < minMargin,
      stale: false,
    });
  }
  return out;
}

export async function getLlmPipelineStatus({ confusabilityCache = null, seedQualityCache = null } = {}) {
  const { fingerprint: seedFingerprint, summary: seedFingerprintSummary } = await computeSeedBankFingerprint();
  const evalDoc = await readDoc('llm_evaluations').catch(() => null);
  const rounds = evalDoc?.rounds ?? [];
  const llmEvalStale = isLlmEvalStale(evalDoc, seedFingerprint);
  const pilotDone = conceptsWithRounds(rounds, PILOT_CONCEPTS, seedFingerprint);
  const calDone = conceptsWithRounds(rounds, CALIBRATION_CONCEPTS, seedFingerprint);
  const primaryModel = anthropicModelForRole('judge');
  const primaryRounds = rounds.filter(r =>
    (r.model ?? primaryModel) === primaryModel && r.seed_bank_fingerprint === seedFingerprint);
  const fullConceptsPrimary = conceptsWithRounds(primaryRounds);
  const allConceptsAnyModel = conceptsWithRounds(rounds.filter(r => r.seed_bank_fingerprint === seedFingerprint));
  const secondaryOnlyCount = [...allConceptsAnyModel].filter(c => !fullConceptsPrimary.has(c)).length;

  const compoundsDoc = await readDoc('compounds').catch(() => null);
  const compoundsTotal = (compoundsDoc?.compounds ?? []).filter(c => c.state !== 'rejected').length;

  const reliability = await readReliabilityReport();
  const reliabilityStale = isReportStale(reliability, seedFingerprint);
  const confusability = confusabilityCache ?? await readConfusabilityReport();
  const confusabilityStale = isReportStale(confusability, seedFingerprint);
  const seedQualitySaved = seedQualityCache ?? await readSeedQualityReport();

  const ctx = {
    evalDoc: { ...evalDoc, compounds_total: compoundsTotal },
    reliability,
    confusability,
    seedQuality: seedQualitySaved,
    pilotDone,
    calDone,
    fullConceptsPrimary,
    secondaryOnlyCount,
    seedFingerprint,
    llmEvalStale,
    confusabilityStale,
    reliabilityStale,
  };

  const steps = STEP_DEFS.map((step) => {
    const status = stepStatus(step, ctx);
    const blocked = (step.requires ?? []).some((req) => {
      const reqStep = STEP_DEFS.find(s => s.id === req);
      if (!reqStep) return false;
      const s = stepStatus(reqStep, ctx);
      return !stepSatisfied(s);
    });
    const blockedReason = blocked
      ? (step.requires ?? []).map((req) => {
        const reqStep = STEP_DEFS.find(s => s.id === req);
        if (!reqStep) return null;
        const s = stepStatus(reqStep, ctx);
        return stepSatisfied(s) ? null : reqStep.title;
      }).filter(Boolean).join(' and ')
      : null;
    const apiOk = step.inline || anthropicConfigured();
    const needsFresh = stepNeedsFreshRun(step.id, ctx);
    const runMode = step.inline
      ? 'audit'
      : (needsFresh
        ? 'fresh'
        : (step.id === 'calibration' || step.id === 'full' ? 'resume' : 'run'));
    const runLabel = step.inline
      ? 'Run audit'
      : (runMode === 'fresh' ? 'Run fresh' : runMode === 'resume' ? 'Resume run' : 'Run on server');
    const cmdCtx = { pilotDone, calDone, reliabilityStale };
    return {
      ...step,
      status,
      blocked,
      blocked_reason: blockedReason,
      can_run: Boolean(step.runnable) && !blocked && apiOk,
      run_mode: runMode,
      run_label: runLabel,
      command: formatStepCommand(step, cmdCtx),
    };
  });

  return {
    api_configured: anthropicConfigured(),
    judge_model: anthropicModelForRole('judge'),
    proposer_model: anthropicModelForRole('proposer'),
    battery: BATTERY_VERSION,
    prompt_version: PROMPT_VERSION,
    evaluations_path: resolveDataPath('llm_evaluations'),
    rounds_total: rounds.length,
    compounds_total: compoundsTotal,
    full_inventory_primary_done: fullConceptsPrimary.size,
    full_inventory_secondary_only: secondaryOnlyCount,
    pilot_concepts_done: [...pilotDone],
    calibration_concepts_done: [...calDone],
    calibration_winners: buildWinnersSummary(evalDoc ?? {}, seedFingerprint),
    seed_bank: {
      fingerprint: seedFingerprint,
      summary: seedFingerprintSummary,
      llm_eval_stale: llmEvalStale,
      stored_fingerprint: evalDoc?.seed_bank_fingerprint ?? null,
      legacy_round_count: rounds.filter(r => r.seed_bank_fingerprint !== seedFingerprint).length,
    },
    reliability_summary: reliability ? {
      mean_spearman: reliability.comparison?.mean_spearman ?? null,
      promotion_eligible: reliability.comparison?.promotion_eligible ?? null,
      split_queue: reliability.comparison?.split_queue ?? null,
      threshold: reliability.comparison?.min_spearman_threshold ?? 0.6,
      generated_at: reliability.generated_at ?? null,
    } : null,
    confusability_summary: confusability ? {
      compound_count: confusability.compound_count,
      near_pair_count: confusability.near_pair_count,
      avg_boundary_score: confusability.avg_boundary_score,
      near_pairs: (confusability.near_pairs ?? []).slice(0, 50),
    } : null,
    seed_quality_summary: seedQualitySaved ? {
      total: seedQualitySaved.total,
      pass_count: seedQualitySaved.pass_count,
      failure_count: seedQualitySaved.failure_count,
      warning_count: seedQualitySaved.warning_count,
      pass_rate: seedQualitySaved.pass_rate,
      gate_pass: seedQualitySaved.gate_pass,
      failures: (seedQualitySaved.failures ?? []).slice(0, 30),
    } : null,
    active_job: resolveActiveJob(),
    steps,
  };
}

function summarizeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    step: job.step,
    status: job.status,
    started_at: job.started_at,
    finished_at: job.finished_at,
    exit_code: job.exit_code,
    error: job.error,
    log_tail: job.log_tail,
  };
}

/** Running job, or the most recent job so the UI can show logs/completion after exit. */
function resolveActiveJob() {
  if (activeJobId) {
    const job = jobs.get(activeJobId);
    if (job) return summarizeJob(job);
  }
  let latest = null;
  for (const job of jobs.values()) {
    if (!latest || (job.started_at ?? '') > (latest.started_at ?? '')) latest = job;
  }
  return latest ? summarizeJob(latest) : null;
}

export function getLlmPipelineJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return summarizeJob(job);
}

function pruneJobs() {
  if (jobs.size <= 8) return;
  const sorted = [...jobs.entries()].sort((a, b) => (b[1].started_at ?? '').localeCompare(a[1].started_at ?? ''));
  for (const [id] of sorted.slice(8)) jobs.delete(id);
}

export async function startLlmPipelineJob(stepId, { reviewAcknowledged = false, spotCheck = false } = {}) {
  if (activeJobId) {
    const active = jobs.get(activeJobId);
    if (active?.status === 'running') {
      throw Object.assign(new Error('A pipeline job is already running. Wait for it to finish.'), { status: 409 });
    }
  }

  const step = STEP_DEFS.find(s => s.id === stepId);
  if (!step) throw Object.assign(new Error(`Unknown pipeline step: ${stepId}`), { status: 400 });
  if (!step.runnable) throw Object.assign(new Error('This step is manual — follow the checklist in the UI.'), { status: 400 });
  if (step.needs_review_ack && !reviewAcknowledged) {
    throw Object.assign(new Error('Acknowledge the review step before running the full inventory.'), { status: 400 });
  }
  if (!anthropicConfigured() && !step.inline) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY is not configured on this server.'), { status: 503 });
  }

  const status = await getLlmPipelineStatus();
  const stepState = status.steps.find(s => s.id === stepId);
  if (stepState?.blocked) {
    throw Object.assign(new Error('Complete prerequisite steps first.'), { status: 409 });
  }

  const pilotDone = new Set(status.pilot_concepts_done ?? []);
  const calDone = new Set(status.calibration_concepts_done ?? []);
  const cmdCtx = {
    pilotDone,
    calDone,
    reliabilityStale: isReportStale(await readReliabilityReport(), status.seed_bank?.fingerprint),
    spotCheck: spotCheck && stepId === 'full',
  };
  const argv = step.inline ? step.argv : buildStepArgv(step, cmdCtx);

  const id = jobId();
  const job = {
    id,
    step: stepId,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    error: null,
    log_tail: '',
  };
  jobs.set(id, job);
  activeJobId = id;
  pruneJobs();

  if (step.inline && stepId === 'confusability') {
    runConfusabilityInline(job).catch(() => {});
    return { job_id: id, step: stepId, status: 'running' };
  }

  if (step.inline && stepId === 'seed_quality') {
    runSeedQualityInline(job).catch(() => {});
    return { job_id: id, step: stepId, status: 'running' };
  }

  const child = spawn(process.execPath, argv, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLog = (chunk) => {
    job.log_tail = (job.log_tail + chunk).slice(-LOG_TAIL_MAX);
  };
  child.stdout.on('data', (d) => appendLog(d.toString()));
  child.stderr.on('data', (d) => appendLog(d.toString()));

  child.on('close', (code) => {
    job.finished_at = new Date().toISOString();
    job.exit_code = code;
    job.status = code === 0 ? 'complete' : 'failed';
    if (code !== 0) job.error = `Process exited with code ${code}`;
    if (activeJobId === id) activeJobId = null;
  });

  child.on('error', (err) => {
    job.finished_at = new Date().toISOString();
    job.status = 'failed';
    job.error = err.message;
    if (activeJobId === id) activeJobId = null;
  });

  return { job_id: id, step: stepId, status: 'running' };
}

async function runSeedQualityInline(job) {
  try {
    const report = await runSeedQualityAudit();
    job._seedQuality = report;
    await saveSeedQualityReport(report);
    job.log_tail = [
      `Compounds: ${report.total}`,
      `Pass: ${report.pass_count} (${(report.pass_rate * 100).toFixed(1)}%)`,
      `Failures: ${report.failure_count} | Warnings: ${report.warning_count}`,
      `Gate: ${report.gate_pass ? 'PASS' : 'FAIL'}`,
      ...(report.failures ?? []).slice(0, 15).map(f =>
        `  ${f.concept}: ${f.composition} — ${f.issues[0] ?? 'fail'}`,
      ),
    ].join('\n');
    job.finished_at = new Date().toISOString();
    job.exit_code = report.gate_pass ? 0 : 1;
    job.status = report.gate_pass ? 'complete' : 'failed';
    if (!report.gate_pass) job.error = `${report.failure_count} campfire failures — fix seeds before full inventory`;
  } catch (err) {
    job.finished_at = new Date().toISOString();
    job.status = 'failed';
    job.error = err.message;
    job.exit_code = 1;
  } finally {
    if (activeJobId === job.id) activeJobId = null;
  }
}

async function runConfusabilityInline(job) {
  try {
    const { fingerprint } = await computeSeedBankFingerprint();
    const report = await runConfusabilityAudit();
    job._confusability = { seed_bank_fingerprint: fingerprint, ...report };
    await saveConfusabilityReport(report, fingerprint);
    job.log_tail = [
      `Compounds: ${report.compound_count}`,
      `Near pairs: ${report.near_pair_count}`,
      `Avg boundary: ${(report.avg_boundary_score * 100).toFixed(1)}%`,
      ...(report.near_pairs ?? []).slice(0, 10).map(p =>
        `  ${p.a} (${p.partsLabelA} → ${p.surfaceA}) ↔ ${p.b} (${p.partsLabelB} → ${p.surfaceB}) — ${(p.distinctness * 100).toFixed(0)}% distinct`,
      ),
    ].join('\n');
    job.finished_at = new Date().toISOString();
    job.exit_code = 0;
    job.status = 'complete';
  } catch (err) {
    job.finished_at = new Date().toISOString();
    job.status = 'failed';
    job.error = err.message;
    job.exit_code = 1;
  } finally {
    if (activeJobId === job.id) activeJobId = null;
  }
}

/** Latest confusability from memory cache or persisted report file. */
export async function getConfusabilityResult() {
  const cached = getLastConfusabilityResult();
  if (cached) return cached;
  return readConfusabilityReport();
}

/** Latest confusability from most recent completed confusability job (in-memory). */
export function getLastConfusabilityResult() {
  for (const job of [...jobs.values()].sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))) {
    if (job.step === 'confusability' && job.status === 'complete' && job._confusability) {
      return job._confusability;
    }
  }
  return null;
}

export { STEP_DEFS };
