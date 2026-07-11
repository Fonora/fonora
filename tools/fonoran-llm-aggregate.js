/**
 * Aggregate LLM playtest rounds and pick consensus winners for promotion.
 */

import '../load-env.js';

// '5' = cib-v4 (blind grader + L1 personas). '4' and '3' were cib-v3 rounds.
export const PROMPT_VERSION = '5';
export const LEGACY_PROMPT_VERSION = '2';
export const V3_PROMPT_VERSION = '3';
export const V4_PROMPT_VERSION = '4';

function isIntuitionRound(round) {
  return round?.battery === 'cib-v3' || round?.battery === 'cib-v4'
    || round?.task === 'A' || round?.task === 'B' || round?.task === 'C';
}

/** Read a weight override from the environment, falling back to the default. */
function envWeight(name, def) {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : def;
}

/**
 * Composite ranking weight (cib-v4 defaults).
 *
 * Cold recovery is down-weighted to 0.30 (docs recommended ≤0.35; the old 0.45
 * default over-weighted the signal that v3's loose matcher had saturated) and
 * naturalness carries 0.40. When no Task C pairwise data exists the pairwise
 * term is OMITTED and the remaining positive weights are renormalized — v3
 * injected a constant 0.5 which only added noise to the composite.
 *
 * Each weight is overridable via env (e.g. LLM_WEIGHT_COLD).
 */
export function computeIntuitionWeight(stats) {
  const cold = stats.cold_recovery_rate ?? 0;
  const nat = stats.mean_naturalness ?? 0;
  const pair = stats.pairwise_score; // null/undefined = no Task C data
  const vag = stats.mean_vagueness ?? 0;
  const n = Math.max(stats.n ?? 1, 1);
  const tooLong = (stats.tags?.too_long ?? 0) / n;
  const hardPronounce = (stats.tags?.hard_pronounce ?? 0) / n;
  const wCold = envWeight('LLM_WEIGHT_COLD', 0.30);
  const wNat = envWeight('LLM_WEIGHT_NATURALNESS', 0.40);
  const wPair = envWeight('LLM_WEIGHT_PAIRWISE', 0.25);
  const wVag = envWeight('LLM_WEIGHT_VAGUENESS', 0.15);
  const wTooLong = envWeight('LLM_WEIGHT_TOO_LONG', 0.12);
  const wHard = envWeight('LLM_WEIGHT_HARD_PRONOUNCE', 0.08);

  let positive;
  if (pair != null) {
    positive = wCold * cold + wNat * nat + wPair * pair;
  } else {
    const denom = wCold + wNat;
    positive = denom > 0
      ? (wCold * cold + wNat * nat) * ((wCold + wNat + wPair) / denom)
      : 0;
  }
  return positive - wVag * vag - wTooLong * tooLong - wHard * hardPronounce;
}

export function compositionKey(comp) {
  return (comp ?? []).join('+');
}

/**
 * Aggregate v3 Compositional Intuition Battery rounds.
 */
