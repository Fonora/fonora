/**
 * Research notes storage: PostgreSQL when configured, JSON file fallback.
 */

import '../load-env.js';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStorageMode, ensurePgSchema } from './fonoran-store.js';
import {
  formatNoteMarkdownExport,
  nextResearchCode,
  resolveGitCommit,
  validateNoteMetadata,
} from '../js/research-note-meta.js';
import { normalizeNoteMetadata, resolveNotePhase } from '../js/research-notes.js';
import { resolveResearchNotesCatalogPath } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STORE_PATH =
  process.env.RESEARCH_NOTES_STORE_PATH?.trim() ||
  resolveResearchNotesCatalogPath();

let schemaReady = false;
let pool = null;

/** In-app editor disabled by default; set RESEARCH_NOTES_EDITOR_ENABLED=1 to re-enable. */
export function isResearchNotesEditorEnabled() {
  const val = process.env.RESEARCH_NOTES_EDITOR_ENABLED?.trim().toLowerCase();
  return val === '1' || val === 'true' || val === 'yes';
}

/** @type {{ notes: object[], warmedAt: string } | null} */
let publishedIndexCache = null;
/** @type {Map<string, { metadata: object, body: string, published_at: string|null, updated_at: string }>} */
const publishedBodyCache = new Map();

export function clearPublishedCache() {
  publishedIndexCache = null;
  publishedBodyCache.clear();
}

async function ensureSchemaOnce() {
  if (schemaReady) return;
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    await ensurePgSchema();
  }
  schemaReady = true;
}

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

function shouldMirrorJson() {
  return process.env.FONORAN_SKIP_JSON_MIRROR !== '1';
}

async function readJsonStore() {
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.notes) ? data.notes : [];
  } catch {
    return [];
  }
}

async function writeJsonStore(notes) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify({ notes }, null, 2) + '\n');
}

function rowFromRecord(rec) {
  return {
    slug: rec.slug,
    workflow: rec.workflow,
    metadata: rec.metadata,
    body: rec.body,
    updated_at: rec.updated_at,
    published_at: rec.published_at ?? null,
    updated_by: rec.updated_by ?? null,
  };
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    const da = a.metadata?.date || '';
    const db = b.metadata?.date || '';
    if (da !== db) return da.localeCompare(db);
    return (a.metadata?.code || '').localeCompare(b.metadata?.code || '');
  });
}

async function readAllFromJson() {
  return sortNotes(await readJsonStore());
}

async function writeAllToJson(notes) {
  await writeJsonStore(sortNotes(notes));
}

function mapPgRow(row, { includeBody = true } = {}) {
  const mapped = {
    slug: row.slug,
    workflow: row.workflow,
    metadata: row.metadata,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    published_at: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
    updated_by: row.updated_by,
  };
  if (includeBody) mapped.body = row.body;
  return mapped;
}

async function fetchAllFromPg() {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query(
      `SELECT slug, workflow, metadata, body, updated_at, published_at, updated_by
       FROM research_notes ORDER BY (metadata->>'date'), (metadata->>'code')`,
    );
    return rows.map((row) => mapPgRow(row, { includeBody: true }));
  } finally {
    client.release();
  }
}

async function fetchAllMetadataFromPg() {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query(
      `SELECT slug, workflow, metadata, updated_at, published_at, updated_by
       FROM research_notes ORDER BY (metadata->>'date'), (metadata->>'code')`,
    );
    return rows.map((row) => mapPgRow(row, { includeBody: false }));
  } finally {
    client.release();
  }
}

async function fetchOneFromPg(slug) {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query(
      `SELECT slug, workflow, metadata, body, updated_at, published_at, updated_by
       FROM research_notes WHERE slug = $1`,
      [slug],
    );
    if (!rows.length) return null;
    return mapPgRow(rows[0], { includeBody: true });
  } finally {
    client.release();
  }
}

async function upsertPg(record, { preserveTimestamps = false } = {}) {
  const client = await (await getPool()).connect();
  try {
    const updatedAt = preserveTimestamps ? record.updated_at : null;
    await client.query(
      `INSERT INTO research_notes (slug, workflow, metadata, body, updated_at, published_at, updated_by)
       VALUES ($1, $2, $3::jsonb, $4, COALESCE($5::timestamptz, NOW()), $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         workflow = EXCLUDED.workflow,
         metadata = EXCLUDED.metadata,
         body = EXCLUDED.body,
         updated_at = COALESCE($5::timestamptz, NOW()),
         published_at = EXCLUDED.published_at,
         updated_by = EXCLUDED.updated_by`,
      [
        record.slug,
        record.workflow,
        JSON.stringify(record.metadata),
        record.body,
        updatedAt,
        record.published_at,
        record.updated_by,
      ],
    );
  } finally {
    client.release();
  }
}

async function deleteFromPg(slug) {
  const client = await (await getPool()).connect();
  try {
    await client.query('DELETE FROM research_notes WHERE slug = $1', [slug]);
  } finally {
    client.release();
  }
}

async function readAllRecords() {
  await ensureSchemaOnce();
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    return fetchAllFromPg();
  }
  return readAllFromJson();
}

