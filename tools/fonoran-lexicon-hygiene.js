/**
 * Lexicon hygiene — lemma invariant concept ids and agentive duplicate detection.
 * Shared by proposal gate and lexicon audit script.
 */

import { IRREGULAR } from './fonoran-english-resolve.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import {
  irregularPastLemma,
  lemmaCandidates,
  loadInterpretationRules,
} from './fonoran-interpretation.js';

/** Emotion/state concepts kept separate despite -ed surfaces (not pure tense inflection). */
export const EMOTION_STATE_WHITELIST = new Set([
  'worried',
  'relieved',
  'tired',
  'confused',
  'bored',
  'frightened',
  'injured',
  'unsure',
]);

/**
 * Best-effort English lemma for a surface form.
 */
export function inferLemma(word, rules = null) {
  const w = String(word ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!w) return w;

  if (IRREGULAR[w]) return IRREGULAR[w];

  const irregular = irregularPastLemma(w, rules ?? undefined);
  if (irregular) return irregular;

  const candidates = lemmaCandidates(w, rules ?? undefined).filter(c => c !== w && c.length >= 2);
  if (!candidates.length) return w;

  const viable = candidates.filter(c => c.length >= 3).sort((a, b) => b.length - a.length);
  return viable[0] ?? candidates[0] ?? w;
}

/**
 * True when surface looks like an English inflection, not the invariant lemma.
 */
export function isInflectedSurface(word, rules = null) {
  const w = String(word ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!w || EMOTION_STATE_WHITELIST.has(w)) return false;

  if (IRREGULAR[w] && IRREGULAR[w] !== w) {
    if (/ed$|ing$|ies$|ied$|es$|s$/.test(w) || ['went', 'gone', 'knew', 'said', 'men', 'women', 'children', 'people'].includes(w)) {
      return true;
    }
  }
  if (irregularPastLemma(w, rules ?? undefined)) return true;

  const lemma = inferLemma(w, rules);
  if (lemma === w) return false;

  if (/^(.*)(ied|ed)$/.test(w)) {
    const base = w.endsWith('ied') ? `${w.slice(0, -3)}y` : w.slice(0, -2);
    const baseDbl = base.length >= 2 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
    if (lemma === base || lemma === baseDbl) return true;
  }

  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    const baseDbl = base.length >= 2 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
    if (lemma === base || lemma === baseDbl) return true;
  }

  if (w.endsWith('es') && w.length > 4 && lemma === w.slice(0, -2)) return true;
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3 && lemma === w.slice(0, -1)) return true;

  return false;
}

export function rootMultisetKey(flatIds) {
  return [...(flatIds ?? [])].sort().join('+');
}

/**
 * Build multiset index from compound definitions: sorted flat roots → concept id.
 */
export function buildAgentiveMultisetIndex(primitiveIds, compoundDefs) {
  const resolver = buildCompositionResolver(primitiveIds, compoundDefs ?? []);
  const index = new Map();

  for (const def of compoundDefs ?? []) {
    const concept = def.concept;
    if (!concept || EMOTION_STATE_WHITELIST.has(concept)) continue;
    const comp = def.preferred?.composition ?? def.composition;
    if (!Array.isArray(comp) || !comp.length) continue;
    const flat = resolver.flatRoots(comp);
    if (!flat?.includes('person') || flat.length < 2) continue;
    const key = rootMultisetKey(flat);
    if (!index.has(key)) index.set(key, concept);
  }

  return { index, resolver };
}

/**
 * If composition duplicates an existing agentive concept (same root multiset), return canonical id.
 */
export function findAgentiveDuplicate(composition, ctx) {
  const conceptId = ctx.conceptId ?? '';
  if (EMOTION_STATE_WHITELIST.has(conceptId)) return null;

  const flat = ctx.resolver?.flatRoots(composition);
  if (!flat?.includes('person') || flat.length < 2) return null;

  const key = rootMultisetKey(flat);
  const existing = ctx.agentiveMultisetIndex?.get(key);
  if (!existing || existing === conceptId) return null;
  return existing;
}

/**
 * Gate check for compound proposals: inflection leak and agentive duplication.
 */