export function aggregateIntuitionRounds(rounds, options = {}) {
  const { promptVersion = PROMPT_VERSION, model = null } = options;
  const filtered = (rounds ?? []).filter(r =>
    (r.prompt_version ?? '1') === promptVersion
    && isIntuitionRound(r)
    && (!model || r.model === model));

  /** @type {Record<string, Record<string, object>>} */
  const buckets = {};
  /** @type {Record<string, Record<string, { wins: number, total: number }>>} */
  const pairwise = {};

  for (const round of filtered) {
    const conceptId = round.concept_id;
    if (!conceptId) continue;

    if (round.task === 'C') {
      const pairKeys = String(round.pair ?? '').split('|vs|');
      if (pairKeys.length !== 2 || !round.preferred_key) continue;
      pairwise[conceptId] ??= {};
      for (const k of pairKeys) {
        pairwise[conceptId][k] ??= { wins: 0, total: 0 };
        pairwise[conceptId][k].total += 1;
      }
      if (pairwise[conceptId][round.preferred_key]) {
        pairwise[conceptId][round.preferred_key].wins += 1;
      }
      continue;
    }

    const key = compositionKey(round.candidate_composition);
    if (!key) continue;

    buckets[conceptId] ??= {};
    buckets[conceptId][key] ??= {
      coldScoreSum: 0,
      coldN: 0,
      confidenceSum: 0,
      naturalnessSum: 0,
      naturalnessN: 0,
      vaguenessSum: 0,
      vaguenessN: 0,
      compScoreSum: 0,
      compRecN: 0,
      tags: {},
    };
    const slot = buckets[conceptId][key];

    // cib-v4 rounds carry a blind-grader grade_score (1 / 0.5 / 0) that works
    // in any language. Legacy v3 rounds only have the English strict-match
    // boolean; for those, the cross_lingual persona's recovery flags are
    // systematically wrong (it reasons in Spanish) and stay excluded.
    const hasGrade = typeof round.grade_score === 'number';
    const trustRecovery = hasGrade || round.persona !== 'cross_lingual';
    const recoveryScoreA = hasGrade ? round.grade_score : (round.recovered ? 1 : 0);
    const recoveryScoreB = hasGrade ? round.grade_score : (round.composition_recovery ? 1 : 0);

    if (round.task === 'A') {
      if (trustRecovery) {
        slot.coldN += 1;
        slot.coldScoreSum += recoveryScoreA;
        if (typeof round.confidence === 'number') slot.confidenceSum += round.confidence;
      }
    }

    if (round.task === 'B') {
      const vagWeight = round.persona === 'skeptical_listener' ? 2 : 1;
      slot.naturalnessN += 1;
      slot.naturalnessSum += Number(round.naturalness ?? 0);
      slot.vaguenessN += vagWeight;
      slot.vaguenessSum += Number(round.vagueness ?? 0) * vagWeight;
      if (trustRecovery) {
        slot.compRecN += 1;
        slot.compScoreSum += recoveryScoreB;
      }
    }

    for (const tag of round.tags ?? []) {
      if (!tag) continue;
      slot.tags[tag] = (slot.tags[tag] ?? 0) + 1;
    }
  }

  const aggregates = {};
  for (const [conceptId, byKey] of Object.entries(buckets)) {
    aggregates[conceptId] = {};
    for (const [key, slot] of Object.entries(byKey)) {
      const pw = pairwise[conceptId]?.[key];
      const pairwise_score = pw?.total ? pw.wins / pw.total : null;
      const stats = {
        cold_recovery_rate: slot.coldN ? slot.coldScoreSum / slot.coldN : 0,
        mean_confidence: slot.coldN ? slot.confidenceSum / slot.coldN : 0,
        mean_naturalness: slot.naturalnessN ? slot.naturalnessSum / slot.naturalnessN : 0,
        mean_vagueness: slot.vaguenessN ? slot.vaguenessSum / slot.vaguenessN : 0,
        composition_recovery_rate: slot.compRecN ? slot.compScoreSum / slot.compRecN : 0,
        pairwise_score,
        cold_n: slot.coldN,
        naturalness_n: slot.naturalnessN,
        n: slot.coldN + slot.naturalnessN,
        tags: { ...slot.tags },
      };
      stats.recovery_rate = stats.cold_recovery_rate;
      // pairwise_score passes through as null when Task C never ran — the
      // weight formula renormalizes instead of injecting a constant.
      stats.intuition_weight = computeIntuitionWeight(stats);
      aggregates[conceptId][key] = stats;
    }
  }
  return aggregates;
}

/**
 * Unified aggregator — v3 intuition or legacy v2 rounds.
 */
export function aggregateAllRounds(rounds, options = {}) {
  const version = options.promptVersion ?? PROMPT_VERSION;
  const sample = (rounds ?? []).filter(r => (r.prompt_version ?? '1') === version);
  if (sample.some(isIntuitionRound)) {
    return aggregateIntuitionRounds(rounds, options);
  }
  return aggregateRounds(rounds, options);
}

