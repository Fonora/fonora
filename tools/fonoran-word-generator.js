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
import {
  buildResolveContext,
  resolveConceptId,
  expandTokenToConcept,
  tokenizeEnglish,
} from './fonoran-english-resolve.js';
import { segmentCompound, pronounceabilityScore, checkCompoundBoundary } from './fonoran-gen3-readability.js';

const SKIP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'by', 'from',
  'into', 'as', 'is', 'are', 'be', 'who', 'that', 'which', 'this', 'these', 'those', 'one',
]);

/** Build a component spec — prefer an approved compound word when available. */
export function componentSpecForConcept(id, ctx, { preferWord = true } = {}) {
  if (preferWord && ctx.compoundByConceptId.has(id)) {
    const w = ctx.compoundByConceptId.get(id);
    return {
      type: 'word',
      id,
      compoundId: w.id,
      root: w.spelling,
      gloss: w.gloss,
    };
  }
  const r = ctx.rootById.get(id);
  if (!r) return null;
  return { type: 'root', id, root: r.root, gloss: r.gloss };
}

function normalizeInputComponent(raw, ctx) {
  if (typeof raw === 'string') {
    const id = raw.trim().toLowerCase();
    return componentSpecForConcept(id, ctx, { preferWord: true });
  }
  if (raw?.type === 'word' && raw.ref) {
    const w = [...ctx.compoundByConceptId.values()].find(x => x.id === raw.ref)
      ?? (raw.id && ctx.compoundByConceptId.get(raw.id));
    if (w) {
      const id = raw.id ?? [...ctx.compoundByConceptId.entries()].find(([, v]) => v.id === raw.ref)?.[0];
      return { type: 'word', id: id ?? raw.ref, compoundId: w.id, root: w.spelling, gloss: w.gloss };
    }
  }
  const id = String(raw?.id ?? raw?.ref ?? '').trim().toLowerCase();
  if (!id) return null;
  const preferWord = raw?.type === 'word' || raw?.preferWord !== false;
  return componentSpecForConcept(id, ctx, { preferWord });
}

/**
 * Suggest an ordered component list from the English phrase.
 */
export async function suggestComponents(text, ctx) {
  const tokens = tokenizeEnglish(text).filter(t => !SKIP.has(t));
  const components = [];
  const seen = new Set();
  const tokenMap = [];
  let sawAgentive = false;

  const push = (id, fromToken, via = null) => {
    if (!ctx.rootById.has(id) || seen.has(id)) return false;
    seen.add(id);
    const spec = componentSpecForConcept(id, ctx, { preferWord: true });
    if (!spec) return false;
    components.push({ ...spec, from_token: fromToken, via });
    return true;
  };

  for (const token of tokens) {
    const res = resolveConceptId(token, ctx);
    if (res) {
      push(res.concept_id, token, res.via);
      if (res.agentive) sawAgentive = true;
      tokenMap.push({ token, concept_id: res.concept_id, resolved: true });
    } else {
      tokenMap.push({ token, concept_id: null, resolved: false });
    }
  }

  for (const entry of tokenMap) {
    if (entry.resolved) continue;
    const expanded = await expandTokenToConcept(entry.token, ctx);
    if (expanded && push(expanded.concept_id, entry.token, expanded.via)) {
      entry.resolved = true;
      entry.concept_id = expanded.concept_id;
    }
  }

  if (sawAgentive && !seen.has('person') && !seen.has('agent')) {
    if (ctx.rootById.has('person')) push('person', '(agent)');
    else if (ctx.rootById.has('agent')) push('agent', '(agent)');
  }

  return { tokens: tokenMap, components };
}

