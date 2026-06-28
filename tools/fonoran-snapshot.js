/**
 * Fonoran snapshot export/import — portable backup in seed JSON layout.
 */

import { createWriteStream, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { ZipArchive } from 'archiver';
import {
  EDITORIAL_DOCS,
  SNAPSHOT_PATHS,
  readAllSnapshotDocs,
  importAllSnapshotDocs,
  writeSnapshotToSeedPaths,
  readSnapshotFromSeedPaths,
  readDocStatus,
  resolveStorageMode,
  readBucketRaw,
} from './fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_FORMAT = 'fonoran-snapshot';
export const SNAPSHOT_VERSION = 1;

const DOC_KEY_BY_PATH = Object.fromEntries(
  Object.entries(EDITORIAL_DOCS).map(([key, rel]) => [rel, key]),
);

function validateManifest(manifest) {
  if (!manifest || manifest.format !== SNAPSHOT_FORMAT) {
    throw new Error(`Invalid snapshot: expected format "${SNAPSHOT_FORMAT}"`);
  }
  if (manifest.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Snapshot manifest missing files list');
  }
}

function validateDocBody(relPath, body) {
  if (!body || typeof body !== 'object') {
    throw new Error(`Invalid JSON in ${relPath}`);
  }
  if (relPath === 'data/fonoran-sound-bucket.json') {
    if (!Array.isArray(body.sounds) || !Array.isArray(body.compounds)) {
      throw new Error('Lab bucket must include sounds and compounds arrays');
    }
    return;
  }
  const key = DOC_KEY_BY_PATH[relPath];
  if (!key) throw new Error(`Unknown snapshot file: ${relPath}`);
  switch (key) {
    case 'concept_inventory':
      if (!Array.isArray(body.primitives)) throw new Error('concept-inventory must include primitives array');
      break;
    case 'root_candidates':
      if (!Array.isArray(body.candidates)) throw new Error('root-candidates must include candidates array');
      break;
    case 'approved_roots':
      if (!Array.isArray(body.roots)) throw new Error('approved-roots must include roots array');
      break;
    case 'localization_en':
      if (!body.entries || typeof body.entries !== 'object') {
        throw new Error('localizations/en.json must include entries object');
      }
      break;
    case 'compounds':
      if (!Array.isArray(body.compounds)) throw new Error('compounds.json must include compounds array');
      break;
    case 'phonetics_config':
      if (!body.phonetics && !body.version) throw new Error('phonetics config appears empty');
      break;
    default:
      break;
  }
}

function summarizeSnapshot({ bucket, docs }) {
  return {
    sounds: bucket.sounds?.length ?? 0,
    compounds: bucket.compounds?.length ?? 0,
    primitives: docs.concept_inventory?.primitives?.length ?? 0,
    candidates: docs.root_candidates?.candidates?.length ?? 0,
    approved_roots: docs.approved_roots?.roots?.length ?? 0,
    localization_entries: Object.keys(docs.localization_en?.entries ?? {}).length,
    compound_recipes: docs.compounds?.compounds?.length ?? 0,
  };
}

function buildManifest() {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exported_at: new Date().toISOString(),
    files: SNAPSHOT_PATHS,
  };
}

/** Parse snapshot zip buffer into { bucket, docs }. */
export function parseSnapshotZip(buffer) {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Snapshot missing manifest.json');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  validateManifest(manifest);

  let bucket = null;
  const docs = {};

  for (const relPath of manifest.files) {
    const entry = zip.getEntry(relPath);
    if (!entry) throw new Error(`Snapshot missing file: ${relPath}`);
    const body = JSON.parse(entry.getData().toString('utf8'));
    validateDocBody(relPath, body);
    if (relPath === 'data/fonoran-sound-bucket.json') {
      bucket = body;
    } else {
      const key = DOC_KEY_BY_PATH[relPath];
      docs[key] = body;
    }
  }

  if (!bucket) throw new Error('Snapshot missing lab bucket');
  return { bucket, docs, manifest, summary: summarizeSnapshot({ bucket, docs }) };
}