export async function checkLexiconHygiene(analysis, ctx) {
  const word = analysis.word ?? analysis.concept_id ?? '';
  const conceptId = (analysis.concept_id ?? word).toLowerCase().replace(/\s+/g, '_');
  const rules = ctx.interpretRules ?? await loadInterpretationRules().catch(() => null);
  const compoundIds = ctx.compoundConceptIds ?? new Set();
  const reasons = [];

  if (analysis.classification === 'compound') {
    const lemma = inferReliableLemma(conceptId, rules, {
      compoundIds,
      primitiveIds: ctx.primitiveIds ? new Set(ctx.primitiveIds) : new Set(),
    });
    if (lemma && lemma !== conceptId) {
      if (compoundIds.has(lemma)) {
        reasons.push(`inflected surface "${conceptId}" should alias existing lemma "${lemma}"`);
      } else {
        reasons.push(`concept id "${conceptId}" looks inflected; use lemma "${lemma}" as concept id`);
      }
    }

    if (lemma && compoundIds.has(lemma) && lemma !== conceptId) {
      reasons.push(`lemma concept "${lemma}" already exists; use alias not new compound`);
    }

    for (const comp of analysis.valid_compositions ?? []) {
      const dup = findAgentiveDuplicate(comp, { ...ctx, conceptId });
      if (dup) {
        reasons.push(`agentive duplicate of "${dup}" (same roots as person+role compound)`);
        break;
      }
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
    suggestedLemma: inferReliableLemma(conceptId, rules, {
      compoundIds,
      primitiveIds: ctx.primitiveIds ? new Set(ctx.primitiveIds) : new Set(),
    }),
  };
}

/**
 * Audit all compounds for inflected concept ids.
 */
export async function auditInflectedConceptIds(compoundDefs, rules = null) {
  const r = rules ?? await loadInterpretationRules().catch(() => null);
  const hits = [];

  for (const def of compoundDefs ?? []) {
    const concept = def.concept;
    if (!concept || EMOTION_STATE_WHITELIST.has(concept)) continue;
    if (!isInflectedSurface(concept, r)) continue;
    hits.push({
      concept,
      suggested_lemma: inferLemma(concept, r),
      gloss: def.preferred?.gloss ?? def.gloss,
    });
  }

  return hits;
}

/**
 * Audit agentive compounds sharing the same root multiset.
 */
export function auditAgentiveDuplicates(primitiveIds, compoundDefs) {
  const { index, resolver } = buildAgentiveMultisetIndex(primitiveIds, compoundDefs);
  const byKey = new Map();

  for (const def of compoundDefs ?? []) {
    const concept = def.concept;
    if (!concept || EMOTION_STATE_WHITELIST.has(concept)) continue;
    const comp = def.preferred?.composition ?? def.composition;
    if (!Array.isArray(comp) || !comp.length) continue;
    const flat = resolver.flatRoots(comp);
    if (!flat?.includes('person') || flat.length < 2) continue;
    const key = rootMultisetKey(flat);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ concept, composition: comp, flat });
  }

  const groups = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    groups.push({ root_multiset: key, members });
  }

  return groups;
}

/** Surface forms that are English lemmas, not inflections — never rename/collapse. */
const LEMMA_NOUN_BLOCKLIST = new Set([
  'thought',
  'focus',
  'curious',
  'jealous',
  'unconscious',
  'always',
  'beginning',
  'bellows',
  'cut',
]);

const EXCLUDE_INFLECTION_SUFFIX = /(?:ous|ious|less|ness|sis)$/;

/**
 * Conservative inflection detection for batch apply.
 * Prefers collapse when lemma already exists in lexicon; rename only for clear verb/plural patterns.
 */
export function inferReliableLemma(concept, rules = null, lexicon = {}) {
  const w = String(concept ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!w || EMOTION_STATE_WHITELIST.has(w) || LEMMA_NOUN_BLOCKLIST.has(w)) return null;

  const compoundIds = lexicon.compoundIds ?? new Set();
  const primitiveIds = lexicon.primitiveIds ?? new Set();
  const allIds = new Set([...compoundIds, ...primitiveIds]);

  if (IRREGULAR[w] && IRREGULAR[w] !== w) {
    if (allIds.has(IRREGULAR[w])) return IRREGULAR[w];
    if (/ed$|ing$|ies$|ied$|es$|s$/.test(w) || ['people', 'men', 'women', 'children'].includes(w)) {
      return IRREGULAR[w];
    }
  }

  if (EXCLUDE_INFLECTION_SUFFIX.test(w)) return null;

  if (w.endsWith('ies') && w.length > 4) {
    const y = `${w.slice(0, -3)}y`;
    if (allIds.has(y)) return y;
  }

  if (w.endsWith('es') && w.length > 5) {
    const base = w.slice(0, -2);
    if (allIds.has(base)) return base;
  }

  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4) {
    const base = w.slice(0, -1);
    if (allIds.has(base)) return base;
  }

  if (w.endsWith('ied') && w.length > 4) {
    return `${w.slice(0, -3)}y`;
  }

  if (w.endsWith('ed') && w.length > 4) {
    let base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) base = base.slice(0, -1);
    if (base.length >= 3 && !EXCLUDE_INFLECTION_SUFFIX.test(w)) return base;
  }

  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 5 && !w.endsWith('us')) {
    const base = w.slice(0, -1);
    if (base.length >= 4 && !allIds.has(base)) return base;
  }

  if (w.endsWith('drops') && w.length > 6) {
    return w.slice(0, -1);
  }

  return null;
}

function pickAgentiveCanonical(members, compoundByConcept) {
  const scored = members.map(m => {
    const def = compoundByConcept.get(m.concept);
    const u = def?.understandability ?? def?.preferred?.understandability ?? 0;
    const source = def?.preferred_source ?? '';
    const sourceRank = source === 'heuristic' || source === 'llm_consensus' ? 2 : source === 'proposal' ? 1 : 0;
    return { ...m, score: u + sourceRank * 0.01, len: m.concept.length };
  });
  scored.sort((a, b) => b.score - a.score || a.len - b.len || a.concept.localeCompare(b.concept));
  return scored[0].concept;
}