/**
 * Merge aggregates across prompt versions — newest version wins per concept.
 * Keeps v3 data for concepts not yet re-run on v4+.
 */
export function mergePromptAggregates(rounds, options = {}) {
  const versions = options.versions ?? [PROMPT_VERSION, V4_PROMPT_VERSION, V3_PROMPT_VERSION];
  const merged = {};
  for (const version of versions) {
    const chunk = aggregateIntuitionRounds(rounds, { ...options, promptVersion: version });
    for (const [conceptId, byKey] of Object.entries(chunk)) {
      if (merged[conceptId]) continue;
      merged[conceptId] = byKey;
    }
  }
  if (Object.keys(merged).length) return merged;
  return aggregateAllRounds(rounds, options);
}

function parseCompositionKey(key) {
  return String(key ?? '').split('+').filter(Boolean);
}

function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export function llmThresholds() {
  return {
    minRecovery: envNumber('LLM_MIN_RECOVERY', 0.75),
    minColdRecovery: envNumber('LLM_MIN_COLD_RECOVERY', 0.25),
    minMargin: envNumber('LLM_MIN_MARGIN', 0.15),
    minRounds: envNumber('LLM_MIN_ROUNDS', 4),
  };
}

/**
 * @param {object[]} rounds
 * @param {object} [options]
 * @param {string} [options.promptVersion]  when set, only include matching rounds
 */
export function aggregateRounds(rounds, options = {}) {
  const { promptVersion = null } = options;
  const filtered = promptVersion
    ? (rounds ?? []).filter(r => (r.prompt_version ?? '1') === promptVersion)
    : (rounds ?? []);
  /** @type {Record<string, Record<string, { recovered: number, confidenceSum: number, n: number, tags: Record<string, number> }>>} */
  const buckets = {};

  for (const round of filtered) {
    const conceptId = round.concept_id;
    const key = compositionKey(round.candidate_composition);
    if (!conceptId || !key) continue;

    buckets[conceptId] ??= {};
    buckets[conceptId][key] ??= {
      recovered: 0, coldRecovered: 0, confidenceSum: 0, repairTurnsSum: 0, n: 0, tags: {},
    };
    const slot = buckets[conceptId][key];
    slot.n += 1;
    if (round.recovered) slot.recovered += 1;
    if (round.recovered && (round.repair_turns ?? 0) === 0) slot.coldRecovered += 1;
    if (typeof round.confidence === 'number') slot.confidenceSum += round.confidence;
    slot.repairTurnsSum += Number(round.repair_turns ?? 0);
    for (const tag of round.tags ?? []) {
      if (!tag) continue;
      slot.tags[tag] = (slot.tags[tag] ?? 0) + 1;
    }
  }

  /** @type {Record<string, Record<string, { recovery_rate: number, mean_confidence: number, n: number, tags: Record<string, number> }>>} */
  const aggregates = {};
  for (const [conceptId, byKey] of Object.entries(buckets)) {
    aggregates[conceptId] = {};
    for (const [key, slot] of Object.entries(byKey)) {
      aggregates[conceptId][key] = {
        recovery_rate: slot.n ? slot.recovered / slot.n : 0,
        cold_recovery_rate: slot.n ? slot.coldRecovered / slot.n : 0,
        mean_confidence: slot.n ? slot.confidenceSum / slot.n : 0,
        mean_repair_turns: slot.n ? slot.repairTurnsSum / slot.n : 0,
        n: slot.n,
        tags: { ...slot.tags },
      };
    }
  }
  return aggregates;
}

/**
 * Pick a clear LLM consensus winner for one concept, or null if split/below threshold.
 * @param {Record<string, Record<string, object>>} aggregates
 * @param {string} conceptId
 * @param {object} [options]
 */
