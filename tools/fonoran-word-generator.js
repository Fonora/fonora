#!/usr/bin/env node
/**
 * Fonoran Word Generator — invent NEW words from existing roots + grammar.
 *
 * Unlike the Translator (which compiles an English *sentence* into grammar slots
 * using words that already exist), the Word Generator takes a *concept* and
 * composes candidate compound words out of the current root inventory, ranked by
 * how cleanly they break down (semantic economy + unique segmentation).
 *
 * Assisted flow: suggest component primitives from the English phrase, let the
 * caller tweak them, then compose + rank options. The caller saves a chosen
 * option as a needs-review compound via the normal lab API.
 *
 * CLI: node tools/fonoran-word-generator.js "time traveler"
 */

import { fileURLToPath } from 'node:url';
import { loadConceptInventory, buildConceptAliasIndex } from './fonoran-concepts.js';
import { expandWord } from './fonoran-semantic-lookup.js';
import { getLab } from './fonoran-sound-bucket.js';
import { loadInterpretationRules, interpretToConcept } from './fonoran-interpretation.js';
import { segmentCompound, pronounceabilityScore, checkCompoundBoundary } from './fonoran-gen3-readability.js';

const SKIP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'by', 'from',
  'into', 'as', 'is', 'are', 'be', 'who', 'that', 'which', 'this', 'these', 'those', 'one',
]);

