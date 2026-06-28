/**
 * CRUD for Fonoran semantic concepts (primitives inventory).
 * Syncs concept inventory ↔ root-candidates ↔ lab when approved.
 * Concept descriptions live in the inventory; English aliases live in localizations.
 */

import { romanToIpa, parseSyllable } from './fonoran-pronunciation.js';
import { loadConceptInventory, clearLocalizationCache, loadRuntimeConceptInventory, loadLocalization } from './fonoran-concepts.js';
import { readDoc, writeDoc } from './fonoran-store.js';
import {
  addSound,
  patchSound,
  getLab,
  loadBucket,
  effectiveState,
  consolidateConceptSound,
} from './fonoran-sound-bucket.js';

function validateId(id) {
  const key = String(id ?? '').trim().toLowerCase();
  if (!key) throw new Error('Concept id is required');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error('Concept id must be lowercase letters, digits, or underscores');
  }
  return key;
}

function validateSpelling(spelling) {
  const sp = spelling?.trim().toLowerCase();
  if (!sp) throw new Error('Fonoran spelling is required');
  const syl = parseSyllable(sp);
  if (!syl || syl.unparsed) throw new Error(`Not a valid Fonoran syllable: ${sp}`);
  return sp;
}

function normalizeAliases(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw).split(/[\n,]+/);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const a = String(item ?? '').trim().toLowerCase();
    if (!a || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function findPrimitive(semantic, id) {
  const idx = (semantic.primitives ?? []).findIndex(p => p.id === id);
  if (idx === -1) return { idx: -1, primitive: null };
  return { idx, primitive: semantic.primitives[idx] };
}

function findCandidate(store, id) {
  const idx = (store.candidates ?? []).findIndex(c => c.id === id);
  if (idx === -1) return { idx: -1, candidate: null };
  return { idx, candidate: store.candidates[idx] };
}

function refreshCandidateSummary(store) {
  store.summary = {
    total: store.candidates.length,
    pending: store.candidates.filter(c => c.status === 'pending').length,
    approved: store.candidates.filter(c => c.status === 'approved').length,
    rejected: store.candidates.filter(c => c.status === 'rejected').length,
  };
  return store;
}

async function syncApprovedToLab(candidate) {
  const meaning = candidate.concept?.trim() || candidate.id;
  const locData = await loadLocalization('en');
  const aliases = locData[candidate.id]?.aliases ?? [];
  try {
    await addSound({ spelling: candidate.spelling, meaning, concept_id: candidate.id });
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
  await patchSound(candidate.spelling, {
    meaning,
    state: 'approved',
    concept_id: candidate.id,
    aliases: aliases.length ? aliases : undefined,
  });
  await consolidateConceptSound(candidate.id, candidate.spelling, { meaning, state: 'approved' });
}

/** Persist English word bank onto the linked lab root without changing review state. */
async function syncConceptAliasesToLab(conceptId) {
  const locData = await loadLocalization('en');
  const aliases = locData[conceptId]?.aliases ?? [];
  const bucket = await loadBucket();
  const sound = bucket.sounds.find(
    s => s.concept_id === conceptId && effectiveState(s) !== 'rejected',
  );
  if (!sound) return;
  await patchSound(sound.spelling, { aliases });
}

/** Write updated aliases for a concept id into the English locale store. */
async function writeEnLocaleAliases(id, aliases) {
  const locale = (await readDoc('localization_en')) ?? { version: '1.0-localization', locale: 'en', entries: {} };
  if (!locale.entries) locale.entries = {};
  if (!locale.entries[id]) locale.entries[id] = { label: id };
  locale.entries[id].aliases = aliases;
  await writeDoc('localization_en', locale);
  clearLocalizationCache('en');
}

async function writeCanonicalFromCandidates(store) {
  const approved = store.candidates.filter(c => c.status === 'approved');
  const canonical = {
    version: '1.0-approved-roots',
    updated_at: new Date().toISOString(),
    philosophy: 'Only human-approved roots from Root Review are canonical.',
    root_count: approved.length,
    roots: approved.map(c => ({
      id: c.id,
      spelling: c.spelling,
      ipa: c.ipa,
      concept: c.concept,
      domain: c.domain,
      reason: c.reason,
      approved_at: c.review?.approved_at,
    })),
  };
  await writeDoc('approved_roots', canonical);
  return canonical;
}

/** Read the description from a request body, accepting legacy field names. */
function bodyDescription(body) {
  return body.description ?? body.gloss ?? body.concept ?? null;
}

async function renameLabSound(oldSpelling, newSpelling, candidate) {
  const meaning = candidate.concept?.trim() || candidate.id;
  const bucket = await loadBucket();
  const labMatch = bucket.sounds.find(
    s => s.concept_id === candidate.id && effectiveState(s) !== 'rejected',
  );
  const old = labMatch?.spelling ?? oldSpelling;
  try {
    await patchSound(old, {
      new_spelling: newSpelling,
      meaning,
      concept_id: candidate.id,
      state: candidate.status === 'approved' ? 'approved' : undefined,
    });
  } catch (err) {
    const msg = String(err.message);
    if (msg.includes('Unknown sound') || msg.includes('already exists')) {
      await consolidateConceptSound(candidate.id, newSpelling, {
        meaning,
        state: candidate.status === 'approved' ? 'approved' : undefined,
      });
      return;
    }
    throw err;
  }
  await consolidateConceptSound(candidate.id, newSpelling, {
    meaning,
    state: candidate.status === 'approved' ? 'approved' : undefined,
  });
}

export async function listConceptDomains() {
  const inventory = await loadConceptInventory();
  return [...new Set(inventory.concepts.map(c => c.domain).filter(Boolean))].sort();
}

export async function getConceptForEditor(id) {
  const key = validateId(id);
  const lab = await getLab();
  const inventory = await loadRuntimeConceptInventory({ lab });
  const concept = inventory.concepts.find(c => c.id === key);
  if (!concept) throw new Error(`Unknown concept: ${key}`);
  return concept;
}

export async function patchConcept(id, body) {
  const key = validateId(id);
  const semantic = await readDoc('concept_inventory');
  if (!semantic) throw new Error('Semantic primitives file not found');

  const { idx: primIdx, primitive } = findPrimitive(semantic, key);
  if (primIdx === -1) throw new Error(`Unknown concept: ${key}`);

  const store = await readDoc('root_candidates');
  if (!store) throw new Error('Root candidates file not found. Run npm run fonoran:root-candidates');

  const { candidate } = findCandidate(store, key);
  if (!candidate) throw new Error(`No root candidate for concept: ${key}`);

  const prevSpelling = candidate.spelling;
  let spellingChanged = false;
  let aliasesChanged = false;
  let labMetadataChanged = false;

  const rawDescription = bodyDescription(body);
  if (rawDescription != null) {
    const description = String(rawDescription).trim();
    if (!description) throw new Error('Concept phrase is required');
    primitive.description = description;
    candidate.concept = description;
    labMetadataChanged = true;
  }

  if (body.domain != null) {
    const domain = String(body.domain).trim().toLowerCase();
    if (!domain) throw new Error('Domain is required');
    primitive.domain = domain;
    candidate.domain = domain;
  }

  if (body.aliases != null) {
    const normalized = normalizeAliases(body.aliases);
    await writeEnLocaleAliases(key, normalized);
    delete primitive.aliases;
    aliasesChanged = true;
  }

  if (body.spelling != null) {
    const spelling = validateSpelling(body.spelling);
    const dup = store.candidates.find(
      c => c.id !== key && c.spelling === spelling && c.status !== 'rejected',
    );
    if (dup) throw new Error(`Spelling "${spelling}" is already used by ${dup.id}`);
    spellingChanged = spelling !== prevSpelling;
    candidate.spelling = spelling;
    candidate.ipa = romanToIpa(spelling);
    labMetadataChanged = true;
  }

  candidate.review = { ...candidate.review, edited_at: new Date().toISOString() };

  semantic.primitives[primIdx] = primitive;
  await writeDoc('concept_inventory', semantic);

  refreshCandidateSummary(store);
  await writeDoc('root_candidates', store);

  if (candidate.status === 'approved') {
    if (spellingChanged) {
      await renameLabSound(prevSpelling, candidate.spelling, candidate);
    } else if (labMetadataChanged) {
      await syncApprovedToLab(candidate);
    }
    if (aliasesChanged) {
      await syncConceptAliasesToLab(key);
    }
    if (spellingChanged || labMetadataChanged) {
      await writeCanonicalFromCandidates(store);
    }
  }

  return getConceptForEditor(key);
}

export async function createConcept(body) {
  const key = validateId(body.id);
  const rawDescription = bodyDescription(body);
  const description = String(rawDescription ?? '').trim();
  const domain = String(body.domain ?? '').trim().toLowerCase();
  const spelling = validateSpelling(body.spelling);
  if (!description) throw new Error('Concept phrase is required');
  if (!domain) throw new Error('Domain is required');

  const semantic = (await readDoc('concept_inventory')) ?? { version: '1.2-semantic-foundation', primitives: [] };
  if (findPrimitive(semantic, key).primitive) throw new Error(`Concept id already exists: ${key}`);

  const store = await readDoc('root_candidates');
  if (!store) throw new Error('Root candidates file not found. Run npm run fonoran:root-candidates');
  if (findCandidate(store, key).candidate) throw new Error(`Root candidate already exists: ${key}`);

  const dup = store.candidates.find(c => c.spelling === spelling && c.status !== 'rejected');
  if (dup) throw new Error(`Spelling "${spelling}" is already used by ${dup.id}`);

  const aliases = normalizeAliases(body.aliases);
  const primitive = { id: key, description, domain };

  const candidate = {
    id: key,
    spelling,
    ipa: romanToIpa(spelling),
    concept: description,
    domain,
    reason: body.reason?.trim() || `New concept: ${description.split(';')[0].trim()}.`,
    pronunciation_ease: null,
    pronunciation_ease_label: null,
    semantic_usefulness: null,
    semantic_usefulness_label: null,
    priority: 0,
    status: 'pending',
    review: { approved_at: null, rejected_at: null, edited_at: new Date().toISOString(), note: 'created in concept editor' },
    generation: { phonetic_cost: null, template: null, tier: 'concept-editor' },
  };

  semantic.primitives.push(primitive);
  semantic.primitive_count = semantic.primitives.length;
  store.candidates.push(candidate);

  await writeDoc('concept_inventory', semantic);
  refreshCandidateSummary(store);
  await writeDoc('root_candidates', store);

  if (aliases.length) {
    await writeEnLocaleAliases(key, aliases);
  }

  return getConceptForEditor(key);
}

export async function deleteConcept(id) {
  const key = validateId(id);
  const semantic = await readDoc('concept_inventory');
  const store = await readDoc('root_candidates');
  if (!semantic || !store) throw new Error('Concept data files not found');

  const { idx: primIdx, primitive } = findPrimitive(semantic, key);
  if (!primitive) throw new Error(`Unknown concept: ${key}`);

  const { idx: candIdx, candidate } = findCandidate(store, key);
  if (candidate?.status === 'approved') {
    throw new Error('Cannot delete an approved concept. Reject it in Root Review first.');
  }

  semantic.primitives.splice(primIdx, 1);
  semantic.primitive_count = semantic.primitives.length;
  if (candIdx !== -1) store.candidates.splice(candIdx, 1);

  await writeDoc('concept_inventory', semantic);
  refreshCandidateSummary(store);
  await writeDoc('root_candidates', store);

  return { deleted: key };
}