export function pickConsensus(aggregates, conceptId, options = {}) {
  const { minRecovery, minColdRecovery, minMargin, minRounds } = { ...llmThresholds(), ...options };
  const byKey = aggregates?.[conceptId];
  if (!byKey || !Object.keys(byKey).length) return null;

  const usesIntuition = Object.values(byKey).some(s => s.intuition_weight != null);
  const scoreOf = stats => (usesIntuition
    ? stats.intuition_weight
    : (stats.cold_recovery_rate ?? stats.recovery_rate ?? 0));

  const ranked = Object.entries(byKey)
    .map(([key, stats]) => ({
      key,
      composition: parseCompositionKey(key),
      ...stats,
      rank_score: scoreOf(stats),
    }))
    .sort((a, b) =>
      b.rank_score - a.rank_score
      || (b.mean_naturalness ?? 0) - (a.mean_naturalness ?? 0)
      || (b.cold_recovery_rate ?? 0) - (a.cold_recovery_rate ?? 0)
      || (a.mean_vagueness ?? 99) - (b.mean_vagueness ?? 99)
      || b.recovery_rate - a.recovery_rate
      || (a.mean_repair_turns ?? 99) - (b.mean_repair_turns ?? 99)
      || b.mean_confidence - a.mean_confidence
      || b.n - a.n);

  const winner = ranked[0];
  const runnerUp = ranked[1];
  const winnerScore = scoreOf(winner);
  const runnerScore = runnerUp ? scoreOf(runnerUp) : 0;
  const minScore = usesIntuition
    ? envNumber('LLM_MIN_INTUITION', 0.35)
    : (winner.cold_recovery_rate != null ? minColdRecovery : minRecovery);

  const minN = usesIntuition
    ? Math.max(2, Math.floor(minRounds / 2))
    : minRounds;

  if (!winner || (winner.naturalness_n ?? winner.n ?? 0) < minN || winnerScore < minScore) return null;
  if (runnerUp && winnerScore - runnerScore < minMargin) return null;

  return {
    composition: winner.composition,
    compositionKey: winner.key,
    recovery_rate: winner.recovery_rate,
    cold_recovery_rate: winner.cold_recovery_rate ?? null,
    mean_naturalness: winner.mean_naturalness ?? null,
    mean_vagueness: winner.mean_vagueness ?? null,
    intuition_weight: winner.intuition_weight ?? null,
    mean_confidence: winner.mean_confidence,
    mean_repair_turns: winner.mean_repair_turns ?? null,
    n: winner.n,
    tags: winner.tags ?? {},
    runner_up: runnerUp
      ? {
        compositionKey: runnerUp.key,
        recovery_rate: runnerUp.recovery_rate,
        cold_recovery_rate: runnerUp.cold_recovery_rate ?? null,
        intuition_weight: runnerUp.intuition_weight ?? null,
        n: runnerUp.n,
      }
      : null,
  };
}

export function roundResumeKey(round) {
  return [
    round.concept_id,
    compositionKey(round.candidate_composition),
    round.persona,
    round.prompt_version ?? PROMPT_VERSION,
  ].join('|');
}

export function buildResumeSet(rounds) {
  return new Set((rounds ?? []).map(roundResumeKey));
}

/** @returns {Map<string, { recovery_rate: number, mean_confidence: number, n: number }>} */
export function llmScoresForConcept(aggregates, conceptId) {
  const byKey = aggregates?.[conceptId] ?? {};
  return new Map(Object.entries(byKey).map(([key, stats]) => [key, stats]));
}

