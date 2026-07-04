/**
 * Persisted LLM compound/primitive proposals.
 *
 * Bridges the gap between the translation gap baseline and the canon editorial
 * pipeline. LLM-generated proposals land here first; admins review, accept, or
 * reject from the Word Manager queue before anything touches the canonical
 * concept inventory or compounds.json.
 *
 * Storage: PostgreSQL when DATABASE_URL is set; JSON file fallback for local dev.
 * Schema version: 1.0
 */

import '../load-env.js';

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { resolveStorageMode, ensurePgSchema } from './fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROPOSALS_PATH = join(ROOT, 'data/fonoran-compound-proposals.json');

const COMPOUND_PROPOSALS_SQL = `
CREATE TABLE IF NOT EXISTS fonoran_compound_proposals (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open',
  classification TEXT,
  word TEXT,
  concept_id TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  body JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fonoran_compound_proposals_status
  ON fonoran_compound_proposals (status, created_at DESC);
`;

function newId() {
  return `cp-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function defaultDoc() {
  return { version: '1.0', generated_at: new Date().toISOString(), proposals: [] };
}

function shouldMirrorJson() {
  return process.env.FONORAN_SKIP_JSON_MIRROR !== '1';
}

/** @type {object | null} */
let jsonCache = null;
let schemaReady = false;
let pool = null;

async function getPool() {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function initCompoundProposalsStore() {
  if (resolveStorageMode() !== 'postgres' || !process.env.DATABASE_URL) return;
  await ensurePgSchema();
  const client = await (await getPool()).connect();
  try {
    await client.query(COMPOUND_PROPOSALS_SQL);
  } finally {
    client.release();
  }
  schemaReady = true;
}

async function ensureSchemaOnce() {
  if (schemaReady) return;
  await initCompoundProposalsStore();
  schemaReady = true;
}

function proposalFromRow(row) {
  const body = row.body && typeof row.body === 'object' ? row.body : {};
  return {
    ...body,
    id: row.id,
    status: row.status ?? body.status ?? 'open',
    classification: row.classification ?? body.classification ?? null,
    word: row.word ?? body.word ?? null,
    concept_id: row.concept_id ?? body.concept_id ?? null,
    source: row.source ?? body.source ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? body.created_at),
    resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : (row.resolved_at ?? body.resolved_at ?? null),
  };
}

function rowFieldsFromProposal(record) {
  return {
    id: record.id,
    status: record.status ?? 'open',
    classification: record.classification ?? null,
    word: record.word ?? null,
    concept_id: record.concept_id ?? null,
    source: record.source ?? null,
    created_at: record.created_at ?? new Date().toISOString(),
    resolved_at: record.resolved_at ?? null,
    body: record,
  };
}

async function readProposalsDocFromJson() {
  if (jsonCache) return jsonCache;
  try {
    const raw = await readFile(PROPOSALS_PATH, 'utf8');
    jsonCache = JSON.parse(raw);
  } catch {
    jsonCache = defaultDoc();
  }
  if (!Array.isArray(jsonCache.proposals)) jsonCache.proposals = [];
  return jsonCache;
}

async function writeProposalsDocToJson(doc) {
  jsonCache = doc;
  await mkdir(dirname(PROPOSALS_PATH), { recursive: true });
  await writeFile(PROPOSALS_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

async function mirrorJsonFromProposals(proposals) {
  if (!shouldMirrorJson()) return;
  await writeProposalsDocToJson({
    version: '1.0',
    generated_at: new Date().toISOString(),
    proposals,
  });
}

async function readAllProposalsFromPg() {
  await ensureSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query(
      'SELECT * FROM fonoran_compound_proposals ORDER BY created_at DESC',
    );
    return rows.map(proposalFromRow);
  } finally {
    client.release();
  }
}

async function pgProposalCount() {
  await ensureSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM fonoran_compound_proposals');
    return rows[0]?.n ?? 0;
  } finally {
    client.release();
  }
}

async function insertProposalToPg(record) {
  await ensureSchemaOnce();
  const fields = rowFieldsFromProposal(record);
  const client = await (await getPool()).connect();
  try {
    await client.query(
      `INSERT INTO fonoran_compound_proposals
       (id, status, classification, word, concept_id, source, created_at, resolved_at, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        fields.id,
        fields.status,
        fields.classification,
        fields.word,
        fields.concept_id,
        fields.source,
        fields.created_at,
        fields.resolved_at,
        JSON.stringify(fields.body),
      ],
    );
  } finally {
    client.release();
  }
}

async function updateProposalInPg(record) {
  await ensureSchemaOnce();
  const fields = rowFieldsFromProposal(record);
  const client = await (await getPool()).connect();
  try {
    await client.query(
      `UPDATE fonoran_compound_proposals SET
         status = $2,
         classification = $3,
         word = $4,
         concept_id = $5,
         source = $6,
         resolved_at = $7,
         body = $8::jsonb
       WHERE id = $1`,
      [
        fields.id,
        fields.status,
        fields.classification,
        fields.word,
        fields.concept_id,
        fields.source,
        fields.resolved_at,
        JSON.stringify(fields.body),
      ],
    );
  } finally {
    client.release();
  }
}

async function readProposalsDoc() {
  if (resolveStorageMode() === 'postgres') {
    const proposals = await readAllProposalsFromPg();
    return {
      version: '1.0',
      generated_at: proposals[0]?.created_at ?? new Date().toISOString(),
      proposals,
    };
  }
  return readProposalsDocFromJson();
}

