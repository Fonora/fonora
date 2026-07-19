/**
 * LLM-driven composition iteration for existing compound concepts.
 *
 * Keeps the concept inventory (WHAT words exist). Asks the LLM HOW to express each
 * concept from primitives — without re-picking hardcoded ASSOCIATION_SEEDS.
 */

import '../load-env.js';

import { readDoc, writeDoc } from './fonoran-store.js';
import { proposeLlmCandidates, llmConfigured } from './fonoran-llm-candidates.js';
import {
  rankCandidates,
  loadCandidateContext,
} from './fonoran-expression-candidates.js';
import {
  createBuildValidationContext,
  isCompoundEditoriallyLocked,
  loadRootGraph,
  validateComposition,
} from './fonoran-preferred-select.js';
import { createCompoundProposals } from './fonoran-compound-proposals.js';
import { evaluateCampfireComposition } from './fonoran-campfire-composition.js';
import { loadRootSemanticFields } from './fonoran-root-semantic-fields.js';
import { compositionKey } from './fonoran-llm-aggregate.js';
import { assertLlmPipelineWroteOutput } from './fonoran-llm-output-guard.js';

const ITERABLE_SOURCES = new Set(['heuristic', 'llm_consensus', 'proposal', 'llm_proposer']);

const CONCEPT_HINTS = {
  law: 'Express shared rules or a path the group follows — e.g. collective+path or collective+rule. '
    + 'Do NOT use collective+still, bond+hold, or "frozen" metaphors.',
  government: 'Express collective governance — e.g. collective+rule or community+rule. '
    + 'Avoid community+strong or raw strength metaphors.',
  justice: 'If expressing as compound: equal treatment under shared rules — e.g. equal+rule.',
};

function parseArgs(argv) {
  const opts = {
    concepts: null,
    limit: Infinity,
    dryRun: false,
    apply: false,
    force: false,
    replace: false,
    heuristicOnly: true,
    count: 5,
    scoreMargin: 0.01,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--replace') opts.replace = true;
    else if (a === '--all-sources') opts.heuristicOnly = false;
    else if (a.startsWith('--concepts=')) {
      opts.concepts = a.slice('--concepts='.length).split(',').map(s => s.trim()).filter(Boolean);
      opts.replace = true;
    }
    else if (a.startsWith('--limit=')) opts.limit = Number(a.slice('--limit='.length)) || Infinity;
    else if (a.startsWith('--count=')) opts.count = Number(a.slice('--count='.length)) || 5;
    else if (!a.startsWith('--') && !opts.concepts) opts.concepts = [a];
    else if (!a.startsWith('--') && opts.concepts) opts.concepts.push(a);
  }
  if (opts.concepts?.length) opts.replace = true;
  return opts;
}

function buildGlossById(inventory, approved) {
  const glossById = new Map();
  for (const p of inventory?.primitives ?? []) {
    glossById.set(p.id, p.plain_description ?? p.description ?? p.id);
  }
  for (const r of approved?.roots ?? []) {
    glossById.set(r.id, r.concept ?? r.id);
  }
  return glossById;
}

function primitiveIdSet(inventory) {
  return new Set(
    (inventory?.primitives ?? [])
      .filter(p => (p.suggested_status ?? 'primitive') !== 'compound_candidate')
      .map(p => p.id),
  );
}

function explainSkip(conceptId, compounds, inventory, opts) {
  if (primitiveIdSet(inventory).has(conceptId)) {
    return 'primitive root in inventory — compounds cannot shadow it';
  }
  const row = compounds.find(c => c.concept === conceptId);
  if (!row) return 'not in fonoran-compounds.json';
  if (!opts.force && isCompoundEditoriallyLocked(row)) {
    return `locked (${row.locked ? 'locked:true' : row.preferred_source}) — use --force to iterate`;
  }
  if (opts.heuristicOnly && !opts.concepts?.includes(conceptId)
    && !ITERABLE_SOURCES.has(row.preferred_source ?? 'heuristic')) {
    return `source ${row.preferred_source} — use --all-sources or --concepts=${conceptId} --force`;
  }
  return 'filtered by limit';
}

