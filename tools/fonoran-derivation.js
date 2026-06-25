/**
 * Recursive word derivation: typed components, trees, cycle detection, graph queries.
 */

import { parseSyllable } from './fonoran-pronunciation.js';

export const COMPONENT_TYPES = ['root', 'word'];
export const REUSABLE_WORD_STATES = ['approved', 'revised'];

/** @typedef {{ type: 'root'|'word', ref: string }} ComponentRef */

export function emptyDda() {
  return {
    status: 'pending',
    confidence: null,
    updated_at: null,
    D: null,
    M: null,
    A: null,
    coordinates: null,
    sources: [],
    error: null,
  };
}

/** Legacy parts[] → components[]. */
export function partsToComponents(parts) {
  return (parts ?? []).map(ref => ({ type: 'root', ref: String(ref).trim().toLowerCase() }));
}

/** Normalize API input: components preferred, parts as fallback. */
export function normalizeComponents(input) {
  if (input?.components?.length) {
    return input.components.map(c => {
      const type = c.type === 'word' ? 'word' : 'root';
      const ref = type === 'word'
        ? String(c.ref).trim()
        : String(c.ref).trim().toLowerCase();
      if (!ref) throw new Error('Each component needs a ref');
      return { type, ref };
    });
  }
  if (input?.parts?.length) return partsToComponents(input.parts);
  throw new Error('components or parts required');
}

export function componentsToParts(components) {
  return resolvePartSpellings(components, null, { flatOnly: true });
}

function findWord(bucket, ref) {
  return bucket.compounds?.find(c => c.id === ref || c.spelling === ref);
}

function findRoot(bucket, ref) {
  return bucket.sounds?.find(s => s.spelling === ref);
}

/** Resolve each component to its phonetic spelling segment. */
export function resolvePartSpellings(components, bucket, { flatOnly = false } = {}) {
  const out = [];
  for (const comp of components ?? []) {
    if (comp.type === 'root') {
      out.push(comp.ref);
    } else if (flatOnly) {
      const w = bucket ? findWord(bucket, comp.ref) : null;
      out.push(w?.spelling ?? comp.ref.replace(/^cmp-/, ''));
    } else if (bucket) {
      const w = findWord(bucket, comp.ref);
      if (!w) throw new Error(`Unknown word: ${comp.ref}`);
      out.push(w.spelling);
    } else {
      out.push(comp.ref.replace(/^cmp-/, ''));
    }
  }
  return out;
}

export function resolveSpelling(components, bucket) {
  return resolvePartSpellings(components, bucket).join('');
}

export function validateComponents(components, bucket, { targetWordId = null, allowUnapprovedWords = false } = {}) {
  if (!components?.length) throw new Error('At least one component required');

  for (const comp of components) {
    if (comp.type === 'root') {
      const root = findRoot(bucket, comp.ref);
      if (!root) throw new Error(`Unknown root: ${comp.ref}`);
      if (effectiveState(root) === 'rejected') throw new Error(`Root "${comp.ref}" is rejected`);
    } else if (comp.type === 'word') {
      const word = findWord(bucket, comp.ref);
      if (!word) throw new Error(`Unknown word: ${comp.ref}`);
      if (targetWordId && word.id === targetWordId) throw new Error('A word cannot include itself');
      const st = effectiveState(word);
      if (st === 'rejected') throw new Error(`Word "${word.spelling}" is rejected`);
      if (!allowUnapprovedWords && !REUSABLE_WORD_STATES.includes(st)) {
        throw new Error(`Word "${word.spelling}" is not approved yet, approve it first or enable experimental mode`);
      }
    } else {
      throw new Error(`Invalid component type: ${comp.type}`);
    }
  }

  if (wouldCreateCycle(components, bucket, targetWordId)) {
    const wordComp = components.find(c => c.type === 'word');
    const label = wordComp ? findWord(bucket, wordComp.ref)?.spelling ?? wordComp.ref : 'component';
    throw new Error(`Cannot use ${label} here, it would create a circular derivation`);
  }
}