/** Preview snapshot contents without importing. */
export function previewSnapshotZip(buffer) {
  const parsed = parseSnapshotZip(buffer);
  return {
    manifest: parsed.manifest,
    summary: parsed.summary,
  };
}

/** Import snapshot from zip buffer into active store. */
export async function importSnapshotZip(buffer) {
  const { bucket, docs, summary } = parseSnapshotZip(buffer);
  const result = await importAllSnapshotDocs({ bucket, docs });
  return { ...result, summary };
}

/** Write snapshot zip to a file path. */
export async function exportSnapshotToFile(outPath) {
  const { bucket, docs } = await readAllSnapshotDocs();
  await mkdir(dirname(outPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    output.on('error', reject);
    archive.pipe(output);

    archive.append(JSON.stringify(buildManifest(), null, 2) + '\n', { name: 'manifest.json' });
    archive.append(JSON.stringify(bucket, null, 2) + '\n', { name: 'data/fonoran-sound-bucket.json' });
    for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
      archive.append(JSON.stringify(docs[key], null, 2) + '\n', { name: rel });
    }
    archive.finalize();
  });

  return {
    exported: true,
    to: outPath,
    summary: summarizeSnapshot({ bucket, docs }),
  };
}

/** Create a readable stream of the snapshot zip (for HTTP download). */
export async function createSnapshotZipStream() {
  const { bucket, docs } = await readAllSnapshotDocs();
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.append(JSON.stringify(buildManifest(), null, 2) + '\n', { name: 'manifest.json' });
  archive.append(JSON.stringify(bucket, null, 2) + '\n', { name: 'data/fonoran-sound-bucket.json' });
  for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
    archive.append(JSON.stringify(docs[key], null, 2) + '\n', { name: rel });
  }
  archive.finalize();
  return archive;
}

/** Export active store to seed directory tree. */
export async function exportSnapshotToDir(baseDir = ROOT) {
  return writeSnapshotToSeedPaths(baseDir);
}

/** Import seed directory tree into active store. */
export async function importSnapshotFromDir(baseDir = ROOT) {
  return readSnapshotFromSeedPaths(baseDir);
}

/** Status for Advanced UI / API. */
export async function getSnapshotStatus() {
  const bucket = await readBucketRaw();
  const docStatus = await readDocStatus();
  return {
    storage_mode: resolveStorageMode(),
    lab: {
      updated_at: bucket?.updated_at ?? null,
      sounds: bucket?.sounds?.length ?? 0,
      compounds: bucket?.compounds?.length ?? 0,
    },
    docs: docStatus,
    snapshot_files: SNAPSHOT_PATHS,
  };
}

/** Read raw zip bytes from path (CLI helper). */
export function readZipFile(path) {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return readFileSync(path);
}

/** Write manifest + files to directory (unzipped layout). */
export async function exportSnapshotDir(outDir) {
  const { bucket, docs } = await readAllSnapshotDocs();
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(buildManifest(), null, 2) + '\n');
  await writeFile(join(outDir, 'data/fonoran-sound-bucket.json'), JSON.stringify(bucket, null, 2) + '\n');
  for (const [key, rel] of Object.entries(EDITORIAL_DOCS)) {
    const filePath = join(outDir, rel);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(docs[key], null, 2) + '\n');
  }
  return { exported: true, to: outDir, summary: summarizeSnapshot({ bucket, docs }) };
}

/** Import from unzipped directory with manifest.json. */
export async function importSnapshotDir(dir) {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  validateManifest(manifest);

  let bucket = null;
  const docs = {};
  for (const relPath of manifest.files) {
    const body = JSON.parse(await readFile(join(dir, relPath), 'utf8'));
    validateDocBody(relPath, body);
    if (relPath === 'data/fonoran-sound-bucket.json') bucket = body;
    else docs[DOC_KEY_BY_PATH[relPath]] = body;
  }
  if (!bucket) throw new Error('Snapshot missing lab bucket');
  const summary = summarizeSnapshot({ bucket, docs });
  const result = await importAllSnapshotDocs({ bucket, docs });
  return { ...result, summary };
}