async function writeProposalsDoc(doc) {
  if (resolveStorageMode() === 'postgres') {
    jsonCache = null;
    if (shouldMirrorJson()) {
      await writeProposalsDocToJson(doc);
    }
    return;
  }
  await writeProposalsDocToJson(doc);
}

/** Clear in-memory cache (for test isolation). */
export function resetProposalsCache() {
  jsonCache = null;
}

/**
 * On startup: seed Postgres from local JSON when the table is empty.
 */
export async function maybeImportCompoundProposalsFromJson() {
  if (resolveStorageMode() !== 'postgres' || !process.env.DATABASE_URL) {
    return { skipped: true, reason: 'json mode' };
  }
  await ensureSchemaOnce();
  const count = await pgProposalCount();
  if (count > 0) {
    return { skipped: true, reason: 'postgres already has proposals', count };
  }
  try {
    await access(PROPOSALS_PATH);
  } catch {
    return { skipped: true, reason: 'no local proposals file' };
  }
  const doc = await readProposalsDocFromJson();
  const proposals = doc.proposals ?? [];
  if (!proposals.length) {
    return { skipped: true, reason: 'local proposals file empty' };
  }
  for (const p of proposals) {
    await insertProposalToPg(p);
  }
  console.log(`Fonoran: seeded ${proposals.length} compound proposal(s) from JSON`);
  return { imported: true, count: proposals.length };
}

/**
 * Load all compound/primitive proposals.
 */
export async function loadCompoundProposals() {
  return readProposalsDoc();
}

function buildProposalRecord(p) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    word: p.word ?? null,
    role: p.role ?? 'concept',
    concept_id: p.concept_id ?? null,
    gloss: p.gloss ?? null,
    source: p.source ?? 'llm_gap_analyzer',
    classification: p.classification ?? 'compound',
    rationale: p.rationale ?? null,
    compositions: p.compositions ?? [],
    valid_compositions: p.valid_compositions ?? [],
    redundancy_warnings: p.redundancy_warnings ?? null,
    primitive_proposal: p.primitive_proposal ?? null,
    alias_proposal: p.alias_proposal ?? null,
    status: 'open',
    created_at: now,
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
  };
}

/**
 * Create one or more new LLM-generated proposals.
 *
 * @param {Array<GapProposalInput>} proposals
 * @returns {Promise<object[]>} created records
 */
export async function createCompoundProposals(proposals) {
  const created = [];

  for (const p of proposals) {
    const record = buildProposalRecord(p);
    if (resolveStorageMode() === 'postgres') {
      await insertProposalToPg(record);
    } else {
      const doc = await readProposalsDocFromJson();
      doc.proposals.push(record);
      doc.generated_at = record.created_at;
      await writeProposalsDocToJson(doc);
    }
    created.push(record);
  }

  if (resolveStorageMode() === 'postgres' && shouldMirrorJson()) {
    const all = await readAllProposalsFromPg();
    await mirrorJsonFromProposals(all);
  }

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
  if (resolveStorageMode() === 'postgres') {
    await ensureSchemaOnce();
    const client = await (await getPool()).connect();
    try {
      const clauses = [];
      const params = [limit];
      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }
      if (classification) {
        params.push(classification);
        clauses.push(`classification = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await client.query(
        `SELECT * FROM fonoran_compound_proposals ${where} ORDER BY created_at DESC LIMIT $1`,
        params,
      );
      return rows.map(proposalFromRow);
    } finally {
      client.release();
    }
  }

  const doc = await readProposalsDocFromJson();
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

  let proposal;
  if (resolveStorageMode() === 'postgres') {
    await ensureSchemaOnce();
    const client = await (await getPool()).connect();
    try {
      const { rows } = await client.query(
        'SELECT * FROM fonoran_compound_proposals WHERE id = $1',
        [id],
      );
      if (!rows[0]) throw new Error(`Compound proposal not found: ${id}`);
      proposal = proposalFromRow(rows[0]);
    } finally {
      client.release();
    }
  } else {
    const doc = await readProposalsDocFromJson();
    proposal = doc.proposals.find(p => p.id === id);
    if (!proposal) throw new Error(`Compound proposal not found: ${id}`);
  }

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

  if (resolveStorageMode() === 'postgres') {
    await updateProposalInPg(proposal);
    if (shouldMirrorJson()) {
      const all = await readAllProposalsFromPg();
      await mirrorJsonFromProposals(all);
    }
  } else {
    const doc = await readProposalsDocFromJson();
    const idx = doc.proposals.findIndex(p => p.id === id);
    if (idx !== -1) doc.proposals[idx] = proposal;
    doc.generated_at = proposal.resolved_at;
    await writeProposalsDocToJson(doc);
  }

  return proposal;
}

/**
 * Get summary statistics for the proposal store.
 */
export async function getProposalStats() {
  if (resolveStorageMode() === 'postgres') {
    await ensureSchemaOnce();
    const client = await (await getPool()).connect();
    try {
      const { rows } = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
          COUNT(*) FILTER (WHERE classification = 'compound')::int AS compound,
          COUNT(*) FILTER (WHERE classification = 'primitive')::int AS primitive,
          COUNT(*) FILTER (WHERE classification = 'alias')::int AS alias
        FROM fonoran_compound_proposals
      `);
      return rows[0] ?? {
        total: 0, open: 0, accepted: 0, rejected: 0, skipped: 0,
        compound: 0, primitive: 0, alias: 0,
      };
    } finally {
      client.release();
    }
  }

  const doc = await readProposalsDocFromJson();
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

export async function closeCompoundProposalsStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  schemaReady = false;
  resetProposalsCache();
}