function effectiveState(item) {
  const states = ['draft', 'needs_review', 'approved', 'rejected', 'revised'];
  if (item?.state && states.includes(item.state)) return item.state;
  return item?.meaning?.trim() ? 'needs_review' : 'draft';
}

/** Transitive word ids referenced by components. */
export function resolveDependencies(wordId, bucket) {
  const deps = new Set();
  const walk = (id) => {
    if (deps.has(id)) return;
    deps.add(id);
    const w = findWord(bucket, id);
    if (!w) return;
    const comps = w.components ?? partsToComponents(w.parts);
    for (const c of comps) {
      if (c.type === 'word') walk(c.ref.startsWith('cmp-') ? c.ref : findWord(bucket, c.ref)?.id ?? c.ref);
    }
  };
  walk(wordId);
  deps.delete(wordId);
  return deps;
}

export function wouldCreateCycle(components, bucket, targetWordId = null) {
  if (!targetWordId) {
    for (const c of components) {
      if (c.type !== 'word') continue;
      const w = findWord(bucket, c.ref);
      if (!w) continue;
      const inner = w.components ?? partsToComponents(w.parts);
      if (wouldCreateCycle(inner, bucket, w.id)) return true;
    }
    return false;
  }

  for (const c of components) {
    if (c.type !== 'word') continue;
    const w = findWord(bucket, c.ref);
    if (!w) continue;
    if (w.id === targetWordId) return true;
    const transitive = resolveDependencies(w.id, bucket);
    if (transitive.has(targetWordId)) return true;
  }
  return false;
}

function buildDirectNode(comp, bucket) {
  if (comp.type === 'root') {
    const root = findRoot(bucket, comp.ref);
    return {
      type: 'root',
      ref: comp.ref,
      spelling: comp.ref,
      meaning: root?.meaning ?? root?.legacy_label ?? null,
      state: root ? effectiveState(root) : 'draft',
      children: [],
    };
  }
  const word = findWord(bucket, comp.ref);
  if (!word) {
    return { type: 'word', ref: comp.ref, spelling: comp.ref, meaning: null, children: [] };
  }
  const inner = word.components ?? partsToComponents(word.parts);
  return {
    type: 'word',
    ref: word.id,
    spelling: word.spelling,
    meaning: word.meaning ?? word.legacy_label ?? null,
    state: effectiveState(word),
    children: inner.map(c => buildDirectNode(c, bucket)),
  };
}

export function buildDerivationTree(components, bucket) {
  return {
    direct: (components ?? []).map(c => buildDirectNode(c, bucket)),
  };
}

/** Ensure compound has components + derivation; migrate legacy parts[]. */
export function normalizeCompoundRecord(c, bucket) {
  if (!c.components?.length && c.parts?.length) {
    c.components = partsToComponents(c.parts);
  }
  if (c.components?.length) {
    c.parts = resolvePartSpellings(c.components, bucket, { flatOnly: true });
    c.spelling = resolveSpelling(c.components, bucket);
    c.id = c.id?.startsWith('cmp-') ? `cmp-${c.spelling}` : `cmp-${c.spelling}`;
    c.derivation = buildDerivationTree(c.components, bucket);
    c.phonetic = { form: c.spelling };
  }
  if (!c.dda) c.dda = emptyDda();
  return c;
}

export function normalizeSoundRecord(s) {
  const syl = parseSyllable(s.spelling);
  if (syl && !syl.unparsed) {
    s.phonetic = { form: s.spelling, onset: syl.onset, vowel: syl.vowel, coda: syl.coda };
  } else {
    s.phonetic = { form: s.spelling };
  }
  if (!s.dda) s.dda = emptyDda();
  return s;
}

export function migrateBucket(bucket) {
  for (const s of bucket.sounds ?? []) normalizeSoundRecord(s);
  for (const c of bucket.compounds ?? []) normalizeCompoundRecord(c, bucket);
  return bucket;
}