function pickTargets(compounds, inventory, opts) {
  let rows = compounds.map(c => ({
    concept: c.concept,
    composition: c.preferred?.composition ?? c.composition ?? [],
    gloss: c.preferred?.gloss ?? c.gloss ?? c.concept,
    preferred_source: c.preferred_source ?? 'heuristic',
    locked: c.locked === true,
    row: c,
  }));

  if (opts.concepts?.length) {
    const want = new Set(opts.concepts);
    rows = rows.filter(r => want.has(r.concept));
  } else if (opts.heuristicOnly) {
    rows = rows.filter(r => ITERABLE_SOURCES.has(r.preferred_source) && !r.locked);
  }

  rows = rows.filter(r => {
    if (opts.force && opts.concepts?.includes(r.concept)) return true;
    return !isCompoundEditoriallyLocked(r.row);
  });

  return rows.slice(0, opts.limit);
}

function pushAlternate(alternates, composition, gloss, source) {
  const key = compositionKey(composition);
  if (!key || alternates.some(a => compositionKey(a.composition) === key)) return alternates;
  return [...alternates, { composition, gloss, status: 'plausible', source }];
}

function shouldApply(opts, target, bestKey, currentKey, beatCurrent) {
  if (!bestKey || bestKey === currentKey) return false;
  if (opts.replace && opts.concepts?.includes(target.concept)) return true;
  if (opts.force && opts.concepts?.includes(target.concept)) return true;
  return beatCurrent;
}

/**
 * @param {string[]} argv process.argv slice
 */
