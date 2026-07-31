#!/usr/bin/env node
/**
 * Phase IV compound audit — semantic teaching trees + phonetic ease.
 *
 * Compares live compounds against semantic-foundation demo trees, seed coverage,
 * dependency integrity, and root pronounceability tiers.
 *
 * Run: npm run fonoran:compound-audit
 *      npm run fonoran:compound-audit -- --json
 *      npm run fonoran:compound-audit -- --out=reports/compound-audit.md
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main.js';
import { readDoc } from './fonoran-store.js';
import { ASSOCIATION_SEEDS, loadCandidateContext } from './fonoran-expression-candidates.js';
import { experienceMetaFor } from './fonoran-experience-tiers.js';
import { splitRoot } from './fonoran-gen3-distinctiveness.js';
import { checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { buildCompositionResolver, maxFlattenedRoots } from './fonoran-composition-resolve.js';
import { isPreferredLocked, optimizeCompoundInventory } from './fonoran-preferred-select.js';
import { auditCompoundConfusability } from './fonoran-compound-confusability.js';
import { buildSemanticContext, rankAllCandidates, scoreAllCompounds } from './fonoran-compound-semantics.js';

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
  const [compoundsDoc, inventory, approved, candidatesDoc, candidateCtx] =
    await Promise.all([
      readDoc('compounds'),
      readDoc('concept_inventory'),
      readDoc('approved_roots'),
      readDoc('root_candidates'),
      loadCandidateContext(),
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
  const collisionCountFor = candidateCtx.collisionCountFor;
  const rankCtx = {
    metaFor,
    collisionCounts,
    collisionCountFor,
    flatCountFor: comp => resolver.flatCount(comp),
  };
  const rootGraph = {
    rootById: Object.fromEntries(roots.map(r => [r.id, r.spelling])),
    rootSpellings: roots.map(r => r.spelling),
    primitiveIds: [...primitiveIds],
    demoTrees,
    rankCtx,
  };

  const optimizeCtx = {
    rootById: rootGraph.rootById,
    rootSpellings: rootGraph.rootSpellings,
    primitiveIds: rootGraph.primitiveIds,
    metaFor,
    collisionCounts,
    collisionCountFor,
    demoTrees,
  };
  const { compounds: optimizedRows } = optimizeCompoundInventory(
    compoundsDoc?.compounds ?? [],
    optimizeCtx,
    { useLlm: false },
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
        // Deterministic optimizer only: the LLM consensus branch is gone with useLlm false.
        add('medium', 'would_promote', c.concept,
          `Optimizer would promote ${(sel.from ?? c.composition).join(' + ')} → ${sel.to.join(' + ')}`,
          {
            from: sel.from ?? c.composition,
            to: sel.to,
            from_flat: sel.from_flat,
            to_flat: sel.to_flat,
            reason: sel.reason,
          });
      }
    }

  }

  // --- Deterministic semantic checks: does the composition match the concept's own gloss? ---
  const semanticCtx = buildSemanticContext({
    inventory,
    compounds: compoundsDoc?.compounds ?? [],
    approvedRoots: roots,
    localization: await readDoc('localization_en').catch(() => null),
    dimensions: JSON.parse(readFileSync(join(ROOT, 'data/fonoran-semantic-dimensions.json'), 'utf8')),
    candidatesByConcept: ASSOCIATION_SEEDS,
  });
  const glossRankings = rankAllCandidates(compoundsDoc?.compounds ?? [], semanticCtx);
  const glossScores = scoreAllCompounds(compoundsDoc?.compounds ?? [], semanticCtx);

  for (const ranking of glossRankings) {
    if (!ranking.informative) {
      // Not pedantry: a gloss that only restates the headword is the reason a compound can
      // drift without anything noticing, because there is nothing to check the parts against.
      add('low', 'uninformative_gloss', ranking.concept,
        `Gloss only restates the headword, so the composition cannot be checked against it`,
        { gloss: ranking.gloss, composition: ranking.preferred });
      continue;
    }
    if (!ranking.better_available) continue;
    const locked = isPreferredLocked(ranking.preferred_source);
    add(locked ? 'high' : 'medium', 'gloss_mismatch', ranking.concept,
      `Gloss supports ${ranking.best.composition.join(' + ')} (${ranking.best.supported}/${ranking.best.total} roots named) over preferred ${ranking.preferred.join(' + ')} (${ranking.current.supported}/${ranking.current.total})`,
      {
        gloss: ranking.gloss,
        from: ranking.preferred,
        to: ranking.best.composition,
        from_support: ranking.current.score,
        to_support: ranking.best.score,
        preferred_source: ranking.preferred_source,
        locked,
      });
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

  // --- Summary stats ---
  const treeAware = live.filter(c => usesIntermediateCompound(c.composition, compoundIds)).length;
  const seeded = live.filter(c => ASSOCIATION_SEEDS[c.concept]?.length).length;

  const glossInformative = glossRankings.filter(r => r.informative);
  const glossFullySupported = glossInformative.filter(r => r.current?.score === 1).length;
  const glossMismatches = glossRankings.filter(r => r.informative && r.better_available);

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
    gloss_auditable: glossInformative.length,
    gloss_uninformative: glossRankings.length - glossInformative.length,
    gloss_fully_supported: glossFullySupported,
    gloss_mismatch: glossMismatches.length,
    gloss_mismatch_locked: glossMismatches.filter(r => isPreferredLocked(r.preferred_source)).length,
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
  };

  findings.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    // Corpus-wide findings carry no concept, so compare defensively rather than throwing.
    || String(a.concept ?? '').localeCompare(String(b.concept ?? ''))
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
  lines.push(`| Auditable against a gloss | ${summary.gloss_auditable} (${summary.gloss_uninformative} glosses only restate the headword) |`);
  lines.push(`| Every root named by the gloss | ${summary.gloss_fully_supported} |`);
  lines.push(`| Gloss supports a listed candidate better | ${summary.gloss_mismatch} (${summary.gloss_mismatch_locked} locked) |`);
  lines.push(`| Heuristic preferred / locked | ${summary.heuristic_preferred_count} / ${summary.locked_preferred_count} |`);
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
  // The report is a regenerated snapshot, not prose: it lives in reports/ (untracked)
  // so a stale copy never masquerades as documentation.
  const outPath = outArg
    ? outArg.slice('--out='.length)
    : join(ROOT, 'reports/fonoran-compound-audit.md');

  const audit = await runCompoundAudit();

  if (jsonOut) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  const md = renderMarkdown(audit);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  console.log(`Compound audit written to ${outPath}`);
  console.log(`  ${audit.summary.live_compound_count} compounds, ${audit.findings.length} findings`);
  console.log(`  critical=${audit.summary.findings_by_severity.critical} high=${audit.summary.findings_by_severity.high}`);
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