/** Compounds whose direct components include this root spelling or word id. */
export function wordsUsing(kind, ref, bucket) {
  return (bucket.compounds ?? []).filter(c => {
    if (effectiveState(c) === 'rejected') return false;
    const comps = c.components ?? partsToComponents(c.parts);
    return comps.some(comp => {
      if (kind === 'root' && comp.type === 'root') return comp.ref === ref;
      if (kind === 'word') {
        if (comp.type !== 'word') return false;
        const w = findWord(bucket, comp.ref);
        return comp.ref === ref || w?.id === ref || w?.spelling === ref;
      }
      return false;
    });
  });
}

/** Words sharing at least one direct component with the focus item. */
export function siblings(kind, ref, bucket) {
  let focusComps;
  if (kind === 'root') {
    focusComps = [{ type: 'root', ref }];
  } else {
    const w = findWord(bucket, ref);
    if (!w) return [];
    focusComps = w.components ?? partsToComponents(w.parts);
  }

  const keys = new Set(focusComps.map(c => `${c.type}:${c.ref}`));
  const results = [];

  for (const c of bucket.compounds ?? []) {
    if (effectiveState(c) === 'rejected') continue;
    if (kind === 'word' && c.id === ref) continue;
    const comps = c.components ?? partsToComponents(c.parts);
    const shared = comps.filter(comp => keys.has(`${comp.type}:${comp.ref}`));
    if (shared.length) {
      results.push({
        id: c.id,
        spelling: c.spelling,
        meaning: c.meaning,
        state: effectiveState(c),
        shared_components: shared,
      });
    }
  }
  return results.sort((a, b) => a.spelling.localeCompare(b.spelling));
}

/** Flat list of atomic root spellings in a compound (for segmentation lexicon). */
export function atomicRoots(components, bucket) {
  const roots = [];
  for (const comp of components ?? []) {
    if (comp.type === 'root') {
      roots.push(comp.ref);
    } else {
      const w = findWord(bucket, comp.ref);
      if (!w) continue;
      const inner = w.components ?? partsToComponents(w.parts);
      roots.push(...atomicRoots(inner, bucket));
    }
  }
  return roots;
}

export function buildGraphPayload(bucket, kind, ref) {
  let focus;
  if (kind === 'root') {
    const root = findRoot(bucket, ref);
    if (!root) throw new Error(`Unknown root: ${ref}`);
    focus = {
      kind: 'root',
      id: root.spelling,
      spelling: root.spelling,
      meaning: root.meaning,
      state: effectiveState(root),
      components: [],
      derivation: { direct: [] },
    };
  } else {
    const word = findWord(bucket, ref);
    if (!word) throw new Error(`Unknown word: ${ref}`);
    normalizeCompoundRecord(word, bucket);
    focus = {
      kind: 'word',
      id: word.id,
      spelling: word.spelling,
      meaning: word.meaning,
      state: effectiveState(word),
      components: word.components,
      derivation: word.derivation,
    };
  }

  const usedIn = wordsUsing(kind, ref, bucket).map(c => ({
    id: c.id,
    spelling: c.spelling,
    meaning: c.meaning,
    state: effectiveState(c),
  }));

  const related = siblings(kind, ref, bucket);

  return { focus, used_in: usedIn, related };
}

export function markDdaStale(item) {
  if (!item.dda) item.dda = emptyDda();
  if (item.dda.status === 'pending') return;
  item.dda.status = 'stale';
  item.dda.updated_at = new Date().toISOString();
}

export function markDescendantsDdaStale(wordId, bucket) {
  for (const c of bucket.compounds ?? []) {
    const comps = c.components ?? partsToComponents(c.parts);
    const uses = comps.some(comp => {
      if (comp.type !== 'word') return false;
      const w = findWord(bucket, comp.ref);
      return w?.id === wordId || comp.ref === wordId;
    });
    if (uses) markDdaStale(c);
    const transitive = resolveDependencies(c.id, bucket);
    if (transitive.has(wordId)) markDdaStale(c);
  }
}
