/**
 * Resolve compound compositions to flattened root counts (shared by build, ranking, audit).
 */

function normalizeCompoundDef(def) {
  return {
    concept: def.concept,
    composition: def.preferred?.composition ?? def.composition ?? [],
  };
}

/**
 * Build a resolver that maps concept ids → flattened root id sequences.
 * @param {string[]} primitiveIds  atomic root concept ids
 * @param {object[]} compoundDefs  compound inventory rows
 */
export function buildCompositionResolver(primitiveIds, compoundDefs = []) {
  const resolvedById = new Map();
  for (const id of primitiveIds) {
    resolvedById.set(id, { roots: [id] });
  }

  const defById = new Map();
  for (const def of compoundDefs.map(normalizeCompoundDef)) {
    if (!primitiveIds.includes(def.concept)) defById.set(def.concept, def);
  }

  let pending = [...defById.values()];
  let progress = true;
  while (progress && pending.length) {
    progress = false;
    const stillPending = [];
    for (const def of pending) {
      const comps = def.composition ?? [];
      if (!comps.length || comps.some(id => !resolvedById.has(id))) {
        const waitable = comps.some(id => defById.has(id) && !resolvedById.has(id));
        if (waitable) stillPending.push(def);
        continue;
      }
      const roots = comps.flatMap(id => resolvedById.get(id).roots);
      resolvedById.set(def.concept, { roots });
      progress = true;
    }
    pending = stillPending;
  }

  return {
    resolvedById,
    /** @param {string[]} composition */
    flatRoots(composition) {
      if (!Array.isArray(composition) || !composition.length) return null;
      if (!composition.every(id => resolvedById.has(id))) return null;
      return composition.flatMap(id => resolvedById.get(id).roots);
    },
    /** @param {string[]} composition */
    flatCount(composition) {
      const roots = this.flatRoots(composition);
      return roots ? roots.length : null;
    },
  };
}

/** Default max flattened roots before build/audit warn (override with FONORAN_MAX_FLATTENED). */
export function maxFlattenedRoots() {
  const raw = process.env.FONORAN_MAX_FLATTENED?.trim();
  const n = raw ? Number(raw) : 4;
  return Number.isFinite(n) && n > 0 ? n : 4;
}