async function readAllMetadataRecords() {
  await ensureSchemaOnce();
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    return fetchAllMetadataFromPg();
  }
  const notes = await readAllFromJson();
  return notes.map(({ body: _body, ...meta }) => meta);
}

async function persistRecord(record) {
  await ensureSchemaOnce();
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    await upsertPg(record);
    if (shouldMirrorJson()) {
      const notes = await fetchAllFromPg();
      await writeAllToJson(notes);
    }
  } else {
    const notes = await readAllFromJson();
    const idx = notes.findIndex((n) => n.slug === record.slug);
    if (idx >= 0) notes[idx] = record;
    else notes.push(record);
    await writeAllToJson(notes);
  }
  clearPublishedCache();
  return record;
}

/** @param {object} metadata */
export function publicMetadata(metadata) {
  const meta = normalizeNoteMetadata(metadata);
  const {
    slug,
    code,
    title,
    status,
    date,
    description,
    abstract,
    related,
    docs,
    tools,
    source,
    git_commit,
  } = meta;
  return {
    slug,
    code,
    title,
    status,
    phase: resolveNotePhase(meta),
    date,
    description,
    abstract,
    related: related || [],
    docs: docs || [],
    tools: tools || [],
    source: source || [],
    git_commit: git_commit || null,
  };
}

async function loadPublishedIndexFromStore() {
  const all = await readAllMetadataRecords();
  return sortNotes(all.filter((n) => n.workflow === 'published')).map((n) => publicMetadata(n.metadata));
}

async function loadPublishedNoteFromStore(slug) {
  const row = await readForEditor(slug);
  if (!row || row.workflow !== 'published') return null;
  return {
    metadata: publicMetadata(row.metadata),
    body: row.body,
    published_at: row.published_at,
    updated_at: row.updated_at,
  };
}

function cachePublishedNote(note) {
  if (!note?.metadata?.slug) return;
  publishedBodyCache.set(note.metadata.slug, note);
}

async function loadPublishedRowsFromMarkdown() {
  const { buildPublishedNotesFromMarkdown } = await import('./research-notes-md-sync.js');
  return buildPublishedNotesFromMarkdown();
}

function populatePublishedCache(publishedRows) {
  const sorted = sortNotes(publishedRows);
  const notes = sorted.map((n) => publicMetadata(n.metadata));
  publishedIndexCache = { notes, warmedAt: new Date().toISOString() };
  publishedBodyCache.clear();
  for (const row of sorted) {
    cachePublishedNote({
      metadata: publicMetadata(row.metadata),
      body: row.body,
      published_at: row.published_at,
      updated_at: row.updated_at,
    });
  }
  return { count: notes.length, warmedAt: publishedIndexCache.warmedAt };
}

/** Load published notes into memory from git markdown (call once at server startup). */
export async function warmPublishedCache() {
  const publishedRows = await loadPublishedRowsFromMarkdown();
  return populatePublishedCache(publishedRows);
}

export async function listPublished() {
  if (publishedIndexCache?.notes) {
    return publishedIndexCache.notes;
  }
  await warmPublishedCache();
  return publishedIndexCache?.notes ?? [];
}

export async function readPublished(slug) {
  const cleanSlug = String(slug || '').trim();
  const cached = publishedBodyCache.get(cleanSlug);
  if (cached) return cached;
  await warmPublishedCache();
  return publishedBodyCache.get(cleanSlug) ?? null;
}

/**
 * Bootstrap payload for embedding in the research HTML shell.
 * @param {string} [noteSlug]
 */
export async function getResearchBootstrapData(noteSlug) {
  const notes = publishedIndexCache?.notes ?? (await listPublished());
  const bootstrap = { notes };
  const slug = String(noteSlug || '').trim();
  if (slug) {
    const note = publishedBodyCache.get(slug) ?? (await readPublished(slug));
    if (note) bootstrap.note = note;
  }
  return bootstrap;
}

export async function listEditor() {
  const all = await readAllMetadataRecords();
  return all.map((n) => ({
    slug: n.slug,
    workflow: n.workflow,
    metadata: n.metadata,
    updated_at: n.updated_at,
    published_at: n.published_at,
    updated_by: n.updated_by,
  }));
}

export async function readForEditor(slug) {
  await ensureSchemaOnce();
  let row = null;
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    row = await fetchOneFromPg(slug);
  } else {
    const notes = await readAllFromJson();
    row = notes.find((n) => n.slug === slug) ?? null;
  }
  return row;
}

export async function getAllSlugs() {
  const all = await readAllMetadataRecords();
  return all.map((n) => n.slug);
}

export async function getAllCodes() {
  const all = await readAllMetadataRecords();
  return all.map((n) => n.metadata?.code).filter(Boolean);
}

/**
 * @param {string} slug
 * @param {{ metadata: object, body: string }} payload
 * @param {string} email
 */
