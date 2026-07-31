/**
 * Where the language lives: the committed seed files under data/, and nowhere else.
 *
 * There used to be three copies of the language. The seeds in git, a lab bucket, and a set of
 * Postgres tables that mirrored both, with import, export, snapshot, and auto-seed machinery to
 * shuffle rows between them. Three copies of one fact is three chances to disagree, and they did:
 * an automated refine loop once accepted compounds into data/fonoran-compounds.json while the
 * build read the Postgres copy, so the run reported success and changed nothing. The fix at the
 * time was to set an environment variable. The fix now is that there is only one copy.
 *
 * Postgres is still used, for user data: accounts, lesson progress, community proposals, votes.
 * That is genuine runtime state that a user creates and expects to persist. See
 * fonoran-community-store.js, which owns its own connection pool and its own schema. Nothing in
 * this file talks to a database.
 *
 * Consequence worth knowing: the language cannot be edited on a deployed host, because a dyno
 * filesystem does not survive a restart. Editing happens in a checkout, is reviewed as a diff,
 * and ships as a deploy. That is what "seeds are truth" means when you take it literally.
 *
 * The lab bucket (data/fonoran-sound-bucket.json) is still here, but it is derived: it is built
 * from the seeds by `npm run fonoran:build` and is not committed. It carries runtime-only state
 * that no seed has a place for, namely the undo history, the activity log, and the DDA cache.
 */

import '../load-env.js';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorialSeedPath, resolveDataDir } from './fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Derived from the seeds by `fonoran:build`; not committed. */
export const BUCKET_PATH = join(ROOT, 'data/fonoran-sound-bucket.json');

/** Editorial document keys to seed paths relative to repo root. These files are the language. */
export const EDITORIAL_DOCS = {
  concept_inventory: 'data/fonoran-concept-inventory.json',
  root_candidates: 'data/fonoran-root-candidates.json',
  approved_roots: 'data/fonoran-approved-roots.json',
  localization_en: 'data/localizations/en.json',
  compounds: 'data/fonoran-compounds.json',
  phonetics_config: 'data/fonoran-primitive-roots-config.json',
};

/** @type {{ bucket: object } | null} */
let bucketCache = null;
/** @type {Map<string, object>} */
const docCache = new Map();

export function clearStoreCache() {
  bucketCache = null;
  docCache.clear();
}

export function docSeedPath(key) {
  const rel = EDITORIAL_DOCS[key];
  if (!rel) throw new Error(`Unknown editorial doc key: ${key}`);
  return editorialSeedPath(key, rel, ROOT);
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

/**
 * Read an editorial document.
 * @param {keyof typeof EDITORIAL_DOCS} key
 */
export async function readDoc(key) {
  if (!EDITORIAL_DOCS[key]) throw new Error(`Unknown editorial doc key: ${key}`);
  const cached = docCache.get(key);
  if (cached) return cached;
  const body = await readJsonFile(docSeedPath(key));
  if (body) docCache.set(key, body);
  return body;
}

/**
 * Persist an editorial document to its seed file.
 * @param {keyof typeof EDITORIAL_DOCS} key
 */
export async function writeDoc(key, body) {
  if (!EDITORIAL_DOCS[key]) throw new Error(`Unknown editorial doc key: ${key}`);
  await writeJsonFile(docSeedPath(key), body);
  docCache.delete(key);
  return body;
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
    default:
      return {};
  }
}

/** Counts and presence for each editorial doc, for the admin status panel. */
export async function readDocStatus() {
  const status = {};
  for (const key of Object.keys(EDITORIAL_DOCS)) {
    const body = await readJsonFile(docSeedPath(key));
    status[key] = { counts: docCounts(key, body), source: 'seed_file' };
  }
  return status;
}

/** Same counts, plus the resolved path of each seed, for the drift-free build check. */
export async function readSeedFileStatus(baseDir = ROOT) {
  const status = {};
  for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
    const path = editorialSeedPath(key, rel, baseDir);
    const body = await readJsonFile(path);
    status[key] = { present: Boolean(body), counts: docCounts(key, body), path };
  }
  const dataDir = resolveDataDir();
  if (dataDir) status._data_dir = dataDir;
  return status;
}

/** @returns {Promise<object | null>} the derived lab bucket, or null before the first build */
export async function readBucketRaw() {
  if (bucketCache?.bucket) return bucketCache.bucket;
  const bucket = await readJsonFile(BUCKET_PATH);
  if (bucket) bucketCache = { bucket };
  return bucket;
}

export async function writeBucketRaw(bucket) {
  bucket.updated_at = new Date().toISOString();
  await writeJsonFile(BUCKET_PATH, bucket);
  bucketCache = { bucket };
  return bucket;
}