export async function runCompoundIterate(argv = []) {
  if (!llmConfigured()) {
    throw new Error('ANTHROPIC_API_KEY or LLM_API_KEY required for compound iteration.');
  }

  const opts = parseArgs(argv);
  const startMs = Date.now();

  const [ctx, rootGraph, fields, inventory, approved] = await Promise.all([
    loadCandidateContext(),
    loadRootGraph(),
    loadRootSemanticFields(),
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
  ]);

  const glossById = buildGlossById(inventory, approved);
  const compoundsDoc = ctx.compoundsDoc ?? { compounds: [] };
  const allCompounds = compoundsDoc.compounds ?? [];
  const targets = pickTargets(allCompounds, inventory, opts);
  const skipped = [];

  if (opts.concepts?.length) {
    for (const id of opts.concepts) {
      if (!targets.some(t => t.concept === id)) {
        skipped.push({ concept: id, reason: explainSkip(id, allCompounds, inventory, opts) });
      }
    }
  }

  if (!targets.length) {
    return {
      ok: true,
      iterated: 0,
      skipped,
      message: 'No iterable concepts matched filters.',
      results: [],
      dryRun: opts.dryRun,
    };
  }

  const buildCtx = createBuildValidationContext({
    rootById: rootGraph.rootById,
    rootSpellings: rootGraph.rootSpellings,
    primitiveIds: rootGraph.primitiveIds,
  });

  const rankCtx = {
    metaFor: ctx.metaFor,
    collisionCounts: ctx.collisionCounts,
    flatCountFor: ctx.flatCountFor,
    difficultRootIds: ctx.difficultRootIds,
  };

  const results = [];
  const proposals = [];
  const updatedRows = new Map();

  for (const target of targets) {
    const llmResult = await proposeLlmCandidates(target.concept, {
      gloss: target.gloss,
      primitiveIds: rootGraph.primitiveIds,
      compoundDefs: allCompounds,
      maxFlattened: 4,
      count: opts.count,
      rejectComposition: target.composition,
      conceptHint: CONCEPT_HINTS[target.concept],
      glossById,
      glossaryLines: rootGraph.primitiveIds.map(id => `- ${id}: ${glossById.get(id) ?? id}`),
    });

    const llmComps = llmResult.compositions ?? [];
    const currentKey = compositionKey(target.composition);

    const llmOnly = llmComps.filter(c => compositionKey(c) !== currentKey);
    const ranked = rankCandidates(target.concept, llmOnly.length ? llmOnly : llmComps, rankCtx);

    const valid = ranked.filter(r => {
      const comp = r.composition;
      if (compositionKey(comp) === currentKey && opts.replace) return false;
      const v = validateComposition(target.concept, comp, buildCtx);
      if (!v.valid) return false;
      const campfire = evaluateCampfireComposition(target.concept, comp, { fields });
      return campfire.pass !== false;
    });

    const best = valid[0];
    const bestKey = best ? compositionKey(best.composition) : null;
    const currentScore = 0;

    const beatCurrent = best && bestKey !== currentKey
      && best.understandability >= currentScore + opts.scoreMargin;

    const rowResult = {
      concept: target.concept,
      from: target.composition,
      from_source: target.preferred_source,
      llm_proposed: llmComps.length,
      llm_candidates: llmComps.map(c => c.join('+')),
      llm_error: llmResult.error ?? null,
      best: best?.composition ?? null,
      best_score: best?.understandability ?? null,
      current_score: currentScore,
      action: 'hold',
    };

    if (!llmComps.length) {
      rowResult.action = 'llm_empty';
      results.push(rowResult);
      continue;
    }

    if (!best) {
      rowResult.action = 'no_valid_candidate';
      results.push(rowResult);
      continue;
    }

    if (shouldApply(opts, target, bestKey, currentKey, beatCurrent)) {
      if (opts.apply && !opts.dryRun) {
        const prev = target.row;
        const next = { ...prev };
        next.alternates = pushAlternate(
          prev.alternates ?? [],
          target.composition,
          target.gloss,
          prev.preferred_source ?? 'heuristic',
        );
        next.preferred = {
          composition: best.composition,
          gloss: target.gloss,
        };
        next.preferred_source = 'llm_proposer';
        next.understandability = best.understandability;
        next.notes = `LLM iteration ${new Date().toISOString().slice(0, 10)}: `
          + `${target.composition.join('+')} → ${best.composition.join('+')}`;
        updatedRows.set(target.concept, next);
        rowResult.action = 'applied';
      } else if (!opts.dryRun) {
        proposals.push({
          word: target.concept,
          concept_id: target.concept,
          gloss: target.gloss,
          source: 'compound_iterate',
          classification: 'compound',
          rationale: `Iterate: ${target.composition.join('+')} → ${best.composition.join('+')}`,
          compositions: llmComps,
          valid_compositions: valid.map(v => v.composition),
          chosen_composition: best.composition,
        });
        rowResult.action = 'proposed';
      } else {
        rowResult.action = 'would_apply';
      }
    }

    results.push(rowResult);
  }

  let proposalsAdded = 0;
  if (proposals.length && !opts.dryRun) {
    const created = await createCompoundProposals(proposals);
    proposalsAdded = created.length;
  }

  if (updatedRows.size && !opts.dryRun) {
    const compounds = allCompounds.map(c => updatedRows.get(c.concept) ?? c);
    await writeDoc('compounds', {
      ...compoundsDoc,
      compounds,
      compound_count: compounds.length,
      iterated_at: new Date().toISOString(),
    });
  }

  if (!opts.dryRun && (proposalsAdded > 0 || updatedRows.size > 0)) {
    await assertLlmPipelineWroteOutput({
      label: 'compound-iterate',
      startMs,
      proposalsAdded: opts.apply ? 0 : proposalsAdded,
      paths: opts.apply ? ['data/fonoran-compounds.json'] : ['data/fonoran-compound-proposals.json'],
    });
  }

  return {
    ok: true,
    iterated: results.length,
    applied: [...updatedRows.keys()],
    proposed: proposals.map(p => p.concept_id),
    skipped,
    results,
    dryRun: opts.dryRun,
  };
}