export async function saveDraft(slug, payload, email) {
  const cleanSlug = String(slug || '').trim();
  const metadata = normalizeNoteMetadata({ ...payload.metadata, slug: cleanSlug });
  const errors = validateNoteMetadata(metadata, {
    existingSlugs: await getAllSlugs(),
    currentSlug: cleanSlug,
  });
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  const existing = await readForEditor(cleanSlug);
  const now = new Date().toISOString();
  const record = {
    slug: cleanSlug,
    workflow: existing?.workflow === 'published' ? 'published' : 'draft',
    metadata,
    body: String(payload.body ?? ''),
    updated_at: now,
    published_at: existing?.published_at ?? null,
    updated_by: email,
  };
  return persistRecord(record);
}

/**
 * @param {object} payload
 * @param {string} email
 */
export async function createDraft(payload, email) {
  const codes = await getAllCodes();
  const metadata = normalizeNoteMetadata({
    ...payload.metadata,
    code: payload.metadata?.code || nextResearchCode(codes),
    date: payload.metadata?.date || new Date().toISOString().slice(0, 10),
    status: payload.metadata?.status || 'Active',
    phase: payload.metadata?.phase || payload.metadata?.act || 'phase-3',
    related: payload.metadata?.related || [],
    docs: payload.metadata?.docs || [],
    tools: payload.metadata?.tools || [],
    source: payload.metadata?.source || [],
  });
  const slug = metadata.slug || `draft-${Date.now()}`;
  return saveDraft(slug, { metadata, body: payload.body || '' }, email);
}

export async function publishNote(slug, email) {
  const row = await readForEditor(slug);
  if (!row) {
    const err = new Error('Note not found');
    err.status = 404;
    throw err;
  }
  const gitCommit = await resolveGitCommit();
  const metadata = normalizeNoteMetadata({ ...row.metadata, slug });
  if (gitCommit) metadata.git_commit = gitCommit;

  const errors = validateNoteMetadata(metadata, { existingSlugs: await getAllSlugs(), currentSlug: slug });
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }
  if (!String(row.body || '').trim()) {
    const err = new Error('body is required to publish');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const record = {
    ...row,
    workflow: 'published',
    metadata,
    published_at: now,
    updated_at: now,
    updated_by: email,
  };
  return persistRecord(record);
}

export async function deleteDraft(slug) {
  const row = await readForEditor(slug);
  if (!row) {
    const err = new Error('Note not found');
    err.status = 404;
    throw err;
  }
  if (row.workflow === 'published') {
    const err = new Error('Cannot delete a published note');
    err.status = 400;
    throw err;
  }
  await ensureSchemaOnce();
  if (resolveStorageMode() === 'postgres' && process.env.DATABASE_URL) {
    await deleteFromPg(slug);
    if (shouldMirrorJson()) {
      const notes = await fetchAllFromPg();
      await writeAllToJson(notes);
    }
  } else {
    const notes = await readAllFromJson();
    await writeAllToJson(notes.filter((n) => n.slug !== slug));
  }
  clearPublishedCache();
}

export async function exportMarkdown(slug) {
  const row = await readPublished(slug);
  if (!row) return null;
  return formatNoteMarkdownExport(row);
}

/** Bulk import for migration script. */
export async function importPublishedNote(metadata, body, email = 'import@local') {
  const slug = metadata.slug;
  const existing = await readForEditor(slug);
  if (existing) return existing;

  const now = new Date().toISOString();
  const record = {
    slug,
    workflow: 'published',
    metadata,
    body,
    updated_at: now,
    published_at: now,
    updated_by: email,
  };
  return persistRecord(record);
}

export async function initResearchNotesStore() {
  if (!isResearchNotesEditorEnabled()) return;
  await ensureSchemaOnce();
}

/** Published notes from git seed file (for boot sync). */
export function publishedNotesFromSeed(notes) {
  return (Array.isArray(notes) ? notes : []).filter((n) => n.workflow === 'published');
}

/**
 * Published rows whose code matches markdown but slug is a pre-migration alias.
 * @param {object[]} publishedRows
 * @param {Map<string, string>} canonicalByCode code → canonical slug from markdown
 * @returns {string[]} slugs to delete
 */
export function findSupersededPublishedSlugs(publishedRows, canonicalByCode) {
  /** @type {string[]} */
  const toPrune = [];
  for (const row of publishedRows) {
    if (row.workflow !== 'published') continue;
    const code = row.metadata?.code;
    const canonicalSlug = code ? canonicalByCode.get(code) : null;
    if (canonicalSlug && row.slug !== canonicalSlug) {
      toPrune.push(row.slug);
    }
  }
  return toPrune;
}

/**
 * @deprecated Published notes are served from docs/research-notes/*.md at runtime.
 * Postgres sync is no longer run on deploy; kept for optional editor re-enable.
 */
export async function syncResearchNotesFromSeed() {
  return { skipped: true, reason: 'markdown canonical — Postgres sync deprecated' };
}

/** @deprecated Use syncResearchNotesFromSeed at deploy time instead of web boot. */
export async function maybeAutoSyncResearchNotesOnStartup() {
  return syncResearchNotesFromSeed();
}

export async function closeResearchNotesStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  schemaReady = false;
  clearPublishedCache();
}
