/**
 * Fonoran storage: PostgreSQL when configured, JSON file fallback.
 * Lab bucket + editorial documents share the same dual-mode pattern.
 * JSON files are the portable seed/backup interchange format.
 */

import '../load-env.js';

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BUCKET_PATH = join(ROOT, 'data/fonoran-sound-bucket.json');

/** Editorial document keys → seed paths relative to repo root. */
export const EDITORIAL_DOCS = {
  concept_inventory: 'data/fonoran-concept-inventory.json',
  root_candidates: 'data/fonoran-root-candidates.json',
  approved_roots: 'data/fonoran-approved-roots.json',
  localization_en: 'data/localizations/en.json',
  compounds: 'data/fonoran-compounds.json',
  phonetics_config: 'data/fonoran-primitive-roots-config.json',
  playtests: 'data/fonoran-playtests.json',
};

/** Snapshot bundle file paths (includes lab bucket). */
export const SNAPSHOT_PATHS = [
  'data/fonoran-sound-bucket.json',
  ...Object.values(EDITORIAL_DOCS),
];

const SCHEMA_VERSION = 1;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS fonoran_lab_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL DEFAULT 1,
  imported_from_json_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fonoran_lab_bucket (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT,
  philosophy TEXT,
  seeded_from TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  compounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  events JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS fonoran_editorial_docs (
  doc_key TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body JSONB NOT NULL
);

INSERT INTO fonoran_lab_meta (id, schema_version)
VALUES (1, ${SCHEMA_VERSION})
ON CONFLICT (id) DO NOTHING;
`;

/** @returns {'json' | 'postgres'} */
export function resolveStorageMode() {
  const explicit = process.env.FONORAN_STORAGE?.trim().toLowerCase();
  if (explicit === 'json') return 'json';
  if (explicit === 'postgres') return 'postgres';
  if (process.env.DATABASE_URL) return 'postgres';
  return 'json';
}

let pool = null;
let schemaReady = false;
/** @type {{ key: string | null, bucket: object } | null} */
let bucketCache = null;
/** @type {Map<string, { key: string | null, body: object }>} */
const docCache = new Map();

export function clearStoreCache() {
  bucketCache = null;
  docCache.clear();
}

async function ensurePgSchemaOnce() {
  if (schemaReady) return;
  await ensurePgSchema();
  schemaReady = true;
}

/** Initialize Postgres schema and warm the connection pool (call once at server startup). */
export async function initStore() {
  if (resolveStorageMode() !== 'postgres' || !process.env.DATABASE_URL) return;
  await ensurePgSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
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

export async function ensurePgSchema() {
  const client = await (await getPool()).connect();
  try {
    await client.query(INIT_SQL);
  } finally {
    client.release();
  }
}

function bucketFromRow(row) {
  return {
    version: row.version ?? '2.0-blank-slate',
    philosophy: row.philosophy ?? null,
    seeded_from: row.seeded_from ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    sounds: row.sounds ?? [],
    compounds: row.compounds ?? [],
    history: row.history ?? [],
    events: row.events ?? [],
  };
}

export function docSeedPath(key) {
  const rel = EDITORIAL_DOCS[key];
  if (!rel) throw new Error(`Unknown editorial doc key: ${key}`);
  return join(ROOT, rel);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonFile(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

function shouldMirrorJson() {
  return process.env.FONORAN_SKIP_JSON_MIRROR !== '1';
}

function isDocBodyEmpty(key, body) {
  if (!body || typeof body !== 'object') return true;
  switch (key) {
    case 'concept_inventory':
      return !(body.primitives?.length);
    case 'root_candidates':
      return !(body.candidates?.length);
    case 'approved_roots':
      return !(body.roots?.length);
    case 'localization_en':
      return !Object.keys(body.entries ?? {}).length;
    case 'compounds':
      return !(body.compounds?.length);
    case 'phonetics_config':
      return !body.phonetics && !body.version;
    case 'playtests':
      // A playtests doc with a version but no rounds yet is still a valid (empty) doc.
      return !body.version && !(body.rounds?.length);
    default:
      return false;
  }
}

async function readBucketFromJson() {
  return readJsonFile(BUCKET_PATH);
}

async function writeBucketToJson(bucket) {
  await writeJsonFile(BUCKET_PATH, bucket);
}

async function readBucketFromPg() {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query('SELECT * FROM fonoran_lab_bucket WHERE id = 1');
    if (!rows.length) return null;
    return bucketFromRow(rows[0]);
  } finally {
    client.release();
  }
}

async function writeBucketToPg(bucket) {
  await ensurePgSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    await client.query(
      `INSERT INTO fonoran_lab_bucket (id, version, philosophy, seeded_from, updated_at, sounds, compounds, history, events)
       VALUES (1, $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         philosophy = EXCLUDED.philosophy,
         seeded_from = EXCLUDED.seeded_from,
         updated_at = EXCLUDED.updated_at,
         sounds = EXCLUDED.sounds,
         compounds = EXCLUDED.compounds,
         history = EXCLUDED.history,
         events = EXCLUDED.events`,
      [
        bucket.version ?? null,
        bucket.philosophy ?? null,
        bucket.seeded_from ?? null,
        bucket.updated_at ?? new Date().toISOString(),
        JSON.stringify(bucket.sounds ?? []),
        JSON.stringify(bucket.compounds ?? []),
        JSON.stringify(bucket.history ?? []),
        JSON.stringify(bucket.events ?? []),
      ],
    );
  } finally {
    client.release();
  }
}

async function fetchDocRowFromPg(key) {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query(
      'SELECT doc_key, updated_at, body FROM fonoran_editorial_docs WHERE doc_key = $1',
      [key],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      key: row.doc_key,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      body: row.body,
    };
  } finally {
    client.release();
  }
}

async function writeDocToPg(key, body) {
  await ensurePgSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    await client.query(
      `INSERT INTO fonoran_editorial_docs (doc_key, updated_at, body)
       VALUES ($1, NOW(), $2::jsonb)
       ON CONFLICT (doc_key) DO UPDATE SET
         updated_at = NOW(),
         body = EXCLUDED.body`,
      [key, JSON.stringify(body)],
    );
  } finally {
    client.release();
  }
}

export async function pgDocIsEmpty(key) {
  if (resolveStorageMode() !== 'postgres') return true;
  const row = await fetchDocRowFromPg(key);
  if (!row) return true;
  return isDocBodyEmpty(key, row.body);
}

/**
 * Read an editorial document from the active store.
 * Falls back to seed JSON on disk when Postgres row is missing.
 * @param {keyof typeof EDITORIAL_DOCS} key
 */
export async function readDoc(key) {
  if (!EDITORIAL_DOCS[key]) throw new Error(`Unknown editorial doc key: ${key}`);
  const cached = docCache.get(key);
  if (cached) return cached.body;
  if (resolveStorageMode() === 'postgres') {
    const row = await fetchDocRowFromPg(key);
    if (row && !isDocBodyEmpty(key, row.body)) {
      docCache.set(key, { key: row.updated_at, body: row.body });
      return row.body;
    }
    const fallback = await readJsonFile(docSeedPath(key));
    if (fallback) docCache.set(key, { key: null, body: fallback });
    return fallback;
  }
  const body = await readJsonFile(docSeedPath(key));
  if (body) docCache.set(key, { key: null, body });
  return body;
}

/**
 * Persist an editorial document to the active store.
 * @param {keyof typeof EDITORIAL_DOCS} key
 */
export async function writeDoc(key, body) {
  if (!EDITORIAL_DOCS[key]) throw new Error(`Unknown editorial doc key: ${key}`);
  if (resolveStorageMode() === 'postgres') {
    await writeDocToPg(key, body);
    if (shouldMirrorJson()) {
      await writeJsonFile(docSeedPath(key), body);
    }
    docCache.delete(key);
    return body;
  }
  await writeJsonFile(docSeedPath(key), body);
  docCache.delete(key);
  return body;
}

/** Read metadata for all editorial docs (counts + updated_at). */
export async function readDocStatus() {
  const status = {};
  for (const key of Object.keys(EDITORIAL_DOCS)) {
    if (resolveStorageMode() === 'postgres') {
      const row = await fetchDocRowFromPg(key);
      if (row) {
        status[key] = {
          updated_at: row.updated_at,
          counts: docCounts(key, row.body),
        };
        continue;
      }
    }
    const body = await readJsonFile(docSeedPath(key));
    status[key] = {
      updated_at: null,
      counts: docCounts(key, body),
      source: 'seed_file',
    };
  }
  return status;
}

function docCounts(key, body) {
  if (!body) return {};
  switch (key) {
    case 'concept_inventory':
      return { primitives: body.primitives?.length ?? 0 };
    case 'root_candidates':
      return {
        candidates: body.candidates?.length ?? 0,
        pending: body.candidates?.filter(c => c.status === 'pending').length ?? 0,
        approved: body.candidates?.filter(c => c.status === 'approved').length ?? 0,
      };
    case 'approved_roots':
      return { roots: body.roots?.length ?? 0 };
    case 'localization_en':
      return { entries: Object.keys(body.entries ?? {}).length };
    case 'compounds':
      return { compounds: body.compounds?.length ?? 0 };
    case 'phonetics_config':
      return { phonetics: Boolean(body.phonetics) };
    case 'playtests':
      return { rounds: body.rounds?.length ?? 0 };
    default:
      return {};
  }
}

/** Assemble all snapshot documents from the active store. */
export async function readAllSnapshotDocs() {
  const bucket = await readBucketRaw();
  if (!bucket) throw new Error('Lab bucket is empty or unreadable');

  // Docs that may be absent in older stores/snapshots; their absence must not break
  // export or import of the rest of the language state.
  const OPTIONAL_DOCS = new Set(['playtests']);

  const docs = {};
  for (const key of Object.keys(EDITORIAL_DOCS)) {
    const body = await readDoc(key);
    if (!body) {
      if (OPTIONAL_DOCS.has(key)) continue;
      throw new Error(`Missing editorial doc: ${key}`);
    }
    docs[key] = body;
  }

  return { bucket, docs };
}

/**
 * Replace all snapshot documents in the active store.
 * @param {{ bucket: object, docs: Record<string, object> }} snapshot
 */
export async function importAllSnapshotDocs({ bucket, docs }) {
  // Optional docs (e.g. playtests) added after some snapshots were created — skip them
  // when an older snapshot does not carry them rather than failing the whole restore.
  const OPTIONAL_DOCS = new Set(['playtests']);
  clearStoreCache();
  await writeBucketRaw(bucket);
  for (const key of Object.keys(EDITORIAL_DOCS)) {
    if (!docs[key]) {
      if (OPTIONAL_DOCS.has(key)) continue;
      throw new Error(`Snapshot missing doc: ${key}`);
    }
    await writeDoc(key, docs[key]);
  }
  clearStoreCache();
  return {
    sounds: bucket.sounds?.length ?? 0,
    compounds: bucket.compounds?.length ?? 0,
    docs: Object.keys(docs).length,
  };
}

/** Write snapshot files to seed paths on disk (for git codification). */
export async function writeSnapshotToSeedPaths(baseDir = ROOT) {
  const { bucket, docs } = await readAllSnapshotDocs();
  await writeJsonFile(join(baseDir, 'data/fonoran-sound-bucket.json'), bucket);
  for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
    await writeJsonFile(join(baseDir, rel), docs[key]);
  }
  return {
    sounds: bucket.sounds?.length ?? 0,
    compounds: bucket.compounds?.length ?? 0,
    files: SNAPSHOT_PATHS.length,
  };
}

/** Read snapshot files from seed paths on disk into the active store. */
export async function readSnapshotFromSeedPaths(baseDir = ROOT) {
  const bucketPath = join(baseDir, 'data/fonoran-sound-bucket.json');
  const bucket = await readJsonFile(bucketPath);
  if (!bucket) throw new Error(`Missing or unreadable ${bucketPath}`);

  const docs = {};
  for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
    const body = await readJsonFile(join(baseDir, rel));
    if (!body) throw new Error(`Missing or unreadable ${rel}`);
    docs[key] = body;
  }

  return importAllSnapshotDocs({ bucket, docs });
}

export async function pgBucketIsEmpty() {
  if (resolveStorageMode() !== 'postgres') return true;
  const bucket = await readBucketFromPg();
  if (!bucket) return true;
  return (bucket.sounds?.length ?? 0) === 0 && (bucket.compounds?.length ?? 0) === 0;
}

/**
 * Read the raw bucket object from the active store.
 * @returns {Promise<object | null>}
 */
export async function readBucketRaw() {
  if (bucketCache?.bucket) return bucketCache.bucket;
  const bucket = resolveStorageMode() === 'postgres'
    ? await readBucketFromPg()
    : await readBucketFromJson();
  if (bucket) {
    bucketCache = { key: bucket.updated_at ?? null, bucket };
  }
  return bucket;
}

/**
 * Persist the raw bucket object to the active store.
 * JSON backup is also written when using PostgreSQL (unless FONORAN_SKIP_JSON_MIRROR=1).
 */
export async function writeBucketRaw(bucket) {
  bucket.updated_at = new Date().toISOString();
  if (resolveStorageMode() === 'postgres') {
    await writeBucketToPg(bucket);
    if (shouldMirrorJson()) {
      await writeBucketToJson(bucket);
    }
    bucketCache = { key: bucket.updated_at, bucket };
    return bucket;
  }
  await writeBucketToJson(bucket);
  bucketCache = { key: bucket.updated_at, bucket };
  return bucket;
}

/**
 * Import bucket JSON from disk into PostgreSQL (does not delete the JSON file).
 * @param {string} [jsonPath]
 */
export async function importJsonToPostgres(jsonPath = BUCKET_PATH) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL import');
  }
  const raw = await readFile(jsonPath, 'utf8');
  const bucket = JSON.parse(raw);
  await writeBucketToPg(bucket);

  await ensurePgSchemaOnce();
  const client = await (await getPool()).connect();
  try {
    await client.query(
      `INSERT INTO fonoran_lab_meta (id, schema_version, imported_from_json_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET imported_from_json_at = NOW()`,
      [SCHEMA_VERSION],
    );
  } finally {
    client.release();
  }

  return {
    imported: true,
    from: jsonPath,
    sounds: bucket.sounds?.length ?? 0,
    compounds: bucket.compounds?.length ?? 0,
  };
}

/**
 * Export PostgreSQL bucket to a JSON file (backup).
 * @param {string} [jsonPath]
 */
export async function exportPostgresToJson(jsonPath = BUCKET_PATH) {
  const bucket = await readBucketFromPg();
  if (!bucket) throw new Error('PostgreSQL lab bucket is empty');
  await writeFile(jsonPath, JSON.stringify(bucket, null, 2) + '\n');
  return {
    exported: true,
    to: jsonPath,
    sounds: bucket.sounds?.length ?? 0,
    compounds: bucket.compounds?.length ?? 0,
  };
}

/**
 * On server startup: seed PostgreSQL from git JSON when rows are empty.
 */
export async function maybeAutoSeedOnStartup() {
  if (resolveStorageMode() !== 'postgres') {
    return { skipped: true, reason: 'json mode' };
  }

  const results = { lab: null, docs: [] };

  if (await pgBucketIsEmpty()) {
    if (!(await fileExists(BUCKET_PATH))) {
      results.lab = { skipped: true, reason: 'no local json file' };
    } else {
      const jsonBucket = await readBucketFromJson();
      if (!jsonBucket || ((jsonBucket.sounds?.length ?? 0) === 0 && (jsonBucket.compounds?.length ?? 0) === 0)) {
        results.lab = { skipped: true, reason: 'json bucket empty' };
      } else {
        results.lab = await importJsonToPostgres(BUCKET_PATH);
        console.log(
          `Fonoran: seeded lab from JSON (${results.lab.sounds} roots, ${results.lab.compounds} words)`,
        );
      }
    }
  } else {
    results.lab = { skipped: true, reason: 'postgres already has lab data' };
  }

  for (const key of Object.keys(EDITORIAL_DOCS)) {
    if (!(await pgDocIsEmpty(key))) {
      results.docs.push({ key, skipped: true, reason: 'already has data' });
      continue;
    }
    const path = docSeedPath(key);
    if (!(await fileExists(path))) {
      results.docs.push({ key, skipped: true, reason: 'no seed file' });
      continue;
    }
    const body = await readJsonFile(path);
    if (!body || isDocBodyEmpty(key, body)) {
      results.docs.push({ key, skipped: true, reason: 'seed file empty' });
      continue;
    }
    await writeDocToPg(key, body);
    results.docs.push({ key, seeded: true });
    console.log(`Fonoran: seeded editorial doc "${key}" from ${EDITORIAL_DOCS[key]}`);
  }

  return results;
}

/** @deprecated Use maybeAutoSeedOnStartup */
export async function maybeAutoImportOnStartup() {
  return maybeAutoSeedOnStartup();
}

export async function closeStore() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  schemaReady = false;
  clearStoreCache();
}
