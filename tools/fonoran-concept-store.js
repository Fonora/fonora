/**
 * CRUD for Fonoran semantic concepts (primitives inventory).
 * Syncs semantic-primitives.json ↔ root-candidates.json ↔ lab when approved.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { romanToIpa, parseSyllable } from './fonoran-pronunciation.js';
import { loadConceptInventory } from './fonoran-concepts.js';
import { addSound, patchSound } from './fonoran-sound-bucket.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Converged single source of truth for concepts (99 core + extended dimensions).
const SEMANTIC_PATH = join(ROOT, 'data/fonoran-concept-inventory.json');
const CANDIDATES_PATH = join(ROOT, 'data/fonoran-root-candidates.json');
const CANONICAL_PATH = join(ROOT, 'data/fonoran-approved-roots.json');

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

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
  try {
    await addSound({ spelling: candidate.spelling, meaning, concept_id: candidate.id });
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
  await patchSound(candidate.spelling, { meaning, state: 'approved', concept_id: candidate.id });
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
  await writeJson(CANONICAL_PATH, canonical);
  return canonical;
}

async function renameLabSound(oldSpelling, newSpelling, candidate) {
  const meaning = candidate.concept?.trim() || candidate.id;
  try {
    await patchSound(oldSpelling, {
      new_spelling: newSpelling,
      meaning,
      concept_id: candidate.id,
      state: candidate.status === 'approved' ? 'approved' : undefined,
    });
  } catch (err) {
    if (String(err.message).includes('Unknown sound')) {
      await addSound({ spelling: newSpelling, meaning, concept_id: candidate.id });
      if (candidate.status === 'approved') {
        await patchSound(newSpelling, { meaning, state: 'approved', concept_id: candidate.id });
      }
      return;
    }
    throw err;
  }
}

export async function listConceptDomains() {
  const inventory = await loadConceptInventory();
  return [...new Set(inventory.concepts.map(c => c.domain).filter(Boolean))].sort();
}

export async function getConceptForEditor(id) {
  const key = validateId(id);
  const inventory = await loadConceptInventory();
  const concept = inventory.concepts.find(c => c.id === key);
  if (!concept) throw new Error(`Unknown concept: ${key}`);
  return concept;
}

export async function patchConcept(id, body) {
  const key = validateId(id);
  const semantic = await readJson(SEMANTIC_PATH);
  if (!semantic) throw new Error('Semantic primitives file not found');

  const { idx: primIdx, primitive } = findPrimitive(semantic, key);
  if (primIdx === -1) throw new Error(`Unknown concept: ${key}`);

  const store = await readJson(CANDIDATES_PATH);
  if (!store) throw new Error('Root candidates file not found. Run npm run fonoran:root-candidates');

  const { candidate } = findCandidate(store, key);
  if (!candidate) throw new Error(`No root candidate for concept: ${key}`);

  const prevSpelling = candidate.spelling;
  let spellingChanged = false;

  if (body.gloss != null || body.concept != null) {
    const gloss = String(body.gloss ?? body.concept ?? '').trim();
    if (!gloss) throw new Error('Concept phrase is required');
    primitive.gloss = gloss;
    candidate.concept = gloss;
  }

  if (body.domain != null) {
    const domain = String(body.domain).trim().toLowerCase();
    if (!domain) throw new Error('Domain is required');
    primitive.domain = domain;
    candidate.domain = domain;
  }

  if (body.aliases != null) {
    primitive.aliases = normalizeAliases(body.aliases);
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
  }

  candidate.review = { ...candidate.review, edited_at: new Date().toISOString() };

  semantic.primitives[primIdx] = primitive;
  await writeJson(SEMANTIC_PATH, semantic);

  refreshCandidateSummary(store);
  await writeJson(CANDIDATES_PATH, store);

  if (candidate.status === 'approved') {
    if (spellingChanged) {
      await renameLabSound(prevSpelling, candidate.spelling, candidate);
    } else {
      await syncApprovedToLab(candidate);
    }
    await writeCanonicalFromCandidates(store);
  }

  return getConceptForEditor(key);
}

export async function createConcept(body) {
  const key = validateId(body.id);
  const gloss = String(body.gloss ?? body.concept ?? '').trim();
  const domain = String(body.domain ?? '').trim().toLowerCase();
  const spelling = validateSpelling(body.spelling);
  if (!gloss) throw new Error('Concept phrase is required');
  if (!domain) throw new Error('Domain is required');

  const semantic = await readJson(SEMANTIC_PATH, { version: '1.2-semantic-foundation', primitives: [] });
  if (findPrimitive(semantic, key).primitive) throw new Error(`Concept id already exists: ${key}`);

  const store = await readJson(CANDIDATES_PATH);
  if (!store) throw new Error('Root candidates file not found. Run npm run fonoran:root-candidates');
  if (findCandidate(store, key).candidate) throw new Error(`Root candidate already exists: ${key}`);

  const dup = store.candidates.find(c => c.spelling === spelling && c.status !== 'rejected');
  if (dup) throw new Error(`Spelling "${spelling}" is already used by ${dup.id}`);

  const aliases = normalizeAliases(body.aliases);
  const primitive = { id: key, gloss, domain };
  if (aliases.length) primitive.aliases = aliases;

  const candidate = {
    id: key,
    spelling,
    ipa: romanToIpa(spelling),
    concept: gloss,
    domain,
    reason: body.reason?.trim() || `New concept: ${gloss.split(';')[0].trim()}.`,
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

  await writeJson(SEMANTIC_PATH, semantic);
  refreshCandidateSummary(store);
  await writeJson(CANDIDATES_PATH, store);

  return getConceptForEditor(key);
}

export async function deleteConcept(id) {
  const key = validateId(id);
  const semantic = await readJson(SEMANTIC_PATH);
  const store = await readJson(CANDIDATES_PATH);
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

  await writeJson(SEMANTIC_PATH, semantic);
  refreshCandidateSummary(store);
  await writeJson(CANDIDATES_PATH, store);

  return { deleted: key };
}
