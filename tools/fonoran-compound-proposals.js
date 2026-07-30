/**
 * The review queue of concepts the lexicon does not cover yet.
 *
 * A proposal is a suggestion, not language. Nothing here affects a translation, a compound,
 * or a lesson until a human accepts it and `fonoran:regenerate` promotes it into
 * fonoran-compounds.json or the concept inventory. Read the file's `provenance` field before
 * trusting any rationale text in it.
 *
 * Storage is data/fonoran-compound-proposals.json and nothing else. This used to be a Postgres
 * table with a JSON mirror, which meant the queue you saw depended on which machine you were on:
 * production held 115 proposals and a developer checkout held 87, with only 41 concepts in
 * common and no id in common at all. Both were invisible to git. One committed file cannot
 * diverge from itself.
 */

import '../load-env.js';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROPOSALS_PATH = join(ROOT, 'data/fonoran-compound-proposals.json');

const RESOLVE_ACTIONS = new Set(['accepted', 'rejected', 'skipped']);

function newId() {
  return `cp-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function defaultDoc() {
  return { version: '2.0', proposals: [] };
}

/** @type {object | null} */
let cache = null;

/** Clear the in-memory copy so the next read hits disk (test isolation). */
export function resetProposalsCache() {
  cache = null;
}

async function readDoc() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(PROPOSALS_PATH, 'utf8'));
  } catch {
    cache = defaultDoc();
  }
  if (!Array.isArray(cache.proposals)) cache.proposals = [];
  return cache;
}

async function writeDoc(doc) {
  doc.proposal_count = doc.proposals.length;
  cache = doc;
  await mkdir(dirname(PROPOSALS_PATH), { recursive: true });
  await writeFile(PROPOSALS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

/** Load the whole queue document, including its provenance notes. */
export async function loadCompoundProposals() {
  return readDoc();
}

function buildProposalRecord(p) {
  return {
    id: newId(),
    word: p.word ?? null,
    role: p.role ?? 'concept',
    concept_id: p.concept_id ?? null,
    gloss: p.gloss ?? null,
    source: p.source ?? 'manual',
    classification: p.classification ?? 'compound',
    rationale: p.rationale ?? null,
    compositions: p.compositions ?? [],
    valid_compositions: p.valid_compositions ?? [],
    redundancy_warnings: p.redundancy_warnings ?? null,
    primitive_proposal: p.primitive_proposal ?? null,
    alias_proposal: p.alias_proposal ?? null,
    status: 'open',
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
  };
}

/**
 * Add proposals to the queue.
 * @param {Array<object>} proposals
 * @returns {Promise<object[]>} the created records
 */
export async function createCompoundProposals(proposals) {
  const doc = await readDoc();
  const created = proposals.map(buildProposalRecord);
  doc.proposals.push(...created);
  await writeDoc(doc);
  return created;
}

/**
 * @param {object} [opts]
 * @param {'open'|'accepted'|'rejected'|'skipped'|null} [opts.status]
 * @param {'compound'|'primitive'|'alias'|null} [opts.classification]
 * @param {number} [opts.limit]
 */
export async function listCompoundProposals({ status = 'open', classification = null, limit = 200 } = {}) {
  const doc = await readDoc();
  let list = doc.proposals;
  if (status) list = list.filter(p => p.status === status);
  if (classification) list = list.filter(p => p.classification === classification);
  return list.slice(0, limit);
}

/**
 * Accept, reject, or skip one proposal. Accepting records the choice; it does not change the
 * lexicon. `fonoran:regenerate` is what promotes accepted proposals into the seeds.
 *
 * @param {string} id
 * @param {'accepted'|'rejected'|'skipped'} action
 * @param {{ resolvedBy?: string, note?: string, chosenComposition?: string[], chosenCompositionIndex?: number }} [opts]
 */
export async function resolveCompoundProposal(id, action, opts = {}) {
  if (!RESOLVE_ACTIONS.has(action)) throw new Error(`Invalid action: ${action}`);

  const doc = await readDoc();
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

  await writeDoc(doc);
  return proposal;
}

/** Counts by status and by classification, for the Word Manager header. */
export async function getProposalStats() {
  const doc = await readDoc();
  const stats = { open: 0, accepted: 0, rejected: 0, skipped: 0, compound: 0, primitive: 0, alias: 0 };
  for (const p of doc.proposals) {
    if (stats[p.status] != null) stats[p.status] += 1;
    if (stats[p.classification] != null) stats[p.classification] += 1;
  }
  stats.total = doc.proposals.length;
  return stats;
}

/**
 * Accepted compound proposals as concept id to compositions, for the candidate generator.
 * @returns {Promise<Map<string, string[][]>>}
 */
export async function getAcceptedCompositionSeeds() {
  const doc = await readDoc();
  const out = new Map();
  for (const p of doc.proposals) {
    if (p.status !== 'accepted' || p.classification !== 'compound') continue;
    if (!p.concept_id || !p.valid_compositions?.length) continue;
    if (!out.has(p.concept_id)) out.set(p.concept_id, []);
    out.get(p.concept_id).push(...p.valid_compositions);
  }
  return out;
}

/** Accepted primitive proposals, ready for inventory-migration review. */
export async function getAcceptedPrimitiveProposals() {
  const doc = await readDoc();
  return doc.proposals
    .filter(p => p.status === 'accepted' && p.classification === 'primitive' && p.primitive_proposal)
    .map(p => ({ proposal_id: p.id, word: p.word, ...p.primitive_proposal }));
}
