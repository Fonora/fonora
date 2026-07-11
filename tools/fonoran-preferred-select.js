/**
 * Deterministic preferred-form selection for compound inventory.
 *
 * Ranks seed candidates with flattened-length scoring, validates build constraints,
 * and promotes winners when policy allows. Playtest/human locks are respected.
 */

import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import { readDoc } from './fonoran-store.js';
import { segmentCompound, checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { maxFlattenedRoots } from './fonoran-composition-resolve.js';
import { scoreUnderstandability } from './fonoran-understandability.js';
import { rankCandidates, ASSOCIATION_SEEDS } from './fonoran-expression-candidates.js';
import { pickConsensus, compositionKey as llmCompositionKey, llmScoresForConcept } from './fonoran-llm-aggregate.js';
import { computeBoundaryQuality } from './fonoran-compound-confusability.js';

const LOCKED_SOURCES = new Set(['playtest', 'human']);
const DEFAULT_SCORE_MARGIN = 0.02;

function compositionKey(comp) {
  return (comp ?? []).join('+');
}

function normalizeCompoundRow(c) {
  return {
    concept: c.concept,
    composition: c.preferred?.composition ?? c.composition ?? [],
    gloss: c.preferred?.gloss ?? c.gloss ?? '',
    preferred_source: c.preferred_source ?? 'heuristic',
    alternates: c.alternates ?? [],
    notes: c.notes ?? '',
    understandability: c.understandability ?? null,
  };
}

export function isPreferredLocked(source) {
  return LOCKED_SOURCES.has(source);
}

/** @param {Record<string, string>} rootById  concept id → root spelling */
export function createBuildValidationContext({ rootById, rootSpellings, primitiveIds }) {
  const segInventory = rootSpellings.map(root => ({ root, id: root }));
  const resolvedById = new Map();
  const usedSpellings = new Set(rootSpellings);
  const primitiveIdSet = new Set(primitiveIds ?? Object.keys(rootById));

  for (const [id, spelling] of Object.entries(rootById)) {
    resolvedById.set(id, { roots: [spelling], spelling });
  }

  return {
    resolvedById,
    usedSpellings,
    segInventory,
    primitiveIdSet,

    /** Register a compound's preferred form in the working graph. */
    recordCompound(conceptId, composition) {
      if (!composition?.length) return null;
      if (!composition.every(id => resolvedById.has(id))) return null;
      const rootSeq = composition.flatMap(id => resolvedById.get(id).roots);
      const spelling = rootSeq.join('');
      const prev = resolvedById.get(conceptId);
      if (prev?.spelling) usedSpellings.delete(prev.spelling);
      usedSpellings.add(spelling);
      resolvedById.set(conceptId, { roots: rootSeq, spelling });
      return { rootSeq, spelling };
    },

    /** Remove a compound from the working graph (before re-validating its candidates). */
    clearCompound(conceptId) {
      const prev = resolvedById.get(conceptId);
      if (prev?.spelling && primitiveIdSet.has(conceptId) === false) {
        usedSpellings.delete(prev.spelling);
        resolvedById.delete(conceptId);
      }
    },
  };
}

/**
 * Validate one composition against build rules (boundary, segmentation, spelling collision).
 * @param {string} conceptId
 * @param {string[]} composition
 * @param {ReturnType<typeof createBuildValidationContext>} buildCtx
 */
export function validateComposition(conceptId, composition, buildCtx) {
  if (!Array.isArray(composition) || !composition.length) {
    return { valid: false, reason: 'empty composition' };
  }
  if (buildCtx.primitiveIdSet.has(conceptId)) {
    return { valid: false, reason: 'shadows a primitive root id' };
  }
  if (!composition.every(id => buildCtx.resolvedById.has(id))) {
    return { valid: false, reason: 'unresolved components' };
  }

  const rootSeq = composition.flatMap(id => buildCtx.resolvedById.get(id).roots);
  const spelling = rootSeq.join('');
  const existing = buildCtx.resolvedById.get(conceptId);
  const spellingTaken = buildCtx.usedSpellings.has(spelling)
    && existing?.spelling !== spelling;

  if (spellingTaken) {
    return { valid: false, reason: `spelling "${spelling}" collides` };
  }

  const boundary = checkCompoundBoundary(rootSeq);
  if (!boundary.valid) {
    return { valid: false, reason: boundary.violations.map(v => v.reason).join('; ') };
  }

  const segs = segmentCompound(spelling, buildCtx.segInventory);
  const intended = rootSeq.join('+');
  const unique = segs.length === 1;
  const matchesIntent = segs.some(s => s.join('+') === intended);
  if (!unique || !matchesIntent) {
    return {
      valid: false,
      reason: `ambiguous segmentation (${segs.length}: ${segs.map(s => s.join('+')).join(' | ')})`,
    };
  }

  return {
    valid: true,
    rootSeq,
    spelling,
    flat_count: rootSeq.length,
  };
}

function statusFromScore(score) {
  if (score >= 0.5) return 'plausible';
  return 'confusing';
}

/** Shortest valid alternate at or under maxFlat; tie-break by understandability. */
function pickShortestLengthAlternate(validRanked, maxFlat, currentKey) {
  const shorter = validRanked.filter(r => {
    const flat = r.validation.flat_count ?? 99;
    return flat <= maxFlat && compositionKey(r.composition) !== currentKey;
  });
  if (!shorter.length) return null;
  shorter.sort((a, b) => {
    const flatA = a.validation.flat_count ?? 99;
    const flatB = b.validation.flat_count ?? 99;
    if (flatA !== flatB) return flatA - flatB;
    return b.understandability - a.understandability;
  });
  return shorter[0];
}

/**
 * Select preferred composition for one concept.
 */
export function selectPreferred(conceptId, {
  candidates = [],
  current = [],
  gloss = '',
  preferredSource = 'heuristic',
  buildCtx,
  rankCtx = {},
  llmAggregates = null,
  options = {},
}) {
  const scoreMargin = options.scoreMargin ?? DEFAULT_SCORE_MARGIN;
  const maxFlat = options.maxFlattened ?? maxFlattenedRoots();
  const flatCountFor = rankCtx.flatCountFor ?? (() => null);
  const useLlm = Boolean(options.useLlm && llmAggregates);
  const llmScores = useLlm ? llmScoresForConcept(llmAggregates, conceptId) : null;
  const llmConsensus = useLlm ? pickConsensus(llmAggregates, conceptId, options.llmThresholds) : null;

  const currentKey = compositionKey(current);
  const currentValidation = validateComposition(conceptId, current, buildCtx);
  const currentValid = currentValidation.valid;
  const currentFlat = currentValid
    ? currentValidation.flat_count
    : flatCountFor(current);
  const currentScore = scoreUnderstandability(current, {
    metaFor: rankCtx.metaFor,
    collisionCount: rankCtx.collisionCounts?.get(currentKey) ?? 1,
    flatCount: currentFlat,
  }).score;

  if (isPreferredLocked(preferredSource)) {
    return {
      preferred: { composition: current, gloss },
      preferred_source: preferredSource,
      promoted: false,
      reason: 'locked',
      flat_count: currentFlat,
      understandability: currentScore,
      demoted: [],
      current_valid: currentValid,
    };
  }

  const pool = [];
  const seen = new Set();
  for (const comp of [...candidates, current]) {
    const k = compositionKey(comp);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    pool.push(comp);
  }

  const ranked = rankCandidates(conceptId, pool, rankCtx);
  let validRanked = ranked
    .map(r => ({ ...r, validation: validateComposition(conceptId, r.composition, buildCtx) }))
    .filter(r => r.validation.valid);

  if (llmScores?.size) {
    validRanked = validRanked.sort((a, b) => {
      const aKey = compositionKey(a.composition);
      const bKey = compositionKey(b.composition);
      const aStats = llmScores.get(aKey);
      const bStats = llmScores.get(bKey);
      const aRank = aStats?.intuition_weight
        ?? aStats?.cold_recovery_rate
        ?? aStats?.recovery_rate
        ?? -1;
      const bRank = bStats?.intuition_weight
        ?? bStats?.cold_recovery_rate
        ?? bStats?.recovery_rate
        ?? -1;
      if (bRank !== aRank) return bRank - aRank;
      const aRepair = aStats?.mean_repair_turns ?? 99;
      const bRepair = bStats?.mean_repair_turns ?? 99;
      if (aRepair !== bRepair) return aRepair - bRepair;
      if (b.understandability !== a.understandability) return b.understandability - a.understandability;
      const aFlat = a.validation.flat_count ?? flatCountFor(a.composition) ?? 99;
      const bFlat = b.validation.flat_count ?? flatCountFor(b.composition) ?? 99;
      if (aFlat !== bFlat) return aFlat - bFlat;
      const aBoundary = computeBoundaryQuality(a.validation.rootSeq ?? []).score;
      const bBoundary = computeBoundaryQuality(b.validation.rootSeq ?? []).score;
      return bBoundary - aBoundary;
    });
  } else {
    validRanked = validRanked.sort((a, b) => {
      if (b.understandability !== a.understandability) return b.understandability - a.understandability;
      const aFlat = a.validation.flat_count ?? flatCountFor(a.composition) ?? 99;
      const bFlat = b.validation.flat_count ?? flatCountFor(b.composition) ?? 99;
      if (aFlat !== bFlat) return aFlat - bFlat;
      const aBoundary = computeBoundaryQuality(a.validation.rootSeq ?? []).score;
      const bBoundary = computeBoundaryQuality(b.validation.rootSeq ?? []).score;
      return bBoundary - aBoundary;
    });
  }

  if (!validRanked.length) {
    return {
      preferred: { composition: current, gloss },
      preferred_source: preferredSource,
      promoted: false,
      reason: 'no valid candidates',
      flat_count: currentFlat,
      understandability: currentScore,
      demoted: [],
    };
  }

  const top = validRanked[0];
  const topKey = compositionKey(top.composition);
  const beatScore = top.understandability >= currentScore + scoreMargin;
  const currentTooLong = currentFlat != null && currentFlat > maxFlat;
  const lengthOnly = Boolean(options.lengthOnly);
  let winner = top;
  let shouldPromote = false;
  let promoteReason = currentTooLong && !beatScore ? 'flattened length' : 'score';
  let promoteSource = 'heuristic';

  if (lengthOnly) {
    if (currentTooLong) {
      const lengthPick = pickShortestLengthAlternate(validRanked, maxFlat, currentKey);
      if (lengthPick) {
        winner = lengthPick;
        shouldPromote = compositionKey(lengthPick.composition) !== currentKey;
        promoteReason = 'flattened length';
        promoteSource = 'heuristic';
      }
    }
  } else if (currentTooLong) {
    const lengthPick = pickShortestLengthAlternate(validRanked, maxFlat, currentKey);
    if (lengthPick && compositionKey(lengthPick.composition) !== currentKey) {
      winner = lengthPick;
      shouldPromote = true;
      promoteReason = 'flattened length';
      promoteSource = 'heuristic';
    }
  } else {
    shouldPromote = topKey !== currentKey && beatScore;
    promoteReason = 'score';

    if (useLlm) {
      shouldPromote = false;
      promoteReason = 'llm_no_consensus';
      if (llmConsensus) {
        const consensusKey = llmCompositionKey(llmConsensus.composition);
        const consensusRow = validRanked.find(r => compositionKey(r.composition) === consensusKey);
        if (consensusKey !== currentKey && consensusRow) {
          shouldPromote = true;
          promoteReason = 'llm_consensus';
          promoteSource = 'llm_consensus';
          winner = consensusRow;
        }
      }
      if (!currentValid && topKey !== currentKey) {
        shouldPromote = true;
        promoteReason = 'invalid current';
        promoteSource = useLlm && llmConsensus ? 'llm_consensus' : 'heuristic';
        winner = top;
      }
    } else if (!currentValid && topKey !== currentKey) {
      shouldPromote = true;
      promoteReason = 'invalid current';
      winner = top;
    }
  }

  const winnerKey = compositionKey(winner.composition);

  if (!shouldPromote) {
    const holdReason = lengthOnly && !currentTooLong
      ? 'within length limit'
      : (lengthOnly && currentTooLong ? 'no shorter alternate' : (
        useLlm && !llmConsensus && topKey !== currentKey
          ? 'llm_split'
          : (winnerKey === currentKey ? 'already optimal' : 'policy held current')
      ));
    return {
      preferred: { composition: current, gloss },
      preferred_source: preferredSource === 'llm_consensus' ? preferredSource : 'heuristic',
      promoted: false,
      reason: holdReason,
      flat_count: currentFlat,
      understandability: currentScore,
      demoted: [],
      top_candidate: winner.composition,
      top_score: winner.understandability,
      llm_consensus: llmConsensus,
    };
  }

  const demoted = currentKey && winnerKey !== currentKey
    ? [{
      composition: current,
      understandability: currentScore,
      label: scoreUnderstandability(current, {
        metaFor: rankCtx.metaFor,
        collisionCount: rankCtx.collisionCounts?.get(currentKey) ?? 1,
        flatCount: currentFlat,
      }).label,
      status: statusFromScore(currentScore),
      source: 'demoted_heuristic',
    }]
    : [];

  return {
    preferred: { composition: winner.composition, gloss },
    preferred_source: promoteSource,
    promoted: true,
    reason: promoteReason,
    flat_count: winner.validation.flat_count,
    understandability: winner.understandability,
    demoted,
    from: current,
    to: winner.composition,
    from_flat: currentFlat,
    to_flat: winner.validation.flat_count,
    from_score: currentScore,
    to_score: winner.understandability,
    llm_consensus: llmConsensus,
  };
}

export function topologicalSortCompounds(compounds) {
  const byId = new Map(compounds.map(c => [c.concept, c]));
  const sorted = [];
  const done = new Set();

  function visit(id, stack = new Set()) {
    if (done.has(id)) return;
    if (stack.has(id)) return;
    stack.add(id);
    const c = byId.get(id);
    if (c) {
      for (const part of c.composition ?? c.preferred?.composition ?? []) {
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

function workingCompoundDefs(workingPreferred) {
  return [...workingPreferred.entries()].map(([concept, composition]) => ({
    concept,
    preferred: { composition },
  }));
}

/**
 * Optimize full compound inventory in dependency order.
 * @param {object[]} compounds  raw compound rows from compounds.json
 * @param {object} ctx  { rootById, rootSpellings, primitiveIds, metaFor, collisionCounts, demoTrees }
 */
export function optimizeCompoundInventory(compounds, ctx, options = {}) {
  const rows = compounds.map(normalizeCompoundRow);
  const buildCtx = createBuildValidationContext({
    rootById: ctx.rootById,
    rootSpellings: ctx.rootSpellings,
    primitiveIds: ctx.primitiveIds,
  });

  const workingPreferred = new Map();
  const promotions = [];
  const demoTrees = ctx.demoTrees ?? new Map();
  const llmAggregates = options.useLlm ? (ctx.llmAggregates ?? null) : null;

  const sorted = topologicalSortCompounds(rows);

  for (const row of sorted) {
    const current = row.composition;
    const seedCandidates = ASSOCIATION_SEEDS[row.concept] ?? [];
    const demoCandidate = demoTrees.get(row.concept);
    const extraCandidates = demoCandidate ? [demoCandidate] : [];

    const flatCountFor = comp => {
      const defs = workingCompoundDefs(workingPreferred);
      const resolver = buildCompositionResolver(ctx.primitiveIds, defs);
      return resolver.flatCount(comp);
    };

    const rankCtx = {
      metaFor: ctx.metaFor,
      collisionCounts: ctx.collisionCounts,
      flatCountFor,
    };

    buildCtx.clearCompound(row.concept);

    const selection = selectPreferred(row.concept, {
      candidates: [...seedCandidates, ...extraCandidates],
      current,
      gloss: row.gloss,
      preferredSource: row.preferred_source,
      buildCtx,
      rankCtx,
      llmAggregates,
      options,
    });

    const preferredComposition = selection.preferred.composition;
    workingPreferred.set(row.concept, preferredComposition);
    buildCtx.recordCompound(row.concept, preferredComposition);

    if (selection.promoted) {
      promotions.push({
        concept: row.concept,
        from: selection.from,
        to: selection.to,
        from_flat: selection.from_flat,
        to_flat: selection.to_flat,
        from_score: selection.from_score,
        to_score: selection.to_score,
        reason: selection.reason,
      });
    }

    row.preferred = selection.preferred;
    row.preferred_source = selection.preferred_source;
    row.understandability = selection.understandability;
    row._demoted = selection.demoted ?? [];
    row._selection = selection;
  }

  return { compounds: rows, promotions, buildCtx };
}

/** Derive heuristic alternates for one optimized row. */
export function deriveAlternatesForCompound(row, rankCtx) {
  const preferredComposition = row.preferred.composition;
  const prefKey = compositionKey(preferredComposition);
  const humanAlternates = (row.alternates ?? []).filter(
    a => a.source && a.source !== 'heuristic' && a.source !== 'demoted_heuristic',
  );
  const humanKeys = new Set(humanAlternates.map(a => compositionKey(a.composition)));
  const demotedKeys = new Set((row._demoted ?? []).map(d => compositionKey(d.composition)));

  const seedAlternates = (ASSOCIATION_SEEDS[row.concept] ?? [])
    .filter(comp => {
      const k = compositionKey(comp);
      return k !== prefKey && !humanKeys.has(k);
    })
    .map(comp => {
      const k = compositionKey(comp);
      const s = scoreUnderstandability(comp, {
        metaFor: rankCtx.metaFor,
        collisionCount: rankCtx.collisionCounts?.get(k) ?? 1,
        flatCount: rankCtx.flatCountFor?.(comp) ?? null,
      });
      return {
        composition: comp,
        understandability: s.score,
        label: s.label,
        status: statusFromScore(s.score),
        source: 'heuristic',
      };
    })
    .sort((a, b) => b.understandability - a.understandability);

  const demoted = (row._demoted ?? []).filter(d => compositionKey(d.composition) !== prefKey);
  const merged = [...humanAlternates, ...demoted];
  const mergedKeys = new Set(merged.map(a => compositionKey(a.composition)));
  for (const alt of seedAlternates) {
    if (merged.length >= 4) break;
    const k = compositionKey(alt.composition);
    if (mergedKeys.has(k) || demotedKeys.has(k)) continue;
    merged.push(alt);
    mergedKeys.add(k);
  }

  return merged.slice(0, 4);
}

/** Load root spellings for build validation. */
export async function loadRootGraph() {
  const [inventory, approved] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
  ]);
  const rootById = Object.fromEntries((approved?.roots ?? []).map(r => [r.id, r.spelling]));
  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const rootSpellings = [...new Set(Object.values(rootById))];
  return { rootById, rootSpellings, primitiveIds };
}

/**
 * Preview whether optimizer would promote (for audit).
 */
export function wouldPromote(conceptId, compounds, ctx, options = {}) {
  const row = compounds.find(c => c.concept === conceptId);
  if (!row) return null;
  const buildCtx = createBuildValidationContext({
    rootById: ctx.rootById,
    rootSpellings: ctx.rootSpellings,
    primitiveIds: ctx.primitiveIds,
  });
  for (const c of topologicalSortCompounds(compounds.map(normalizeCompoundRow))) {
    if (c.concept === conceptId) break;
    const comp = c.preferred?.composition ?? c.composition;
    if (comp?.length) buildCtx.recordCompound(c.concept, comp);
  }
  const current = row.preferred?.composition ?? row.composition ?? [];
  const selection = selectPreferred(conceptId, {
    candidates: [...(ASSOCIATION_SEEDS[conceptId] ?? []), ...(ctx.demoTrees?.get(conceptId) ? [ctx.demoTrees.get(conceptId)] : [])],
    current,
    gloss: row.preferred?.gloss ?? row.gloss ?? '',
    preferredSource: row.preferred_source ?? 'heuristic',
    buildCtx,
    rankCtx: ctx.rankCtx,
    options,
  });
  return selection.promoted ? selection : null;
}