function printIntuitionReport(conceptId, aggregates) {
  const byKey = aggregates?.[conceptId];
  if (!byKey) {
    console.log(`No v3 intuition data for "${conceptId}".`);
    return;
  }
  const ranked = Object.entries(byKey)
    .sort((a, b) => (b[1].intuition_weight ?? 0) - (a[1].intuition_weight ?? 0));

  console.log(`Compositional Intuition Battery — "${conceptId}" (v4)\n`);
  console.log('  weight  cold  natural  vague  pair   composition');
  for (const [key, s] of ranked) {
    console.log(
      `  ${(s.intuition_weight ?? 0).toFixed(2).padStart(5)}`
      + `  ${((s.cold_recovery_rate ?? 0) * 100).toFixed(0).padStart(3)}%`
      + `   ${(s.mean_naturalness ?? 0).toFixed(2).padStart(5)}`
      + `  ${(s.mean_vagueness ?? 0).toFixed(2).padStart(5)}`
      + `  ${s.pairwise_score != null ? (s.pairwise_score * 100).toFixed(0).padStart(3) + '%' : '  -'}`
      + `   ${key.replace(/\+/g, ' + ')}`,
    );
  }
  const consensus = pickConsensus(aggregates, conceptId);
  console.log('');
  if (consensus) {
    console.log(`Consensus: ${consensus.compositionKey.replace(/\+/g, ' + ')}`
      + ` (weight ${(consensus.intuition_weight ?? 0).toFixed(2)})`);
  } else {
    console.log('Consensus: none (split or below threshold)');
  }
}

function printReport(conceptId, aggregates) {
  const sample = aggregates?.[conceptId];
  if (sample && Object.values(sample).some(s => s.intuition_weight != null)) {
    printIntuitionReport(conceptId, aggregates);
    return;
  }
  const byKey = aggregates?.[conceptId];
  if (!byKey) {
    console.log(`No LLM evaluations for "${conceptId}".`);
    return;
  }
  const ranked = Object.entries(byKey)
    .sort((a, b) =>
      (b[1].cold_recovery_rate ?? b[1].recovery_rate) - (a[1].cold_recovery_rate ?? a[1].recovery_rate)
      || b[1].recovery_rate - a[1].recovery_rate
      || (a[1].mean_repair_turns ?? 99) - (b[1].mean_repair_turns ?? 99));

  console.log(`LLM playtest results for "${conceptId}":\n`);
  console.log('  cold  overall  conf   rt   n   composition');
  for (const [key, stats] of ranked) {
    const cold = stats.cold_recovery_rate != null
      ? `${(stats.cold_recovery_rate * 100).toFixed(0).padStart(3)}%`
      : '  -';
    console.log(
      `  ${cold}`
      + `  ${(stats.recovery_rate * 100).toFixed(0).padStart(3)}%`
      + `   ${stats.mean_confidence.toFixed(2).padStart(4)}`
      + `  ${(stats.mean_repair_turns ?? 0).toFixed(2).padStart(4)}`
      + `  ${String(stats.n).padStart(3)}`
      + `   ${key.replace(/\+/g, ' + ')}`,
    );
  }

  const consensus = pickConsensus(aggregates, conceptId);
  console.log('');
  if (consensus) {
    const cold = consensus.cold_recovery_rate != null
      ? `, cold ${(consensus.cold_recovery_rate * 100).toFixed(0)}%`
      : '';
    console.log(`Consensus: ${consensus.compositionKey.replace(/\+/g, ' + ')}`
      + ` (${(consensus.recovery_rate * 100).toFixed(0)}% overall${cold}, n=${consensus.n})`);
  } else {
    console.log('Consensus: none (split or below threshold)');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');
  if (reportIdx < 0) {
    console.error('Usage: node tools/fonoran-llm-aggregate.js --report <concept-id>');
    process.exit(1);
  }
  const conceptId = args[reportIdx + 1];
  if (!conceptId) {
    console.error('Missing concept id after --report');
    process.exit(1);
  }

  const { readDoc } = await import('./fonoran-store.js');
  const doc = await readDoc('llm_evaluations');
  const version = doc?.prompt_version ?? PROMPT_VERSION;
  const aggregates = aggregateAllRounds(doc?.rounds ?? [], { promptVersion: version });
  printReport(conceptId, aggregates);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
