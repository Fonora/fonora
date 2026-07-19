/**
 * Sync lab edits → git-tracked editorial seeds (compounds.json).
 * Roots/concepts already sync via fonoran-concept-store.js on PATCH.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc, EDITORIAL_DOCS, resolveStorageMode } from './fonoran-store.js';
import { editorialSeedPath } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Map lab component recipe to direct composition (concept ids).
 * @param {object[]} components
 * @param {object} bucket
 * @returns {string[] | null}
 */
export function labComponentsToComposition(components, bucket) {
  if (!Array.isArray(components) || components.length < 2) return null;
  const out = [];
  for (const comp of components) {
    if (comp.type === 'root') {
      const sound = bucket.sounds?.find(s => s.spelling === comp.ref);
      const cid = sound?.concept_id;
      if (!cid) return null;
      out.push(cid);
      continue;
    }
    if (comp.type === 'word') {
      const word = bucket.compounds?.find(c => c.id === comp.ref || c.spelling === comp.ref);
      const cid = word?.concept_id;
      if (!cid) return null;
      out.push(cid);
      continue;
    }
    return null;
  }
  return out.length >= 2 ? out : null;
}

function compositionKey(comp) {
  return JSON.stringify(comp ?? []);
}

function pushAlternate(alternates, composition, gloss, source = 'human') {
  const list = alternates ?? [];
  const key = compositionKey(composition);
  if (list.some(a => compositionKey(a.composition) === key)) return list;
  return [
    ...list,
    {
      composition,
      gloss: gloss ?? '',
      understandability: null,
      label: 'human edit',
      status: 'plausible',
      source,
    },
  ];
}

/**
 * Upsert preferred form in compounds.json.
 * @param {string} conceptId
 * @param {{ composition?: string[], gloss?: string }} opts
 */
export async function updateCompoundEditorial(conceptId, { composition, gloss, locked } = {}) {
  const cid = String(conceptId ?? '').trim().toLowerCase();
  if (!cid) throw new Error('concept_id required for editorial compound sync');

  const doc = (await readDoc('compounds')) ?? {
    version: '2.0-communicative',
    compound_count: 0,
    compounds: [],
  };
  const compounds = [...(doc.compounds ?? [])];
  let row = compounds.find(c => c.concept === cid);
  const prev = row?.preferred;

  if (composition && (!Array.isArray(composition) || composition.length < 2)) {
    throw new Error('Composition must have at least two concept ids');
  }

  const nextPreferred = {
    composition: composition ?? prev?.composition ?? [],
    gloss: (gloss ?? prev?.gloss ?? '').trim(),
  };
  if (!nextPreferred.composition.length) {
    throw new Error('No composition available for editorial sync');
  }

  if (!row) {
    row = {
      concept: cid,
      preferred: nextPreferred,
      preferred_source: 'human',
      alternates: [],
    };
    compounds.push(row);
  } else {
    if (prev && composition && compositionKey(prev.composition) !== compositionKey(composition)) {
      row.alternates = pushAlternate(row.alternates, prev.composition, prev.gloss, row.preferred_source ?? 'heuristic');
    }
    row.preferred = nextPreferred;
    row.preferred_source = 'human';
  }

  if (typeof locked === 'boolean') {
    row.locked = locked;
    if (locked && row.preferred_source !== 'human' && row.preferred_source !== 'playtest') {
      row.preferred_source = row.preferred_source ?? 'heuristic';
    }
  }

  doc.compounds = compounds.sort((a, b) => String(a.concept).localeCompare(String(b.concept)));
  doc.compound_count = doc.compounds.length;
  await writeDoc('compounds', doc);

  const rel = EDITORIAL_DOCS.compounds;
  return {
    seeds_written: true,
    concept: cid,
    paths: [editorialSeedPath('compounds', rel, ROOT)],
    storage_mode: resolveStorageMode(),
  };
}

/**
 * Sync a lab compound row to compounds.json when concept_id is known.
 * @param {object} compound  enriched lab compound
 * @param {object} [bucket]
 */
export async function syncCompoundFromLab(compound, bucket = null) {
  if (!compound?.concept_id) {
    return { seeds_written: false, skipped: true, reason: 'no concept_id' };
  }
  if (!bucket) {
    const { loadBucket } = await import('./fonoran-sound-bucket.js');
    bucket = await loadBucket();
  }

  const components = compound.components ?? [];
  const composition = compound.direct_composition?.length >= 2
    ? compound.direct_composition
    : labComponentsToComposition(components, bucket);

  if (!composition) {
    return {
      seeds_written: false,
      skipped: true,
      reason: 'could not resolve composition from lab components',
      concept: compound.concept_id,
    };
  }

  const gloss = compound.gloss?.trim()
    || compound.composition_readable?.split('=').slice(1).join('=').trim()
    || compound.meaning?.trim()
    || '';

  const result = await updateCompoundEditorial(compound.concept_id, { composition, gloss });
  return { ...result, skipped: false };
}

/**
 * Update gloss only when meaning changed but recipe did not.
 */
export async function syncCompoundGlossFromLab(compound) {
  if (!compound?.concept_id) {
    return { seeds_written: false, skipped: true, reason: 'no concept_id' };
  }
  const doc = await readDoc('compounds');
  const row = doc?.compounds?.find(c => c.concept === compound.concept_id);
  if (!row?.preferred?.composition?.length) {
    return { seeds_written: false, skipped: true, reason: 'no existing compound row' };
  }
  const gloss = compound.gloss?.trim() || compound.meaning?.trim() || row.preferred.gloss;
  return updateCompoundEditorial(compound.concept_id, {
    composition: row.preferred.composition,
    gloss,
  });
}
