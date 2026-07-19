/**
 * Remove compound seed rows whose concept id is a primitive root.
 * Primitives win; compound definitions for the same id are stale editorial state.
 */

import { readDoc, writeDoc } from './fonoran-store.js';

/**
 * @param {object} [inventoryDoc]
 * @returns {Set<string>}
 */
export function loadPrimitiveConceptIds(inventoryDoc) {
  const inv = inventoryDoc ?? { primitives: [] };
  return new Set(
    (inv.primitives ?? [])
      .filter(p => (p.suggested_status ?? 'primitive') !== 'compound_candidate')
      .map(p => p.id),
  );
}

/**
 * @param {object} compoundsDoc
 * @param {Set<string>} primitiveIds
 * @returns {{ doc: object, pruned: { concept: string, reason: string }[] }}
 */
export function pruneShadowCompounds(compoundsDoc, primitiveIds) {
  const compounds = compoundsDoc?.compounds ?? [];
  const pruned = [];
  const kept = [];

  for (const def of compounds) {
    const id = def.concept;
    if (id && primitiveIds.has(id)) {
      pruned.push({ concept: id, reason: 'shadows a primitive root id' });
      continue;
    }
    kept.push(def);
  }

  const now = new Date().toISOString();
  return {
    doc: {
      ...compoundsDoc,
      compounds: kept,
      compound_count: kept.length,
      ...(pruned.length ? { pruned_shadow_compounds_at: now } : {}),
    },
    pruned,
  };
}

/**
 * Prune fonoran-compounds.json in place.
 * @param {{ write?: boolean, inventoryDoc?: object, compoundsDoc?: object }} opts
 */
export async function pruneCompoundSeeds({ write = true, inventoryDoc = null, compoundsDoc = null } = {}) {
  const [inv, compounds] = await Promise.all([
    inventoryDoc ? Promise.resolve(inventoryDoc) : readDoc('concept_inventory'),
    compoundsDoc ? Promise.resolve(compoundsDoc) : readDoc('compounds'),
  ]);
  const primitiveIds = loadPrimitiveConceptIds(inv);
  const { doc, pruned } = pruneShadowCompounds(compounds ?? { compounds: [] }, primitiveIds);
  if (write && pruned.length) {
    await writeDoc('compounds', doc);
  }
  return {
    pruned,
    remaining: doc.compounds.length,
    wrote: Boolean(write && pruned.length),
    doc,
  };
}