function scoreOptionFromSpecs(specs, ctx) {
  if (specs.length < 1) return null;
  const roots = specs.map(s => s.root).filter(Boolean);
  if (roots.length !== specs.length) return null;

  const boundary = checkCompoundBoundary(roots);
  if (!boundary.valid) {
    if (ctx.debug) {
      for (const v of boundary.violations) console.warn('[word-gen]', v.reason);
    }
    return null;
  }

  const spelling = roots.join('');
  const segs = segmentCompound(spelling, ctx.parseInventory);
  const unique = segs.length === 1;
  const pron = pronounceabilityScore(spelling).score;
  const wordCount = specs.filter(s => s.type === 'word').length;

  const score = (unique ? 1000 : 0)
    - specs.length * 60
    - spelling.length * 4
    + wordCount * 40
    + pron * 0.5;

  return {
    spelling,
    roots,
    components: specs.map(s => ({
      type: s.type,
      id: s.id,
      compoundId: s.compoundId ?? null,
      root: s.root,
      gloss: s.gloss,
    })),
    api_components: specs.map(s =>
      s.type === 'word'
        ? { type: 'word', ref: s.compoundId }
        : { type: 'root', ref: s.root },
    ),
    breakdown: specs.map(s => (s.type === 'word' ? `${s.id}(word)` : s.id)).join(' + '),
    roots_breakdown: roots.join(' + '),
    root_count: specs.length,
    length: spelling.length,
    pronounceability: pron,
    unique,
    segmentations: segs.map(s => s.join('+')),
    score: Math.round(score),
  };
}

/**
 * Compose ranked word options from an ordered component list.
 */
export function composeOptions(componentIds, ctx, { limit = 5, specs = null } = {}) {
  const variantSpecs = [];

  if (specs?.length) {
    variantSpecs.push(specs);
  } else {
    const ids = componentIds.filter(id => ctx.rootById.has(id));
    if (ids.length < 2) {
      const single = ids.length === 1 ? scoreOptionFromSpecs([componentSpecForConcept(ids[0], ctx, { preferWord: false })].filter(Boolean), ctx) : null;
      return single ? [single] : [];
    }
    variantSpecs.push(ids.map(id => componentSpecForConcept(id, ctx, { preferWord: true })).filter(Boolean));
    variantSpecs.push(ids.map(id => componentSpecForConcept(id, ctx, { preferWord: false })).filter(Boolean));
  }

  const candidates = new Map();
  const add = list => {
    if (list.length < 2) return;
    const key = list.map(s => `${s.type}:${s.id}`).join('+');
    if (candidates.has(key)) return;
    const opt = scoreOptionFromSpecs(list, ctx);
    if (opt) candidates.set(key, opt);
  };

  for (const base of variantSpecs) {
    add(base);
    const ids = base.map(s => s.id);
    for (let n = ids.length - 1; n >= 2; n--) {
      add(base.slice(0, n));
      add(base.slice(ids.length - n));
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function generateWords(text, { components = null, lab = null, limit = 5 } = {}) {
  const ctx = await buildResolveContext(lab);
  let chosen;
  let tokens = [];
  let unresolved = [];

  if (Array.isArray(components) && components.length) {
    chosen = components
      .map(c => normalizeInputComponent(c, ctx))
      .filter(Boolean);
  } else {
    const sugg = await suggestComponents(text, ctx);
    chosen = sugg.components;
    tokens = sugg.tokens;
    unresolved = sugg.tokens.filter(t => !t.resolved).map(t => t.token);
  }

  const options = composeOptions(
    chosen.map(c => c.id),
    ctx,
    { limit, specs: chosen.length ? chosen : null },
  );

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
  console.log(`Suggested components: ${r.components.map(c => `${c.id}(${c.type === 'word' ? c.root : c.root})`).join(' + ') || '(none)'}`);
  if (r.unresolved.length) console.log(`Unresolved tokens: ${r.unresolved.join(', ')}`);
  console.log('Options (ranked):');
  for (const o of r.options) {
    console.log(`  ${o.spelling.padEnd(14)} ${o.breakdown}  [parts ${o.root_count}, len ${o.length}, pron ${o.pronounceability}, ${o.unique ? 'unique' : `${o.segmentations.length}x ambiguous`}]`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { buildResolveContext as buildContext };
