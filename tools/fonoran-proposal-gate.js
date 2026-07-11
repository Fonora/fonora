/**
 * Automated proposal gate — phonetic, boundary, understandability, LLM intuition.
 * Used by the pre-community refine loop before auto-accept.
 */

import { checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import { scoreUnderstandability } from './fonoran-understandability.js';
import { experienceMetaFor } from './fonoran-experience-tiers.js';
import { rankCandidates } from './fonoran-expression-candidates.js';
import { createBuildValidationContext, validateComposition } from './fonoran-preferred-select.js';
import {
  computePhoneticScore,
  isExcludedSpelling,
  PHONETIC_SCORE_PASS,
} from './fonoran-phonetic-weights.js';
import { confusabilityPenalty } from './fonoran-compound-confusability.js';
import {
  runTaskA,
  PERSONAS,
  primitiveGlossary,
} from './fonoran-llm-intuition.js';
import { readDoc } from './fonoran-store.js';
import { loadInterpretationRules } from './fonoran-interpretation.js';
import {
  buildAgentiveMultisetIndex,
  checkLexiconHygiene,
} from './fonoran-lexicon-hygiene.js';

export const GATE_THRESHOLDS = {
  phoneticScore: PHONETIC_SCORE_PASS,
  understandability: 0.65,
  llmRecovery: 0.55,
};

const CORE_EXPERIENCE = new Set(['survival_body', 'space_motion', 'social', 'emotion']);
const CORE_LANGUAGE = new Set(['communicative_core', 'extended_core']);

/**
 * Resolve flat root spellings for a composition.
 */
export function resolveFlatSpellings(composition, rootById, resolver) {
  const flatIds = resolver.flatRoots(composition);
  if (!flatIds) return null;
  const spellings = flatIds.map(id => rootById[id]).filter(Boolean);
  if (spellings.length !== flatIds.length) return null;
  return { flatIds, spellings, surface: spellings.join('') };
}

/**
 * Anti-abstract: at least one communicative_core / survival_body component.
 */
export function passesAntiAbstractHeuristic(composition, metaFor) {
  for (const id of composition ?? []) {
    const meta = metaFor(id);
    if (CORE_LANGUAGE.has(meta?.language_tier)) return true;
    if (CORE_EXPERIENCE.has(meta?.experience_tier)) return true;
  }
  return false;
}

/**
 * Hard validation: boundary, parseability, length.
 */
export function hardGateComposition(composition, ctx) {
  const reasons = [];
  const conceptId = ctx.conceptId ?? '_gate_probe_';
  const buildCtx = ctx.buildCtx ?? createBuildValidationContext({
    rootById: ctx.rootById,
    rootSpellings: ctx.rootSpellings ?? Object.values(ctx.rootById),
    primitiveIds: ctx.primitiveIds,
  });

  const v = validateComposition(conceptId, composition, buildCtx);
  if (!v.valid) {
    reasons.push(v.reason ?? 'invalid composition');
    return { pass: false, reasons, resolved: null };
  }

  const flatIds = ctx.resolver?.flatRoots(composition) ?? composition;

  return {
    pass: true,
    reasons: [],
    resolved: {
      flatIds,
      spellings: v.rootSeq,
      surface: v.spelling,
      boundary: checkCompoundBoundary(v.rootSeq),
      flatCount: v.flat_count,
    },
  };
}

/**
 * Score a composition for auto-accept ranking.
 */
export function scoreComposition(composition, ctx) {
  const metaFor = ctx.metaFor ?? experienceMetaFor;
  const hard = hardGateComposition(composition, ctx);
  if (!hard.pass) {
    return { pass: false, hard, phonetic: null, understandability: null, combined: 0 };
  }

  const { flatIds, spellings, flatCount } = hard.resolved;
  const conf = confusabilityPenalty(spellings, {
    surface: hard.resolved.surface,
    existingSurfaces: ctx.existingSurfaces ?? [],
  });
  const phonetic = computePhoneticScore(spellings, {
    analytics: ctx.analytics,
    boundaryPenalty: conf.penalty,
  });
  const collisionKey = composition.join('+');
  const collisionCount = ctx.collisionCounts?.get(collisionKey) ?? 1;
  const u = scoreUnderstandability(flatIds, {
    metaFor,
    collisionCount,
    flatCount,
  });

  const antiAbstract = passesAntiAbstractHeuristic(composition, metaFor);
  const combined = phonetic.score * u.score * (antiAbstract ? 1 : 0.5);

  return {
    pass: false,
    hard,
    phonetic,
    confusability: conf,
    understandability: u,
    antiAbstract,
    combined,
    composition,
    surface: hard.resolved.surface,
    spellings,
  };
}

/**
 * Pick best ranked composition from analysis valid_compositions.
 */
export function pickBestComposition(analysis, ctx) {
  const conceptId = analysis.concept_id ?? analysis.word?.toLowerCase().replace(/\s+/g, '_') ?? 'gap';
  const comps = analysis.valid_compositions ?? [];
  if (!comps.length) return null;

  const buildCtx = ctx.buildCtx ?? createBuildValidationContext({
    rootById: ctx.rootById,
    rootSpellings: ctx.rootSpellings ?? Object.values(ctx.rootById),
    primitiveIds: ctx.primitiveIds,
  });
  const gateCtx = { ...ctx, buildCtx, conceptId };

  const ranked = rankCandidates(conceptId, comps, {
    metaFor: ctx.metaFor ?? experienceMetaFor,
    flatCountFor: comp => ctx.resolver.flatCount(comp),
    collisionCounts: ctx.collisionCounts ?? new Map(),
  });

  let best = null;
  for (const row of ranked) {
    const scored = scoreComposition(row.composition, gateCtx);
    if (!scored.hard.pass) continue;
    if (!best || scored.combined > best.combined) {
      best = { ...scored, rank: row };
    }
  }
  return best;
}

/**
 * Run LLM Task A cold recovery gate.
 */
export async function runLlmRecoveryGate({ conceptId, targetGloss, spelling, primitiveIds, glossById, skipLlm }) {
  if (skipLlm) return { pass: true, skipped: true, recovery: 1, confidence: 1 };

  const rootGlosses = [...(glossById?.entries() ?? [])].map(([id, gloss]) => ({ id, gloss }));
  const persona = PERSONAS.campfire_stranger;
  const result = await runTaskA({
    persona,
    conceptId,
    targetGloss: targetGloss ?? conceptId.replace(/_/g, ' '),
    spelling,
    primitiveGlosses: primitiveGlossary(rootGlosses, primitiveIds),
    temperature: 0.2,
  });

  if (!result.ok) {
    return { pass: false, error: result.error, recovery: 0, confidence: 0 };
  }

  const recovery = result.recovered ? 1 : 0;
  const confidence = result.confidence ?? 0;
  const pass = result.recovered || confidence >= GATE_THRESHOLDS.llmRecovery;

  return {
    pass,
    recovery,
    confidence,
    inferred: result.inferred_meaning,
    recovered: result.recovered,
  };
}

/**
 * Full gate evaluation for a gap analysis result (compound or alias).
 * @param {object} analysis — from analyzeGap
 * @param {object} ctx
 * @param {boolean} [ctx.skipLlm]
 */
export async function evaluateProposalGate(analysis, ctx) {
  const reasons = [];
  const scores = {};

  if (analysis.classification === 'alias') {
    if (!analysis.alias_proposal?.existing_concept_id) {
      return { pass: false, reasons: ['alias missing target concept'], scores, deferred: false };
    }
    return {
      pass: true,
      reasons: [],
      scores: { classification: 'alias' },
      chosenComposition: null,
      aliasTarget: analysis.alias_proposal.existing_concept_id,
    };
  }

  if (analysis.classification === 'primitive') {
    return {
      pass: false,
      reasons: ['primitive proposals deferred in refine loop'],
      scores,
      deferred: true,
      deferredReason: 'primitive',
    };
  }

  if (analysis.classification !== 'compound') {
    return { pass: false, reasons: ['unknown classification'], scores, deferred: false };
  }

  const conceptId = analysis.concept_id ?? analysis.word?.toLowerCase().replace(/\s+/g, '_');
  const hygiene = await checkLexiconHygiene(analysis, ctx);
  if (!hygiene.pass) {
    return {
      pass: false,
      reasons: hygiene.reasons,
      scores,
      deferred: false,
      suggestedLemma: hygiene.suggestedLemma,
    };
  }

  const best = pickBestComposition(analysis, ctx);
  if (!best) {
    return { pass: false, reasons: ['no valid composition passes hard gates'], scores, deferred: false };
  }

  scores.phonetic = best.phonetic;
  scores.understandability = best.understandability;
  scores.combined = best.combined;
  scores.antiAbstract = best.antiAbstract;

  if (best.phonetic.score < GATE_THRESHOLDS.phoneticScore) {
    reasons.push(`phonetic score ${best.phonetic.score.toFixed(2)} < ${GATE_THRESHOLDS.phoneticScore}`);
  }
  if (best.understandability.score < GATE_THRESHOLDS.understandability) {
    reasons.push(`understandability ${best.understandability.score.toFixed(2)} < ${GATE_THRESHOLDS.understandability}`);
  }
  if (!best.antiAbstract) {
    reasons.push('all components abstract/thinking tier');
  }

  const gloss = analysis.gloss ?? analysis.word ?? conceptId;

  const llm = await runLlmRecoveryGate({
    conceptId,
    targetGloss: gloss,
    spelling: best.surface,
    primitiveIds: ctx.primitiveIds,
    glossById: ctx.glossById,
    skipLlm: ctx.skipLlm,
  });
  scores.llm = llm;

  if (!llm.pass && !llm.skipped) {
    reasons.push(`LLM cold recovery failed (confidence ${llm.confidence?.toFixed?.(2) ?? 0})`);
  }

  const pass = reasons.length === 0;

  return {
    pass,
    reasons,
    scores,
    chosenComposition: best.composition,
    surface: best.surface,
    deferred: false,
  };
}

/**
 * Build gate context from editorial docs.
 */
export async function loadGateContext(analytics = null) {
  const [inventory, approved, compoundsDoc] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
    readDoc('compounds'),
  ]);

  const rootById = Object.fromEntries((approved?.roots ?? []).map(r => [r.id, r.spelling]));
  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const compoundDefs = compoundsDoc?.compounds ?? [];
  const resolver = buildCompositionResolver(primitiveIds, compoundDefs);
  const rootSpellings = [...new Set(Object.values(rootById))];
  const segInventory = rootSpellings.map(root => ({ root, id: root }));
  const existingSurfaces = (compoundDefs ?? [])
    .map(c => {
      const comp = c.preferred?.composition ?? c.composition ?? [];
      const flat = resolver.flatRoots(comp);
      if (!flat) return null;
      const spellings = flat.map(id => rootById[id]).filter(Boolean);
      return spellings.length ? spellings.join('') : null;
    })
    .filter(Boolean);

  const glossById = new Map();
  for (const p of inventory?.primitives ?? []) {
    glossById.set(p.id, p.description ?? p.plain_description ?? p.id);
  }
  for (const c of compoundDefs) {
    glossById.set(c.concept, c.preferred?.gloss ?? c.gloss ?? c.concept);
  }

  const metaFor = id => {
    const prim = (inventory?.primitives ?? []).find(p => p.id === id);
    if (prim?.language_tier) {
      return { language_tier: prim.language_tier, experience_tier: prim.experience_tier };
    }
    const em = experienceMetaFor(id);
    return { language_tier: em.language_tier, experience_tier: em.experience_tier };
  };

  const { index: agentiveMultisetIndex } = buildAgentiveMultisetIndex(primitiveIds, compoundDefs);
  const compoundConceptIds = new Set(compoundDefs.map(c => c.concept).filter(Boolean));
  const interpretRules = await loadInterpretationRules().catch(() => null);

  return {
    rootById,
    rootSpellings,
    primitiveIds,
    compoundDefs,
    compoundConceptIds,
    agentiveMultisetIndex,
    interpretRules,
    resolver,
    existingSurfaces,
    buildCtx: createBuildValidationContext({ rootById, rootSpellings, primitiveIds }),
    glossById,
    metaFor,
    analytics,
  };
}