/**
 * Build an apply plan: inflection renames/merges + agentive collapses + alias wiring.
 */
export async function planLexiconHygiene(compoundDefs, locData = {}, primitiveIds = []) {
  const rules = await loadInterpretationRules().catch(() => null);
  const compounds = [...(compoundDefs ?? [])];
  const compoundByConcept = new Map(compounds.map(c => [c.concept, c]));
  const compoundIds = new Set(compounds.map(c => c.concept));
  const lexicon = { compoundIds, primitiveIds: new Set(primitiveIds) };
  const actions = [];

  for (const def of compounds) {
    const concept = def.concept;
    if (!concept) continue;
    const lemma = inferReliableLemma(concept, rules, lexicon);
    if (!lemma || lemma === concept) continue;

    const composition = def.preferred?.composition ?? def.composition ?? [];
    if (composition.includes(lemma)) {
      continue;
    }

    if (compoundIds.has(lemma) && lemma !== concept) {
      actions.push({
        kind: 'collapse_to_lemma',
        from: concept,
        to: lemma,
        reason: `inflected concept "${concept}" → alias on existing lemma "${lemma}"`,
      });
    } else {
      actions.push({
        kind: 'rename_to_lemma',
        from: concept,
        to: lemma,
        reason: `rename inflected concept id "${concept}" → lemma "${lemma}"`,
      });
    }
  }

  const agentiveGroups = auditAgentiveDuplicates(primitiveIds, compounds);
  for (const group of agentiveGroups) {
    const canonical = pickAgentiveCanonical(group.members, compoundByConcept);
    for (const m of group.members) {
      if (m.concept === canonical) continue;
      actions.push({
        kind: 'collapse_agentive',
        from: m.concept,
        to: canonical,
        root_multiset: group.root_multiset,
        reason: `agentive duplicate [${group.root_multiset}] → canonical "${canonical}"`,
      });
    }
  }

  for (const a of actions) {
    if (!['rename_to_lemma', 'collapse_to_lemma', 'collapse_agentive'].includes(a.kind)) continue;
    actions.push({
      kind: 'add_alias',
      target: a.to,
      alias: a.from.replace(/_/g, ' '),
      reason: `English surface "${a.from}" → alias on "${a.to}"`,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const a of actions) {
    if (a.kind === 'add_alias') {
      const key = `${a.target}:${a.alias}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    deduped.push(a);
  }

  return { actions: deduped, rules };
}

function replaceConceptInComposition(comp, from, to) {
  if (!Array.isArray(comp)) return comp;
  return comp.map(id => (id === from ? to : id));
}

/**
 * Apply hygiene plan to compounds doc + English localization.
 * @returns {{ compoundsDoc, locale, summary }}
 */
export function applyLexiconHygienePlan(plan, compoundsDoc, localeDoc) {
  const locale = localeDoc ?? { version: '1.0-localization', locale: 'en', entries: {} };
  if (!locale.entries) locale.entries = {};

  const remove = new Set();
  const collapseTo = new Map();
  const renames = new Map();

  for (const a of plan.actions) {
    if (a.kind === 'rename_to_lemma') renames.set(a.from, a.to);
    if (a.kind === 'collapse_to_lemma' || a.kind === 'collapse_agentive') {
      remove.add(a.from);
      collapseTo.set(a.from, a.to);
    }
  }

  const remapRefs = comp => {
    if (!Array.isArray(comp)) return comp;
    return comp.map(id => collapseTo.get(id) ?? id);
  };

  let compounds = (compoundsDoc?.compounds ?? []).map(def => {
    if (remove.has(def.concept)) return null;

    let concept = def.concept;
    if (renames.has(concept)) concept = renames.get(concept);

    const preferred = def.preferred
      ? {
        ...def.preferred,
        composition: remapRefs(replaceConceptInComposition(def.preferred.composition, def.concept, concept)),
        gloss: def.preferred.gloss === def.concept && renames.has(def.concept) ? concept : def.preferred.gloss,
      }
      : def.preferred;

    return {
      ...def,
      concept,
      preferred,
      alternates: (def.alternates ?? []).map(alt => ({
        ...alt,
        composition: remapRefs(alt.composition),
      })),
    };
  }).filter(Boolean);

  for (const a of plan.actions) {
    if (a.kind !== 'add_alias') continue;
    if (!locale.entries[a.target]) {
      locale.entries[a.target] = { label: a.target.replace(/_/g, ' ') };
    }
    const aliases = new Set((locale.entries[a.target].aliases ?? []).map(x => String(x).toLowerCase()));
    aliases.add(String(a.alias).toLowerCase());
    locale.entries[a.target].aliases = [...aliases];
  }

  const summary = {
    renamed: renames.size,
    removed: remove.size,
    aliases_added: plan.actions.filter(a => a.kind === 'add_alias').length,
  };

  return {
    compoundsDoc: {
      ...compoundsDoc,
      compounds,
      compound_count: compounds.length,
    },
    locale,
    summary,
  };
}