function tokenize(text) {
  return String(text ?? '')
    .trim()
    .match(/[A-Za-z']+/g)
    ?.map(t => t.toLowerCase().replace(/^'+|'+$/g, ''))
    .filter(Boolean) ?? [];
}

function lemmatize(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Agentive forms: traveler → travel (+ person), creator → create (+ person). */
function agentiveBase(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.endsWith('er') && w.length > 4) return [w.slice(0, -2), `${w.slice(0, -2)}e`];
  if (w.endsWith('or') && w.length > 4) return [w.slice(0, -2), `${w.slice(0, -2)}e`];
  if (w.endsWith('ist') && w.length > 5) return [w.slice(0, -3)];
  return null;
}

async function buildContext(lab) {
  const inventory = await loadConceptInventory();
  const liveLab = lab ?? await getLab();
  const rules = await loadInterpretationRules().catch(() => null);
  const aliasIndex = buildConceptAliasIndex(inventory.concepts, liveLab);

  const rootById = new Map();
  for (const c of inventory.concepts) {
    if (c.spelling) rootById.set(c.id, { root: c.spelling, gloss: c.concept, state: c.status });
  }
  for (const s of liveLab.sounds ?? []) {
    if (s.state === 'rejected' || !s.concept_id || !s.spelling) continue;
    rootById.set(s.concept_id, { root: s.spelling, gloss: s.gloss ?? s.meaning, state: s.state });
  }

  const rootInventory = (liveLab.sounds ?? [])
    .filter(s => s.state !== 'rejected' && s.spelling)
    .map(s => ({ root: s.spelling, id: s.concept_id ?? s.spelling }));

  return { inventory, aliasIndex, rootById, rootInventory, rules };
}

function resolveToken(token, ctx) {
  const tries = [token, lemmatize(token)];
  for (const key of tries) {
    const hit = ctx.aliasIndex.get(key);
    if (hit?.concept_id) return { concept_id: hit.concept_id, agentive: false };
  }
  // Interpretation rules (e.g. spatial / class mappings).
  const interp = interpretToConcept(token, 'concept', ctx.rules)
    ?? interpretToConcept(lemmatize(token), 'concept', ctx.rules);
  if (interp?.concept_id && ctx.rootById.has(interp.concept_id)) {
    return { concept_id: interp.concept_id, agentive: false };
  }
  // Agentive: traveler → move + person.
  const bases = agentiveBase(token);
  if (bases) {
    for (const base of bases) {
      const hit = ctx.aliasIndex.get(base) ?? ctx.aliasIndex.get(lemmatize(base));
      if (hit?.concept_id) return { concept_id: hit.concept_id, agentive: true };
    }
  }
  return null;
}

/**
 * Suggest an ordered component list from the English phrase.
 * Async: runs a fast sync pass first, then falls back to WordNet for any
 * tokens that still don't resolve.
 */
export async function suggestComponents(text, ctx) {
  const tokens = tokenize(text).filter(t => !SKIP.has(t));
  const components = [];
  const seen = new Set();
  const tokenMap = [];
  let sawAgentive = false;

  const push = (id, fromToken, via = null) => {
    if (!ctx.rootById.has(id) || seen.has(id)) return false;
    seen.add(id);
    components.push({ id, root: ctx.rootById.get(id).root, gloss: ctx.rootById.get(id).gloss, from_token: fromToken, via });
    return true;
  };

  // Pass 1: fast sync resolution (alias index + lemmatize + agentive).
  for (const token of tokens) {
    const res = resolveToken(token, ctx);
    if (res) {
      push(res.concept_id, token);
      if (res.agentive) sawAgentive = true;
      tokenMap.push({ token, concept_id: res.concept_id, resolved: true });
    } else {
      tokenMap.push({ token, concept_id: null, resolved: false });
    }
  }

  // Pass 2: WordNet fallback for still-unresolved tokens.
  for (const entry of tokenMap) {
    if (entry.resolved) continue;
    const { synonyms, hypernym_concepts } = await expandWord(entry.token);

    // 2a. Hypernym bridge first — more reliable for concrete nouns like "mountain",
    //     whose synonym sets span multiple unrelated word senses.
    if (hypernym_concepts.length) {
      for (const cid of hypernym_concepts) {
        if (push(cid, entry.token, `hypernym:${cid}`)) {
          entry.resolved = true;
          entry.concept_id = cid;
          break;
        }
      }
    }
    if (entry.resolved) continue;

    // 2b. Synonym expansion as fallback — catches abstract / action words.
    for (const syn of synonyms) {
      const key = syn.replace(/\s+/g, '_');
      const hit = ctx.aliasIndex.get(syn) ?? ctx.aliasIndex.get(key) ?? ctx.aliasIndex.get(lemmatize(syn));
      if (hit?.concept_id) {
        entry.resolved = true;
        entry.concept_id = hit.concept_id;
        push(hit.concept_id, entry.token, `synonym:${syn}`);
        break;
      }
    }
  }

  // Agentive phrases imply a "person/agent" head if one isn't already present.
  if (sawAgentive && !seen.has('person') && !seen.has('agent')) {
    if (ctx.rootById.has('person')) push('person', '(agent)');
    else if (ctx.rootById.has('agent')) push('agent', '(agent)');
  }

  return { tokens: tokenMap, components };
}

function scoreOption(ids, ctx) {
  const roots = ids.map(id => ctx.rootById.get(id)?.root).filter(Boolean);
  if (roots.length !== ids.length) return null;
  const boundary = checkCompoundBoundary(roots);
  if (!boundary.valid) {
    if (ctx.debug) {
      for (const v of boundary.violations) console.warn('[word-gen]', v.reason);
    }
    return null;
  }
  const spelling = roots.join('');
  const segs = segmentCompound(spelling, ctx.rootInventory);
  const unique = segs.length === 1;
  const pron = pronounceabilityScore(spelling).score;

  // Reward unique segmentation and economy; penalise length and root-count creep.
  const score = (unique ? 1000 : 0)
    - ids.length * 60
    - spelling.length * 4
    + pron * 0.5;

  return {
    spelling,
    roots,
    components: ids.map(id => ({ id, root: ctx.rootById.get(id).root, gloss: ctx.rootById.get(id).gloss })),
    breakdown: ids.join(' + '),
    roots_breakdown: roots.join(' + '),
    root_count: ids.length,
    length: spelling.length,
    pronounceability: pron,
    unique,
    segmentations: segs.map(s => s.join('+')),
    score: Math.round(score),
  };
}

/**
 * Compose ranked word options from an ordered component list.
 * Produces a precision ladder: the full set plus progressively simpler forms
 * (dropping from each end, since head may lead or trail), all ranked.
 */
export function composeOptions(componentIds, ctx, { limit = 5 } = {}) {
  const ids = componentIds.filter(id => ctx.rootById.has(id));
  if (ids.length < 2) {
    const single = ids.length === 1 ? scoreOption(ids, ctx) : null;
    return single ? [single] : [];
  }

  const candidates = new Map();
  const add = list => {
    if (list.length < 2) return;
    const key = list.join('+');
    if (candidates.has(key)) return;
    const opt = scoreOption(list, ctx);
    if (opt) candidates.set(key, opt);
  };

  add(ids);                              // full, precise
  for (let n = ids.length - 1; n >= 2; n--) {
    add(ids.slice(0, n));                // drop from end (head leads)
    add(ids.slice(ids.length - n));      // drop from front (head trails)
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function generateWords(text, { components = null, lab = null, limit = 5 } = {}) {
  const ctx = await buildContext(lab);
  let chosen;
  let tokens = [];
  let unresolved = [];

  if (Array.isArray(components) && components.length) {
    chosen = components
      .map(id => String(id).trim().toLowerCase())
      .filter(id => ctx.rootById.has(id))
      .map(id => ({ id, root: ctx.rootById.get(id).root, gloss: ctx.rootById.get(id).gloss, from_token: null }));
  } else {
    const sugg = await suggestComponents(text, ctx);
    chosen = sugg.components;
    tokens = sugg.tokens;
    unresolved = sugg.tokens.filter(t => !t.resolved).map(t => t.token);
  }

  const options = composeOptions(chosen.map(c => c.id), ctx, { limit });

  return {
    input: String(text ?? '').trim(),
    components: chosen,
    tokens,
    unresolved,
    options,
  };
}

async function main() {
  const text = process.argv.slice(2).join(' ') || 'time traveler';
  const r = await generateWords(text);
  console.log(`Input: "${r.input}"`);
  console.log(`Suggested components: ${r.components.map(c => `${c.id}(${c.root})`).join(' + ') || '(none)'}`);
  if (r.unresolved.length) console.log(`Unresolved tokens: ${r.unresolved.join(', ')}`);
  console.log('Options (ranked):');
  for (const o of r.options) {
    console.log(`  ${o.spelling.padEnd(14)} ${o.breakdown}  [roots ${o.root_count}, len ${o.length}, pron ${o.pronounceability}, ${o.unique ? 'unique' : `${o.segmentations.length}x ambiguous`}]`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
