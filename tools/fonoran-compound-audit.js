#!/usr/bin/env node
/**
 * Phase IV compound audit — semantic teaching trees + phonetic ease.
 *
 * Compares live compounds against semantic-foundation demo trees, seed coverage,
 * dependency integrity, and root pronounceability tiers.
 *
 * Run: npm run fonoran:compound-audit
 *      npm run fonoran:compound-audit -- --json
 *      npm run fonoran:compound-audit -- --out=docs/fonoran-compound-audit-latest.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc } from './fonoran-store.js';
import { ASSOCIATION_SEEDS, loadCandidateContext } from './fonoran-expression-candidates.js';
import { experienceMetaFor } from './fonoran-experience-tiers.js';
import { splitRoot } from './fonoran-gen3-distinctiveness.js';
import { checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { buildCompositionResolver, maxFlattenedRoots } from './fonoran-composition-resolve.js';
import { isPreferredLocked, optimizeCompoundInventory } from './fonoran-preferred-select.js';
import { pickConsensus, mergePromptAggregates } from './fonoran-llm-aggregate.js';
import { auditCompoundConfusability } from './fonoran-compound-confusability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TERTIARY_ONSETS = new Set(['p', 'ch', 'sh', 'j', 'r']);
const SECONDARY_ONSETS = new Set(['h', 'w', 'y']);

function compKey(comp) {
  return (comp ?? []).join('+');
}

function normalizeLive(def) {
  const composition = def.preferred?.composition ?? def.composition ?? [];
  return {
    concept: def.concept,
    composition,
    gloss: def.preferred?.gloss ?? def.gloss ?? '',
    alternates: def.alternates ?? [],
    notes: def.notes ?? '',
    preferred_source: def.preferred_source ?? 'heuristic',
  };
}

function onsetTier(spelling) {
  const { onset } = splitRoot((spelling ?? '').toLowerCase());
  if (TERTIARY_ONSETS.has(onset)) return 'tertiary';
  if (SECONDARY_ONSETS.has(onset)) return 'secondary';
  return 'preferred';
}

function severityRank(sev) {
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return order[sev] ?? 9;
}

function usesIntermediateCompound(composition, compoundIds) {
  return (composition ?? []).some(id => compoundIds.has(id));
}

function topologicalSort(compounds) {
  const byId = new Map(compounds.map(c => [c.concept, c]));
  const sorted = [];
  const done = new Set();

  function visit(id, stack = new Set()) {
    if (done.has(id)) return;
    if (stack.has(id)) return;
    stack.add(id);
    const c = byId.get(id);
    if (c) {
      for (const part of c.composition ?? []) {
        if (byId.has(part)) visit(part, stack);
      }
    }
    stack.delete(id);
    done.add(id);
    if (c) sorted.push(c);
  }

  for (const c of compounds) visit(c.concept);
  return sorted;
}

export async function runCompoundAudit() {
  const [compoundsDoc, inventory, approved, candidatesDoc, playtestsDoc, candidateCtx, llmDoc] =
    await Promise.all([
      readDoc('compounds'),
      readDoc('concept_inventory'),
      readDoc('approved_roots'),
      readDoc('root_candidates'),
      readDoc('playtests'),
      loadCandidateContext(),
      readDoc('llm_evaluations'),
    ]);
  const demoDoc = JSON.parse(
    readFileSync(join(ROOT, 'data/fonoran-semantic-demo-compounds.json'), 'utf8'),
  );

  const live = (compoundsDoc?.compounds ?? []).map(normalizeLive);
  const demo = demoDoc?.compounds ?? [];
  const demoById = new Map(demo.map(d => [d.id, d]));
  const liveById = new Map(live.map(c => [c.concept, c]));
  const compoundIds = new Set(live.map(c => c.concept));
  const primitiveIds = new Set([
    ...(inventory?.primitives ?? []).map(p => p.id),
    ...(approved?.roots ?? []).map(r => r.id),
  ]);
  const resolver = buildCompositionResolver([...primitiveIds], compoundsDoc?.compounds ?? []);
  const maxFlat = maxFlattenedRoots();
  const demoTrees = new Map((demo ?? []).map(d => [d.id, d.tree]));
  const roots = approved?.roots ?? [];
  const metaFor = candidateCtx.metaFor;
  const collisionCounts = candidateCtx.collisionCounts;
  const rankCtx = {
    metaFor,
    collisionCounts,
    flatCountFor: comp => resolver.flatCount(comp),
  };
  const rootGraph = {
    rootById: Object.fromEntries(roots.map(r => [r.id, r.spelling])),
    rootSpellings: roots.map(r => r.spelling),
    primitiveIds: [...primitiveIds],
    demoTrees,
    rankCtx,
  };

  const llmAggregates = mergePromptAggregates(llmDoc?.rounds ?? []);
  const optimizeCtx = {
    rootById: rootGraph.rootById,
    rootSpellings: rootGraph.rootSpellings,
    primitiveIds: rootGraph.primitiveIds,
    metaFor,
    collisionCounts,
    demoTrees,
    llmAggregates,
  };
  const { compounds: optimizedRows } = optimizeCompoundInventory(
    compoundsDoc?.compounds ?? [],
    optimizeCtx,
    { useLlm: Object.keys(llmAggregates).length > 0 },
  );
  const optimizedById = new Map(optimizedRows.map(r => [r.concept, r]));

  const rootById = Object.fromEntries(roots.map(r => [r.id, r]));
  const candidateById = Object.fromEntries((candidatesDoc?.candidates ?? []).map(c => [c.id, c]));

  const findings = [];

  function add(severity, category, concept, message, extra = {}) {
    findings.push({ severity, category, concept, message, ...extra });
  }

  // --- Semantic checks ---
  for (const d of demo) {
    if (primitiveIds.has(d.id)) continue;
    if (!liveById.has(d.id)) {
      add('critical', 'missing_reference', d.id,
        `In semantic demo (depth ${d.depth}) but absent from live compounds`,
        { expected_tree: d.tree });
    }
  }

  for (const d of demo) {
    const c = liveById.get(d.id);
    if (!c) continue;
    const liveKey = compKey(c.composition);
    const demoKey = compKey(d.tree);
    if (liveKey !== demoKey) {
      // Informational: preferred forms follow four-rules ASSOCIATION_SEEDS, not demo trees.
      add('low', 'tree_mismatch', d.id,
        `Preferred tree differs from reference demo tree (advisory)`,
        { live: c.composition, expected: d.tree, depth: d.depth });
    }
  }

  for (const c of live) {
    for (const part of c.composition) {
      if (primitiveIds.has(part) || compoundIds.has(part)) continue;
      add('critical', 'broken_dependency', c.concept,
        `Component "${part}" is neither a primitive root nor a compound in inventory`);
    }
  }

  for (const d of demo) {
    const c = liveById.get(d.id);
    if (!c || (d.depth ?? 1) < 2) continue;
    if (!usesIntermediateCompound(c.composition, compoundIds)) {
      // Flat primitive stacks are preferred under four-rules recoverability.
      add('low', 'flat_when_hierarchical', d.id,
        `Demo depth ${d.depth} but preferred uses only primitive roots (allowed)`,
        { composition: c.composition, expected_depth: d.depth });
    }
  }

  for (const c of live) {
    if (!ASSOCIATION_SEEDS[c.concept]?.length) {
      add('medium', 'no_seeds', c.concept, 'No ASSOCIATION_SEEDS entry');
    }
    if (!c.alternates.length) {
      add('medium', 'no_alternates', c.concept, 'No alternate meaning-attempts');
    }

    const flatCount = resolver.flatCount(c.composition);
    if (flatCount != null && flatCount > maxFlat) {
      const sev = flatCount > maxFlat + 1 ? 'high' : 'medium';
      const shorter = (c.alternates ?? [])
        .map(a => ({ comp: a.composition, flat: resolver.flatCount(a.composition) }))
        .filter(x => x.flat != null && x.flat <= maxFlat)
        .sort((a, b) => a.flat - b.flat);
      add(sev, 'flattened_length_high', c.concept,
        `Preferred form flattens to ${flatCount} roots (limit ${maxFlat})`,
        {
          flat_count: flatCount,
          composition: c.composition,
          shorter_alternates: shorter.slice(0, 3).map(x => x.comp),
        });
    }

    if (!isPreferredLocked(c.preferred_source)) {
      const opt = optimizedById.get(c.concept);
      const liveKey = compKey(c.composition);
      const optKey = compKey(opt?.preferred?.composition);
      const sel = opt?._selection;
      if (liveKey !== optKey && sel?.promoted) {
        const category = sel.preferred_source === 'llm_consensus' ? 'llm_would_promote' : 'would_promote';
        add('medium', category, c.concept,
          `${category === 'llm_would_promote' ? 'LLM consensus would promote' : 'Optimizer would promote'} ${(sel.from ?? c.composition).join(' + ')} → ${sel.to.join(' + ')}`,
          {
            from: sel.from ?? c.composition,
            to: sel.to,
            from_flat: sel.from_flat,
            to_flat: sel.to_flat,
            reason: sel.reason,
            llm_recovery: sel.llm_consensus?.recovery_rate ?? null,
          });
      }
    }

    const conceptAgg = llmAggregates[c.concept];
    if (conceptAgg && Object.keys(conceptAgg).length) {
      const consensus = pickConsensus(llmAggregates, c.concept);
      const liveKey = compKey(c.composition);
      const currentStats = conceptAgg[liveKey];
      if (!consensus) {
        add('medium', 'llm_split', c.concept,
          'LLM playtests have no clear consensus winner',
          { candidates: Object.keys(conceptAgg).length });
      } else if (compKey(consensus.composition) !== liveKey) {
        add('info', 'llm_would_promote', c.concept,
          `LLM consensus prefers ${consensus.composition.join(' + ')} (${(consensus.recovery_rate * 100).toFixed(0)}% recovery) over live preferred`,
          {
            llm_winner: consensus.composition,
            recovery_rate: consensus.recovery_rate,
            live_recovery: currentStats?.recovery_rate ?? null,
          });
      }
      if (currentStats && currentStats.recovery_rate < 0.75) {
        const best = Object.entries(conceptAgg).sort((a, b) => b[1].recovery_rate - a[1].recovery_rate)[0];
        if (best && best[0] !== liveKey) {
          add('medium', 'llm_low_recovery', c.concept,
            `Live preferred recovers at ${(currentStats.recovery_rate * 100).toFixed(0)}% in LLM playtests`,
            { live_recovery: currentStats.recovery_rate, best_candidate: best[0], best_recovery: best[1].recovery_rate });
        }
      }
    }
  }

  // --- Phonetic checks ---
  for (const r of roots) {
    const tier = onsetTier(r.spelling);
    const meta = experienceMetaFor(r.id);
    if (meta.language_tier === 'communicative_core' && tier === 'tertiary') {
      add('high', 'core_tertiary_onset', r.id,
        `Communicative-core root "${r.spelling}" uses tertiary onset (${splitRoot(r.spelling).onset})`,
        { spelling: r.spelling, phonetic_cost: candidateById[r.id]?.generation?.phonetic_cost ?? null });
    }
  }

  const coreRoots = roots.filter(r => experienceMetaFor(r.id).language_tier === 'communicative_core');
  const extRoots = roots.filter(r => experienceMetaFor(r.id).language_tier === 'extended_core');
  const avgCost = (list) => {
    const costs = list
      .map(r => candidateById[r.id]?.generation?.phonetic_cost ?? candidateById[r.id]?.phonetic_cost)
      .filter(n => typeof n === 'number');
    return costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  };

  const phoneticSummary = {
    core_count: coreRoots.length,
    core_avg_phonetic_cost: avgCost(coreRoots),
    core_tertiary_onsets: coreRoots.filter(r => onsetTier(r.spelling) === 'tertiary').length,
    extended_count: extRoots.length,
    extended_avg_phonetic_cost: avgCost(extRoots),
    tertiary_onset_roots: roots.filter(r => onsetTier(r.spelling) === 'tertiary').map(r => ({
      id: r.id, spelling: r.spelling, tier: experienceMetaFor(r.id).language_tier,
    })),
  };

  // --- Spoken confusability (phoneme-feature pairs + boundary quality) ---
  const rootByIdMap = Object.fromEntries(roots.map(r => [r.id, r.spelling]));
  const confusability = auditCompoundConfusability(
    compoundsDoc?.compounds ?? [],
    rootByIdMap,
    resolver,
  );

  for (const pair of confusability.near_pairs.slice(0, 25)) {
    add('medium', 'near_confusable_pair', pair.a,
      `Surface "${pair.surfaceA}" is phonetically near "${pair.surfaceB}" (${pair.b}, distinctness ${(pair.distinctness * 100).toFixed(0)}%)`,
      pair);
  }

  for (const issue of confusability.boundary_issues.filter(b => b.score < 0.75).slice(0, 20)) {
    add('low', 'boundary_quality', issue.concept,
      `Boundary quality ${(issue.score * 100).toFixed(0)}% on "${issue.surface}" (${issue.issues.join('; ')})`,
      issue);
  }

  // --- Playtest coverage ---
  const playtested = new Set((playtestsDoc?.rounds ?? []).map(r => r.concept_id));
  const untested = live.filter(c => !playtested.has(c.concept)).map(c => c.concept);

  // --- Summary stats ---
  const treeAware = live.filter(c => usesIntermediateCompound(c.composition, compoundIds)).length;
  const seeded = live.filter(c => ASSOCIATION_SEEDS[c.concept]?.length).length;

  const llmEvaluated = live.filter(c => llmAggregates[c.concept]).length;
  const llmConsensusCount = live.filter(c => {
    const consensus = pickConsensus(llmAggregates, c.concept);
    return consensus && compKey(consensus.composition) === compKey(c.composition);
  }).length;
  const llmSplitCount = live.filter(c => {
    const agg = llmAggregates[c.concept];
    return agg && Object.keys(agg).length && !pickConsensus(llmAggregates, c.concept);
  }).length;

  const summary = {
    generated_at: new Date().toISOString(),
    live_compound_count: live.length,
    demo_compound_count: demo.length,
    missing_from_live: demo.filter(d => !liveById.has(d.id)).length,
    tree_mismatches: findings.filter(f => f.category === 'tree_mismatch').length,
    broken_dependencies: findings.filter(f => f.category === 'broken_dependency').length,
    tree_aware_preferred: treeAware,
    seed_coverage: `${seeded}/${live.length}`,
    empty_alternates: live.filter(c => !c.alternates.length).length,
    flattened_length_high: findings.filter(f => f.category === 'flattened_length_high').length,
    would_promote: findings.filter(f => f.category === 'would_promote').length,
    llm_evaluated_count: llmEvaluated,
    llm_consensus_count: llmConsensusCount,
    llm_split_count: llmSplitCount,
    llm_would_promote: findings.filter(f => f.category === 'llm_would_promote').length,
    llm_low_recovery: findings.filter(f => f.category === 'llm_low_recovery').length,
    heuristic_preferred_count: live.filter(c => (c.preferred_source ?? 'heuristic') === 'heuristic').length,
    locked_preferred_count: live.filter(c => isPreferredLocked(c.preferred_source)).length,
    max_flattened_roots: maxFlat,
    confusability_near_pairs: confusability.near_pair_count,
    confusability_avg_boundary: confusability.avg_boundary_score,
    findings_by_severity: {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    },
    phonetic: phoneticSummary,
    playtested_concepts: playtested.size,
    untested_compound_count: untested.length,
  };

  findings.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || a.concept.localeCompare(b.concept)
    || a.category.localeCompare(b.category));

  const dependencyGraph = topologicalSort(live).map(c => ({
    concept: c.concept,
    composition: c.composition,
    uses_compounds: c.composition.filter(p => compoundIds.has(p)),
  }));

  return { summary, findings, dependencyGraph, live, demo };
}

function renderMarkdown({ summary, findings, dependencyGraph }) {
  const lines = [];
  lines.push('# Fonoran compound audit');
  lines.push('');
  lines.push(`> Generated: ${summary.generated_at}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Live compounds | ${summary.live_compound_count} |`);
  lines.push(`| Demo reference trees | ${summary.demo_compound_count} |`);
  lines.push(`| Missing from live | ${summary.missing_from_live} |`);
  lines.push(`| Tree mismatches | ${summary.tree_mismatches} |`);
  lines.push(`| Broken dependencies | ${summary.broken_dependencies} |`);
  lines.push(`| Tree-aware preferred forms | ${summary.tree_aware_preferred} |`);
  lines.push(`| Seed coverage | ${summary.seed_coverage} |`);
  lines.push(`| Empty alternates | ${summary.empty_alternates} |`);
  lines.push(`| Flattened length warnings (>${summary.max_flattened_roots} roots) | ${summary.flattened_length_high} |`);
  lines.push(`| Would promote (run optimize) | ${summary.would_promote} |`);
  lines.push(`| LLM evaluated / consensus / split | ${summary.llm_evaluated_count} / ${summary.llm_consensus_count} / ${summary.llm_split_count} |`);
  lines.push(`| LLM would promote / low recovery | ${summary.llm_would_promote} / ${summary.llm_low_recovery} |`);
  lines.push(`| Heuristic preferred / locked | ${summary.heuristic_preferred_count} / ${summary.locked_preferred_count} |`);
  lines.push(`| Playtested concepts | ${summary.playtested_concepts} |`);
  lines.push('');
  lines.push('### Findings by severity');
  lines.push('');
  for (const [sev, count] of Object.entries(summary.findings_by_severity)) {
    lines.push(`- **${sev}**: ${count}`);
  }
  lines.push('');
  lines.push('### Phonetic ease');
  lines.push('');
  lines.push(`- Communicative-core roots: ${summary.phonetic.core_count} (avg cost ${summary.phonetic.core_avg_phonetic_cost?.toFixed(1) ?? 'n/a'})`);
  lines.push(`- Core on tertiary onsets: ${summary.phonetic.core_tertiary_onsets}`);
  lines.push(`- Extended-core avg cost: ${summary.phonetic.extended_avg_phonetic_cost?.toFixed(1) ?? 'n/a'}`);
  if (summary.phonetic.tertiary_onset_roots.length) {
    lines.push('');
    lines.push('Tertiary-onset roots:');
    for (const r of summary.phonetic.tertiary_onset_roots) {
      lines.push(`- \`${r.id}\` → ${r.spelling} (${r.tier})`);
    }
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!findings.length) {
    lines.push('_No issues found._');
  } else {
    let lastSev = '';
    for (const f of findings) {
      if (f.severity !== lastSev) {
        lines.push(`### ${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}`);
        lines.push('');
        lastSev = f.severity;
      }
      lines.push(`- **${f.concept}** (${f.category}): ${f.message}`);
      if (f.expected) lines.push(`  - expected: \`${compKey(f.expected)}\``);
      if (f.live) lines.push(`  - live: \`${compKey(f.live)}\``);
    }
  }
  lines.push('');
  lines.push('## Teaching-tree dependency order');
  lines.push('');
  for (const n of dependencyGraph.slice(0, 40)) {
    const tag = n.uses_compounds.length ? ` [via: ${n.uses_compounds.join(', ')}]` : '';
    lines.push(`- \`${n.concept}\` = ${n.composition.join(' + ')}${tag}`);
  }
  if (dependencyGraph.length > 40) {
    lines.push(`- … and ${dependencyGraph.length - 40} more`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonOut = argv.includes('--json');
  const outArg = argv.find(a => a.startsWith('--out='));
  const outPath = outArg
    ? outArg.slice('--out='.length)
    : join(ROOT, 'docs/fonoran-compound-audit-latest.md');

  const audit = await runCompoundAudit();

  if (jsonOut) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  const md = renderMarkdown(audit);
  writeFileSync(outPath, md);
  console.log(`Compound audit written to ${outPath}`);
  console.log(`  ${audit.summary.live_compound_count} compounds, ${audit.findings.length} findings`);
  console.log(`  critical=${audit.summary.findings_by_severity.critical} high=${audit.summary.findings_by_severity.high}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
