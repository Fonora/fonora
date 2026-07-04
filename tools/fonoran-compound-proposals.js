/**
 * Persisted LLM compound/primitive proposals.
 *
 * Bridges the gap between the translation gap baseline and the canon editorial
 * pipeline. LLM-generated proposals land here first; admins review, accept, or
 * reject from the Word Manager queue before anything touches the canonical
 * concept inventory or compounds.json.
 *
 * Storage: data/fonoran-compound-proposals.json (local/git)
 * Schema version: 1.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROPOSALS_PATH = join(ROOT, 'data/fonoran-compound-proposals.json');

function newId() {
  return `cp-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function defaultDoc() {
  return { version: '1.0', generated_at: new Date().toISOString(), proposals: [] };
}

/** @type {object | null} */
let cache = null;

async function readProposalsDoc() {
  if (cache) return cache;
  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = defaultDoc();
  }
  if (!Array.isArray(cache.proposals)) cache.proposals = [];
  return cache;
}

async function writeProposalsDoc(doc) {
  cache = doc;
  await mkdir(dirname(PROPOSALS_PATH), { recursive: true });
  await writeFile(PROPOSALS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

/** Clear in-memory cache (for test isolation). */
export function resetProposalsCache() {
  cache = null;
}

/**
 * Load all compound/primitive proposals.
 */
export async function loadCompoundProposals() {
  return readProposalsDoc();
}

/**
 * Create one or more new LLM-generated proposals.
 *
 * @param {Array<GapProposalInput>} proposals
 * @returns {Promise<object[]>} created records
 */
export async function createCompoundProposals(proposals) {
  const doc = await readProposalsDoc();
  const now = new Date().toISOString();
  const created = [];

  for (const p of proposals) {
    const record = {
      id: newId(),
      /** English word that is the translation gap */
      word: p.word ?? null,
      /** Semantic role the word appears in (path, subject, event…) */
      role: p.role ?? 'concept',
      /** The concept id this proposal resolves — may be new (primitive) or existing */
      concept_id: p.concept_id ?? null,
      /** Human-readable gloss for the target concept */
      gloss: p.gloss ?? null,
      /** How this proposal was generated */
      source: p.source ?? 'llm_gap_analyzer',
      /** compound | primitive | alias */
      classification: p.classification ?? 'compound',
      /** Human-readable rationale from the LLM */
      rationale: p.rationale ?? null,
      /** Array of composition arrays: [["collective","hold","strong"], ...] */
      compositions: p.compositions ?? [],
      /** Validated (build-safe) compositions subset */
      valid_compositions: p.valid_compositions ?? [],
      /** Parallel array to valid_compositions — 'edge_repeat' | 'adjacent_repeat' | null per slot */
      redundancy_warnings: p.redundancy_warnings ?? null,
      /** New primitive metadata if classification === 'primitive' */
      primitive_proposal: p.primitive_proposal ?? null,
      /** Alias mapping if classification === 'alias' */
      alias_proposal: p.alias_proposal ?? null,
      /** open | accepted | rejected | skipped */
      status: 'open',
      created_at: now,
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
    };
    doc.proposals.push(record);
    created.push(record);
  }

  doc.generated_at = now;
  await writeProposalsDoc(doc);
  return created;
}

/**
 * List proposals with optional filtering.
 *
 * @param {object} [opts]
 * @param {'open'|'accepted'|'rejected'|'skipped'|null} [opts.status]
 * @param {'compound'|'primitive'|'alias'|null} [opts.classification]
 * @param {number} [opts.limit]
 */
export async function listCompoundProposals({ status = 'open', classification = null, limit = 200 } = {}) {
  const doc = await readProposalsDoc();
  let list = doc.proposals;
  if (status) list = list.filter(p => p.status === status);
  if (classification) list = list.filter(p => p.classification === classification);
  return list.slice(0, limit);
}

/**
 * Resolve (accept/reject/skip) a proposal.
 *
 * @param {string} id
 * @param {'accepted'|'rejected'|'skipped'} action
 * @param {object} [opts]
 * @param {string} [opts.resolvedBy]
 * @param {string} [opts.note]
 * @param {number} [opts.chosenCompositionIndex] - for accepted compound proposals
 */
export async function resolveCompoundProposal(id, action, opts = {}) {
  const validActions = new Set(['accepted', 'rejected', 'skipped']);
  if (!validActions.has(action)) throw new Error(`Invalid action: ${action}`);

  const doc = await readProposalsDoc();
  const proposal = doc.proposals.find(p => p.id === id);
  if (!proposal) throw new Error(`Compound proposal not found: ${id}`);

  proposal.status = action;
  proposal.resolved_at = new Date().toISOString();
  proposal.resolved_by = opts.resolvedBy ?? null;
  proposal.resolution_note = opts.note ?? null;

  if (action === 'accepted') {
    if (Array.isArray(opts.chosenComposition) && opts.chosenComposition.length) {
      proposal.chosen_composition = opts.chosenComposition;
    } else if (opts.chosenCompositionIndex != null && opts.chosenCompositionIndex >= 0) {
      proposal.chosen_composition_index = opts.chosenCompositionIndex;
      proposal.chosen_composition = proposal.valid_compositions?.[opts.chosenCompositionIndex] ?? null;
    }
  }

  await writeProposalsDoc(doc);
  return proposal;
}

/**
 * Get summary statistics for the proposal store.
 */
export async function getProposalStats() {
  const doc = await readProposalsDoc();
  const stats = { open: 0, accepted: 0, rejected: 0, skipped: 0, compound: 0, primitive: 0, alias: 0 };
  for (const p of doc.proposals) {
    if (stats[p.status] != null) stats[p.status] += 1;
    if (stats[p.classification] != null) stats[p.classification] += 1;
  }
  stats.total = doc.proposals.length;
  return stats;
}

/**
 * Merge accepted compound proposals into the expression candidates pool.
 * Returns arrays of [conceptId, compositions[]] pairs for use in generateCandidates.
 */
export async function getAcceptedCompositionSeeds() {
  const doc = await readProposalsDoc();
  const out = new Map();
  for (const p of doc.proposals) {
    if (p.status !== 'accepted' || p.classification !== 'compound') continue;
    if (!p.concept_id || !p.valid_compositions?.length) continue;
    if (!out.has(p.concept_id)) out.set(p.concept_id, []);
    for (const comp of p.valid_compositions) {
      out.get(p.concept_id).push(comp);
    }
  }
  return out;
}

/**
 * Get accepted primitive proposals as concept inventory candidates.
 * Returns array of proposed concept records ready for inventory-migration review.
 */
export async function getAcceptedPrimitiveProposals() {
  const doc = await readProposalsDoc();
  return doc.proposals
    .filter(p => p.status === 'accepted' && p.classification === 'primitive' && p.primitive_proposal)
    .map(p => ({
      proposal_id: p.id,
      word: p.word,
      ...p.primitive_proposal,
    }));
}
